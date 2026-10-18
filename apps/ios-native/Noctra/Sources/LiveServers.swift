import Foundation
import Observation
import SwiftUI

// Choix du serveur d'une chaîne, comme Noctra TV : serveurs de toutes les
// sources, accès VIP du serveur Noctra en priorité, fiabilité mémorisée sur
// l'iPhone, test de chaque flux avant le lancement, meilleur serveur lancé
// tout seul après un court compte à rebours.

/// Un serveur possible pour une chaîne.
struct LiveServer: Identifiable {
    enum Kind { case native, resolve, web }
    enum Probe: Equatable { case untested, testing, up, slow, down, noVideo, stale }

    let id = UUID()
    var label: String
    var provider: String
    var kind: Kind
    var streamURL: URL?
    var headers: [String: String] = [:]
    var mpegts = false
    var pageURL: URL?
    var resolveURL: String?
    var vip = false
    var compatPage = false
    var manualOnly = false
    var fallback = false
    var probe: Probe = .untested
    var probeMs: Double = 0
    var margin: Double = 0

    var host: String {
        let url = streamURL ?? pageURL ?? resolveURL.flatMap { URL(string: $0) }
        return url?.host?.replacingOccurrences(of: "www.", with: "") ?? ""
    }

    var kindName: String {
        switch kind {
        case .native: return mpegts ? "ts" : "native"
        case .resolve: return "resolve"
        case .web: return "web"
        }
    }
}

/// Fiabilité des serveurs : réussites, échecs et coupures, par serveur d'une
/// chaîne et par famille (fournisseur + type + hôte), toutes chaînes confondues.
@MainActor
enum LiveHealth {
    private static let storeKey = "noctra.tv.health.v1"
    private static var cache: [String: [String: Double]]?
    private static let recent: TimeInterval = 20 * 60

    private static var store: [String: [String: Double]] {
        get {
            if let cache { return cache }
            let loaded = UserDefaults.standard.dictionary(forKey: storeKey) as? [String: [String: Double]] ?? [:]
            cache = loaded
            return loaded
        }
        set {
            var value = newValue
            if value.count > 600 {
                let sorted = value.sorted { max($0.value["o"] ?? 0, $0.value["f"] ?? 0) < max($1.value["o"] ?? 0, $1.value["f"] ?? 0) }
                for entry in sorted.prefix(value.count - 600) { value[entry.key] = nil }
            }
            cache = value
            UserDefaults.standard.set(value, forKey: storeKey)
        }
    }

    private static func ids(_ server: LiveServer, channel: String) -> [String] {
        ["c|\(channel)|\(server.label)", "f|\(server.provider)|\(server.kindName)|\(server.host)"]
    }

    static func record(_ server: LiveServer, channel: String, ok: Bool) {
        var all = store
        let now = Date().timeIntervalSince1970
        for id in ids(server, channel: channel) {
            var entry = all[id] ?? ["ok": 0, "fail": 0]
            if ok { entry["ok"] = min(50, (entry["ok"] ?? 0) + 1); entry["o"] = now } else { entry["fail"] = min(50, (entry["fail"] ?? 0) + 1); entry["f"] = now }
            if (entry["ok"] ?? 0) + (entry["fail"] ?? 0) > 20 {
                entry["ok"] = ((entry["ok"] ?? 0) * 0.7).rounded()
                entry["fail"] = ((entry["fail"] ?? 0) * 0.7).rounded()
            }
            all[id] = entry
        }
        store = all
        if ok { UserDefaults.standard.set(server.label, forKey: "noctra.tv.server.\(channel)") }
    }

    /// Coupures pendant la lecture (pour 10 min regardées), moyenne glissante.
    static func recordSmooth(_ server: LiveServer, channel: String, stalls: Int, seconds: Double) {
        guard seconds >= 30 else { return }
        let rate = min(10, Double(stalls) / (seconds / 600))
        let weight = min(0.4, 0.4 * seconds / 120)
        var all = store
        for id in ids(server, channel: channel) {
            var entry = all[id] ?? ["ok": 0, "fail": 0]
            entry["cut"] = entry["cut"].map { $0 * (1 - weight) + rate * weight } ?? rate
            all[id] = entry
        }
        store = all
    }

    static func remembered(_ channel: String) -> String? {
        UserDefaults.standard.string(forKey: "noctra.tv.server.\(channel)")
    }

