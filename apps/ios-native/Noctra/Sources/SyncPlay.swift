import Foundation
import Observation
import SwiftUI

/// SyncPlay (regarder ensemble) et commandes à distance de Jellyfin.
/// Même protocole que Jellyfin Web et Noctra TV : canal temps réel Jellyfin
/// (WebSocket), ordres datés à l'horloge du serveur et appliqués au même
/// instant sur chaque appareil. Reçoit aussi « Lire sur… » depuis un autre appareil.
@MainActor
@Observable
final class SyncPlayManager {
    static let shared = SyncPlayManager()

    struct Group: Identifiable, Hashable {
        let id: String
        let name: String
        var participants: [String]
        var state: String?
    }

    private(set) var group: Group?
    private(set) var status: String?
    private(set) var notice: String?
    @ObservationIgnored private weak var session: Session?
    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private var keepAlive: Task<Void, Never>?
    @ObservationIgnored private var pinger: Task<Void, Never>?
    @ObservationIgnored private var retry = 0
    @ObservationIgnored private var offset: TimeInterval = 0
    @ObservationIgnored private var rtt: TimeInterval = 0
    @ObservationIgnored private var playlistItemId = ""
    @ObservationIgnored private var lastCommand = ""
    @ObservationIgnored private var timers: [Task<Void, Never>] = []

    // MARK: Connexion

    func start(_ session: Session) {
        self.session = session
        Task { await reportCapabilities() }
        connect()
    }

    func stopAll() {
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        keepAlive?.cancel()
        pinger?.cancel()
        group = nil
    }

    private func reportCapabilities() async {
        _ = try? await session?.data("POST", "/Sessions/Capabilities/Full", json: [
            "PlayableMediaTypes": ["Video", "Audio"],
            "SupportedCommands": ["DisplayMessage", "Play", "Playstate"],
            "SupportsMediaControl": true,
            "SupportsPersistentIdentifier": true
        ])
    }

    private func connect() {
        guard let session, let token = session.token else { return }
        var base = session.jellyfinBase
        if base.lowercased().hasPrefix("https") { base = "wss" + base.dropFirst(5) } else if base.lowercased().hasPrefix("http") { base = "ws" + base.dropFirst(4) }
        guard var components = URLComponents(string: base + "/socket") else { return }
        components.queryItems = [URLQueryItem(name: "api_key", value: token), URLQueryItem(name: "deviceId", value: session.deviceId)]
        guard let url = components.url else { return }
        socket?.cancel(with: .goingAway, reason: nil)
        let task = URLSession.shared.webSocketTask(with: url)
        socket = task
        task.resume()
        receive(task)
    }

