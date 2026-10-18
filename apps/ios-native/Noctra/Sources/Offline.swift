import AVFoundation
import Network
import Observation
import SwiftUI
import UIKit

// Téléchargements hors ligne : films et épisodes gardés sur l'iPhone.
// Fichier d'origine quand l'iPhone le lit tel quel (MP4/MOV), sinon flux HLS
// préparé par le serveur et enregistré par iOS (AVAssetDownloadURLSession).
// Les deux continuent en arrière-plan, appli fermée.

enum OfflineQuality: String, CaseIterable, Identifiable, Codable {
    case original, high, medium, low

    var id: String { rawValue }

    var label: String {
        switch self {
        case .original: return "Originale"
        case .high: return "Haute · 10 Mb/s"
        case .medium: return "Moyenne · 4 Mb/s"
        case .low: return "Économie · 1,5 Mb/s"
        }
    }

    var detail: String {
        switch self {
        case .original: return "Fichier d’origine ou copie sans perte"
        case .high: return "≈ 4,5 Go par heure"
        case .medium: return "≈ 1,8 Go par heure"
        case .low: return "≈ 700 Mo par heure"
        }
    }

    var bitrate: Int {
        switch self {
        case .original: return 120_000_000
        case .high: return 10_000_000
        case .medium: return 4_000_000
        case .low: return 1_500_000
        }
    }
}

struct OfflineSubtitle: Codable, Hashable {
    let index: Int
    let label: String
    let isDefault: Bool
    let file: String
}

struct OfflineEntry: Codable, Identifiable, Hashable {
    enum State: String, Codable { case queued, downloading, paused, done, failed }

    let id: String
    var type: String
    var title: String
    var seriesName: String?
    var seriesId: String?
    var seasonNumber: Int?
    var episodeNumber: Int?
    var year: Int?
    var overview: String?
    var runTimeTicks: Int64?
    var quality: OfflineQuality
    var audioIndex: Int?
    var state: State
    var progress: Double = 0
    var written: Int64 = 0
    var expected: Int64 = 0
    var mediaPath: String?
    var isHLS = false
    var subtitles: [OfflineSubtitle] = []
    var subtitleChoice: Int?
    var position: Double = 0
    var played = false
    var addedAt = Date()
    var error: String?
    var mediaSourceId: String?
    var playSessionId: String?

    var isEpisode: Bool { type == "Episode" }
    var heading: String { isEpisode ? (seriesName ?? title) : title }
    var episodeLabel: String? {
        guard isEpisode else { return nil }
        return [seasonNumber.map { "S\($0)" }, episodeNumber.map { "É\($0)" }].compactMap { $0 }.joined(separator: " · ")
    }
    var playerTitle: String {
        isEpisode ? [seriesName, episodeLabel, title].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") : title
    }
    var duration: Double { Double(runTimeTicks ?? 0) / 10_000_000 }
    var resumeProgress: Double? { duration > 0 && position > 5 ? min(1, position / duration) : nil }
}

/// Dossiers des téléchargements (utilisables depuis les délégués des transferts).
enum OfflineFiles {
    static let folder: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var url = base.appendingPathComponent("NoctraOffline", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
        return url
    }()

    static var indexURL: URL { folder.appendingPathComponent("index.json") }

    static func itemFolder(_ id: String) -> URL {
        let url = folder.appendingPathComponent(id, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// Chemins gardés relatifs au dossier de l'appli (il change à chaque mise à jour).
    static func relative(_ url: URL) -> String {
        let home = URL(fileURLWithPath: NSHomeDirectory()).resolvingSymlinksInPath().path
        let path = url.resolvingSymlinksInPath().path
        return path.hasPrefix(home + "/") ? String(path.dropFirst(home.count + 1)) : path
    }

    static func absolute(_ path: String) -> URL {
        path.hasPrefix("/") ? URL(fileURLWithPath: path) : URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(path)
    }

    static func size(_ url: URL) -> Int64 {
        var isFolder: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isFolder) else { return 0 }
        if !isFolder.boolValue {
            return Int64((try? url.resourceValues(forKeys: [.totalFileAllocatedSizeKey]).totalFileAllocatedSize) ?? 0)
        }
        guard let enumerator = FileManager.default.enumerator(at: url, includingPropertiesForKeys: [.totalFileAllocatedSizeKey]) else { return 0 }
        var total: Int64 = 0
        for case let file as URL in enumerator {
            total += Int64((try? file.resourceValues(forKeys: [.totalFileAllocatedSizeKey]).totalFileAllocatedSize) ?? 0)
        }
        return total
    }
}

/// Bibliothèque hors ligne : file d'attente, transferts, fichiers, reprise locale.
@MainActor
@Observable
final class OfflineStore {
    static let shared = OfflineStore()

