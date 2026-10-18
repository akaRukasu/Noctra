import SwiftUI

/// Fiche d'un film, d'une série ou d'un épisode : fond étirable, lecture, pistes, saisons.
struct ItemDetailView: View {
    @Environment(Session.self) private var session
    let item: BaseItem
    @State private var detail: BaseItem?
    @State private var seasons: [BaseItem] = []
    @State private var season: String?
    @State private var episodes: [BaseItem] = []
    @State private var nextEpisode: BaseItem?
    @State private var similar: [BaseItem] = []
    @State private var audioIndex: Int?
    @State private var subtitleIndex: Int?
    @State private var favorite = false
    @State private var played = false
    @State private var starting = false
    @State private var playError: String?
    @State private var playTaps = 0
    @State private var showFullOverview = false
    @State private var showCast = false
    @State private var choosingSeasonQuality = false
    private var sync: SyncPlayManager { .shared }

    private var shown: BaseItem { detail ?? item }
    private var seasonDownloaded: Bool { !episodes.isEmpty && episodes.allSatisfy { OfflineStore.shared.entry($0.id) != nil } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                actions
                    .padding(.horizontal, 20)
                if let overview = shown.overview, !overview.isEmpty {
                    Text(overview)
                        .font(.body)
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(showFullOverview ? nil : 4)
                        .onTapGesture { withAnimation(Theme.spring) { showFullOverview.toggle() } }
                        .padding(.horizontal, 20)
                }
                if shown.isSeries || shown.type == "Season" {
                    seasonSection
                }
                if let people = shown.people?.filter({ $0.type == "Actor" }).prefix(20), !people.isEmpty {
                    castRow(Array(people))
                }
                ItemRow(title: "Dans le même genre", items: similar)
            }
            .padding(.bottom, 40)
        }
        .ignoresSafeArea(edges: .top)
        .background(Theme.background)
        .navigationTitle(shown.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    Task { await toggleFavorite() }
                } label: {
                    Image(systemName: favorite ? "heart.fill" : "heart")
                        .contentTransition(.symbolEffect(.replace))
                }
                Button {
                    Task { await togglePlayed() }
                } label: {
                    Image(systemName: played ? "checkmark.circle.fill" : "checkmark.circle")
                        .contentTransition(.symbolEffect(.replace))
                }
            }
        }
        .sheet(isPresented: $showCast) {
            if let target = playTarget {
                CastSheet(item: target, startSeconds: target.resumeSeconds,
                          audioIndex: target.id == shown.id ? audioIndex : nil,
                          subtitleIndex: target.id == shown.id ? subtitleIndex : nil)
                    .presentationDetents([.medium, .large])
            }
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: playTaps)
        .sensoryFeedback(.success, trigger: favorite)
        .task { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .noctraPlaybackEnded)) { _ in
            Task { await load() }
        }
        .alert("Lecture impossible", isPresented: Binding(get: { playError != nil }, set: { if !$0 { playError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(playError ?? "")
        }
    }

    // MARK: En-tête étirable (comme les fiches de l'app TV d'Apple)

    /// Image de fond : l'image de l'épisode (16:9) ou le fond du film / de la série.
    private var headerImage: URL? {
        shown.type == "Episode" ? session.thumb(shown, width: 1600) : session.backdrop(shown, width: 1600)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image en 16:9 sur toute la largeur, qui s'étire quand on tire vers le bas.
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay { RemoteImage(url: headerImage) }
                .clipped()
                .visualEffect { content, proxy in
                    let pull = max(0, proxy.frame(in: .scrollView).minY)
                    return content
                        .scaleEffect(1 + pull / 300, anchor: .bottom)
                        .offset(y: -pull / 2)
                }
                .overlay(alignment: .bottom) {
                    LinearGradient(colors: [.clear, Theme.background.opacity(0.6), Theme.background], startPoint: .top, endPoint: .bottom)
                        .frame(height: 120)
                }
            VStack(alignment: .leading, spacing: 8) {
                if let logo = session.logo(shown) {
                    RemoteImage(url: logo, contentMode: .fit, alignment: .bottomLeading)
                        .frame(height: 72)
                        .frame(maxWidth: 260, alignment: .leading)
                } else {
                    Text(shown.type == "Episode" ? (shown.seriesName ?? shown.title) : shown.title)
                        .font(.display(32, .bold, relativeTo: .largeTitle))
                        .kerning(-1)
                        .foregroundStyle(Theme.posterTitleGradient)
                        .lineLimit(3)
                }
                if shown.type == "Episode" {
                    Text([shown.episodeLabel, shown.name].compactMap { $0 }.joined(separator: " · "))
                        .font(.headline)
                }
                HStack(spacing: 10) {
                    if !shown.subtitleLine.isEmpty { Text(shown.subtitleLine) }
                    if let rating = shown.communityRating {
                        Label(String(format: "%.1f", rating), systemImage: "star.fill")
                            .labelStyle(.titleAndIcon)
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.75))
                if let genres = shown.genres, !genres.isEmpty {
                    Text(genres.prefix(3).joined(separator: " · "))
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, -44)
        }
        .background(alignment: .top) {
            // Halo de l'image derrière le titre et les boutons.
            RemoteImage(url: headerImage)
                .frame(height: 520)
                .blur(radius: 50)
                .opacity(0.35)
                .mask(LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom))
                .drawingGroup()
                .allowsHitTesting(false)
        }
    }

    // MARK: Lecture et pistes

    private var playTarget: BaseItem? {
        if shown.isSeries { return nextEpisode ?? episodes.first }
        if shown.type == "Season" { return episodes.first { $0.userData?.played != true } ?? episodes.first }
        return shown
    }

    private var actions: some View {
        let target = playTarget
        let resume = target?.resumeSeconds ?? 0
        return VStack(alignment: .leading, spacing: 12) {
            GlassEffectContainer(spacing: 10) {
                HStack(spacing: 10) {
                    Button {
                        playTaps += 1
                        if let target { Task { await play(target, fromStart: false) } }
                    } label: {
                        HStack {
                            if starting { ProgressView().tint(.black) } else { Image(systemName: "play.fill") }
                            Text(playLabel(target: target, resume: resume)).lineLimit(1)
                        }
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                    }
                    .auroraPrimary()
                    .controlSize(.large)
                    .disabled(target == nil || starting)

                    if resume > 0, let target {
                        Button {
                            playTaps += 1
                            Task { await play(target, fromStart: true) }
                        } label: {
                            Image(systemName: "arrow.counterclockwise")
                                .font(.headline)
                                .padding(.vertical, 6)
                        }
                        .auroraSecondary()
                    }
                    if !shown.isFolder {
                        // Téléchargement pour regarder hors ligne.
                        OfflineButton(item: shown, audioIndex: audioIndex)
                    }
                    if target != nil {
                        // Cast : Chromecast, AirPlay ou un autre appareil (Noctra TV, navigateur…).
                        Button {
                            showCast = true
                        } label: {
                            Image(systemName: "airplayvideo")
                                .font(.headline)
                                .padding(.vertical, 6)
                        }
                        .auroraSecondary()
                    }
                }
            }
            if let group = sync.group {
                Label("SyncPlay · « \(group.name) » : la lecture démarre pour tout le groupe.", systemImage: "person.2.fill")
                    .font(.footnote)
                    .foregroundStyle(Theme.accent)
            }
            if !shown.isFolder {
                trackMenus
            }
        }
    }

    private func playLabel(target: BaseItem?, resume: Double) -> String {
        guard let target else { return "Lecture" }
        let prefix = resume > 0 ? "Reprendre" : "Lecture"
        if target.id != shown.id, let label = target.episodeLabel { return "\(prefix) · \(label)" }
        if resume > 0 { return "\(prefix) · \(Self.clock(resume))" }
        return prefix
    }

    static func clock(_ seconds: Double) -> String {
        let total = Int(seconds)
        return total >= 3600 ? String(format: "%d:%02d:%02d", total / 3600, total / 60 % 60, total % 60) : String(format: "%d:%02d", total / 60, total % 60)
    }

    private var streams: [MediaStream] { shown.mediaSources?.first?.mediaStreams ?? [] }

    @ViewBuilder
    private var trackMenus: some View {
        let audios = streams.filter { $0.type == "Audio" }
        let subtitles = streams.filter { $0.type == "Subtitle" }
        if audios.count > 1 || !subtitles.isEmpty {
            HStack(spacing: 10) {
                if audios.count > 1 {
                    Menu {
                        Picker("Audio", selection: $audioIndex) {
                            ForEach(audios) { stream in
                                Text(stream.label).tag(Optional(stream.index))
                            }
                        }
                    } label: {
                        Label(audios.first { $0.index == audioIndex }?.label ?? "Audio", systemImage: "waveform")
                            .lineLimit(1)
                    }
                    .buttonStyle(.glass)
                }
                if !subtitles.isEmpty {
                    Menu {
                        Picker("Sous-titres", selection: $subtitleIndex) {
                            Text("Aucun").tag(Optional(-1))
                            ForEach(subtitles) { stream in
                                Text(stream.label).tag(Optional(stream.index))
                            }
                        }
                    } label: {
                        Label(subtitles.first { $0.index == subtitleIndex }?.label ?? "Sous-titres", systemImage: "captions.bubble")
                            .lineLimit(1)
                    }
                    .buttonStyle(.glass)
                }
            }
            .font(.subheadline)
        }
    }

    // MARK: Saisons et épisodes

    @ViewBuilder
    private var seasonSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            if seasons.count > 1 {
                ScrollView(.horizontal) {
                    GlassEffectContainer(spacing: 8) {
                        HStack(spacing: 8) {
                            ForEach(seasons) { entry in
                                Button {
                                    withAnimation(Theme.spring) { season = entry.id }
                                    Task { await loadEpisodes(entry.id) }
                                } label: {
                                    Text(entry.title)
                                        .font(.subheadline.weight(.semibold))
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 9)
                                }
                                .buttonStyle(PressableStyle())
                                .glassEffect(season == entry.id ? .regular.tint(Theme.accent.opacity(0.6)).interactive() : .regular.interactive(), in: Capsule())
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                }
                .scrollIndicators(.hidden)
                .sensoryFeedback(.selection, trigger: season)
            }
            if !episodes.isEmpty {
                HStack {
                    Spacer()
                    Button {
                        choosingSeasonQuality = true
                    } label: {
                        Label(seasonDownloaded ? "Saison sur l’iPhone" : "Télécharger la saison", systemImage: seasonDownloaded ? "checkmark.circle.fill" : "arrow.down.circle")
                            .font(.subheadline.weight(.semibold))
                    }
                    .auroraSecondary()
                    .disabled(seasonDownloaded)
                }
                .padding(.horizontal, 20)
                .confirmationDialog("Télécharger \(episodes.count) épisode\(episodes.count > 1 ? "s" : "")", isPresented: $choosingSeasonQuality, titleVisibility: .visible) {
                    ForEach(OfflineQuality.allCases) { quality in
                        Button(quality.label) { OfflineStore.shared.download(episodes: episodes, session: session, quality: quality) }
                    }
                } message: {
                    Text("Les épisodes se téléchargent l’un après l’autre, même appli fermée.")
                }
            }
            LazyVStack(spacing: 14) {
                ForEach(episodes) { episode in
                    EpisodeRow(episode: episode) {
                        playTaps += 1
                        Task { await play(episode, fromStart: false) }
                    }
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func castRow(_ people: [Person]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Distribution")
                .padding(.horizontal, 20)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(people) { person in
                        VStack(spacing: 6) {
                            RemoteImage(url: session.image(person.id, tag: person.primaryImageTag, width: 200))
                                .frame(width: 76, height: 76)
                                .clipShape(Circle())
                            Text(person.name ?? "")
                                .font(.caption.weight(.semibold))
                                .lineLimit(1)
                            Text(person.role ?? "")
                                .font(.caption2)
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                        }
                        .frame(width: 86)
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    // MARK: Données

    private func load() async {
        let full = try? await session.get(BaseItem.self, paths: ["/Items/\(item.id)", "/Users/{userId}/Items/\(item.id)"],
                                          ["userId": session.userId, "fields": Fields.detail])
        if let full {
            detail = full
            favorite = full.userData?.isFavorite ?? false
            played = full.userData?.played ?? false
            let streams = full.mediaSources?.first?.mediaStreams ?? []
            if audioIndex == nil { audioIndex = streams.first { $0.type == "Audio" && $0.isDefault == true }?.index ?? streams.first { $0.type == "Audio" }?.index }
            if subtitleIndex == nil { subtitleIndex = streams.first { $0.type == "Subtitle" && ($0.isForced == true || $0.isDefault == true) }?.index ?? -1 }
        }
        let current = full ?? item
        if current.isSeries {
            let list = try? await session.get(ItemsResponse.self, "/Shows/\(current.id)/Seasons", ["userId": session.userId, "fields": Fields.card])
            seasons = list?.items ?? []
            let next = try? await session.get(ItemsResponse.self, "/Shows/NextUp", ["userId": session.userId, "seriesId": current.id, "fields": Fields.card, "limit": "1"])
            nextEpisode = next?.items?.first
            let preferred = nextEpisode?.seasonId ?? season ?? seasons.first?.id
            if let preferred {
                season = preferred
                await loadEpisodes(preferred)
            }
        } else if current.type == "Season" {
            season = current.id
            await loadEpisodes(current.id)
        }
        if similar.isEmpty {
            let list = try? await session.get(ItemsResponse.self, "/Items/\(item.id)/Similar", ["userId": session.userId, "limit": "16", "fields": Fields.card])
            similar = list?.items ?? []
        }
    }

    private func loadEpisodes(_ seasonId: String) async {
        let seriesId = shown.isSeries ? shown.id : (shown.seriesId ?? shown.id)
        let list = try? await session.get(ItemsResponse.self, "/Shows/\(seriesId)/Episodes",
                                          ["userId": session.userId, "seasonId": seasonId, "fields": Fields.card + ",MediaSources"])
        withAnimation(Theme.spring) { episodes = list?.items ?? [] }
    }

    private func play(_ target: BaseItem, fromStart: Bool) async {
        guard !starting else { return }
        starting = true
        defer { starting = false }
        do {
            let sameItem = target.id == shown.id
            try await PlaybackManager.shared.play(
                target,
                session: session,
                audioIndex: sameItem ? audioIndex : nil,
                subtitleIndex: sameItem ? subtitleIndex : nil,
                startSeconds: fromStart ? 0 : target.resumeSeconds
            )
        } catch {
            playError = error.localizedDescription
        }
    }

    private func toggleFavorite() async {
        let target = !favorite
        withAnimation(Theme.spring) { favorite = target }
        do {
            try await session.send(target ? "POST" : "DELETE", paths: ["/UserFavoriteItems/\(item.id)", "/Users/{userId}/FavoriteItems/\(item.id)"], ["userId": session.userId])
        } catch {
            withAnimation(Theme.spring) { favorite = !target }
        }
    }

    private func togglePlayed() async {
        let target = !played
        withAnimation(Theme.spring) { played = target }
        do {
            try await session.send(target ? "POST" : "DELETE", paths: ["/UserPlayedItems/\(item.id)", "/Users/{userId}/PlayedItems/\(item.id)"], ["userId": session.userId])
        } catch {
            withAnimation(Theme.spring) { played = !target }
        }
    }
}

/// Ligne d'épisode : vignette, numéro, résumé, lecture directe.
struct EpisodeRow: View {
    @Environment(Session.self) private var session
    let episode: BaseItem
    let play: () -> Void

    var body: some View {
        Button(action: play) {
            HStack(alignment: .top, spacing: 14) {
                RemoteImage(url: session.thumb(episode, width: 480))
                    .frame(width: 150, height: 84)
                    .overlay {
                        Image(systemName: "play.fill")
                            .font(.callout)
                            .padding(10)
                            .glassEffect(.regular, in: Circle())
                    }
                    .overlay(alignment: .bottom) {
                        if let progress = episode.progress { ProgressLine(value: progress).padding(6) }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text([episode.indexNumber.map { "\($0)." }, episode.name].compactMap { $0 }.joined(separator: " "))
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(2)
                        if episode.userData?.played == true {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.accent).font(.caption)
                        }
                        if let offline = OfflineStore.shared.entry(episode.id) {
                            Image(systemName: offline.state == .done ? "arrow.down.circle.fill" : "arrow.down.circle.dotted")
                                .foregroundStyle(offline.state == .done ? Theme.teal : Theme.muted)
                                .font(.caption)
                        }
                    }
                    if let runtime = episode.runtime {
                        Text(runtime).font(.caption).foregroundStyle(Theme.muted)
                    }
                    if let overview = episode.overview {
                        Text(overview).font(.caption).foregroundStyle(Theme.muted).lineLimit(3)
                    }
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle(scale: 0.97))
        .foregroundStyle(.white)
    }
}
