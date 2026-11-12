import AVFoundation
import Observation
import SwiftUI
import UIKit.UIGestureRecognizerSubclass
import WebKit

/// Multiview : plusieurs chaînes de n'importe quelle source à l'écran, comme sur la version web
/// et Noctra TV. Une chaîne est écoutée, une peut être mise en avant, chacune passe seule au
/// serveur suivant quand son flux tombe. Diffusable vers Noctra TV, un Chromecast ou AirPlay
/// (image composée par le serveur Noctra), puis pilotable depuis l'iPhone.
@MainActor
@Observable
final class MultiviewStore {
    static let shared = MultiviewStore()
    static let maxTiles = 9

    /// Chaînes choisies dans les listes (avant le lancement).
    var picked: [LiveChannel] = []
    /// Choix en cours : un appui sur une chaîne l'ajoute ou la retire.
    var selecting = false
    var presented = false
    private(set) var tiles: [MultiviewTile] = []
    private(set) var audio: UUID?
    private(set) var featured: UUID?
    /// Vignette en plein écran (les autres continuent en arrière-plan).
    private(set) var zoomed: UUID?
    @ObservationIgnored private weak var session: Session?

    /// Téléviseur qui reçoit le multiview composé par le serveur (Chromecast ou AirPlay).
    enum CastTarget: Equatable {
        case chromecast(ChromecastDevice)
        case airplay
    }
    private(set) var castTarget: CastTarget?
    private(set) var castNote: String?
    @ObservationIgnored private var mosaicID: String?
    @ObservationIgnored private var mosaicTask: Task<Void, Never>?
    /// Lecteur envoyé à l'Apple TV (lecture AirPlay de l'image composée).
    @ObservationIgnored private var airPlayer: AVPlayer?

    var castName: String? {
        switch castTarget {
        case .chromecast(let device): device.name
        case .airplay: "AirPlay"
        case nil: nil
        }
    }

    func contains(_ channel: LiveChannel) -> Bool { picked.contains { $0.id == channel.id } }

    func toggle(_ channel: LiveChannel) {
        if let index = picked.firstIndex(where: { $0.id == channel.id }) { picked.remove(at: index); return }
        guard picked.count < Self.maxTiles else { return }
        picked.append(channel)
    }

    func clear() { picked = []; selecting = false }

    /// Lancement : les chaînes choisies démarrent l'une après l'autre (moins d'échecs au départ).
    func launch(session: Session, present: Bool = true) {
        guard !picked.isEmpty else { return }
        self.session = session
        LivePlayerModel.shared.close()
        stopAll()
        tiles = picked.prefix(Self.maxTiles).map { MultiviewTile(channel: $0) }
        audio = tiles.first?.id
        featured = nil
        zoomed = nil
        selecting = false
        presented = present
        UIApplication.shared.isIdleTimerDisabled = true
        for (index, tile) in tiles.enumerated() {
            tile.start(session: session, delay: Double(index) * 0.4)
        }
        applyAudio()
    }

    func add(_ channel: LiveChannel) {
        guard let session, tiles.count < Self.maxTiles, !tiles.contains(where: { $0.channel.id == channel.id }) else { return }
        let tile = MultiviewTile(channel: channel)
        tiles.append(tile)
        if !picked.contains(where: { $0.id == channel.id }) { picked.append(channel) }
        tile.start(session: session, delay: 0)
        applyAudio()
        mosaicChanged()
    }

    func remove(_ tile: MultiviewTile) {
        tile.stop()
        tiles.removeAll { $0.id == tile.id }
        picked.removeAll { $0.id == tile.channel.id }
        if featured == tile.id { featured = nil }
        if zoomed == tile.id { zoomed = nil }
        if audio == tile.id { audio = tiles.first?.id }
        if tiles.isEmpty { close() } else { applyAudio(); mosaicChanged() }
    }

    func listen(_ tile: MultiviewTile) { audio = tile.id; applyAudio(); mosaicChanged() }

    func feature(_ tile: MultiviewTile) { zoomed = nil; featured = featured == tile.id || tiles.count < 2 ? nil : tile.id; mosaicChanged() }

    /// Chaîne mise en avant, et seule écoutée.
    func solo(_ tile: MultiviewTile) {
        audio = tile.id
        featured = tiles.count > 1 ? tile.id : nil
        zoomed = nil
        applyAudio()
        mosaicChanged()
    }

    func grid() { featured = nil; zoomed = nil; mosaicChanged() }

    /// Plein écran d'une vignette, avec son son.
    func zoom(_ tile: MultiviewTile) {
        zoomed = zoomed == tile.id ? nil : tile.id
        if zoomed != nil { audio = tile.id; applyAudio() }
        mosaicChanged()
    }

    func close() {
        stopCasting()
        stopAll()
        tiles = []
        featured = nil
        zoomed = nil
        presented = false
        UIApplication.shared.isIdleTimerDisabled = false
    }

    private func stopAll() { tiles.forEach { $0.stop() } }

    private func applyAudio() {
        // Multiview diffusé : le son passe par le téléviseur, l'iPhone reste muet.
        for tile in tiles { tile.setMuted(castTarget != nil || tile.id != audio) }
    }

    // MARK: Diffusion (Chromecast, AirPlay)