    /// Note (plus haut = plus fiable) et verdict lisible.
    static func score(_ server: LiveServer, channel: String) -> (score: Double, verdict: String) {
        let all = store
        let keys = ids(server, channel: channel)
        let now = Date().timeIntervalSince1970
        var score = 0.0
        var verdict = ""
        for (level, key) in keys.enumerated() {
            guard let entry = all[key] else { continue }
            let weight = level == 0 ? 1.0 : 0.3
            let ok = entry["ok"] ?? 0, fail = entry["fail"] ?? 0
            let rate = (ok + 1) / (ok + fail + 2)
            score += (rate - 0.5) * 2 * weight
            let failedRecently = (entry["f"].map { now - $0 < recent } ?? false) && (entry["o"].map { (entry["f"] ?? 0) > $0 } ?? true)
            if failedRecently { score -= 2 * weight }
            if let cut = entry["cut"] { score -= min(3, cut * 0.75) * weight }
            guard level == 0, verdict.isEmpty else { continue }
            if failedRecently { verdict = "Échec récent" }
            else if (entry["cut"] ?? 0) >= 2 { verdict = "Coupures fréquentes" }
            else if fail >= 2 && rate < 0.45 { verdict = "Instable" }
            else if ok >= 2 && rate >= 0.75 { verdict = "Fiable" }
        }
        return (score, verdict)
    }

    static func text(_ server: LiveServer, channel: String) -> String {
        let all = store
        let keys = ids(server, channel: channel)
        let verdict = score(server, channel: channel).verdict
        if let own = all[keys[0]], (own["ok"] ?? 0) + (own["fail"] ?? 0) > 0 {
            return "\(verdict.isEmpty ? "Essayé" : verdict) · \(Int(own["ok"] ?? 0))/\(Int((own["ok"] ?? 0) + (own["fail"] ?? 0))) réussites"
        }
        if let family = all[keys[1]], (family["ok"] ?? 0) + (family["fail"] ?? 0) > 0 {
            return "Même fournisseur · \(Int(family["ok"] ?? 0))/\(Int((family["ok"] ?? 0) + (family["fail"] ?? 0))) réussites"
        }
        return "Jamais essayé"
    }

    /// Classement : VIP et flux directs d'abord, fiabilité, résultat des tests, dernier serveur qui a marché.
    static func rank(_ servers: [LiveServer], channel: String) -> [LiveServer] {
        let remembered = remembered(channel)
        func value(_ server: LiveServer, _ index: Int) -> Double {
            let health = score(server, channel: channel)
            var base: Double
            switch server.kind {
            case .native: base = server.mpegts ? 1.5 : 0
            case .resolve: base = 1
            case .web: base = 2
            }
            if server.compatPage { base += 3 }
            if server.manualOnly { base += 4 }
            if server.fallback { base += 0.5 }
            if server.vip { base -= 2.5 }
            base -= health.score
            switch server.probe {
            case .up: base -= 6
            case .slow: base -= 3
            case .down, .noVideo, .stale: base += 8
            default: break
            }
            let usable = health.verdict != "Échec récent" && health.verdict != "Coupures fréquentes" && ![.down, .noVideo, .stale].contains(server.probe)
            if let remembered, server.label == remembered, usable { base -= 10 }
            return base
        }
        return servers.enumerated().map { (value($0.element, $0.offset), $0.offset, $0.element) }
            .sorted { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }
            .map(\.2)
    }
}

// MARK: Serveurs d'une chaîne

@MainActor
enum LiveServerFactory {
    /// Sources LiveWatch à lecteur officiel (comme sur PC et Noctra TV).
    private static let liveWatchOfficial: Set<String> = ["livewatch-north", "livewatch-frame", "livewatch-sports", "livewatch-football", "livewatch-bosstv", "livewatch-jacktv", "livewatch-daily"]

    static func servers(for channel: LiveChannel, session: Session) -> [LiveServer] {
        var list: [LiveServer] = []
        var perSource: [String: Int] = [:]
        for entry in channel.entries { perSource[entry.source, default: 0] += 1 }
        var seen: [String: Int] = [:]
        for entry in channel.entries.prefix(24) {
            var prefix = entry.source
            if (perSource[entry.source] ?? 0) > 1 {
                seen[entry.source, default: 0] += 1
                if let name = entry.raw["name"] as? String, let range = name.range(of: "\\.([A-Za-z0-9]{1,3})\\s*$", options: .regularExpression) {
                    prefix += " · variante " + name[range].dropFirst().trimmingCharacters(in: .whitespaces).lowercased()
                } else if (seen[entry.source] ?? 0) > 1 {
                    prefix += " · \(seen[entry.source] ?? 0)"
                }
            }
            list.append(contentsOf: options(entry.raw, sourceId: entry.sourceId, prefix: prefix, provider: (entry.raw["provider"] as? String) ?? entry.source, session: session))
        }
        return list
    }

