import SwiftUI

/// Image distante (cache d'URLSession), apparition en fondu.
struct RemoteImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.25))) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: contentMode)
            default:
                Rectangle().fill(Theme.surface)
            }
        }
    }
}

/// Barre d'avancement (reprise de lecture).
struct ProgressLine: View {
    let value: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.25))
                Capsule().fill(Theme.accent).frame(width: max(4, proxy.size.width * value))
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
                                .glassEffect(.regular.tint(Theme.accent.opacity(0.6)), in: Circle())
                                .padding(6)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .zoomSource(id: item.id, in: zoom)
                Text(item.type == "Episode" ? (item.seriesName ?? item.title) : item.title)
                    .font(.subheadline.weight(.semibold))
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
                    .zoomSource(id: item.id, in: zoom)
                Text(item.type == "Episode" ? (item.seriesName ?? item.title) : item.title)
                    .font(.subheadline.weight(.semibold))
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
                Text(title)
                    .font(.title3.weight(.bold))
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
                    .buttonStyle(.glass)
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
                .background(LinearGradient(colors: [Theme.accent, Theme.violet], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                .foregroundStyle(.black)
        }
        .sheet(isPresented: $showing) {
            AccountSheet()
                .presentationDetents([.medium, .large])
        }
    }
}

struct AccountSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    LabeledContent("Utilisateur", value: session.userName ?? "—")
                    LabeledContent("Serveur", value: URL(string: session.jellyfinBase)?.host ?? "—")
                    LabeledContent("TV en direct", value: session.hasNoctra ? "Disponible" : "Indisponible")
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
}

extension Notification.Name {
    /// Lecture terminée : reprises et « À suivre » à mettre à jour.
    static let noctraPlaybackEnded = Notification.Name("noctraPlaybackEnded")
}