    /// Diffusion sur un Chromecast ; lancée d'abord ici si le multiview ne l'est pas encore.
    func cast(to device: ChromecastDevice, session: Session) async throws {
        let url = try await prepareMosaic(session: session)
        ChromecastController.shared.endLive()
        try await ChromecastController.shared.castStream(url, title: "Multiview", subtitle: tiles.map(\.channel.name).joined(separator: " · "), image: nil, to: device)
        airPlayer?.pause()
        airPlayer = nil
        castTarget = .chromecast(device)
        castNote = nil
        applyAudio()
    }

    /// Diffusion AirPlay : l'image composée part vers l'Apple TV choisie dans le menu AirPlay.
    func castAirPlay(session: Session) async throws {
        // Recopie d'écran (récepteur sans lecture de flux) : le multiview s'y affiche déjà en plein écran.
        if ExternalDisplay.shared.connected {
            castNote = "Recopie de l’écran : le téléviseur affiche le multiview en plein écran."
            return
        }
        let url = try await prepareMosaic(session: session)
        let player = AVPlayer(url: url)
        player.allowsExternalPlayback = true
        player.play()
        // Le récepteur doit lire le flux lui-même (Apple TV, téléviseur AirPlay) ; sinon rien n'y apparaîtrait.
        let started = Date()
        while !player.isExternalPlaybackActive && Date().timeIntervalSince(started) < 6 {
            try await Task.sleep(for: .milliseconds(300))
        }
        guard player.isExternalPlaybackActive else {
            player.pause()
            if let id = mosaicID { Task { _ = try? await session.noctraSend("DELETE", "/api/tv/mosaic/\(id)", json: nil, timeout: 10) } }
            mosaicID = nil
            throw NSError(domain: "NoctraMultiview", code: 4, userInfo: [NSLocalizedDescriptionKey: "Cet appareil AirPlay ne lit pas les flux vidéo (son seul ou recopie d’écran). Utilisez la recopie de l’écran : le multiview de l’iPhone s’y affiche."])
        }
        airPlayer = player
        if case .chromecast = castTarget { ChromecastController.shared.stop() }
        castTarget = .airplay
        castNote = nil
        applyAudio()
    }

    func stopCasting() {
        mosaicTask?.cancel()
        switch castTarget {
        case .chromecast: ChromecastController.shared.stop()
        case .airplay: airPlayer?.pause(); airPlayer = nil
        case nil: break
        }
        castTarget = nil
        castNote = nil
        if let id = mosaicID, let session {
            Task { _ = try? await session.noctraSend("DELETE", "/api/tv/mosaic/\(id)", json: nil, timeout: 10) }
        }
        mosaicID = nil
        applyAudio()
    }

    /// Une vignette lit (de nouveau) : la mosaïque diffusée la reprend.
    func tilePlaying(_ tile: MultiviewTile) { mosaicChanged() }

    /// Multiview lancé si besoin, puis attente des chaînes qui lisent (au plus 45 s), puis mosaïque.
    private func prepareMosaic(session: Session) async throws -> URL {
        self.session = session
        // Serveur à jour et ffmpeg présent, avant de lancer quoi que ce soit.
        guard let check = try? await session.noctraJSON("/api/tv/mosaic", timeout: 15) as? [String: Any] else {
            throw NSError(domain: "NoctraMultiview", code: 2, userInfo: [NSLocalizedDescriptionKey: "Diffuser le multiview sur Chromecast ou AirPlay nécessite le serveur Noctra 200.0.144."])
        }
        guard check["available"] as? Bool == true else {
            throw NSError(domain: "NoctraMultiview", code: 3, userInfo: [NSLocalizedDescriptionKey: "ffmpeg est introuvable sur le serveur Noctra : il compose le multiview diffusé. Indiquez son chemin dans NOCTRA_FFMPEG."])
        }
        // Lancé depuis la barre des chaînes : multiview démarré sans l'ouvrir sous la feuille de diffusion.
        if tiles.isEmpty { launch(session: session, present: false) }
        let started = Date()
        while Date().timeIntervalSince(started) < 45 {
            let playing = tiles.filter(\.playing).count
            if playing == tiles.count || (playing > 0 && Date().timeIntervalSince(started) > 12) { break }
            try await Task.sleep(for: .milliseconds(500))
        }
        return try await requestMosaic(wait: true)
    }

    /// Chaînes qui lisent, envoyées au serveur dans l'ordre affiché (adresse, en-têtes, son, mise en avant).
    private func requestMosaic(wait: Bool) async throws -> URL {
        guard let session else { throw NoctraError.empty }
        let live = tiles.filter { $0.playing && $0.current?.streamURL != nil }
        guard !live.isEmpty else {
            throw NSError(domain: "NoctraMultiview", code: 1, userInfo: [NSLocalizedDescriptionKey: "Aucune chaîne du multiview ne lit encore : réessayez quand une image apparaît."])
        }
        let list: [[String: Any]] = live.compactMap { tile in
            guard let server = tile.current, let stream = server.streamURL else { return nil }
            let parts = URLComponents(url: stream, resolvingAgainstBaseURL: false)
            let address = session.isNoctraOrigin(stream) ? (parts?.percentEncodedPath ?? stream.path) + (parts?.percentEncodedQuery.map { "?" + $0 } ?? "") : stream.absoluteString
            return ["url": address, "headers": server.headers, "name": tile.channel.name]
        }
        let main = zoomed ?? featured
        var body: [String: Any] = [
            "tiles": list,
            "audio": live.firstIndex { $0.id == audio } ?? 0,
            "featured": main.flatMap { id in live.firstIndex { $0.id == id } } ?? -1,
            "wait": wait
        ]
        if let mosaicID { body["id"] = mosaicID }
        let json = try await session.noctraSend("POST", "/api/tv/mosaic", json: body, timeout: 40) as? [String: Any]
        guard let id = json?["id"] as? String, let cast = json?["cast"] as? String, let url = session.noctraURL(cast) else { throw NoctraError.empty }
        mosaicID = id
        return url
    }

