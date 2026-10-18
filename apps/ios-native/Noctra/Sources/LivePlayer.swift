import AVFoundation
import AVKit
import Observation
import SwiftUI
import UIKit

// Lecteur de la TV en direct : vidéo (lecteur d'Apple, image dans l'image,
// AirPlay) ou lecteur web d'un site, avec changement de chaîne et de serveur
// sans quitter le lecteur, et passage au serveur suivant en cas de coupure.

@MainActor
@Observable
final class LivePlayerModel {
    static let shared = LivePlayerModel()

    var presented = false
    private(set) var channel: LiveChannel?
    private(set) var context: [LiveChannel] = []
    var servers: [LiveServer] = []
    private(set) var current: LiveServer?
    private(set) var web: WebPlayerRequest?
    private(set) var status: String?
    private(set) var loading = false
    private(set) var paused = false
    let player = AVPlayer()

    @ObservationIgnored weak var session: Session?
    @ObservationIgnored var pip: AVPictureInPictureController?
    @ObservationIgnored private var tried: Set<UUID> = []
    @ObservationIgnored private var watch: Task<Void, Never>?
    @ObservationIgnored private var stallObserver: NSObjectProtocol?
    @ObservationIgnored private var stalls = 0
    @ObservationIgnored private var readyAt: Date?
    @ObservationIgnored private var generation = 0

    init() {
        player.automaticallyWaitsToMinimizeStalling = true
        player.allowsExternalPlayback = true
    }

    var position: Int? { channel.flatMap { current in context.firstIndex { $0.id == current.id } } }

    // MARK: Lancement

    func start(channel: LiveChannel, servers: [LiveServer], first: LiveServer, context: [LiveChannel], session: Session) {
        self.session = session
        self.channel = channel
        self.context = context.contains(where: { $0.id == channel.id }) ? context : [channel] + context
        self.servers = servers
        tried = []
        presented = true
        UIApplication.shared.isIdleTimerDisabled = true
        play(first)
        refreshProbes()
    }

    /// Autre chaîne depuis le lecteur : ses serveurs sont préparés, le meilleur démarre.
    func open(_ target: LiveChannel) {
        guard let session else { return }
        finishMeasure()
        generation += 1
        let token = generation
        channel = target
        servers = []
        current = nil
        web = nil
        tried = []
        loading = true
        status = "Recherche des serveurs de « \(target.name) »…"
        player.pause()
        player.replaceCurrentItem(with: nil)
        LiveStore.shared.noteRecent(target)
        Task {
            let list = await LiveLauncher.shared.prepare(target, session: session)
            guard token == generation else { return }
            servers = list
            if let best = list.first {
                play(best)
                refreshProbes()
            } else {
                loading = false
                status = "Aucun serveur ne propose « \(target.name) » pour le moment."
            }
        }
    }

    /// Chaîne précédente (-1) ou suivante (+1) de la liste d'où elle a été ouverte.
    func zap(_ delta: Int) {
        guard context.count > 1, let index = position else { return }
        open(context[(index + delta + context.count) % context.count])
    }

