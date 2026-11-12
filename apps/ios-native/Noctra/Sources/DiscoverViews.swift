import SwiftUI

/// Fiche Jellyfin ouverte par son identifiant (Découvrir, Demandes, Roulette).
struct ItemRoute: Hashable {
    let id: String

    var item: BaseItem? {
        try? JSONDecoder.jellyfin.decode(BaseItem.self, from: Data("{\"Id\":\"\(id)\"}".utf8))
    }
}

/// Titre proposé par Jellyseerr / TMDB (Découvrir, Demandes).
struct SeerrItem: Identifiable, Hashable {
    let id: Int
    let mediaType: String
    let title: String
    let posterPath: String?
    let backdropPath: String?
    let date: String?
    let vote: Double?
    let overview: String?
    let status: Int?
    let jellyfinId: String?
    let reason: String?
    /// Fiche Radarr/Sonarr déjà créée (demande faite) : recherche interactive possible.
    let serviceId: Int?

    var key: String { "\(mediaType):\(id)" }
    var year: String? { date.flatMap { $0.count >= 4 ? String($0.prefix(4)) : nil } }
    var poster: URL? { posterPath.flatMap { URL(string: "https://image.tmdb.org/t/p/w342" + $0) } }
    var backdrop: URL? { (backdropPath ?? posterPath).flatMap { URL(string: "https://image.tmdb.org/t/p/w780" + $0) } }
    var statusLabel: String? {
        switch status {
        case 2: return "En attente"
        case 3: return "En cours"
        case 4: return "Partiel"
        case 5: return "Disponible"
        default: return nil
        }
    }

    init?(_ json: [String: Any]) {
        guard let id = json["id"] as? Int, let type = json["mediaType"] as? String, type == "movie" || type == "tv" else { return nil }
        self.id = id
        mediaType = type
        title = (json["title"] as? String) ?? (json["name"] as? String) ?? "Sans titre"
        posterPath = json["posterPath"] as? String
        backdropPath = json["backdropPath"] as? String
        date = (json["releaseDate"] as? String) ?? (json["firstAirDate"] as? String)
        vote = json["voteAverage"] as? Double
        overview = json["overview"] as? String
        let info = json["mediaInfo"] as? [String: Any]
        status = info?["status"] as? Int
        jellyfinId = info?["jellyfinMediaId"] as? String
        reason = json["reason"] as? String
        serviceId = (json["resolvedServiceId"] as? Int) ?? (info?["externalServiceId"] as? Int)
    }
}

/// Onglet Découvrir : sélections personnalisées, demandes, roulette.
struct DiscoverHub: View {
    @State private var section: HubSection = .discover

    enum HubSection: String, CaseIterable { case discover = "Découvrir", requests = "Demandes", roulette = "Roulette" }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Section", selection: $section) {
                ForEach(HubSection.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
            Group {
                switch section {
                case .discover: DiscoverView()
                case .requests: RequestsView()
                case .roulette: RouletteView()
                }
            }
            .transition(.opacity)
        }
        .animation(Theme.spring, value: section)
        .background(AuroraBackground(palette: section == .requests ? .requests : section == .roulette ? .roulette : .main))
        .navigationTitle(section.rawValue)
        .toolbarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { AccountButton() } }
        .sensoryFeedback(.selection, trigger: section)
    }
}