    private(set) var entries: [OfflineEntry] = []
    private(set) var onExpensiveNetwork = false
    private(set) var offline = false

    @ObservationIgnored private var tasks: [String: URLSessionTask] = [:]
    @ObservationIgnored private var hlsLocations: [String: URL] = [:]
    @ObservationIgnored private var cancelling: Set<String> = []
    @ObservationIgnored private var lastProgress: [String: Date] = [:]
    @ObservationIgnored private var lastSave = Date.distantPast
    @ObservationIgnored private var ticker: Task<Void, Never>?
    @ObservationIgnored private var restored = false
    @ObservationIgnored private var pendingLists = 0
    @ObservationIgnored private let monitor = NWPathMonitor()
    @ObservationIgnored weak var session: Session?

    var defaultQuality: OfflineQuality = OfflineQuality(rawValue: UserDefaults.standard.string(forKey: "noctra.offline.quality") ?? "") ?? .original {
        didSet { UserDefaults.standard.set(defaultQuality.rawValue, forKey: "noctra.offline.quality") }
    }

    var wifiOnly: Bool = UserDefaults.standard.object(forKey: "noctra.offline.wifiOnly") as? Bool ?? true {
        didSet {
            UserDefaults.standard.set(wifiOnly, forKey: "noctra.offline.wifiOnly")
            schedule()
        }
    }

    var downloaded: [OfflineEntry] { entries.filter { $0.state == .done } }
    var active: [OfflineEntry] { entries.filter { $0.state != .done } }
    var usedBytes: Int64 { entries.reduce(0) { $0 + ($1.state == .done ? $1.written : 0) } }

    func entry(_ id: String) -> OfflineEntry? { entries.first { $0.id == id } }

    // MARK: Fichiers

