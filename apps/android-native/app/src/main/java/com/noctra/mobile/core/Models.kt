package com.noctra.mobile.core

import java.util.Locale

/** Élément Jellyfin (film, série, saison, épisode, dossier…), lu depuis le JSON du serveur. */
class BaseItem(val raw: JsonMap) {
    val id: String = raw.string("Id") ?: ""
    val name: String? = raw.str("Name")
    val type: String? = raw.str("Type")
    val overview: String? = raw.str("Overview")
    val productionYear: Int? = raw.int("ProductionYear")
    val runTimeTicks: Long? = raw.long("RunTimeTicks")
    val communityRating: Double? = raw.double("CommunityRating")
    val officialRating: String? = raw.str("OfficialRating")
    val imageTags: Map<String, String> = raw.map("ImageTags")?.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }?.toMap() ?: emptyMap()
    val backdropImageTags: List<String> = raw.strings("BackdropImageTags")
    val parentBackdropItemId: String? = raw.str("ParentBackdropItemId")
    val parentBackdropImageTags: List<String> = raw.strings("ParentBackdropImageTags")
    val parentLogoItemId: String? = raw.str("ParentLogoItemId")
    val parentLogoImageTag: String? = raw.str("ParentLogoImageTag")
    val parentThumbItemId: String? = raw.str("ParentThumbItemId")
    val parentThumbImageTag: String? = raw.str("ParentThumbImageTag")
    val seriesId: String? = raw.str("SeriesId")
    val seriesName: String? = raw.str("SeriesName")
    val seriesPrimaryImageTag: String? = raw.str("SeriesPrimaryImageTag")
    val seasonId: String? = raw.str("SeasonId")
    val seasonName: String? = raw.str("SeasonName")
    val indexNumber: Int? = raw.int("IndexNumber")
    val parentIndexNumber: Int? = raw.int("ParentIndexNumber")
    val userData: UserData? = raw.map("UserData")?.let { UserData(it) }
    val mediaSources: List<MediaSource> = raw.maps("MediaSources").map { MediaSource(it) }
    val genres: List<String> = raw.strings("Genres")
    val people: List<Person> = raw.maps("People").map { Person(it) }
    val taglines: List<String> = raw.strings("Taglines")
    val collectionType: String? = raw.str("CollectionType")
    val childCount: Int? = raw.int("ChildCount")
    val premiereDate: String? = raw.str("PremiereDate")
    val status: String? = raw.str("Status")
    val mediaType: String? = raw.str("MediaType")

    override fun equals(other: Any?): Boolean = other is BaseItem && other.id == id
    override fun hashCode(): Int = id.hashCode()

    val title: String get() = name ?: "Sans titre"
    val isSeries: Boolean get() = type == "Series"
    val isFolder: Boolean get() = type in setOf("Series", "Season", "BoxSet", "Folder", "CollectionFolder")
    val isPlayable: Boolean get() = type in setOf("Movie", "Episode", "Video", "MusicVideo")

    /** « S2 · É5 » pour un épisode. */
    val episodeLabel: String?
        get() {
            if (type != "Episode") return null
            val parts = mutableListOf<String>()
            parentIndexNumber?.let { parts += "S$it" }
            indexNumber?.let { parts += "É$it" }
            return parts.joinToString(" · ")
        }

    val runtime: String?
        get() {
            val ticks = runTimeTicks ?: return null
            if (ticks <= 0) return null
            val minutes = (ticks / 600_000_000).toInt()
            return if (minutes >= 60) "${minutes / 60} h ${String.format(Locale.FRANCE, "%02d", minutes % 60)}" else "$minutes min"
        }

    val resumeSeconds: Double get() = (userData?.playbackPositionTicks ?: 0L) / 10_000_000.0

    val progress: Double?
        get() {
            val percent = userData?.playedPercentage ?: return null
            if (percent <= 0) return null
            return minOf(1.0, percent / 100)
        }

    val subtitleLine: String
        get() {
            val parts = mutableListOf<String>()
            episodeLabel?.let { parts += it }
            if (type != "Episode") productionYear?.let { parts += it.toString() }
            runtime?.let { parts += it }
            officialRating?.let { parts += it }
            return parts.joinToString(" · ")
        }

    /** Titre affiché : série pour un épisode ou une saison. */
    val displayTitle: String get() = if (type == "Episode" || type == "Season") seriesName ?: title else title

    companion object {
        fun from(value: Any?): BaseItem? = value.asMap()?.let { map -> BaseItem(map).takeIf { it.id.isNotEmpty() } }
        fun list(value: Any?): List<BaseItem> = value.asMaps().mapNotNull { from(it) }
        fun items(response: Any?): List<BaseItem> = list(response.asMap()?.get("Items"))
        fun stub(id: String): BaseItem = BaseItem(mapOf("Id" to id))
    }
}