    private static func options(_ raw: [String: Any], sourceId: String, prefix: String, provider: String, session: Session) -> [LiveServer] {
        let vip = raw["vipPlayback"] as? Bool == true
        let transport = (raw["transport"] as? String)?.lowercased() ?? ""
        let headers = (raw["headers"] as? [String: Any])?.compactMapValues { $0 as? String } ?? [:]
        let resolver = (raw["resolverUrl"] as? String) ?? (raw["resolveUrl"] as? String)
        let embed = [raw["vipFallbackUrl"], raw["externalUrl"], raw["embedUrl"]].compactMap { $0 as? String }.first { $0.lowercased().hasPrefix("http") }
        // Lecteur officiel LiveWatch (hors VIP) : sa page, sans référent.
        if liveWatchOfficial.contains(sourceId), !(raw["playbackType"] as? String == "resolver" && resolver != nil), let embed, let url = URL(string: embed) {
            return [LiveServer(label: prefix + " · lecteur officiel", provider: provider, kind: .web, pageURL: url)]
        }
        if raw["playbackType"] as? String == "stream", let stream = raw["streamUrl"] as? String, let url = session.noctraURL(stream) {
            let mpegts = ["ts", "mpegts", "mpeg-ts"].contains(transport) || (url.path.lowercased().hasSuffix(".ts") && !url.path.lowercased().contains("m3u8"))
            return [LiveServer(label: prefix + " · flux direct", provider: provider, kind: .native, streamURL: url, headers: headers, mpegts: mpegts, vip: vip)]
        }
        if let resolver {
            return [LiveServer(label: prefix + (vip ? " · VIP" : " · automatique"), provider: provider, kind: .resolve, resolveURL: resolver, vip: vip)]
        }
        if let stream = raw["streamUrl"] as? String, let url = session.noctraURL(stream) {
            return [LiveServer(label: prefix + " · flux direct", provider: provider, kind: .native, streamURL: url, headers: headers, mpegts: ["ts", "mpegts", "mpeg-ts"].contains(transport), vip: vip)]
        }
        if let page = (raw["embedUrl"] as? String) ?? (raw["externalUrl"] as? String) ?? (raw["url"] as? String), let url = session.noctraURL(page) {
            return [LiveServer(label: prefix + " · lecteur web", provider: provider, kind: .web, pageURL: url)]
        }
        return []
    }

    /// Serveurs proposés par un résolveur du serveur Noctra (VIP, serveurs automatiques).
    static func resolve(_ server: LiveServer, session: Session, timeout: TimeInterval = 30) async -> [LiveServer] {
        guard let path = server.resolveURL, let json = try? await session.noctraJSON(path, timeout: timeout) as? [String: Any] else { return [] }
        let vipActive = json["vipActive"] as? Bool == true
        let list = (json["options"] as? [[String: Any]]) ?? ((json["streamUrl"] != nil || json["url"] != nil) ? [json] : [])
        return list.prefix(16).enumerated().compactMap { index, option -> LiveServer? in
            let base = server.label.replacingOccurrences(of: " · automatique", with: "").replacingOccurrences(of: " · VIP", with: "")
            let name = (option["label"] as? String).map { base + " · " + $0 } ?? base + " · serveur \(index + 1)"
            let vip = server.vip || vipActive && (option["vip"] as? Bool ?? true)
            let headers = (option["headers"] as? [String: Any])?.compactMapValues { $0 as? String } ?? [:]
            let transport = (option["transport"] as? String)?.lowercased() ?? ""
            var item: LiveServer
            if let stream = option["streamUrl"] as? String, let url = session.noctraURL(stream) {
                let mpegts = ["ts", "mpegts", "mpeg-ts"].contains(transport) || (option["streamKind"] as? String)?.lowercased() == "mpeg-ts"
                item = LiveServer(label: name, provider: server.provider, kind: .native, streamURL: url, headers: headers, mpegts: mpegts, vip: vip)
            } else if let next = option["resolveUrl"] as? String, option["url"] == nil {
                item = LiveServer(label: name, provider: server.provider, kind: .resolve, resolveURL: next, vip: vip)
            } else if let page = option["url"] as? String, let url = session.noctraURL(page) {
                item = LiveServer(label: name, provider: server.provider, kind: .web, pageURL: url, vip: vip)
            } else {
                return nil
            }
            item.compatPage = option["compatPage"] as? Bool == true
            item.manualOnly = option["manualOnly"] as? Bool == true
            item.fallback = option["fallback"] as? Bool == true
            return item
        }
    }

