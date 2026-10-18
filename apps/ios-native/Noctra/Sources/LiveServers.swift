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
    enum Probe: Equatable { case untested, testing, up, slow, late, down, noVideo, stale }
    /// Contenu réel du flux, lu par le test : liste HLS, flux MPEG-TS continu, fichier vidéo.
    enum Format { case unknown, hls, ts, file }

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
    /// Lu par le moteur web (hls.js ou mpegts.js, comme Northlive) plutôt que par le lecteur d'Apple.
    var webEngine = false
    /// Résolveur d'origine : nouveau lien du même serveur après une coupure.
    var renewURL: String?
    /// Relais officiel à préparer par le serveur Noctra avant l'ouverture (NorthTV).
    var relayPrepare: String?
    var format: Format = .unknown
    var probe: Probe = .untested
    var probeMs: Double = 0
    var margin: Double = 0
    /// Raison lisible du dernier test (« direct figé », « page introuvable (404) »…).
    var probeNote: String?
    var probedAt: Date?

    /// Serveurs testables : flux directs, et pages de lecteurs (hors secours manuels et relais à préparer).
    var testable: Bool {
        switch kind {
        case .native: return streamURL != nil
        case .web: return pageURL != nil && !manualOnly && relayPrepare == nil
        case .resolve: return false
        }
    }

    /// Résultat d'un test : état, et flux MPEG-TS continu confié au moteur web (comme Northlive).
    mutating func apply(_ result: LiveServerFactory.ProbeResult) {
        probe = result.state
        probeMs = result.ms
        margin = result.margin
        probeNote = result.note
        probedAt = Date()
        if result.format != .unknown { format = result.format }
        if result.format == .ts { mpegts = true }
    }

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

    // Moteur de lecture qui marche pour chaque famille de serveurs (fournisseur +
    // hôte) : au-dessus de zéro, le moteur web passe avant le lecteur d'Apple.
    private static let engineKey = "noctra.tv.engine.v1"

    private static func engineID(_ server: LiveServer) -> String { "\(server.provider)|\(server.host)" }

    static func prefersWeb(_ server: LiveServer) -> Bool {
        let all = UserDefaults.standard.dictionary(forKey: engineKey) as? [String: Double] ?? [:]
        return (all[engineID(server)] ?? 0) > 0
    }

    static func noteEngine(_ server: LiveServer, web: Bool, ok: Bool) {
        var all = UserDefaults.standard.dictionary(forKey: engineKey) as? [String: Double] ?? [:]
        let id = engineID(server)
        all[id] = max(-3, min(3, (all[id] ?? 0) + (web == ok ? 1 : -1)))
        if all.count > 300 { all = Dictionary(uniqueKeysWithValues: all.prefix(300).map { ($0.key, $0.value) }) }
        UserDefaults.standard.set(all, forKey: engineKey)
    }

    // Confiance dans les tests, par fournisseur et type de serveur : un serveur
    // annoncé « en ligne » qui ne lit pas la fait baisser, une lecture réussie
    // après un test réussi la fait remonter.
    private static let trustKey = "noctra.tv.probetrust.v1"

    private static func trustID(_ server: LiveServer) -> String { "\(server.provider)|\(server.kindName)" }

    static func probeTrust(_ server: LiveServer) -> Double {
        let misses = (UserDefaults.standard.dictionary(forKey: trustKey) as? [String: Double] ?? [:])[trustID(server)] ?? 0
        return 1 / (1 + misses * 0.5)
    }

    static func noteProbe(_ server: LiveServer, accurate: Bool) {
        guard server.probe == .up || server.probe == .slow else { return }
        var all = UserDefaults.standard.dictionary(forKey: trustKey) as? [String: Double] ?? [:]
        let id = trustID(server)
        all[id] = max(0, min(6, (all[id] ?? 0) + (accurate ? -1 : 1)))
        UserDefaults.standard.set(all, forKey: trustKey)
    }

    // Derniers tests de chaque serveur (4 min) : une chaîne rouverte ou zappée
    // est classée tout de suite avec ces résultats, sans attendre de nouveaux tests.
    private static var probes: [String: (result: LiveServerFactory.ProbeResult, at: Date)] = [:]

    static func cache(_ result: LiveServerFactory.ProbeResult, for server: LiveServer, channel: String) {
        guard result.state != .untested && result.state != .testing else { return }
        probes["\(channel)|\(server.label)"] = (result, Date())
        if probes.count > 400 {
            for key in probes.sorted(by: { $0.value.at < $1.value.at }).prefix(100).map(\.key) { probes[key] = nil }
        }
    }

    /// Serveurs avec leur dernier test encore frais.
    static func withCachedProbes(_ servers: [LiveServer], channel: String) -> [LiveServer] {
        servers.map { server in
            guard server.probe == .untested, let entry = probes["\(channel)|\(server.label)"], Date().timeIntervalSince(entry.at) < 240 else { return server }
            var copy = server
            copy.apply(entry.result)
            copy.probedAt = entry.at
            return copy
        }
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
            // Le bonus d'un test réussi dépend de la confiance apprise pour ce
            // fournisseur (un test « en ligne » suivi d'un échec de lecture la réduit).
            let trust = probeTrust(server)
            switch server.probe {
            case .up:
                base -= 6 * trust
                // Réponse rapide et débit large : un peu devant.
                base += min(1.5, server.probeMs / 4000)
                if server.margin >= 2 { base -= 0.5 }
            case .slow: base -= 3 * trust
            case .late: base += 1
            case .down, .noVideo, .stale: base += 8
            default: break
            }
            let failing: [LiveServer.Probe] = [.down, .noVideo, .stale]
            let trusted = health.verdict != "Échec récent" && health.verdict != "Coupures fréquentes"
            let usable = trusted && !failing.contains(server.probe)
            if let remembered, server.label == remembered, usable { base -= 10 }
            return base
        }
        struct Scored {
            let score: Double
            let index: Int
            let server: LiveServer
        }
        var scored: [Scored] = []
        for (index, server) in servers.enumerated() {
            scored.append(Scored(score: value(server, index), index: index, server: server))
        }
        scored.sort { left, right in
            if left.score != right.score { return left.score < right.score }
            return left.index < right.index
        }
        return scored.map { $0.server }
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
        for entry in channel.entries.prefix(80) {
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
        let tsTransport = ["ts", "mpegts", "mpeg-ts"].contains(transport) || (raw["streamKind"] as? String)?.lowercased() == "mpeg-ts"
        let headers = (raw["headers"] as? [String: Any])?.compactMapValues { $0 as? String } ?? [:]
        let resolver = (raw["resolverUrl"] as? String) ?? (raw["resolveUrl"] as? String)
        let pages = [raw["vipFallbackUrl"], raw["externalUrl"], raw["embedUrl"]].compactMap { $0 as? String }.filter { !$0.isEmpty }
        let embed = pages.first { $0.lowercased().hasPrefix("http") }
        // Lecteur officiel LiveWatch (hors VIP) : sa page, sans référent ; NorthTV
        // passe d'abord par le relais préparé par le serveur quand le VIP est actif.
        if liveWatchOfficial.contains(sourceId), !(raw["playbackType"] as? String == "resolver" && resolver != nil), let embed, let url = URL(string: embed) {
            var list: [LiveServer] = []
            if sourceId == "livewatch-north", raw["liveWatchSameOriginBridge"] as? Bool == true,
               let range = url.path.range(of: "^/embed/north/([^/]+)/?$", options: .regularExpression), url.host?.lowercased().hasSuffix("livewatch.top") == true {
                let id = url.path[range].replacingOccurrences(of: "/embed/north/", with: "").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                var relay = LiveServer(label: prefix + " · relais officiel", provider: provider, kind: .web, vip: vip)
                relay.relayPrepare = "/api/tv/livewatch/prepare/north/" + (id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)
                relay.compatPage = true
                list.append(relay)
            }
            list.append(LiveServer(label: prefix + " · lecteur officiel", provider: provider, kind: .web, pageURL: url))
            return list
        }
        var list: [LiveServer] = []
        if raw["playbackType"] as? String == "stream", let stream = raw["streamUrl"] as? String, let url = session.noctraURL(stream) {
            let mpegts = tsTransport || (url.path.lowercased().hasSuffix(".ts") && !url.path.lowercased().contains("m3u8"))
            list.append(LiveServer(label: prefix + " · flux direct", provider: provider, kind: .native, streamURL: url, headers: headers, mpegts: mpegts, vip: vip))
        } else if let resolver {
            list.append(LiveServer(label: prefix + (vip ? " · VIP" : " · automatique"), provider: provider, kind: .resolve, resolveURL: resolver, vip: vip))
        } else if let stream = raw["streamUrl"] as? String, let url = session.noctraURL(stream) {
            list.append(LiveServer(label: prefix + " · flux direct", provider: provider, kind: .native, streamURL: url, headers: headers, mpegts: tsTransport, vip: vip))
        }
        // Page du site en plus du flux : proposée en secours (lecteur externe).
        let used = Set(list.compactMap { $0.streamURL?.absoluteString })
        if let page = list.isEmpty ? (pages.first ?? raw["url"] as? String) : pages.first(where: { $0.lowercased().hasPrefix("http") || $0.hasPrefix("/") }),
           let url = session.noctraURL(page), !used.contains(url.absoluteString) {
            var server = LiveServer(label: prefix + (list.isEmpty ? " · lecteur web" : " · lecteur du site"), provider: provider, kind: .web, pageURL: url)
            // Page publique du site (souvent avec publicités) : proposée, jamais lancée d'office.
            server.fallback = !list.isEmpty
            server.manualOnly = !list.isEmpty
            list.append(server)
        }
        return list
    }

    /// Serveurs proposés par un résolveur du serveur Noctra (VIP, serveurs automatiques).
    static func resolve(_ server: LiveServer, session: Session, timeout: TimeInterval = 45) async -> [LiveServer] {
        guard let path = server.resolveURL, let json = try? await session.noctraJSON(path, timeout: timeout) as? [String: Any] else { return [] }
        let vipActive = json["vipActive"] as? Bool == true
        let list = (json["options"] as? [[String: Any]]) ?? ((json["streamUrl"] != nil || json["url"] != nil) ? [json] : [])
        return list.prefix(24).enumerated().compactMap { index, option -> LiveServer? in
            let base = server.label.replacingOccurrences(of: " · automatique", with: "").replacingOccurrences(of: " · VIP", with: "")
            let name = (option["label"] as? String).map { base + " · " + $0 } ?? base + " · serveur \(index + 1)"
            let vip = server.vip || vipActive && (option["vip"] as? Bool ?? true)
            let headers = (option["headers"] as? [String: Any])?.compactMapValues { $0 as? String } ?? [:]
            let transport = (option["transport"] as? String)?.lowercased() ?? ""
            var item: LiveServer
            if let stream = option["streamUrl"] as? String, let url = session.noctraURL(stream) {
                let mpegts = ["ts", "mpegts", "mpeg-ts"].contains(transport) || (option["streamKind"] as? String)?.lowercased() == "mpeg-ts"
                item = LiveServer(label: name, provider: server.provider, kind: .native, streamURL: url, headers: headers, mpegts: mpegts, vip: vip)
                item.renewURL = server.resolveURL
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

    struct ProbeResult {
        var state: LiveServer.Probe
        var ms: Double = 0
        var margin: Double = 0
        var format: LiveServer.Format = .unknown
        var note: String?
    }

    private enum Fetch {
        case done(Data, HTTPURLResponse)
        case failed
        case timedOut
    }

    /// Début d'une réponse (au plus `limit` octets) : un flux continu (MPEG-TS)
    /// ne se termine jamais, on n'en lit que le début.
    nonisolated private static func fetchHead(_ request: URLRequest, limit: Int, seconds: Double) async -> Fetch {
        await withTaskGroup(of: Fetch?.self) { group in
            group.addTask {
                do {
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else { return .failed }
                    var data = Data()
                    data.reserveCapacity(min(limit, 65_536))
                    for try await byte in bytes {
                        data.append(byte)
                        if data.count >= limit { break }
                    }
                    return .done(data, http)
                } catch {
                    return Task.isCancelled ? nil : .failed
                }
            }
            group.addTask {
                try? await Task.sleep(for: .seconds(seconds))
                return Task.isCancelled ? nil : .timedOut
            }
            var outcome: Fetch = .timedOut
            for await value in group {
                if let value { outcome = value; break }
            }
            group.cancelAll()
            return outcome
        }
    }

    /// Fichier entier (segment HLS), borné dans le temps.
    nonisolated private static func fetchAll(_ request: URLRequest, seconds: Double) async -> Fetch {
        await withTaskGroup(of: Fetch?.self) { group in
            group.addTask {
                guard let (data, response) = try? await URLSession.shared.data(for: request), let http = response as? HTTPURLResponse else {
                    return Task.isCancelled ? nil : .failed
                }
                return .done(data, http)
            }
            group.addTask {
                try? await Task.sleep(for: .seconds(seconds))
                return Task.isCancelled ? nil : .timedOut
            }
            var outcome: Fetch = .timedOut
            for await value in group {
                if let value { outcome = value; break }
            }
            group.cancelAll()
            return outcome
        }
    }

    /// Requête d'un test : en-têtes du serveur, jeton Noctra vers le serveur Noctra seulement.
    private static func testRequest(_ target: URL, server: LiveServer, session: Session) -> URLRequest {
        var request = URLRequest(url: target)
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalCacheData
        for (key, value) in server.headers { request.setValue(value, forHTTPHeaderField: key) }
        if session.isNoctraOrigin(target), let token = session.token { request.setValue(token, forHTTPHeaderField: "x-noctra-token") }
        return request
    }

    /// Nature du flux (début de la réponse seulement), pour choisir le lecteur.
    static func sniff(_ server: LiveServer, session: Session) async -> LiveServer.Format {
        guard let url = server.streamURL else { return .unknown }
        guard case .done(let data, let response) = await fetchHead(testRequest(url, server: server, session: session), limit: 4_096, seconds: 6),
              response.statusCode < 400 else { return .unknown }
        return format(of: data)
    }

    nonisolated private static func format(of data: Data) -> LiveServer.Format {
        if let text = String(data: data.prefix(2_048), encoding: .utf8), text.contains("#EXTM3U") { return .hls }
        let bytes = [UInt8](data.prefix(4_096))
        if transportStream(bytes) { return .ts }
        if bytes.count >= 8, ["ftyp", "moov", "moof", "styp", "free", "mdat"].contains(String(bytes: bytes[4..<8], encoding: .ascii) ?? "") { return .file }
        return .unknown
    }

    /// Paquets MPEG-TS (0x47 tous les 188 octets), même précédés d'une fausse
    /// image (en-tête PNG ajouté par certains fournisseurs).
    nonisolated private static func transportStream(_ bytes: [UInt8]) -> Bool {
        guard bytes.count >= 189 else { return bytes.first == 0x47 }
        for start in 0..<min(bytes.count - 188, 2_048) where bytes[start] == 0x47 && bytes[start + 188] == 0x47 {
            if start + 376 >= bytes.count || bytes[start + 376] == 0x47 { return true }
        }
        return false
    }

    /// Test d'un serveur : flux direct (liste HLS ou flux continu) ou page de lecteur.
    static func probe(_ server: LiveServer, session: Session) async -> ProbeResult {
        if server.kind == .web { return await probePage(server, session: session) }
        return await probeStream(server, session: session)
    }

    /// Liste HLS lue, dernier segment téléchargé (marge de débit sur cette
    /// connexion), puis liste relue pour vérifier que le direct avance. Un flux
    /// MPEG-TS continu est reconnu à ses premiers paquets et son débit mesuré.
    private static func probeStream(_ server: LiveServer, session: Session) async -> ProbeResult {
        guard let url = server.streamURL else { return ProbeResult(state: .untested) }
        let began = Date()
        // Durée retenue : celle de la première réponse (le classement s'en sert),
        // pas l'attente qui vérifie que le direct avance.
        var latency: Double?
        func elapsed() -> Double { latency ?? Date().timeIntervalSince(began) * 1000 }
        func result(_ state: LiveServer.Probe, _ note: String? = nil, format: LiveServer.Format = .hls, margin: Double = 0) -> ProbeResult {
            ProbeResult(state: state, ms: elapsed(), margin: margin, format: format, note: note)
        }
        let first = await fetchHead(testRequest(url, server: server, session: session), limit: 524_288, seconds: 12)
        latency = Date().timeIntervalSince(began) * 1000
        let data: Data
        let response: HTTPURLResponse
        switch first {
        case .timedOut: return result(.late, "pas de réponse en 12 s", format: .unknown)
        case .failed: return result(.down, "serveur injoignable", format: .unknown)
        case .done(let body, let answer):
            guard answer.statusCode < 400 else { return result(.down, statusNote(answer.statusCode), format: .unknown) }
            data = body
            response = answer
        }
        switch format(of: data) {
        case .ts: return await probeTransport(server, session: session, latency: elapsed())
        case .file: return result(.up, "fichier vidéo", format: .file)
        case .unknown: return result(.noVideo, pageLike(data) ? "page web reçue au lieu d’un flux" : "réponse sans vidéo", format: .unknown)
        case .hls: break
        }
        guard var text = String(data: data, encoding: .utf8) else { return result(.noVideo, "liste illisible") }
        var playlistURL = response.url ?? url
        // Liste principale : première variante.
        if text.contains("#EXT-X-STREAM-INF") {
            let lines = text.components(separatedBy: .newlines)
            guard let index = lines.firstIndex(where: { $0.hasPrefix("#EXT-X-STREAM-INF") }),
                  let uri = lines[(index + 1)...].first(where: { !$0.isEmpty && !$0.hasPrefix("#") }),
                  let variant = URL(string: uri.trimmingCharacters(in: .whitespaces), relativeTo: playlistURL)?.absoluteURL else {
                return result(.noVideo, "liste principale sans variante")
            }
            switch await fetchHead(testRequest(variant, server: server, session: session), limit: 524_288, seconds: 12) {
            case .timedOut: return result(.late, "variante sans réponse en 12 s")
            case .failed: return result(.down, "variante injoignable")
            case .done(let body, let answer):
                guard answer.statusCode < 400 else { return result(.down, "variante : " + statusNote(answer.statusCode)) }
                guard let variantText = String(data: body, encoding: .utf8), variantText.contains("#EXTM3U") else { return result(.noVideo, "variante sans liste HLS") }
                text = variantText
                playlistURL = answer.url ?? variant
            }
        }
        // Chiffrement FairPlay (« skd:// ») : illisible hors des applis du fournisseur.
        if text.range(of: "METHOD=SAMPLE-AES", options: .caseInsensitive) != nil && text.contains("skd://") {
            return result(.noVideo, "flux chiffré (FairPlay)")
        }
        let listedAt = Date()
        let lines = text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }
        guard let last = lines.lastIndex(where: { !$0.isEmpty && !$0.hasPrefix("#") }),
              let segment = URL(string: lines[last], relativeTo: playlistURL)?.absoluteURL else {
            return result(.stale, "liste vide (aucun segment)")
        }
        let duration = lines[..<last].last(where: { $0.hasPrefix("#EXTINF:") })
            .flatMap { Double($0.dropFirst(8).split(separator: ",").first ?? "") } ?? 0
        let sent = Date()
        var margin = 0.0
        switch await fetchAll(testRequest(segment, server: server, session: session), seconds: 15) {
        case .timedOut: return result(.late, "segment trop long à recevoir")
        case .failed: return result(.down, "segment injoignable")
        case .done(let media, let answer):
            guard answer.statusCode < 400 else { return result(.down, "segment : " + statusNote(answer.statusCode)) }
            guard looksLikeMedia(media) else { return result(.noVideo, pageLike(media) ? "segment remplacé par une page web" : "segment sans vidéo") }
            let took = max(1, Date().timeIntervalSince(sent) * 1000)
            margin = duration > 0 ? duration * 1000 / took : 0
        }
        // Direct qui avance : la liste est relue après une durée de segment ;
        // un numéro de séquence immobile signale un direct figé.
        if !text.contains("#EXT-X-ENDLIST") {
            let target = targetDuration(text) ?? max(duration, 4)
            let pause = min(10, max(0, target * 1.15 - Date().timeIntervalSince(listedAt)))
            if pause > 0 { try? await Task.sleep(for: .seconds(pause)) }
            if case .done(let body, let answer) = await fetchHead(testRequest(playlistURL, server: server, session: session), limit: 524_288, seconds: 10),
               answer.statusCode < 400, let again = String(data: body, encoding: .utf8), again.contains("#EXTM3U"),
               answer.value(forHTTPHeaderField: "x-noctra-playlist") != "stale" {
                let before = mediaSequence(text), after = mediaSequence(again)
                let moved: Bool
                if let before, let after { moved = after > before || segmentCount(again) > segmentCount(text) }
                else { moved = lastSegment(again) != lines[last] }
                if !moved { return result(.stale, "direct figé (aucun nouveau segment)") }
            }
        }
        if margin > 0 && margin < 1.2 { return result(.slow, "débit trop juste ici (×\(String(format: "%.1f", margin)))", margin: margin) }
        return result(.up, margin >= 2 ? "débit large (×\(String(format: "%.1f", margin)))" : margin > 0 ? "débit suffisant (×\(String(format: "%.1f", margin)))" : nil, margin: margin)
    }

    /// Flux MPEG-TS continu : débit reçu pendant 3 s (un direct à l'arrêt ou
    /// au compte-gouttes ne fournit presque rien).
    private static func probeTransport(_ server: LiveServer, session: Session, latency ms: Double) async -> ProbeResult {
        guard let url = server.streamURL else { return ProbeResult(state: .untested) }
        let started = Date()
        let received = await countBytes(testRequest(url, server: server, session: session), seconds: 3, limit: 1_500_000)
        let seconds = max(0.5, Date().timeIntervalSince(started))
        let rate = Double(received) / seconds
        if received < 32_768 { return ProbeResult(state: .stale, ms: ms, format: .ts, note: "flux MPEG-TS presque vide") }
        if rate < 120_000 { return ProbeResult(state: .slow, ms: ms, format: .ts, note: "MPEG-TS · \(Int(rate * 8 / 1000)) kbit/s reçus") }
        return ProbeResult(state: .up, ms: ms, format: .ts, note: String(format: "MPEG-TS · %.1f Mbit/s reçus", rate * 8 / 1_000_000))
    }

    /// Octets reçus d'un flux continu pendant `seconds` (au plus `limit`).
    nonisolated private static func countBytes(_ request: URLRequest, seconds: Double, limit: Int) async -> Int {
        let counter = ByteCounter()
        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                guard let (bytes, response) = try? await URLSession.shared.bytes(for: request),
                      ((response as? HTTPURLResponse)?.statusCode ?? 500) < 400 else { return }
                var count = 0
                do {
                    for try await _ in bytes {
                        count += 1
                        if count % 4_096 == 0 { counter.set(count) }
                        if count >= limit { break }
                    }
                } catch {}
                counter.set(count)
            }
            group.addTask { try? await Task.sleep(for: .seconds(seconds)) }
            await group.next()
            group.cancelAll()
        }
        return counter.value
    }

    /// Page d'un lecteur web : réponse, protection anti-robot, lecteur présent.
    private static func probePage(_ server: LiveServer, session: Session) async -> ProbeResult {
        guard let url = server.pageURL else { return ProbeResult(state: .untested) }
        let began = Date()
        var request = testRequest(url, server: server, session: session)
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1", forHTTPHeaderField: "User-Agent")
        request.setValue("text/html,application/xhtml+xml,*/*;q=0.8", forHTTPHeaderField: "Accept")
        func ms() -> Double { Date().timeIntervalSince(began) * 1000 }
        switch await fetchHead(request, limit: 262_144, seconds: 12) {
        case .timedOut: return ProbeResult(state: .late, ms: ms(), note: "page sans réponse en 12 s")
        case .failed: return ProbeResult(state: .down, ms: ms(), note: "site injoignable")
        case .done(let body, let answer):
            let html = String(decoding: body.prefix(262_144), as: UTF8.self).lowercased()
            let challenge = html.contains("cf-chl") || html.contains("just a moment") || html.contains("challenge-platform") || html.contains("ddos-guard")
            if challenge { return ProbeResult(state: .late, ms: ms(), note: "site protégé (vérification anti-robot)") }
            guard answer.statusCode < 400 else { return ProbeResult(state: .down, ms: ms(), note: "page : " + statusNote(answer.statusCode)) }
            let player = ["<video", "<iframe", ".m3u8", "jwplayer", "clappr", "hls.js", "hls.min.js", "videojs", "video.js", "plyr", "shaka", "mpegts", "flowplayer", "player"]
            if player.contains(where: { html.contains($0) }) { return ProbeResult(state: .up, ms: ms(), note: "lecteur présent sur la page") }
            if html.contains("404") && (html.contains("not found") || html.contains("introuvable")) || html.trimmingCharacters(in: .whitespacesAndNewlines).count < 64 {
                return ProbeResult(state: .noVideo, ms: ms(), note: "page vide ou introuvable")
            }
            return ProbeResult(state: .up, ms: ms(), note: "page en ligne")
        }
    }

    nonisolated private static func statusNote(_ code: Int) -> String {
        switch code {
        case 401, 403: return "accès refusé (\(code))"
        case 404, 410: return "lien expiré (\(code))"
        case 429: return "trop de demandes (429)"
        case 500...599: return "erreur du fournisseur (\(code))"
        default: return "réponse \(code)"
        }
    }

    nonisolated private static func pageLike(_ data: Data) -> Bool {
        let head = String(decoding: data.prefix(512), as: UTF8.self).lowercased()
        return head.contains("<html") || head.contains("<!doctype") || head.hasPrefix("{")
    }

    nonisolated private static func targetDuration(_ text: String) -> Double? {
        text.components(separatedBy: .newlines).first { $0.hasPrefix("#EXT-X-TARGETDURATION:") }
            .flatMap { Double($0.dropFirst(22).trimmingCharacters(in: .whitespaces)) }
    }

    nonisolated private static func mediaSequence(_ text: String) -> Int? {
        text.components(separatedBy: .newlines).first { $0.hasPrefix("#EXT-X-MEDIA-SEQUENCE:") }
            .flatMap { Int($0.dropFirst(22).trimmingCharacters(in: .whitespaces)) }
    }

    nonisolated private static func segmentCount(_ text: String) -> Int {
        text.components(separatedBy: .newlines).filter { $0.hasPrefix("#EXTINF:") }.count
    }

    nonisolated private static func lastSegment(_ text: String) -> String? {
        text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.last { !$0.isEmpty && !$0.hasPrefix("#") }
    }

    /// Tests de plusieurs serveurs, 6 à la fois ; chaque résultat est remis dès qu'il arrive.
    static func probeMany(_ servers: [LiveServer], session: Session, apply: @escaping @MainActor (UUID, ProbeResult) -> Void) async {
        await withTaskGroup(of: (UUID, ProbeResult).self) { group in
            var queue = servers.makeIterator()
            func next() {
                guard let server = queue.next() else { return }
                group.addTask { @MainActor in (server.id, await LiveServerFactory.probe(server, session: session)) }
            }
            for _ in 0..<6 { next() }
            for await (id, result) in group {
                apply(id, result)
                next()
            }
        }
    }

    /// Début d'un fichier vidéo : MPEG-TS (0x47), MP4 fragmenté, ID3 (AAC).
    private static func looksLikeMedia(_ data: Data) -> Bool {
        let bytes = [UInt8](data.prefix(4_096))
        guard bytes.count >= 8 else { return false }
        if transportStream(bytes) { return true }
        let box = String(bytes: bytes[4..<8], encoding: .ascii) ?? ""
        if ["ftyp", "moof", "styp", "sidx", "mdat", "free"].contains(box) { return true }
        return bytes[0] == 0x49 && bytes[1] == 0x44 && bytes[2] == 0x33
    }
}

/// Compteur partagé entre la tâche de lecture d'un flux et celle qui l'arrête.
final class ByteCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    var value: Int { lock.withLock { count } }
    func set(_ value: Int) { lock.withLock { count = value } }
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
                Text(([server.probeNote].compactMap { $0 } + [LiveHealth.text(server, channel: pick.channel.id)]).joined(separator: " · "))
                    .font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
            }
            Spacer(minLength: 6)
            probeTag(server)
        }
    }

    private func probeInfo(_ server: LiveServer) -> (String, Color) {
        switch server.probe {
        case .untested: return (server.kind == .web ? "Lecteur web" : server.kind == .resolve ? "Automatique" : "", Theme.muted)
        case .testing: return ("Test…", Theme.muted)
        case .up: return (server.format == .ts ? "En ligne · MPEG-TS" : server.probeMs > 3500 ? "En ligne · lent" : server.margin >= 2 || server.margin == 0 ? "En ligne" : "En ligne · juste", Theme.teal)
        case .slow: return ("Trop lent ici", .orange)
        case .late: return ("Lent à répondre", .orange)
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
