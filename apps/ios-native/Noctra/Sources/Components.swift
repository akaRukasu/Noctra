import SwiftUI

/// Image distante ou locale (téléchargements), apparition en fondu.
/// Elle occupe exactement la place proposée : une image large en mode
/// « remplir » est rognée au lieu d'élargir la page (fiche, tuiles, carrousel).
/// Images décodées hors du fil principal et gardées en mémoire (ImagePipeline).
struct RemoteImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill
    var alignment: Alignment = .center
    /// Texte affiché si l'image ne peut pas l'être (logo absent, SVG) : initiales d'une chaîne.
    var fallback: String? = nil
    @State private var loaded: (url: URL, image: UIImage)?
    @State private var failed: URL?

    private var image: UIImage? {
        guard let url else { return nil }
        if let loaded, loaded.url == url { return loaded.image }
        return ImagePipeline.shared.cached(url)
    }

    var body: some View {
        Color.clear
            .overlay(alignment: alignment) {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: contentMode)
                        .transition(.opacity)
                } else if let fallback, let url, failed == url || ImagePipeline.shared.failed(url) {
                    Text(fallback)
                        .font(.title2.weight(.heavy))
                        .foregroundStyle(Theme.teal)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if contentMode == .fill {
                    Rectangle().fill(Theme.surface)
                }
            }
            .clipped()
            .task(id: url) {
                guard let url else { return }
                // Image arrivée pendant que la carte était hors de l'écran : l'état
                // est toujours mis à jour, pour que la vue se redessine avec elle.
                if let hit = ImagePipeline.shared.cached(url) {
                    if loaded?.url != url { loaded = (url, hit) }
                    return
                }
                guard let image = await ImagePipeline.shared.image(for: url) else { failed = url; return }
                withAnimation(.easeOut(duration: 0.22)) { loaded = (url, image) }
            }
    }
}

/// Barre d'avancement (reprise de lecture).
struct ProgressLine: View {
    let value: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.22))
                Capsule().fill(Theme.gradient).frame(width: max(4, proxy.size.width * value))
                    .shadow(color: Theme.lilac.opacity(0.8), radius: 5)
            }
        }
        .frame(height: 4)
    }
}

/// Affiche verticale : zoom vers la fiche à l'ouverture.
struct PosterCard: View {
    @Environment(Session.self) private var session
    @Environment(\.zoomNamespace) private var zoom
    let item: BaseItem
    var width: CGFloat = 128

