import AVFoundation
import AVKit
import UIKit

/// Lecteur vidéo natif d'iOS (AVPlayerViewController) : image dans l'image,
/// AirPlay, commandes du système. Films : décision de Jellyfin selon les
/// formats lus par l'iPhone (lecture directe, sinon flux HLS adapté).
@MainActor
final class PlaybackManager: NSObject, AVPlayerViewControllerDelegate {
    static let shared = PlaybackManager()

    private var player: AVPlayer?
    private weak var controller: AVPlayerViewController?
    private var progressObserver: Any?
    private var watchTask: Task<Void, Never>?
    private var report: Report?
    private var pictureInPicture = false
    private var closed = true

    /// Suivi de lecture envoyé à Jellyfin (reprise, « vu »).
    struct Report {
        let session: Session
        let itemId: String
        let mediaSourceId: String
        let playSessionId: String
        let playMethod: String
    }

    // MARK: Films et épisodes

    func play(_ item: BaseItem, session: Session, audioIndex: Int?, subtitleIndex: Int?, startSeconds: Double) async throws {
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

        let report = Report(session: session, itemId: item.id, mediaSourceId: source.id, playSessionId: playSession, playMethod: method)
        let title = item.type == "Episode" ? [item.seriesName, item.episodeLabel, item.name].compactMap { $0 }.joined(separator: " · ") : item.title
        present(urls: [(url, session.authHeaders)], title: title, startSeconds: startSeconds, report: report)
    }

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
        "SubtitleProfiles": [
            ["Format": "vtt", "Method": "Hls"],
            ["Format": "subrip", "Method": "Hls"],
            ["Format": "srt", "Method": "Hls"],
            ["Format": "ass", "Method": "Encode"],
            ["Format": "ssa", "Method": "Encode"],
            ["Format": "pgssub", "Method": "Encode"],
            ["Format": "dvdsub", "Method": "Encode"]
        ]
    ]

    // MARK: TV en direct

    /// Serveurs d'une chaîne essayés l'un après l'autre : le suivant prend le
    /// relais si le flux ne démarre pas en 15 s ou tombe en erreur.
    func playLive(title: String, streams: [(URL, [String: String])]) {
        guard !streams.isEmpty else { return }
        present(urls: streams, title: title, startSeconds: 0, report: nil)
    }

    // MARK: Présentation

    private func present(urls: [(URL, [String: String])], title: String, startSeconds: Double, report: Report?) {
        close(notify: false)
        let player = AVPlayer()
        player.allowsExternalPlayback = true
        player.automaticallyWaitsToMinimizeStalling = true
        self.player = player
        self.report = report
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
            player.play()
        }

        if let report {
            Task { await self.send("/Sessions/Playing", report, position: startSeconds, paused: false) }
            progressObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 10, preferredTimescale: 1), queue: .main) { [weak self] time in
                MainActor.assumeIsolated {
                    guard let self, let report = self.report, let player = self.player else { return }
                    Task { await self.send("/Sessions/Playing/Progress", report, position: time.seconds, paused: player.rate == 0) }
                }
            }
        }
    }

    private func load(_ urls: [(URL, [String: String])], index: Int, title: String, startSeconds: Double) {
        guard index < urls.count, let player else { return }
        let (url, headers) = urls[index]
        let asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = report == nil ? 0 : 30
        let titleItem = AVMutableMetadataItem()
        titleItem.identifier = .commonIdentifierTitle
        titleItem.value = title as NSString
        titleItem.extendedLanguageTag = "und"
        item.externalMetadata = [titleItem]
        player.replaceCurrentItem(with: item)
        if startSeconds > 5 {
            player.seek(to: CMTime(seconds: startSeconds, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        }
        player.play()

        // Surveillance : passage au serveur suivant (direct), fermeture si la fiche a disparu.
        watchTask?.cancel()
        watchTask = Task { [weak self] in
            let started = Date()
            var ready = false
            var hiddenTicks = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard let self, !self.closed else { return }
                let status = item.status
                if status == .readyToPlay { ready = true }
                let failed = status == .failed || (!ready && Date().timeIntervalSince(started) > 15 && urls.count > index + 1)
                if failed && index + 1 < urls.count {
                    self.load(urls, index: index + 1, title: title, startSeconds: startSeconds)
                    return
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

    private func close(notify: Bool) {
        guard !closed else { return }
        closed = true
        watchTask?.cancel()
        watchTask = nil
        if let progressObserver, let player { player.removeTimeObserver(progressObserver) }
        progressObserver = nil
        let position = player?.currentTime().seconds ?? 0
        player?.pause()
        if let report {
            Task {
                await self.send("/Sessions/Playing/Stopped", report, position: position.isFinite ? position : 0, paused: false)
                if report.playMethod != "DirectPlay" {
                    _ = try? await report.session.data("DELETE", "/Videos/ActiveEncodings", ["deviceId": report.session.deviceId, "playSessionId": report.playSessionId])
                }
                NotificationCenter.default.post(name: .noctraPlaybackEnded, object: nil)
            }
        }
        report = nil
        player = nil
        if let controller, controller.presentingViewController != nil, !notify {
            controller.dismiss(animated: false)
        }
        controller = nil
    }

    private func send(_ path: String, _ report: Report, position: Double, paused: Bool) async {
        let ticks = Int64(max(0, position.isFinite ? position : 0) * 10_000_000)
        let body: [String: Any] = [
            "ItemId": report.itemId, "MediaSourceId": report.mediaSourceId, "PlaySessionId": report.playSessionId,
            "PositionTicks": ticks, "CanSeek": true, "IsPaused": paused, "PlayMethod": report.playMethod
        ]
        _ = try? await report.session.data("POST", path, json: body)
    }

    // MARK: AVPlayerViewControllerDelegate

    nonisolated func playerViewController(_ playerViewController: AVPlayerViewController,
                                          willEndFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator) {
        MainActor.assumeIsolated {
            coordinator.animate(alongsideTransition: nil) { context in
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
