import AVKit
import SwiftUI

/// Bouton AirPlay du système (Apple TV, téléviseurs compatibles, enceintes).
struct AirPlayButton: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.prioritizesVideoDevices = true
        view.tintColor = .white
        view.activeTintColor = UIColor(Theme.accent)
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}

/// Appareil Jellyfin pilotable (Noctra TV, navigateur, autre téléphone…).
struct CastTarget: Identifiable, Hashable {
    let id: String
    let name: String
    let client: String
    let playing: String?
}

/// « Lire sur… » : le titre démarre sur un autre appareil connecté au même compte.
struct CastSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let item: BaseItem
    let startSeconds: Double
    @State private var targets: [CastTarget] = []
    @State private var loading = true
    @State private var sent: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Label("AirPlay", systemImage: "airplayvideo")
                        Spacer()
                        AirPlayButton().frame(width: 36, height: 36)
                    }
                } footer: {
                    Text("Apple TV et téléviseurs AirPlay : choisissez l’appareil, puis lancez la lecture.")
                }
                Section("Appareils Noctra et Jellyfin") {
                    if loading { ProgressView() }
                    if !loading && targets.isEmpty {
                        Text("Aucun autre appareil connecté. Ouvrez Noctra TV ou Noctra sur un autre écran.")
                            .foregroundStyle(Theme.muted)
                    }
                    ForEach(targets) { target in
                        Button {
                            Task { await cast(to: target) }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: icon(target.client))
                                    .font(.title3)
                                    .foregroundStyle(Theme.accent)
                                    .frame(width: 30)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(target.name).font(.headline)
                                    Text(target.playing.map { "Lecture : \($0)" } ?? target.client)
                                        .font(.caption)
                                        .foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                if sent == target.id { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.accent) }
                            }
                        }
                        .foregroundStyle(.white)
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.orange) } }
            }
            .navigationTitle("Lire sur…")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
            .task { await load() }
            .refreshable { await load() }
            .sensoryFeedback(.success, trigger: sent)
        }
    }

    private func icon(_ client: String) -> String {
        let name = client.lowercased()
        if name.contains("tv") || name.contains("android") { return "tv" }
        if name.contains("web") || name.contains("chrome") || name.contains("edge") { return "desktopcomputer" }
        return "iphone"
    }

    private func load() async {
        defer { loading = false }
        guard let data = try? await session.data("GET", "/Sessions", ["controllableByUserId": session.userId, "activeWithinSeconds": "960"]),
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
        targets = list.compactMap { entry in
            guard let id = entry["Id"] as? String, (entry["DeviceId"] as? String) != session.deviceId else { return nil }
            let capabilities = entry["Capabilities"] as? [String: Any]
            let remote = (entry["SupportsRemoteControl"] as? Bool) ?? (capabilities?["SupportsMediaControl"] as? Bool) ?? false
            guard remote else { return nil }
            let now = (entry["NowPlayingItem"] as? [String: Any])?["Name"] as? String
            return CastTarget(id: id, name: (entry["DeviceName"] as? String) ?? "Appareil", client: (entry["Client"] as? String) ?? "", playing: now)
        }
    }

    private func cast(to target: CastTarget) async {
        do {
            _ = try await session.data("POST", "/Sessions/\(target.id)/Playing", [
                "playCommand": "PlayNow", "itemIds": item.id, "startPositionTicks": String(Int64(startSeconds * 10_000_000))
            ])
            withAnimation(Theme.spring) { sent = target.id }
            try? await Task.sleep(for: .milliseconds(700))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