    private func receive(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            Task { @MainActor in
                guard let self, self.socket === task else { return }
                switch result {
                case .success(let message):
                    self.retry = 0
                    var data: Data?
                    switch message {
                    case .string(let text): data = Data(text.utf8)
                    case .data(let raw): data = raw
                    @unknown default: data = nil
                    }
                    if let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { self.handle(json) }
                    self.receive(task)
                case .failure:
                    // Reconnexion espacée (2, 4, 8… 30 s).
                    let delay = min(30, 2 * pow(2, Double(self.retry)))
                    self.retry += 1
                    Task { @MainActor in
                        try? await Task.sleep(for: .seconds(delay))
                        if self.socket === task { self.connect() }
                    }
                }
            }
        }
    }

    private func send(_ json: [String: Any]) {
        guard let socket, let data = try? JSONSerialization.data(withJSONObject: json), let text = String(data: data, encoding: .utf8) else { return }
        socket.send(.string(text)) { _ in }
    }

    private func handle(_ message: [String: Any]) {
        let data = message["Data"]
        switch message["MessageType"] as? String {
        case "ForceKeepAlive":
            let seconds = max(10, (data as? Double) ?? 60) / 2
            keepAlive?.cancel()
            keepAlive = Task { @MainActor in
                while !Task.isCancelled {
                    self.send(["MessageType": "KeepAlive"])
                    try? await Task.sleep(for: .seconds(seconds))
                }
            }
        case "SyncPlayGroupUpdate":
            if let update = data as? [String: Any] { groupUpdate(update) }
        case "SyncPlayCommand":
            if let command = data as? [String: Any] { groupCommand(command) }
        case "Play":
            // « Lire sur l'iPhone » depuis un autre appareil.
            if let play = data as? [String: Any], let id = (play["ItemIds"] as? [Any])?.first.map({ "\($0)".replacingOccurrences(of: "-", with: "") }) {
                let ticks = (play["StartPositionTicks"] as? Double) ?? 0
                Task { await self.playItem(id, startSeconds: ticks / 10_000_000, sync: false) }
            }
        case "Playstate":
            guard group == nil, let state = data as? [String: Any] else { return }
            let manager = PlaybackManager.shared
            switch state["Command"] as? String {
            case "Pause": manager.commandPause(at: nil)
            case "Unpause": manager.commandPlay(at: nil)
            case "PlayPause": manager.commandToggle()
            case "Stop": manager.stop()
            case "Seek":
                if let ticks = state["SeekPositionTicks"] as? Double { manager.commandPlay(at: ticks / 10_000_000) }
            default: break
            }
        case "GeneralCommand":
            if let command = data as? [String: Any], command["Name"] as? String == "DisplayMessage",
               let arguments = command["Arguments"] as? [String: Any] {
                notice = [arguments["Header"] as? String, arguments["Text"] as? String].compactMap { $0 }.joined(separator: " · ")
            }
        default:
            break
        }
    }

    // MARK: Groupes

    func groups() async -> [Group] {
        guard let session, let data = try? await session.data("GET", "/SyncPlay/List"),
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return list.compactMap { entry in
            guard let id = entry["GroupId"] as? String else { return nil }
            return Group(id: id, name: (entry["GroupName"] as? String) ?? "Groupe", participants: (entry["Participants"] as? [String]) ?? [], state: entry["State"] as? String)
        }
    }

    func create(name: String) async throws {
        _ = try await session?.data("POST", "/SyncPlay/New", json: ["GroupName": name])
    }

    func join(_ id: String) async throws {
        _ = try await session?.data("POST", "/SyncPlay/Join", json: ["GroupId": id])
    }

    func leave() async {
        _ = try? await session?.data("POST", "/SyncPlay/Leave", json: [String: Any]())
        leaveLocally(nil)
    }

    func setQueue(_ itemId: String, startSeconds: Double) async throws {
        _ = try await session?.data("POST", "/SyncPlay/SetNewQueue", json: [
            "PlayingQueue": [itemId], "PlayingItemPosition": 0, "StartPositionTicks": Int64(startSeconds * 10_000_000)
        ])
    }

    private func leaveLocally(_ message: String?) {
        group = nil
        playlistItemId = ""
        status = nil
        timers.forEach { $0.cancel() }
        timers = []
        pinger?.cancel()
        if let message { notice = message }
    }

    private func groupUpdate(_ update: [String: Any]) {
        let data = update["Data"]
        switch update["Type"] as? String {
        case "GroupJoined":
            let info = data as? [String: Any]
            group = Group(id: (update["GroupId"] as? String) ?? "", name: (info?["GroupName"] as? String) ?? "Groupe",
                          participants: (info?["Participants"] as? [String]) ?? [], state: info?["State"] as? String)
            notice = "SyncPlay : vous avez rejoint « \(group?.name ?? "") »."
            Task { await syncClock() }
            pinger?.cancel()
            pinger = Task { @MainActor in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(60))
                    await self.syncClock()
                    _ = try? await self.session?.data("POST", "/SyncPlay/Ping", json: ["Ping": Int(self.rtt * 1000)])
                }
            }
        case "UserJoined":
            if let name = data as? String { group?.participants.append(name); notice = "SyncPlay : \(name) a rejoint le groupe." }
        case "UserLeft":
            if let name = data as? String { group?.participants.removeAll { $0 == name }; notice = "SyncPlay : \(name) a quitté le groupe." }
        case "GroupLeft":
            leaveLocally("SyncPlay : vous avez quitté le groupe.")
        case "NotInGroup":
            leaveLocally(nil)
        case "GroupDoesNotExist", "LibraryAccessDenied", "JoinGroupDenied", "CreateGroupDenied":
            leaveLocally(update["Type"] as? String == "LibraryAccessDenied" ? "SyncPlay : un titre du groupe n’est pas accessible à votre compte." : "SyncPlay : action refusée par le serveur.")
        case "StateUpdate":
            let state = (data as? [String: Any])?["State"] as? String
            group?.state = state
            status = state == "Waiting" ? "En attente des autres…" : state == "Paused" ? "En pause" : nil
        case "PlayQueue":
            if let queue = data as? [String: Any] { playQueue(queue) }
        default:
            break
        }
    }

    private func playQueue(_ queue: [String: Any]) {
        let list = (queue["Playlist"] as? [[String: Any]]) ?? []
        let index = (queue["PlayingItemIndex"] as? Int) ?? 0
        guard index >= 0, index < list.count else {
            if PlaybackManager.shared.syncMode { PlaybackManager.shared.stop() }
            playlistItemId = ""
            return
        }
        let entry = list[index]
        let entryId = (entry["PlaylistItemId"] as? String) ?? ""
        if entryId == playlistItemId && PlaybackManager.shared.syncMode { return }
        playlistItemId = entryId
        let itemId = "\(entry["ItemId"] ?? "")".replacingOccurrences(of: "-", with: "")
        let ticks = (queue["StartPositionTicks"] as? Double) ?? 0
        Task { await playItem(itemId, startSeconds: ticks / 10_000_000, sync: true) }
    }

    private func playItem(_ id: String, startSeconds: Double, sync: Bool) async {
        guard let session, !id.isEmpty,
              let item = try? await session.get(BaseItem.self, paths: ["/Items/\(id)", "/Users/{userId}/Items/\(id)"], ["userId": session.userId]) else { return }
        try? await PlaybackManager.shared.play(item, session: session, audioIndex: nil, subtitleIndex: nil, startSeconds: startSeconds, sync: sync)
    }

    private func groupCommand(_ command: [String: Any]) {
        let name = (command["Command"] as? String) ?? ""
        let when = (command["When"] as? String) ?? ""
        let ticks = (command["PositionTicks"] as? Double) ?? 0
        let item = (command["PlaylistItemId"] as? String) ?? ""
        let key = [name, when, String(ticks), item].joined(separator: "|")
        guard key != lastCommand else { return }
        lastCommand = key
        if !item.isEmpty, !playlistItemId.isEmpty, item != playlistItemId { return }
        let position = ticks / 10_000_000
        let manager = PlaybackManager.shared
        switch name {
        case "Unpause":
            atServerTime(when) { late in manager.commandPlay(at: position + late); self.status = nil }
        case "Pause":
            atServerTime(when) { _ in manager.commandPause(at: position); self.status = "En pause" }
        case "Seek":
            status = "Synchronisation…"
            manager.commandSeek(to: position) { self.ready(position: position, playing: false) }
        case "Stop":
            manager.stop()
        default:
            break
        }
    }

    /// Ordre daté à l'horloge du serveur : appliqué au même instant, ou rattrapé s'il est passé.
    private func atServerTime(_ when: String, _ action: @escaping (Double) -> Void) {
        guard let date = Self.parse(when) else { action(0); return }
        let local = date.addingTimeInterval(-offset)
        let delay = local.timeIntervalSinceNow
        if delay <= 0 { action(-delay); return }
        timers.append(Task { @MainActor in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            action(max(0, -local.timeIntervalSinceNow))
        })
    }

    // MARK: État du lecteur → groupe

    func ready(position: Double, playing: Bool) {
        guard group != nil else { return }
        Task { _ = try? await session?.data("POST", "/SyncPlay/Ready", json: body(position: position, playing: playing)) }
    }

    func requestPause() { post("Pause") }
    func requestUnpause() { post("Unpause") }
    func requestSeek(to position: Double) {
        guard group != nil else { return }
        Task { _ = try? await session?.data("POST", "/SyncPlay/Seek", json: ["PositionTicks": Int64(position * 10_000_000)]) }
    }

    private func post(_ path: String) {
        guard group != nil else { return }
        Task { _ = try? await session?.data("POST", "/SyncPlay/\(path)", json: [String: Any]()) }
    }

    private func body(position: Double, playing: Bool) -> [String: Any] {
        ["When": Self.iso(Date().addingTimeInterval(offset)), "PositionTicks": Int64(position * 10_000_000),
         "IsPlaying": playing, "PlaylistItemId": playlistItemId]
    }

    // MARK: Horloge du serveur

    /// Écart d'horloge : meilleure de 5 mesures (aller-retour le plus court).
    private func syncClock() async {
        guard let session else { return }
        var best: (rtt: TimeInterval, offset: TimeInterval)?
        for _ in 0..<5 {
            let sent = Date()
            guard let data = try? await session.data("GET", "/GetUtcTime"),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let t1 = (json["RequestReceptionTime"] as? String).flatMap(Self.parse),
                  let t2 = (json["ResponseTransmissionTime"] as? String).flatMap(Self.parse) else { continue }
            let received = Date()
            let roundTrip = received.timeIntervalSince(sent) - t2.timeIntervalSince(t1)
            let shift = (t1.timeIntervalSince(sent) + t2.timeIntervalSince(received)) / 2
            if best == nil || roundTrip < best!.rtt { best = (roundTrip, shift) }
        }
        if let best { offset = best.offset; rtt = max(0, best.rtt) }
    }

    /// Dates de Jellyfin : jusqu'à 7 décimales (« 2026-10-18T13:22:17.0101930Z »).
    nonisolated static func parse(_ text: String) -> Date? {
        var value = text
        if let dot = value.firstIndex(of: ".") {
            let fraction = value[value.index(after: dot)...].prefix { $0.isNumber }
            let rest = value[value.index(after: dot)...].dropFirst(fraction.count)
            value = String(value[..<dot]) + "." + String(fraction.prefix(3)).padding(toLength: 3, withPad: "0", startingAt: 0) + rest
        }
        if !value.hasSuffix("Z") && !value.contains("+") && value.count <= 23 { value += "Z" }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    nonisolated static func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    func clearNotice() { notice = nil }

    /// Bandeau d'information commun de l'appli (erreurs de lecture, téléchargements…).
    func announce(_ message: String) { notice = message }
}

