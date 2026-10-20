import AVFoundation
import AVKit
import Observation
import SwiftUI
import UIKit
import WebKit

// Lecteur de la TV en direct. Chaque serveur est lu par le moteur qui lui
// convient : lecteur d'Apple (HLS : image dans l'image, AirPlay) ou moteur web
// (hls.js, et mpegts.js pour les flux MPEG-TS continus comme Northlive), avec
// passage de l'un à l'autre quand un flux est refusé, mémorisé par fournisseur.
// Lecteurs des sites dans un lecteur web qui signale lecture et erreurs.
// Chaînes et serveurs changeables sans quitter le lecteur ; serveur suivant
// (ou nouveau lien du même serveur) en cas de coupure.

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
    /// Serveurs automatiques (VIP compris) encore demandés au serveur Noctra.
    private(set) var expanding = 0
    private(set) var probing = 0
    /// Aucun serveur n'a pu lire : la liste des serveurs s'ouvre.
    var askServer = false
    /// Téléviseur AirPlay choisi : la chaîne part en flux vers lui (lecteur d'Apple), pas en recopie d'écran.
    private(set) var airPlay = false
    let player = AVPlayer()

    @ObservationIgnored weak var session: Session?
    @ObservationIgnored var pip: AVPictureInPictureController?
    @ObservationIgnored weak var webView: WKWebView?
    @ObservationIgnored private var tried: Set<UUID> = []
    @ObservationIgnored private var engines: [UUID: Set<Bool>] = [:]
    @ObservationIgnored private var played: Set<UUID> = []
    @ObservationIgnored private var renewed: Set<UUID> = []
    @ObservationIgnored private var watch: Task<Void, Never>?
    @ObservationIgnored private var refresh: Task<Void, Never>?
    @ObservationIgnored private var stallObserver: NSObjectProtocol?
    @ObservationIgnored private var stalls = 0
    @ObservationIgnored private var readyAt: Date?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var webPlaying = false
    @ObservationIgnored private var routeObserver: NSObjectProtocol?

    init() {
        player.automaticallyWaitsToMinimizeStalling = true
        player.allowsExternalPlayback = true
        // Recopie de l'écran active : la vidéo part quand même seule, en plein écran, sur le téléviseur.
        player.usesExternalPlaybackWhileExternalScreenIsActive = true
        airPlay = Self.airPlayRoute()
        routeObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.routeChanged() }
        }
    }

    // MARK: AirPlay

    private static func airPlayRoute() -> Bool {
        AVAudioSession.sharedInstance().currentRoute.outputs.contains { $0.portType == .airPlay }
    }

    /// AirPlay choisi ou quitté pendant la lecture : la chaîne repart avec le bon lecteur. Le moteur web
    /// et les pages des sites ne passent en AirPlay qu'en recopie d'écran (ou le son seul) ; le lecteur
    /// d'Apple envoie le flux lui-même au téléviseur, comme le Chromecast.
    private func routeChanged() {
        let active = Self.airPlayRoute()
        guard active != airPlay else { return }
        airPlay = active
        guard presented, let server = current else { return }
        if active, server.kind == .web, let native = nextNative(after: server) { play(native, note: "AirPlay : passage à un flux direct…"); return }
        if server.kind == .native { play(server, note: active ? "Envoi en AirPlay…" : "Retour sur l’iPhone…") }
    }

    /// Flux direct à essayer en AirPlay (les pages des sites ne s'y envoient pas).
    private func nextNative(after server: LiveServer) -> LiveServer? {
        servers.first { $0.id != server.id && $0.kind == .native && $0.streamURL != nil && !tried.contains($0.id) && ![.down, .noVideo, .stale].contains($0.probe) }
            ?? servers.first { $0.id != server.id && $0.kind == .native && $0.streamURL != nil && ![.down, .noVideo, .stale].contains($0.probe) }
    }

    /// Adresse lisible par le téléviseur AirPlay sans le jeton du compte : droit de lecture TV du
    /// serveur Noctra (comme pour le Chromecast) ; flux MPEG-TS converti en HLS par le serveur (ffmpeg).
    private func airPlayAddress(_ server: LiveServer, session: Session) async -> URL? {
        guard let stream = server.streamURL else { return nil }
        let parts = URLComponents(url: stream, resolvingAgainstBaseURL: false)
        let address = session.isNoctraOrigin(stream) ? (parts?.percentEncodedPath ?? stream.path) + (parts?.percentEncodedQuery.map { "?" + $0 } ?? "") : stream.absoluteString
        if !server.mpegts,
           let json = try? await session.noctraSend("POST", "/api/tv/cast", json: ["url": address, "headers": server.headers], timeout: 20) as? [String: Any],
           let path = json["url"] as? String, let url = session.noctraURL(path) {
            return url
        }
        let tile: [String: Any] = ["url": address, "headers": server.headers, "name": channel?.name ?? ""]
        if let json = try? await session.noctraSend("POST", "/api/tv/mosaic", json: ["tiles": [tile], "audio": 0, "featured": -1], timeout: 40) as? [String: Any],
           let path = json["cast"] as? String, let url = session.noctraURL(path) {
            return url
        }
        return nil
    }

    var position: Int? { channel.flatMap { current in context.firstIndex { $0.id == current.id } } }
    /// Flux lu par le moteur web (commandes de l'appli, pas celles d'une page).
    var engineMode: Bool { web?.isEngine == true }

    // MARK: Lancement

    func start(channel: LiveChannel, servers: [LiveServer], first: LiveServer, context: [LiveChannel], session: Session) {
        self.session = session
        self.channel = channel
        self.context = context.contains(where: { $0.id == channel.id }) ? context : [channel] + context
        self.servers = servers
        reset()
        presented = true
        UIApplication.shared.isIdleTimerDisabled = true
        play(first)
        expandAndProbe()
    }

    private func reset() {
        tried = []
        engines = [:]
        played = []
        renewed = []
        expanding = 0
        askServer = false
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
        reset()
        loading = true
        status = "Recherche des serveurs de « \(target.name) »…"
        player.pause()
        player.replaceCurrentItem(with: nil)
        LiveStore.shared.noteRecent(target)
        Task {
            let list = await LiveLauncher.shared.prepare(target, session: session)
            guard token == generation else { return }
            servers = list
            if let best = list.first(where: { !$0.manualOnly }) ?? list.first {
                play(best)
                expandAndProbe()
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

    // MARK: Serveurs

    /// Serveurs automatiques demandés en arrière-plan (le VIP LiveWatch vérifie
    /// ses flux, jusqu'à une minute) : la liste montre tous les serveurs réels.
    private func expandAndProbe() {
        guard let session, let channel else { return }
        let token = channel.id
        for server in servers.filter({ $0.kind == .resolve && $0.id != current?.id }).prefix(16) {
            expanding += 1
            Task {
                let found = await LiveServerFactory.resolve(server, session: session, timeout: server.vip ? 110 : 45)
                guard self.channel?.id == token else { return }
                expanding = max(0, expanding - 1)
                guard let index = servers.firstIndex(where: { $0.id == server.id }) else { return }
                if found.isEmpty {
                    servers[index].probe = .down
                } else {
                    servers.replaceSubrange(index...index, with: LiveHealth.rank(LiveHealth.withCachedProbes(found, channel: token), channel: token))
                    servers = LiveServerFactory.uniqueLabels(servers)
                    probeAll()
                }
            }
        }
        probeAll()
        retest()
    }

    /// Pendant la lecture : nouveau test des autres serveurs toutes les 3 min,
    /// pour que le serveur de relais choisi en cas de coupure soit vérifié.
    private func retest() {
        refresh?.cancel()
        guard let token = channel?.id else { return }
        refresh = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(180))
                guard let self, self.channel?.id == token, self.presented else { return }
                let now = Date()
                for index in self.servers.indices where self.servers[index].testable && self.servers[index].id != self.current?.id
                    && self.servers[index].probe != .testing && now.timeIntervalSince(self.servers[index].probedAt ?? .distantPast) > 150 {
                    self.servers[index].probe = .untested
                }
                self.probeAll()
            }
        }
    }

    /// Tests des serveurs (6 à la fois) : flux directs et pages des lecteurs,
    /// pour la liste et le choix du serveur suivant.
    func probeAll(force: Bool = false) {
        guard let session, let channel else { return }
        let token = channel.id
        if force {
            for index in servers.indices where servers[index].testable && servers[index].probe != .testing { servers[index].probe = .untested }
        }
        let targets = Array(servers.filter { $0.testable && $0.probe == .untested }.prefix(36))
        guard !targets.isEmpty else { return }
        for target in targets { if let index = servers.firstIndex(where: { $0.id == target.id }) { servers[index].probe = .testing } }
        probing += 1
        Task {
            await LiveServerFactory.probeMany(targets, session: session) { [weak self] id, result in
                guard let self, self.channel?.id == token, let index = self.servers.firstIndex(where: { $0.id == id }) else { return }
                self.servers[index].apply(result)
                LiveHealth.cache(result, for: self.servers[index], channel: token)
                if [.down, .noVideo].contains(result.state) { LiveHealth.record(self.servers[index], channel: token, ok: false) }
            }
            if self.channel?.id == token { probing = max(0, probing - 1) } else { probing = 0 }
        }
    }

    // MARK: Lecture

    /// Serveur choisi (ou suivant). `web` impose un moteur ; sinon celui qui a
    /// marché pour ce fournisseur, et le moteur web pour un flux MPEG-TS.
    func play(_ server: LiveServer, web forced: Bool? = nil, note: String? = nil) {
        guard let session, let channel else { return }
        // AirPlay : une page de site ne s'envoie qu'en recopie d'écran, un flux direct passe avant.
        if airPlay, server.kind == .web, let native = nextNative(after: server), !tried.contains(native.id) {
            play(native, note: "AirPlay : flux direct plutôt que le lecteur du site…")
            return
        }
        finishMeasure()
        generation += 1
        let token = generation
        watch?.cancel()
        tried.insert(server.id)
        current = server
        loading = true
        webPlaying = false
        askServer = false
        status = note ?? "Connexion à \(server.label)…"
        switch server.kind {
        case .resolve:
            stopVideo()
            web = nil
            if note == nil {
                status = server.vip ? "Préparation de l’accès VIP (vérification des flux, jusqu’à 1 min 30)…" : "Recherche des serveurs de \(server.label)…"
            }
            watch = Task {
                // VIP : cookie de session Noctra renouvelé pour le lecteur d'Apple et le moteur web.
                if server.vip { _ = try? await session.noctraJSON("/api/session", timeout: 10) }
                guard token == generation else { return }
                let found = LiveHealth.rank(await LiveServerFactory.resolve(server, session: session, timeout: server.vip ? 110 : 45), channel: channel.id)
                guard token == generation else { return }
                if let index = servers.firstIndex(where: { $0.id == server.id }) { servers.replaceSubrange(index...index, with: found) }
                servers = LiveServerFactory.uniqueLabels(servers)
                probeAll()
                if let first = found.first(where: { !$0.manualOnly }) {
                    play(servers.first { $0.id == first.id } ?? first)
                } else {
                    fail(server, message: "\(server.label) n’a proposé aucun serveur : serveur suivant…")
                }
            }
        case .web:
            stopVideo()
            if let prepare = server.relayPrepare, server.pageURL == nil {
                status = "Préparation du relais officiel…"
                watch = Task {
                    let json = try? await session.noctraJSON(prepare, timeout: 20) as? [String: Any]
                    guard token == generation else { return }
                    guard let raw = json?["embedUrl"] as? String, let url = session.noctraURL(raw) else {
                        fail(server, message: "Relais officiel indisponible : serveur suivant…")
                        return
                    }
                    var prepared = server
                    prepared.pageURL = url
                    if let index = servers.firstIndex(where: { $0.id == server.id }) { servers[index].pageURL = url }
                    current = prepared
                    openPage(prepared, token: token)
                }
                return
            }
            openPage(server, token: token)
        case .native:
            // AirPlay : toujours le lecteur d'Apple, qui envoie le flux au téléviseur.
            let useWeb = !airPlay && (server.mpegts || (forced ?? (server.webEngine || LiveHealth.prefersWeb(server))))
            if useWeb { playEngine(server, token: token) } else { playApple(server, token: token) }
        }
    }

    /// Page d'un site (lecteur externe) : lecture et erreurs signalées par la page.
    private func openPage(_ server: LiveServer, token: Int) {
        guard let url = server.pageURL, let channel else { fail(server); return }
        web = WebPlayerRequest(title: channel.name, mode: .page(url), framed: server.framed, sandbox: server.sandbox)
        loading = false
        status = "Lecteur du site : touchez Lecture dans la page si la vidéo ne démarre pas."
        watch = Task {
            try? await Task.sleep(for: .seconds(7))
            guard token == generation, !webPlaying else { return }
            status = nil
        }
    }

    /// Moteur web : hls.js, ou mpegts.js pour un flux MPEG-TS continu.
    private func playEngine(_ server: LiveServer, token: Int) {
        guard let session, let channel, let url = server.streamURL else { fail(server); return }
        stopVideo()
        engines[server.id, default: []].insert(true)
        web = nil
        watch = Task {
            var target = server
            if !target.mpegts && target.format == .unknown {
                target.format = await LiveServerFactory.sniff(server, session: session)
                guard token == generation else { return }
                if target.format == .ts { target.mpegts = true }
                if let index = servers.firstIndex(where: { $0.id == server.id }) {
                    servers[index].format = target.format
                    servers[index].mpegts = target.mpegts
                }
                current = target
            }
            web = WebPlayerRequest(title: channel.name, mode: target.mpegts ? .mpegts(url) : .hls(url))
            paused = false
            try? await Task.sleep(for: .seconds(target.mpegts ? 30 : 45))
            guard token == generation, !webPlaying else { return }
            engineFailed(target, web: true, reason: "le moteur web n’a pas démarré la vidéo")
        }
    }

    /// Lecteur d'Apple (HLS) : image dans l'image, AirPlay.
    private func playApple(_ server: LiveServer, token: Int) {
        guard let session, let url = server.streamURL else { fail(server); return }
        engines[server.id, default: []].insert(false)
        web = nil
        if airPlay {
            // Le téléviseur lit lui-même l'adresse : ni en-tête ni cookie ne lui parviennent.
            stopVideo()
            status = "Envoi en AirPlay…"
            watch = Task { [weak self] in
                guard let self else { return }
                let address = await self.airPlayAddress(server, session: session)
                guard token == self.generation else { return }
                guard let address else {
                    self.fail(server, message: "AirPlay : \(server.label) ne peut pas être envoyé au téléviseur. Serveur suivant…")
                    return
                }
                self.startApple(server, asset: AVURLAsset(url: address), token: token)
            }
            return
        }
        var headers = server.headers
        if session.isNoctraOrigin(url), let auth = session.token { headers["x-noctra-token"] = auth }
        var options: [String: Any] = ["AVURLAssetHTTPHeaderFieldsKey": headers]
        let cookies = session.noctraCookies(for: url)
        if !cookies.isEmpty { options[AVURLAssetHTTPCookiesKey] = cookies }
        startApple(server, asset: AVURLAsset(url: url, options: options), token: token)
    }

    private func startApple(_ server: LiveServer, asset: AVURLAsset, token: Int) {
        guard let channel else { return }
        let item = AVPlayerItem(asset: asset)
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
                if item.status == .failed {
                    self.engineFailed(server, web: false, reason: Self.reason(item))
                    return
                }
                if !ready {
                    let elapsed = Date().timeIntervalSince(started)
                    if item.status == .readyToPlay && (self.player.timeControlStatus == .playing || self.paused) {
                        ready = true
                        self.succeeded(server, web: false)
                    } else if elapsed > (item.status == .readyToPlay ? 25 : (server.vip ? 30 : 20)) {
                        // Prêt mais sans image (mise en mémoire trop lente) ou rien du tout. VIP : le serveur
                        // va chercher la liste et les segments chez LiveWatch, le premier chargement est plus lent.
                        self.engineFailed(server, web: false, reason: item.status == .readyToPlay ? "mise en mémoire trop lente" : Self.reason(item))
                        return
                    }
                } else if !self.paused && self.player.timeControlStatus == .waitingToPlayAtSpecifiedRate {
                    // Coupure : 15 s sans image, nouveau lien du même serveur ou serveur suivant.
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

    /// Cause lisible d'un refus du lecteur d'Apple (journal d'erreurs du flux).
    private static func reason(_ item: AVPlayerItem) -> String {
        if let event = item.errorLog()?.events.last {
            if event.errorStatusCode == 401 || event.errorStatusCode == 403 { return "accès refusé (\(event.errorStatusCode))" }
            if event.errorStatusCode == 404 || event.errorStatusCode == 410 { return "lien expiré (\(event.errorStatusCode))" }
            if let comment = event.errorComment, !comment.isEmpty { return comment }
        }
        if let error = item.error as NSError? { return error.localizedFailureReason ?? error.localizedDescription }
        return "aucune image reçue"
    }

    private func succeeded(_ server: LiveServer, web: Bool) {
        guard let channel else { return }
        readyAt = Date()
        loading = false
        status = nil
        played.insert(server.id)
        LiveHealth.record(server, channel: channel.id, ok: true)
        LiveHealth.noteProbe(server, accurate: true)
        if server.kind == .native && !server.mpegts { LiveHealth.noteEngine(server, web: web, ok: true) }
    }

    /// Moteur refusé : l'autre moteur pour le même flux (sauf MPEG-TS, que seul
    /// le moteur web lit), puis le serveur suivant.
    private func engineFailed(_ server: LiveServer, web: Bool, reason: String) {
        // AirPlay : seul le lecteur d'Apple envoie le flux, pas d'essai avec le moteur web.
        if airPlay {
            fail(server, message: "AirPlay : \(server.label) (\(reason)). Serveur suivant…")
            return
        }
        if !server.mpegts { LiveHealth.noteEngine(server, web: web, ok: false) }
        let other = !web
        let tested = engines[server.id] ?? []
        if !tested.contains(other) && !(other == false && server.mpegts) && !played.contains(server.id) {
            play(server, web: other, note: web
                 ? "Moteur web en échec (\(reason)) : essai avec le lecteur d’Apple…"
                 : "Lecteur d’Apple refusé (\(reason)) : essai avec le moteur web…")
            return
        }
        fail(server, message: "\(server.label) : \(reason). Serveur suivant…")
    }

    private func fail(_ server: LiveServer, message: String = "Ce serveur ne répond pas : serveur suivant…") {
        guard let channel, let session else { return }
        // Coupure d'un serveur qui lisait : nouveau lien (jeton neuf) du même serveur, une fois.
        if played.contains(server.id), let renew = server.renewURL, !renewed.contains(server.id) {
            renewed.insert(server.id)
            generation += 1
            let token = generation
            stopVideo()
            web = nil
            loading = true
            status = "Reconnexion au serveur…"
            watch = Task {
                let parent = LiveServer(label: server.label, provider: server.provider, kind: .resolve, resolveURL: renew, vip: server.vip)
                let fresh = await LiveServerFactory.resolve(parent, session: session, timeout: server.vip ? 110 : 45)
                guard token == generation else { return }
                guard var replacement = fresh.first(where: { $0.kind == .native }) ?? fresh.first else {
                    fail(server, message: message)
                    return
                }
                replacement.label = server.label
                replacement.renewURL = renew
                if let index = servers.firstIndex(where: { $0.id == server.id }) { servers[index] = replacement }
                renewed.insert(replacement.id)
                let engine: Bool? = server.mpegts ? true : (engines[server.id]?.count == 1 ? engines[server.id]?.first : nil)
                play(replacement, web: engine)
            }
            return
        }
        LiveHealth.record(server, channel: channel.id, ok: false)
        // Annoncé « en ligne » par le test mais jamais lu : ce test compte moins pour ce fournisseur.
        if !played.contains(server.id) { LiveHealth.noteProbe(server, accurate: false) }
        let failing: [LiveServer.Probe] = [.down, .noVideo, .stale]
        let open = servers.filter { !tried.contains($0.id) && !$0.manualOnly }
        let candidate = open.first { $0.probe == .up } ?? open.first { $0.probe == .slow }
            ?? open.first { !failing.contains($0.probe) && $0.probe != .late } ?? open.first { !failing.contains($0.probe) } ?? open.first
        guard let candidate else {
            stopVideo()
            web = nil
            loading = false
            status = expanding > 0
                ? "Les serveurs essayés ne répondent pas. D’autres serveurs arrivent : choisissez-en un dans la liste."
                : "Aucun serveur de « \(channel.name) » ne répond. Essayez un serveur de secours ou une autre chaîne."
            askServer = true
            return
        }
        play(candidate, note: message)
    }

    // MARK: Événements du lecteur web

    /// Messages des pages (moteur web, ponts Noctra des sites) : lecture, flux trouvé, erreur.
    func webEvent(_ request: UUID, state: String, message: String, url: String) {
        guard let web, web.id == request, let server = current, let session else { return }
        switch state {
        case "playing", "ready":
            guard !webPlaying else { return }
            webPlaying = true
            succeeded(server, web: true)
        case "media":
            // Flux repéré par le pont du serveur : proposé comme serveur direct.
            guard let stream = session.noctraURL(url), !servers.contains(where: { $0.streamURL == stream }) else { return }
            var direct = LiveServer(label: server.label + " · direct", provider: server.provider, kind: .native, streamURL: stream, vip: server.vip)
            direct.renewURL = server.renewURL
            let index = (servers.firstIndex { $0.id == server.id } ?? servers.count - 1) + 1
            servers.insert(direct, at: min(index, servers.count))
            probeAll()
            // Pont VIP sans image après 10 s : flux repéré lu par l'appli, comme sur PC (mobile).
            guard server.vip, !web.isEngine else { return }
            let token = generation, handoff = direct
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(10))
                guard let self, token == self.generation, !self.webPlaying else { return }
                self.play(handoff, note: "Lecteur VIP sans image : lecture directe du flux repéré…")
            }
        case "error", "stalled", "vip-missed":
            let text = message.isEmpty ? (state == "vip-missed" ? "le VIP n’a pas été accepté par le site" : "le lecteur a signalé une erreur") : message
            if web.isEngine && !webPlaying {
                engineFailed(server, web: true, reason: text)
            } else if state != "stalled" || web.isEngine {
                fail(server, message: "\(text) Serveur suivant…")
            }
        default:
            break
        }
    }

    // MARK: Commandes

    func togglePause() {
        if engineMode {
            webView?.evaluateJavaScript("(function(){var v=document.querySelector('video');if(!v)return;if(v.paused)v.play();else v.pause();})()")
        } else if paused {
            player.play()
        } else {
            player.pause()
        }
        paused.toggle()
    }

    func startPictureInPicture() {
        if engineMode {
            webView?.evaluateJavaScript("(function(){var v=document.querySelector('video');if(v&&v.webkitSetPresentationMode)v.webkitSetPresentationMode('picture-in-picture');})()")
        } else {
            pip?.startPictureInPicture()
        }
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
        refresh?.cancel()
        finishMeasure()
        generation += 1
        stopVideo()
        pip?.stopPictureInPicture()
        web = nil
        webView = nil
        current = nil
        status = nil
        askServer = false
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
    @State private var showCast = false
    @State private var drag: CGFloat = 0
    @State private var zaps = 0
    private var model: LivePlayerModel { .shared }
    /// Page d'un site : elle reçoit les touchers, les commandes de l'appli se replient.
    private var pageMode: Bool { model.web != nil && !model.engineMode }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Group {
                if let web = model.web {
                    LiveWebView(request: web, session: session)
                        .id(web.id)
                        .allowsHitTesting(!web.isEngine)
                } else {
                    PlayerLayerView(player: model.player)
                }
            }
            .ignoresSafeArea()
            .offset(y: drag / 3)
            if model.airPlay && model.web == nil && !model.loading {
                // La vidéo est sur le téléviseur : l'iPhone sert de télécommande.
                VStack(spacing: 10) {
                    Image(systemName: "airplayvideo").font(.system(size: 44, weight: .semibold)).foregroundStyle(Theme.accent)
                    Text("Lecture sur le téléviseur AirPlay").font(.headline)
                    Text(model.channel?.name ?? "").font(.subheadline).foregroundStyle(.white.opacity(0.7))
                }
                .allowsHitTesting(false)
            }
            if !pageMode {
                Color.clear
                    .contentShape(Rectangle())
                    .ignoresSafeArea()
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
                            .padding(.horizontal, 18).padding(.vertical, 12)
                            .glassEffect(.regular.tint(.black.opacity(0.4)), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    }
                }
                .padding(.horizontal, 30)
                .allowsHitTesting(false)
            }
            if controls {
                overlay.transition(.opacity)
            } else if pageMode {
                // Commandes repliées au-dessus d'une page : un bouton pour les rouvrir.
                VStack {
                    HStack(spacing: 10) {
                        circleButton("xmark") { hideTask?.cancel(); model.close() }
                        circleButton("chevron.down.circle") { controls = true; scheduleHide() }
                        Spacer()
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .transition(.opacity)
            }
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
            LivePlayerServers { server, engine in
                showServers = false
                model.play(server, web: engine)
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showCast) {
            if let channel = model.channel { LiveCastSheet(channel: channel) }
        }
        .onChange(of: model.askServer) { _, ask in
            if ask { controls = true; showServers = true }
        }
        .onAppear { scheduleHide() }
    }

    private var overlay: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                Button {
                    hideTask?.cancel()
                    model.close()
                } label: {
                    Image(systemName: "xmark").font(.headline.weight(.bold))
                        .frame(width: 48, height: 48)
                        .contentShape(Circle())
                        .glassEffect(.regular.interactive(), in: Circle())
                }
                .buttonStyle(PressableStyle(scale: 0.9))
                .accessibilityLabel("Quitter le lecteur")
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        if let number = model.channel?.number, number > 0, LiveStore.shared.country == "fr" {
                            Text("\(number)").font(.caption.weight(.heavy).monospacedDigit()).foregroundStyle(Theme.teal)
                        }
                        Text(model.channel?.name ?? "").font(.headline).lineLimit(1).minimumScaleFactor(0.75)
                        Text("EN DIRECT").font(.system(size: 9, weight: .heavy)).padding(.horizontal, 5).padding(.vertical, 2)
                            .background(.red, in: Capsule())
                            .fixedSize()
                    }
                    if let server = model.current {
                        Text((server.vip ? "VIP · " : "") + server.label + (model.engineMode ? " · moteur web" : ""))
                            .font(.caption).foregroundStyle(.white.opacity(0.75)).lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .glassEffect(.regular.tint(.black.opacity(0.35)), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                // Toujours proposé : AirPlay choisi, la chaîne repart avec le lecteur d'Apple vers le téléviseur.
                AirPlayButton().frame(width: 44, height: 44).glassEffect(.regular, in: Circle())
                if !pageMode && AVPictureInPictureController.isPictureInPictureSupported() {
                    circleButton("pip.enter") { model.startPictureInPicture() }
                }
                if pageMode {
                    circleButton("chevron.up.circle") { controls = false }
                }
            }
            Spacer()
            if !pageMode {
                HStack(spacing: 22) {
                    circleButton("backward.end.fill", size: 50) { zap(-1) }
                    circleButton(model.paused ? "play.fill" : "pause.fill", size: 66) { model.togglePause(); scheduleHide() }
                    circleButton("forward.end.fill", size: 50) { zap(1) }
                }
            }
            HStack(spacing: 10) {
                if pageMode {
                    circleButton("backward.end.fill") { zap(-1) }
                }
                pill("list.bullet", "Chaînes") { showChannels = true }
                pill("server.rack", "Serveurs · \(model.servers.count)", busy: model.expanding > 0 || model.probing > 0) { showServers = true }
                circleButton("tv.badge.wifi") { showCast = true }
                    .accessibilityLabel("Diffuser cette chaîne")
                multiviewMenu
                if pageMode {
                    circleButton("forward.end.fill") { zap(1) }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    /// Chaîne en cours ajoutée au multiview (comme sur la version web), puis multiview ouvert.
    private var multiviewMenu: some View {
        let multiview = MultiviewStore.shared
        return Menu {
            if let channel = model.channel {
                Button {
                    multiview.toggle(channel)
                } label: {
                    Label(multiview.contains(channel) ? "Retirer du multiview" : "Ajouter au multiview (\(multiview.picked.count)/\(MultiviewStore.maxTiles))", systemImage: "square.grid.2x2")
                }
                Button {
                    if !multiview.contains(channel) { multiview.toggle(channel) }
                    multiview.selecting = true
                    model.close()
                } label: { Label("Choisir d’autres chaînes", systemImage: "checklist") }
                if multiview.picked.count > (multiview.contains(channel) ? 1 : 0) {
                    Button {
                        if !multiview.contains(channel) { multiview.toggle(channel) }
                        if let session = model.session { multiview.launch(session: session) }
                    } label: { Label("Ouvrir le multiview", systemImage: "rectangle.split.2x2") }
                }
            }
        } label: {
            Image(systemName: "square.grid.2x2").font(.headline)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
                .glassEffect(.regular.interactive(), in: Circle())
        }
        .accessibilityLabel("Multiview")
    }

    private func circleButton(_ icon: String, size: CGFloat = 44, action: @escaping () -> Void) -> some View {
        Button {
            action()
            scheduleHide()
        } label: {
            // Zone de toucher : tout le cercle (pas seulement le symbole), verre sur le bouton lui-même.
            Image(systemName: icon).font(size > 60 ? .title.weight(.semibold) : size > 46 ? .title3.weight(.semibold) : .headline)
                .frame(width: size, height: size)
                .contentShape(Circle())
                .glassEffect(.regular.interactive(), in: Circle())
        }
        .buttonStyle(PressableStyle(scale: 0.9))
    }

    private func pill(_ icon: String, _ title: String, busy: Bool = false, action: @escaping () -> Void) -> some View {
        Button {
            action()
            scheduleHide()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                Text(title).lineLimit(1).minimumScaleFactor(0.8)
                if busy { ProgressView().controlSize(.mini).tint(.white) }
            }
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .contentShape(Capsule())
            .glassEffect(.regular.interactive(), in: Capsule())
        }
        .buttonStyle(PressableStyle(scale: 0.96))
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
            try? await Task.sleep(for: .seconds(pageMode ? 4 : 5))
            guard !Task.isCancelled, !showChannels, !showServers, !model.askServer else { return }
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
                        if channel.entries.count > 1 { Text("\(channel.entries.count)").font(.caption2).foregroundStyle(Theme.muted) }
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

/// Serveurs de la chaîne en cours, par source, avec leur état ; appui long :
/// choisir le moteur (lecteur d'Apple ou moteur web).
struct LivePlayerServers: View {
    let choose: (LiveServer, Bool?) -> Void
    private var model: LivePlayerModel { .shared }

    private var groups: [(name: String, servers: [LiveServer])] {
        var order: [String] = []
        var map: [String: [LiveServer]] = [:]
        for server in model.servers {
            let name = server.label.components(separatedBy: " · ").first ?? server.provider
            if map[name] == nil { order.append(name) }
            map[name, default: []].append(server)
        }
        return order.map { (name: $0, servers: map[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 10) {
                        if model.expanding > 0 || model.probing > 0 { ProgressView() }
                        Text(summary).font(.footnote).foregroundStyle(Theme.muted)
                    }
                    Button {
                        model.probeAll(force: true)
                    } label: {
                        Label("Tester à nouveau les flux", systemImage: "waveform.path.ecg")
                    }
                    .disabled(model.probing > 0)
                }
                ForEach(groups, id: \.name) { group in
                    Section(group.name) {
                        ForEach(group.servers) { server in
                            Button {
                                choose(server, nil)
                            } label: {
                                row(server)
                            }
                            .foregroundStyle(.white)
                            .contextMenu {
                                if server.kind == .native {
                                    if !server.mpegts {
                                        Button { choose(server, false) } label: { Label("Lecteur d’Apple", systemImage: "play.rectangle") }
                                    }
                                    Button { choose(server, true) } label: { Label("Moteur web", systemImage: "globe") }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle(model.channel?.name ?? "Serveurs")
            .navigationBarTitleDisplayMode(.inline)
            .animation(Theme.spring, value: model.servers.map(\.probe))
        }
    }

    private var summary: String {
        let online = model.servers.filter { $0.probe == .up || $0.probe == .slow }.count
        var parts = ["\(model.servers.count) serveur\(model.servers.count > 1 ? "s" : "")"]
        if online > 0 { parts.append("\(online) en ligne au test") }
        if model.expanding > 0 { parts.append("\(model.expanding) source\(model.expanding > 1 ? "s" : "") encore interrogée\(model.expanding > 1 ? "s" : "") (VIP compris)") }
        else if model.probing > 0 { parts.append("tests en cours") }
        return parts.joined(separator: " · ") + ". Appui long : choisir le lecteur."
    }

    private func row(_ server: LiveServer) -> some View {
        HStack(spacing: 12) {
            Image(systemName: server.id == model.current?.id ? "play.circle.fill" : server.kind == .web ? "safari" : server.kind == .resolve ? "wand.and.stars" : "dot.radiowaves.left.and.right")
                .foregroundStyle(server.id == model.current?.id ? Theme.teal : Theme.muted)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(server.label.components(separatedBy: " · ").dropFirst().joined(separator: " · ").isEmpty ? server.label : server.label.components(separatedBy: " · ").dropFirst().joined(separator: " · "))
                        .font(.subheadline.weight(.semibold)).lineLimit(2)
                    if server.vip {
                        Text("VIP").font(.caption2.weight(.heavy)).padding(.horizontal, 6).padding(.vertical, 2)
                            .background(LinearGradient(colors: [Color(hex: 0xFCD34D), Color(hex: 0xF59E0B)], startPoint: .leading, endPoint: .trailing), in: Capsule())
                            .foregroundStyle(.black)
                    }
                }
                Text(detail(server)).font(.caption).foregroundStyle(Theme.muted).lineLimit(3)
            }
            Spacer(minLength: 6)
            Text(probeText(server)).font(.caption2.weight(.bold)).foregroundStyle(probeColor(server)).multilineTextAlignment(.trailing)
        }
    }

    private func detail(_ server: LiveServer) -> String {
        var parts: [String] = []
        switch server.kind {
        case .native: parts.append(server.mpegts ? "MPEG-TS · moteur web" : LiveHealth.prefersWeb(server) ? "HLS · moteur web" : "HLS")
        case .resolve: parts.append(server.vip ? "Accès VIP à préparer" : "Serveurs à demander")
        case .web: parts.append(server.manualOnly ? "Lecteur du site · secours manuel" : "Lecteur du site")
        }
        if let note = server.probeNote { parts.append(note) }
        if server.probeMs > 0 && (server.probe == .up || server.probe == .slow) { parts.append("\(Int(server.probeMs)) ms") }
        if let at = server.probedAt, Date().timeIntervalSince(at) > 60 { parts.append("testé il y a \(Int(Date().timeIntervalSince(at) / 60)) min") }
        parts.append(LiveHealth.text(server, channel: model.channel?.id ?? ""))
        return parts.joined(separator: " · ")
    }

    private func probeText(_ server: LiveServer) -> String {
        switch server.probe {
        case .up: return "En ligne"
        case .slow: return "Lent"
        case .late: return "Lent à\nrépondre"
        case .down: return "Hors ligne"
        case .noVideo: return "Pas de vidéo"
        case .stale: return "Figé"
        case .testing: return "Test…"
        case .untested: return server.kind == .web ? "Site" : server.kind == .resolve ? "À préparer" : ""
        }
    }

    private func probeColor(_ server: LiveServer) -> Color {
        switch server.probe {
        case .up: return Theme.teal
        case .slow, .stale, .late: return .orange
        case .down, .noVideo: return .red
        default: return Theme.muted
        }
    }
}
