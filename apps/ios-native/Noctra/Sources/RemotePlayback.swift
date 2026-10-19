import Foundation
import Observation
import SwiftUI

struct RemoteDevice: Identifiable {
    let id: String
    let name: String
    var title: String
    var paused: Bool
    var position: Double
    var duration: Double
    var live: Bool
    let custom: Bool
    var volume: Double?
}

/// Consultation des sessions du même compte et commandes adressées à l'écran choisi.
@MainActor @Observable
final class RemotePlayback {
    static let shared = RemotePlayback()
    private(set) var devices: [RemoteDevice] = []
    private(set) var selected: String?
    var problem: String?
    @ObservationIgnored private weak var session: Session?
    @ObservationIgnored private var polling: Task<Void, Never>?
    @ObservationIgnored private var ownSession: String?
    @ObservationIgnored private var states: [String: (Date, [String: Any])] = [:]
    var active: RemoteDevice? { devices.first { $0.id == selected } }

    func start(_ session: Session) {
        stop()
        self.session = session
        polling = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, self.session?.isSignedIn == true else { return }
                await self.refresh()
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }
    func stop() { polling?.cancel(); polling = nil; devices = []; selected = nil; states = [:]; ownSession = nil; session = nil }
    func select(_ id: String) { selected = id; problem = nil }
    func receive(_ command: [String: Any]) -> Bool {
        guard command["Name"] as? String == "PlayMediaSource",
              (command["Arguments"] as? [String: Any])?["NoctraRemoteState"] as? String == "1" else { return false }
        guard let args = command["Arguments"] as? [String: Any], let id = args["sessionId"] as? String,
              devices.contains(where: { $0.id == id && $0.custom }), let text = args["state"] as? String,
              let data = text.data(using: .utf8), let state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return true }
        states[id] = (Date(), state)
        devices = devices.map { $0.id == id ? apply($0, state: state) : $0 }
        chooseActive()
        return true
    }
    private func apply(_ value: RemoteDevice, state: [String: Any]) -> RemoteDevice {
        var value = value
        guard state["live"] as? Bool == true else { value.live = false; return value }
        value.live = true
        value.title = state["title"] as? String ?? "TV en direct"
        value.paused = state["playing"] as? Bool != true
        value.position = state["position"] as? Double ?? 0
        value.duration = 0
        value.volume = (state["volume"] as? NSNumber)?.doubleValue
        return value
    }
    private func chooseActive() {
        if let selected, !devices.contains(where: { $0.id == selected }) { self.selected = nil }
        let playing = devices.filter { !$0.title.isEmpty }
        if selected == nil, playing.count == 1 { selected = playing[0].id }
    }
    func refresh() async {
        guard let session, let data = try? await session.data("GET", "/Sessions", ["controllableByUserId": session.userId, "activeWithinSeconds": "60"]),
              !Task.isCancelled, session.isSignedIn,
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
        ownSession = list.first { $0["DeviceId"] as? String == session.deviceId }?["Id"] as? String
        devices = list.compactMap { raw in
            guard let id = raw["Id"] as? String, raw["DeviceId"] as? String != session.deviceId else { return nil }
            let caps = raw["Capabilities"] as? [String: Any] ?? [:]
            guard raw["SupportsRemoteControl"] as? Bool == true || caps["SupportsMediaControl"] as? Bool == true else { return nil }
            let item = raw["NowPlayingItem"] as? [String: Any] ?? [:]
            let play = raw["PlayState"] as? [String: Any] ?? [:]
            var value = RemoteDevice(id: id, name: raw["DeviceName"] as? String ?? "Noctra TV", title: item["Name"] as? String ?? "",
                paused: play["IsPaused"] as? Bool == true, position: (play["PositionTicks"] as? NSNumber)?.doubleValue ?? 0,
                duration: (item["RunTimeTicks"] as? NSNumber)?.doubleValue ?? 0, live: false,
                custom: (raw["Client"] as? String ?? "").localizedCaseInsensitiveContains("Noctra TV") && (caps["SupportedCommands"] as? [String] ?? []).contains("PlayMediaSource"), volume: (play["VolumeLevel"] as? NSNumber)?.doubleValue)
            value.position /= 10_000_000; value.duration /= 10_000_000
            if let (date, state) = states[id], Date().timeIntervalSince(date) < 15 { value = apply(value, state: state) }
            return value
        }
        chooseActive()
        guard let ownSession else { return }
        for device in devices where device.custom {
            try? await custom(device.id, ["action": "state", "replyTo": ownSession, "targetId": device.id])
        }
    }
    private func custom(_ id: String, _ arguments: [String: String]) async throws {
        var arguments = arguments
        arguments["NoctraCommand"] = "1"
        _ = try await session?.data("POST", "/Sessions/\(id)/Command", json: ["Name": "PlayMediaSource", "Arguments": arguments])
    }
    func command(_ action: String, value: Double? = nil) {
        guard let device = active, let session else { return }
        Task {
            do {
                if device.live { try await custom(device.id, ["action": action, "value": String(value ?? 0)]) }
                else if action == "volume" {
                    _ = try await session.data("POST", "/Sessions/\(device.id)/Command", json: ["Name": "SetVolume", "Arguments": ["Volume": String(Int(value ?? 0))]])
                } else if action == "seek" {
                    _ = try await session.data("POST", "/Sessions/\(device.id)/Playing/Seek", ["seekPositionTicks": String(Int64(max(0, value ?? 0) * 10_000_000))])
                } else {
                    let name = ["toggle": "PlayPause", "stop": "Stop", "next": "NextTrack", "previous": "PreviousTrack"][action] ?? "PlayPause"
                    _ = try await session.data("POST", "/Sessions/\(device.id)/Playing/\(name)")
                }
                try? await Task.sleep(for: .milliseconds(300))
                await refresh()
            } catch { problem = error.localizedDescription }
        }
    }
    func castLive(_ channel: LiveChannel, to target: RemoteDevice) async throws {
        let entries: [[String: Any]] = channel.entries.map { ["channel": $0.raw, "source": ["id": $0.sourceId, "name": $0.source]] }
        var payload = channel.entries.first?.raw ?? [:]
        payload["name"] = channel.name; payload["country"] = channel.country; payload["_entries"] = entries; payload["_sources"] = Array(Set(channel.entries.map { $0.source }))
        let data = try JSONSerialization.data(withJSONObject: payload)
        guard let text = String(data: data, encoding: .utf8) else { throw NoctraError.empty }
        try await custom(target.id, ["action": "playLive", "channel": text])
        select(target.id)
    }
}

