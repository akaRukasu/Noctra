import Observation
import SwiftUI
import UIKit
import WebKit

// MARK: Modèle

/// Chaîne, éventuellement proposée par plusieurs sources (réunies par leur nom et leur pays).
struct LiveChannel: Identifiable, Hashable, @unchecked Sendable {
    typealias Entry = (source: String, sourceId: String, raw: [String: Any])

    let id: String
    let name: String
    let logo: String?
    /// Catégorie claire (Généralistes, Info, Sport…).
    let group: String?
    /// Pays (« fr », « uk »… ; vide : non indiqué).
    let country: String
    /// Numéro (TNT pour les chaînes françaises).
    var number: Int = 0
    /// Fiche brute de chaque source.
    let entries: [Entry]

    var vip: Bool { entries.contains { $0.raw["vipPlayback"] as? Bool == true } }

    static func == (lhs: LiveChannel, rhs: LiveChannel) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Catalogue d'une source, préparé hors du fil principal (noms, pays et clés calculés).
struct Catalog: @unchecked Sendable {
    struct Entry {
        let key: String
        let name: String
        let logo: String?
        let group: String?
        let country: String
        let raw: [String: Any]
    }
    let source: String
    let sourceId: String
    let entries: [Entry]
    let vip: [String: Any]?

    /// Chaînes lisibles d'une source (les matchs du jour sont des évènements, pas des chaînes).
    static func prepare(_ list: [[String: Any]], sports: Bool) -> [Entry] {
        list.compactMap { raw in
            guard let name = raw["name"] as? String, !name.isEmpty, raw["isEvent"] as? Bool != true else { return nil }
            let playable = (raw["streamUrl"] as? String).map { !$0.isEmpty } == true || raw["resolverUrl"] != nil
                || raw["embedUrl"] != nil || raw["externalUrl"] != nil || raw["vipFallbackUrl"] != nil
            guard playable else { return nil }
            let match = (raw["homeName"] != nil && raw["awayName"] != nil) || name.range(of: "\\s(?:vs\\.?|v\\.?|contre)\\s", options: [.regularExpression, .caseInsensitive]) != nil
            if match { return nil }
            if sports && (raw["eventId"] != nil || raw["startTime"] != nil || name.range(of: "\\s[x×]\\s|\\b\\d{1,2}[:h]\\d{2}\\b", options: .regularExpression) != nil) { return nil }
            let country = ChannelNaming.country(raw)
            return Entry(key: ChannelNaming.key(name, country: country), name: name, logo: raw["logo"] as? String,
                         group: raw["group"] as? String, country: country, raw: raw)
        }
    }

    struct Merged: @unchecked Sendable {
        var channels: [LiveChannel]
        var countries: [String: Int]
        var categories: [String: [String]]
    }

