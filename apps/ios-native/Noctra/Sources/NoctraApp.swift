import AVFoundation
import SwiftUI

/// Noctra pour iPhone et iPad : appli native SwiftUI (iOS 26, Liquid Glass).
/// Bibliothèque Jellyfin du serveur Noctra, TV en direct, lecteur vidéo d'Apple.
@main
struct NoctraApp: App {
    @State private var session = Session()

    init() {
        // Son même en mode silencieux, lecture en arrière-plan et image dans l'image.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        // Affiches et fonds gardés en cache : défilement fluide, peu de données.
        URLCache.shared = URLCache(memoryCapacity: 96 << 20, diskCapacity: 768 << 20)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
    }
}

struct RootView: View {
    @Environment(Session.self) private var session

    var body: some View {
        ZStack {
            if session.isSignedIn {
                MainTabView()
                    .transition(.opacity.combined(with: .scale(scale: 1.04)))
            } else {
                LoginView()
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .animation(.spring(response: 0.55, dampingFraction: 0.86), value: session.isSignedIn)
    }
}

/// Onglets : barre Liquid Glass d'iOS 26, qui se rétracte au défilement.
struct MainTabView: View {
    @Environment(Session.self) private var session
    @State private var selection: AppTab = .home

    enum AppTab: Hashable { case home, libraries, live, search }

    var body: some View {
        TabView(selection: $selection) {
            Tab("Accueil", systemImage: "house.fill", value: AppTab.home) {
                NoctraStack { HomeView() }
            }
            Tab("Médiathèques", systemImage: "square.stack.fill", value: AppTab.libraries) {
                NoctraStack { LibrariesView() }
            }
            Tab("TV", systemImage: "dot.radiowaves.left.and.right", value: AppTab.live) {
                NoctraStack { LiveSourcesView() }
            }
            Tab("Recherche", systemImage: "magnifyingglass", value: AppTab.search, role: .search) {
                NoctraStack { SearchView() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// Pile de navigation d'un onglet : fiches ouvertes par un zoom depuis leur affiche.
struct NoctraStack<Content: View>: View {
    @Namespace private var zoom
    @ViewBuilder var content: Content

    var body: some View {
        NavigationStack {
            content
                .navigationDestination(for: BaseItem.self) { item in
                    ItemDetailView(item: item)
                        .navigationTransition(.zoom(sourceID: item.id, in: zoom))
                }
                .navigationDestination(for: LibraryRoute.self) { route in
                    LibraryGridView(library: route)
                }
                .navigationDestination(for: TVSourceRoute.self) { route in
                    LiveChannelsView(route: route)
                }
        }
        .environment(\.zoomNamespace, zoom)
    }
}