    /// Changement pendant la diffusion : mosaïque mise à jour (même adresse, le téléviseur continue).
    private func mosaicChanged() {
        guard castTarget != nil else { return }
        if case .chromecast = castTarget, !ChromecastController.shared.isActive { stopCasting(); return }
        mosaicTask?.cancel()
        mosaicTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1.2))
            guard let self, !Task.isCancelled, self.castTarget != nil else { return }
            do {
                _ = try await self.requestMosaic(wait: false)
                self.castNote = nil
            } catch {
                self.castNote = error.localizedDescription
            }
        }
    }

    /// Chaînes à diffuser : celles affichées, sinon celles choisies.
    var castChannels: [LiveChannel] { tiles.isEmpty ? picked : tiles.map(\.channel) }
}

/// Vignette du multiview : une chaîne, son lecteur, ses serveurs essayés dans l'ordre.
@MainActor
@Observable
final class MultiviewTile: Identifiable {
    let id = UUID()
    let channel: LiveChannel
    let player = AVPlayer()
    private(set) var status: String? = "Recherche des serveurs…"
    private(set) var server: String?
    private(set) var count = 0
    /// Serveur en cours et lecture effective (pour la mosaïque diffusée).
    private(set) var current: LiveServer?
    private(set) var playing = false
    /// Lecteur du site ou flux MPEG-TS lu par le moteur web (sinon : lecteur d'Apple).
    private(set) var web: WebPlayerRequest?
    @ObservationIgnored weak var webView: WKWebView?
    @ObservationIgnored private(set) var muted = true
    /// Page du site affichée en entier (sinon : vidéo seule, le reste du site masqué).
    private(set) var fullPage = false
    @ObservationIgnored private var servers: [LiveServer] = []
    @ObservationIgnored private var index = -1
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private weak var session: Session?
    @ObservationIgnored private var rounds = 0

    init(channel: LiveChannel) {
        self.channel = channel
        player.automaticallyWaitsToMinimizeStalling = true
        player.isMuted = true
        // AirPlay : seule l'image composée part vers l'Apple TV, pas chaque vignette.
        player.allowsExternalPlayback = false
    }

    func start(session: Session, delay: Double) {
        self.session = session
        generation += 1
        let token = generation
        let channel = channel
        task = Task { [weak self] in
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            let prepared = await LiveLauncher.shared.prepare(channel, session: session)
            guard let self, token == self.generation else { return }
            // Flux directs (lecteur d'Apple) et serveurs automatiques d'abord, puis les flux MPEG-TS (moteur web)
            // et les lecteurs des sites : une chaîne sans flux direct passe quand même dans le multiview.
            self.servers = Self.ordered(prepared)
            self.count = self.servers.count
            guard !self.servers.isEmpty else { self.status = "Aucun serveur pour le multiview"; return }
            self.index = -1
            self.next()
        }
    }

    func stop() {
        generation += 1
        task?.cancel()
        task = nil
        playing = false
        web = nil
        player.replaceCurrentItem(with: nil)
    }

    /// Serveur suivant (choix manuel ou flux tombé) ; nouvel essai de toute la liste ensuite.
    func next() {
        guard let session else { return }
        playing = false
        guard !servers.isEmpty else { status = "Aucun serveur pour le multiview"; return }
        index += 1
        if index >= servers.count {
            index = -1
            rounds += 1
            guard rounds <= 3 else { status = "Flux indisponible · touchez pour réessayer"; return }
            status = "Flux indisponible · nouvel essai dans 20 s"
            generation += 1
            let token = generation
            task = Task { [weak self] in
                try? await Task.sleep(for: .seconds(20))
                guard let self, token == self.generation else { return }
                self.next()
            }
            return
        }
        let candidate = servers[index]
        generation += 1
        let token = generation
        task?.cancel()
        if candidate.kind == .resolve {
            status = "Connexion à \(candidate.label)…"
            task = Task { [weak self] in
                let found = await LiveServerFactory.resolve(candidate, session: session, timeout: candidate.vip ? 60 : 30)
                guard let self, token == self.generation else { return }
                let playable = Self.ordered(found).filter { $0.kind != .resolve }
                self.servers.replaceSubrange(self.index...self.index, with: playable)
                self.count = self.servers.count
                self.index -= 1
                self.next()
            }
            return
        }
        if candidate.kind == .web || candidate.mpegts { playWeb(candidate, token: token, session: session); return }
        play(candidate, token: token, session: session)
    }

    func retry() { rounds = 0; index = -1; next() }