    /// Chaînes de toutes les sources réunies, nom le plus soigné, catégorie, numéros TNT.
    static func merge(_ catalogs: [Catalog]) -> Merged {
        final class Builder {
            var names: [String] = []
            var logo: String?
            var country: String
            var groups: [String: Int] = [:]
            var entries: [LiveChannel.Entry] = []
            init(country: String) { self.country = country }
        }
        var byKey: [String: Builder] = [:]
        var order: [String] = []
        for catalog in catalogs {
            for entry in catalog.entries {
                let builder: Builder
                if let existing = byKey[entry.key] { builder = existing } else {
                    builder = Builder(country: entry.country)
                    byKey[entry.key] = builder
                    order.append(entry.key)
                }
                if builder.country.isEmpty { builder.country = entry.country }
                if builder.logo == nil { builder.logo = entry.logo }
                if let group = entry.group, !group.isEmpty { builder.groups[group, default: 0] += 1 }
                builder.names.append(entry.name)
                builder.entries.append((catalog.source, catalog.sourceId, entry.raw))
            }
        }
        var channels: [LiveChannel] = order.compactMap { key in
            guard let builder = byKey[key] else { return nil }
            let digits = key.filter(\.isNumber)
            var name: String
            if !builder.country.isEmpty && builder.country != "fr" {
                name = ChannelNaming.cleanName(builder.names[0])
                if builder.country.count == 2, name.range(of: "\\s[A-Z]{2,3}$", options: .regularExpression) == nil { name += " " + builder.country.uppercased() }
            } else {
                name = ChannelNaming.displayName(builder.names, keyDigits: digits)
            }
            let groups = builder.groups.sorted { $0.value > $1.value }.map(\.key)
            return LiveChannel(id: key, name: name, logo: builder.logo, group: ChannelNaming.category(name: name, groups: groups),
                               country: builder.country, entries: builder.entries)
        }
        let sortKeys = Dictionary(uniqueKeysWithValues: channels.map { ($0.id, ChannelNaming.normalize($0.name)) })
        channels.sort { (sortKeys[$0.id] ?? "") < (sortKeys[$1.id] ?? "") }
        // Numéros : TNT pour les chaînes françaises (1 TF1, 2 France 2…), puis 30, 31…
        var used = Set<Int>()
        var next = 30
        for index in channels.indices where channels[index].country == "fr" || channels[index].country.isEmpty {
            let key = channels[index].id
            if let number = ChannelNaming.tntNumbers[key], !used.contains(number) {
                channels[index].number = number
                used.insert(number)
            }
        }
        for index in channels.indices where (channels[index].country == "fr" || channels[index].country.isEmpty) && channels[index].number == 0 {
            channels[index].number = next
            next += 1
        }
        var countries: [String: Int] = [:]
        var categories: [String: Set<String>] = [:]
        for channel in channels {
            let code = channel.country.isEmpty ? "?" : channel.country
            countries[code, default: 0] += 1
            if let group = channel.group {
                categories[code, default: []].insert(group)
                categories["", default: []].insert(group)
            }
        }
        let ordered = categories.mapValues { set in ChannelNaming.categoryOrder.filter { set.contains($0) } }
        return Merged(channels: channels, countries: countries, categories: ordered)
    }
}

/// Catalogues TV du serveur Noctra, favoris, chaînes récentes, pays choisi, accès VIP.
@MainActor
@Observable
final class LiveStore {
    static let shared = LiveStore()