    func mediaURL(_ entry: OfflineEntry) -> URL? {
        guard let path = entry.mediaPath else { return nil }
        let url = OfflineFiles.absolute(path)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func posterURL(_ entry: OfflineEntry) -> URL? {
        let url = OfflineFiles.folder.appendingPathComponent(entry.id).appendingPathComponent("poster.jpg")
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func backdropURL(_ entry: OfflineEntry) -> URL? {
        let url = OfflineFiles.folder.appendingPathComponent(entry.id).appendingPathComponent("backdrop.jpg")
        return FileManager.default.fileExists(atPath: url.path) ? url : posterURL(entry)
    }

    func subtitleURL(_ entry: OfflineEntry, index: Int) -> URL? {
        guard let subtitle = entry.subtitles.first(where: { $0.index == index }) else { return nil }
        return OfflineFiles.folder.appendingPathComponent(entry.id).appendingPathComponent(subtitle.file)
    }

    var freeBytes: Int64 {
        let values = try? OfflineFiles.folder.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        return values?.volumeAvailableCapacityForImportantUsage ?? 0
    }

    // MARK: Démarrage

    /// Au lancement : index, sessions d'arrière-plan (transferts en cours), réseau.
    func restore() {
        guard !restored else { return }
        restored = true
        if let data = try? Data(contentsOf: OfflineFiles.indexURL),
           let saved = try? JSONDecoder().decode([OfflineEntry].self, from: data) {
            entries = saved
        }
        monitor.pathUpdateHandler = { path in
            let expensive = path.isExpensive || path.usesInterfaceType(.cellular)
            let down = path.status != .satisfied
            Task { @MainActor in
                let store = OfflineStore.shared
                store.onExpensiveNetwork = expensive
                store.offline = down
                store.schedule()
            }
        }
        monitor.start(queue: .main)
        pendingLists = 2
        OfflineTransfer.shared.fileSession.getAllTasks { list in
            let found = UncheckedBox(value: list)
            Task { @MainActor in OfflineStore.shared.attach(found.value) }
        }
        OfflineTransfer.shared.hlsSession.getAllTasks { list in
            let found = UncheckedBox(value: list)
            Task { @MainActor in OfflineStore.shared.attach(found.value) }
        }
    }

    private func attach(_ list: [URLSessionTask]) {
        for task in list {
            guard let id = task.taskDescription?.components(separatedBy: "|").first, entry(id) != nil else { task.cancel(); continue }
            tasks[id] = task
        }
        pendingLists -= 1
        guard pendingLists == 0 else { return }
        // Transferts perdus (appli supprimée de la mémoire pendant un arrêt…) : relancés.
        for index in entries.indices where entries[index].state == .downloading && tasks[entries[index].id] == nil {
            entries[index].state = .queued
        }
        ensureTicker()
        schedule()
        save(force: true)
    }

    // MARK: Ajout

    func download(_ item: BaseItem, session: Session, quality: OfflineQuality? = nil, audioIndex: Int? = nil) {
        guard ["Movie", "Episode", "Video", "MusicVideo"].contains(item.type ?? "") else { return }
        self.session = session
        if let existing = entry(item.id), existing.state != .failed { return }
        entries.removeAll { $0.id == item.id }
        let entry = OfflineEntry(
            id: item.id, type: item.type ?? "Movie", title: item.title, seriesName: item.seriesName, seriesId: item.seriesId,
            seasonNumber: item.parentIndexNumber, episodeNumber: item.indexNumber, year: item.productionYear,
            overview: item.overview, runTimeTicks: item.runTimeTicks, quality: quality ?? defaultQuality,
            audioIndex: audioIndex, state: .queued, position: item.resumeSeconds, played: item.userData?.played ?? false
        )
        entries.insert(entry, at: 0)
        save(force: true)
        Task { await saveArtwork(item, session: session) }
        schedule()
    }

    /// Saison entière (ou épisodes affichés) : chaque épisode rejoint la file.
    func download(episodes: [BaseItem], session: Session, quality: OfflineQuality? = nil) {
        for episode in episodes.reversed() where entry(episode.id) == nil {
            download(episode, session: session, quality: quality)
        }
    }

    private func saveArtwork(_ item: BaseItem, session: Session) async {
        let folder = OfflineFiles.itemFolder(item.id)
        for (name, url) in [("poster.jpg", session.poster(item, width: 500)), ("backdrop.jpg", session.backdrop(item, width: 1280))] {
            guard let url, let (data, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { continue }
            try? data.write(to: folder.appendingPathComponent(name), options: .atomic)
        }
    }

    // MARK: File d'attente

    /// Deux transferts à la fois (un seul flux préparé par le serveur), Wi-Fi si demandé.
    func schedule() {
        guard restored, pendingLists == 0, let session, session.isSignedIn, !offline else { return }
        if wifiOnly && onExpensiveNetwork { return }
        var running = entries.filter { $0.state == .downloading }.count
        var hlsRunning = entries.filter { $0.state == .downloading && $0.isHLS }.count
        for entry in entries.reversed() where entry.state == .queued {
            guard running < 2 else { break }
            if hlsRunning >= 1 && entry.quality != .original { continue }
            update(entry.id) { $0.state = .downloading; $0.error = nil }
            running += 1
            if entry.quality != .original { hlsRunning += 1 }
            Task { await start(entry.id, session: session) }
        }
    }

    private static let downloadProfile: [String: Any] = {
        var profile = PlaybackManager.deviceProfile
        profile["Name"] = "Noctra iOS (hors ligne)"
        profile["TranscodingProfiles"] = [
            ["Container": "mp4", "Type": "Video", "VideoCodec": "h264,hevc", "AudioCodec": "aac,ac3,eac3",
             "Protocol": "hls", "Context": "Streaming", "MaxAudioChannels": "6", "MinSegments": 1, "BreakOnNonKeyFrames": true]
        ]
        return profile
    }()

    private func start(_ id: String, session: Session) async {
        guard let entry = self.entry(id), let token = session.token else { return }
        do {
            var query: [String: String?] = [
                "userId": session.userId, "isPlayback": "false", "autoOpenLiveStream": "false",
                "maxStreamingBitrate": String(entry.quality.bitrate)
            ]
            if let audio = entry.audioIndex { query["audioStreamIndex"] = String(audio) }
            let data = try await session.data("POST", "/Items/\(id)/PlaybackInfo", query, json: ["DeviceProfile": Self.downloadProfile])
            let info = try await Session.decode(PlaybackInfoResponse.self, data)
            guard let source = info.mediaSources?.first else { throw NoctraError.empty }
            let playSession = info.playSessionId ?? UUID().uuidString

            // Sous-titres texte : tous gardés en WebVTT (petits fichiers).
            var subtitles: [OfflineSubtitle] = []
            let folder = OfflineFiles.itemFolder(id)
            for stream in source.mediaStreams ?? [] where stream.type == "Subtitle" && stream.isTextSubtitleStream == true {
                guard let url = session.url("/Videos/\(id)/\(source.id)/Subtitles/\(stream.index)/0/Stream.vtt", ["api_key": token]),
                      let (vtt, response) = try? await URLSession.shared.data(from: url),
                      (response as? HTTPURLResponse)?.statusCode == 200 else { continue }
                let file = "sub-\(stream.index).vtt"
                try? vtt.write(to: folder.appendingPathComponent(file), options: .atomic)
                subtitles.append(OfflineSubtitle(index: stream.index, label: stream.label, isDefault: stream.isDefault == true || stream.isForced == true, file: file))
            }
            let defaultSubtitle = source.defaultSubtitleStreamIndex.flatMap { index in subtitles.contains { $0.index == index } ? index : nil }

            let task: URLSessionTask
            var hls = false
            var expected: Int64 = 0
            if source.supportsDirectPlay == true, let container = source.container?.split(separator: ",").first.map(String.init),
               let url = session.url("/Videos/\(id)/stream.\(container)", [
                   "static": "true", "mediaSourceId": source.id, "deviceId": session.deviceId, "tag": source.eTag, "api_key": token
               ]) {
                var request = URLRequest(url: url)
                request.allowsCellularAccess = !wifiOnly
                request.allowsExpensiveNetworkAccess = !wifiOnly
                let download = OfflineTransfer.shared.fileSession.downloadTask(with: request)
                download.taskDescription = "\(id)|\(container)"
                task = download
                expected = source.size ?? 0
            } else if let transcoding = source.transcodingUrl, let url = Self.downloadURL(session.jellyfinBase + transcoding, token: token, id: id) {
                let asset = AVURLAsset(url: url)
                let configuration = AVAssetDownloadConfiguration(asset: asset, title: entry.playerTitle)
                if let poster = posterURL(entry) { configuration.artworkData = try? Data(contentsOf: poster) }
                let download = OfflineTransfer.shared.hlsSession.makeAssetDownloadTask(downloadConfiguration: configuration)
                download.taskDescription = id
                task = download
                hls = true
                let seconds = entry.duration > 0 ? entry.duration : 5400
                expected = Int64(Double(min(entry.quality.bitrate, source.bitrate ?? entry.quality.bitrate)) / 8 * seconds)
            } else {
                throw NoctraError.empty
            }
            update(id) {
                $0.subtitles = subtitles
                if $0.subtitleChoice == nil { $0.subtitleChoice = defaultSubtitle ?? -1 }
                $0.isHLS = hls
                $0.expected = expected
                $0.mediaSourceId = source.id
                $0.playSessionId = playSession
                $0.state = .downloading
            }
            tasks[id] = task
            task.resume()
            ensureTicker()
            save(force: true)
        } catch {
            update(id) { $0.state = .failed; $0.error = error.localizedDescription }
            save(force: true)
            schedule()
        }
    }

    /// Flux HLS du serveur : jeton dans l'adresse (iOS le reprend pour chaque
    /// segment) et appareil distinct, pour ne pas couper une lecture en cours.
    private static func downloadURL(_ raw: String, token: String, id: String) -> URL? {
        guard var components = URLComponents(string: raw) else { return nil }
        var items = (components.queryItems ?? []).filter { !["deviceid", "api_key", "apikey"].contains($0.name.lowercased()) }
        items.append(URLQueryItem(name: "DeviceId", value: "noctra-offline-\(id)"))
        items.append(URLQueryItem(name: "api_key", value: token))
        components.queryItems = items
        return components.url
    }

    // MARK: Commandes

    func pause(_ id: String) {
        tasks[id]?.suspend()
        update(id) { $0.state = .paused }
        save(force: true)
        schedule()
    }

    func resume(_ id: String) {
        guard let current = self.entry(id) else { return }
        if let task = tasks[id], current.state == .paused {
            task.resume()
            update(id) { $0.state = .downloading }
        } else {
            update(id) { $0.state = .queued; $0.error = nil; $0.progress = 0 }
            schedule()
        }
        save(force: true)
    }

    func delete(_ id: String) {
        if let task = tasks[id] {
            cancelling.insert(id)
            task.cancel()
            tasks[id] = nil
        }
        if let path = self.entry(id)?.mediaPath {
            try? FileManager.default.removeItem(at: OfflineFiles.absolute(path))
        }
        try? FileManager.default.removeItem(at: OfflineFiles.folder.appendingPathComponent(id))
        entries.removeAll { $0.id == id }
        save(force: true)
        schedule()
    }

    func deleteAll() {
        for entry in entries { delete(entry.id) }
    }

    func setSubtitle(_ id: String, _ index: Int) {
        update(id) { $0.subtitleChoice = index }
        save(force: true)
    }

    /// Fin de lecture hors ligne : reprise locale, « vu » à 92 %.
    func recordPosition(_ id: String, position: Double, duration: Double) {
        update(id) { entry in
            let length = duration.isFinite && duration > 0 ? duration : entry.duration
            if length > 0 && position / length > 0.92 {
                entry.played = true
                entry.position = 0
            } else {
                entry.position = position
            }
        }
        save(force: true)
    }

    // MARK: Évènements des transferts

    func progress(_ id: String, written: Int64, expected: Int64) {
        let now = Date()
        if let last = lastProgress[id], now.timeIntervalSince(last) < 0.5 { return }
        lastProgress[id] = now
        update(id) {
            $0.written = written
            if expected > 0 { $0.expected = expected }
            $0.progress = $0.expected > 0 ? min(1, Double(written) / Double($0.expected)) : $0.progress
        }
        save()
    }

    func fileFinished(_ id: String, at url: URL) {
        finish(id, path: OfflineFiles.relative(url), size: OfflineFiles.size(url))
    }

    func hlsLocation(_ id: String, _ url: URL) {
        hlsLocations[id] = url
    }

    func taskCompleted(_ id: String, error: Error?, isHLS: Bool) {
        tasks[id] = nil
        if cancelling.remove(id) != nil { return }
        if let error {
            let cancelled = (error as NSError).code == NSURLErrorCancelled
            update(id) {
                $0.state = cancelled ? .paused : .failed
                $0.error = cancelled ? nil : Self.message(error)
            }
            save(force: true)
            schedule()
            return
        }
        if isHLS {
            guard let location = hlsLocations.removeValue(forKey: id) else {
                update(id) { $0.state = .failed; $0.error = "Emplacement du téléchargement introuvable." }
                save(force: true)
                return
            }
            finish(id, path: OfflineFiles.relative(location), size: OfflineFiles.size(location))
            if let session, let playSession = self.entry(id)?.playSessionId {
                Task { _ = try? await session.data("DELETE", "/Videos/ActiveEncodings", ["deviceId": "noctra-offline-\(id)", "playSessionId": playSession]) }
            }
        }
    }

    func fileFailed(_ id: String, status: Int) {
        tasks[id] = nil
        cancelling.insert(id)
        update(id) { $0.state = .failed; $0.error = "Le serveur a refusé le téléchargement (\(status))." }
        save(force: true)
        schedule()
    }

    private func finish(_ id: String, path: String, size: Int64) {
        update(id) {
            $0.state = .done
            $0.mediaPath = path
            $0.progress = 1
            $0.written = size
            $0.error = nil
        }
        save(force: true)
        SyncPlayManager.shared.announce("Téléchargé : \(entry(id)?.playerTitle ?? "titre")")
        schedule()
    }

    private static func message(_ error: Error) -> String {
        let code = (error as NSError).code
        if code == NSURLErrorNotConnectedToInternet || code == NSURLErrorNetworkConnectionLost { return "Connexion perdue. Touchez pour reprendre." }
        if code == NSURLErrorCannotWriteToFile || (error as NSError).domain == NSPOSIXErrorDomain { return "Espace insuffisant sur l’iPhone." }
        return error.localizedDescription
    }

    /// Avancement des flux HLS (fourni par iOS), une fois par seconde.
    private func ensureTicker() {
        guard ticker == nil else { return }
        ticker = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self else { return }
                let running = self.entries.filter { $0.state == .downloading && $0.isHLS }
                for entry in running {
                    guard let task = self.tasks[entry.id] else { continue }
                    let fraction = task.progress.fractionCompleted
                    if fraction > 0 {
                        self.update(entry.id) {
                            $0.progress = fraction
                            $0.written = Int64(Double($0.expected) * fraction)
                        }
                    }
                }
                if !running.isEmpty { self.save() }
            }
        }
    }

    private func update(_ id: String, _ change: (inout OfflineEntry) -> Void) {
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        change(&entries[index])
    }

    private func save(force: Bool = false) {
        guard force || Date().timeIntervalSince(lastSave) > 5 else { return }
        lastSave = Date()
        let snapshot = entries
        Task.detached(priority: .utility) {
            if let data = try? JSONEncoder().encode(snapshot) {
                try? data.write(to: OfflineFiles.indexURL, options: .atomic)
            }
        }
    }
}

// MARK: Transferts en arrière-plan

/// Sessions d'arrière-plan (fichiers et flux HLS) et leurs délégués. iOS
/// relance l'appli pour livrer les fichiers terminés pendant qu'elle est fermée.
final class OfflineTransfer: NSObject, @unchecked Sendable {
    static let shared = OfflineTransfer()
    static let fileIdentifier = "com.noctra.app.offline.files"
    static let hlsIdentifier = "com.noctra.app.offline.hls"

