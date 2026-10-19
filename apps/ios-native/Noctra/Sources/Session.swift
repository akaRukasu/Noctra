import Foundation
import Observation
import Security
import UIKit

enum NoctraError: LocalizedError {
    case badAddress
    case unreachable
    case http(Int)
    case credentials
    case empty

    var errorDescription: String? {
        switch self {
        case .badAddress: return "Adresse du serveur invalide."
        case .unreachable: return "Serveur injoignable. Vérifiez l’adresse et la connexion."
        case .http(let code): return code == 401 ? "Session expirée : reconnectez-vous." : "Le serveur a répondu par une erreur (\(code))."
        case .credentials: return "Nom d’utilisateur ou mot de passe incorrect."
        case .empty: return "Aucun contenu disponible."
        }
    }
}

/// Session : serveur Jellyfin du serveur Noctra, jeton, utilisateur.
/// Jeton gardé dans le trousseau, le reste dans les réglages de l'appli.
@MainActor
@Observable
final class Session {
    static let defaultServer = "https://akarukasu.merlion.usbx.me"

    private(set) var jellyfinBase: String
    private(set) var noctraBase: String
    private(set) var token: String?
    private(set) var userId: String?
    private(set) var userName: String?
    /// Photo de profil Jellyfin (étiquette de l'image) : affichée à la place de l'initiale.
    private(set) var avatarTag: String?
    private(set) var hasNoctra: Bool
    let deviceId: String
    private let deviceName: String

    var isSignedIn: Bool { token != nil && userId != nil && !jellyfinBase.isEmpty }

    init() {
        let defaults = UserDefaults.standard
        jellyfinBase = defaults.string(forKey: "noctra.jellyfin") ?? ""
        noctraBase = defaults.string(forKey: "noctra.noctra") ?? ""
        userId = defaults.string(forKey: "noctra.userId")
        userName = defaults.string(forKey: "noctra.userName")
        avatarTag = defaults.string(forKey: "noctra.avatarTag")
        hasNoctra = defaults.bool(forKey: "noctra.hasNoctra")
        if let saved = defaults.string(forKey: "noctra.deviceId") {
            deviceId = saved
        } else {
            let fresh = "noctra-ios-" + UUID().uuidString.lowercased()
            defaults.set(fresh, forKey: "noctra.deviceId")
            deviceId = fresh
        }
        deviceName = UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
        token = Keychain.read("noctra.token")
        if token == nil { userId = nil }
    }

    // MARK: Connexion