    private(set) var sources: [TVSourceRoute] = []
    private(set) var channels: [LiveChannel] = []
    private(set) var loadedSources = 0
    private(set) var loading = false
    private(set) var failed = false
    private(set) var favorites: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "noctra.tv.favorites") ?? [])
    private(set) var recents: [String] = UserDefaults.standard.stringArray(forKey: "noctra.tv.recents") ?? []
    /// Chaînes par pays (« ? » : pays non indiqué) et catégories présentes par pays.
    private(set) var countries: [String: Int] = [:]
    private(set) var categoriesByCountry: [String: [String]] = [:]
    /// Accès VIP du serveur Noctra : LiveWatch Premium, clés Movix et Northlive.
    private(set) var liveWatchVip = false
    private(set) var liveWatchConfigured = false
    private(set) var providerKeys: [String: Bool] = [:]
    /// Pays affiché : France par défaut, les autres au choix.
    var country: String = UserDefaults.standard.string(forKey: "noctra.tv.country") ?? "fr" {
        didSet { UserDefaults.standard.set(country, forKey: "noctra.tv.country") }
    }
    @ObservationIgnored private var sections: [String: String] = [:]
    @ObservationIgnored private var loadedAt = Date.distantPast

    var categories: [String] { categoriesByCountry[country == "" ? "" : country] ?? [] }

    /// Pays proposés : France, tous, puis les autres par nombre de chaînes.
    var countryChoices: [String] {
        ["fr", ""] + countries.filter { $0.key != "fr" && $0.key != "?" }.sorted { $0.value > $1.value }.map(\.key) + (countries["?"] != nil ? ["?"] : [])
    }

    func loadSources(_ session: Session) async {
        guard let json = try? await session.noctraJSON("/api/tv/sources") as? [String: Any],
              let list = json["sources"] as? [[String: Any]] else { failed = sources.isEmpty; return }
        failed = false
        sources = list.compactMap { entry in
            guard let id = entry["id"] as? String, (entry["enabled"] as? Bool) != false else { return nil }
            sections[id] = entry["section"] as? String
            return TVSourceRoute(id: id, name: (entry["name"] as? String) ?? id, ref: nil)
        }
    }

    /// Accès VIP actifs sur le serveur (comme sur la version web).
    func loadAccess(_ session: Session) async {
        if let status = try? await session.noctraJSON("/api/tv/livewatch/session", timeout: 15) as? [String: Any] {
            liveWatchConfigured = status["configured"] as? Bool == true
            liveWatchVip = status["active"] as? Bool == true && status["isVip"] as? Bool != false
        }
        if session.isAdmin, let keys = try? await session.noctraJSON("/api/tv/provider-keys", timeout: 15) as? [String: Any] {
            providerKeys = keys.compactMapValues { $0 as? Bool }
        }
    }

    /// Toutes les chaînes : catalogues chargés 6 à la fois (bouquets compris), réunis par nom et par pays.
    func loadAll(_ session: Session, force: Bool = false) async {
        guard !loading, force || channels.isEmpty || Date().timeIntervalSince(loadedAt) > 1800 else { return }
        loading = true
        defer { loading = false }
        if sources.isEmpty { await session.establishNoctraSession(); await loadSources(session) }
        Task { await loadAccess(session) }
        loadedSources = 0
        var catalogs: [Catalog] = []
        var pending: [(TVSourceRoute, String?)] = sources.map { ($0, nil) }
        let sections = self.sections
        let fetch: @Sendable (TVSourceRoute, String?) async -> (Catalog, [String]) = { source, ref in
            let path = ref.map { "/api/tv/catalog?ref=" + ($0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0) }
                ?? "/api/tv/catalog?source=" + (source.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? source.id)
            let json = try? await session.noctraJSON(path, timeout: 45) as? [String: Any]
            let list = (json?["channels"] as? [[String: Any]]) ?? []
            // Tâche enfant : noms, pays et clés calculés hors du fil principal.
            let entries = Catalog.prepare(list, sports: sections[source.id] == "sports")
            let groups = ref == nil ? ((json?["groups"] as? [[String: Any]]) ?? []).compactMap { $0["ref"] as? String }.prefix(60).map { $0 } : []
            return (Catalog(source: source.name, sourceId: source.id, entries: entries, vip: json?["liveWatchVip"] as? [String: Any]), groups)
        }
        await withTaskGroup(of: (TVSourceRoute, Catalog, [String]).self) { group in
            func launch() {
                guard !pending.isEmpty else { return }
                let (source, ref) = pending.removeFirst()
                group.addTask { let (catalog, refs) = await fetch(source, ref); return (source, catalog, refs) }
            }
            for _ in 0..<6 { launch() }
            var merges = 0
            for await (source, catalog, refs) in group {
                catalogs.append(catalog)
                if let vip = catalog.vip, vip["active"] as? Bool == true { liveWatchVip = true }
                // Source en bouquets : les chaînes de chaque bouquet.
                for ref in refs { pending.append((source, ref)) }
                loadedSources += 1
                launch()
                // Liste affichée au fil du chargement (réunion hors du fil principal).
                merges += 1
                if merges % 4 == 0 || channels.isEmpty {
                    let snapshot = catalogs
                    let merged = await Task.detached(priority: .userInitiated) { Catalog.merge(snapshot) }.value
                    apply(merged)
                }
            }
        }
        let snapshot = catalogs
        let merged = await Task.detached(priority: .userInitiated) { Catalog.merge(snapshot) }.value
        apply(merged)
        loadedAt = Date()
    }

    private func apply(_ merged: Catalog.Merged) {
        channels = merged.channels
        countries = merged.countries
        categoriesByCountry = merged.categories
    }

    func toggleFavorite(_ channel: LiveChannel) {
        if favorites.contains(channel.id) { favorites.remove(channel.id) } else { favorites.insert(channel.id) }
        UserDefaults.standard.set(Array(favorites), forKey: "noctra.tv.favorites")
    }

    func noteRecent(_ channel: LiveChannel) {
        recents.removeAll { $0 == channel.id }
        recents.insert(channel.id, at: 0)
        recents = Array(recents.prefix(24))
        UserDefaults.standard.set(recents, forKey: "noctra.tv.recents")
    }
}

// MARK: Lancement d'une chaîne

/// Lecteur web de secours (flux MPEG-TS, lecteurs des sites) en plein écran.
struct WebPlayerRequest: Identifiable {
    enum Mode { case mpegts(URL), page(URL) }
    let id = UUID()
    let title: String
    let mode: Mode
}

/// Lancement d'une chaîne : serveurs de toutes les sources classés, testés,
/// meilleur serveur lancé tout seul ; les suivants prennent le relais en cas d'échec.
@MainActor
@Observable
final class LiveLauncher {
    static let shared = LiveLauncher()
    var webPlayer: WebPlayerRequest?
    var problem: String?
    var pick: LivePick?
    private(set) var opening: String?

