package com.noctra.mobile.play

import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.long
import com.noctra.mobile.core.maps
import com.noctra.mobile.core.str
import kotlinx.coroutines.withTimeoutOrNull

/** Générique marqué dans le titre (début, récap, aperçu, générique de fin), en millisecondes. */
data class MediaMarker(val type: Type, val startMs: Long, val endMs: Long, val source: String) {
    enum class Type { intro, outro, recap, preview }

    /** Texte du bouton (jamais « Jellyfin »). */
    val label: String
        get() = when (type) {
            Type.intro -> "Passer le générique"
            Type.outro -> "Passer le générique de fin"
            Type.recap -> "Passer le récap"
            Type.preview -> "Passer l’aperçu"
        }

    /** Marqueur en cours à cette position (bouton retiré 1,5 s avant la fin du marqueur). */
    fun covers(positionMs: Long): Boolean = positionMs >= startMs - 500 && positionMs < endMs - 1500
}

/**
 * Marqueurs réellement fournis, par ordre de préférence : segments du serveur
 * Jellyfin (/MediaSegments : extension de détection ou segments créés depuis les
 * chapitres), sinon chapitres nommés du fichier (« Intro », « Opening »,
 * « Générique de fin »…). Aucune durée fixe ni détection approximative : sans
 * marqueur, pas de bouton.
 */
object Markers {
    private val serverTypes = mapOf("Intro" to MediaMarker.Type.intro, "Outro" to MediaMarker.Type.outro, "Recap" to MediaMarker.Type.recap, "Preview" to MediaMarker.Type.preview)
    private val outroName = Regex("(?:end ?credits|credits|crédits|ending|outro|générique de fin|generique de fin)", RegexOption.IGNORE_CASE)
    private val introName = Regex("(?:^intro|introduction|opening|générique|generique|ouverture)", RegexOption.IGNORE_CASE)
    private val recapName = Regex("(?:recap|récap|previously|précédemment)", RegexOption.IGNORE_CASE)
    private val previewName = Regex("(?:preview|aperçu|prochainement|next time)", RegexOption.IGNORE_CASE)

    /** Segments renvoyés par /MediaSegments/{id}. */
    fun fromServer(response: Any?): List<MediaMarker> =
        response.asMap()?.maps("Items").orEmpty().mapNotNull { segment ->
            val type = serverTypes[segment.str("Type")] ?: return@mapNotNull null
            val start = segment.long("StartTicks") ?: return@mapNotNull null
            val end = segment.long("EndTicks") ?: return@mapNotNull null
            if (end <= start) null else MediaMarker(type, start / 10_000, end / 10_000, "serveur")
        }.sortedBy { it.startMs }

    /** Chapitres nommés : du début du chapitre au suivant (5 s à 15 min). */
    fun fromChapters(item: JsonMap): List<MediaMarker> {
        val chapters = item.maps("Chapters").filter { it.long("StartPositionTicks") != null }.sortedBy { it.long("StartPositionTicks") }
        val runtime = (item.long("RunTimeTicks") ?: 0L) / 10_000
        return chapters.mapIndexedNotNull { index, chapter ->
            val name = (chapter.str("Name") ?: "").trim()
            val type = when {
                outroName.containsMatchIn(name) || Regex("^ed\\d*$", RegexOption.IGNORE_CASE).matches(name) -> MediaMarker.Type.outro
                introName.containsMatchIn(name) || Regex("^op\\d*$", RegexOption.IGNORE_CASE).matches(name) -> MediaMarker.Type.intro
                recapName.containsMatchIn(name) -> MediaMarker.Type.recap
                previewName.containsMatchIn(name) -> MediaMarker.Type.preview
                else -> return@mapIndexedNotNull null
            }
            val start = chapter.long("StartPositionTicks")!! / 10_000
            val end = if (index + 1 < chapters.size) chapters[index + 1].long("StartPositionTicks")!! / 10_000 else runtime
            if (end - start in 5_000..15 * 60_000) MediaMarker(type, start, end, "chapitres") else null
        }
    }

    /** Marqueurs du titre (2,5 s d'attente au plus ; liste vide sans marqueur). */
    suspend fun load(item: BaseItem): List<MediaMarker> = withTimeoutOrNull(2_500) {
        val server = runCatching { fromServer(Session.json("/MediaSegments/${item.id}")) }.getOrDefault(emptyList())
        if (server.isNotEmpty()) return@withTimeoutOrNull server
        val details = if (item.raw.containsKey("Chapters")) item.raw
            else runCatching { Session.json("/Users/${Session.userId}/Items/${item.id}", mapOf("Fields" to "Chapters")).asMap() }.getOrNull() ?: item.raw
        fromChapters(details)
    } ?: emptyList()

    /** Épisode qui suit dans la série (ordre de Jellyfin), ou null. */
    suspend fun nextEpisode(item: BaseItem): BaseItem? {
        val series = item.seriesId ?: return null
        if (item.type != "Episode") return null
        return withTimeoutOrNull(2_500) {
            val list = runCatching {
                Session.items("/Shows/$series/Episodes", mapOf("UserId" to Session.userId, "StartItemId" to item.id, "Limit" to "2", "Fields" to "Overview"))
            }.getOrDefault(emptyList())
            if (list.firstOrNull()?.id?.replace("-", "")?.lowercase() == item.id.replace("-", "").lowercase()) list.getOrNull(1) else null
        }
    }
}
