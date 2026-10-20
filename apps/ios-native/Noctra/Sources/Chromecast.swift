import Foundation
import Network
import Observation
import SwiftUI

// Chromecast, Google TV et téléviseurs « Chromecast intégré », sans SDK :
// découverte Bonjour (_googlecast._tcp) puis protocole Cast v2 (messages
// protobuf sur TLS, port 8009) avec le lecteur multimédia par défaut de Google.

/// Appareil Cast trouvé sur le réseau local.
struct ChromecastDevice: Identifiable, Hashable, @unchecked Sendable {
    let id: String
    let name: String
    let model: String
    let endpoint: NWEndpoint

    static func == (lhs: ChromecastDevice, rhs: ChromecastDevice) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Recherche des appareils Cast (autorisation « Réseau local » d'iOS).
@MainActor
@Observable
final class ChromecastBrowser {
    static let shared = ChromecastBrowser()
    private(set) var devices: [ChromecastDevice] = []
    private(set) var searching = false
    private(set) var blocked = false
    @ObservationIgnored private var browser: NWBrowser?

    func start() {
        guard browser == nil else { return }
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_googlecast._tcp", domain: nil), using: NWParameters())
        browser.browseResultsChangedHandler = { results, _ in
            let found: [ChromecastDevice] = results.compactMap { result in
                guard case let .service(name, _, _, _) = result.endpoint else { return nil }
                var txt: [String: String] = [:]
                if case let .bonjour(record) = result.metadata { txt = record.dictionary }
                return ChromecastDevice(id: name, name: txt["fn"] ?? name, model: txt["md"] ?? "Chromecast", endpoint: result.endpoint)
            }
            Task { @MainActor in
                ChromecastBrowser.shared.devices = found.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            }
        }
        browser.stateUpdateHandler = { state in
            Task { @MainActor in
                let shared = ChromecastBrowser.shared
                switch state {
                case .ready: shared.searching = true; shared.blocked = false
                case .waiting, .failed: shared.blocked = true; shared.searching = false
                default: break
                }
            }
        }
        browser.start(queue: .main)
        self.browser = browser
    }

    func stop() {
        browser?.cancel()
        browser = nil
        searching = false
    }
}

// MARK: Messages Cast v2

/// Message Cast (CastMessage du protocole, encodé en protobuf à la main).
struct CastMessage: Sendable {
    let source: String
    let destination: String
    let namespace: String
    let payload: String

    func encoded() -> Data {
        var data = Data()
        Self.varint(0x08, into: &data); Self.varint(0, into: &data)          // protocol_version = CASTV2_1_0
        Self.string(2, source, into: &data)
        Self.string(3, destination, into: &data)
        Self.string(4, namespace, into: &data)
        Self.varint(0x28, into: &data); Self.varint(0, into: &data)          // payload_type = STRING
        Self.string(6, payload, into: &data)
        return data
    }

    init(source: String, destination: String, namespace: String, payload: String) {
        self.source = source
        self.destination = destination
        self.namespace = namespace
        self.payload = payload
    }

    init?(decoding data: Data) {
        let bytes = [UInt8](data)
        var index = 0
        var fields: [Int: String] = [:]
        func readVarint() -> UInt64? {
            var result: UInt64 = 0
            var shift: UInt64 = 0
            while index < bytes.count {
                let byte = bytes[index]
                index += 1
                result |= UInt64(byte & 0x7F) << shift
                if byte & 0x80 == 0 { return result }
                shift += 7
                if shift > 63 { return nil }
            }
            return nil
        }
        while index < bytes.count {
            guard let key = readVarint() else { return nil }
            let field = Int(key >> 3)
            switch key & 7 {
            case 0: guard readVarint() != nil else { return nil }
            case 1: index += 8
            case 5: index += 4
            case 2:
                guard let length = readVarint(), index + Int(length) <= bytes.count else { return nil }
                let slice = bytes[index ..< index + Int(length)]
                index += Int(length)
                fields[field] = String(decoding: slice, as: UTF8.self)
            default: return nil
            }
        }
        guard let namespace = fields[4] else { return nil }
        self.init(source: fields[2] ?? "", destination: fields[3] ?? "", namespace: namespace, payload: fields[6] ?? "")
    }

    private static func varint(_ value: UInt64, into data: inout Data) {
        var value = value
        repeat {
            var byte = UInt8(value & 0x7F)
            value >>= 7
            if value != 0 { byte |= 0x80 }
            data.append(byte)
        } while value != 0
    }

    private static func string(_ field: UInt64, _ text: String, into data: inout Data) {
        let bytes = Data(text.utf8)
        varint(field << 3 | 2, into: &data)
        varint(UInt64(bytes.count), into: &data)
        data.append(bytes)
    }
}

/// Connexion TLS vers l'appareil (certificat auto-signé de l'appareil accepté).
final class CastChannel: @unchecked Sendable {
    private let connection: NWConnection
    private let queue = DispatchQueue(label: "com.noctra.cast")
    private var buffer = Data()
    var onMessage: (@Sendable (CastMessage) -> Void)?
    var onState: (@Sendable (NWConnection.State) -> Void)?

    init(endpoint: NWEndpoint) {
        let tls = NWProtocolTLS.Options()
        sec_protocol_options_set_verify_block(tls.securityProtocolOptions, { _, _, complete in complete(true) }, DispatchQueue.global())
        let tcp = NWProtocolTCP.Options()
        tcp.connectionTimeout = 8
        tcp.enableKeepalive = true
        connection = NWConnection(to: endpoint, using: NWParameters(tls: tls, tcp: tcp))
    }

    func start() {
        connection.stateUpdateHandler = { [weak self] state in self?.onState?(state) }
        connection.start(queue: queue)
        receive()
    }

    func send(_ message: CastMessage) {
        let body = message.encoded()
        var frame = Data()
        let length = UInt32(body.count)
        frame.append(contentsOf: [UInt8(length >> 24 & 0xFF), UInt8(length >> 16 & 0xFF), UInt8(length >> 8 & 0xFF), UInt8(length & 0xFF)])
        frame.append(body)
        connection.send(content: frame, completion: .contentProcessed { _ in })
    }

    func cancel() {
        onMessage = nil
        onState = nil
        connection.cancel()
    }

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, complete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.buffer.append(data)
                self.drain()
            }
            if complete || error != nil {
                self.onState?(.cancelled)
                return
            }
            self.receive()
        }
    }

    private func drain() {
        while buffer.count >= 4 {
            let start = buffer.startIndex
            let length = buffer[start ..< start + 4].reduce(0) { ($0 << 8) | Int($1) }
            guard length >= 0, buffer.count >= 4 + length else { return }
            let body = buffer.subdata(in: start + 4 ..< start + 4 + length)
            buffer.removeSubrange(start ..< start + 4 + length)
            if let message = CastMessage(decoding: body) { onMessage?(message) }
        }
    }
}