    /// Fenêtre des serveurs à chaque lancement (sinon : meilleur serveur directement).
    var showPicker: Bool = UserDefaults.standard.object(forKey: "noctra.tv.picker") as? Bool ?? true {
        didSet { UserDefaults.standard.set(showPicker, forKey: "noctra.tv.picker") }
    }

    func open(_ channel: LiveChannel, session: Session) async {
        guard opening == nil else { return }
        opening = channel.id
        defer { opening = nil }
        LiveStore.shared.noteRecent(channel)
        PlaybackManager.shared.liveSession = session
        let pick = LivePick(channel: channel)
        if showPicker { self.pick = pick }

        // Serveurs de toutes les sources ; les serveurs automatiques (VIP compris)
        // sont demandés tout de suite, 4 s au plus chacun.
        let initial = LiveServerFactory.servers(for: channel, session: session)
        var expanded: [LiveServer] = []
        await withTaskGroup(of: (Int, [LiveServer]).self) { group in
            for (index, server) in initial.enumerated() {
                group.addTask {
                    guard server.kind == .resolve else { return (index, [server]) }
                    let found = await LiveServerFactory.resolve(server, session: session, timeout: 4)
                    return (index, found.isEmpty ? [server] : found)
                }
            }
            var parts: [Int: [LiveServer]] = [:]
            for await (index, list) in group { parts[index] = list }
            expanded = initial.indices.flatMap { parts[$0] ?? [] }
        }
        pick.servers = LiveHealth.rank(expanded, channel: channel.id)
        pick.preparing = false
        guard !pick.servers.isEmpty else {
            if self.pick === pick { self.pick = nil }
            problem = "Aucun serveur ne propose « \(channel.name) » pour le moment."
            return
        }

        // Tests des flux directs (6 à la fois) pendant le compte à rebours.
        let probing = Task { await probe(pick, session: session) }
        if showPicker {
            while pick.countdown > 0 && pick.auto && !pick.launching && self.pick === pick {
                try? await Task.sleep(for: .seconds(1))
                pick.countdown -= 1
            }
            guard pick.auto, !pick.launching, self.pick === pick else { return }
        } else {
            _ = await withTaskGroup(of: Void.self) { group in
                group.addTask { await probing.value }
                group.addTask { try? await Task.sleep(for: .seconds(4)) }
                await group.next()
                group.cancelAll()
            }
        }
        pick.servers = LiveHealth.rank(pick.servers, channel: channel.id)
        if let best = pick.best { await launch(pick, server: best, session: session) }
    }

    private func probe(_ pick: LivePick, session: Session) async {
        let targets = pick.servers.enumerated().filter { $0.element.kind == .native }.prefix(10).map { ($0.offset, $0.element) }
        for (index, _) in targets { pick.servers[index].probe = .testing }
        await withTaskGroup(of: (UUID, LiveServer.Probe, Double, Double).self) { group in
            var queue = targets.makeIterator()
            func next() {
                guard let (_, server) = queue.next() else { return }
                group.addTask {
                    let (state, ms, margin) = await LiveServerFactory.probe(server, session: session)
                    return (server.id, state, ms, margin)
                }
            }
            for _ in 0..<6 { next() }
            for await (id, state, ms, margin) in group {
                if let index = pick.servers.firstIndex(where: { $0.id == id }) {
                    pick.servers[index].probe = state
                    pick.servers[index].probeMs = ms
                    pick.servers[index].margin = margin
                    if [.down, .noVideo, .stale].contains(state) { LiveHealth.record(pick.servers[index], channel: pick.channel.id, ok: false) }
                }
                next()
            }
        }
    }

    /// Serveur choisi (ou meilleur) : lancé, les autres en relais.
    func launch(_ pick: LivePick, server: LiveServer, session: Session) async {
        guard !pick.launching else { return }
        pick.launching = true
        pick.auto = false
        var chosen = server
        var rest = LiveHealth.rank(pick.servers.filter { $0.id != server.id }, channel: pick.channel.id)
        if chosen.kind == .resolve {
            let found = LiveHealth.rank(await LiveServerFactory.resolve(chosen, session: session), channel: pick.channel.id)
            guard let first = found.first else {
                LiveHealth.record(chosen, channel: pick.channel.id, ok: false)
                pick.servers.removeAll { $0.id == chosen.id }
                pick.launching = false
                if pick.servers.isEmpty { self.pick = nil; problem = "Aucun serveur de « \(pick.channel.name) » ne répond pour le moment." }
                else { SyncPlayManager.shared.announce("Ce serveur ne répond pas : choisissez-en un autre.") }
                return
            }
            chosen = first
            rest = Array(found.dropFirst()) + rest
        }
        if self.pick === pick { self.pick = nil }
        start(chosen, fallbacks: rest, channel: pick.channel, session: session)
    }