class UserData(raw: JsonMap) {
    val playbackPositionTicks: Long? = raw.long("PlaybackPositionTicks")
    val playedPercentage: Double? = raw.double("PlayedPercentage")
    val played: Boolean = raw.flag("Played")
    val isFavorite: Boolean = raw.flag("IsFavorite")
    val unplayedItemCount: Int? = raw.int("UnplayedItemCount")
}

class MediaSource(val raw: JsonMap) {
    val id: String = raw.string("Id") ?: ""
    val name: String? = raw.str("Name")
    val container: String? = raw.str("Container")
    val bitrate: Long? = raw.long("Bitrate")
    val size: Long? = raw.long("Size")
    val eTag: String? = raw.str("ETag")
    val path: String? = raw.str("Path")
    val supportsDirectPlay: Boolean = raw.flag("SupportsDirectPlay")
    val supportsDirectStream: Boolean = raw.flag("SupportsDirectStream")
    val supportsTranscoding: Boolean = raw.flag("SupportsTranscoding")
    val transcodingUrl: String? = raw.str("TranscodingUrl")
    val mediaStreams: List<MediaStream> = raw.maps("MediaStreams").map { MediaStream(it) }
    val defaultSubtitleStreamIndex: Int? = raw.int("DefaultSubtitleStreamIndex")
    val defaultAudioStreamIndex: Int? = raw.int("DefaultAudioStreamIndex")
    val runTimeTicks: Long? = raw.long("RunTimeTicks")
}

class MediaStream(raw: JsonMap) {
    val index: Int = raw.int("Index") ?: 0
    val type: String? = raw.str("Type")
    val codec: String? = raw.str("Codec")
    val language: String? = raw.str("Language")
    val displayTitle: String? = raw.str("DisplayTitle")
    val title: String? = raw.str("Title")
    val isDefault: Boolean = raw.flag("IsDefault")
    val isForced: Boolean = raw.flag("IsForced")
    val isExternal: Boolean = raw.flag("IsExternal")
    val isTextSubtitleStream: Boolean = raw.flag("IsTextSubtitleStream")
    /** Sous-titres : External (fichier lu par l'appli), Encode (incrustés par le serveur)… */
    val deliveryMethod: String? = raw.str("DeliveryMethod")
    val deliveryUrl: String? = raw.str("DeliveryUrl")
    val width: Int? = raw.int("Width")
    val height: Int? = raw.int("Height")
    val channels: Int? = raw.int("Channels")

    val label: String get() = displayTitle ?: title ?: language ?: "Piste $index"
}

class Person(raw: JsonMap) {
    val id: String = raw.string("Id") ?: ""
    val name: String? = raw.str("Name")
    val role: String? = raw.str("Role")
    val type: String? = raw.str("Type")
    val primaryImageTag: String? = raw.str("PrimaryImageTag")
}

/** Médiathèque ouverte depuis l'onglet Médiathèques. */
data class LibraryRoute(val id: String, val name: String, val collectionType: String?)

/** Source (ou bouquet) de chaînes TV du serveur Noctra. */
data class TVSourceRoute(val id: String, val name: String, val ref: String?)

/** Champs demandés à Jellyfin pour l'affichage. */
object Fields {
    const val card = "PrimaryImageAspectRatio,UserData,Overview,ProductionYear,ParentId"
    const val detail = "Overview,Genres,People,Taglines,MediaSources,MediaStreams,UserData,ProductionYear,OfficialRating,CommunityRating,RunTimeTicks,ChildCount,Status,PremiereDate"
}

/** Durée « 1:02:03 » ou « 12:34 ». */
fun clock(seconds: Double): String {
    val total = maxOf(0, seconds.toInt())
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) String.format(Locale.FRANCE, "%d:%02d:%02d", h, m, s) else String.format(Locale.FRANCE, "%d:%02d", m, s)
}