// MARK: Lecture sur l'appareil

/// Titre lu sur un Chromecast : lancement, télécommande, suivi de lecture Jellyfin.
@MainActor
@Observable
final class ChromecastController {
    static let shared = ChromecastController()

    private(set) var device: ChromecastDevice?
    private(set) var connecting = false
    private(set) var title = ""
    private(set) var subtitle = ""
    private(set) var artwork: URL?
    private(set) var playerState = "IDLE"
    private(set) var position: Double = 0
    private(set) var duration: Double = 0
    private(set) var volume: Double = 1
    private(set) var muted = false
    var problem: String?

    var isActive: Bool { device != nil }
    var isPlaying: Bool { playerState == "PLAYING" || playerState == "BUFFERING" }

    @ObservationIgnored private var channel: CastChannel?
    @ObservationIgnored private var transportId: String?
    @ObservationIgnored private var appSessionId: String?
    @ObservationIgnored private var mediaSessionId: Int?
    @ObservationIgnored private var requestId = 1
    @ObservationIgnored private var pendingLoad: [String: Any]?
    @ObservationIgnored private var heartbeat: Task<Void, Never>?
    @ObservationIgnored private var positionDate = Date()
    @ObservationIgnored private var report: PlaybackManager.Report?
    @ObservationIgnored private var reportedStart = false
    @ObservationIgnored private var lastReport = Date.distantPast

