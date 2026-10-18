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

    // Évènement sportif (sources Sport) : équipes, compétition, horaire, score.
    var raw: [String: Any] { entries.first?.raw ?? [:] }
    var home: String? { (raw["homeName"] as? String).flatMap { $0.isEmpty ? nil : $0 } }
    var away: String? { (raw["awayName"] as? String).flatMap { $0.isEmpty ? nil : $0 } }
    var league: String? { [raw["leagueName"], raw["category"], raw["group"]].compactMap { $0 as? String }.first { !$0.isEmpty } }
    var score: String? { (raw["score"] as? String).flatMap { $0.isEmpty ? nil : $0 } }
    var isLive: Bool { entries.contains { $0.raw["isLive"] as? Bool == true } }
    var start: Date? { LiveChannel.date(raw["startTime"]) }
    var secondaryLogo: String? { (raw["secondaryLogo"] as? String).flatMap { $0.isEmpty ? nil : $0 } }

    static func date(_ value: Any?) -> Date? {
        if let number = value as? Double { return Date(timeIntervalSince1970: number > 10_000_000_000 ? number / 1000 : number) }
        if let number = value as? Int { return date(Double(number)) }
        guard let text = value as? String, !text.isEmpty else { return nil }
        if let number = Double(text) { return date(number) }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let found = iso.date(from: text) { return found }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: text)
    }

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
    var events: [Entry] = []
    let vip: [String: Any]?

    /// Chaînes lisibles d'une source, et à part les évènements (matchs du jour).
    static func prepare(_ list: [[String: Any]], sports: Bool) -> (channels: [Entry], events: [Entry]) {
        var channels: [Entry] = []
        var events: [Entry] = []
        for raw in list {
            guard let name = raw["name"] as? String, !name.isEmpty else { continue }
            let playable = (raw["streamUrl"] as? String).map { !$0.isEmpty } == true || raw["resolverUrl"] != nil
                || raw["embedUrl"] != nil || raw["externalUrl"] != nil || raw["vipFallbackUrl"] != nil
            guard playable else { continue }
            let home = (raw["homeName"] as? String) ?? "", away = (raw["awayName"] as? String) ?? ""
            let match = (!home.isEmpty && !away.isEmpty) || name.range(of: "\\s(?:vs\\.?|v\\.?|contre)\\s", options: [.regularExpression, .caseInsensitive]) != nil
            let dated = sports && ((raw["eventId"] as? String).map { !$0.isEmpty } == true || raw["startTime"] != nil
                || name.range(of: "\\s[x×]\\s|\\b\\d{1,2}[:h]\\d{2}\\b", options: .regularExpression) != nil)
            if raw["isEvent"] as? Bool == true || match || dated {
                // Même match proposé par plusieurs sources : une seule ligne, tous les serveurs.
                let key = "event:" + (!home.isEmpty && !away.isEmpty ? ChannelNaming.normalize(home) + "|" + ChannelNaming.normalize(away) : ChannelNaming.normalize(name))
                events.append(Entry(key: key, name: name, logo: raw["logo"] as? String, group: raw["group"] as? String, country: "", raw: raw))
                continue
            }
            let country = ChannelNaming.country(raw)
            channels.append(Entry(key: ChannelNaming.key(name, country: country), name: name, logo: raw["logo"] as? String,
                                  group: raw["group"] as? String, country: country, raw: raw))
        }
        return (channels, events)
    }

    /// Évènements de toutes les sources Sport réunis, en direct d'abord puis par horaire.
    static func mergeEvents(_ catalogs: [Catalog]) -> [LiveChannel] {
        var byKey: [String: (name: String, logo: String?, entries: [LiveChannel.Entry])] = [:]
        var order: [String] = []
        for catalog in catalogs {
            for entry in catalog.events {
                if byKey[entry.key] == nil { byKey[entry.key] = (entry.name, entry.logo, []); order.append(entry.key) }
                byKey[entry.key]?.entries.append((catalog.source, catalog.sourceId, entry.raw))
            }
        }
        let limit = Date().addingTimeInterval(-5 * 3600)
        let list: [LiveChannel] = order.compactMap { key in
            guard let value = byKey[key] else { return nil }
            let channel = LiveChannel(id: key, name: value.name, logo: value.logo, group: nil, country: "", entries: value.entries)
            if let start = channel.start, start < limit, !channel.isLive { return nil }
            return channel
        }
        return list.sorted { left, right in
            if left.isLive != right.isLive { return left.isLive }
            return (left.start ?? .distantFuture) < (right.start ?? .distantFuture)
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
    /// Matchs et évènements du jour (sources Sport), tous serveurs réunis.
    private(set) var events: [LiveChannel] = []
    /// Rubrique et description de chaque source (chaînes, sports, alternatives, personnelles).
    private(set) var sourceInfo: [String: (section: String, description: String)] = [:]
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
            sourceInfo[id] = ((entry["section"] as? String) ?? "channels", (entry["description"] as? String) ?? "")
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
            let prepared = Catalog.prepare(list, sports: sections[source.id] == "sports")
            let groups = ref == nil ? ((json?["groups"] as? [[String: Any]]) ?? []).compactMap { $0["ref"] as? String }.prefix(60).map { $0 } : []
            var catalog = Catalog(source: source.name, sourceId: source.id, entries: prepared.channels, vip: json?["liveWatchVip"] as? [String: Any])
            catalog.events = prepared.events
            return (catalog, groups)
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
        let matches = await Task.detached(priority: .userInitiated) { UncheckedBox(value: Catalog.mergeEvents(snapshot)) }.value.value
        apply(merged)
        events = matches
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
    /// Flux lus par le moteur web (mpegts.js, hls.js) ou page d'un site.
    enum Mode { case mpegts(URL), hls(URL), page(URL) }
    let id = UUID()
    let title: String
    let mode: Mode

    var isEngine: Bool {
        if case .page = mode { return false }
        return true
    }
}

/// Lancement d'une chaîne : serveurs de toutes les sources classés, testés,
/// meilleur serveur lancé tout seul dans le lecteur TV (chaînes et serveurs
/// changeables depuis le lecteur), les suivants en relais.
@MainActor
@Observable
final class LiveLauncher {
    static let shared = LiveLauncher()
    var problem: String?
    var pick: LivePick?
    private(set) var opening: String?
    @ObservationIgnored private var context: [LiveChannel] = []

    /// Fenêtre des serveurs à chaque lancement (sinon : meilleur serveur directement).
    var showPicker: Bool = UserDefaults.standard.object(forKey: "noctra.tv.picker") as? Bool ?? true {
        didSet { UserDefaults.standard.set(showPicker, forKey: "noctra.tv.picker") }
    }

    /// Serveurs de toutes les sources ; les automatiques (VIP compris) demandés tout de suite, 4 s au plus.
    func prepare(_ channel: LiveChannel, session: Session) async -> [LiveServer] {
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
        return LiveHealth.rank(expanded, channel: channel.id)
    }

    func open(_ channel: LiveChannel, context: [LiveChannel] = [], session: Session) async {
        guard opening == nil else { return }
        opening = channel.id
        defer { opening = nil }
        self.context = context
        LiveStore.shared.noteRecent(channel)
        PlaybackManager.shared.liveSession = session
        let pick = LivePick(channel: channel)
        if showPicker { self.pick = pick }
        pick.servers = await prepare(channel, session: session)
        pick.preparing = false
        guard !pick.servers.isEmpty else {
            if self.pick === pick { self.pick = nil }
            problem = "Aucun serveur ne propose « \(channel.name) » pour le moment."
            return
        }
        guard showPicker else {
            if let best = pick.servers.first { await launch(pick, server: best, session: session) }
            return
        }
        // Tests des flux directs (6 à la fois) pendant le compte à rebours.
        let probing = Task { await probe(pick, session: session) }
        while pick.countdown > 0 && pick.auto && !pick.launching && self.pick === pick {
            try? await Task.sleep(for: .seconds(1))
            pick.countdown -= 1
        }
        _ = probing
        guard pick.auto, !pick.launching, self.pick === pick else { return }
        pick.servers = LiveHealth.rank(pick.servers, channel: channel.id)
        if let best = pick.best { await launch(pick, server: best, session: session) }
    }

    private func probe(_ pick: LivePick, session: Session) async {
        let targets = pick.servers.filter { $0.kind == .native }.prefix(16)
        for target in targets { if let index = pick.servers.firstIndex(where: { $0.id == target.id }) { pick.servers[index].probe = .testing } }
        await LiveServerFactory.probeMany(Array(targets), session: session) { id, result in
            guard let index = pick.servers.firstIndex(where: { $0.id == id }) else { return }
            pick.servers[index].apply(result)
            if [.down, .noVideo].contains(result.state) { LiveHealth.record(pick.servers[index], channel: pick.channel.id, ok: false) }
        }
    }

    /// Serveur choisi (ou meilleur) : lancé dans le lecteur TV, les autres en relais.
    func launch(_ pick: LivePick, server: LiveServer, session: Session) async {
        guard !pick.launching else { return }
        pick.launching = true
        pick.auto = false
        let ranked = LiveHealth.rank(pick.servers, channel: pick.channel.id)
        let ordered = [server] + ranked.filter { $0.id != server.id }
        if self.pick === pick { self.pick = nil }
        LivePlayerModel.shared.start(channel: pick.channel, servers: ordered, first: server, context: context, session: session)
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

    enum LiveTab: String, CaseIterable { case all = "Chaînes", sport = "Sport", favorites = "Favoris", recents = "Récentes", sources = "Sources" }

    private var shown: [LiveChannel] {
        var list: [LiveChannel]
        let term = query.trimmingCharacters(in: .whitespaces)
        switch tab {
        case .all:
            // Pays choisi (France par défaut) ; la recherche couvre tous les pays.
            let code = store.country
            list = code.isEmpty || !term.isEmpty ? store.channels : store.channels.filter { ($0.country.isEmpty ? "?" : $0.country) == code }
            if code == "fr" && term.isEmpty { list.sort { $0.number < $1.number } }
        case .sport: list = store.events
        case .favorites: list = (store.channels + store.events).filter { store.favorites.contains($0.id) }
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
                    } else if tab == .sport {
                        if store.loading && store.events.isEmpty {
                            HStack(spacing: 10) {
                                ProgressView()
                                Text("Chargement des matchs de toutes les sources Sport…").font(.footnote).foregroundStyle(Theme.muted)
                            }
                            .padding(.horizontal, 20)
                        }
                        EventList(events: shown)
                        if !store.loading && shown.isEmpty {
                            MessageView(icon: "sportscourt", text: "Aucun match pour le moment. Les sources Sport sont aussi dans l’onglet Sources.") {
                                Task { await store.loadAll(session, force: true) }
                            }
                        }
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

    /// Toutes les sources, par rubrique : chaînes, sport, alternatives, personnelles.
    private var sourcesGrid: some View {
        let sections: [(String, String, String)] = [("channels", "Chaînes", "tv"), ("sports", "Sport", "sportscourt.fill"),
                                                    ("alternatives", "Alternatives", "arrow.triangle.branch"), ("personal", "Mes sources", "person.crop.circle")]
        let known = Set(sections.map(\.0))
        return VStack(alignment: .leading, spacing: 18) {
            ForEach(sections, id: \.0) { section in
                let list = store.sources.filter { source in
                    let value = store.sourceInfo[source.id]?.section ?? "channels"
                    return value == section.0 || (section.0 == "personal" && !known.contains(value))
                }
                if !list.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionTitle(section.1, detail: "\(list.count)").padding(.horizontal, 20)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14)], spacing: 14) {
                            ForEach(list, id: \.self) { source in
                                NavigationLink(value: source) {
                                    VStack(alignment: .leading, spacing: 8) {
                                        Image(systemName: section.2)
                                            .font(.title3.weight(.semibold))
                                            .foregroundStyle(Theme.accent)
                                        Text(source.name)
                                            .font(.headline)
                                            .multilineTextAlignment(.leading)
                                            .lineLimit(2)
                                        if let description = store.sourceInfo[source.id]?.description, !description.isEmpty {
                                            Text(description).font(.caption2).foregroundStyle(Theme.muted).lineLimit(2).multilineTextAlignment(.leading)
                                        }
                                        Spacer(minLength: 0)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
                                    .padding(16)
                                    .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color(hex: 0x0E1326).opacity(0.82)))
                                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Theme.teal.opacity(0.25), lineWidth: 1))
                                }
                                .buttonStyle(PressableStyle())
                                .foregroundStyle(.white)
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                }
            }
        }
    }
}