    /// Serveurs lisibles dans une vignette, dans l'ordre d'essai.
    private static func ordered(_ list: [LiveServer]) -> [LiveServer] {
        let direct = list.filter { ($0.kind == .native && $0.streamURL != nil && !$0.mpegts) || $0.kind == .resolve }
        let engine = list.filter { $0.kind == .native && $0.streamURL != nil && $0.mpegts }
        let pages = list.filter { $0.kind == .web && ($0.pageURL != nil || $0.relayPrepare != nil) }
        return direct + engine + pages
    }

    /// Vidéo seule ou page entière du site (tous ses cadres).
    func setFullPage(_ value: Bool) {
        fullPage = value
        webView?.evaluateJavaScript("window.__noctraFocus&&window.__noctraFocus(\(!value))") { _, _ in }
    }

    /// Son de la vignette : lecteur d'Apple, et vidéos de la page (tous ses cadres).
    func setMuted(_ value: Bool) {
        muted = value
        player.isMuted = value
        webView?.evaluateJavaScript("window.__noctraMute&&window.__noctraMute(\(value))") { _, _ in }
    }

    /// Lecteur du site (page) ou flux MPEG-TS (moteur web) dans la vignette.
    private func playWeb(_ server: LiveServer, token: Int, session: Session) {
        player.replaceCurrentItem(with: nil)
        self.server = server.label
        current = server
        status = "Connexion · \(server.label)…"
        if let prepare = server.relayPrepare, server.pageURL == nil {
            // Relais officiel (LiveWatch VIP) : page préparée par le serveur Noctra.
            task = Task { [weak self] in
                let json = try? await session.noctraJSON(prepare, timeout: 20) as? [String: Any]
                guard let self, token == self.generation else { return }
                guard let raw = json?["embedUrl"] as? String, let url = session.noctraURL(raw) else { self.next(); return }
                var prepared = server
                prepared.pageURL = url
                self.playWeb(prepared, token: token, session: session)
            }
            return
        }
        let request: WebPlayerRequest
        if server.kind == .native, let url = server.streamURL {
            request = WebPlayerRequest(title: channel.name, mode: .mpegts(url))
        } else if let url = server.pageURL {
            request = WebPlayerRequest(title: channel.name, mode: .page(url), framed: server.framed, sandbox: server.sandbox)
        } else {
            next()
            return
        }
        web = request
        fullPage = false
        let page = server.kind == .web
        let channelID = channel.id
        task = Task { [weak self] in
            try? await Task.sleep(for: .seconds(page ? 40 : 30))
            guard let self, token == self.generation, !self.playing else { return }
            if page {
                // Lecteur de site sans lecture signalée : la page reste affichée (bouton Lecture à toucher).
                self.status = nil
            } else {
                LiveHealth.record(server, channel: channelID, ok: false)
                self.status = "Serveur trop lent · essai du suivant…"
                self.next()
            }
        }
    }

    /// Événements de la page de la vignette : vidéo lancée, erreur.
    func webEvent(_ request: UUID, state: String) {
        guard request == web?.id, let server = current else { return }
        switch state {
        case "playing", "ready":
            guard !playing else { return }
            playing = true
            rounds = 0
            status = nil
            LiveHealth.record(server, channel: channel.id, ok: true)
            MultiviewStore.shared.tilePlaying(self)
        case "error":
            guard !playing else { return }
            LiveHealth.record(server, channel: channel.id, ok: false)
            status = "Serveur indisponible · essai du suivant…"
            next()
        default:
            break
        }
    }

    private func play(_ server: LiveServer, token: Int, session: Session) {
        guard let url = server.streamURL else { next(); return }
        web = nil
        self.server = server.label
        current = server
        status = "Connexion · \(server.label)…"
        var headers = server.headers
        if session.isNoctraOrigin(url), let auth = session.token { headers["x-noctra-token"] = auth }
        var options: [String: Any] = ["AVURLAssetHTTPHeaderFieldsKey": headers]
        let cookies = session.noctraCookies(for: url)
        if !cookies.isEmpty { options[AVURLAssetHTTPCookiesKey] = cookies }
        let item = AVPlayerItem(asset: AVURLAsset(url: url, options: options))
        item.preferredForwardBufferDuration = 0
        // Vignette : définition réduite (moins de débit et de décodage pour plusieurs chaînes).
        item.preferredMaximumResolution = CGSize(width: 1280, height: 720)
        player.replaceCurrentItem(with: item)
        player.play()
        let channelID = channel.id
        task = Task { [weak self] in
            let started = Date()
            var ready = false
            var waitingSince: Date?
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard let self, token == self.generation else { return }
                if item.status == .failed {
                    LiveHealth.record(server, channel: channelID, ok: false)
                    self.status = "Serveur indisponible · essai du suivant…"
                    self.next()
                    return
                }
                if !ready {
                    if item.status == .readyToPlay && self.player.timeControlStatus == .playing {
                        ready = true
                        self.rounds = 0
                        self.status = nil
                        self.playing = true
                        LiveHealth.record(server, channel: channelID, ok: true)
                        MultiviewStore.shared.tilePlaying(self)
                    } else if Date().timeIntervalSince(started) > (server.vip ? 30 : 20) {
                        LiveHealth.record(server, channel: channelID, ok: false)
                        self.status = "Serveur trop lent · essai du suivant…"
                        self.next()
                        return
                    }
                } else if self.player.timeControlStatus == .waitingToPlayAtSpecifiedRate {
                    let since = waitingSince ?? Date()
                    waitingSince = since
                    if Date().timeIntervalSince(since) > 15 {
                        self.status = "Coupure · serveur suivant…"
                        self.next()
                        return
                    }
                } else {
                    waitingSince = nil
                }
            }
        }
    }
}

