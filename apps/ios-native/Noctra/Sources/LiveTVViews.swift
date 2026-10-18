import Observation
import SwiftUI
import UIKit
import WebKit

// MARK: Modèle

/// Chaîne, éventuellement proposée par plusieurs sources (réunies par leur nom).
struct LiveChannel: Identifiable, Hashable, @unchecked Sendable {
    let id: String
    let name: String
    let logo: String?
    let group: String?
    /// Fiche brute de chaque source : (nom de la source, données du catalogue).
    let entries: [(source: String, raw: [String: Any])]

    static func == (lhs: LiveChannel, rhs: LiveChannel) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    /// Clé de regroupement : « TF1 HD », « tf1 » et « TF1 (FHD) » donnent « tf1 ».
    static func key(_ name: String) -> String {
        var text = name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "fr_FR")).lowercased()
        text = text.replacingOccurrences(of: "\\[[^\\]]*\\]|\\([^)]*\\)", with: " ", options: .regularExpression)
        text = text.replacingOccurrences(of: "\\b(uhd|fhd|hd|sd|4k|hevc|h265|backup|vip|fr|france|live)\\b", with: " ", options: .regularExpression)
        text = text.replacingOccurrences(of: "[^a-z0-9+]", with: "", options: .regularExpression)
        return text.isEmpty ? name.lowercased() : text
    }
}

/// Catalogue d'une source, préparé hors du fil principal (clés de regroupement calculées).
struct Catalog: @unchecked Sendable {
    struct Entry {
        let key: String
        let name: String
        let logo: String?
        let group: String?
        let raw: [String: Any]
    }
    let source: String
    let entries: [Entry]
}

