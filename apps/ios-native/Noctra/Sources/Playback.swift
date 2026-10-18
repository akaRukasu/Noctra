import AVFoundation
import AVKit
import UIKit

/// Lecteur vidéo natif d'iOS (AVPlayerViewController) : image dans l'image,
/// AirPlay, commandes du système. Films : décision de Jellyfin selon les
/// formats lus par l'iPhone (lecture directe, sinon flux HLS adapté).
/// En groupe SyncPlay, la lecture suit les ordres du groupe.
@MainActor
final class PlaybackManager: NSObject, AVPlayerViewControllerDelegate {
    static let shared = PlaybackManager()

    private(set) var player: AVPlayer?
    private weak var controller: AVPlayerViewController?
    private var progressObserver: Any?
    private var syncObserver: Any?
    private var rateObservation: NSKeyValueObservation?
    private var watchTask: Task<Void, Never>?
    private var report: Report?
    private var pictureInPicture = false
    private var closed = true
    private var onExhausted: (() -> Void)?

    /// Lecture pilotée par un groupe SyncPlay.
    private(set) var syncMode = false
    private var syncItemId: String?
    /// Ordres du groupe en cours d'application : ce ne sont pas des gestes de l'utilisateur.
    private var commandUntil = Date.distantPast
    private var lastSampleTime: Double = 0
    private var lastSampleDate = Date()

    var isPlaying: Bool { !closed }
    var currentItemId: String? { closed ? nil : report?.itemId }
    var positionSeconds: Double {
        let value = player?.currentTime().seconds ?? 0
        return value.isFinite ? value : 0
    }

    /// Suivi de lecture envoyé à Jellyfin (reprise, « vu »).
    struct Report {
        let session: Session
        let itemId: String
        let mediaSourceId: String
        let playSessionId: String
        let playMethod: String
    }

    // MARK: Films et épisodes

    func play(_ item: BaseItem, session: Session, audioIndex: Int?, subtitleIndex: Int?, startSeconds: Double, sync: Bool = false) async throws {
        // En groupe SyncPlay : le titre est proposé au groupe, qui lance la lecture pour tous.
        if !sync, SyncPlayManager.shared.group != nil {
            try await SyncPlayManager.shared.setQueue(item.id, startSeconds: startSeconds)
            return
        }
        var query: [String: String?] = [
            "userId": session.userId, "isPlayback": "true", "autoOpenLiveStream": "true",
            "maxStreamingBitrate": "120000000"
        ]
        if let audioIndex { query["audioStreamIndex"] = String(audioIndex) }
        if let subtitleIndex { query["subtitleStreamIndex"] = String(subtitleIndex) }
        let data = try await session.data("POST", "/Items/\(item.id)/PlaybackInfo", query, json: ["DeviceProfile": Self.deviceProfile])
        let info = try JSONDecoder.jellyfin.decode(PlaybackInfoResponse.self, from: data)
        guard let source = info.mediaSources?.first else { throw NoctraError.empty }
        let playSession = info.playSessionId ?? UUID().uuidString

        let url: URL?
        let method: String
        if source.supportsDirectPlay == true, let container = source.container?.split(separator: ",").first {
            url = session.url("/Videos/\(item.id)/stream.\(container)", [
                "static": "true", "mediaSourceId": source.id, "deviceId": session.deviceId,
                "playSessionId": playSession, "tag": source.eTag, "api_key": session.token
            ])
            method = "DirectPlay"
        } else if let transcoding = source.transcodingUrl {
            url = URL(string: session.jellyfinBase + transcoding)
            method = (source.supportsDirectStream == true) ? "DirectStream" : "Transcode"
        } else {
            throw NoctraError.empty
        }
        guard let url else { throw NoctraError.badAddress }

        // Sous-titres texte : fichier WebVTT lu par l'appli. Sous-titres image
        // (PGS, VobSub) : incrustés par le serveur dans le flux (« Encode »).
        let chosen = subtitleIndex ?? source.defaultSubtitleStreamIndex ?? -1
        var subtitles: URL?
        if chosen >= 0, let stream = source.mediaStreams?.first(where: { $0.index == chosen && $0.type == "Subtitle" }),
           stream.deliveryMethod != "Encode", stream.isTextSubtitleStream != false {
            subtitles = session.url("/Videos/\(item.id)/\(source.id)/Subtitles/\(chosen)/0/Stream.vtt", ["api_key": session.token])
        }
        lastSubtitleURL = subtitles

        let report = Report(session: session, itemId: item.id, mediaSourceId: source.id, playSessionId: playSession, playMethod: method)
        let title = item.type == "Episode" ? [item.seriesName, item.episodeLabel, item.name].compactMap { $0 }.joined(separator: " · ") : item.title
        lastMediaURL = url
        lastMediaIsDirect = method == "DirectPlay"
        present(urls: [(url, session.authHeaders)], title: title, startSeconds: startSeconds, report: report, sync: sync, live: false)
        if let subtitles, let controller, let player {
            let overlay = SubtitleOverlay()
            overlay.attach(to: controller, player: player)
            subtitleOverlay = overlay
            Task { await overlay.load(subtitles, headers: session.authHeaders) }
        }
    }