    private func start(_ server: LiveServer, fallbacks: [LiveServer], channel: LiveChannel, session: Session) {
        switch server.kind {
        case .web:
            if let url = server.pageURL { webPlayer = WebPlayerRequest(title: channel.name, mode: .page(url)) }
        case .resolve:
            Task {
                let found = LiveHealth.rank(await LiveServerFactory.resolve(server, session: session), channel: channel.id)
                if let first = found.first { start(first, fallbacks: Array(found.dropFirst()) + fallbacks, channel: channel, session: session) }
                else if let next = fallbacks.first { start(next, fallbacks: Array(fallbacks.dropFirst()), channel: channel, session: session) }
                else { problem = "Aucun serveur de « \(channel.name) » ne répond pour le moment." }
            }
        case .native where server.mpegts:
            if let url = server.streamURL { webPlayer = WebPlayerRequest(title: channel.name, mode: .mpegts(url)) }
        case .native:
            // Flux directs lus par le lecteur d'Apple, l'un après l'autre ; puis les autres serveurs.
            let natives = [server] + fallbacks.filter { $0.kind == .native && !$0.mpegts && ![.down, .noVideo].contains($0.probe) }
            let others = fallbacks.filter { !($0.kind == .native && !$0.mpegts) }
            let channelId = channel.id
            PlaybackManager.shared.playLive(title: channel.name, streams: natives.compactMap { option in
                guard let url = option.streamURL else { return nil }
                var headers = option.headers
                if session.isNoctraOrigin(url), let token = session.token { headers["x-noctra-token"] = token }
                return (url, headers)
            }, exhausted: { [weak self] in
                guard let self else { return }
                if let next = others.first { self.start(next, fallbacks: Array(others.dropFirst()), channel: channel, session: session) }
                else { self.problem = "Aucun serveur de « \(channel.name) » ne répond pour le moment." }
            }, onResult: { index, ok in
                if natives.indices.contains(index) { LiveHealth.record(natives[index], channel: channelId, ok: ok) }
            }, onSmooth: { index, stalls, seconds in
                if natives.indices.contains(index) { LiveHealth.recordSmooth(natives[index], channel: channelId, stalls: stalls, seconds: seconds) }
            })
        }
    }
}

// MARK: Écrans

/// TV en direct : toutes les chaînes réunies, favoris, récentes, sources.
struct LiveTVHome: View {
    @Environment(Session.self) private var session
    private var store: LiveStore { .shared }
    @State private var tab: LiveTab = .all
    @State private var query = ""
    @State private var category: String?

    enum LiveTab: String, CaseIterable { case all = "Toutes", favorites = "Favoris", recents = "Récentes", sources = "Sources" }

    private var shown: [LiveChannel] {
        var list: [LiveChannel]
        let term = query.trimmingCharacters(in: .whitespaces)
        switch tab {
        case .all:
            // Pays choisi (France par défaut) ; la recherche couvre tous les pays.
            let code = store.country
            list = code.isEmpty || !term.isEmpty ? store.channels : store.channels.filter { ($0.country.isEmpty ? "?" : $0.country) == code }
            if code == "fr" && term.isEmpty { list.sort { $0.number < $1.number } }
        case .favorites: list = store.channels.filter { store.favorites.contains($0.id) }
        case .recents: list = store.recents.compactMap { key in store.channels.first { $0.id == key } }
        case .sources: list = []
        }
        if let category { list = list.filter { $0.group == category } }
        if !term.isEmpty { list = list.filter { $0.name.localizedCaseInsensitiveContains(term) } }
        return list
    }

    private var categories: [String] { store.categories }