    /// Adresse saisie → serveur Jellyfin (/jellyfin ou la racine) et serveur Noctra (/noctra).
    func signIn(server raw: String, username: String, password: String) async throws {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { text = Session.defaultServer }
        if !text.lowercased().hasPrefix("http") { text = "https://" + text }
        while text.hasSuffix("/") { text.removeLast() }
        for suffix in ["/noctra", "/jellyfin", "/web"] where text.lowercased().hasSuffix(suffix) {
            text.removeLast(suffix.count)
        }
        guard URL(string: text)?.host != nil else { throw NoctraError.badAddress }

        var jellyfin: String?
        for candidate in [text + "/jellyfin", text] {
            if await Self.isJellyfin(candidate) {
                jellyfin = candidate
                break
            }
        }
        guard let jellyfin else { throw NoctraError.unreachable }

        var request = URLRequest(url: URL(string: jellyfin + "/Users/AuthenticateByName")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(authorization(token: nil), forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["Username": username, "Pw": password])
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 || status == 403 { throw NoctraError.credentials }
        guard (200..<300).contains(status) else { throw NoctraError.http(status) }
        let auth = try JSONDecoder.jellyfin.decode(AuthResult.self, from: data)

        let noctra = text + "/noctra"
        let noctraOK = await Self.isNoctra(noctra)

        Keychain.write("noctra.token", auth.accessToken)
        let defaults = UserDefaults.standard
        defaults.set(jellyfin, forKey: "noctra.jellyfin")
        defaults.set(noctra, forKey: "noctra.noctra")
        defaults.set(auth.user.id, forKey: "noctra.userId")
        defaults.set(auth.user.name, forKey: "noctra.userName")
        defaults.set(auth.user.primaryImageTag, forKey: "noctra.avatarTag")
        defaults.set(noctraOK, forKey: "noctra.hasNoctra")
        defaults.set(text, forKey: "noctra.server")
        jellyfinBase = jellyfin
        noctraBase = noctra
        hasNoctra = noctraOK
        userName = auth.user.name
        avatarTag = auth.user.primaryImageTag
        userId = auth.user.id
        token = auth.accessToken
    }

    var lastServer: String { UserDefaults.standard.string(forKey: "noctra.server") ?? Session.defaultServer }

    func signOut() {
        if let token, let url = URL(string: jellyfinBase + "/Sessions/Logout") {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue(authorization(token: token), forHTTPHeaderField: "Authorization")
            Task { _ = try? await URLSession.shared.data(for: request) }
        }
        Keychain.delete("noctra.token")
        UserDefaults.standard.removeObject(forKey: "noctra.userId")
        UserDefaults.standard.removeObject(forKey: "noctra.avatarTag")
        token = nil
        avatarTag = nil
        userId = nil
    }

    private static func isJellyfin(_ base: String) async -> Bool {
        guard let url = URL(string: base + "/System/Info/Public") else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return json["Id"] != nil || json["ServerName"] != nil
    }

    private static func isNoctra(_ base: String) async -> Bool {
        guard let url = URL(string: base + "/health") else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return (json["client"] as? String) == "Noctra"
    }

    // MARK: Requêtes Jellyfin

    func authorization(token: String?) -> String {
        var value = "MediaBrowser Client=\"Noctra iOS\", Device=\"\(deviceName)\", DeviceId=\"\(deviceId)\", Version=\"2.15.5\""
        if let token { value += ", Token=\"\(token)\"" }
        return value
    }

    var authHeaders: [String: String] { ["Authorization": authorization(token: token)] }

    func url(_ path: String, _ query: [String: String?] = [:]) -> URL? {
        let resolved = path.replacingOccurrences(of: "{userId}", with: userId ?? "")
        guard var components = URLComponents(string: jellyfinBase + resolved) else { return nil }
        let items = query.compactMap { key, value in value.map { URLQueryItem(name: key, value: $0) } }
        if !items.isEmpty { components.queryItems = (components.queryItems ?? []) + items.sorted { $0.name < $1.name } }
        return components.url
    }

    func data(_ method: String = "GET", _ path: String, _ query: [String: String?] = [:], json: Any? = nil) async throws -> Data {
        guard let url = url(path, query) else { throw NoctraError.badAddress }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue(authorization(token: token), forHTTPHeaderField: "Authorization")
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let result: (Data, URLResponse)
        do {
            result = try await URLSession.shared.data(for: request)
        } catch {
            if (error as? URLError)?.code == .cancelled { throw error }
            throw NoctraError.unreachable
        }
        let status = (result.1 as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { signOut() }
        guard (200..<300).contains(status) else { throw NoctraError.http(status) }
        return result.0
    }

    func get<T: Decodable>(_ type: T.Type, _ path: String, _ query: [String: String?] = [:]) async throws -> T {
        try await Self.decode(T.self, try await data("GET", path, query))
    }

    // MARK: Décodage hors du fil principal (défilement fluide pendant les chargements)

    nonisolated static func decode<T: Decodable>(_ type: T.Type, _ data: Data) async throws -> T {
        try await Task.detached(priority: .userInitiated) {
            UncheckedBox(value: try JSONDecoder.jellyfin.decode(T.self, from: data))
        }.value.value
    }

    nonisolated static func parseJSON(_ data: Data) async throws -> Any {
        try await Task.detached(priority: .userInitiated) {
            UncheckedBox(value: try JSONSerialization.jsonObject(with: data))
        }.value.value
    }

    /// Requête vers une route récente de Jellyfin, puis l'ancienne si le serveur ne la connaît pas.
    func get<T: Decodable>(_ type: T.Type, paths: [String], _ query: [String: String?] = [:]) async throws -> T {
        var lastError: Error = NoctraError.empty
        for path in paths {
            do { return try await get(T.self, path, query) } catch NoctraError.http(let code) where code == 404 || code == 405 {
                lastError = NoctraError.http(code)
            }
        }
        throw lastError
    }

    @discardableResult
    func send(_ method: String, paths: [String], _ query: [String: String?] = [:], json: Any? = nil) async throws -> Data {
        var lastError: Error = NoctraError.empty
        for path in paths {
            do { return try await data(method, path, query, json: json) } catch NoctraError.http(let code) where code == 404 || code == 405 {
                lastError = NoctraError.http(code)
            }
        }
        throw lastError
    }

    // MARK: Images

    func image(_ id: String?, type: String = "Primary", tag: String? = nil, width: Int) -> URL? {
        guard let id else { return nil }
        return url("/Items/\(id)/Images/\(type)", ["maxWidth": String(width), "quality": "88", "tag": tag])
    }

    /// Affiche verticale (épisode : affiche de la série).
    func poster(_ item: BaseItem, width: Int = 360) -> URL? {
        if item.type == "Episode" || item.type == "Season", let series = item.seriesId {
            if item.type == "Season", let tag = item.imageTags?["Primary"] { return image(item.id, tag: tag, width: width) }
            return image(series, tag: item.seriesPrimaryImageTag, width: width)
        }
        return image(item.id, tag: item.imageTags?["Primary"], width: width)
    }

    /// Image large (fond de la fiche, carrousel).
    func backdrop(_ item: BaseItem, width: Int = 1280) -> URL? {
        if let tag = item.backdropImageTags?.first { return image(item.id, type: "Backdrop", tag: tag, width: width) }
        if let parent = item.parentBackdropItemId { return image(parent, type: "Backdrop", tag: item.parentBackdropImageTags?.first, width: width) }
        return poster(item, width: width / 2)
    }

    /// Vignette 16:9 (épisodes, reprises).
    func thumb(_ item: BaseItem, width: Int = 640) -> URL? {
        if item.type == "Episode", let tag = item.imageTags?["Primary"] { return image(item.id, tag: tag, width: width) }
        if let tag = item.imageTags?["Thumb"] { return image(item.id, type: "Thumb", tag: tag, width: width) }
        return backdrop(item, width: width)
    }

    func logo(_ item: BaseItem, width: Int = 600) -> URL? {
        if let tag = item.imageTags?["Logo"] { return image(item.id, type: "Logo", tag: tag, width: width) }
        if let parent = item.parentLogoItemId { return image(parent, type: "Logo", tag: item.parentLogoImageTag, width: width) }
        return nil
    }

    // MARK: Serveur Noctra (TV en direct)

    /// Adresse d'une ressource Noctra. Les routes de l'appli (« /api/… ») sont
    /// relatives au dossier du serveur (/noctra) ; les liens renvoyés par le
    /// serveur contiennent déjà ce dossier (« /noctra/api/tv/stream/… »).
    func noctraURL(_ raw: String) -> URL? {
        if raw.lowercased().hasPrefix("http") { return URL(string: raw) }
        guard let base = URL(string: noctraBase + "/") else { return nil }
        if raw.hasPrefix("/") {
            let folder = URL(string: noctraBase)?.path ?? ""
            let inFolder = folder.isEmpty || folder == "/" || raw == folder || raw.hasPrefix(folder + "/")
            return inFolder ? URL(string: raw, relativeTo: base)?.absoluteURL : URL(string: noctraBase + raw)
        }
        return URL(string: raw, relativeTo: base)?.absoluteURL
    }

    func noctraJSON(_ path: String, timeout: TimeInterval = 45) async throws -> Any {
        guard let url = noctraURL(path) else { throw NoctraError.badAddress }
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        if let token { request.setValue(token, forHTTPHeaderField: "x-noctra-token") }
        let result: (Data, URLResponse)
        do {
            result = try await URLSession.shared.data(for: request)
        } catch {
            throw NoctraError.unreachable
        }
        let status = (result.1 as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw NoctraError.http(status) }
        return try await Self.parseJSON(result.0)
    }

    /// Le jeton ne part que vers le serveur Noctra lui-même.
    func isNoctraOrigin(_ url: URL) -> Bool {
        guard let base = URL(string: noctraBase) else { return false }
        return url.host == base.host && url.scheme == base.scheme && url.port == base.port
    }

    /// Requête Noctra avec corps JSON (demandes Jellyseerr…).
    func noctraSend(_ method: String, _ path: String, json: Any?, timeout: TimeInterval = 45) async throws -> Any? {
        guard let url = noctraURL(path) else { throw NoctraError.badAddress }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = timeout
        if let token { request.setValue(token, forHTTPHeaderField: "x-noctra-token") }
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let result: (Data, URLResponse)
        do { result = try await URLSession.shared.data(for: request) } catch { throw NoctraError.unreachable }
        let status = (result.1 as? HTTPURLResponse)?.statusCode ?? 0
        let body = try? JSONSerialization.jsonObject(with: result.0)
        guard (200..<300).contains(status) else {
            if let message = (body as? [String: Any])?["error"] as? String { throw NoctraMessage(message: message) }
            throw NoctraError.http(status)
        }
        return body
    }

    /// Cookie de session Noctra (posé par /api/session) : les segments des
    /// chaînes relayées par le serveur, demandés par le lecteur vidéo et les
    /// lecteurs web, passent avec lui (pas d'en-tête personnalisé possible).
    func establishNoctraSession() async {
        guard token != nil else { return }
        if !noctraBase.isEmpty, let json = try? await noctraJSON("/api/session", timeout: 15) as? [String: Any] {
            hasNoctra = true
            UserDefaults.standard.set(true, forKey: "noctra.hasNoctra")
            isAdmin = (json["isAdmin"] as? Bool) ?? false
            if let user = json["user"] as? [String: Any] { setAvatar(user["primaryImageTag"] as? String) }
            return
        }
        // Sans serveur Noctra : droits lus sur le compte Jellyfin.
        if let raw = try? await data("GET", "/Users/Me"),
           let json = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] {
            isAdmin = ((json["Policy"] as? [String: Any])?["IsAdministrator"] as? Bool) ?? false
            setAvatar(json["PrimaryImageTag"] as? String)
        }
    }

    /// Photo de profil changée depuis Jellyfin ou le site : nouvelle étiquette, nouvelle image.
    private func setAvatar(_ tag: String?) {
        let value = tag.flatMap { $0.isEmpty ? nil : $0 }
        guard value != avatarTag else { return }
        avatarTag = value
        UserDefaults.standard.set(value, forKey: "noctra.avatarTag")
    }

    /// Photo de profil de l'utilisateur connecté (nil : initiale du nom).
    func avatarURL(size: Int = 160) -> URL? {
        guard let userId, let avatarTag else { return nil }
        return url("/Users/\(userId)/Images/Primary", ["tag": avatarTag, "maxWidth": String(size), "quality": "90"])
    }

    private(set) var isAdmin = false

    func noctraCookies(for url: URL) -> [HTTPCookie] {
        guard isNoctraOrigin(url), let base = URL(string: noctraBase + "/") else { return [] }
        return HTTPCookieStorage.shared.cookies(for: base) ?? []
    }
}

/// Résultat transmis d'une tâche de fond au fil principal.
struct UncheckedBox<T>: @unchecked Sendable {
    let value: T
}

struct NoctraMessage: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// MARK: Trousseau

enum Keychain {
    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.noctra.app",
         kSecAttrAccount as String: key]
    }

    static func read(_ key: String) -> String? {
        var request = query(key)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ key: String, _ value: String) {
        delete(key)
        var request = query(key)
        request[kSecValueData as String] = Data(value.utf8)
        request[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(request as CFDictionary, nil)
    }

    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}