    private static let receiverApp = "CC1AD845"
    private static let connectionNS = "urn:x-cast:com.google.cast.tp.connection"
    private static let heartbeatNS = "urn:x-cast:com.google.cast.tp.heartbeat"
    private static let receiverNS = "urn:x-cast:com.google.cast.receiver"
    private static let mediaNS = "urn:x-cast:com.google.cast.media"
    private static let sender = "sender-noctra"

    /// Position estimée (le Chromecast n'envoie l'état qu'aux changements).
    func currentPosition(at date: Date = Date()) -> Double {
        guard playerState == "PLAYING" else { return position }
        let value = position + date.timeIntervalSince(positionDate)
        return duration > 0 ? min(value, duration) : value
    }

    /// Profil Chromecast : MP4/WebM H.264 lus tels quels, sinon HLS MPEG-TS H.264/AAC.
    static let deviceProfile: [String: Any] = [
        "Name": "Noctra Chromecast",
        "MaxStreamingBitrate": 40_000_000,
        "MaxStaticBitrate": 40_000_000,
        "DirectPlayProfiles": [
            ["Container": "mp4,m4v,webm", "Type": "Video", "VideoCodec": "h264,vp8,vp9", "AudioCodec": "aac,mp3,opus,vorbis,flac"],
            ["Container": "mp3,aac,m4a,flac,ogg,wav,webm", "Type": "Audio"]
        ],
        "TranscodingProfiles": [
            ["Container": "ts", "Type": "Video", "VideoCodec": "h264", "AudioCodec": "aac,mp3", "Protocol": "hls",
             "Context": "Streaming", "MaxAudioChannels": "2", "MinSegments": 1, "BreakOnNonKeyFrames": true],
            ["Container": "mp3", "Type": "Audio", "AudioCodec": "mp3", "Protocol": "http", "Context": "Streaming"]
        ],
        "ContainerProfiles": [] as [Any],
        "CodecProfiles": [] as [Any],
        "SubtitleProfiles": ["vtt", "webvtt", "srt", "subrip", "ass", "ssa", "mov_text", "ttml"].map { ["Format": $0, "Method": "External"] }
            + ["pgssub", "pgs", "dvdsub", "dvbsub", "vobsub"].map { ["Format": $0, "Method": "Encode"] }
    ]