// MARK: Écran

struct MultiviewView: View {
    @Environment(Session.self) private var session
    private var store: MultiviewStore { .shared }
    @State private var menuTile: MultiviewTile?
    @State private var adding = false
    @State private var casting = false
    /// Commandes de Noctra (barre, noms, « … ») : masquées après 4 s, un appui les ramène.
    @State private var chrome = true
    @State private var poked = 0

    private var sheetOpen: Bool { menuTile != nil || adding || casting }

    private func poke() {
        withAnimation(.easeOut(duration: 0.2)) { chrome = true }
        poked += 1
    }

    /// Appui sur une vignette : ramène d'abord les commandes, puis ouvre le menu.
    private func tap(_ tile: MultiviewTile) {
        if chrome { menuTile = tile } else { poke() }
    }

    var body: some View {
        GeometryReader { geometry in
            let frames = layout(in: geometry.size)
            ZStack(alignment: .topLeading) {
                Color.black.ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture { poke() }
                ForEach(Array(store.tiles.enumerated()), id: \.element.id) { index, tile in
                    if index < frames.count {
                        MultiviewTileView(tile: tile, listening: store.audio == tile.id, featured: store.featured == tile.id, chrome: chrome, menu: { tap(tile) }, touched: { poke() })
                            .frame(width: max(1, frames[index].width), height: max(1, frames[index].height))
                            .offset(x: frames[index].minX, y: frames[index].minY)
                            .opacity(frames[index].width > 0 ? 1 : 0)
                            .allowsHitTesting(frames[index].width > 0)
                            // Lecteur de site : les touches vont toujours à la page (lecture, son…) et ramènent les commandes ;
                            // menu par le bouton « … ».
                            .modifier(TileGestures(enabled: tile.web == nil, zoom: { store.zoom(tile) }, menu: { tap(tile) }))
                    }
                }
            }
            .animation(Theme.spring, value: store.featured)
            .animation(Theme.spring, value: store.zoomed)
            .animation(Theme.spring, value: store.tiles.count)
        }
        // Les vignettes prennent tout l'écran : la barre passe au-dessus et s'efface.
        .overlay(alignment: .top) {
            bar
                .simultaneousGesture(TapGesture().onEnded { poke() })
                .padding(.top, 4)
                .opacity(chrome ? 1 : 0)
                .allowsHitTesting(chrome)
        }
        .task(id: "\(poked)-\(sheetOpen)") {
            if sheetOpen { chrome = true; return }
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled, !sheetOpen else { return }
            withAnimation(.easeInOut(duration: 0.4)) { chrome = false }
        }
        .background(Color.black.ignoresSafeArea())
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .confirmationDialog(menuTile?.channel.name ?? "", isPresented: Binding(get: { menuTile != nil }, set: { if !$0 { menuTile = nil } }), titleVisibility: .visible) {
            if let tile = menuTile {
                if store.audio != tile.id { Button("Écouter cette chaîne") { store.listen(tile) } }
                Button(store.zoomed == tile.id ? "Quitter le plein écran" : "Plein écran") { store.zoom(tile) }
                if store.tiles.count > 1 {
                    Button("Mettre en avant avec le son") { store.solo(tile) }
                    Button(store.featured == tile.id ? "Revenir à la grille" : "Mettre en avant") { store.feature(tile) }
                }
                if tile.web != nil { Button(tile.fullPage ? "Vidéo seule (masquer le site)" : "Afficher toute la page du site") { tile.setFullPage(!tile.fullPage) } }
                if tile.count > 1 { Button("Serveur suivant (\(tile.count))") { tile.next() } }
                if tile.status?.contains("réessayer") == true { Button("Réessayer") { tile.retry() } }
                Button("Retirer cette chaîne", role: .destructive) { store.remove(tile) }
            }
        }
        .sheet(isPresented: $adding) { MultiviewAddSheet { store.add($0) } }
        .sheet(isPresented: $casting) { MultiviewCastSheet(channels: store.castChannels) }
    }

