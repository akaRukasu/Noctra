import SwiftUI

/// Accueil : carrousel des nouveautés, reprises, « À suivre » et derniers ajouts.
struct HomeView: View {
    @Environment(Session.self) private var session
    @State private var hero: [BaseItem] = []
    @State private var resume: [BaseItem] = []
    @State private var nextUp: [BaseItem] = []
    @State private var latest: [(library: BaseItem, items: [BaseItem])] = []
    @State private var loading = true
    @State private var failure: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28) {
                if !hero.isEmpty {
                    HeroCarousel(items: hero)
                }
                if loading && hero.isEmpty {
                    LoadingView()
                } else if let failure, hero.isEmpty, resume.isEmpty {
                    MessageView(icon: "wifi.exclamationmark", text: failure) { Task { await load() } }
                }
                ItemRow(title: "Reprendre", items: resume, wide: true)
                ItemRow(title: "À suivre", items: nextUp, wide: true)
                ForEach(latest, id: \.library.id) { entry in
                    ItemRow(title: "Ajouts récents · \(entry.library.title)", items: entry.items)
                }
            }
            .padding(.bottom, 30)
        }
        .background(AuroraBackground())
        .navigationTitle("Accueil")
        .toolbarTitleDisplayMode(.inlineLarge)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { AccountButton() }
        }
        .refreshable { await load() }
        .task { if hero.isEmpty { await load() } }
        .onReceive(NotificationCenter.default.publisher(for: .noctraPlaybackEnded)) { _ in
            Task { await load() }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        let card = Fields.card
        async let resumeTask = try? session.get(ItemsResponse.self, paths: ["/UserItems/Resume", "/Users/{userId}/Items/Resume"],
                                                ["userId": session.userId, "limit": "20", "mediaTypes": "Video", "fields": card, "enableImageTypes": "Primary,Backdrop,Thumb"])
        async let nextTask = try? session.get(ItemsResponse.self, "/Shows/NextUp",
                                              ["userId": session.userId, "limit": "20", "fields": card, "enableResumable": "false"])
        async let heroTask = try? session.get([BaseItem].self, paths: ["/Items/Latest", "/Users/{userId}/Items/Latest"],
                                              ["userId": session.userId, "limit": "12", "includeItemTypes": "Movie,Series", "fields": "Overview,Genres,ProductionYear,OfficialRating", "enableImageTypes": "Backdrop,Logo,Primary"])
        async let viewsTask = try? session.get(ItemsResponse.self, paths: ["/UserViews", "/Users/{userId}/Views"], ["userId": session.userId])

        let (resumed, next, newest, views) = await (resumeTask, nextTask, heroTask, viewsTask)
        resume = resumed?.items ?? []
        nextUp = next?.items ?? []
        let heroItems = (newest ?? []).filter { $0.backdropImageTags?.isEmpty == false }
        withAnimation(Theme.spring) { hero = Array(heroItems.prefix(8)) }

        var rows: [(library: BaseItem, items: [BaseItem])] = []
        let libraries = (views?.items ?? []).filter { ["movies", "tvshows"].contains($0.collectionType ?? "") }
        await withTaskGroup(of: (Int, [BaseItem]).self) { group in
            for (index, library) in libraries.enumerated() {
                group.addTask { @MainActor in
                    let items = try? await session.get([BaseItem].self, paths: ["/Items/Latest", "/Users/{userId}/Items/Latest"],
                                                        ["userId": session.userId, "parentId": library.id, "limit": "18", "fields": card])
                    return (index, items ?? [])
                }
            }
            var found: [Int: [BaseItem]] = [:]
            for await (index, items) in group { found[index] = items }
            for (index, library) in libraries.enumerated() {
                if let items = found[index], !items.isEmpty { rows.append((library, items)) }
            }
        }
        latest = rows
        failure = (views == nil && newest == nil) ? NoctraError.unreachable.localizedDescription : nil
    }
}

/// Carrousel plein écran : pages magnétiques, parallaxe de l'image, bouton Liquid Glass.
struct HeroCarousel: View {
    @Environment(Session.self) private var session
    @Environment(\.zoomNamespace) private var zoom
    let items: [BaseItem]
    @State private var current: String?

    var body: some View {
        VStack(spacing: 12) {
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
            .scrollPosition(id: $current)
            .frame(height: 430)

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
        .sensoryFeedback(.selection, trigger: current)
    }

    private func page(_ item: BaseItem) -> some View {
        ZStack(alignment: .bottomLeading) {
            RemoteImage(url: session.backdrop(item, width: 1400))
                .scrollTransition(axis: .horizontal) { content, phase in
                    content.offset(x: phase.value * -90)
                }
                .frame(height: 430)
                .clipped()
            LinearGradient(colors: [.clear, .black.opacity(0.15), .black.opacity(0.85)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 10) {
                if let logo = session.logo(item) {
                    RemoteImage(url: logo, contentMode: .fit)
                        .frame(maxWidth: 230, maxHeight: 80, alignment: .leading)
                } else {
                    Text(item.title)
                        .font(.system(size: 32, weight: .heavy, design: .rounded))
                        .lineLimit(2)
                }
                Text([item.productionYear.map { String($0) }, item.genres?.prefix(2).joined(separator: " · ")].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.8))
                HStack(spacing: 10) {
                    Label(item.isSeries ? "Voir" : "Lecture", systemImage: item.isSeries ? "info.circle.fill" : "play.fill")
                        .font(.headline)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 11)
                        .glassEffect(.regular.tint(Theme.accent.opacity(0.55)).interactive(), in: Capsule())
                }
            }
            .padding(22)
            .padding(.bottom, 8)
        }
        .foregroundStyle(.white)
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .zoomSource(id: "hero-" + item.id, in: zoom)
        .padding(.horizontal, 16)
    }
}