struct RemoteDevicesSection: View {
    private var remote: RemotePlayback { .shared }
    var body: some View {
        let playing = remote.devices.filter { !$0.title.isEmpty }
        if !playing.isEmpty {
            Section("En cours sur vos écrans") {
                ForEach(playing) { device in
                    Button { remote.select(device.id) } label: {
                        VStack(alignment: .leading) { Label(device.name, systemImage: "tv"); Text(device.title).font(.caption).foregroundStyle(Theme.muted) }
                    }
                }
            }
        }
    }
}

struct RemoteMiniPlayer: View {
    @State private var showing = false
    private var remote: RemotePlayback { .shared }
    var body: some View {
        if let device = remote.active {
            HStack(spacing: 12) {
                Image(systemName: "tv").foregroundStyle(Theme.accent)
                Button { showing = true } label: {
                    VStack(alignment: .leading) { Text(device.title.isEmpty ? "Télécommande" : device.title).lineLimit(1); Text(device.name).font(.caption).foregroundStyle(Theme.muted) }.frame(maxWidth: .infinity, alignment: .leading)
                }
                Button { remote.command("toggle") } label: { Image(systemName: device.paused ? "play.fill" : "pause.fill").frame(width: 44, height: 44) }.accessibilityLabel("Lecture ou pause")
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .glassEffect(.regular, in: Capsule()).padding(.horizontal, 16)
            .sheet(isPresented: $showing) { RemotePanel() }
        }
    }
}

struct RemotePanel: View {
    private var remote: RemotePlayback { .shared }
    @State private var volume = 100.0
    @State private var seek: Double = 0
    @State private var seeking = false
    var body: some View {
        NavigationStack {
            if let device = remote.active {
                List {
                    Section {
                        VStack(spacing: 16) {
                            Image(systemName: "tv").font(.system(size: 56)).foregroundStyle(Theme.accent)
                            Text(device.title.isEmpty ? "Télécommande" : device.title).font(.title2.bold()).multilineTextAlignment(.center)
                            if device.live { Text("EN DIRECT").foregroundStyle(Theme.teal) }
                            HStack(spacing: 32) {
                                Button { if device.live { remote.command("previous") } else { remote.command("seek", value: device.position - 10) } } label: { Image(systemName: device.live ? "backward.end.fill" : "gobackward.10").frame(width: 48, height: 48) }.accessibilityLabel(device.live ? "Chaîne précédente" : "Reculer de 10 secondes")
                                Button { remote.command("toggle") } label: { Image(systemName: device.paused ? "play.fill" : "pause.fill").font(.title).frame(width: 64, height: 64).glassEffect(.regular, in: Circle()) }.accessibilityLabel("Lecture ou pause")
                                Button { if device.live { remote.command("next") } else { remote.command("seek", value: device.position + 30) } } label: { Image(systemName: device.live ? "forward.end.fill" : "goforward.30").frame(width: 48, height: 48) }.accessibilityLabel(device.live ? "Chaîne suivante" : "Avancer de 30 secondes")
                            }.buttonStyle(.plain)
                        }.frame(maxWidth: .infinity).padding(.vertical, 20)
                        if !device.live && device.duration > 0 {
                            Slider(value: $seek, in: 0...max(1, device.duration)) { editing in seeking = editing; if !editing { remote.command("seek", value: seek) } }.accessibilityLabel("Position de lecture")
                        }
                        Slider(value: $volume, in: 0...100) { editing in if !editing { remote.command("volume", value: volume) } }.accessibilityLabel("Volume du téléviseur")
                        Button("Arrêter la lecture", role: .destructive) { remote.command("stop") }
                    }
                    if let problem = remote.problem { Text(problem).foregroundStyle(Color.orange) }
                    if remote.devices.count > 1 {
                        Section("Changer d’écran") { ForEach(remote.devices) { other in Button(other.name) { remote.select(other.id) } } }
                    }
                }
                .navigationTitle(device.name).navigationBarTitleDisplayMode(.inline)
                .onAppear { volume = device.volume ?? 100; seek = device.position }
                .onChange(of: device.id) { _, _ in volume = device.volume ?? 100; seek = device.position }
                .onChange(of: device.position) { _, position in if !seeking { seek = position } }
            }
        }
    }
}

struct LiveCastSheet: View {
    let channel: LiveChannel
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?
    private var browser: ChromecastBrowser { .shared }
    private var remote: RemotePlayback { .shared }
    var body: some View {
        NavigationStack {
            List {
                Section("Chromecast et Google TV") {
                    if browser.devices.isEmpty { Text("Recherche sur le Wi-Fi…").foregroundStyle(Theme.muted) }
                    ForEach(browser.devices) { device in
                        Button(device.name) { send { try await ChromecastController.shared.castLive(channel, session: session, to: device) } }
                    }
                }
                Section("Noctra TV") {
                    let targets = remote.devices.filter { $0.custom }
                    if targets.isEmpty { Text("Ouvrez la version à jour de Noctra TV avec le même compte.").foregroundStyle(Theme.muted) }
                    ForEach(targets) { target in Button(target.name) { send { try await remote.castLive(channel, to: target) } } }
                }
                Section { HStack { Label("AirPlay", systemImage: "airplayvideo"); Spacer(); AirPlayButton().frame(width: 44, height: 44) } }
                if busy { ProgressView("Préparation de la diffusion…") }
                if let error { Text(error).foregroundStyle(Color.orange) }
            }
            .disabled(busy)
            .navigationTitle(channel.name).navigationBarTitleDisplayMode(.inline)
        }
        .onAppear { browser.start() }
        .task { await remote.refresh() }
    }
    private func send(_ action: @escaping @MainActor () async throws -> Void) {
        busy = true
        Task {
            defer { busy = false }
            do { try await action(); dismiss(); LivePlayerModel.shared.close() }
            catch { self.error = error.localizedDescription }
        }
    }
}