    private var bar: some View {
        HStack(spacing: 10) {
            Button { store.close() } label: { Image(systemName: "xmark").frame(width: 40, height: 40) }
                .accessibilityLabel("Fermer le multiview")
            VStack(alignment: .leading, spacing: 0) {
                Text("Multiview · \(store.tiles.count)/\(MultiviewStore.maxTiles)").font(.subheadline.weight(.semibold))
                if let name = store.castName {
                    Text("Diffusé sur \(name)").font(.caption2.weight(.semibold)).foregroundStyle(Theme.teal).lineLimit(1)
                }
            }
            Spacer()
            if store.featured != nil || store.zoomed != nil {
                Button { store.grid() } label: { Image(systemName: "square.grid.2x2").frame(width: 40, height: 40) }
                    .accessibilityLabel("Revenir à la grille")
            }
            if store.tiles.count < MultiviewStore.maxTiles {
                Button { adding = true } label: { Image(systemName: "plus").frame(width: 40, height: 40) }
                    .accessibilityLabel("Ajouter une chaîne")
            }
            Button { casting = true } label: {
                Image(systemName: "tv.badge.wifi").frame(width: 40, height: 40)
                    .foregroundStyle(store.castTarget != nil ? Theme.teal : .white)
            }
            .accessibilityLabel(store.castName.map { "Diffusé sur \($0)" } ?? "Diffuser le multiview sur un téléviseur")
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .glassEffect(.regular, in: Capsule())
        .padding(.horizontal, 10)
    }

    /// Grille (1, 2, 2 × 2, 3 × 3…) ou chaîne mise en avant : grande à gauche (paysage) ou en haut (portrait).
    private func layout(in size: CGSize) -> [CGRect] {
        let count = store.tiles.count
        guard count > 0, size.width > 0, size.height > 0 else { return [] }
        let gap: CGFloat = 4
        let landscape = size.width > size.height
        if let zoomed = store.zoomed, let main = store.tiles.firstIndex(where: { $0.id == zoomed }) {
            var frames = Array(repeating: CGRect.zero, count: count)
            frames[main] = CGRect(origin: .zero, size: size)
            return frames
        }
        if let featured = store.featured, let main = store.tiles.firstIndex(where: { $0.id == featured }), count > 1 {
            var frames = Array(repeating: CGRect.zero, count: count)
            let others = (0..<count).filter { $0 != main }
            if landscape {
                // Grande vignette et vignettes d'à côté en 16:9 (pas de bandes noires), ensemble centré.
                let columns = others.count > 4 ? 2 : 1
                let rows = max(1, Int(ceil(Double(others.count) / Double(columns))))
                let mainW = min(size.height * 16 / 9, size.width * 0.7)
                let mainH = mainW * 9 / 16
                var cellW = (size.width - mainW - gap - gap * CGFloat(columns - 1)) / CGFloat(columns)
                var cellH = cellW * 9 / 16
                if cellH * CGFloat(rows) + gap * CGFloat(rows - 1) > size.height {
                    cellH = (size.height - gap * CGFloat(rows - 1)) / CGFloat(rows)
                    cellW = cellH * 16 / 9
                }
                let left = max(0, (size.width - mainW - gap - cellW * CGFloat(columns) - gap * CGFloat(columns - 1)) / 2)
                let top = (size.height - cellH * CGFloat(rows) - gap * CGFloat(rows - 1)) / 2
                frames[main] = CGRect(x: left, y: (size.height - mainH) / 2, width: mainW, height: mainH)
                for (position, index) in others.enumerated() {
                    let row = position / columns
                    let inRow = row == rows - 1 ? others.count - row * columns : columns
                    let shift = (cellW + gap) * CGFloat(columns - inRow) / 2
                    frames[index] = CGRect(x: left + mainW + gap + shift + (cellW + gap) * CGFloat(position % columns), y: top + (cellH + gap) * CGFloat(row), width: cellW, height: cellH)
                }
            } else {
                let mainHeight = min(size.width * 9 / 16, size.height * 0.5)
                let columns = others.count > 4 ? 3 : 2
                let rows = Int(ceil(Double(others.count) / Double(columns)))
                let cellW = size.width / CGFloat(columns)
                let cellH = cellW * 9 / 16
                // Ensemble centré verticalement, comme la grille (pas de grand vide en bas).
                let top = max(0, (size.height - mainHeight - gap - CGFloat(rows) * cellH) / 2)
                frames[main] = CGRect(x: 0, y: top, width: size.width, height: mainHeight)
                for (position, index) in others.enumerated() {
                    let row = position / columns
                    let inRow = row == rows - 1 ? others.count - row * columns : columns
                    let shift = CGFloat(columns - inRow) * cellW / 2
                    frames[index] = CGRect(x: shift + CGFloat(position % columns) * cellW, y: top + mainHeight + gap + CGFloat(row) * cellH, width: cellW - gap, height: cellH - gap)
                }
            }
            return frames
        }
        let columns = landscape ? (count <= 1 ? 1 : count <= 4 ? 2 : 3) : (count <= 2 ? 1 : count <= 6 ? 2 : 3)
        let rows = Int(ceil(Double(count) / Double(columns)))
        let cellW = size.width / CGFloat(columns)
        // Vignettes 16:9 si la place le permet, centrées verticalement.
        let cellH = min(size.height / CGFloat(rows), cellW * 9 / 16 + gap)
        let top = max(0, (size.height - cellH * CGFloat(rows)) / 2)
        return (0..<count).map { index in
            let row = index / columns
            let inRow = row == rows - 1 ? count - row * columns : columns
            let shift = CGFloat(columns - inRow) * cellW / 2
            return CGRect(x: shift + CGFloat(index % columns) * cellW, y: top + CGFloat(row) * cellH, width: cellW - gap, height: cellH - gap)
        }
    }
}

/// Touches d'une vignette du lecteur d'Apple : double appui plein écran, appui menu.
private struct TileGestures: ViewModifier {
    let enabled: Bool
    let zoom: () -> Void
    let menu: () -> Void

