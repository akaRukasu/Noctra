import AVFoundation
import SwiftUI

/// Noctra pour iPhone et iPad : appli native SwiftUI (iOS 26, Liquid Glass).
/// Bibliothèque Jellyfin du serveur Noctra, TV en direct, lecteur vidéo d'Apple.
@main
struct NoctraApp: App {
    @UIApplicationDelegateAdaptor(NoctraAppDelegate.self) private var appDelegate
    @State private var session = Session()

    init() {
        // Son même en mode silencieux, lecture en arrière-plan et image dans l'image.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        // Affiches et fonds gardés en cache : défilement fluide, peu de données.
        URLCache.shared = URLCache(memoryCapacity: 96 << 20, diskCapacity: 768 << 20)
        // Titres des barres de navigation en Sora, comme les titres du site.
        NoctraFont.applyToNavigationBars()
        // Téléchargements hors ligne : index et transferts d'arrière-plan repris.
        OfflineStore.shared.restore()
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
        .task(id: session.isSignedIn) {
            guard session.isSignedIn else { SyncPlayManager.shared.stopAll(); return }
            OfflineStore.shared.session = session
            OfflineStore.shared.schedule()
            // Cookie de session Noctra (TV, images) et canal temps réel (SyncPlay, « Lire sur… »).
            await session.establishNoctraSession()
            SyncPlayManager.shared.start(session)
        }
    }
}

/// Onglets : barre Liquid Glass d'iOS 26, qui se rétracte au défilement.
struct MainTabView: View {
    @Environment(Session.self) private var session
    @State private var selection: AppTab = .home

    enum AppTab: Hashable { case home, libraries, live, discover, search }
    private var launcher: LiveLauncher { .shared }
    private var sync: SyncPlayManager { .shared }

    var body: some View {
        TabView(selection: $selection) {
            Tab("Accueil", systemImage: "house.fill", value: AppTab.home) {
                NoctraStack { HomeView() }
            }
            Tab("Médiathèques", systemImage: "square.stack.fill", value: AppTab.libraries) {
                NoctraStack { LibrariesView() }
            }
            Tab("TV", systemImage: "dot.radiowaves.left.and.right", value: AppTab.live) {
                NoctraStack { LiveTVHome() }
            }
            Tab("Découvrir", systemImage: "sparkles", value: AppTab.discover) {
                NoctraStack { DiscoverHub() }
            }
            Tab("Recherche", systemImage: "magnifyingglass", value: AppTab.search, role: .search) {
                NoctraStack { SearchView() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .sensoryFeedback(.selection, trigger: selection)
        // Chaîne lue par le lecteur web de secours (MPEG-TS, lecteur d'un site).
        // Lecteur de la TV en direct (chaînes et serveurs changeables sans le quitter).
        .fullScreenCover(isPresented: Binding(get: { LivePlayerModel.shared.presented }, set: { if !$0 { LivePlayerModel.shared.close() } })) {
            LivePlayerView()
        }
        // Choix du serveur d'une chaîne (meilleur serveur lancé tout seul).
        .sheet(item: Binding(get: { launcher.pick }, set: { launcher.pick = $0 })) { pick in
            LiveServerSheet(pick: pick)
                .presentationDetents([.medium, .large])
        }
        .alert("Chaîne indisponible", isPresented: Binding(get: { launcher.problem != nil }, set: { if !$0 { launcher.problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(launcher.problem ?? "")
        }
        // Messages SyncPlay et des autres appareils, en haut de l'écran.
        .overlay(alignment: .top) {
            if let notice = sync.notice {
                Text(notice)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .glassEffect(.regular.tint(Color(hex: 0x0E0E20).opacity(0.6)), in: Capsule())
                    .overlay(Capsule().stroke(Theme.gradient, lineWidth: 1))
                    .shadow(color: Theme.deepViolet.opacity(0.8), radius: 20, y: 10)
                    .padding(.top, 6)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: notice) {
                        try? await Task.sleep(for: .seconds(3.5))
                        withAnimation(Theme.spring) { sync.clearNotice() }
                    }
            }
        }
        .animation(Theme.spring, value: sync.notice)
        // Lecture en cours sur un Chromecast : capsule au-dessus des onglets.
        .overlay(alignment: .bottom) {
            ChromecastMiniPlayer()
                .padding(.bottom, 74)
        }
        .animation(Theme.spring, value: ChromecastController.shared.isActive)
        .alert("Chromecast", isPresented: Binding(get: { ChromecastController.shared.problem != nil && !ChromecastController.shared.isActive },
                                                  set: { if !$0 { ChromecastController.shared.problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(ChromecastController.shared.problem ?? "")
        }
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
                .navigationDestination(for: OfflineRoute.self) { _ in
                    OfflineLibraryView()
                }
                .navigationDestination(for: ItemRoute.self) { route in
                    if let item = route.item {
                        ItemDetailView(item: item)
                    }
                }
        }
        .environment(\.zoomNamespace, zoom)
    }
}
