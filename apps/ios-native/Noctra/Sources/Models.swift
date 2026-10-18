import Foundation

/// Clé JSON de Jellyfin (« PlaybackPositionTicks ») lue en camelCase (« playbackPositionTicks »).
struct AnyKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { self.stringValue = String(intValue); self.intValue = intValue }
}

extension JSONDecoder {
    static let jellyfin: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .custom { keys in
            let key = keys.last?.stringValue ?? ""
            guard let first = key.first else { return AnyKey(stringValue: key) }
            return AnyKey(stringValue: first.lowercased() + key.dropFirst())
        }
        return decoder
    }()
}

struct AuthResult: Decodable {
    struct User: Decodable { let id: String; let name: String? }
    let user: User
    let accessToken: String
}

struct ItemsResponse: Decodable {
    let items: [BaseItem]?
    let totalRecordCount: Int?
}

struct BaseItem: Decodable, Identifiable, Hashable {
    let id: String
    let name: String?
    let type: String?
    let overview: String?
    let productionYear: Int?
    let runTimeTicks: Int64?
    let communityRating: Double?
    let officialRating: String?
    let imageTags: [String: String]?
    let backdropImageTags: [String]?
    let parentBackdropItemId: String?
    let parentBackdropImageTags: [String]?
    let parentLogoItemId: String?
    let parentLogoImageTag: String?
    let seriesId: String?
    let seriesName: String?
    let seriesPrimaryImageTag: String?
    let seasonId: String?
    let seasonName: String?
    let indexNumber: Int?
    let parentIndexNumber: Int?
    let userData: UserData?
    let mediaSources: [MediaSource]?
    let genres: [String]?
    let people: [Person]?
    let taglines: [String]?
    let collectionType: String?
    let childCount: Int?
    let premiereDate: String?
    let status: String?
    let mediaType: String?

    static func == (lhs: BaseItem, rhs: BaseItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    var title: String { name ?? "Sans titre" }
    var isSeries: Bool { type == "Series" }
    var isFolder: Bool { ["Series", "Season", "BoxSet", "Folder", "CollectionFolder"].contains(type ?? "") }

    /// « S2 · É5 · Titre » pour un épisode.
    var episodeLabel: String? {
        guard type == "Episode" else { return nil }
        var parts: [String] = []
        if let season = parentIndexNumber { parts.append("S\(season)") }
        if let number = indexNumber { parts.append("É\(number)") }
        return parts.joined(separator: " · ")
    }

    var runtime: String? {
        guard let ticks = runTimeTicks, ticks > 0 else { return nil }
        let minutes = Int(ticks / 600_000_000)
        return minutes >= 60 ? "\(minutes / 60) h \(String(format: "%02d", minutes % 60))" : "\(minutes) min"
    }

    var resumeSeconds: Double {
        Double(userData?.playbackPositionTicks ?? 0) / 10_000_000
    }

    var progress: Double? {
        guard let percent = userData?.playedPercentage, percent > 0 else { return nil }
        return min(1, percent / 100)
    }

    var subtitleLine: String {
        var parts: [String] = []
        if let label = episodeLabel { parts.append(label) }
        if let year = productionYear, type != "Episode" { parts.append(String(year)) }
        if let runtime { parts.append(runtime) }
        if let rating = officialRating { parts.append(rating) }
        return parts.joined(separator: " · ")
    }
}

struct UserData: Decodable {
    let playbackPositionTicks: Int64?
    let playedPercentage: Double?
    let played: Bool?
    let isFavorite: Bool?
    let unplayedItemCount: Int?
}

struct MediaSource: Decodable, Identifiable {
    let id: String
    let name: String?
    let container: String?
    let bitrate: Int?
    let eTag: String?
    let supportsDirectPlay: Bool?
    let supportsDirectStream: Bool?
    let supportsTranscoding: Bool?
    let transcodingUrl: String?
    let mediaStreams: [MediaStream]?
}

struct MediaStream: Decodable, Identifiable, Hashable {
    let index: Int
    let type: String?
    let codec: String?
    let language: String?
    let displayTitle: String?
    let title: String?
    let isDefault: Bool?
    let isForced: Bool?
    let isExternal: Bool?
    let isTextSubtitleStream: Bool?
    let width: Int?
    let height: Int?
    let channels: Int?

    var id: Int { index }
    var label: String { displayTitle ?? title ?? language ?? "Piste \(index)" }
}

struct Person: Decodable, Identifiable, Hashable {
    let id: String
    let name: String?
    let role: String?
    let type: String?
    let primaryImageTag: String?
}

struct PlaybackInfoResponse: Decodable {
    let mediaSources: [MediaSource]?
    let playSessionId: String?
}

/// Médiathèque ouverte depuis l'onglet Médiathèques.
struct LibraryRoute: Hashable {
    let id: String
    let name: String
    let collectionType: String?
}

/// Source (ou bouquet) de chaînes TV du serveur Noctra.
struct TVSourceRoute: Hashable {
    let id: String
    let name: String
    let ref: String?
}

/// Champs demandés à Jellyfin pour l'affichage.
enum Fields {
    static let card = "PrimaryImageAspectRatio,UserData,Overview,ProductionYear,ParentId"
    static let detail = "Overview,Genres,People,Taglines,MediaSources,MediaStreams,UserData,ProductionYear,OfficialRating,CommunityRating,RunTimeTicks,ChildCount,Status,PremiereDate"
}