    var body: some View {
        NavigationLink(value: item) {
            VStack(alignment: .leading, spacing: 6) {
                RemoteImage(url: session.poster(item))
                    .frame(width: width, height: width * 1.5)
                    .overlay(alignment: .bottom) {
                        if let progress = item.progress {
                            ProgressLine(value: progress).padding(8)
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if item.userData?.played == true {
                            Image(systemName: "checkmark")
                                .font(.caption2.bold())
                                .padding(6)
                                .background(LinearGradient(colors: [Theme.deepViolet, Theme.fuchsia], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                                .shadow(color: Theme.deepViolet.opacity(0.7), radius: 6, y: 3)
                                .padding(6)
                        }
                    }
                    .overlay(alignment: .bottomLeading) {
                        // Série complète, épisodes manquants ou en cours (comme sur le site).
                        if item.type == "Series" { SeriesStatusBadge(id: item.id).padding(7) }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .auroraCard()
                    .zoomSource(id: item.id, in: zoom)
                Text(item.type == "Episode" || item.type == "Season" ? (item.seriesName ?? item.title) : item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color(hex: 0xF3F0FF))
                    .lineLimit(1)
                Text(item.type == "Episode" ? (item.episodeLabel ?? "") : item.type == "Season" ? item.title : (item.productionYear.map { String($0) } ?? " "))
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            .frame(width: width)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .modifier(ItemContextMenu(item: item, preview: session.poster(item), aspect: 2 / 3))
    }
}

/// Vignette 16:9 : reprises, épisodes.
struct WideCard: View {
    @Environment(Session.self) private var session
    @Environment(\.zoomNamespace) private var zoom
    let item: BaseItem
    var width: CGFloat = 250

    var body: some View {
        NavigationLink(value: item) {
            VStack(alignment: .leading, spacing: 6) {
                RemoteImage(url: session.thumb(item))
                    .frame(width: width, height: width * 9 / 16)
                    .overlay(alignment: .bottom) {
                        if let progress = item.progress {
                            ProgressLine(value: progress).padding(10)
                        }
                    }
                    .overlay(alignment: .bottomLeading) {
                        // Série complète, épisodes manquants ou en cours (comme sur le site).
                        if item.type == "Series" { SeriesStatusBadge(id: item.id).padding(7) }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .auroraCard()
                    .zoomSource(id: item.id, in: zoom)
                Text(item.type == "Episode" ? (item.seriesName ?? item.title) : item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color(hex: 0xF3F0FF))
                    .lineLimit(1)
                Text(item.type == "Episode" ? [item.episodeLabel, item.name].compactMap { $0 }.joined(separator: " · ") : item.subtitleLine)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            .frame(width: width)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .modifier(ItemContextMenu(item: item, preview: session.thumb(item), aspect: 16 / 9))
    }
}

/// Appui long sur une affiche : aperçu agrandi et actions rapides, comme dans les applis d'Apple.
struct ItemContextMenu: ViewModifier {
    @Environment(Session.self) private var session
    let item: BaseItem
    let preview: URL?
    let aspect: CGFloat
    @State private var favorite: Bool?
    @State private var played: Bool?

    private var isFavorite: Bool { favorite ?? item.userData?.isFavorite ?? false }
    private var isPlayed: Bool { played ?? item.userData?.played ?? false }
    private var playable: Bool { ["Movie", "Episode", "Video", "MusicVideo"].contains(item.type ?? "") }

    func body(content: Content) -> some View {
        content
            .contextMenu {
                if playable {
                    Button {
                        Task { await play(fromStart: false) }
                    } label: {
                        Label(item.progress != nil ? "Reprendre" : "Lecture", systemImage: "play.fill")
                    }
                    if item.progress != nil {
                        Button {
                            Task { await play(fromStart: true) }
                        } label: {
                            Label("Lire depuis le début", systemImage: "arrow.counterclockwise")
                        }
                    }
                }
                if playable {
                    if let offline = OfflineStore.shared.entry(item.id) {
                        if offline.state == .done {
                            Button {
                                PlaybackManager.shared.playOffline(offline, session: session)
                            } label: {
                                Label("Lire hors ligne", systemImage: "arrow.down.circle.fill")
                            }
                        }
                        Button(role: .destructive) {
                            OfflineStore.shared.delete(item.id)
                        } label: {
                            Label(offline.state == .done ? "Supprimer le téléchargement" : "Annuler le téléchargement", systemImage: "trash")
                        }
                    } else {
                        Button {
                            OfflineStore.shared.download(item, session: session)
                        } label: {
                            Label("Télécharger", systemImage: "arrow.down.circle")
                        }
                    }
                }
                Button {
                    Task { await toggle(favorites: true) }
                } label: {
                    Label(isFavorite ? "Retirer des favoris" : "Ajouter aux favoris", systemImage: isFavorite ? "heart.slash" : "heart")
                }
                Button {
                    Task { await toggle(favorites: false) }
                } label: {
                    Label(isPlayed ? "Marquer comme non vu" : "Marquer comme vu", systemImage: isPlayed ? "eye.slash" : "checkmark.circle")
                }
            } preview: {
                VStack(alignment: .leading, spacing: 8) {
                    RemoteImage(url: preview)
                        .aspectRatio(aspect, contentMode: .fit)
                        .frame(width: aspect < 1 ? 260 : 340)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.type == "Episode" ? (item.seriesName ?? item.title) : item.title)
                            .font(.display(19, .semibold, relativeTo: .headline))
                            .foregroundStyle(Theme.ink)
                        if !item.subtitleLine.isEmpty {
                            Text(item.subtitleLine)
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 12)
                }
                .frame(width: aspect < 1 ? 260 : 340)
                .background(Theme.background)
            }
            .sensoryFeedback(.success, trigger: favorite)
            .sensoryFeedback(.success, trigger: played)
    }

    private func play(fromStart: Bool) async {
        do {
            try await PlaybackManager.shared.play(item, session: session, audioIndex: nil, subtitleIndex: nil,
                                                  startSeconds: fromStart ? 0 : item.resumeSeconds)
        } catch {
            SyncPlayManager.shared.announce("Lecture impossible : \(error.localizedDescription)")
        }
    }

    private func toggle(favorites: Bool) async {
        let target = favorites ? !isFavorite : !isPlayed
        let paths = favorites
            ? ["/UserFavoriteItems/\(item.id)", "/Users/{userId}/FavoriteItems/\(item.id)"]
            : ["/UserPlayedItems/\(item.id)", "/Users/{userId}/PlayedItems/\(item.id)"]
        if favorites { favorite = target } else { played = target }
        do {
            _ = try await session.send(target ? "POST" : "DELETE", paths: paths, ["userId": session.userId])
        } catch {
            if favorites { favorite = !target } else { played = !target }
        }
    }
}

/// Rangée horizontale avec alignement magnétique des cartes et léger effet de profondeur.
struct ItemRow: View {
    let title: String
    let items: [BaseItem]
    var wide = false

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle(title)
                    .padding(.horizontal, 20)
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: 14) {
                        ForEach(items) { item in
                            Group {
                                if wide { WideCard(item: item) } else { PosterCard(item: item) }
                            }
                            .scrollTransition(.interactive, axis: .horizontal) { content, phase in
                                content
                                    .scaleEffect(phase.isIdentity ? 1 : 0.94)
                                    .opacity(phase.isIdentity ? 1 : 0.75)
                            }
                        }
                    }
                    .scrollTargetLayout()
                    .padding(.horizontal, 20)
                }
                .scrollIndicators(.hidden)
                .scrollTargetBehavior(.viewAligned)
            }
        }
    }
}

struct LoadingView: View {
    var body: some View {
        ProgressView()
            .controlSize(.large)
            .frame(maxWidth: .infinity, minHeight: 240)
    }
}

/// Attente dans une liste (diffusion, envoi) : indicateur et texte centrés sur une ligne.
struct BusyRow: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        HStack(spacing: 10) {
            ProgressView()
            Text(text).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .center)
    }
}

struct MessageView: View {
    let icon: String
    let text: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 38, weight: .semibold))
                .foregroundStyle(Theme.accent)
            Text(text)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.muted)
            if let retry {
                Button("Réessayer", action: retry)
                    .auroraSecondary()
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, minHeight: 260)
    }
}