    /// Serveur choisi (ou suivant) : flux du lecteur d'Apple, lecteur web, ou serveur à résoudre.
    func play(_ server: LiveServer) {
        guard let session, let channel else { return }
        finishMeasure()
        generation += 1
        let token = generation
        watch?.cancel()
        tried.insert(server.id)
        current = server
        loading = true
        status = "Connexion à \(server.label)…"
        switch server.kind {
        case .resolve:
            watch = Task {
                let found = LiveHealth.rank(await LiveServerFactory.resolve(server, session: session), channel: channel.id)
                guard token == generation else { return }
                if let index = servers.firstIndex(where: { $0.id == server.id }) { servers.replaceSubrange(index...index, with: found) }
                if let first = found.first { play(first) } else { fail(server) }
            }
        case .web:
            stopVideo()
            if let url = server.pageURL { web = WebPlayerRequest(title: channel.name, mode: .page(url)) }
            loading = false
            status = nil
        case .native where server.mpegts:
            stopVideo()
            if let url = server.streamURL { web = WebPlayerRequest(title: channel.name, mode: .mpegts(url)) }
            loading = false
            status = nil
        case .native:
            guard let url = server.streamURL else { fail(server); return }
            web = nil
            var headers = server.headers
            if session.isNoctraOrigin(url), let auth = session.token { headers["x-noctra-token"] = auth }
            var options: [String: Any] = ["AVURLAssetHTTPHeaderFieldsKey": headers]
            let cookies = session.noctraCookies(for: url)
            if !cookies.isEmpty { options[AVURLAssetHTTPCookiesKey] = cookies }
            let item = AVPlayerItem(asset: AVURLAsset(url: url, options: options))
            item.preferredForwardBufferDuration = 0
            let title = AVMutableMetadataItem()
            title.identifier = .commonIdentifierTitle
            title.value = channel.name as NSString
            title.extendedLanguageTag = "und"
            item.externalMetadata = [title]
            player.replaceCurrentItem(with: item)
            paused = false
            player.play()
            stalls = 0
            stallObserver = NotificationCenter.default.addObserver(forName: AVPlayerItem.playbackStalledNotification, object: item, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.stalls += 1 }
            }
            watch = Task { [weak self] in
                let started = Date()
                var ready = false
                var waitingSince: Date?
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(500))
                    guard let self, token == self.generation else { return }
                    if item.status == .failed { self.fail(server); return }
                    if !ready {
                        if item.status == .readyToPlay && (self.player.timeControlStatus == .playing || self.paused) {
                            ready = true
                            self.readyAt = Date()
                            self.loading = false
                            self.status = nil
                            LiveHealth.record(server, channel: channel.id, ok: true)
                        } else if Date().timeIntervalSince(started) > 14 {
                            self.fail(server)
                            return
                        }
                    } else if !self.paused && self.player.timeControlStatus == .waitingToPlayAtSpecifiedRate {
                        // Coupure : 15 s sans image, serveur suivant.
                        let since = waitingSince ?? Date()
                        waitingSince = since
                        self.loading = true
                        if Date().timeIntervalSince(since) > 15 {
                            self.stalls += 3
                            self.fail(server, message: "Coupure prolongée : serveur suivant…")
                            return
                        }
                    } else {
                        waitingSince = nil
                        self.loading = false
                    }
                }
            }
        }
    }

    private func fail(_ server: LiveServer, message: String = "Ce serveur ne répond pas : serveur suivant…") {
        guard let channel else { return }
        LiveHealth.record(server, channel: channel.id, ok: false)
        let failing: [LiveServer.Probe] = [.down, .noVideo, .stale]
        let candidate = servers.first { !tried.contains($0.id) && !failing.contains($0.probe) && !$0.manualOnly }
            ?? servers.first { !tried.contains($0.id) }
        guard let candidate else {
            stopVideo()
            loading = false
            status = "Aucun serveur de « \(channel.name) » ne répond. Essayez un autre serveur ou une autre chaîne."
            return
        }
        play(candidate)
        status = message
    }

    /// Tests des flux en arrière-plan, pour la liste des serveurs du lecteur.
    private func refreshProbes() {
        guard let session else { return }
        let token = channel?.id
        let targets = servers.filter { $0.kind == .native && $0.probe == .untested }.prefix(10)
        for target in targets {
            Task {
                let (state, ms, margin) = await LiveServerFactory.probe(target, session: session)
                guard channel?.id == token, let index = servers.firstIndex(where: { $0.id == target.id }) else { return }
                servers[index].probe = state
                servers[index].probeMs = ms
                servers[index].margin = margin
            }
        }
    }

    func togglePause() {
        if paused { player.play() } else { player.pause() }
        paused.toggle()
    }

    private func stopVideo() {
        watch?.cancel()
        player.pause()
        player.replaceCurrentItem(with: nil)
    }

    private func finishMeasure() {
        if let readyAt, let server = current, let channel {
            LiveHealth.recordSmooth(server, channel: channel.id, stalls: stalls, seconds: Date().timeIntervalSince(readyAt))
        }
        readyAt = nil
        stalls = 0
        if let stallObserver { NotificationCenter.default.removeObserver(stallObserver) }
        stallObserver = nil
    }

    func close() {
        finishMeasure()
        generation += 1
        stopVideo()
        pip?.stopPictureInPicture()
        web = nil
        current = nil
        status = nil
        presented = false
        UIApplication.shared.isIdleTimerDisabled = false
    }
}

