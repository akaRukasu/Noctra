import AVFoundation
import Observation
import SwiftUI

/// Multiview : plusieurs chaînes de n'importe quelle source à l'écran, comme sur la version web
/// et Noctra TV. Une chaîne est écoutée, une peut être mise en avant, chacune passe seule au
/// serveur suivant quand son flux tombe. Diffusable vers Noctra TV, puis pilotable depuis l'iPhone.
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

    func contains(_ channel: LiveChannel) -> Bool { picked.contains { $0.id == channel.id } }

    func toggle(_ channel: LiveChannel) {
        if let index = picked.firstIndex(where: { $0.id == channel.id }) { picked.remove(at: index); return }
        guard picked.count < Self.maxTiles else { return }
        picked.append(channel)
    }

    func clear() { picked = []; selecting = false }

    /// Lancement : les chaînes choisies démarrent l'une après l'autre (moins d'échecs au départ).
    func launch(session: Session) {
        guard !picked.isEmpty else { return }
        self.session = session
        LivePlayerModel.shared.close()
        stopAll()
        tiles = picked.prefix(Self.maxTiles).map { MultiviewTile(channel: $0) }
        audio = tiles.first?.id
        featured = nil
        zoomed = nil
        selecting = false
        presented = true
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
    }

    func remove(_ tile: MultiviewTile) {
        tile.stop()
        tiles.removeAll { $0.id == tile.id }
        picked.removeAll { $0.id == tile.channel.id }
        if featured == tile.id { featured = nil }
        if zoomed == tile.id { zoomed = nil }
        if audio == tile.id { audio = tiles.first?.id }
        if tiles.isEmpty { close() } else { applyAudio() }
    }

    func listen(_ tile: MultiviewTile) { audio = tile.id; applyAudio() }

    func feature(_ tile: MultiviewTile) { zoomed = nil; featured = featured == tile.id || tiles.count < 2 ? nil : tile.id }

    /// Chaîne mise en avant, et seule écoutée.
    func solo(_ tile: MultiviewTile) {
        audio = tile.id
        featured = tiles.count > 1 ? tile.id : nil
        zoomed = nil
        applyAudio()
    }

    func grid() { featured = nil; zoomed = nil }

    /// Plein écran d'une vignette, avec son son.
    func zoom(_ tile: MultiviewTile) {
        zoomed = zoomed == tile.id ? nil : tile.id
        if zoomed != nil { audio = tile.id; applyAudio() }
    }

    func close() {
        stopAll()
        tiles = []
        featured = nil
        zoomed = nil
        presented = false
        UIApplication.shared.isIdleTimerDisabled = false
    }

    private func stopAll() { tiles.forEach { $0.stop() } }

    private func applyAudio() {
        for tile in tiles { tile.player.isMuted = tile.id != audio }
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
            // Lecteur d'Apple seulement : flux directs et serveurs automatiques (pas les pages de sites).
            self.servers = prepared.filter { ($0.kind == .native && $0.streamURL != nil && !$0.mpegts) || $0.kind == .resolve }
            self.count = self.servers.count
            guard !self.servers.isEmpty else { self.status = "Aucun flux direct pour le multiview"; return }
            self.index = -1
            self.next()
        }
    }

    func stop() {
        generation += 1
        task?.cancel()
        task = nil
        player.replaceCurrentItem(with: nil)
    }

    /// Serveur suivant (choix manuel ou flux tombé) ; nouvel essai de toute la liste ensuite.
    func next() {
        guard let session else { return }
        guard !servers.isEmpty else { status = "Aucun flux direct pour le multiview"; return }
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
                let playable = found.filter { $0.kind == .native && $0.streamURL != nil && !$0.mpegts }
                self.servers.replaceSubrange(self.index...self.index, with: playable)
                self.count = self.servers.count
                self.index -= 1
                self.next()
            }
            return
        }
        play(candidate, token: token, session: session)
    }

    func retry() { rounds = 0; index = -1; next() }

    private func play(_ server: LiveServer, token: Int, session: Session) {
        guard let url = server.streamURL else { next(); return }
        self.server = server.label
        status = "Connexion…"
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
                        LiveHealth.record(server, channel: channelID, ok: true)
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

    var body: some View {
        GeometryReader { geometry in
            let frames = layout(in: geometry.size)
            ZStack(alignment: .topLeading) {
                Color.black.ignoresSafeArea()
                ForEach(Array(store.tiles.enumerated()), id: \.element.id) { index, tile in
                    if index < frames.count {
                        MultiviewTileView(tile: tile, listening: store.audio == tile.id, featured: store.featured == tile.id)
                            .frame(width: max(1, frames[index].width), height: max(1, frames[index].height))
                            .offset(x: frames[index].minX, y: frames[index].minY)
                            .opacity(frames[index].width > 0 ? 1 : 0)
                            .allowsHitTesting(frames[index].width > 0)
                            .onTapGesture(count: 2) { store.zoom(tile) }
                            .onTapGesture { menuTile = tile }
                    }
                }
            }
            .animation(Theme.spring, value: store.featured)
            .animation(Theme.spring, value: store.zoomed)
            .animation(Theme.spring, value: store.tiles.count)
        }
        .safeAreaInset(edge: .top) { bar }
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
            Text("Multiview · \(store.tiles.count)/\(MultiviewStore.maxTiles)").font(.subheadline.weight(.semibold))
            Spacer()
            if store.featured != nil || store.zoomed != nil {
                Button { store.grid() } label: { Image(systemName: "square.grid.2x2").frame(width: 40, height: 40) }
                    .accessibilityLabel("Revenir à la grille")
            }
            if store.tiles.count < MultiviewStore.maxTiles {
                Button { adding = true } label: { Image(systemName: "plus").frame(width: 40, height: 40) }
                    .accessibilityLabel("Ajouter une chaîne")
            }
            Button { casting = true } label: { Image(systemName: "tv.badge.wifi").frame(width: 40, height: 40) }
                .accessibilityLabel("Diffuser le multiview sur un téléviseur")
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
                let mainWidth = size.width * 0.7
                frames[main] = CGRect(x: 0, y: 0, width: mainWidth - gap, height: size.height)
                let columns = others.count > 4 ? 2 : 1
                let rows = Int(ceil(Double(others.count) / Double(columns)))
                let cellW = (size.width - mainWidth) / CGFloat(columns)
                let cellH = size.height / CGFloat(max(rows, 1))
                for (position, index) in others.enumerated() {
                    frames[index] = CGRect(x: mainWidth + CGFloat(position % columns) * cellW, y: CGFloat(position / columns) * cellH, width: cellW - gap, height: cellH - gap)
                }
            } else {
                let mainHeight = min(size.width * 9 / 16, size.height * 0.5)
                frames[main] = CGRect(x: 0, y: 0, width: size.width, height: mainHeight)
                let columns = others.count > 4 ? 3 : 2
                let cellW = size.width / CGFloat(columns)
                let cellH = cellW * 9 / 16
                for (position, index) in others.enumerated() {
                    frames[index] = CGRect(x: CGFloat(position % columns) * cellW, y: mainHeight + gap + CGFloat(position / columns) * cellH, width: cellW - gap, height: cellH - gap)
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

struct MultiviewTileView: View {
    let tile: MultiviewTile
    let listening: Bool
    let featured: Bool

    var body: some View {
        ZStack {
            MultiviewLayer(player: tile.player)
            if let status = tile.status {
                VStack(spacing: 6) {
                    if !status.contains("indisponible") && !status.contains("Aucun") { ProgressView().tint(.white) }
                    Text(status).font(.caption2.weight(.semibold)).multilineTextAlignment(.center)
                }
                .padding(8)
                .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 10))
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
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(listening ? Theme.teal : .white.opacity(0.1), lineWidth: listening ? 2 : 1))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(tile.channel.name + (listening ? ", écoutée" : "") + (featured ? ", mise en avant" : ""))
        .accessibilityAddTraits(.isButton)
    }
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

/// Diffusion du multiview : Noctra TV (Android TV, LG, Samsung) le reçoit et se pilote ensuite d'ici.
struct MultiviewCastSheet: View {
    let channels: [LiveChannel]
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?
    private var remote: RemotePlayback { .shared }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    let targets = remote.devices.filter { $0.custom }
                    if targets.isEmpty { Text("Ouvrez la version à jour de Noctra TV avec le même compte.").foregroundStyle(Theme.muted) }
                    ForEach(targets) { target in
                        Button {
                            busy = true
                            Task {
                                defer { busy = false }
                                do {
                                    try await remote.castMultiview(channels, to: target)
                                    MultiviewStore.shared.close()
                                    MultiviewStore.shared.clear()
                                    dismiss()
                                } catch { self.error = error.localizedDescription }
                            }
                        } label: { Label(target.name, systemImage: "tv") }
                    }
                } header: {
                    Text("Noctra TV")
                } footer: {
                    Text("Le téléviseur affiche les \(channels.count) chaînes. Depuis l’iPhone : ajouter ou retirer une chaîne, en mettre une en avant et n’écouter qu’elle. Chromecast ne lit qu’une chaîne à la fois.")
                }
                if busy { ProgressView("Envoi au téléviseur…") }
                if let error { Text(error).foregroundStyle(Color.orange) }
            }
            .disabled(busy)
            .navigationTitle("Diffuser le multiview")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
        }
        .task { await remote.refresh() }
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