/// Bouton d'avatar (compte) des barres de navigation.
struct AccountButton: View {
    @Environment(Session.self) private var session
    @State private var showing = false

    var body: some View {
        // Marges intérieures : les icônes ne touchent pas le bord de la capsule de la barre.
        HStack(spacing: 12) {
            CastButton()
            account
        }
        .padding(.horizontal, 6)
    }

    private var account: some View {
        Button {
            showing = true
        } label: {
            AccountAvatar(size: 30, font: .headline)
                .shadow(color: Theme.violet.opacity(0.7), radius: 8)
        }
        .sheet(isPresented: $showing) {
            AccountSheet()
                .presentationDetents([.large])
        }
    }
}

/// Photo de profil Jellyfin dans un rond ; initiale du nom tant qu'elle charge ou sans photo.
struct AccountAvatar: View {
    @Environment(Session.self) private var session
    let size: CGFloat
    var font: Font = .headline
    @State private var photo: (url: URL, image: UIImage)?

    var body: some View {
        let url = session.avatarURL(size: Int(size * 3))
        ZStack {
            Text(String((session.userName ?? "?").prefix(1)).uppercased())
                .font(font)
                .foregroundStyle(Theme.onAccent)
            if let photo, photo.url == url {
                Image(uiImage: photo.image)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            }
        }
        .frame(width: size, height: size)
        .background(Theme.gradient)
        .clipShape(Circle())
        .accessibilityLabel(session.userName ?? "Compte")
        .task(id: url) {
            guard let url else { photo = nil; return }
            if let hit = ImagePipeline.shared.cached(url) {
                photo = (url, hit)
                return
            }
            guard let image = await ImagePipeline.shared.image(for: url, maxPixels: size * 3) else { return }
            withAnimation(.easeOut(duration: 0.2)) { photo = (url, image) }
        }
    }
}