// MARK: Écran du lecteur

struct LivePlayerView: View {
    @Environment(Session.self) private var session
    @State private var controls = true
    @State private var hideTask: Task<Void, Never>?
    @State private var showChannels = false
    @State private var showServers = false
    @State private var drag: CGFloat = 0
    @State private var zaps = 0
    private var model: LivePlayerModel { .shared }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let web = model.web {
                LiveWebView(request: web, session: session)
                    .id(web.id)
                    .ignoresSafeArea()
            } else {
                PlayerLayerView(player: model.player)
                    .ignoresSafeArea()
                    .offset(y: drag / 3)
                    .contentShape(Rectangle())
                    .onTapGesture { toggleControls() }
                    .gesture(DragGesture(minimumDistance: 30).onChanged { drag = $0.translation.height }.onEnded { value in
                        // Glisser vers le haut : chaîne suivante ; vers le bas : précédente.
                        if value.translation.height < -80 { zap(1) } else if value.translation.height > 80 { zap(-1) }
                        withAnimation(Theme.spring) { drag = 0 }
                    })
            }
            if model.loading || model.status != nil {
                VStack(spacing: 12) {
                    if model.loading { ProgressView().controlSize(.large).tint(.white) }
                    if let status = model.status {
                        Text(status).font(.subheadline.weight(.semibold)).multilineTextAlignment(.center)
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .glassEffect(.regular.tint(.black.opacity(0.4)), in: Capsule())
                    }
                }
                .padding(.horizontal, 30)
                .allowsHitTesting(false)
            }
            if controls || model.web != nil { overlay.transition(.opacity) }
        }
        .foregroundStyle(.white)
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .animation(Theme.spring, value: controls)
        .sensoryFeedback(.selection, trigger: zaps)
        .sheet(isPresented: $showChannels) {
            LiveChannelSheet { channel in
                showChannels = false
                model.open(channel)
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showServers) {
            LivePlayerServers { server in
                showServers = false
                model.play(server)
            }
            .presentationDetents([.medium, .large])
        }
        .onAppear { scheduleHide() }
    }

    private var overlay: some View {
        VStack {
            HStack(spacing: 10) {
                circleButton("xmark") { model.close() }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        if let number = model.channel?.number, number > 0, LiveStore.shared.country == "fr" {
                            Text("\(number)").font(.caption.weight(.heavy).monospacedDigit()).foregroundStyle(Theme.teal)
                        }
                        Text(model.channel?.name ?? "").font(.headline).lineLimit(1)
                        Text("EN DIRECT").font(.system(size: 9, weight: .heavy)).padding(.horizontal, 5).padding(.vertical, 2)
                            .background(.red, in: Capsule())
                    }
                    if let server = model.current {
                        Text((server.vip ? "VIP · " : "") + server.label).font(.caption).foregroundStyle(.white.opacity(0.75)).lineLimit(1)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .glassEffect(.regular.tint(.black.opacity(0.35)), in: Capsule())
                Spacer(minLength: 4)
                if model.web == nil {
                    AirPlayButton().frame(width: 44, height: 44).glassEffect(.regular, in: Circle())
                    if AVPictureInPictureController.isPictureInPictureSupported() {
                        circleButton("pip.enter") { model.pip?.startPictureInPicture() }
                    }
                }
            }
            Spacer()
            HStack(spacing: 12) {
                pill("chevron.up", "Préc.") { zap(-1) }
                if model.web == nil {
                    circleButton(model.paused ? "play.fill" : "pause.fill", size: 58) { model.togglePause(); scheduleHide() }
                }
                pill("chevron.down", "Suiv.") { zap(1) }
                Spacer(minLength: 4)
                pill("list.bullet", "Chaînes") { showChannels = true }
                pill("server.rack", "Serveurs · \(model.servers.count)") { showServers = true }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func circleButton(_ icon: String, size: CGFloat = 44, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(size > 50 ? .title2 : .headline).frame(width: size, height: size)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: Circle())
    }

    private func pill(_ icon: String, _ title: String, action: @escaping () -> Void) -> some View {
        Button {
            action()
            scheduleHide()
        } label: {
            Label(title, systemImage: icon).font(.subheadline.weight(.semibold)).lineLimit(1)
                .padding(.horizontal, 14).padding(.vertical, 10)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: Capsule())
    }

    private func zap(_ delta: Int) {
        zaps += 1
        model.zap(delta)
    }

    private func toggleControls() {
        controls.toggle()
        if controls { scheduleHide() }
    }

    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled, model.web == nil, !showChannels, !showServers else { return }
            controls = false
        }
    }
}