    var body: some View {
        ScrollView {
            if !session.hasNoctra {
                MessageView(icon: "antenna.radiowaves.left.and.right.slash", text: "La TV en direct demande le serveur Noctra (adresse …/noctra).") {
                    Task { await session.establishNoctraSession(); await store.loadAll(session, force: true) }
                }
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("Affichage", selection: $tab) {
                        ForEach(LiveTab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 20)

                    accessBar

                    if tab == .sources {
                        sourcesGrid
                    } else {
                        if tab == .all && !categories.isEmpty { categoryChips }
                        if store.loading {
                            HStack(spacing: 10) {
                                ProgressView()
                                Text("Chargement des chaînes… \(store.loadedSources)/\(max(store.sources.count, 1)) sources")
                                    .font(.footnote)
                                    .foregroundStyle(Theme.muted)
                            }
                            .padding(.horizontal, 20)
                        }
                        ChannelGrid(channels: shown)
                        if !store.loading && shown.isEmpty {
                            MessageView(icon: tab == .favorites ? "star" : "tv", text: tab == .favorites ? "Appuyez longuement sur une chaîne pour l’ajouter aux favoris." : tab == .recents ? "Les chaînes regardées apparaîtront ici." : (store.failed ? "Sources TV indisponibles." : "Aucune chaîne.")) {
                                Task { await store.loadAll(session, force: true) }
                            }
                        }
                    }
                }
                .padding(.top, 6)
            }
        }
        .background(AuroraBackground(palette: .tv))
        .navigationTitle("TV en direct")
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Chaîne")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { countryMenu }
            ToolbarItem(placement: .topBarTrailing) { AccountButton() }
        }
        .refreshable { await store.loadAll(session, force: true) }
        .task { await store.loadAll(session) }
        .sensoryFeedback(.selection, trigger: tab)
        .sensoryFeedback(.selection, trigger: store.country)
    }

    /// Pays affichés : France d'abord, les autres au choix.
    private var countryMenu: some View {
        Menu {
            Picker("Pays", selection: Binding(get: { store.country }, set: { value in withAnimation(Theme.spring) { store.country = value; category = nil } })) {
                ForEach(store.countryChoices, id: \.self) { code in
                    Text("\(ChannelNaming.countryLabel(code)) · \(code.isEmpty ? store.channels.count : store.countries[code] ?? 0)").tag(code)
                }
            }
        } label: {
            Label(ChannelNaming.countryLabel(store.country), systemImage: "globe.europe.africa.fill")
                .labelStyle(.titleAndIcon)
                .font(.subheadline.weight(.semibold))
        }
    }

    /// Accès VIP actifs sur le serveur Noctra (LiveWatch Premium, Movix, Northlive).
    @ViewBuilder
    private var accessBar: some View {
        let access = [store.liveWatchVip ? "LiveWatch VIP Premium" : nil, store.providerKeys["movix"] == true ? "Movix" : nil,
                      store.providerKeys["northlive"] == true ? "Northlive" : nil].compactMap { $0 }
        if !access.isEmpty {
            HStack(spacing: 8) {
                Image(systemName: "crown.fill").foregroundStyle(Color(hex: 0xFCD34D))
                Text("Accès VIP : " + access.joined(separator: " · ") + " · serveurs proposés en premier")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(2)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .glassEffect(.regular.tint(Color(hex: 0xF59E0B).opacity(0.25)), in: Capsule())
            .padding(.horizontal, 20)
        }
    }

    private var categoryChips: some View {
        ScrollView(.horizontal) {
            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    chip("Toutes", selected: category == nil) { category = nil }
                    ForEach(categories, id: \.self) { name in
                        chip(name, selected: category == name) { category = category == name ? nil : name }
                    }
                }
                .padding(.horizontal, 20)
            }
        }
        .scrollIndicators(.hidden)
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(Theme.spring) { action() }
        } label: {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
        }
        .buttonStyle(PressableStyle())
        .glassEffect(selected ? .regular.tint(Theme.teal.opacity(0.5)).interactive() : .regular.interactive(), in: Capsule())
        .overlay(Capsule().stroke(selected ? Theme.teal.opacity(0.55) : Color(hex: 0x99F6E4).opacity(0.12), lineWidth: 1))
    }

    private var sourcesGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14)], spacing: 14) {
            ForEach(store.sources, id: \.self) { source in
                NavigationLink(value: source) {
                    VStack(alignment: .leading, spacing: 10) {
                        Image(systemName: "dot.radiowaves.left.and.right")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(Theme.accent)
                        Text(source.name)
                            .font(.headline)
                            .multilineTextAlignment(.leading)
                            .lineLimit(2)
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
                    .padding(16)
                    .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                }
                .buttonStyle(PressableStyle())
                .foregroundStyle(.white)
            }
        }
        .padding(.horizontal, 20)
    }
}

