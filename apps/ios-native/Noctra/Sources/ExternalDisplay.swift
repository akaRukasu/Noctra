import AVFoundation
import Observation
import SwiftUI
import UIKit

/// Écran externe (recopie AirPlay, adaptateur HDMI) : pendant une chaîne ou un multiview, le
/// téléviseur affiche la vidéo seule, en plein écran, comme le lecteur des vidéos ; l'iPhone garde
/// les commandes. Le reste du temps, l'écran de l'iPhone est recopié comme d'habitude.
@MainActor
@Observable
final class ExternalDisplay {
    static let shared = ExternalDisplay()

    /// Un écran externe est branché ou recopié.
    private(set) var connected = false
    /// La vidéo y est affichée (sinon : recopie de l'iPhone).
    private(set) var showing = false
    @ObservationIgnored private weak var scene: UIWindowScene?
    @ObservationIgnored private var window: UIWindow?

    /// Contenu à montrer sur le téléviseur : chaîne lue par le lecteur d'Apple, ou multiview.
    private var needed: Bool {
        let live = LivePlayerModel.shared
        return (live.presented && live.web == nil && live.current != nil) || MultiviewStore.shared.presented
    }

    func attach(_ scene: UIWindowScene) {
        self.scene = scene
        connected = true
        track()
        LivePlayerModel.shared.externalScreenChanged()
    }

    func detach() {
        window?.isHidden = true
        window = nil
        scene = nil
        connected = false
        showing = false
        LivePlayerModel.shared.externalScreenChanged()
    }

    private func track() {
        update()
        withObservationTracking { _ = needed } onChange: {
            Task { @MainActor [weak self] in
                guard let self, self.scene != nil else { return }
                self.track()
            }
        }
    }

    private func update() {
        guard let scene else { return }
        if needed {
            guard window == nil else { return }
            let window = UIWindow(windowScene: scene)
            let host = UIHostingController(rootView: ExternalDisplayView())
            host.view.backgroundColor = .black
            window.rootViewController = host
            window.isHidden = false
            self.window = window
            showing = true
        } else if window != nil {
            // Plus rien à montrer : la recopie de l'iPhone reprend.
            window?.isHidden = true
            window = nil
            showing = false
        }
    }
}

/// Scène de l'écran externe (déclarée dans Info.plist).
final class ExternalDisplaySceneDelegate: UIResponder, UIWindowSceneDelegate {
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        MainActor.assumeIsolated { ExternalDisplay.shared.attach(scene) }
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        MainActor.assumeIsolated { ExternalDisplay.shared.detach() }
    }
}

/// Ce que montre le téléviseur : la chaîne en plein écran, ou les vignettes du multiview.
struct ExternalDisplayView: View {
    private var live: LivePlayerModel { .shared }
    private var multiview: MultiviewStore { .shared }

    var body: some View {
        ZStack {
            Color.black
            if multiview.presented {
                GeometryReader { geometry in
                    let frames = Self.layout(count: multiview.tiles.count, featured: multiview.tiles.firstIndex { $0.id == (multiview.zoomed ?? multiview.featured) }, zoomed: multiview.zoomed != nil, in: geometry.size)
                    ForEach(Array(multiview.tiles.enumerated()), id: \.element.id) { index, tile in
                        if index < frames.count, frames[index].width > 0 {
                            MultiviewLayer(player: tile.player)
                                .frame(width: frames[index].width, height: frames[index].height)
                                .overlay(alignment: .bottomLeading) {
                                    HStack(spacing: 6) {
                                        if multiview.audio == tile.id { Image(systemName: "speaker.wave.2.fill") }
                                        Text(tile.channel.name).lineLimit(1)
                                    }
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(.black.opacity(0.6), in: Capsule())
                                    .padding(10)
                                }
                                .offset(x: frames[index].minX, y: frames[index].minY)
                        }
                    }
                }
            } else if live.presented {
                ExternalPlayerLayer(player: live.player)
            }
        }
        .ignoresSafeArea()
    }

    /// Grille, chaîne mise en avant (3/4 de l'écran, les autres à droite puis en bas) ou plein écran.
    static func layout(count: Int, featured: Int?, zoomed: Bool, in size: CGSize) -> [CGRect] {
        guard count > 0 else { return [] }
        if let featured, zoomed {
            return (0..<count).map { $0 == featured ? CGRect(origin: .zero, size: size) : .zero }
        }
        if let featured, count > 1, count <= 8 {
            let big = CGSize(width: size.width * 0.75, height: size.height * 0.75)
            let small = CGSize(width: size.width / 4, height: size.height / 4)
            var slots: [CGPoint] = (0..<3).map { CGPoint(x: big.width, y: CGFloat($0) * small.height) }
            slots += (0..<4).map { CGPoint(x: CGFloat($0) * small.width, y: big.height) }
            var next = 0
            return (0..<count).map { index in
                if index == featured { return CGRect(origin: .zero, size: big) }
                defer { next += 1 }
                return CGRect(origin: slots[next], size: small)
            }
        }
        let columns = count <= 1 ? 1 : count <= 4 ? 2 : 3
        let rows = Int(ceil(Double(count) / Double(columns)))
        let cell = CGSize(width: size.width / CGFloat(columns), height: size.height / CGFloat(rows))
        return (0..<count).map { index in
            let row = index / columns
            let inRow = row == rows - 1 ? count - row * columns : columns
            let shift = CGFloat(columns - inRow) * cell.width / 2
            return CGRect(x: shift + CGFloat(index % columns) * cell.width, y: CGFloat(row) * cell.height, width: cell.width, height: cell.height)
        }
    }
}

/// Image de la chaîne sur le téléviseur (même lecteur que l'iPhone, sans image dans l'image).
struct ExternalPlayerLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerLayerView.LayerView {
        let view = PlayerLayerView.LayerView()
        view.backgroundColor = .black
        view.playerLayer.videoGravity = .resizeAspect
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ uiView: PlayerLayerView.LayerView, context: Context) {
        if uiView.playerLayer.player !== player { uiView.playerLayer.player = player }
    }
}