/// Grille d'affiches TMDB : fiche avec « Regarder » ou « Demander ».
struct SeerrGrid: View {
    let items: [SeerrItem]
    var onLast: (() -> Void)?
    @State private var selected: SeerrItem?

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 108, maximum: 160), spacing: 14, alignment: .top)], spacing: 18) {
            ForEach(items) { item in
                Button {
                    selected = item
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        RemoteImage(url: item.poster)
                            .aspectRatio(2 / 3, contentMode: .fit)
                            .overlay(alignment: .topLeading) {
                                if let label = item.statusLabel {
                                    Text(label)
                                        .font(.caption2.weight(.bold))
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .glassEffect(.regular.tint((item.status == 5 ? Theme.accent : .orange).opacity(0.5)), in: Capsule())
                                        .padding(6)
                                }
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        Text(item.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                        Text([item.year, item.mediaType == "tv" ? "Série" : "Film"].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                }
                .buttonStyle(PressableStyle())
                .foregroundStyle(.white)
                .onAppear { if item.id == items.last?.id { onLast?() } }
            }
        }
        .padding(.horizontal, 16)
        .sheet(item: $selected) { item in
            SeerrSheet(item: item)
                .presentationDetents([.medium, .large])
        }
    }
}

struct SeerrSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let item: SeerrItem
    @State private var sending = false
    @State private var note: String?
    @State private var requested = false
    @State private var opened: ItemRoute?
    @State private var choosing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .top, spacing: 16) {
                        RemoteImage(url: item.poster)
                            .frame(width: 120, height: 180)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.title).font(.title2.weight(.bold))
                            Text([item.year, item.mediaType == "tv" ? "Série" : "Film", item.vote.map { String(format: "★ %.1f", $0) }, item.statusLabel]
                                .compactMap { $0 }.joined(separator: " · "))
                                .font(.subheadline).foregroundStyle(Theme.muted)
                            if let reason = item.reason { Text(reason).font(.caption).foregroundStyle(Theme.accent) }
                        }
                    }
                    GlassEffectContainer(spacing: 10) {
                        VStack(spacing: 10) {
                            if let jellyfin = item.jellyfinId {
                                NavigationLink(value: ItemRoute(id: jellyfin)) {
                                    Label("Regarder", systemImage: "play.fill").frame(maxWidth: .infinity).padding(.vertical, 6)
                                }
                                .auroraPrimary()
                            }
                            if (item.status ?? 0) < 5 {
                                Button {
                                    // Administrateur : choix du dossier (catégorie détectée proposée d'abord).
                                    if session.isAdmin { choosing = true } else { Task { await request(nil) } }
                                } label: {
                                    HStack {
                                        if sending { ProgressView() }
                                        Label(requested || (item.status ?? 0) >= 2 ? "Déjà demandé" : "Demander", systemImage: "plus.circle.fill")
                                    }
                                    .frame(maxWidth: .infinity).padding(.vertical, 6)
                                }
                                .auroraSecondary()
                                .disabled(sending || requested || (item.status ?? 0) >= 2)
                            }
                            if session.isAdmin && (item.status ?? 0) < 5 {
                                // Comme sur le site : film → releases Radarr ; série → œuvre complète, saison ou épisode.
                                NavigationLink {
                                    ReleaseSearchHub(mediaType: item.mediaType, tmdbId: item.id, title: item.title, year: item.year, serviceId: item.serviceId)
                                } label: {
                                    Label(item.mediaType == "tv" ? "Recherche interactive · série" : "Recherche interactive · film", systemImage: "magnifyingglass")
                                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                                }
                                .auroraSecondary()
                            }
                        }
                    }
                    if session.isAdmin, (2...4).contains(item.status ?? 0) {
                        Text("Déjà demandé mais pas encore disponible : lance la recherche interactive pour choisir la release.")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                    if let note { Text(note).font(.footnote).foregroundStyle(Theme.muted) }
                    if let overview = item.overview, !overview.isEmpty {
                        Text(overview).foregroundStyle(.white.opacity(0.85))
                    }
                }
                .padding(20)
            }
            .navigationTitle(item.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
            .navigationDestination(for: ItemRoute.self) { route in
                if let base = route.item { ItemDetailView(item: base) }
            }
            .sensoryFeedback(.success, trigger: requested)
            .sheet(isPresented: $choosing) {
                NavigationStack {
                    RequestDestinationView(mediaType: item.mediaType, mediaId: item.id, title: item.title, confirm: "Demander") { destination in
                        choosing = false
                        Task { await request(destination) }
                    }
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    private func request(_ destination: RequestDestination?) async {
        sending = true
        defer { sending = false }
        do {
            var body: [String: Any] = [
                "mediaType": item.mediaType, "mediaId": item.id, "title": item.title, "year": item.year.flatMap { Int($0) }.map { $0 as Any } ?? NSNull()
            ]
            if let destination { body.merge(destination.json) { _, new in new } }
            _ = try await session.noctraSend("POST", "/api/jellyseerr/request", json: body)
            withAnimation(Theme.spring) { requested = true }
            note = "Demande envoyée. Elle apparaîtra dans « Mes demandes »."
        } catch {
            note = error.localizedDescription
        }
    }
}

/// Découvrir : catégories et pages successives.
struct DiscoverView: View {
    @Environment(Session.self) private var session
    @State private var category = "smart"
    @State private var items: [SeerrItem] = []
    @State private var page = 1
    @State private var more = true
    @State private var busy = false
    @State private var warning: String?

    private let categories: [(String, String)] = [
        ("smart", "Pour toi"), ("trending", "Tendances"), ("cinema", "Au cinéma"), ("streaming", "Streaming"),
        ("series", "Séries"), ("anime", "Animes"), ("animation", "Animation"), ("year", "Cette année"),
        ("classics", "Classiques"), ("gems", "Pépites")
    ]

    var body: some View {
        ScrollView {
            ScrollView(.horizontal) {
                GlassEffectContainer(spacing: 8) {
                    HStack(spacing: 8) {
                        ForEach(categories, id: \.0) { entry in
                            Button {
                                guard category != entry.0 else { return }
                                withAnimation(Theme.spring) { category = entry.0 }
                                items = []
                                page = 1
                                more = true
                                Task { await load() }
                            } label: {
                                Text(entry.1)
                                    .font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 9)
                            }
                            .buttonStyle(PressableStyle())
                            .glassEffect(category == entry.0 ? .regular.tint(Theme.accent.opacity(0.6)).interactive() : .regular.interactive(), in: Capsule())
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
            .scrollIndicators(.hidden)
            .padding(.vertical, 6)
            SeerrGrid(items: items) { Task { await load() } }
            if busy { LoadingView() }
            if !busy && items.isEmpty {
                MessageView(icon: "sparkles", text: warning ?? "Aucune suggestion pour le moment.") { Task { await load() } }
            }
        }
        .refreshable {
            items = []
            page = 1
            more = true
            await load()
        }
        .task { if items.isEmpty { await load() } }
    }

    private func load() async {
        guard !busy, more else { return }
        busy = true
        defer { busy = false }
        let current = category
        guard let json = try? await session.noctraJSON("/api/discovery?category=\(current)&mode=balanced&page=\(page)", timeout: 45) as? [String: Any] else {
            warning = "Découverte indisponible pour le moment."
            more = false
            return
        }
        guard current == category else { return }
        let seen = Set(items.map(\.key))
        let fresh = ((json["results"] as? [[String: Any]]) ?? []).compactMap(SeerrItem.init).filter { !seen.contains($0.key) }
        withAnimation(Theme.spring) { items.append(contentsOf: fresh) }
        more = ((json["hasMore"] as? Bool) ?? false) && !fresh.isEmpty
        page = (json["nextPage"] as? Int) ?? page + 1
        warning = json["warning"] as? String
    }
}

/// Ligne de « Mes demandes » (toutes les demandes pour un administrateur).
struct RequestEntry: Identifiable {
    let id: Int
    let title: String
    let poster: URL?
    let label: String
    let jellyfinId: String?
    let mediaType: String
    let tmdbId: Int?
    let year: String?
    let serviceId: Int?
    let requestId: Int?
    let pending: Bool
    let requester: String?
}

/// Demandes : recherche Jellyseerr et suivi de « Mes demandes ».
struct RequestsView: View {
    @Environment(Session.self) private var session
    @State private var query = ""
    @State private var results: [SeerrItem] = []
    @State private var mine: [RequestEntry] = []
    @State private var reviewing: RequestEntry?
    @State private var reviewNote: String?
    @State private var quota: String?
    @State private var loading = true
    @State private var searching = false

    var body: some View {
        ScrollView {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.accent)
                TextField("Film ou série à demander…", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                if !query.isEmpty {
                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted) }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .glassEffect(.regular.interactive(), in: Capsule())
            .padding(.horizontal, 20)
            .padding(.vertical, 8)

            if !query.isEmpty {
                if searching { LoadingView() }
                SeerrGrid(items: results)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        SectionTitle("Mes demandes")
                        Spacer()
                        if let quota { Text(quota).font(.caption).foregroundStyle(Theme.muted) }
                    }
                    .padding(.horizontal, 20)
                    if loading { LoadingView() }
                    if let reviewNote { Text(reviewNote).font(.footnote).foregroundStyle(Theme.accent).padding(.horizontal, 20) }
                    if !loading && mine.isEmpty {
                        MessageView(icon: "tray", text: "Aucune demande pour le moment. Cherchez un titre ci-dessus.")
                    }
                    LazyVStack(spacing: 12) {
                        ForEach(mine) { entry in
                            HStack(spacing: 14) {
                                RemoteImage(url: entry.poster)
                                    .frame(width: 54, height: 81)
                                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(entry.title).font(.headline).lineLimit(2)
                                    Text(entry.label).font(.caption.weight(.semibold)).foregroundStyle(entry.label == "Disponible" ? Theme.accent : .orange)
                                    if session.isAdmin, let requester = entry.requester {
                                        Text(requester).font(.caption2).foregroundStyle(Theme.muted)
                                    }
                                }
                                Spacer()
                                // Demande d'un utilisateur à valider : destination choisie (catégorie détectée proposée).
                                if session.isAdmin, entry.pending, entry.requestId != nil, entry.tmdbId != nil {
                                    Button { reviewing = entry } label: {
                                        Image(systemName: "checkmark.seal.fill").padding(12)
                                    }
                                    .glassEffect(.regular.interactive(), in: Circle())
                                    .accessibilityLabel("Valider la demande")
                                }
                                if session.isAdmin, let tmdb = entry.tmdbId, entry.label != "Disponible" {
                                    NavigationLink {
                                        ReleaseSearchHub(mediaType: entry.mediaType, tmdbId: tmdb, title: entry.title, year: entry.year, serviceId: entry.serviceId)
                                    } label: {
                                        Image(systemName: "magnifyingglass").padding(12)
                                    }
                                    .glassEffect(.regular.interactive(), in: Circle())
                                    .accessibilityLabel("Recherche interactive")
                                }
                                if let id = entry.jellyfinId {
                                    NavigationLink(value: ItemRoute(id: id)) {
                                        Image(systemName: "play.fill").padding(12)
                                    }
                                    .glassEffect(.regular.interactive(), in: Circle())
                                }
                            }
                            .padding(12)
                            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
        .task { await loadMine() }
        .refreshable { await loadMine() }
        .sheet(item: $reviewing) { entry in
            NavigationStack {
                RequestDestinationView(mediaType: entry.mediaType, mediaId: entry.tmdbId ?? 0, title: entry.title, confirm: "Approuver", requester: entry.requester,
                                       onDecline: { Task { await review(entry, approve: false, destination: nil) } }) { destination in
                    Task { await review(entry, approve: true, destination: destination) }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .task(id: query) {
            let term = query.trimmingCharacters(in: .whitespaces)
            guard term.count >= 2 else { results = []; return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            searching = true
            let json = try? await session.noctraJSON("/api/jellyseerr/search?q=" + (term.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? term)) as? [String: Any]
            guard !Task.isCancelled else { return }
            withAnimation(Theme.spring) { results = ((json?["results"] as? [[String: Any]]) ?? []).compactMap(SeerrItem.init) }
            searching = false
        }
    }

    /// Validation (avec destination) ou refus d'une demande d'utilisateur.
    private func review(_ entry: RequestEntry, approve: Bool, destination: RequestDestination?) async {
        reviewing = nil
        guard let id = entry.requestId else { return }
        do {
            _ = try await session.noctraSend("POST", "/api/jellyseerr/request/\(id)/\(approve ? "approve" : "decline")", json: destination?.json ?? [String: Any](), timeout: 60)
            reviewNote = approve ? "« \(entry.title) » approuvée." : "« \(entry.title) » refusée."
        } catch {
            reviewNote = error.localizedDescription
        }
        await loadMine()
    }

    private func loadMine() async {
        defer { loading = false }
        guard let json = try? await session.noctraJSON("/api/jellyseerr/requests") as? [String: Any] else { return }
        let labels = [1: "En attente", 2: "Approuvée", 3: "Refusée"]
        mine = ((json["results"] as? [[String: Any]]) ?? []).prefix(60).enumerated().map { index, request -> RequestEntry in
            let media = (request["media"] as? [String: Any]) ?? [:]
            let available = (media["status"] as? Int) == 5
            let title = (request["displayTitle"] as? String) ?? (media["title"] as? String) ?? (media["name"] as? String) ?? "Demande"
            let poster = (request["posterPath"] as? String).flatMap { URL(string: "https://image.tmdb.org/t/p/w185" + $0) }
            let label = available ? "Disponible" : (labels[(request["status"] as? Int) ?? 0] ?? "Enregistrée")
            let type = (request["mediaType"] as? String) == "tv" ? "tv" : "movie"
            let tmdb = (media["tmdbId"] as? Int) ?? (media["tmdbId"] as? String).flatMap { Int($0) }
            let date = (request["releaseDate"] as? String) ?? ""
            let service = (request["resolvedServiceId"] as? Int) ?? (media["externalServiceId"] as? Int)
            let requester = (request["requestedBy"] as? [String: Any]).flatMap { ($0["displayName"] as? String) ?? ($0["username"] as? String) ?? ($0["jellyfinUsername"] as? String) }
            return RequestEntry(id: (request["id"] as? Int) ?? -(index + 1), title: title, poster: poster, label: label, jellyfinId: media["jellyfinMediaId"] as? String,
                                mediaType: type, tmdbId: tmdb, year: date.count >= 4 ? String(date.prefix(4)) : nil, serviceId: service,
                                requestId: request["id"] as? Int, pending: !available && (request["status"] as? Int) == 1, requester: requester)
        }
        if let quota = json["quota"] as? [String: Any], (quota["enforced"] as? Bool) == true, let remaining = quota["remaining"] as? Int {
            self.quota = "\(remaining) demande\(remaining > 1 ? "s" : "") possible\(remaining > 1 ? "s" : "")"
        }
    }
}

/// Roulette : rouleau d'affiches qui ralentit sur le titre tiré, puis révélation.
struct RouletteView: View {
    @Environment(Session.self) private var session
    @AppStorage("noctra.roulette.library") private var library = ""
    @AppStorage("noctra.roulette.genre") private var genre = ""
    @AppStorage("noctra.roulette.rating") private var rating = 0
    @AppStorage("noctra.roulette.unplayed") private var unplayed = true
    @State private var libraries: [(id: String, name: String)] = []
    @State private var genres: [String] = []
    @State private var pool: [[String: Any]] = []
    @State private var winner: [String: Any]?
    @State private var rolling = false
    @State private var offset: CGFloat = 0
    @State private var revealed = false
    @State private var ticks = 0
    @State private var message: String?

    private let cardWidth: CGFloat = 120
    private let spacing: CGFloat = 12
    private let landing = 26

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                settings
                stage
                Button {
                    Task { await draw() }
                } label: {
                    Label(rolling ? "La roulette tourne…" : "Lancer la roulette", systemImage: "dice.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .auroraPrimary()
                .controlSize(.large)
                .disabled(rolling)
                .padding(.horizontal, 20)
            }
            .padding(.vertical, 10)
        }
        .sensoryFeedback(.selection, trigger: ticks)
        .sensoryFeedback(.success, trigger: revealed)
        .task { await loadOptions() }
    }

    private var settings: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Menu {
                    Picker("Médiathèque", selection: $library) {
                        Text("Toutes").tag("")
                        ForEach(libraries, id: \.id) { Text($0.name).tag($0.id) }
                    }
                } label: {
                    Label(libraries.first { $0.id == library }?.name ?? "Médiathèques", systemImage: "square.stack.fill")
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
                Menu {
                    Picker("Genre", selection: $genre) {
                        Text("Tous les genres").tag("")
                        ForEach(genres, id: \.self) { Text($0).tag($0) }
                    }
                } label: {
                    Label(genre.isEmpty ? "Genres" : genre, systemImage: "tag.fill")
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
            }
            HStack(spacing: 10) {
                Picker("Note", selection: $rating) {
                    Text("Toutes").tag(0)
                    Text("6+").tag(6)
                    Text("7+").tag(7)
                    Text("8+").tag(8)
                }
                .pickerStyle(.segmented)
                Toggle("Non vus", isOn: $unplayed)
                    .toggleStyle(.button)
                    .buttonStyle(.glass)
            }
        }
        .padding(.horizontal, 20)
        .onChange(of: library) {
            genre = ""
            Task { await loadGenres() }
        }
    }

    @ViewBuilder
    private var stage: some View {
        if let winner, revealed {
            let id = winner["id"] as? String ?? ""
            VStack(spacing: 14) {
                RemoteImage(url: session.image(id, width: 500))
                    .frame(width: 200, height: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .auroraRing(cornerRadius: 24, orbit: false)
                Text(winner["title"] as? String ?? "").font(.display(28, .bold)).kerning(-0.8).foregroundStyle(Theme.posterTitleGradient).multilineTextAlignment(.center)
                Text([(winner["year"] as? Int).map { String($0) }, (winner["rating"] as? Double).map { String(format: "★ %.1f", $0) }].compactMap { $0 }.joined(separator: " · "))
                    .foregroundStyle(Theme.muted)
                if let overview = winner["overview"] as? String, !overview.isEmpty {
                    Text(overview).font(.callout).foregroundStyle(.white.opacity(0.8)).lineLimit(5).multilineTextAlignment(.center)
                }
                NavigationLink(value: ItemRoute(id: id)) {
                    Label("Voir la fiche", systemImage: "play.fill").padding(.horizontal, 10).padding(.vertical, 6)
                }
                .auroraPrimary()
            }
            .padding(.horizontal, 24)
            .transition(.scale(scale: 0.6).combined(with: .opacity))
        } else if !pool.isEmpty {
            GeometryReader { proxy in
                HStack(spacing: spacing) {
                    ForEach(0..<(landing + 4), id: \.self) { index in
                        let pick = index == landing ? (winner ?? pool[0]) : pool[(index * 7 + 3) % pool.count]
                        RemoteImage(url: session.image(pick["id"] as? String, width: 300))
                            .frame(width: cardWidth, height: cardWidth * 1.5)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                }
                .offset(x: proxy.size.width / 2 - cardWidth / 2 + offset)
            }
            .frame(height: cardWidth * 1.5)
            .overlay {
                Capsule().fill(Theme.accent).frame(width: 4).shadow(color: Theme.accent, radius: 10)
            }
            .clipped()
        } else {
            VStack(spacing: 12) {
                Image(systemName: "dice")
                    .font(.system(size: 64, weight: .semibold))
                    .foregroundStyle(Theme.gradient)
                    .symbolEffect(.wiggle, options: .repeat(.periodic(delay: 2)))
                Text("Prêt pour le tirage ?").font(.display(24, .bold)).foregroundStyle(Theme.titleGradient)
                Text(message ?? "Réglez vos envies puis lancez la roulette.").foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            }
            .padding(.vertical, 40)
        }
    }

    private func loadOptions() async {
        if let json = try? await session.noctraJSON("/api/libraries") as? [String: Any] {
            libraries = json.compactMap { label, value -> (id: String, name: String)? in
                guard let entry = value as? [String: Any], let id = entry["id"] as? String else { return nil }
                return (id, label)
            }.sorted { $0.name < $1.name }
        }
        await loadGenres()
    }

    private func loadGenres() async {
        let list = try? await session.get(ItemsResponse.self, "/Genres", [
            "userId": session.userId, "parentId": library.isEmpty ? nil : library, "includeItemTypes": "Movie,Series",
            "recursive": "true", "sortBy": "SortName", "enableTotalRecordCount": "false"
        ])
        genres = (list?.items ?? []).compactMap(\.name)
    }

    private func draw() async {
        rolling = true
        revealed = false
        winner = nil
        message = nil
        var query = "count=10&rating=\(rating)" + (unplayed ? "&unplayed=1" : "")
        if !library.isEmpty { query += "&library=" + library }
        if !genre.isEmpty { query += "&genre=" + (genre.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? genre) }
        guard let json = try? await session.noctraJSON("/api/roulette?" + query) as? [String: Any],
              let results = json["results"] as? [[String: Any]], !results.isEmpty else {
            rolling = false
            pool = []
            message = "Aucun titre ne correspond à ces réglages" + (genre.isEmpty ? "." : " (genre « \(genre) »).")
            return
        }
        pool = results
        winner = results[0]
        offset = 0
        // Rouleau : départ rapide, ralentissement progressif sur le titre tiré.
        try? await Task.sleep(for: .milliseconds(80))
        let step = cardWidth + spacing
        withAnimation(.timingCurve(0.08, 0.7, 0.12, 1, duration: 3.6)) { offset = -CGFloat(landing) * step }
        for index in 0..<18 {
            try? await Task.sleep(for: .milliseconds(60 + index * index * 2))
            ticks += 1
        }
        try? await Task.sleep(for: .milliseconds(700))
        withAnimation(.spring(response: 0.55, dampingFraction: 0.7)) { revealed = true }
        rolling = false
    }
}

// MARK: Destination d'une demande (administrateurs)

/// Serveur Radarr/Sonarr, dossier et profil qualité d'une demande.
struct RequestDestination {
    let serverId: Int
    let profileId: Int
    let rootFolder: String
    let manual: Bool

    var json: [String: Any] {
        ["serverId": serverId, "profileId": profileId, "rootFolder": rootFolder, "selectionMode": manual ? "manual" : "auto"]
    }
}

/// Choix du dossier de destination : la catégorie détectée par le serveur (animés,
/// séries, films d'animation, films) est proposée d'abord.
struct RequestDestinationView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let mediaType: String
    let mediaId: Int
    let title: String
    let confirm: String
    var requester: String?
    var onDecline: (() -> Void)?
    let onConfirm: (RequestDestination) -> Void
    @State private var servers: [[String: Any]] = []
    @State private var serverId = -1
    @State private var rootFolder = ""
    @State private var profileId = 0
    @State private var category: String?
    @State private var loading = true
    @State private var failed: String?

    private var server: [String: Any]? { servers.first { $0["id"] as? Int == serverId } }
    private var folders: [String] { (server?["rootFolders"] as? [[String: Any]] ?? []).compactMap { $0["path"] as? String } }
    private var profiles: [(Int, String)] { (server?["profiles"] as? [[String: Any]] ?? []).compactMap { entry in (entry["id"] as? Int).map { ($0, entry["name"] as? String ?? "Profil \($0)") } } }

    var body: some View {
        List {
            Section {
                Text(title).font(.headline)
                if let requester { Text("Demandé par \(requester)").font(.caption).foregroundStyle(Theme.muted) }
                if let category { Label("Catégorie détectée : \(category)", systemImage: "sparkles").font(.footnote).foregroundStyle(Theme.accent) }
                if loading { ProgressView() }
                if let failed { Text(failed).foregroundStyle(.orange) }
            }
            if !servers.isEmpty {
                Section("Destination") {
                    if servers.count > 1 {
                        Picker("Serveur", selection: $serverId) {
                            ForEach(servers.indices, id: \.self) { index in
                                Text(servers[index]["name"] as? String ?? "Serveur").tag(servers[index]["id"] as? Int ?? -1)
                            }
                        }
                    }
                    Picker("Dossier", selection: $rootFolder) {
                        ForEach(folders, id: \.self) { path in
                            Text(path.split(separator: "/").last.map(String.init) ?? path).tag(path)
                        }
                    }
                    Text(rootFolder).font(.system(.caption2, design: .monospaced)).foregroundStyle(Theme.muted)
                    if profiles.count > 1 {
                        Picker("Qualité", selection: $profileId) {
                            ForEach(profiles.indices, id: \.self) { index in Text(profiles[index].1).tag(profiles[index].0) }
                        }
                    }
                }
                Section {
                    Button {
                        onConfirm(RequestDestination(serverId: serverId, profileId: profileId, rootFolder: rootFolder, manual: server?["preventSearch"] as? Bool == true))
                    } label: {
                        Label(confirm, systemImage: "checkmark.circle.fill").frame(maxWidth: .infinity)
                    }
                    .disabled(rootFolder.isEmpty)
                    if let onDecline {
                        Button(role: .destructive) { onDecline() } label: { Label("Refuser la demande", systemImage: "xmark.circle").frame(maxWidth: .infinity) }
                    }
                }
            }
        }
        .navigationTitle(mediaType == "tv" ? "Destination de la série" : "Destination du film")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } } }
        .onChange(of: serverId) { _, _ in
            if !folders.contains(rootFolder) { rootFolder = server?["defaultRootFolder"] as? String ?? folders.first ?? "" }
            if !profiles.contains(where: { $0.0 == profileId }) { profileId = server?["defaultProfileId"] as? Int ?? profiles.first?.0 ?? 0 }
        }
        .task { await load() }
    }

    private func load() async {
        defer { loading = false }
        do {
            let json = try await session.noctraJSON("/api/jellyseerr/destinations?mediaType=\(mediaType)&mediaId=\(mediaId)", timeout: 30) as? [String: Any]
            servers = json?["servers"] as? [[String: Any]] ?? []
            let suggested = json?["suggested"] as? [String: Any]
            category = suggested?["label"] as? String
            let fallback = servers.first { $0["isDefault"] as? Bool == true } ?? servers.first
            serverId = suggested?["serverId"] as? Int ?? fallback?["id"] as? Int ?? -1
            rootFolder = suggested?["rootFolder"] as? String ?? server?["defaultRootFolder"] as? String ?? folders.first ?? ""
            profileId = suggested?["profileId"] as? Int ?? server?["defaultProfileId"] as? Int ?? profiles.first?.0 ?? 0
            if servers.isEmpty { failed = "Aucune destination \(mediaType == "tv" ? "Sonarr" : "Radarr") disponible dans Jellyseerr." }
        } catch {
            failed = error.localizedDescription
        }
    }
}