    func body(content: Content) -> some View {
        if enabled {
            content.onTapGesture(count: 2, perform: zoom).onTapGesture(perform: menu)
        } else {
            content
        }
    }
}

struct MultiviewTileView: View {
    @Environment(Session.self) private var session
    let tile: MultiviewTile
    let listening: Bool
    let featured: Bool
    /// Commandes visibles (nom de la chaîne, bouton « … ») ; masquées pendant le visionnage.
    var chrome = true
    /// Vignette d'un lecteur de site : menu par le bouton (les touches vont à la page).
    var menu: (() -> Void)? = nil
    /// Toucher sur la page du site (laissé à la page) : ramène les commandes.
    var touched: (() -> Void)? = nil

    var body: some View {
        ZStack {
            if let web = tile.web {
                LiveWebView(request: web, session: session, onEvent: { [weak tile] state, _, _ in tile?.webEvent(web.id, state: state) },
                            onCreate: { [weak tile, touched = touched] view in
                                tile?.webView = view
                                if let touched { view.addGestureRecognizer(TouchSpy(touched)) }
                            }, muted: tile.muted)
                    .id(web.id)
            } else {
                MultiviewLayer(player: tile.player)
            }
            if let status = tile.status {
                VStack(spacing: 6) {
                    if !status.contains("indisponible") && !status.contains("Aucun") { ProgressView().tint(.white) }
                    Text(status).font(.caption2.weight(.semibold)).multilineTextAlignment(.center)
                }
                .padding(8)
                .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 10))
                .allowsHitTesting(false)
            }
        }
        .overlay(alignment: .topTrailing) {
            if let menu, tile.web != nil, chrome {
                Button(action: menu) {
                    Image(systemName: "ellipsis").font(.caption.weight(.bold)).frame(width: 30, height: 30)
                        .background(.black.opacity(0.6), in: Circle())
                }
                .foregroundStyle(.white)
                .padding(6)
                .accessibilityLabel("Options de \(tile.channel.name)")
            }
        }
        .overlay(alignment: .bottomLeading) {
            HStack(spacing: 4) {
                if listening { Image(systemName: "speaker.wave.2.fill") }
                Text(tile.channel.name).lineLimit(1)
            }
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.black.opacity(0.6), in: Capsule())
            .padding(6)
            .opacity(chrome ? 1 : 0)
            .allowsHitTesting(false)
        }
        // Sans contour : la chaîne écoutée se reconnaît à l'icône du son, à côté de son nom.
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(tile.channel.name + (listening ? ", écoutée" : "") + (featured ? ", mise en avant" : ""))
        .accessibilityAddTraits(.isButton)
    }
}

/// Observe les touchers sur la page d'un site sans rien lui retirer (la page reste manipulable).
private final class TouchSpy: UIGestureRecognizer {
    private let action: () -> Void

    init(_ action: @escaping () -> Void) {
        self.action = action
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        action()
        state = .failed
    }

    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
}

/// Image d'une vignette (lecteur d'Apple, sans image dans l'image).
struct MultiviewLayer: UIViewRepresentable {
    let player: AVPlayer

    final class LayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeUIView(context: Context) -> LayerView {
        let view = LayerView()
        view.backgroundColor = .black
        view.playerLayer.videoGravity = .resizeAspect
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ uiView: LayerView, context: Context) {
        if uiView.playerLayer.player !== player { uiView.playerLayer.player = player }
    }
}

/// Chaîne à ajouter : toutes les chaînes et tous les matchs, de toutes les sources.
struct MultiviewAddSheet: View {
    let onPick: (LiveChannel) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    private var store: LiveStore { .shared }

    private var results: [LiveChannel] {
        let term = query.trimmingCharacters(in: .whitespaces)
        let all = store.recents.compactMap { key in store.channels.first { $0.id == key } } + store.events + store.channels
        var seen: Set<String> = []
        let unique = all.filter { seen.insert($0.id).inserted }
        let list = term.isEmpty ? unique : unique.filter { $0.name.localizedCaseInsensitiveContains(term) }
        return Array(list.prefix(200))
    }

