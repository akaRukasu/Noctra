import SwiftUI

/// Médiathèque mise en avant sur l'accueil (catalogue du serveur Noctra).
struct HomeLibrary: Identifiable, Hashable {
    let id: String
    let name: String
    let type: String?
    let count: Int?
    let image: URL?
}

/// Accueil, comme Noctra TV : « À l'affiche chez vous », carrousel « Continuer
/// à regarder », médiathèques en 2 × 2, « À suivre » et les derniers ajouts.
struct HomeView: View {
    @Environment(Session.self) private var session
    @State private var hero: [BaseItem] = []
    @State private var heroIsResume = true
    @State private var resume: [BaseItem] = []
    @State private var nextUp: [BaseItem] = []
    @State private var libraries: [HomeLibrary] = []
    @State private var latest: [(library: BaseItem, items: [BaseItem])] = []
    @State private var loading = true
    @State private var failure: String?
    @State private var showSync = false
    private var sync: SyncPlayManager { .shared }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 26) {
                heading
                if !hero.isEmpty {
                    HeroCarousel(items: hero, resume: heroIsResume)
                } else if loading {
                    RoundedRectangle(cornerRadius: 30, style: .continuous)
                        .fill(Theme.surface)
                        .frame(height: 390)
                        .overlay { ProgressView() }
                        .padding(.horizontal, 16)
                } else if let failure {
                    MessageView(icon: "wifi.exclamationmark", text: failure) { Task { await load() } }
                    if !OfflineStore.shared.downloaded.isEmpty {
                        NavigationLink(value: OfflineRoute()) {
                            Label("Regarder mes téléchargements", systemImage: "arrow.down.circle.fill")
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                        }
                        .auroraPrimary()
                        .frame(maxWidth: .infinity)
                    }
                }
                if !heroIsResume { ItemRow(title: "Reprendre", items: resume, wide: true) }
                ForEach(latest, id: \.library.id) { entry in
                    ItemRow(title: "Derniers ajouts · \(entry.library.title)", items: entry.items)
                }
                // « À suivre » et les médiathèques ferment l'accueil.
                ItemRow(title: "À suivre", items: nextUp, wide: true)
                if !libraries.isEmpty { libraryBlock }
            }
            .padding(.bottom, 30)
        }
        .background(AuroraBackground())
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    showSync = true
                } label: {
                    Label(sync.group.map { "SyncPlay · \($0.participants.count)" } ?? "SyncPlay", systemImage: "person.2.fill")
                        .labelStyle(.titleAndIcon)
                        .font(.subheadline.weight(.semibold))
                }
                .tint(sync.group == nil ? Color.white : Theme.accent)
            }
            ToolbarItem(placement: .topBarTrailing) { AccountButton() }
        }
        .sheet(isPresented: $showSync) { SyncPlaySheet().presentationDetents([.medium, .large]) }
        .refreshable { await load() }
        .task { if hero.isEmpty { await load() } }
        .onReceive(NotificationCenter.default.publisher(for: .noctraPlaybackEnded)) { _ in
            Task { await load() }
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Même en-tête que l'accueil du site : œil en dégradé, titre Sora en dégradé.
            Text("VOTRE SALLE DE CINÉMA")
                .font(.caption.weight(.bold))
                .tracking(2.6)
                .foregroundStyle(Theme.gradient)
            Text("\(Text("À l’affiche chez vous").foregroundStyle(Theme.titleGradient))\(Text(".").foregroundStyle(Theme.gradient))")
                .font(.display(34, .bold, relativeTo: .largeTitle))
                .kerning(-1.4)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            Text("Votre collection. À votre rythme.")
                .font(.subheadline)
                .foregroundStyle(Color(hex: 0xB8B5D6))
        }
        .padding(.horizontal, 20)
        .padding(.top, 6)
    }

    private var libraryBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Médiathèques")
                .padding(.horizontal, 20)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(libraries.prefix(4)) { library in
                    NavigationLink(value: LibraryRoute(id: library.id, name: library.name, collectionType: library.type)) {
                        // Comme sur le site : l'image de la médiathèque (son nom y est déjà
                        // dessiné), puis le nom et le nombre de titres sous la tuile.
                        VStack(alignment: .leading, spacing: 6) {
                            RemoteImage(url: library.image ?? session.image(library.id, width: 600))
                                .aspectRatio(16 / 9, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                                .auroraCard(cornerRadius: 20)
                            HStack(spacing: 6) {
                                Text(library.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                                if let count = library.count {
                                    Text("\(count)").font(.caption).foregroundStyle(Theme.muted)
                                }
                            }
                            .padding(.horizontal, 4)
                        }
                        .foregroundStyle(Color(hex: 0xF3F0FF))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressableStyle(scale: 0.96))
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        let card = Fields.card
        async let resumeTask = loadResume()
        async let nextTask = try? session.get(ItemsResponse.self, "/Shows/NextUp",
                                              ["userId": session.userId, "limit": "20", "fields": card, "enableResumable": "false"])
        async let newestTask = try? session.get([BaseItem].self, paths: ["/Items/Latest", "/Users/{userId}/Items/Latest"],
                                                ["userId": session.userId, "limit": "12", "includeItemTypes": "Movie,Series", "fields": "Overview,Genres,ProductionYear,OfficialRating", "enableImageTypes": "Backdrop,Logo,Primary"])
        async let viewsTask = try? session.get(ItemsResponse.self, paths: ["/UserViews", "/Users/{userId}/Views"], ["userId": session.userId])
        async let catalogTask = loadLibraries()

        let (resumed, next, newest, views, catalog) = await (resumeTask, nextTask, newestTask, viewsTask, catalogTask)
        resume = resumed
        nextUp = next?.items ?? []
        // Carrousel : « Continuer à regarder » ; sans reprise, les nouveautés.
        withAnimation(Theme.spring) {
            if !resumed.isEmpty {
                hero = Array(resumed.prefix(10))
                heroIsResume = true
            } else {
                hero = Array((newest ?? []).filter { $0.backdropImageTags?.isEmpty == false }.prefix(8))
                heroIsResume = false
            }
        }
        let viewItems = views?.items ?? []
        libraries = catalog.isEmpty
            ? viewItems.filter { ["movies", "tvshows"].contains($0.collectionType ?? "") }.prefix(4).map {
                HomeLibrary(id: $0.id, name: $0.title, type: $0.collectionType, count: nil, image: session.image($0.id, tag: $0.imageTags?["Primary"], width: 600))
            }
            : catalog

        var rows: [(library: BaseItem, items: [BaseItem])] = []
        let media = viewItems.filter { ["movies", "tvshows"].contains($0.collectionType ?? "") }.prefix(6)
        await withTaskGroup(of: (Int, [BaseItem]).self) { group in
            for (index, library) in media.enumerated() {
                group.addTask { @MainActor in
                    let items = try? await session.get([BaseItem].self, paths: ["/Items/Latest", "/Users/{userId}/Items/Latest"],
                                                        ["userId": session.userId, "parentId": library.id, "limit": "18", "fields": card])
                    return (index, items ?? [])
                }
            }
            var found: [Int: [BaseItem]] = [:]
            for await (index, items) in group { found[index] = items }
            for (index, library) in media.enumerated() {
                if let items = found[index], !items.isEmpty { rows.append((library, items)) }
            }
        }
        latest = rows
        failure = (views == nil && newest == nil) ? NoctraError.unreachable.localizedDescription : nil
    }

    /// Reprises vues par Noctra (titres vraiment commencés), sinon par Jellyfin.
    private func loadResume() async -> [BaseItem] {
        if let json = try? await session.noctraJSON("/api/home/resume", timeout: 20) as? [String: Any],
           let raw = json["items"], let data = try? JSONSerialization.data(withJSONObject: raw),
           let items = try? JSONDecoder.jellyfin.decode([BaseItem].self, from: data), !items.isEmpty {
            return items
        }
        let list = try? await session.get(ItemsResponse.self, paths: ["/UserItems/Resume", "/Users/{userId}/Items/Resume"],
                                          ["userId": session.userId, "limit": "20", "mediaTypes": "Video", "fields": Fields.card, "enableImageTypes": "Primary,Backdrop,Thumb"])
        return list?.items ?? []
    }

    private func loadLibraries() async -> [HomeLibrary] {
        guard session.hasNoctra, let json = try? await session.noctraJSON("/api/libraries", timeout: 20) as? [String: Any] else { return [] }
        return json.compactMap { label, value -> HomeLibrary? in
            guard let entry = value as? [String: Any], let id = entry["id"] as? String else { return nil }
            let image = (entry["image"] as? String).flatMap { session.noctraURL($0) }
            return HomeLibrary(id: id, name: label, type: entry["type"] as? String, count: entry["count"] as? Int, image: image)
        }.sorted { ($0.count ?? 0) > ($1.count ?? 0) }
    }
}

/// Carrousel : pages magnétiques. Chaque carte montre l'image entière en 16:9
/// (rien n'est rogné), les informations dessous sur un fond tiré de la même
/// image, et une légère profondeur de l'image pendant le glissement.
struct HeroCarousel: View {
    @Environment(Session.self) private var session
    let items: [BaseItem]
    var resume = false
    @State private var current: String?
    @State private var starting: String?
    @State private var width: CGFloat = 390

    private var cardWidth: CGFloat { min(width - 32, 760) }
    private var imageHeight: CGFloat { cardWidth * 9 / 16 }
    private var cardHeight: CGFloat { imageHeight + 188 }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(items) { item in
                        NavigationLink(value: item) {
                            page(item)
                        }
                        .buttonStyle(PressableStyle(scale: 0.97))
                        .containerRelativeFrame(.horizontal)
                        .id(item.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollIndicators(.hidden)
            // Le halo des cartes déborde du carrousel sans être coupé net.
            .scrollClipDisabled()
            .scrollPosition(id: $current)
            .frame(height: cardHeight + 36)

            HStack(spacing: 7) {
                ForEach(items) { item in
                    Capsule()
                        .fill(item.id == (current ?? items.first?.id) ? Theme.accent : .white.opacity(0.3))
                        .frame(width: item.id == (current ?? items.first?.id) ? 20 : 7, height: 7)
                }
            }
            .animation(Theme.spring, value: current)
            .frame(maxWidth: .infinity)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .sensoryFeedback(.selection, trigger: current)
    }

    private func artwork(_ item: BaseItem) -> URL? {
        item.type == "Episode" ? session.thumb(item, width: 1280) : session.backdrop(item, width: 1280)
    }

    private func page(_ item: BaseItem) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image entière ; elle glisse un peu moins vite que la carte.
            Color.clear
                .frame(height: imageHeight)
                .overlay {
                    RemoteImage(url: artwork(item))
                        .padding(.horizontal, -18)
                        .scrollTransition(axis: .horizontal) { content, phase in
                            content.offset(x: phase.value * -18)
                        }
                }
                .clipped()
                .overlay(alignment: .bottom) {
                    LinearGradient(colors: [.clear, Color(hex: 0x0C0F1F).opacity(0.9)], startPoint: .top, endPoint: .bottom)
                        .frame(height: 56)
                }
            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(text: resume ? "CONTINUER À REGARDER" : "À L’AFFICHE")
                    .padding(.top, -20)
                if let logo = session.logo(item) {
                    RemoteImage(url: logo, contentMode: .fit, alignment: .leading)
                        .frame(maxWidth: 220, maxHeight: 46, alignment: .leading)
                } else {
                    Text(item.type == "Episode" ? (item.seriesName ?? item.title) : item.title)
                        .font(.display(25, .bold, relativeTo: .title2))
                        .kerning(-0.7)
                        .foregroundStyle(Theme.posterTitleGradient)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                Text(resume ? [item.episodeLabel, item.type == "Episode" ? item.name : nil, remaining(item)].compactMap { $0 }.joined(separator: " · ")
                     : [item.productionYear.map { String($0) }, item.genres?.prefix(2).joined(separator: " · ")].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.8))
                    .lineLimit(1)
                HStack(spacing: 14) {
                    Button {
                        Task { await play(item) }
                    } label: {
                        HStack(spacing: 8) {
                            if starting == item.id { ProgressView() } else { Image(systemName: item.isSeries ? "info.circle.fill" : "play.fill") }
                            Text(resume ? "Reprendre" : item.isSeries ? "Voir" : "Lecture")
                        }
                    }
                    .auroraPrimary()
                    .disabled(item.isSeries && !resume)
                    if resume, let progress = item.progress {
                        ProgressLine(value: progress)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(.white)
        .frame(width: cardWidth, height: cardHeight)
        .background {
            // Fond des informations : la même image, floutée et assombrie.
            ZStack {
                Color(hex: 0x0C0F1F)
                RemoteImage(url: artwork(item))
                    .scaleEffect(x: 1, y: -1)
                    .blur(radius: 28)
                    .opacity(0.55)
                LinearGradient(colors: [Color(hex: 0x0C0F1F).opacity(0.35), Color(hex: 0x0C0F1F).opacity(0.85)], startPoint: .top, endPoint: .bottom)
            }
            .drawingGroup()
        }
        // Lueur tournante seulement sur la page visible du carrousel.
        .auroraRing(cornerRadius: 30, orbit: item.id == (current ?? items.first?.id))
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity)
    }

    private func remaining(_ item: BaseItem) -> String? {
        guard let ticks = item.runTimeTicks, ticks > 0 else { return nil }
        let left = max(0, Double(ticks) / 10_000_000 - item.resumeSeconds)
        let minutes = Int(left / 60)
        return minutes >= 60 ? "Reste \(minutes / 60) h \(String(format: "%02d", minutes % 60))" : "Reste \(minutes) min"
    }

    private func play(_ item: BaseItem) async {
        guard !item.isSeries, starting == nil else { return }
        starting = item.id
        defer { starting = nil }
        try? await PlaybackManager.shared.play(item, session: session, audioIndex: nil, subtitleIndex: nil, startSeconds: item.resumeSeconds)
    }
}