    var backgroundCompletion: [String: () -> Void] = [:]

    lazy var fileSession: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.fileIdentifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        configuration.httpMaximumConnectionsPerHost = 2
        return URLSession(configuration: configuration, delegate: FileDelegate(), delegateQueue: .main)
    }()

    lazy var hlsSession: AVAssetDownloadURLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.hlsIdentifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        return AVAssetDownloadURLSession(configuration: configuration, assetDownloadDelegate: HLSDelegate(), delegateQueue: .main)
    }()

    /// Fin des évènements d'arrière-plan : iOS peut remettre l'appli en veille.
    func finishedEvents(_ session: URLSession) {
        guard let identifier = session.configuration.identifier, let handler = backgroundCompletion.removeValue(forKey: identifier) else { return }
        handler()
    }

    private static func id(_ task: URLSessionTask) -> String? {
        task.taskDescription?.components(separatedBy: "|").first
    }

    final class FileDelegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
        func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                        totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
            guard let id = OfflineTransfer.id(downloadTask) else { return }
            MainActor.assumeIsolated {
                OfflineStore.shared.progress(id, written: totalBytesWritten, expected: totalBytesExpectedToWrite)
            }
        }

        /// Le fichier temporaire disparaît au retour de cette méthode : il est déplacé tout de suite.
        func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
            guard let description = downloadTask.taskDescription else { return }
            let parts = description.components(separatedBy: "|")
            let id = parts[0]
            let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 200
            guard (200..<300).contains(status) else {
                MainActor.assumeIsolated { OfflineStore.shared.fileFailed(id, status: status) }
                return
            }
            let destination = OfflineFiles.folder.appendingPathComponent(id, isDirectory: true)
                .appendingPathComponent("media." + (parts.count > 1 ? parts[1] : "mp4"))
            try? FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? FileManager.default.removeItem(at: destination)
            do {
                try FileManager.default.moveItem(at: location, to: destination)
                MainActor.assumeIsolated { OfflineStore.shared.fileFinished(id, at: destination) }
            } catch {
                MainActor.assumeIsolated { OfflineStore.shared.taskCompleted(id, error: error, isHLS: false) }
            }
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
            guard let id = OfflineTransfer.id(task), let error else { return }
            MainActor.assumeIsolated { OfflineStore.shared.taskCompleted(id, error: error, isHLS: false) }
        }

        func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
            MainActor.assumeIsolated { OfflineTransfer.shared.finishedEvents(session) }
        }
    }

    final class HLSDelegate: NSObject, AVAssetDownloadDelegate, @unchecked Sendable {
        func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, willDownloadTo location: URL) {
            guard let id = OfflineTransfer.id(assetDownloadTask) else { return }
            MainActor.assumeIsolated { OfflineStore.shared.hlsLocation(id, location) }
        }

        /// Ancienne annonce de l'emplacement (gardée en secours).
        func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didFinishDownloadingTo location: URL) {
            guard let id = OfflineTransfer.id(assetDownloadTask) else { return }
            MainActor.assumeIsolated { OfflineStore.shared.hlsLocation(id, location) }
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
            guard let id = OfflineTransfer.id(task) else { return }
            MainActor.assumeIsolated { OfflineStore.shared.taskCompleted(id, error: error, isHLS: true) }
        }

        func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
            MainActor.assumeIsolated { OfflineTransfer.shared.finishedEvents(session) }
        }
    }
}