    /// Dernier flux lancé (le cast vers Chromecast reprend le même choix de pistes).
    private(set) var lastMediaURL: URL?
    private(set) var lastMediaIsDirect = false
    private(set) var lastSubtitleURL: URL?
    private var subtitleOverlay: SubtitleOverlay?

    /// Profil de l'iPhone : formats lus directement par AVPlayer, sinon HLS en fMP4
    /// (copie de la vidéo et du son quand c'est possible : peu de travail pour le serveur).
    static let deviceProfile: [String: Any] = [
        "Name": "Noctra iOS",
        "MaxStreamingBitrate": 120_000_000,
        "MaxStaticBitrate": 120_000_000,
        "MusicStreamingTranscodingBitrate": 384_000,
        "DirectPlayProfiles": [
            ["Container": "mp4,m4v,mov", "Type": "Video", "VideoCodec": "h264,hevc", "AudioCodec": "aac,ac3,eac3,alac,mp3,flac"],
            ["Container": "mp3,aac,m4a,flac,alac,wav", "Type": "Audio"]
        ],
        "TranscodingProfiles": [
            ["Container": "mp4", "Type": "Video", "VideoCodec": "hevc,h264", "AudioCodec": "aac,ac3,eac3,alac,flac",
             "Protocol": "hls", "Context": "Streaming", "MaxAudioChannels": "6", "MinSegments": 2, "BreakOnNonKeyFrames": true],
            ["Container": "aac", "Type": "Audio", "AudioCodec": "aac", "Protocol": "hls", "Context": "Streaming"]
        ],
        "ContainerProfiles": [] as [Any],
        "CodecProfiles": [] as [Any],
        // Texte : fichier à part (WebVTT), la vidéo reste en lecture directe.
        // Image : incrustation par le serveur.
        "SubtitleProfiles": ["vtt", "webvtt", "srt", "subrip", "ass", "ssa", "mov_text", "ttml", "smi", "sub"].map { ["Format": $0, "Method": "External"] }
            + ["pgssub", "pgs", "dvdsub", "dvbsub", "vobsub", "xsub"].map { ["Format": $0, "Method": "Encode"] }
    ]

    // MARK: TV en direct

    /// Serveurs d'une chaîne essayés l'un après l'autre : le suivant prend le
    /// relais si le flux ne démarre pas en 12 s ou tombe en erreur. Tous en
    /// échec : `exhausted` (lecteur web de secours, message).
    func playLive(title: String, streams: [(URL, [String: String])], exhausted: (() -> Void)? = nil) {
        guard !streams.isEmpty else { exhausted?(); return }
        present(urls: streams, title: title, startSeconds: 0, report: nil, sync: false, live: true)
        onExhausted = exhausted
    }

    // MARK: Hors ligne

    /// Titre téléchargé : fichier local, reprise gardée sur l'iPhone, suivi
    /// envoyé au serveur quand il est joignable (reprise et « vu » partagés).
    func playOffline(_ entry: OfflineEntry, subtitle: Int? = nil, session: Session?) {
        guard let url = OfflineStore.shared.mediaURL(entry) else {
            SyncPlayManager.shared.post("Fichier introuvable : supprimez puis téléchargez à nouveau ce titre.")
            return
        }
        var report: Report?
        if let session, session.isSignedIn, let source = entry.mediaSourceId {
            report = Report(session: session, itemId: entry.id, mediaSourceId: source, playSessionId: UUID().uuidString, playMethod: "DirectPlay")
        }
        let start = entry.position > 5 ? entry.position : 0
        present(urls: [(url, [:])], title: entry.playerTitle, startSeconds: start, report: report, sync: false, live: false)
        offlineId = entry.id
        let choice = subtitle ?? entry.subtitleChoice ?? -1
        if choice >= 0, let file = OfflineStore.shared.subtitleURL(entry, index: choice), let controller, let player {
            let overlay = SubtitleOverlay()
            overlay.attach(to: controller, player: player)
            subtitleOverlay = overlay
            Task { await overlay.load(file, headers: [:]) }
        }
    }

    private var offlineId: String?

    // MARK: Présentation