    var body: some View {
        NavigationStack {
            List(results) { channel in
                Button {
                    onPick(channel)
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(channel.name).foregroundStyle(.white)
                        Text("\(channel.entries.count) serveur\(channel.entries.count > 1 ? "s" : "")" + (channel.group.map { " · " + $0 } ?? ""))
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Chaîne ou match")
            .navigationTitle("Ajouter une chaîne")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
        }
    }
}

/// Diffusion du multiview sur n'importe quel téléviseur : Chromecast et AirPlay reçoivent l'image
/// composée par le serveur Noctra ; Noctra TV (Android TV, LG, Samsung) affiche les chaînes lui-même.
/// Dans tous les cas, l'iPhone pilote ensuite : ajouter, retirer, mettre en avant, choisir le son.
struct MultiviewCastSheet: View {
    let channels: [LiveChannel]
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var busy: String?
    @State private var error: String?
    private var remote: RemotePlayback { .shared }
    private var browser: ChromecastBrowser { .shared }
    private var store: MultiviewStore { .shared }

    var body: some View {
        NavigationStack {
            List {
                if let name = store.castName {
                    Section {
                        Label("Diffusé sur \(name)", systemImage: "dot.radiowaves.left.and.right").foregroundStyle(Theme.teal)
                        Button("Arrêter la diffusion", role: .destructive) { store.stopCasting() }
                    } footer: {
                        Text("Les changements faits ici (chaîne ajoutée, retirée, mise en avant, son) arrivent sur le téléviseur en quelques secondes.")
                    }
                }
                Section {
                    if browser.devices.isEmpty { Text("Recherche sur le Wi-Fi…").foregroundStyle(Theme.muted) }
                    ForEach(browser.devices) { device in
                        Button { run("Préparation du multiview pour \(device.name)…") { try await store.cast(to: device, session: session) } } label: {
                            Label(device.name, systemImage: "tv")
                        }
                    }
                } header: {
                    Text("Chromecast et Google TV")
                }
                Section {
                    HStack {
                        Label("AirPlay", systemImage: "airplayvideo")
                        Spacer()
                        AirPlayButton().frame(width: 44, height: 44)
                    }
                    if store.castTarget != .airplay, AVAudioSession.sharedInstance().currentRoute.outputs.contains(where: { $0.portType == .airPlay }) {
                        Button("Envoyer sur l’appareil AirPlay connecté") {
                            run("Préparation du multiview pour AirPlay…") { try await store.castAirPlay(session: session) }
                        }
                    }
                } header: {
                    Text("Apple TV et téléviseurs AirPlay")
                } footer: {
                    Text("Choisissez le téléviseur dans le menu AirPlay : le multiview y part aussitôt.")
                }
                Section {
                    let targets = remote.devices.filter { $0.custom }
                    if targets.isEmpty { Text("Ouvrez la version à jour de Noctra TV avec le même compte.").foregroundStyle(Theme.muted) }
                    ForEach(targets) { target in
                        Button {
                            run("Envoi au téléviseur…") {
                                try await remote.castMultiview(channels, to: target)
                                store.close()
                                store.clear()
                            }
                        } label: { Label(target.name, systemImage: "tv") }
                    }
                } header: {
                    Text("Noctra TV")
                } footer: {
                    Text("Chromecast et AirPlay reçoivent les \(channels.count) chaînes en une seule image, composée par le serveur Noctra. Noctra TV les affiche lui-même.")
                }
                if let busy { BusyRow(busy) }
                if let error { Text(error).foregroundStyle(Color.orange) }
                if let note = store.castNote { Text(note).foregroundStyle(Color.orange) }
            }
            .disabled(busy != nil)
            .navigationTitle("Diffuser le multiview")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
        }
        .onAppear { browser.start() }
        .onDisappear { browser.stop() }
        .task { await remote.refresh() }
        // Téléviseur AirPlay choisi dans le menu : le multiview y est envoyé.
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { _ in
            Task { @MainActor in
                let airplay = AVAudioSession.sharedInstance().currentRoute.outputs.contains { $0.portType == .airPlay }
                if airplay, store.castTarget != .airplay, busy == nil {
                    run("Préparation du multiview pour AirPlay…") { try await store.castAirPlay(session: session) }
                } else if !airplay, store.castTarget == .airplay {
                    store.stopCasting()
                }
            }
        }
    }

    private func run(_ message: String, _ action: @escaping @MainActor () async throws -> Void) {
        busy = message
        error = nil
        Task {
            defer { busy = nil }
            do {
                try await action()
                dismiss()
                // Multiview démarré pour la diffusion : il s'ouvre ensuite ici comme télécommande.
                if !store.tiles.isEmpty, !store.presented {
                    try? await Task.sleep(for: .milliseconds(600))
                    store.presented = true
                }
            } catch {
                self.error = error.localizedDescription
                // Diffusion impossible : le multiview démarré en arrière-plan pour elle s'arrête.
                if !store.presented, !store.tiles.isEmpty { store.close() }
            }
        }
    }
}

/// Barre du multiview sous les listes de chaînes : chaînes choisies, lancer, diffuser.
struct MultiviewBar: View {
    @Environment(Session.self) private var session
    private var store: MultiviewStore { .shared }
    @State private var casting = false

    var body: some View {
        if store.selecting || !store.picked.isEmpty {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Multiview · \(store.picked.count)/\(MultiviewStore.maxTiles)").font(.subheadline.weight(.bold))
                    Text(store.picked.isEmpty ? "Touchez les chaînes à afficher" : store.picked.map(\.name).joined(separator: ", "))
                        .font(.caption2).foregroundStyle(Theme.muted).lineLimit(1)
                }
                Spacer(minLength: 4)
                Button { casting = true } label: { Image(systemName: "tv.badge.wifi").frame(width: 38, height: 38) }
                    .disabled(store.picked.isEmpty)
                    .accessibilityLabel("Diffuser le multiview")
                Button("Lancer") { store.launch(session: session) }
                    .buttonStyle(.borderedProminent)
                    .disabled(store.picked.isEmpty)
                Button { withAnimation(Theme.spring) { store.clear() } } label: { Image(systemName: "xmark").frame(width: 32, height: 38) }
                    .accessibilityLabel("Quitter le choix du multiview")
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(.horizontal, 12)
            .padding(.bottom, 6)
            .sheet(isPresented: $casting) { MultiviewCastSheet(channels: store.castChannels) }
        }
    }
}