struct AccountSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @AppStorage("noctra.subtitles.size") private var subtitleSize = SubtitleSize.medium.rawValue
    @State private var refreshNote: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        AccountAvatar(size: 52, font: .title2.weight(.bold))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.userName ?? "—").font(.display(20, .bold, relativeTo: .headline))
                            Text(session.isAdmin ? "Administrateur" : "Utilisateur").font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                    LabeledContent("Serveur", value: URL(string: session.jellyfinBase)?.host ?? "—")
                    LabeledContent("TV en direct", value: session.hasNoctra ? "Disponible" : "Indisponible")
                }
                Section("Lecture") {
                    Picker("Taille des sous-titres", selection: $subtitleSize) {
                        ForEach(SubtitleSize.allCases) { Text($0.label).tag($0.rawValue) }
                    }
                }
                Section {
                    Toggle("Choisir le serveur à chaque chaîne", isOn: Binding(get: { LiveLauncher.shared.showPicker }, set: { LiveLauncher.shared.showPicker = $0 }))
                    NavigationLink { LiveWatchDeviceView() } label: {
                        LabeledContent("LiveWatch sur cet appareil", value: LiveWatchDevice.enabled ? "Connecté" : "Non connecté")
                    }
                } header: {
                    Text("TV en direct")
                } footer: {
                    Text("Les serveurs sont classés par fiabilité et testés ; le meilleur se lance tout seul après quelques secondes. Désactivé : il se lance directement.")
                }
                Section {
                    NavigationLink { OfflineLibraryView() } label: {
                        LabeledContent {
                            Text(AdminFormat.bytes(Double(OfflineStore.shared.usedBytes)))
                        } label: {
                            Label("Sur cet iPhone", systemImage: "arrow.down.circle.fill")
                        }
                    }
                    Picker("Qualité par défaut", selection: Binding(get: { OfflineStore.shared.defaultQuality }, set: { OfflineStore.shared.defaultQuality = $0 })) {
                        ForEach(OfflineQuality.allCases) { Text($0.label).tag($0) }
                    }
                    Toggle("Wi-Fi uniquement", isOn: Binding(get: { OfflineStore.shared.wifiOnly }, set: { OfflineStore.shared.wifiOnly = $0 }))
                } header: {
                    Text("Téléchargements hors ligne")
                } footer: {
                    Text("Les téléchargements continuent appli fermée. Avec « Wi-Fi uniquement », ils attendent un réseau Wi-Fi.")
                }
                if session.isAdmin {
                    Section {
                        // Accès direct, temporaire, le temps de régler le VIP LiveWatch.
                        if session.hasNoctra {
                            NavigationLink { LiveAdminView() } label: {
                                Label("Diagnostic LiveWatch VIP", systemImage: "stethoscope")
                            }
                        }
                        NavigationLink { AdminHomeView() } label: {
                            Label("Tableau de bord", systemImage: "gauge.with.dots.needle.67percent")
                        }
                        NavigationLink { UsersAdminView() } label: {
                            Label("Utilisateurs", systemImage: "person.2.fill")
                        }
                        if session.hasNoctra {
                            NavigationLink { DownloadsView() } label: {
                                Label("Téléchargements", systemImage: "arrow.down.circle.fill")
                            }
                            NavigationLink { ArrHubView(kind: .radarr) } label: {
                                Label("Radarr · films", systemImage: "film.stack.fill")
                            }
                            NavigationLink { ArrHubView(kind: .sonarr) } label: {
                                Label("Sonarr · séries", systemImage: "tv.and.mediabox.fill")
                            }
                            NavigationLink { FileExplorerView() } label: {
                                Label("Explorateur média", systemImage: "folder.fill")
                            }
                            NavigationLink { StorageView() } label: {
                                Label("Stockage de la seedbox", systemImage: "internaldrive")
                            }
                        }
                        Button {
                            Task { await refreshLibraries() }
                        } label: {
                            Label("Actualiser les médiathèques", systemImage: "arrow.triangle.2.circlepath")
                        }
                    } header: {
                        Text("Administration")
                    } footer: {
                        if let refreshNote { Text(refreshNote) }
                    }
                }
                Section {
                    Button("Se déconnecter", role: .destructive) {
                        dismiss()
                        session.signOut()
                    }
                }
                Section {
                    LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
                }
            }
            .navigationTitle("Compte")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }
                }
            }
        }
    }

    private func refreshLibraries() async {
        do {
            if session.hasNoctra { _ = try await session.noctraSend("POST", "/api/libraries/refresh", json: nil) }
            else { _ = try await session.data("POST", "/Library/Refresh") }
            refreshNote = "Actualisation des médiathèques lancée."
        } catch {
            refreshNote = error.localizedDescription
        }
    }
}

extension Notification.Name {
    /// Lecture terminée : reprises et « À suivre » à mettre à jour.
    static let noctraPlaybackEnded = Notification.Name("noctraPlaybackEnded")
}