/// Grille de chaînes : appui pour regarder, appui long pour les favoris.
struct ChannelGrid: View {
    @Environment(Session.self) private var session
    let channels: [LiveChannel]
    @State private var taps = 0
    private var launcher: LiveLauncher { .shared }
    private var store: LiveStore { .shared }

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 12)], spacing: 12) {
            ForEach(channels) { channel in
                Button {
                    taps += 1
                    Task { await launcher.open(channel, session: session) }
                } label: {
                    VStack(spacing: 8) {
                        ZStack(alignment: .topTrailing) {
                            ZStack {
                                if let logo = channel.logo, let url = session.noctraURL(logo) {
                                    RemoteImage(url: url, contentMode: .fit).padding(14)
                                } else {
                                    Text(String(channel.name.prefix(2)).uppercased())
                                        .font(.title2.weight(.heavy))
                                        .foregroundStyle(Theme.teal)
                                }
                                if launcher.opening == channel.id {
                                    ProgressView().padding(10).glassEffect(.regular, in: Circle())
                                }
                            }
                            .frame(height: 72)
                            .frame(maxWidth: .infinity)
                            if store.favorites.contains(channel.id) {
                                Image(systemName: "star.fill").font(.caption2).foregroundStyle(.yellow).padding(8)
                            }
                        }
                        .overlay(alignment: .topLeading) {
                            HStack(spacing: 4) {
                                if channel.number > 0 && store.country == "fr" {
                                    Text("\(channel.number)").font(.caption2.weight(.heavy).monospacedDigit()).foregroundStyle(Theme.teal)
                                }
                                if channel.vip {
                                    Image(systemName: "crown.fill").font(.system(size: 9)).foregroundStyle(Color(hex: 0xFCD34D))
                                }
                            }
                            .padding(8)
                        }
                        // Fond plein plutôt que du verre : des milliers de cases défilent sans
                        // flou en temps réel derrière chacune.
                        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color(hex: 0x0E1326).opacity(0.82)))
                        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(LinearGradient(colors: [Theme.teal.opacity(0.35), .white.opacity(0.04), Theme.lilac.opacity(0.3)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1))
                        Text(channel.name)
                            .font(.caption.weight(.semibold))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                        if channel.entries.count > 1 {
                            Text("\(channel.entries.count) serveurs").font(.caption2).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .buttonStyle(PressableStyle())
                .foregroundStyle(.white)
                .contextMenu {
                    Button {
                        store.toggleFavorite(channel)
                    } label: {
                        Label(store.favorites.contains(channel.id) ? "Retirer des favoris" : "Ajouter aux favoris",
                              systemImage: store.favorites.contains(channel.id) ? "star.slash" : "star")
                    }
                }
            }
        }
        .padding(.horizontal, 20)
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
    }
}

/// Chaînes d'une source (ou d'un bouquet).
struct LiveChannelsView: View {
    @Environment(Session.self) private var session
    let route: TVSourceRoute
    @State private var channels: [LiveChannel] = []
    @State private var bouquets: [TVSourceRoute] = []
    @State private var loading = true
    @State private var query = ""

    private var shown: [LiveChannel] {
        let term = query.trimmingCharacters(in: .whitespaces)
        return term.isEmpty ? channels : channels.filter { $0.name.localizedCaseInsensitiveContains(term) }
    }