    // MARK: Test d'un flux

    /// Liste HLS lue, puis dernier segment téléchargé : en ligne (et marge de
    /// débit sur cette connexion), sans vidéo, direct figé ou hors ligne.
    static func probe(_ server: LiveServer, session: Session) async -> (LiveServer.Probe, Double, Double) {
        guard let url = server.streamURL else { return (.untested, 0, 0) }
        let began = Date()
        func request(_ target: URL, range: Bool = false) -> URLRequest {
            var request = URLRequest(url: target)
            request.timeoutInterval = 6
            request.cachePolicy = .reloadIgnoringLocalCacheData
            for (key, value) in server.headers { request.setValue(value, forHTTPHeaderField: key) }
            if session.isNoctraOrigin(target), let token = session.token { request.setValue(token, forHTTPHeaderField: "x-noctra-token") }
            if range { request.setValue("bytes=0-65535", forHTTPHeaderField: "Range") }
            return request
        }
        func elapsed() -> Double { Date().timeIntervalSince(began) * 1000 }
        if server.mpegts {
            guard let (data, response) = try? await URLSession.shared.data(for: request(url, range: true)),
                  ((response as? HTTPURLResponse)?.statusCode ?? 0) < 400 else { return (.down, elapsed(), 0) }
            return (looksLikeMedia(data) ? .up : .noVideo, elapsed(), 0)
        }
        guard let (data, response) = try? await URLSession.shared.data(for: request(url)),
              ((response as? HTTPURLResponse)?.statusCode ?? 0) < 400 else { return (.down, elapsed(), 0) }
        if looksLikeMedia(data) { return (.up, elapsed(), 0) }
        guard var text = String(data: data, encoding: .utf8), text.contains("#EXTM3U") else { return (.noVideo, elapsed(), 0) }
        var playlistURL = (response.url ?? url)
        // Liste principale : première variante.
        if text.contains("#EXT-X-STREAM-INF") {
            let lines = text.components(separatedBy: .newlines)
            guard let index = lines.firstIndex(where: { $0.hasPrefix("#EXT-X-STREAM-INF") }),
                  let uri = lines[(index + 1)...].first(where: { !$0.isEmpty && !$0.hasPrefix("#") }),
                  let variant = URL(string: uri.trimmingCharacters(in: .whitespaces), relativeTo: playlistURL)?.absoluteURL,
                  let (body, answer) = try? await URLSession.shared.data(for: request(variant)),
                  ((answer as? HTTPURLResponse)?.statusCode ?? 0) < 400,
                  let variantText = String(data: body, encoding: .utf8) else { return (.down, elapsed(), 0) }
            text = variantText
            playlistURL = answer.url ?? variant
        }
        let lines = text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }
        guard let last = lines.lastIndex(where: { !$0.isEmpty && !$0.hasPrefix("#") }),
              let segment = URL(string: lines[last], relativeTo: playlistURL)?.absoluteURL else { return (.stale, elapsed(), 0) }
        let duration = lines[..<last].last(where: { $0.hasPrefix("#EXTINF:") })
            .flatMap { Double($0.dropFirst(8).split(separator: ",").first ?? "") } ?? 0
        let sent = Date()
        guard let (media, answer) = try? await URLSession.shared.data(for: request(segment)),
              ((answer as? HTTPURLResponse)?.statusCode ?? 0) < 400 else { return (.down, elapsed(), 0) }
        guard looksLikeMedia(media) else { return (.noVideo, elapsed(), 0) }
        let took = max(1, Date().timeIntervalSince(sent) * 1000)
        let margin = duration > 0 ? duration * 1000 / took : 0
        return (margin > 0 && margin < 1.2 ? .slow : .up, elapsed(), margin)
    }

    /// Début d'un fichier vidéo : MPEG-TS (0x47), MP4 fragmenté, ID3 (AAC).
    private static func looksLikeMedia(_ data: Data) -> Bool {
        let bytes = [UInt8](data.prefix(400))
        guard bytes.count >= 8 else { return false }
        if bytes[0] == 0x47 && (bytes.count < 189 || bytes[188] == 0x47) { return true }
        let box = String(bytes: bytes[4..<8], encoding: .ascii) ?? ""
        if ["ftyp", "moof", "styp", "sidx", "mdat", "free"].contains(box) { return true }
        if bytes[0] == 0x49 && bytes[1] == 0x44 && bytes[2] == 0x33 { return true }
        return bytes.firstIndex(of: 0x47).map { $0 + 188 < bytes.count && bytes[$0 + 188] == 0x47 } ?? false
    }
}