    func cast(_ item: BaseItem, session: Session, startSeconds: Double, audioIndex: Int?, subtitleIndex: Int?, to target: ChromecastDevice) async throws {
        guard let token = session.token else { throw NoctraError.http(401) }
        var query: [String: String?] = [
            "userId": session.userId, "isPlayback": "true", "autoOpenLiveStream": "true", "maxStreamingBitrate": "40000000"
        ]
        if let audioIndex { query["audioStreamIndex"] = String(audioIndex) }
        if let subtitleIndex { query["subtitleStreamIndex"] = String(subtitleIndex) }
        let data = try await session.data("POST", "/Items/\(item.id)/PlaybackInfo", query, json: ["DeviceProfile": Self.deviceProfile])
        let info = try JSONDecoder.jellyfin.decode(PlaybackInfoResponse.self, from: data)
        guard let source = info.mediaSources?.first else { throw NoctraError.empty }
        let playSession = info.playSessionId ?? UUID().uuidString

        // Le Chromecast ne peut pas envoyer d'en-tête : le jeton voyage dans l'adresse.
        var mediaURL: URL?
        var contentType = "video/mp4"
        var method = "DirectPlay"
        if source.supportsDirectPlay == true, let container = source.container?.split(separator: ",").first {
            mediaURL = session.url("/Videos/\(item.id)/stream.\(container)", [
                "static": "true", "mediaSourceId": source.id, "deviceId": session.deviceId,
                "playSessionId": playSession, "tag": source.eTag, "api_key": token
            ])
            contentType = container == "webm" ? "video/webm" : "video/mp4"
        } else if let transcoding = source.transcodingUrl {
            let lower = transcoding.lowercased()
            let separator = transcoding.contains("?") ? "&" : "?"
            let withKey = lower.contains("api_key=") || lower.contains("apikey=") ? transcoding : transcoding + separator + "api_key=" + token
            mediaURL = URL(string: session.jellyfinBase + withKey)
            contentType = "application/x-mpegURL"
            method = source.supportsDirectStream == true ? "DirectStream" : "Transcode"
        }
        guard let mediaURL else { throw NoctraError.empty }

        let heading = item.type == "Episode" ? (item.seriesName ?? item.title) : item.title
        let detail = item.type == "Episode" ? [item.episodeLabel, item.name].compactMap { $0 }.joined(separator: " · ") : (item.productionYear.map { String($0) } ?? "")
        let image = session.backdrop(item, width: 1280)
        var media: [String: Any] = [
            "contentId": mediaURL.absoluteString,
            "contentUrl": mediaURL.absoluteString,
            "contentType": contentType,
            "streamType": "BUFFERED",
            "metadata": [
                "metadataType": item.type == "Episode" ? 2 : 1,
                "title": heading,
                "subtitle": detail,
                "seriesTitle": item.seriesName ?? "",
                "images": image.map { [["url": $0.absoluteString]] } ?? []
            ] as [String: Any]
        ]
        if contentType.contains("mpegURL") {
            media["hlsSegmentFormat"] = "ts"
            media["hlsVideoSegmentFormat"] = "mpeg2_ts"
        }
        var load: [String: Any] = ["type": "LOAD", "autoplay": true, "currentTime": startSeconds]
        let chosen = subtitleIndex ?? source.defaultSubtitleStreamIndex ?? -1
        if chosen >= 0, let stream = source.mediaStreams?.first(where: { $0.index == chosen && $0.type == "Subtitle" }),
           stream.deliveryMethod != "Encode", stream.isTextSubtitleStream != false,
           let vtt = session.url("/Videos/\(item.id)/\(source.id)/Subtitles/\(chosen)/0/Stream.vtt", ["api_key": token]) {
            media["tracks"] = [[
                "trackId": 1, "type": "TEXT", "subtype": "SUBTITLES", "trackContentId": vtt.absoluteString,
                "trackContentType": "text/vtt", "name": stream.label, "language": stream.language ?? "fr"
            ] as [String: Any]] as [[String: Any]]
            media["textTrackStyle"] = ["backgroundColor": "#00000000", "foregroundColor": "#FFFFFFFF", "edgeType": "OUTLINE",
                                       "edgeColor": "#000000FF", "fontScale": 1.1] as [String: Any]
            load["activeTrackIds"] = [1]
        }
        load["media"] = media

        finishReport()
        title = heading
        subtitle = detail
        artwork = image
        position = startSeconds
        positionDate = Date()
        duration = item.runTimeTicks.map { Double($0) / 10_000_000 } ?? 0
        playerState = "BUFFERING"
        problem = nil
        report = PlaybackManager.Report(session: session, itemId: item.id, mediaSourceId: source.id, playSessionId: playSession, playMethod: method)
        reportedStart = false

        if device?.id == target.id, channel != nil, transportId != nil {
            send(load, namespace: Self.mediaNS, to: transportId!)
        } else {
            pendingLoad = load
            connect(target)
        }
    }