/// Matchs du jour : en direct d'abord, puis par horaire ; tous les serveurs des sources Sport.
struct EventList: View {
    @Environment(Session.self) private var session
    let events: [LiveChannel]
    private var launcher: LiveLauncher { .shared }

    var body: some View {
        LazyVStack(spacing: 10) {
            ForEach(events) { event in
                Button {
                    Task { await launcher.open(event, context: events, session: session) }
                } label: {
                    HStack(spacing: 12) {
                        VStack(spacing: 3) {
                            if event.isLive {
                                Text("DIRECT").font(.system(size: 10, weight: .heavy)).padding(.horizontal, 6).padding(.vertical, 3).background(.red, in: Capsule())
                            } else if let start = event.start {
                                Text(start.formatted(date: .omitted, time: .shortened)).font(.subheadline.weight(.bold).monospacedDigit())
                                if !Calendar.current.isDateInToday(start) {
                                    Text(start.formatted(.dateTime.day().month(.abbreviated))).font(.caption2).foregroundStyle(Theme.muted)
                                }
                            } else {
                                Image(systemName: "sportscourt").foregroundStyle(Theme.muted)
                            }
                        }
                        .frame(width: 58)
                        VStack(alignment: .leading, spacing: 4) {
                            if let league = event.league { Text(league).font(.caption2.weight(.semibold)).foregroundStyle(Theme.teal).lineLimit(1) }
                            if let home = event.home, let away = event.away {
                                team(home, logo: event.logo)
                                team(away, logo: event.secondaryLogo)
                            } else {
                                Text(event.name).font(.subheadline.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
                            }
                        }
                        Spacer(minLength: 4)
                        VStack(alignment: .trailing, spacing: 4) {
                            if let score = event.score { Text(score).font(.headline.monospacedDigit()) }
                            Text("\(event.entries.count) serveur\(event.entries.count > 1 ? "s" : "")").font(.caption2).foregroundStyle(Theme.muted)
                            if launcher.opening == event.id { ProgressView() }
                        }
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color(hex: 0x0E1326).opacity(0.82)))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(event.isLive ? Color.red.opacity(0.45) : Theme.teal.opacity(0.2), lineWidth: 1))
                }
                .buttonStyle(PressableStyle(scale: 0.98))
                .foregroundStyle(.white)
                .contextMenu {
                    Button {
                        LiveStore.shared.toggleFavorite(event)
                    } label: {
                        Label(LiveStore.shared.favorites.contains(event.id) ? "Retirer des favoris" : "Ajouter aux favoris", systemImage: "star")
                    }
                }
            }
        }
        .padding(.horizontal, 20)
    }

    private func team(_ name: String, logo: String?) -> some View {
        HStack(spacing: 8) {
            if let logo, let url = session.noctraURL(logo) {
                RemoteImage(url: url, contentMode: .fit).frame(width: 20, height: 20)
            }
            Text(name).font(.subheadline.weight(.semibold)).lineLimit(1)
        }
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
                    Task { await launcher.open(channel, context: channels, session: session) }
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

    private var shownBouquets: [TVSourceRoute] {
        let term = query.trimmingCharacters(in: .whitespaces)
        return term.isEmpty ? bouquets : bouquets.filter { $0.name.localizedCaseInsensitiveContains(term) }
    }

    var body: some View {
        ScrollView {
            if !bouquets.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionTitle("Bouquets", detail: "\(shownBouquets.count)").padding(.horizontal, 20)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                        ForEach(shownBouquets, id: \.self) { bouquet in
                            NavigationLink(value: bouquet) { BouquetCard(name: bouquet.name) }
                                .buttonStyle(PressableStyle())
                                .foregroundStyle(.white)
                        }
                    }
                    .padding(.horizontal, 20)
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
        .searchable(text: $query, prompt: bouquets.isEmpty ? "Chaîne" : "Bouquet ou chaîne")
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
            bouquets = Array(groups.prefix(200))
        }
    }
}