/// Feuille SyncPlay : regarder ensemble. Groupe actuel (participants, état),
/// groupes ouverts à rejoindre, création d'un groupe.
struct SyncPlaySheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    private var sync: SyncPlayManager { .shared }
    @State private var groups: [SyncPlayManager.Group] = []
    @State private var loading = true
    @State private var name = ""
    @State private var error: String?
    @State private var working: String?
    @State private var joined = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    hero
                    if let group = sync.group {
                        current(group)
                    } else {
                        openGroups
                        creation
                    }
                    if let error {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.orange)
                    }
                }
                .padding(20)
            }
            .background(AuroraBackground(palette: .roulette))
            .navigationTitle("SyncPlay")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
            .task { await reload() }
            .refreshable { await reload() }
            .sensoryFeedback(.success, trigger: joined)
        }
    }

    private func reload() async {
        groups = await sync.groups()
        loading = false
    }

    private var hero: some View {
        HStack(alignment: .top, spacing: 16) {
            ZStack {
                Circle().fill(Theme.gradient).opacity(0.9)
                Image(systemName: sync.group == nil ? "person.2.wave.2.fill" : "play.tv.fill")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.black.opacity(0.8))
                    .symbolEffect(.pulse, isActive: sync.group != nil)
            }
            .frame(width: 58, height: 58)
            .shadow(color: Theme.lilac.opacity(0.6), radius: 16)
            VStack(alignment: .leading, spacing: 6) {
                Text(sync.group == nil ? "Regarder ensemble" : "Vous êtes dans un groupe")
                    .font(.display(24, .bold, relativeTo: .title2))
                Text("Le film ou l’épisode lancé démarre au même instant pour tout le groupe ; pause, lecture et avance sont partagées.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.75))
            }
        }
    }

    private func current(_ group: SyncPlayManager.Group) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(group.name).font(.title3.weight(.bold)).lineLimit(2)
                Spacer()
                if let status = sync.status {
                    Text(status)
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .glassEffect(.regular.tint(Theme.teal.opacity(0.45)), in: Capsule())
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("\(group.participants.count) participant\(group.participants.count > 1 ? "s" : "")")
                    .font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                ForEach(group.participants, id: \.self) { person in
                    HStack(spacing: 12) {
                        avatar(person, size: 34)
                        Text(person).font(.subheadline.weight(.semibold))
                        Spacer()
                        if person == session.userName { Text("Vous").font(.caption2.weight(.bold)).foregroundStyle(Theme.teal) }
                    }
                }
            }
            Button(role: .destructive) {
                Task { await sync.leave(); dismiss() }
            } label: {
                Label("Quitter le groupe", systemImage: "rectangle.portrait.and.arrow.right")
                    .frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .auroraSecondary()
        }
        .padding(18)
        .auroraPanel(cornerRadius: 26, palette: .roulette)
    }

    private var openGroups: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SectionTitle("Groupes ouverts", detail: loading ? nil : "\(groups.count)")
                Spacer()
                Button { Task { loading = true; await reload() } } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.accent)
            }
            if loading {
                HStack { ProgressView(); Text("Recherche des groupes…").foregroundStyle(Theme.muted) }
            } else if groups.isEmpty {
                HStack(spacing: 12) {
                    Image(systemName: "sofa.fill").font(.title3).foregroundStyle(Theme.lilac)
                    Text("Aucun groupe ouvert. Créez le vôtre ci-dessous : les autres le verront ici.")
                        .font(.subheadline).foregroundStyle(.white.opacity(0.75))
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .auroraPanel(cornerRadius: 22, palette: .roulette)
            }
            ForEach(groups) { group in
                HStack(spacing: 14) {
                    HStack(spacing: -10) {
                        ForEach(group.participants.prefix(3), id: \.self) { avatar($0, size: 36) }
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(group.name).font(.headline).lineLimit(1)
                        Text(group.participants.isEmpty ? "Personne pour le moment" : group.participants.joined(separator: ", "))
                            .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                    Spacer(minLength: 6)
                    Button {
                        working = group.id
                        Task {
                            defer { working = nil }
                            do { try await sync.join(group.id); joined += 1; dismiss() } catch { self.error = error.localizedDescription }
                        }
                    } label: {
                        if working == group.id { ProgressView().tint(.black) } else { Text("Rejoindre").font(.subheadline.weight(.bold)) }
                    }
                    .auroraPrimary()
                    .disabled(working != nil)
                }
                .padding(14)
                .auroraPanel(cornerRadius: 22, palette: .roulette)
            }
        }
    }

    private var creation: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Nouveau groupe")
            HStack(spacing: 10) {
                Image(systemName: "sparkles").foregroundStyle(Theme.accent)
                TextField("Soirée de \(session.userName ?? "Noctra")", text: $name)
                    .submitLabel(.go)
                    .onSubmit { create() }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .glassEffect(.regular.interactive(), in: Capsule())
            Button(action: create) {
                HStack {
                    if working == "new" { ProgressView().tint(.black) } else { Image(systemName: "plus.circle.fill") }
                    Text("Créer et rejoindre")
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .auroraPrimary()
            .disabled(working != nil)
        }
    }

    private func create() {
        working = "new"
        Task {
            defer { working = nil }
            do {
                try await sync.create(name: name.isEmpty ? "Soirée de \(session.userName ?? "Noctra")" : name)
                joined += 1
                dismiss()
            } catch { self.error = error.localizedDescription }
        }
    }

    private func avatar(_ person: String, size: CGFloat) -> some View {
        let palette = [Theme.teal, Theme.lilac, Theme.cyan, Color(hex: 0xF9A8D4), Color(hex: 0xFDBA74)]
        let color = palette[person.unicodeScalars.reduce(0) { ($0 &+ Int($1.value)) & 0xFFFF } % palette.count]
        return Text(String(person.prefix(1)).uppercased())
            .font(.system(size: size * 0.42, weight: .bold))
            .foregroundStyle(.black.opacity(0.8))
            .frame(width: size, height: size)
            .background(color, in: Circle())
            .overlay(Circle().stroke(Theme.background, lineWidth: 2))
    }
}