    private func present(urls: [(URL, [String: String])], title: String, startSeconds: Double, report: Report?, sync: Bool, live: Bool) {
        close(notify: false)
        isLive = live
        let player = AVPlayer()
        player.allowsExternalPlayback = true
        player.automaticallyWaitsToMinimizeStalling = true
        self.player = player
        self.report = report
        syncMode = sync
        syncItemId = report?.itemId
        onExhausted = nil
        closed = false

        let controller = AVPlayerViewController()
        controller.player = player
        controller.delegate = self
        controller.allowsPictureInPicturePlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.modalPresentationStyle = .fullScreen
        self.controller = controller

        load(urls, index: 0, title: title, startSeconds: startSeconds)
        Self.topViewController()?.present(controller, animated: true) {
            if !sync { player.play() }
        }

        if let report {
            Task { await self.send("/Sessions/Playing", report, position: startSeconds, paused: sync) }
            progressObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 10, preferredTimescale: 1), queue: .main) { [weak self] time in
                MainActor.assumeIsolated {
                    guard let self, let report = self.report, let player = self.player else { return }
                    Task { await self.send("/Sessions/Playing/Progress", report, position: time.seconds, paused: player.rate == 0) }
                }
            }
        }
        if sync { observeSyncGestures(player) }
    }

    private func load(_ urls: [(URL, [String: String])], index: Int, title: String, startSeconds: Double) {
        guard index < urls.count, let player else { return }
        let (url, headers) = urls[index]
        var options: [String: Any] = ["AVURLAssetHTTPHeaderFieldsKey": headers]
        // Chaînes relayées par Noctra : cookie de session pour chaque segment.
        let cookies = report?.session.noctraCookies(for: url) ?? liveSession?.noctraCookies(for: url) ?? []
        if !cookies.isEmpty { options[AVURLAssetHTTPCookiesKey] = cookies }
        let asset = AVURLAsset(url: url, options: options)
        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = isLive ? 0 : (url.isFileURL ? 0 : 30)
        let titleItem = AVMutableMetadataItem()
        titleItem.identifier = .commonIdentifierTitle
        titleItem.value = title as NSString
        titleItem.extendedLanguageTag = "und"
        item.externalMetadata = [titleItem]
        player.replaceCurrentItem(with: item)
        if startSeconds > 5 {
            commandUntil = Date().addingTimeInterval(2)
            player.seek(to: CMTime(seconds: startSeconds, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        }
        if syncMode { player.pause() } else { player.play() }

        // Surveillance : serveur suivant (direct), prêt (SyncPlay), fermeture si le lecteur a disparu.
        watchTask?.cancel()
        let isLive = self.isLive
        watchTask = Task { [weak self] in
            let started = Date()
            var ready = false
            var hiddenTicks = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard let self, !self.closed else { return }
                let status = item.status
                if status == .readyToPlay && !ready {
                    ready = true
                    if self.syncMode { SyncPlayManager.shared.ready(position: self.positionSeconds, playing: false) }
                }
                if isLive {
                    let failed = status == .failed || (!ready && Date().timeIntervalSince(started) > 12)
                    if failed {
                        if index + 1 < urls.count {
                            self.load(urls, index: index + 1, title: title, startSeconds: startSeconds)
                        } else {
                            let fallback = self.onExhausted
                            self.close(notify: false)
                            fallback?()
                        }
                        return
                    }
                }
                // Lecteur fermé sans passer par le délégué (sécurité).
                if self.controller?.viewIfLoaded?.window == nil && !self.pictureInPicture {
                    hiddenTicks += 1
                    if hiddenTicks >= 4 { self.close(notify: true); return }
                } else {
                    hiddenTicks = 0
                }
            }
        }
    }

    /// Session utilisée par la TV en direct (cookies Noctra).
    weak var liveSession: Session?
    private var isLive = false

    private func close(notify: Bool) {
        guard !closed else { return }
        closed = true
        watchTask?.cancel()
        watchTask = nil
        if let progressObserver, let player { player.removeTimeObserver(progressObserver) }
        if let syncObserver, let player { player.removeTimeObserver(syncObserver) }
        progressObserver = nil
        syncObserver = nil
        rateObservation = nil
        subtitleOverlay?.detach()
        subtitleOverlay = nil
        let position = positionSeconds
        if let offlineId {
            let length = player?.currentItem?.duration.seconds ?? 0
            OfflineStore.shared.recordPosition(offlineId, position: position, duration: length)
            self.offlineId = nil
        }
        player?.pause()
        if let report {
            Task {
                await self.send("/Sessions/Playing/Stopped", report, position: position, paused: false)
                if report.playMethod != "DirectPlay" {
                    _ = try? await report.session.data("DELETE", "/Videos/ActiveEncodings", ["deviceId": report.session.deviceId, "playSessionId": report.playSessionId])
                }
                NotificationCenter.default.post(name: .noctraPlaybackEnded, object: nil)
            }
        }
        report = nil
        player = nil
        syncMode = false
        if let controller, controller.presentingViewController != nil, !notify {
            controller.dismiss(animated: true)
        }
        controller = nil
    }

    /// Fermeture demandée (groupe SyncPlay, autre appareil).
    func stop() { close(notify: false) }

    private func send(_ path: String, _ report: Report, position: Double, paused: Bool) async {
        let ticks = Int64(max(0, position.isFinite ? position : 0) * 10_000_000)
        let body: [String: Any] = [
            "ItemId": report.itemId, "MediaSourceId": report.mediaSourceId, "PlaySessionId": report.playSessionId,
            "PositionTicks": ticks, "CanSeek": true, "IsPaused": paused, "PlayMethod": report.playMethod
        ]
        _ = try? await report.session.data("POST", path, json: body)
    }

    // MARK: Commandes (SyncPlay, autre appareil)

    func commandPlay(at position: Double?) {
        guard let player else { return }
        commandUntil = Date().addingTimeInterval(1.5)
        if let position { player.seek(to: CMTime(seconds: position, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) }
        player.play()
    }

    func commandPause(at position: Double?) {
        guard let player else { return }
        commandUntil = Date().addingTimeInterval(1.5)
        player.pause()
        if let position { player.seek(to: CMTime(seconds: position, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) }
    }

    func commandSeek(to position: Double, completion: (() -> Void)? = nil) {
        guard let player else { return }
        commandUntil = Date().addingTimeInterval(2.5)
        player.pause()
        player.seek(to: CMTime(seconds: position, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { _ in
            Task { @MainActor in completion?() }
        }
    }

    func commandToggle() {
        guard let player else { return }
        if player.rate == 0 { commandPlay(at: nil) } else { commandPause(at: nil) }
    }

    /// Gestes de l'utilisateur dans le lecteur (pause, lecture, avance) : transmis au groupe.
    private func observeSyncGestures(_ player: AVPlayer) {
        rateObservation = player.observe(\.rate, options: [.new, .old]) { [weak self] _, change in
            let old = change.oldValue ?? 0
            let new = change.newValue ?? 0
            Task { @MainActor in
                guard let self, self.syncMode, Date() > self.commandUntil else { return }
                if old == 0 && new > 0 { SyncPlayManager.shared.requestUnpause() }
                if old > 0 && new == 0 { SyncPlayManager.shared.requestPause() }
            }
        }
        lastSampleTime = 0
        lastSampleDate = Date()
        syncObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 10), queue: .main) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self, self.syncMode, let player = self.player else { return }
                let now = Date()
                let expected = self.lastSampleTime + (player.rate > 0 ? now.timeIntervalSince(self.lastSampleDate) : 0)
                let current = time.seconds
                if current.isFinite, self.lastSampleTime > 0, abs(current - expected) > 3, now > self.commandUntil {
                    SyncPlayManager.shared.requestSeek(to: current)
                    self.commandUntil = now.addingTimeInterval(2)
                }
                self.lastSampleTime = current.isFinite ? current : 0
                self.lastSampleDate = now
            }
        }
    }

    // MARK: AVPlayerViewControllerDelegate

    nonisolated func playerViewController(_ playerViewController: AVPlayerViewController,
                                          willEndFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator) {
        MainActor.assumeIsolated {
            _ = coordinator.animate(alongsideTransition: nil) { context in
                guard !context.isCancelled else { return }
                MainActor.assumeIsolated {
                    if !self.pictureInPicture { self.close(notify: true) }
                }
            }
        }
    }

    nonisolated func playerViewControllerDidStartPictureInPicture(_ playerViewController: AVPlayerViewController) {
        MainActor.assumeIsolated { self.pictureInPicture = true }
    }

    nonisolated func playerViewControllerDidStopPictureInPicture(_ playerViewController: AVPlayerViewController) {
        MainActor.assumeIsolated {
            self.pictureInPicture = false
            if playerViewController.viewIfLoaded?.window == nil { self.close(notify: true) }
        }
    }

    nonisolated func playerViewController(_ playerViewController: AVPlayerViewController,
                                          restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
        MainActor.assumeIsolated {
            if playerViewController.presentingViewController == nil, let top = Self.topViewController() {
                top.present(playerViewController, animated: true) { completionHandler(true) }
            } else {
                completionHandler(true)
            }
        }
    }

    static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        var top = scene?.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