/// Carte d'un bouquet : emoji du fournisseur (ou icône du thème), nom, teinte propre.
struct BouquetCard: View {
    let name: String

    private var parts: (symbol: String?, title: String) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard let first = trimmed.first, first.unicodeScalars.contains(where: { $0.properties.isEmojiPresentation || $0.properties.generalCategory == .otherSymbol }) else {
            return (nil, trimmed)
        }
        return (String(first), String(trimmed.dropFirst()).trimmingCharacters(in: .whitespaces))
    }

    private var icon: String {
        let text = name.lowercased()
        let table: [(String, String)] = [("sport", "sportscourt.fill"), ("foot", "soccerball"), ("ciné", "film.fill"), ("cine", "film.fill"), ("film", "film.fill"),
                                         ("série", "play.rectangle.on.rectangle.fill"), ("serie", "play.rectangle.on.rectangle.fill"), ("enfant", "teddybear.fill"),
                                         ("kids", "teddybear.fill"), ("jeunesse", "teddybear.fill"), ("info", "newspaper.fill"), ("news", "newspaper.fill"),
                                         ("musique", "music.note"), ("music", "music.note"), ("docu", "globe.europe.africa.fill"), ("adult", "eye.slash.fill"),
                                         ("radio", "radio.fill"), ("france", "flag.fill"), ("4k", "4k.tv.fill"), ("uhd", "4k.tv.fill")]
        return table.first { text.contains($0.0) }?.1 ?? "square.stack.3d.up.fill"
    }

    private var tint: Color {
        let palette = [Theme.teal, Theme.lilac, Theme.cyan, Color(hex: 0xFDBA74), Color(hex: 0xF9A8D4), Color(hex: 0xFCD34D)]
        let sum = name.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF }
        return palette[sum % palette.count]
    }

    var body: some View {
        let parts = self.parts
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                Circle().fill(tint.opacity(0.18))
                if let symbol = parts.symbol {
                    Text(symbol).font(.system(size: 24))
                } else {
                    Image(systemName: icon).font(.title3.weight(.semibold)).foregroundStyle(tint)
                }
            }
            .frame(width: 46, height: 46)
            Spacer(minLength: 0)
            Text(parts.title.isEmpty ? name : parts.title)
                .font(.headline)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            HStack(spacing: 4) {
                Text("Voir les chaînes")
                Image(systemName: "chevron.right")
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, minHeight: 138, alignment: .topLeading)
        .padding(16)
        .background {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(LinearGradient(colors: [tint.opacity(0.22), Color(hex: 0x0E1326).opacity(0.9)], startPoint: .topLeading, endPoint: .bottomTrailing))
        }
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(tint.opacity(0.35), lineWidth: 1))
    }
}