/// Catalogues TV du serveur Noctra, favoris et chaînes récentes (gardés sur l'iPhone).
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
    /// Catégories les plus fournies, calculées une fois par chargement.
    private(set) var categories: [String] = []
    @ObservationIgnored private var loadedAt = Date.distantPast

    func loadSources(_ session: Session) async {
        guard let json = try? await session.noctraJSON("/api/tv/sources") as? [String: Any],
              let list = json["sources"] as? [[String: Any]] else { failed = sources.isEmpty; return }
        failed = false
        sources = list.compactMap { entry in
            guard let id = entry["id"] as? String, (entry["enabled"] as? Bool) != false else { return nil }
            return TVSourceRoute(id: id, name: (entry["name"] as? String) ?? id, ref: nil)
        }
    }

    /// Toutes les chaînes : catalogues chargés 6 à la fois, réunis par nom.
    func loadAll(_ session: Session, force: Bool = false) async {
        guard !loading, force || channels.isEmpty || Date().timeIntervalSince(loadedAt) > 1800 else { return }
        loading = true
        defer { loading = false }
        if sources.isEmpty { await session.establishNoctraSession(); await loadSources(session) }
        loadedSources = 0
        var merged: [String: (name: String, logo: String?, group: String?, entries: [(source: String, raw: [String: Any])])] = [:]
        var order: [String] = []
        var pending = sources.makeIterator()
        let fetch: @Sendable (TVSourceRoute) async -> Catalog = { source in
            let path = "/api/tv/catalog?source=" + (source.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? source.id)
            let json = try? await session.noctraJSON(path, timeout: 45) as? [String: Any]
            let list = (json?["channels"] as? [[String: Any]]) ?? []
            // Tâche enfant : expressions régulières des noms hors du fil principal.
            let entries: [Catalog.Entry] = list.compactMap { entry in
                guard let name = entry["name"] as? String, !name.isEmpty, (entry["isEvent"] as? Bool) != true else { return nil }
                return Catalog.Entry(key: LiveChannel.key(name), name: name, logo: entry["logo"] as? String, group: entry["group"] as? String, raw: entry)
            }
            return Catalog(source: source.name, entries: entries)
        }
        await withTaskGroup(of: Catalog.self) { group in
            for _ in 0..<6 {
                guard let source = pending.next() else { break }
                group.addTask { await fetch(source) }
            }
            for await catalog in group {
                let sourceName = catalog.source
                for entry in catalog.entries {
                    if merged[entry.key] == nil {
                        merged[entry.key] = (entry.name, entry.logo, entry.group, [])
                        order.append(entry.key)
                    }
                    if merged[entry.key]?.logo == nil, let logo = entry.logo { merged[entry.key]?.logo = logo }
                    merged[entry.key]?.entries.append((sourceName, entry.raw))
                }
                loadedSources += 1
                if let source = pending.next() { group.addTask { await fetch(source) } }
            }
        }
        let list: [LiveChannel] = order.compactMap { key in
            guard let value = merged[key] else { return nil }
            return LiveChannel(id: key, name: value.name, logo: value.logo, group: value.group, entries: value.entries)
        }
        var counts: [String: Int] = [:]
        for channel in list { if let group = channel.group, !group.isEmpty { counts[group, default: 0] += 1 } }
        categories = counts.sorted { $0.value > $1.value }.prefix(14).map(\.key)
        channels = list
        loadedAt = Date()
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

@MainActor
@Observable
final class LiveLauncher {
    static let shared = LiveLauncher()
    var webPlayer: WebPlayerRequest?
    var problem: String?
    private(set) var opening: String?

    private struct Option {
        let url: URL
        let headers: [String: String]
        let mpegts: Bool
    }

    func open(_ channel: LiveChannel, session: Session) async {
        guard opening == nil else { return }
        opening = channel.id
        defer { opening = nil }
        LiveStore.shared.noteRecent(channel)
        await session.establishNoctraSession()
        PlaybackManager.shared.liveSession = session

        var native: [Option] = []
        var pages: [URL] = []
        for entry in channel.entries.prefix(8) {
            let found = await streams(for: entry.raw, session: session, depth: 0)
            native.append(contentsOf: found)
            for key in ["embedUrl", "externalUrl", "vipFallbackUrl", "url"] {
                if let raw = entry.raw[key] as? String, let url = session.noctraURL(raw), !pages.contains(url) { pages.append(url) }
            }
        }
        // Flux HLS d'abord (lecteur d'Apple), MPEG-TS bruts ensuite (lecteur web).
        let hls = native.filter { !$0.mpegts }
        let ts = native.filter { $0.mpegts }
        let fallback: () -> Void = { [weak self] in
            guard let self else { return }
            if let first = ts.first {
                self.webPlayer = WebPlayerRequest(title: channel.name, mode: .mpegts(first.url))
            } else if let page = pages.first {
                self.webPlayer = WebPlayerRequest(title: channel.name, mode: .page(page))
            } else {
                self.problem = "Aucun serveur de « \(channel.name) » ne répond pour le moment."
            }
        }
        if !hls.isEmpty {
            PlaybackManager.shared.playLive(title: channel.name, streams: hls.map { option in
                var headers = option.headers
                if session.isNoctraOrigin(option.url), let token = session.token { headers["x-noctra-token"] = token }
                return (option.url, headers)
            }, exhausted: fallback)
        } else {
            fallback()
        }
    }

    /// Flux d'une chaîne : direct, ou serveurs proposés par le résolveur de Noctra.
    private func streams(for entry: [String: Any], session: Session, depth: Int) async -> [Option] {
        var found: [Option] = []
        if let stream = entry["streamUrl"] as? String, !stream.isEmpty, let url = session.noctraURL(stream) {
            let headers = (entry["headers"] as? [String: Any])?.compactMapValues { $0 as? String } ?? [:]
            let transport = (entry["transport"] as? String)?.lowercased() ?? ""
            let mpegts = transport == "mpegts" || (url.path.lowercased().hasSuffix(".ts") && !url.path.lowercased().contains("m3u8"))
            found.append(Option(url: url, headers: headers, mpegts: mpegts))
        }
        guard depth < 2 else { return found }
        let resolver = (entry["resolverUrl"] as? String) ?? (entry["resolveUrl"] as? String)
        if found.isEmpty, let resolver {
            if let result = try? await session.noctraJSON(resolver, timeout: 30) as? [String: Any] {
                let options = (result["options"] as? [[String: Any]]) ?? ((result["streamUrl"] != nil || result["resolveUrl"] != nil) ? [result] : [])
                for option in options.prefix(12) {
                    found.append(contentsOf: await streams(for: option, session: session, depth: depth + 1))
                }
            }
        }
        return found
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
        switch tab {
        case .all: list = store.channels
        case .favorites: list = store.channels.filter { store.favorites.contains($0.id) }
        case .recents: list = store.recents.compactMap { key in store.channels.first { $0.id == key } }
        case .sources: list = []
        }
        if let category { list = list.filter { $0.group == category } }
        let term = query.trimmingCharacters(in: .whitespaces)
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
        .toolbar { ToolbarItem(placement: .topBarTrailing) { AccountButton() } }
        .refreshable { await store.loadAll(session, force: true) }
        .task { await store.loadAll(session) }
        .sensoryFeedback(.selection, trigger: tab)
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
            return LiveChannel(id: id, name: name, logo: entry["logo"] as? String, group: entry["group"] as? String, entries: [(route.name, entry)])
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