/// Réveil de l'appli par iOS pour terminer des téléchargements en arrière-plan.
final class NoctraAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        OfflineTransfer.shared.backgroundCompletion[identifier] = completionHandler
        OfflineStore.shared.restore()
        _ = identifier == OfflineTransfer.hlsIdentifier ? OfflineTransfer.shared.hlsSession as URLSession : OfflineTransfer.shared.fileSession
    }
}

// MARK: Écrans

/// Destination « Sur cet iPhone » des piles de navigation.
struct OfflineRoute: Hashable {}

/// Bouton « Télécharger » d'une fiche : qualité au choix, avancement, lecture hors ligne.
struct OfflineButton: View {
    @Environment(Session.self) private var session
    let item: BaseItem
    var audioIndex: Int?
    @State private var choosing = false
    @State private var managing = false
    private var store: OfflineStore { .shared }

    var body: some View {
        let entry = store.entry(item.id)
        Button {
            if let entry, entry.state == .done || entry.state == .downloading || entry.state == .paused || entry.state == .queued {
                managing = true
            } else {
                choosing = true
            }
        } label: {
            ZStack {
                switch entry?.state {
                case .done?:
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.teal)
                case .downloading?, .queued?, .paused?:
                    ZStack {
                        Circle().stroke(.white.opacity(0.2), lineWidth: 3)
                        Circle().trim(from: 0, to: CGFloat(max(0.03, entry?.progress ?? 0)))
                            .stroke(Theme.gradient, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                        Image(systemName: entry?.state == .paused ? "pause.fill" : "arrow.down").font(.caption2.weight(.bold))
                    }
                    .frame(width: 20, height: 20)
                    .animation(.linear(duration: 0.4), value: entry?.progress)
                default:
                    Image(systemName: entry?.state == .failed ? "exclamationmark.arrow.circlepath" : "arrow.down.circle")
                }
            }
            .font(.headline)
            .padding(.vertical, 6)
        }
        .auroraSecondary()
        .confirmationDialog("Télécharger pour regarder hors ligne", isPresented: $choosing, titleVisibility: .visible) {
            ForEach(OfflineQuality.allCases) { quality in
                Button(quality.label + (quality == store.defaultQuality ? " ✓" : "")) {
                    store.download(item, session: session, quality: quality, audioIndex: audioIndex)
                }
            }
        } message: {
            Text("Originale : fichier d’origine ou copie sans perte. Les autres qualités prennent moins de place.")
        }
        .confirmationDialog(entry?.heading ?? "", isPresented: $managing, titleVisibility: .visible) {
            if let entry {
                if entry.state == .done {
                    Button("Lire hors ligne") { PlaybackManager.shared.playOffline(entry, session: session) }
                } else if entry.state == .paused {
                    Button("Reprendre le téléchargement") { store.resume(entry.id) }
                } else {
                    Button("Mettre en pause") { store.pause(entry.id) }
                }
                Button(entry.state == .done ? "Supprimer de l’iPhone" : "Annuler le téléchargement", role: .destructive) { store.delete(entry.id) }
            }
        }
        .sensoryFeedback(.success, trigger: entry?.state == .done)
    }
}