// MARK: Lecteur web

/// Lecteur web : page d'un site (lecteur externe) ou moteur web de l'appli
/// (hls.js et mpegts.js servis par Noctra, comme pour Northlive). Lecture,
/// flux repéré et erreurs remontent au lecteur TV (serveur suivant, mémoire du
/// moteur). Fenêtres publicitaires et redirections vers un autre site bloquées.
struct LiveWebView: UIViewRepresentable {
    let request: WebPlayerRequest
    let session: Session

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        var allowedHosts: Set<String> = []
        var loaded = false
        var requestID = UUID()

        private func host(_ url: URL?) -> String { (url?.host ?? "").lowercased().replacingOccurrences(of: "www.", with: "") }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            let target = navigationAction.request.url
            // Cadres du lecteur : libres. Page principale : même site, ou redirection pendant le premier chargement.
            if navigationAction.targetFrame?.isMainFrame == false { return .allow }
            if navigationAction.targetFrame == nil { return .cancel }
            let scheme = target?.scheme?.lowercased() ?? ""
            if !["http", "https", "about", "blob", "data"].contains(scheme) { return .cancel }
            let destination = host(target)
            if destination.isEmpty || allowedHosts.contains(destination) || (!loaded && navigationAction.navigationType == .other) {
                if !destination.isEmpty { allowedHosts.insert(destination) }
                return .allow
            }
            return .cancel
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loaded = true
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            // Seul l'échec du premier chargement compte (une redirection bloquée n'en est pas un).
            let failure = error as NSError
            guard !loaded, failure.code != NSURLErrorCancelled, !(failure.domain == "WebKitErrorDomain" && failure.code == 102) else { return }
            report(state: "error", message: "page du lecteur injoignable (\(failure.localizedDescription)).", url: "")
        }

        /// window.open et liens « nouvelle fenêtre » : publicités, jamais ouvertes.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            nil
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            report(state: body["state"] as? String ?? "", message: body["message"] as? String ?? "", url: body["url"] as? String ?? "")
        }

        private func report(state: String, message: String, url: String) {
            let id = requestID
            MainActor.assumeIsolated {
                LivePlayerModel.shared.webEvent(id, state: state, message: message, url: url)
            }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.allowsAirPlayForMediaPlayback = true
        configuration.preferences.isElementFullscreenEnabled = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        // Messages des lecteurs (tous les cadres) : vidéo lancée, états des ponts Noctra.
        configuration.userContentController.addUserScript(WKUserScript(source: Self.bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        configuration.userContentController.add(context.coordinator, name: "noctra")
        context.coordinator.requestID = request.id
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.backgroundColor = .black
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
        LivePlayerModel.shared.webView = view
        let store = configuration.websiteDataStore.httpCookieStore
        let base = URL(string: session.noctraBase + "/")
        if let noctraHost = base?.host?.lowercased() { context.coordinator.allowedHosts.insert(noctraHost.replacingOccurrences(of: "www.", with: "")) }
        let cookies = base.flatMap { HTTPCookieStorage.shared.cookies(for: $0) } ?? []
        let request = self.request
        let token = session.token ?? ""
        let target: URL
        switch request.mode {
        case .page(let url), .mpegts(let url), .hls(let url): target = url
        }
        let local = session.isNoctraOrigin(target)
        Task { @MainActor in
            for cookie in cookies { await store.setCookie(cookie) }
            switch request.mode {
            case .page(let url):
                if let host = url.host?.lowercased() { context.coordinator.allowedHosts.insert(host.replacingOccurrences(of: "www.", with: "")) }
                if local, Self.framedBridge(url) {
                    // Pont VIP LiveWatch / OHA du serveur : dans un cadre isolé, exactement comme sur PC.
                    view.loadHTMLString(Self.framePage(url), baseURL: base)
                } else {
                    // Sans référent, comme les lecteurs officiels l'attendent.
                    view.load(URLRequest(url: url))
                }
            case .mpegts(let url):
                view.loadHTMLString(Self.enginePage(url, transport: true, token: local ? token : ""), baseURL: base)
            case .hls(let url):
                view.loadHTMLString(Self.enginePage(url, transport: false, token: local ? token : ""), baseURL: base)
            }
        }
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "noctra")
        uiView.loadHTMLString("", baseURL: nil)
    }

    /// Relais vers l'appli : vidéo lancée (y compris dans les cadres des sites)
    /// et messages « noctra-…-state » des ponts du serveur (lecture, flux, VIP).
    private static let bridgeScript = """
    (function(){if(window.__noctraBridge)return;window.__noctraBridge=1;
    function send(o){try{window.webkit.messageHandlers.noctra.postMessage(o)}catch(e){}}
    addEventListener('message',function(e){var d=e.data;if(!d||typeof d!=='object')return;var t=String(d.type||'');
    if(!/^noctra-[a-z0-9]+-state$/.test(t))return;send({state:String(d.state||''),message:String(d.message||''),url:String(d.url||'')})},true);
    document.addEventListener('playing',function(e){var t=e.target;if(t&&t.tagName==='VIDEO')send({state:'playing'})},true);
    })();
    """

    /// Pages du serveur Noctra conçues pour un cadre isolé (sans même origine).
    private static func framedBridge(_ url: URL) -> Bool {
        let path = url.path
        return path.contains("/api/tv/livewatch/vip/") || path.contains("/api/tv/livewatch/embed/") || path.contains("/api/tv/oha/embed/")
    }

    private static func escaped(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "<", with: "&lt;")
    }

    private static func literal(_ value: String) -> String {
        value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'").replacingOccurrences(of: "\n", with: "")
    }

    /// Cadre du lecteur, réglé comme sur PC : scripts, formulaires et plein écran
    /// permis, sans même origine ; les fenêtres surgissantes restent bloquées.
    private static func framePage(_ url: URL) -> String {
        """
        <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
        <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#000}</style></head>
        <body><iframe src="\(escaped(url.absoluteString))" sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
        referrerpolicy="strict-origin-when-cross-origin" allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *" allowfullscreen></iframe></body></html>
        """
    }

    private static let tsScript = """
        if(!window.mpegts||!mpegts.isSupported()){send('error','flux MPEG-TS non pris en charge ici');return}
        var p=mpegts.createPlayer({type:'mpegts',isLive:true,url:U},{enableWorker:false,lazyLoad:false,liveBufferLatencyChasing:false,enableStashBuffer:true,headers:K&&same(U)?{'x-noctra-token':K}:undefined});
        p.attachMediaElement(v);p.load();start();
        p.on(mpegts.Events.ERROR,function(a,b){send('error','flux MPEG-TS interrompu ('+a+(b?' · '+b:'')+')')});
    """

    private static let hlsScript = """
        if(window.Hls&&Hls.isSupported()){
        var h=new Hls({lowLatencyMode:false,liveSyncDurationCount:3,maxBufferLength:30,backBufferLength:30,
        manifestLoadingTimeOut:20000,manifestLoadingMaxRetry:3,levelLoadingTimeOut:20000,levelLoadingMaxRetry:4,fragLoadingTimeOut:30000,fragLoadingMaxRetry:4,
        xhrSetup:function(x,u){if(K&&same(u))x.setRequestHeader('x-noctra-token',K)}});
        var net=0,media=0;
        h.on(Hls.Events.ERROR,function(e,d){if(!d||!d.fatal)return;
        if(d.type===Hls.ErrorTypes.NETWORK_ERROR&&net++<2){h.startLoad();return}
        if(d.type===Hls.ErrorTypes.MEDIA_ERROR&&media++<2){h.recoverMediaError();return}
        send('error','moteur web : '+d.details+(d.response&&d.response.code?' ('+d.response.code+')':''))});
        h.on(Hls.Events.MANIFEST_PARSED,start);
        h.loadSource(U);h.attachMedia(v);
        }else{v.src=U;start();v.addEventListener('error',function(){send('error','vidéo illisible')})}
    """

    /// Moteur web : mpegts.js (flux MPEG-TS continu) ou hls.js (liste HLS),
    /// servis par Noctra ; jeton Noctra joint aux requêtes vers Noctra seulement.
    /// Lecture, coupure prolongée et erreurs signalées à l'appli.
    private static func enginePage(_ url: URL, transport: Bool, token: String) -> String {
        let address = literal(url.absoluteString)
        let key = literal(token)
        let library = transport ? "mpegts.js" : "hls.min.js"
        let script = transport ? tsScript : hlsScript
        return """
        <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
        <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{position:fixed;inset:0;width:100%;height:100%;background:#000;object-fit:contain}</style></head>
        <body><video id="v" playsinline webkit-playsinline autoplay></video>
        <script src="vendor/\(library)"></script>
        <script>
        (function(){
        var v=document.getElementById('v'),U='\(address)',K='\(key)',playing=false,waitSince=0;
        function send(s,m){try{window.webkit.messageHandlers.noctra.postMessage({state:s,message:m||''})}catch(e){}}
        function same(u){try{return new URL(u,location.href).origin===location.origin}catch(e){return false}}
        function start(){var p=v.play();if(p&&p.catch)p.catch(function(){v.muted=true;var q=v.play();if(q&&q.catch)q.catch(function(){})})}
        try{v.disableRemotePlayback=true}catch(e){}
        v.addEventListener('playing',function(){playing=true;waitSince=0;send('playing')});
        v.addEventListener('waiting',function(){waitSince=Date.now()});
        v.addEventListener('timeupdate',function(){if(!v.paused)waitSince=0});
        setInterval(function(){if(playing&&waitSince&&Date.now()-waitSince>15000){waitSince=0;send('stalled','coupure prolongée.')}},2000);
        \(script)
        })();
        </script></body></html>
        """
    }
}
