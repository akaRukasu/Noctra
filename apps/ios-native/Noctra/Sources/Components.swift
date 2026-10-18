import SwiftUI

/// Image distante (cache d'URLSession), apparition en fondu.
/// Elle occupe exactement la place proposée : une image large en mode
/// « remplir » est rognée au lieu d'élargir la page (fiche, tuiles, carrousel).
struct RemoteImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill
    var alignment: Alignment = .center

    var body: some View {
        Color.clear
            .overlay(alignment: alignment) {
                AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.25))) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: contentMode)
                    default:
                        if contentMode == .fill { Rectangle().fill(Theme.surface) } else { Color.clear }
                    }
                }
            }
            .clipped()
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
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .auroraCard()
                    .zoomSource(id: item.id, in: zoom)
                Text(item.type == "Episode" ? (item.seriesName ?? item.title) : item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color(hex: 0xF3F0FF))
                    .lineLimit(1)
                Text(item.type == "Episode" ? (item.episodeLabel ?? "") : (item.productionYear.map { String($0) } ?? " "))
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
    @State private var playError: String?

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
            .alert("Lecture impossible", isPresented: Binding(get: { playError != nil }, set: { if !$0 { playError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(playError ?? "")
            }
    }

    private func play(fromStart: Bool) async {
        do {
            try await PlaybackManager.shared.play(item, session: session, audioIndex: nil, subtitleIndex: nil,
                                                  startSeconds: fromStart ? 0 : item.resumeSeconds)
        } catch {
            playError = error.localizedDescription
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
        Button {
            showing = true
        } label: {
            Text(String((session.userName ?? "?").prefix(1)).uppercased())
                .font(.headline)
                .frame(width: 30, height: 30)
                .background(Theme.gradient, in: Circle())
                .foregroundStyle(Theme.onAccent)
                .shadow(color: Theme.violet.opacity(0.7), radius: 8)
        }
        .sheet(isPresented: $showing) {
            AccountSheet()
                .presentationDetents([.large])
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
                        Text(String((session.userName ?? "?").prefix(1)).uppercased())
                            .font(.title2.weight(.bold))
                            .frame(width: 52, height: 52)
                            .background(Theme.gradient, in: Circle())
                            .foregroundStyle(Theme.onAccent)
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
                if session.isAdmin {
                    Section {
                        NavigationLink { AdminDashboardView() } label: {
                            Label("Tableau de bord", systemImage: "gauge.with.dots.needle.67percent")
                        }
                        NavigationLink { UsersAdminView() } label: {
                            Label("Utilisateurs", systemImage: "person.2.fill")
                        }
                        if session.hasNoctra {
                            NavigationLink { DownloadsView() } label: {
                                Label("Téléchargements", systemImage: "arrow.down.circle.fill")
                            }
                        }
                        Button {
                            Task { await refreshLibraries() }
                        } label: {
                            Label("Actualiser les médiathèques", systemImage: "arrow.triangle.2.circlepath")
                        }
                        NavigationLink { FullDashboardView() } label: {
                            Label("Tableau de bord complet", systemImage: "slider.horizontal.3")
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
