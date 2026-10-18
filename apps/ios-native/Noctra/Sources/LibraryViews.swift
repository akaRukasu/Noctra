import SwiftUI

/// Médiathèques : grandes tuiles avec l'image de chaque bibliothèque.
struct LibrariesView: View {
    @Environment(Session.self) private var session
    @State private var libraries: [BaseItem] = []
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        ScrollView {
            offlineTile
                .padding(.horizontal, 20)
                .padding(.top, 8)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 16)], spacing: 16) {
                ForEach(libraries) { library in
                    NavigationLink(value: LibraryRoute(id: library.id, name: library.title, collectionType: library.collectionType)) {
                        ZStack(alignment: .bottomLeading) {
                            RemoteImage(url: session.image(library.id, tag: library.imageTags?["Primary"], width: 900))
                                .frame(height: 170)
                                .clipped()
                            LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .center, endPoint: .bottom)
                            HStack {
                                Image(systemName: icon(library.collectionType))
                                Text(library.title).font(.title3.weight(.bold))
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .glassEffect(.regular, in: Capsule())
                            .padding(14)
                        }
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                    }
                    .buttonStyle(PressableStyle(scale: 0.97))
                }
            }
            .padding(20)
            if loading && libraries.isEmpty { LoadingView() }
            if failed && libraries.isEmpty {
                MessageView(icon: "wifi.exclamationmark", text: NoctraError.unreachable.localizedDescription) { Task { await load() } }
            }
        }
        .background(AuroraBackground())
        .navigationTitle("Médiathèques")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { AccountButton() } }
        .refreshable { await load() }
        .task { if libraries.isEmpty { await load() } }
    }

    /// « Sur cet iPhone » : titres téléchargés, lisibles sans connexion.
    private var offlineTile: some View {
        let store = OfflineStore.shared
        let count = store.downloaded.count
        let running = store.active.filter { $0.state == .downloading || $0.state == .queued }.count
        return NavigationLink(value: OfflineRoute()) {
            HStack(spacing: 14) {
                Image(systemName: "arrow.down.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Theme.gradient)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Sur cet iPhone").font(.headline)
                    Text(count == 0 && running == 0 ? "Films et épisodes à regarder hors ligne"
                         : [count > 0 ? "\(count) titre\(count > 1 ? "s" : "") · \(AdminFormat.bytes(Double(store.usedBytes)))" : nil,
                            running > 0 ? "\(running) en cours" : nil].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .auroraPanel(cornerRadius: 22)
        }
        .buttonStyle(PressableStyle(scale: 0.98))
        .foregroundStyle(.white)
    }

    private func icon(_ type: String?) -> String {
        switch type {
        case "movies": return "film.fill"
        case "tvshows": return "tv.fill"
        case "music": return "music.note"
        case "boxsets": return "square.stack.3d.up.fill"
        default: return "folder.fill"
        }
    }

    private func load() async {
        loading = true
        let views = try? await session.get(ItemsResponse.self, paths: ["/UserViews", "/Users/{userId}/Views"], ["userId": session.userId])
        withAnimation(Theme.spring) {
            libraries = (views?.items ?? []).filter { !["livetv", "playlists"].contains($0.collectionType ?? "") }
        }
        failed = views == nil
        loading = false
    }
}

/// Grille d'une médiathèque : chargement progressif, tri.
struct LibraryGridView: View {
    @Environment(Session.self) private var session
    let library: LibraryRoute
    @State private var items: [BaseItem] = []
    @State private var total = Int.max
    @State private var loading = false
    @State private var sort: Sort = .added

    enum Sort: String, CaseIterable, Identifiable {
        case added, name, year, rating
        var id: String { rawValue }
        var label: String {
            switch self {
            case .added: return "Ajout récent"
            case .name: return "Titre"
            case .year: return "Année"
            case .rating: return "Note"
            }
        }
        var query: (String, String) {
            switch self {
            case .added: return ("DateCreated,SortName", "Descending")
            case .name: return ("SortName", "Ascending")
            case .year: return ("ProductionYear,SortName", "Descending")
            case .rating: return ("CommunityRating,SortName", "Descending")
            }
        }
    }

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 108, maximum: 160), spacing: 14, alignment: .top)], spacing: 18) {
                ForEach(items) { item in
                    PosterCard(item: item, width: 108)
                        .onAppear { if item.id == items.last?.id { Task { await loadMore() } } }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            if loading { LoadingView() }
        }
        .background(AuroraBackground())
        .navigationTitle(library.name)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Trier par", selection: $sort) {
                        ForEach(Sort.allCases) { Text($0.label).tag($0) }
                    }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                }
            }
        }
        .onChange(of: sort) {
            items = []
            total = Int.max
            Task { await loadMore() }
        }
        .task { if items.isEmpty { await loadMore() } }
    }

    private func loadMore() async {
        guard !loading, items.count < total else { return }
        loading = true
        defer { loading = false }
        let types: String? = library.collectionType == "movies" ? "Movie" : library.collectionType == "tvshows" ? "Series" : nil
        let (sortBy, order) = sort.query
        let first = items.isEmpty
        let page = try? await session.get(ItemsResponse.self, paths: ["/Items", "/Users/{userId}/Items"], [
            "userId": session.userId, "parentId": library.id, "recursive": types == nil ? nil : "true",
            "includeItemTypes": types, "sortBy": sortBy, "sortOrder": order, "fields": Fields.card,
            "startIndex": String(items.count), "limit": "60", "enableTotalRecordCount": "true"
        ])
        guard let page else { total = items.count; return }
        let fresh = page.items ?? []
        // Pages suivantes ajoutées sans animation : le défilement ne saute pas.
        if first { withAnimation(Theme.spring) { items = fresh } } else { items.append(contentsOf: fresh) }
        total = fresh.isEmpty ? items.count : (page.totalRecordCount ?? Int.max)
    }
}

/// Recherche (onglet de recherche d'iOS 26, en bas de l'écran).
struct SearchView: View {
    @Environment(Session.self) private var session
    @State private var query = ""
    @State private var results: [BaseItem] = []
    @State private var searching = false

    var body: some View {
        ScrollView {
            if query.isEmpty {
                MessageView(icon: "magnifyingglass", text: "Films, séries, épisodes…")
            } else if results.isEmpty && !searching {
                MessageView(icon: "questionmark.circle", text: "Aucun résultat pour « \(query) ».")
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 108, maximum: 160), spacing: 14, alignment: .top)], spacing: 18) {
                ForEach(results) { item in
                    PosterCard(item: item, width: 108)
                }
            }
            .padding(.horizontal, 16)
        }
        .background(AuroraBackground())
        .navigationTitle("Recherche")
        .searchable(text: $query, prompt: "Rechercher dans Noctra")
        .task(id: query) {
            let term = query.trimmingCharacters(in: .whitespaces)
            guard term.count >= 2 else { results = []; return }
            // Saisie en cours : on attend une courte pause avant d'interroger le serveur.
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            searching = true
            let found = try? await session.get(ItemsResponse.self, paths: ["/Items", "/Users/{userId}/Items"], [
                "userId": session.userId, "searchTerm": term, "recursive": "true", "limit": "60",
                "includeItemTypes": "Movie,Series,Episode", "fields": Fields.card
            ])
            guard !Task.isCancelled else { return }
            withAnimation(Theme.spring) { results = found?.items ?? [] }
            searching = false
        }
    }
}