    /// Droit média temporaire pour le Chromecast, sans transmettre le jeton du compte.
    func castLive(_ live: LiveChannel, session: Session, to target: ChromecastDevice) async throws {
        let model = LivePlayerModel.shared
        var choices = model.channel?.id == live.id ? model.servers : await LiveLauncher.shared.prepare(live, session: session)
        // Serveurs de toutes les sources de la chaîne, le plus fiable d'abord ; celui qui lit déjà en tête.
        choices = LiveHealth.rank(choices, channel: live.id)
        if model.channel?.id == live.id, let current = model.current { choices = [current] + choices.filter { $0.id != current.id } }
        let failing: [LiveServer.Probe] = [.down, .noVideo, .stale]
        var lastError: Error?
        var attempts = 0
        for candidate in choices where attempts < 5 && !failing.contains(candidate.probe) {
            var streams: [LiveServer] = []
            if candidate.kind == .native, candidate.streamURL != nil, !candidate.mpegts { streams = [candidate] }
            else if candidate.kind == .resolve {
                streams = Array(await LiveServerFactory.resolve(candidate, session: session, timeout: 45).filter { $0.kind == .native && $0.streamURL != nil && !$0.mpegts }.prefix(2))
            }
            for server in streams where attempts < 5 {
                // Test rapide avant l'envoi : un flux refusé (LiveWatch VIP sans autorisation…) passe au suivant.
                let probe = await LiveServerFactory.probe(server, session: session)
                if failing.contains(probe.state) { continue }
                attempts += 1
                do {
                    try await castLiveStream(server, live: live, session: session, to: target)
                    return
                } catch {
                    lastError = error
                }
            }
        }
        if let lastError { throw lastError }
        throw NSError(domain: "NoctraCast", code: 1, userInfo: [NSLocalizedDescriptionKey: "Aucun serveur de cette chaîne n’est lisible par le Chromecast pour le moment. Essayez Noctra TV ou un autre serveur."])
    }

    /// Envoi d'un flux de chaîne au Chromecast (droit temporaire du serveur Noctra), jusqu'à la lecture.
    private func castLiveStream(_ server: LiveServer, live: LiveChannel, session: Session, to target: ChromecastDevice) async throws {
        guard let stream = server.streamURL else { throw NoctraError.empty }
        let access: [String: Any]?
        let parts = URLComponents(url: stream, resolvingAgainstBaseURL: false)
        let encodedQuery = parts?.percentEncodedQuery
        let addressToShare = session.isNoctraOrigin(stream) ? (parts?.percentEncodedPath ?? stream.path) + (encodedQuery.map { "?" + $0 } ?? "") : stream.absoluteString
        do { access = try await session.noctraSend("POST", "/api/tv/cast", json: ["url": addressToShare, "headers": server.headers]) as? [String: Any] }
        catch { throw NSError(domain: "NoctraCast", code: 2, userInfo: [NSLocalizedDescriptionKey: "La diffusion TV nécessite la mise à jour du serveur Noctra fournie avec cette version."]) }
        guard let path = access?["url"] as? String, let address = session.noctraURL(path) else { throw NoctraError.empty }
        try await castStream(address, title: live.name, subtitle: "TV en direct", image: live.logo.flatMap { session.noctraURL($0) }, to: target)
    }

    /// Flux direct déjà autorisé pour le Chromecast (chaîne, multiview composé par le serveur) :
    /// envoyé puis suivi jusqu'à la lecture.
    func castStream(_ address: URL, title streamTitle: String, subtitle streamSubtitle: String, image: URL?, to target: ChromecastDevice) async throws {
        let media: [String: Any] = ["contentId": address.absoluteString, "contentUrl": address.absoluteString,
            "contentType": "application/x-mpegURL", "streamType": "LIVE",
            "metadata": ["metadataType": 0, "title": streamTitle, "subtitle": streamSubtitle, "images": image.map { [["url": $0.absoluteString]] } ?? []] as [String: Any]]
        let load: [String: Any] = ["type": "LOAD", "autoplay": true, "media": media]
        finishReport()
        title = streamTitle; subtitle = streamSubtitle; artwork = image
        duration = 0; position = 0; playerState = "BUFFERING"; problem = nil; mediaSessionId = nil
        if device?.id == target.id, channel != nil, let transportId { send(load, namespace: Self.mediaNS, to: transportId) }
        else { pendingLoad = load; connect(target) }
        let deadline = Date().addingTimeInterval(30)
        while mediaSessionId == nil || playerState != "PLAYING" {
            try Task.checkCancellation()
            if let problem { throw NSError(domain: "NoctraCast", code: 3, userInfo: [NSLocalizedDescriptionKey: problem]) }
            guard Date() < deadline else { throw NoctraError.unreachable }
            try await Task.sleep(for: .milliseconds(200))
        }
    }

    // MARK: Télécommande