// MARK: Fenêtre de choix

/// État de la fenêtre « Serveurs » d'une chaîne.
@MainActor
@Observable
final class LivePick: Identifiable {
    let id = UUID()
    let channel: LiveChannel
    var servers: [LiveServer] = []
    var preparing = true
    var countdown = 4
    var auto = true
    var launching = false

    init(channel: LiveChannel) {
        self.channel = channel
    }

    var best: LiveServer? { servers.first { $0.probe != .down && $0.probe != .noVideo && $0.probe != .stale } ?? servers.first }
}

struct LiveServerSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let pick: LivePick
    private var launcher: LiveLauncher { .shared }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if pick.preparing {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Recherche des serveurs de toutes les sources…").foregroundStyle(Theme.muted)
                        }
                    } else if let best = pick.best {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Meilleur serveur").font(.caption.weight(.bold)).foregroundStyle(Theme.teal)
                            Text(best.label).font(.headline)
                            if pick.auto && !pick.launching {
                                Text("Lancement dans \(pick.countdown) s · touchez un autre serveur pour le choisir")
                                    .font(.caption).foregroundStyle(Theme.muted)
                            }
                        }
                        Button {
                            Task { await launcher.launch(pick, server: best, session: session) }
                        } label: {
                            Label(pick.launching ? "Lancement…" : "Regarder maintenant", systemImage: "play.fill")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 4)
                        }
                        .auroraPrimary()
                        .disabled(pick.launching)
                        .listRowBackground(Color.clear)
                    } else {
                        Text("Aucun serveur ne propose cette chaîne pour le moment.").foregroundStyle(.orange)
                    }
                }
                if !pick.servers.isEmpty {
                    Section("\(pick.servers.count) serveur\(pick.servers.count > 1 ? "s" : "") · classés par fiabilité") {
                        ForEach(pick.servers) { server in
                            Button {
                                Task { await launcher.launch(pick, server: server, session: session) }
                            } label: {
                                row(server)
                            }
                            .foregroundStyle(.white)
                            .disabled(pick.launching)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(AuroraBackground(palette: .tv))
            .navigationTitle(pick.channel.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") {
                        pick.auto = false
                        dismiss()
                    }
                }
            }
            .animation(Theme.spring, value: pick.servers.map(\.probe))
        }
    }

    private func row(_ server: LiveServer) -> some View {
        HStack(spacing: 12) {
            Image(systemName: server.kind == .web ? "safari" : server.kind == .resolve ? "wand.and.stars" : "dot.radiowaves.left.and.right")
                .foregroundStyle(Theme.teal)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(server.label).font(.subheadline.weight(.semibold)).lineLimit(2)
                    if server.vip {
                        Text("VIP").font(.caption2.weight(.heavy)).padding(.horizontal, 6).padding(.vertical, 2)
                            .background(LinearGradient(colors: [Color(hex: 0xFCD34D), Color(hex: 0xF59E0B)], startPoint: .leading, endPoint: .trailing), in: Capsule())
                            .foregroundStyle(.black)
                    }
                }
                Text(LiveHealth.text(server, channel: pick.channel.id)).font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 6)
            probeTag(server)
        }
    }

    private func probeInfo(_ server: LiveServer) -> (String, Color) {
        switch server.probe {
        case .untested: return (server.kind == .web ? "Lecteur web" : server.kind == .resolve ? "Automatique" : "", Theme.muted)
        case .testing: return ("Test…", Theme.muted)
        case .up: return (server.probeMs > 3500 ? "En ligne · lent" : server.margin >= 2 || server.margin == 0 ? "En ligne" : "En ligne · juste", Theme.teal)
        case .slow: return ("Trop lent ici", .orange)
        case .down: return ("Hors ligne", .red)
        case .noVideo: return ("Pas de vidéo", .red)
        case .stale: return ("Direct figé", .orange)
        }
    }

    @ViewBuilder
    private func probeTag(_ server: LiveServer) -> some View {
        let info = probeInfo(server)
        if !info.0.isEmpty {
            Text(info.0)
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .glassEffect(.regular.tint(info.1.opacity(0.35)), in: Capsule())
        }
    }
}