/// « Sur cet iPhone » : téléchargements en cours et titres lisibles sans connexion.
struct OfflineLibraryView: View {
    @Environment(Session.self) private var session
    @State private var confirmClear = false
    @State private var choosingSubtitle: OfflineEntry?
    private var store: OfflineStore { .shared }

    private var movies: [OfflineEntry] { store.downloaded.filter { !$0.isEpisode }.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending } }

    private var series: [(name: String, episodes: [OfflineEntry])] {
        let grouped = Dictionary(grouping: store.downloaded.filter(\.isEpisode)) { $0.seriesName ?? "Séries" }
        return grouped.map { ($0.key, $0.value.sorted { ($0.seasonNumber ?? 0, $0.episodeNumber ?? 0) < ($1.seasonNumber ?? 0, $1.episodeNumber ?? 0) }) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    stat("internaldrive.fill", AdminFormat.bytes(Double(store.usedBytes)), "utilisés", Theme.lilac)
                    stat("externaldrive.badge.checkmark", AdminFormat.bytes(Double(store.freeBytes)), "libres", Theme.teal)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                if store.wifiOnly && store.onExpensiveNetwork && store.active.contains(where: { $0.state == .queued }) {
                    Label("En attente du Wi-Fi (réglable dans le compte).", systemImage: "wifi").font(.footnote).foregroundStyle(.orange)
                }
                if store.offline {
                    Label("Hors connexion : seuls les titres téléchargés sont disponibles.", systemImage: "wifi.slash").font(.footnote).foregroundStyle(Theme.muted)
                }
            }

            if !store.active.isEmpty {
                Section("En cours") {
                    ForEach(store.active) { entry in activeRow(entry) }
                }
            }
            if !movies.isEmpty {
                Section("Films") {
                    ForEach(movies) { entry in doneRow(entry) }
                }
            }
            ForEach(series, id: \.name) { show in
                Section(show.name) {
                    ForEach(show.episodes) { entry in doneRow(entry) }
                }
            }
            if store.entries.isEmpty {
                Section {
                    VStack(spacing: 12) {
                        Image(systemName: "arrow.down.circle").font(.system(size: 44)).foregroundStyle(Theme.gradient)
                        Text("Aucun téléchargement").font(.display(20, .bold, relativeTo: .headline))
                        Text("Touchez ↓ dans la fiche d’un film ou d’une saison pour le garder sur l’iPhone et le regarder sans connexion.")
                            .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                }
                .listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Sur cet iPhone")
        .toolbar {
            if !store.entries.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(role: .destructive) { confirmClear = true } label: { Label("Tout supprimer", systemImage: "trash") }
                    } label: { Image(systemName: "ellipsis") }
                }
            }
        }
        .confirmationDialog("Supprimer tous les téléchargements ?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Tout supprimer", role: .destructive) { store.deleteAll() }
        }
        .confirmationDialog("Sous-titres", isPresented: Binding(get: { choosingSubtitle != nil }, set: { if !$0 { choosingSubtitle = nil } }),
                            titleVisibility: .visible, presenting: choosingSubtitle) { entry in
            Button("Sans sous-titres") { store.setSubtitle(entry.id, -1); play(entry, subtitle: -1) }
            ForEach(entry.subtitles, id: \.index) { subtitle in
                Button(subtitle.label + (entry.subtitleChoice == subtitle.index ? " ✓" : "")) {
                    store.setSubtitle(entry.id, subtitle.index)
                    play(entry, subtitle: subtitle.index)
                }
            }
        }
        .onAppear { store.session = session; store.schedule() }
    }

    private func stat(_ icon: String, _ value: String, _ caption: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Label(value, systemImage: icon).font(.subheadline.weight(.semibold).monospacedDigit()).lineLimit(1)
            Text(caption).font(.caption2).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .glassEffect(.regular.tint(color.opacity(0.3)), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func artwork(_ entry: OfflineEntry, wide: Bool) -> some View {
        RemoteImage(url: wide ? store.backdropURL(entry) : store.posterURL(entry))
            .frame(width: wide ? 96 : 50, height: wide ? 54 : 75)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func activeRow(_ entry: OfflineEntry) -> some View {
        HStack(spacing: 12) {
            artwork(entry, wide: false)
            VStack(alignment: .leading, spacing: 5) {
                Text(entry.playerTitle).font(.subheadline.weight(.semibold)).lineLimit(2)
                ProgressLine(value: entry.progress)
                Text(status(entry)).font(.caption.monospacedDigit()).foregroundStyle(entry.state == .failed ? .orange : Theme.muted).lineLimit(2)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            switch entry.state {
            case .paused, .failed: store.resume(entry.id)
            case .downloading: store.pause(entry.id)
            default: break
            }
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { store.delete(entry.id) } label: { Label("Annuler", systemImage: "xmark") }
        }
        .swipeActions(edge: .leading) {
            if entry.state == .downloading {
                Button { store.pause(entry.id) } label: { Label("Pause", systemImage: "pause.fill") }.tint(Theme.violet)
            } else {
                Button { store.resume(entry.id) } label: { Label("Reprendre", systemImage: "play.fill") }.tint(Theme.violet)
            }
        }
    }

    private func status(_ entry: OfflineEntry) -> String {
        switch entry.state {
        case .queued: return store.wifiOnly && store.onExpensiveNetwork ? "En attente du Wi-Fi" : "En attente"
        case .paused: return "En pause · touchez pour reprendre"
        case .failed: return entry.error ?? "Échec · touchez pour réessayer"
        case .downloading:
            let size = entry.expected > 0 ? "\(AdminFormat.bytes(Double(entry.written))) / \(entry.isHLS ? "≈ " : "")\(AdminFormat.bytes(Double(entry.expected)))" : AdminFormat.bytes(Double(entry.written))
            return "\(Int(entry.progress * 100)) % · \(size)"
        case .done: return ""
        }
    }

    private func doneRow(_ entry: OfflineEntry) -> some View {
        Button {
            if entry.subtitles.count > 1 || (entry.subtitles.count == 1 && entry.subtitleChoice == nil) {
                choosingSubtitle = entry
            } else {
                play(entry, subtitle: entry.subtitleChoice ?? -1)
            }
        } label: {
            HStack(spacing: 12) {
                artwork(entry, wide: entry.isEpisode)
                    .overlay {
                        Image(systemName: "play.fill").font(.caption).padding(7).glassEffect(.regular, in: Circle())
                    }
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.isEpisode ? [entry.episodeLabel, entry.title].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") : entry.title)
                        .font(.subheadline.weight(.semibold)).lineLimit(2)
                    Text([entry.year.map { String($0) }, entry.duration > 0 ? ItemDetailView.clock(entry.duration) : nil,
                          AdminFormat.bytes(Double(entry.written)), entry.quality == .original ? nil : entry.quality.label]
                        .compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    if let progress = entry.resumeProgress { ProgressLine(value: progress).frame(maxWidth: 160) }
                }
                Spacer(minLength: 0)
                if entry.played { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.accent).font(.caption) }
            }
            .contentShape(Rectangle())
        }
        .foregroundStyle(.white)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { store.delete(entry.id) } label: { Label("Supprimer", systemImage: "trash") }
        }
        .contextMenu {
            Button { play(entry, subtitle: entry.subtitleChoice ?? -1) } label: { Label(entry.resumeProgress != nil ? "Reprendre" : "Lecture", systemImage: "play.fill") }
            if entry.resumeProgress != nil {
                Button { store.recordPosition(entry.id, position: 0, duration: entry.duration); play(entry, subtitle: entry.subtitleChoice ?? -1) } label: {
                    Label("Lire depuis le début", systemImage: "arrow.counterclockwise")
                }
            }
            if !entry.subtitles.isEmpty {
                Button { choosingSubtitle = entry } label: { Label("Sous-titres…", systemImage: "captions.bubble") }
            }
            Button(role: .destructive) { store.delete(entry.id) } label: { Label("Supprimer de l’iPhone", systemImage: "trash") }
        }
    }

    private func play(_ entry: OfflineEntry, subtitle: Int) {
        guard let current = store.entry(entry.id) else { return }
        PlaybackManager.shared.playOffline(current, subtitle: subtitle, session: session)
    }
}