    func togglePlay() {
        guard let mediaSessionId, let transportId else { return }
        let type = playerState == "PLAYING" ? "PAUSE" : "PLAY"
        send(["type": type, "mediaSessionId": mediaSessionId], namespace: Self.mediaNS, to: transportId)
    }

    func seek(to seconds: Double) {
        guard let mediaSessionId, let transportId else { return }
        position = max(0, seconds)
        positionDate = Date()
        send(["type": "SEEK", "mediaSessionId": mediaSessionId, "currentTime": position], namespace: Self.mediaNS, to: transportId)
    }

    func skip(_ delta: Double) { seek(to: currentPosition() + delta) }

    func setVolume(_ level: Double) {
        volume = min(1, max(0, level))
        send(["type": "SET_VOLUME", "volume": ["level": volume]], namespace: Self.receiverNS, to: "receiver-0")
    }

    func toggleMute() {
        muted.toggle()
        send(["type": "SET_VOLUME", "volume": ["muted": muted]], namespace: Self.receiverNS, to: "receiver-0")
    }

    /// Arrêt : la lecture s'arrête sur le téléviseur et l'appli Cast se ferme.
    func stop() {
        if let appSessionId {
            send(["type": "STOP", "sessionId": appSessionId], namespace: Self.receiverNS, to: "receiver-0")
        }
        disconnect()
    }

    // MARK: Connexion

    private func connect(_ target: ChromecastDevice) {
        disconnect(keepReport: true)
        device = target
        connecting = true
        let channel = CastChannel(endpoint: target.endpoint)
        channel.onState = { state in
            Task { @MainActor in ChromecastController.shared.channelState(state) }
        }
        channel.onMessage = { message in
            Task { @MainActor in ChromecastController.shared.handle(message) }
        }
        self.channel = channel
        channel.start()
    }