    var body: some View {
        ScrollView {
            if !bouquets.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionTitle("Bouquets").padding(.horizontal, 20)
                    ScrollView(.horizontal) {
                        GlassEffectContainer(spacing: 8) {
                            HStack(spacing: 8) {
                                ForEach(bouquets, id: \.self) { bouquet in
                                    NavigationLink(value: bouquet) {
                                        Text(bouquet.name)
                                            .font(.subheadline.weight(.semibold))
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 9)
                                    }
                                    .buttonStyle(PressableStyle())
                                    .glassEffect(.regular.interactive(), in: Capsule())
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }
                    .scrollIndicators(.hidden)
                }
                .padding(.vertical, 8)
            }
            ChannelGrid(channels: shown)
                .padding(.top, 8)
            if loading && channels.isEmpty && bouquets.isEmpty { LoadingView() }
            if !loading && channels.isEmpty && bouquets.isEmpty {
                MessageView(icon: "tv.slash", text: "Aucune chaîne dans cette source.") { Task { await load() } }
            }
        }
        .background(AuroraBackground(palette: .tv))
        .navigationTitle(route.name)
        .searchable(text: $query, prompt: "Chaîne")
        .task { if channels.isEmpty && bouquets.isEmpty { await load() } }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        await session.establishNoctraSession()
        let path = route.ref.map { "/api/tv/catalog?ref=" + ($0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0) }
            ?? "/api/tv/catalog?source=" + (route.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? route.id)
        guard let json = try? await session.noctraJSON(path) as? [String: Any] else { return }
        let list = (json["channels"] as? [[String: Any]]) ?? []
        var seen = Set<String>()
        let parsed: [LiveChannel] = list.enumerated().compactMap { index, entry in
            guard let name = entry["name"] as? String, !name.isEmpty else { return nil }
            var id = route.id + "|" + name
            if seen.contains(id) { id += "#\(index)" }
            seen.insert(id)
            let sourceId = route.id.components(separatedBy: "|").first ?? route.id
            return LiveChannel(id: id, name: name, logo: entry["logo"] as? String, group: entry["group"] as? String,
                               country: ChannelNaming.country(entry), entries: [(route.name, sourceId, entry)])
        }
        let groups = ((json["groups"] as? [[String: Any]]) ?? []).compactMap { group -> TVSourceRoute? in
            guard let ref = group["ref"] as? String else { return nil }
            let name = (group["name"] as? String) ?? (group["title"] as? String) ?? ref
            return TVSourceRoute(id: route.id + "|" + ref, name: name, ref: ref)
        }
        withAnimation(Theme.spring) {
            channels = parsed
            bouquets = Array(groups.prefix(60))
        }
    }
}

// MARK: Lecteur web de secours

/// Flux MPEG-TS (mpegts.js du serveur Noctra) ou lecteur d'un site, en plein écran.
struct WebLivePlayerView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let request: WebPlayerRequest

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            LiveWebView(request: request, session: session)
                .ignoresSafeArea()
            HStack(spacing: 10) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.headline)
                        .frame(width: 44, height: 44)
                }
                .glassEffect(.regular.interactive(), in: Circle())
                Text(request.title)
                    .font(.headline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: Capsule())
            }
            .padding(.leading, 16)
            .padding(.top, 8)
        }
        .statusBarHidden()
    }
}

struct LiveWebView: UIViewRepresentable {
    let request: WebPlayerRequest
    let session: Session

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.allowsPictureInPictureMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.backgroundColor = .black
        view.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
        let store = configuration.websiteDataStore.httpCookieStore
        let base = URL(string: session.noctraBase + "/")
        let cookies = base.flatMap { HTTPCookieStorage.shared.cookies(for: $0) } ?? []
        let request = self.request
        Task { @MainActor in
            for cookie in cookies { await store.setCookie(cookie) }
            switch request.mode {
            case .page(let url):
                view.load(URLRequest(url: url))
            case .mpegts(let url):
                view.loadHTMLString(Self.mpegtsPage(url), baseURL: base)
            }
        }
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: ()) {
        uiView.loadHTMLString("", baseURL: nil)
    }

    /// Page minimale : mpegts.js (servi par Noctra) lit le flux MPEG-TS dans une vidéo.
    private static func mpegtsPage(_ url: URL) -> String {
        let address = url.absoluteString.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
        return """
        <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
        <style>html,body{margin:0;height:100%;background:#000;color:#ccc;font:15px -apple-system}video{width:100%;height:100%;background:#000}#m{position:absolute;bottom:24px;width:100%;text-align:center}</style></head>
        <body><video id="v" playsinline autoplay controls></video><div id="m"></div>
        <script src="vendor/mpegts.js"></script>
        <script>
        var v=document.getElementById('v'),m=document.getElementById('m');
        try{v.disableRemotePlayback=true;}catch(e){}
        if(!window.mpegts||!mpegts.isSupported()){m.textContent='Flux non lisible sur cet appareil.';}
        else{var p=mpegts.createPlayer({type:'mpegts',isLive:true,url:'\(address)'},{enableWorker:false,lazyLoad:false,liveBufferLatencyChasing:false,enableStashBuffer:true});
        p.attachMediaElement(v);p.load();var t=p.play();if(t&&t.catch)t.catch(function(){});
        p.on(mpegts.Events.ERROR,function(a,b){m.textContent='Flux interrompu ('+a+').';});}
        </script></body></html>
        """
    }
}
