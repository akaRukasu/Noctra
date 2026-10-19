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

/// « Lire sur… » : Chromecast et Google TV, AirPlay, ou un autre appareil
/// connecté au même compte (Noctra TV, navigateur, autre téléphone).
struct CastSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let item: BaseItem
    let startSeconds: Double
    var audioIndex: Int?
    var subtitleIndex: Int?
    /// Bouton cast de la barre du haut : rappelle le titre qui sera envoyé.
    var showItem = false
    @State private var targets: [CastTarget] = []
    @State private var castingTo: String?
    private var browser: ChromecastBrowser { .shared }
    @State private var loading = true
    @State private var sent: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if showItem {
                    Section {
                        HStack(spacing: 12) {
                            RemoteImage(url: session.thumb(item, width: 400) ?? session.poster(item))
                                .frame(width: 84, height: 48)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.type == "Episode" ? (item.seriesName ?? item.title) : item.title).font(.headline).lineLimit(1)
                                Text(startSeconds > 30 ? "Reprise à \(ItemDetailView.clock(startSeconds))" + (item.type == "Episode" ? " · " + (item.episodeLabel ?? "") : "") : "Depuis le début")
                                    .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                            }
                        }
                    } header: {
                        Text("À envoyer")
                    } footer: {
                        Text("Autre titre : ouvrez sa fiche, puis touchez le bouton de diffusion.")
                    }
                }
                Section {
                    if browser.devices.isEmpty {
                        HStack(spacing: 12) {
                            if !browser.blocked { ProgressView() }
                            Text(browser.blocked ? "Recherche bloquée : autorisez « Réseau local » pour Noctra dans Réglages › Confidentialité." : "Recherche sur le Wi-Fi…")
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    ForEach(browser.devices) { device in
                        Button {
                            Task { await cast(to: device) }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: device.model.lowercased().contains("tv") ? "tv" : "tv.badge.wifi")
                                    .font(.title3)
                                    .foregroundStyle(Theme.accent)
                                    .frame(width: 30)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(device.name).font(.headline)
                                    Text(device.model).font(.caption).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                if castingTo == device.id { ProgressView() }
                                if ChromecastController.shared.device?.id == device.id && castingTo == nil {
                                    Image(systemName: "dot.radiowaves.left.and.right").foregroundStyle(Theme.accent)
                                }
                            }
                        }
                        .foregroundStyle(.white)
                        .disabled(castingTo != nil)
                    }
                } header: {
                    Text("Chromecast et Google TV")
                } footer: {
                    Text("Chromecast, Google TV, Android TV et téléviseurs « Chromecast intégré » sur le même Wi-Fi.")
                }
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
            .onAppear { browser.start() }
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

    private func cast(to device: ChromecastDevice) async {
        castingTo = device.id
        defer { castingTo = nil }
        do {
            try await ChromecastController.shared.cast(item, session: session, startSeconds: startSeconds,
                                                       audioIndex: audioIndex, subtitleIndex: subtitleIndex, to: device)
            withAnimation(Theme.spring) { sent = device.id }
            try? await Task.sleep(for: .milliseconds(600))
            dismiss()
        } catch {
            self.error = error.localizedDescription
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


/// Bouton de diffusion de la barre du haut (tous les onglets) : télécommande du
/// Chromecast en cours, ou envoi du titre à reprendre vers un autre écran.
struct CastButton: View {
    @State private var showing = false
    private var cast: ChromecastController { .shared }

    var body: some View {
        Button {
            showing = true
        } label: {
            Image(systemName: cast.isActive ? "tv.badge.wifi.fill" : "tv.badge.wifi")
                .font(.body.weight(.semibold))
                .foregroundStyle(cast.isActive ? Theme.accent : .white)
                .symbolEffect(.pulse, isActive: cast.isActive && cast.isPlaying)
                .frame(width: 34, height: 30)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Diffuser sur un autre écran")
        .sheet(isPresented: $showing) {
            CastHubSheet().presentationDetents([.medium, .large])
        }
    }
}

struct CastHubSheet: View {
    @Environment(Session.self) private var session
    @State private var resume: BaseItem?
    @State private var loading = true
    private var cast: ChromecastController { .shared }
    private var browser: ChromecastBrowser { .shared }

    var body: some View {
        Group {
            if cast.isActive {
                ChromecastRemote()
            } else if let resume {
                CastSheet(item: resume, startSeconds: resume.resumeSeconds, showItem: true)
            } else {
                NavigationStack {
                    List {
                        Section {
                            if loading {
                                HStack(spacing: 10) { ProgressView(); Text("Recherche du titre en cours…").foregroundStyle(Theme.muted) }
                            } else {
                                Label("Ouvrez un film ou un épisode, puis touchez son bouton de diffusion pour le lire sur un autre écran.", systemImage: "hand.tap")
                                    .foregroundStyle(.white.opacity(0.85))
                            }
                        }
                        Section {
                            HStack {
                                Label("AirPlay", systemImage: "airplayvideo")
                                Spacer()
                                AirPlayButton().frame(width: 36, height: 36)
                            }
                        } footer: {
                            Text("Apple TV et téléviseurs AirPlay.")
                        }
                        Section("Chromecast et Google TV du Wi-Fi") {
                            if browser.devices.isEmpty {
                                Text(browser.blocked ? "Autorisez « Réseau local » pour Noctra dans Réglages › Confidentialité." : "Recherche…").foregroundStyle(Theme.muted)
                            }
                            ForEach(browser.devices) { device in
                                Label(device.name, systemImage: "tv").foregroundStyle(.white)
                            }
                        }
                    }
                    .navigationTitle("Diffuser")
                    .navigationBarTitleDisplayMode(.inline)
                }
                .onAppear { browser.start() }
            }
        }
        .task {
            defer { loading = false }
            guard !cast.isActive, resume == nil else { return }
            let list = try? await session.get(ItemsResponse.self, paths: ["/UserItems/Resume", "/Users/{userId}/Items/Resume"],
                                              ["userId": session.userId, "limit": "1", "mediaTypes": "Video", "fields": Fields.card, "enableImageTypes": "Primary,Backdrop,Thumb"])
            resume = list?.items?.first
        }
    }
}