    private func channelState(_ state: NWConnection.State) {
        switch state {
        case .ready:
            send(["type": "CONNECT"], namespace: Self.connectionNS, to: "receiver-0", numbered: false)
            send(["type": "LAUNCH", "appId": Self.receiverApp], namespace: Self.receiverNS, to: "receiver-0")
            heartbeat?.cancel()
            heartbeat = Task { @MainActor [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(5))
                    guard let self, self.channel != nil else { return }
                    self.send(["type": "PING"], namespace: Self.heartbeatNS, to: "receiver-0", numbered: false)
                    if let transport = self.transportId, self.mediaSessionId != nil {
                        self.send(["type": "GET_STATUS"], namespace: Self.mediaNS, to: transport)
                    }
                }
            }
        case .failed, .cancelled:
            if connecting { problem = "Connexion au Chromecast impossible. Vérifiez qu’il est sur le même Wi-Fi." }
            disconnect()
        case .waiting:
            problem = "Le Chromecast ne répond pas. Autorisez « Réseau local » pour Noctra dans les Réglages d’iOS."
            disconnect()
        default:
            break
        }
    }

    private func disconnect(keepReport: Bool = false) {
        heartbeat?.cancel()
        heartbeat = nil
        channel?.cancel()
        channel = nil
        transportId = nil
        appSessionId = nil
        mediaSessionId = nil
        connecting = false
        if !keepReport {
            finishReport()
            device = nil
            pendingLoad = nil
            playerState = "IDLE"
        }
    }

    private func send(_ json: [String: Any], namespace: String, to destination: String, numbered: Bool = true) {
        guard let channel else { return }
        var body = json
        if numbered {
            requestId += 1
            body["requestId"] = requestId
        }
        guard let data = try? JSONSerialization.data(withJSONObject: body), let payload = String(data: data, encoding: .utf8) else { return }
        channel.send(CastMessage(source: Self.sender, destination: destination, namespace: namespace, payload: payload))
    }

    private func handle(_ message: CastMessage) {
        guard let json = (try? JSONSerialization.jsonObject(with: Data(message.payload.utf8))) as? [String: Any],
              let type = json["type"] as? String else { return }
        switch type {
        case "PING":
            send(["type": "PONG"], namespace: Self.heartbeatNS, to: message.source, numbered: false)
        case "RECEIVER_STATUS":
            let status = json["status"] as? [String: Any]
            if let level = (status?["volume"] as? [String: Any])?["level"] as? Double { volume = level }
            if let mute = (status?["volume"] as? [String: Any])?["muted"] as? Bool { muted = mute }
            let apps = (status?["applications"] as? [[String: Any]]) ?? []
            guard let app = apps.first(where: { ($0["appId"] as? String) == Self.receiverApp }),
                  let transport = app["transportId"] as? String else {
                // Autre appli lancée sur le téléviseur : la session Noctra est terminée.
                if transportId != nil && pendingLoad == nil { disconnect() }
                return
            }
            appSessionId = app["sessionId"] as? String
            if transportId != transport {
                transportId = transport
                send(["type": "CONNECT"], namespace: Self.connectionNS, to: transport, numbered: false)
            }
            connecting = false
            if let load = pendingLoad {
                pendingLoad = nil
                send(load, namespace: Self.mediaNS, to: transport)
            }
        case "MEDIA_STATUS":
            guard let status = (json["status"] as? [[String: Any]])?.first else { return }
            if let id = status["mediaSessionId"] as? Int { mediaSessionId = id }
            if let state = status["playerState"] as? String { playerState = state }
            if let time = status["currentTime"] as? Double {
                position = time
                positionDate = Date()
            }
            if let media = status["media"] as? [String: Any], let length = media["duration"] as? Double, length > 0 { duration = length }
            reportProgress()
            if playerState == "IDLE", let reason = status["idleReason"] as? String, ["FINISHED", "CANCELLED", "INTERRUPTED"].contains(reason) {
                finishReport()
            }
            if playerState == "IDLE", (status["idleReason"] as? String) == "ERROR" {
                problem = "Le Chromecast n’a pas pu lire ce titre."
            }
        case "LOAD_FAILED", "LOAD_CANCELLED", "INVALID_REQUEST":
            problem = "Le Chromecast n’a pas pu lire ce titre."
            playerState = "IDLE"
        case "LAUNCH_ERROR":
            problem = "Le lecteur Cast ne démarre pas sur cet appareil."
            disconnect()
        case "CLOSE":
            if message.source == transportId { disconnect() }
        default:
            break
        }
    }

    // MARK: Suivi Jellyfin (reprise, « vu »)

    private func reportProgress() {
        guard let report else { return }
        let paused = playerState == "PAUSED"
        if !reportedStart, playerState == "PLAYING" {
            reportedStart = true
            lastReport = Date()
            post("/Sessions/Playing", report, paused: false)
        } else if reportedStart, Date().timeIntervalSince(lastReport) >= 10 {
            lastReport = Date()
            post("/Sessions/Playing/Progress", report, paused: paused)
        }
    }

    private func finishReport() {
        guard let report else { return }
        if reportedStart { post("/Sessions/Playing/Stopped", report, paused: false) }
        self.report = nil
        reportedStart = false
        NotificationCenter.default.post(name: .noctraPlaybackEnded, object: nil)
    }

    private func post(_ path: String, _ report: PlaybackManager.Report, paused: Bool) {
        let ticks = Int64(max(0, currentPosition()) * 10_000_000)
        let body: [String: Any] = [
            "ItemId": report.itemId, "MediaSourceId": report.mediaSourceId, "PlaySessionId": report.playSessionId,
            "PositionTicks": ticks, "CanSeek": true, "IsPaused": paused, "PlayMethod": report.playMethod
        ]
        Task { _ = try? await report.session.data("POST", path, json: body) }
    }
}

// MARK: Écrans

/// Lecture en cours sur un Chromecast : capsule au-dessus des onglets.
struct ChromecastMiniPlayer: View {
    @State private var showRemote = false
    private var cast: ChromecastController { .shared }