/// Couche vidéo du lecteur d'Apple, avec image dans l'image.
struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    final class LayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeUIView(context: Context) -> LayerView {
        let view = LayerView()
        view.backgroundColor = .black
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspect
        if AVPictureInPictureController.isPictureInPictureSupported(), let pip = AVPictureInPictureController(playerLayer: view.playerLayer) {
            pip.canStartPictureInPictureAutomaticallyFromInline = true
            LivePlayerModel.shared.pip = pip
        }
        return view
    }

    func updateUIView(_ uiView: LayerView, context: Context) {
        if uiView.playerLayer.player !== player { uiView.playerLayer.player = player }
    }
}

/// Chaînes depuis le lecteur : liste d'où la chaîne a été ouverte, puis toutes.
struct LiveChannelSheet: View {
    let choose: (LiveChannel) -> Void
    @State private var query = ""
    private var model: LivePlayerModel { .shared }
    private var store: LiveStore { .shared }

    private var shown: [LiveChannel] {
        let term = query.trimmingCharacters(in: .whitespaces)
        let base = term.isEmpty ? model.context : store.channels + store.events
        return term.isEmpty ? base : base.filter { $0.name.localizedCaseInsensitiveContains(term) }
    }

    var body: some View {
        NavigationStack {
            List(shown) { channel in
                Button {
                    choose(channel)
                } label: {
                    HStack(spacing: 12) {
                        Text(channel.number > 0 && store.country == "fr" ? "\(channel.number)" : "")
                            .font(.caption.weight(.heavy).monospacedDigit()).foregroundStyle(Theme.teal).frame(width: 28)
                        Text(channel.name).font(.subheadline.weight(channel.id == model.channel?.id ? .bold : .regular))
                        Spacer()
                        if channel.vip { Image(systemName: "crown.fill").font(.caption2).foregroundStyle(Color(hex: 0xFCD34D)) }
                        if channel.id == model.channel?.id { Image(systemName: "play.fill").foregroundStyle(Theme.teal) }
                    }
                }
                .foregroundStyle(.white)
            }
            .navigationTitle("Chaînes")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Toutes les chaînes")
        }
    }
}

/// Serveurs de la chaîne en cours, classés, avec leur état.
struct LivePlayerServers: View {
    let choose: (LiveServer) -> Void
    private var model: LivePlayerModel { .shared }

    var body: some View {
        NavigationStack {
            List(model.servers) { server in
                Button {
                    choose(server)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: server.id == model.current?.id ? "play.circle.fill" : server.kind == .web ? "safari" : "dot.radiowaves.left.and.right")
                            .foregroundStyle(server.id == model.current?.id ? Theme.teal : Theme.muted)
                        VStack(alignment: .leading, spacing: 3) {
                            Text((server.vip ? "VIP · " : "") + server.label).font(.subheadline.weight(.semibold)).lineLimit(2)
                            Text(LiveHealth.text(server, channel: model.channel?.id ?? "")).font(.caption).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Text(probeText(server)).font(.caption2.weight(.bold)).foregroundStyle(probeColor(server))
                    }
                }
                .foregroundStyle(.white)
            }
            .navigationTitle(model.channel?.name ?? "Serveurs")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func probeText(_ server: LiveServer) -> String {
        switch server.probe {
        case .up: return "En ligne"
        case .slow: return "Lent"
        case .down: return "Hors ligne"
        case .noVideo: return "Pas de vidéo"
        case .stale: return "Figé"
        case .testing: return "Test…"
        case .untested: return server.kind == .web ? "Lecteur web" : server.kind == .resolve ? "Automatique" : ""
        }
    }

    private func probeColor(_ server: LiveServer) -> Color {
        switch server.probe {
        case .up: return Theme.teal
        case .slow, .stale: return .orange
        case .down, .noVideo: return .red
        default: return Theme.muted
        }
    }
}