    var body: some View {
        if cast.isActive {
            Button {
                showRemote = true
            } label: {
                HStack(spacing: 12) {
                    RemoteImage(url: cast.artwork)
                        .frame(width: 54, height: 34)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(cast.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                        Label(cast.connecting ? "Connexion à \(cast.device?.name ?? "")…" : (cast.device?.name ?? ""), systemImage: "tv.badge.wifi")
                            .font(.caption2)
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    Button {
                        cast.togglePlay()
                    } label: {
                        Image(systemName: cast.isPlaying ? "pause.fill" : "play.fill")
                            .font(.title3)
                            .contentTransition(.symbolEffect(.replace))
                            .frame(width: 40, height: 40)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.leading, 8)
                .padding(.trailing, 6)
                .padding(.vertical, 6)
                .foregroundStyle(.white)
                .glassEffect(.regular.tint(Color(hex: 0x0E0E20).opacity(0.55)).interactive(), in: Capsule())
                .overlay(Capsule().stroke(Theme.lilac.opacity(0.45), lineWidth: 1))
            }
            .buttonStyle(PressableStyle(scale: 0.97))
            .padding(.horizontal, 16)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .sheet(isPresented: $showRemote) {
                ChromecastRemote().presentationDetents([.medium, .large])
            }
        }
    }
}

/// Télécommande du Chromecast : avance, recul, volume, arrêt.
struct ChromecastRemote: View {
    @Environment(\.dismiss) private var dismiss
    @State private var scrub: Double?
    private var cast: ChromecastController { .shared }

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let now = scrub ?? cast.currentPosition(at: context.date)
                VStack(spacing: 22) {
                    RemoteImage(url: cast.artwork)
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .auroraCard(cornerRadius: 22)
                        .padding(.horizontal, 24)
                    VStack(spacing: 4) {
                        Text(cast.title).font(.display(22, .bold, relativeTo: .title2)).multilineTextAlignment(.center)
                        if !cast.subtitle.isEmpty { Text(cast.subtitle).font(.subheadline).foregroundStyle(Theme.muted) }
                    }
                    if cast.duration > 0 {
                        VStack(spacing: 4) {
                            Slider(value: Binding(get: { now }, set: { scrub = $0 }), in: 0...max(cast.duration, 1), onEditingChanged: { editing in
                                if !editing, let target = scrub {
                                    cast.seek(to: target)
                                    scrub = nil
                                }
                            })
                            .tint(Theme.lilac)
                            HStack {
                                Text(ItemDetailView.clock(now))
                                Spacer()
                                Text("-" + ItemDetailView.clock(max(0, cast.duration - now)))
                            }
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(Theme.muted)
                        }
                        .padding(.horizontal, 24)
                    }
                    GlassEffectContainer(spacing: 18) {
                        HStack(spacing: 18) {
                            if cast.duration > 0 { control("gobackward.10") { cast.skip(-10) } }
                            control(cast.isPlaying ? "pause.fill" : "play.fill", large: true) { cast.togglePlay() }
                            if cast.duration > 0 { control("goforward.30") { cast.skip(30) } }
                        }
                    }
                    HStack(spacing: 12) {
                        Button { cast.toggleMute() } label: {
                            Image(systemName: cast.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        }
                        Slider(value: Binding(get: { cast.volume }, set: { cast.setVolume($0) }), in: 0...1)
                            .tint(Theme.lilac)
                    }
                    .padding(.horizontal, 24)
                    if let problem = cast.problem {
                        Label(problem, systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(.orange).padding(.horizontal, 24)
                    }
                    Button(role: .destructive) {
                        cast.stop()
                        dismiss()
                    } label: {
                        Label("Arrêter la diffusion", systemImage: "stop.fill").frame(maxWidth: .infinity).padding(.vertical, 4)
                    }
                    .auroraSecondary()
                    .padding(.horizontal, 24)
                }
                .padding(.vertical, 16)
            }
            .navigationTitle(cast.device?.name ?? "Chromecast")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
            .background(AuroraBackground())
        }
    }

    private func control(_ icon: String, large: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(large ? .largeTitle : .title2)
                .frame(width: large ? 78 : 58, height: large ? 78 : 58)
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
        .glassEffect(large ? .regular.tint(Theme.lilac.opacity(0.45)).interactive() : .regular.interactive(), in: Circle())
        .sensoryFeedback(.impact(weight: .light), trigger: cast.playerState)
    }
}
