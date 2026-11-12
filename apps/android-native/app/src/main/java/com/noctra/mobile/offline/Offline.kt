package com.noctra.mobile.offline

import android.app.DownloadManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.StatFs
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.Json
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.MediaSource
import com.noctra.mobile.core.Net
import com.noctra.mobile.core.NoctraException
import com.noctra.mobile.core.Prefs
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.bool
import com.noctra.mobile.core.double
import com.noctra.mobile.core.flag
import com.noctra.mobile.core.int
import com.noctra.mobile.core.long
import com.noctra.mobile.core.maps
import com.noctra.mobile.core.str
import com.noctra.mobile.core.string
import com.noctra.mobile.play.DeviceProfile
import com.noctra.mobile.ui.Notices
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import java.io.File
import java.util.UUID

// Téléchargements hors ligne : films et épisodes gardés sur l'appareil, par le
// gestionnaire de téléchargements d'Android (appli fermée, Wi-Fi au choix,
// reprise après coupure). Fichier d'origine (ExoPlayer lit MKV, MP4, HEVC…),
// sinon copie préparée par le serveur à la qualité choisie.

enum class OfflineQuality(val label: String, val detail: String, val bitrate: Int) {
    Original("Originale", "Fichier d’origine", 120_000_000),
    High("Haute · 10 Mb/s", "≈ 4,5 Go par heure", 10_000_000),
    Medium("Moyenne · 4 Mb/s", "≈ 1,8 Go par heure", 4_000_000),
    Low("Économie · 1,5 Mb/s", "≈ 700 Mo par heure", 1_500_000)
}

enum class OfflineState { queued, downloading, paused, done, failed }

data class OfflineSubtitle(val index: Int, val label: String, val isDefault: Boolean, val file: String)

data class OfflineEntry(
    val id: String,
    val type: String,
    val title: String,
    val seriesName: String? = null,
    val seriesId: String? = null,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val year: Int? = null,
    val overview: String? = null,
    val runTimeTicks: Long? = null,
    val quality: OfflineQuality = OfflineQuality.Original,
    val audioIndex: Int? = null,
    val state: OfflineState = OfflineState.queued,
    val progress: Double = 0.0,
    val written: Long = 0,
    val expected: Long = 0,
    val fileName: String? = null,
    val downloadId: Long = -1,
    val subtitles: List<OfflineSubtitle> = emptyList(),
    val subtitleChoice: Int? = null,
    val position: Double = 0.0,
    val played: Boolean = false,
    val addedAt: Long = System.currentTimeMillis(),
    val error: String? = null,
    val mediaSourceId: String? = null,
    val playSessionId: String? = null
) {
    val isEpisode: Boolean get() = type == "Episode"
    val heading: String get() = if (isEpisode) seriesName ?: title else title
    val episodeLabel: String? get() = if (!isEpisode) null else listOfNotNull(seasonNumber?.let { "S$it" }, episodeNumber?.let { "É$it" }).joinToString(" · ")
    val playerTitle: String get() = if (isEpisode) listOfNotNull(seriesName, episodeLabel, title).filter { it.isNotEmpty() }.joinToString(" · ") else title
    val duration: Double get() = (runTimeTicks ?: 0L) / 10_000_000.0
    val resumeProgress: Double? get() = if (duration > 0 && position > 5) minOf(1.0, position / duration) else null

    fun toMap(): JsonMap = mapOf(
        "id" to id, "type" to type, "title" to title, "seriesName" to seriesName, "seriesId" to seriesId, "seasonNumber" to seasonNumber,
        "episodeNumber" to episodeNumber, "year" to year, "overview" to overview, "runTimeTicks" to runTimeTicks, "quality" to quality.name,
        "audioIndex" to audioIndex, "state" to state.name, "progress" to progress, "written" to written, "expected" to expected,
        "fileName" to fileName, "downloadId" to downloadId,
        "subtitles" to subtitles.map { mapOf("index" to it.index, "label" to it.label, "isDefault" to it.isDefault, "file" to it.file) },
        "subtitleChoice" to subtitleChoice, "position" to position, "played" to played, "addedAt" to addedAt, "error" to error,
        "mediaSourceId" to mediaSourceId, "playSessionId" to playSessionId
    )

    companion object {
        fun from(map: JsonMap): OfflineEntry? {
            val id = map.string("id") ?: return null
            return OfflineEntry(
                id = id, type = map.str("type") ?: "Movie", title = map.str("title") ?: "Sans titre", seriesName = map.str("seriesName"), seriesId = map.str("seriesId"),
                seasonNumber = map.int("seasonNumber"), episodeNumber = map.int("episodeNumber"), year = map.int("year"), overview = map.str("overview"),
                runTimeTicks = map.long("runTimeTicks"), quality = OfflineQuality.entries.firstOrNull { it.name == map.str("quality") } ?: OfflineQuality.Original,
                audioIndex = map.int("audioIndex"), state = OfflineState.entries.firstOrNull { it.name == map.str("state") } ?: OfflineState.queued,
                progress = map.double("progress") ?: 0.0, written = map.long("written") ?: 0, expected = map.long("expected") ?: 0,
                fileName = map.str("fileName"), downloadId = map.long("downloadId") ?: -1,
                subtitles = map.maps("subtitles").mapNotNull { s -> s.int("index")?.let { OfflineSubtitle(it, s.str("label") ?: "Sous-titres", s.flag("isDefault"), s.str("file") ?: "") } },
                subtitleChoice = map.int("subtitleChoice"), position = map.double("position") ?: 0.0, played = map.flag("played"),
                addedAt = map.long("addedAt") ?: System.currentTimeMillis(), error = map.str("error"),
                mediaSourceId = map.str("mediaSourceId"), playSessionId = map.str("playSessionId")
            )
        }
    }
}

/** Bibliothèque hors ligne : file d'attente, transferts, fichiers, reprise locale. */
object OfflineStore {
    var entries by mutableStateOf<List<OfflineEntry>>(emptyList())
        private set
    var onMeteredNetwork by mutableStateOf(false)
        private set
    var offline by mutableStateOf(false)
        private set
    var defaultQuality: OfflineQuality
        get() = OfflineQuality.entries.firstOrNull { it.name == Prefs.string("noctra.offline.quality") } ?: OfflineQuality.Original
        set(value) = Prefs.set("noctra.offline.quality", value.name)
    var wifiOnly: Boolean
        get() = Prefs.bool("noctra.offline.wifiOnly", true)
        set(value) { Prefs.set("noctra.offline.wifiOnly", value); schedule() }

    private lateinit var context: Context
    private lateinit var folder: File
    private var ticker: Job? = null
    private var restored = false

    val downloaded: List<OfflineEntry> get() = entries.filter { it.state == OfflineState.done }
    val active: List<OfflineEntry> get() = entries.filter { it.state != OfflineState.done }
    val usedBytes: Long get() = entries.sumOf { if (it.state == OfflineState.done) it.written else 0L }
    val freeBytes: Long get() = runCatching { StatFs(folder.absolutePath).availableBytes }.getOrDefault(0L)

    fun entry(id: String): OfflineEntry? = entries.firstOrNull { it.id == id }

    private val manager: DownloadManager get() = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    fun init(app: Context) {
        context = app
        folder = (app.getExternalFilesDir("offline") ?: File(app.filesDir, "offline")).also { it.mkdirs() }
        runCatching {
            val index = File(app.filesDir, "offline-index.json")
            if (index.exists()) entries = Json.parse(index.readText()).asMaps().mapNotNull { OfflineEntry.from(it) }
        }
        val connectivity = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        runCatching {
            connectivity.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: android.net.Network, capabilities: NetworkCapabilities) {
                    Session.scope.launch {
                        onMeteredNetwork = !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                        offline = false
                        schedule()
                    }
                }

                override fun onLost(network: android.net.Network) {
                    Session.scope.launch { offline = true }
                }
            })
        }
        restored = true
    }

    // MARK: Fichiers

    fun itemFolder(id: String): File = File(folder, id).also { it.mkdirs() }

    fun mediaFile(entry: OfflineEntry): File? {
        val name = entry.fileName ?: return null
        val file = File(itemFolder(entry.id), name)
        return if (file.exists() && file.length() > 0) file else null
    }

    fun posterFile(entry: OfflineEntry): File? = File(itemFolder(entry.id), "poster.jpg").takeIf { it.exists() }
    fun backdropFile(entry: OfflineEntry): File? = File(itemFolder(entry.id), "backdrop.jpg").takeIf { it.exists() } ?: posterFile(entry)
    fun subtitleFile(entry: OfflineEntry, index: Int): File? {
        val subtitle = entry.subtitles.firstOrNull { it.index == index } ?: return null
        return File(itemFolder(entry.id), subtitle.file).takeIf { it.exists() }
    }

    // MARK: Ajout

    fun download(item: BaseItem, quality: OfflineQuality? = null, audioIndex: Int? = null) {
        if (!item.isPlayable) return
        val existing = entry(item.id)
        if (existing != null && existing.state != OfflineState.failed) return
        entries = listOf(OfflineEntry(
            id = item.id, type = item.type ?: "Movie", title = item.title, seriesName = item.seriesName, seriesId = item.seriesId,
            seasonNumber = item.parentIndexNumber, episodeNumber = item.indexNumber, year = item.productionYear, overview = item.overview,
            runTimeTicks = item.runTimeTicks, quality = quality ?: defaultQuality, audioIndex = audioIndex, position = item.resumeSeconds,
            played = item.userData?.played == true
        )) + entries.filter { it.id != item.id }
        save()
        Session.scope.launch { saveArtwork(item) }
        schedule()
    }

    /** Saison entière : chaque épisode rejoint la file. */
    fun download(episodes: List<BaseItem>, quality: OfflineQuality? = null) {
        for (episode in episodes.reversed()) if (entry(episode.id) == null) download(episode, quality)
    }

    private suspend fun saveArtwork(item: BaseItem) = withContext(Dispatchers.IO) {
        val target = itemFolder(item.id)
        for ((name, url) in listOf("poster.jpg" to Session.poster(item, 500), "backdrop.jpg" to Session.backdrop(item, 1280))) {
            if (url == null) continue
            runCatching {
                Net.client.newCall(Request.Builder().url(url).build()).execute().use { response ->
                    if (response.isSuccessful) response.body?.bytes()?.let { File(target, name).writeBytes(it) }
                }
            }
        }
    }

    // MARK: File d'attente

    /** Deux transferts à la fois, Wi-Fi si demandé. */
    fun schedule() {
        if (!restored || !Session.isSignedIn) return
        var running = entries.count { it.state == OfflineState.downloading }
        for (entry in entries.reversed()) {
            if (entry.state != OfflineState.queued) continue
            if (running >= 2) break
            update(entry.id) { it.copy(state = OfflineState.downloading, error = null) }
            running += 1
            Session.scope.launch { start(entry.id) }
        }
        ensureTicker()
    }

    private val downloadProfile: Map<String, Any?> by lazy { DeviceProfile.streaming + ("Name" to "Noctra Android (hors ligne)") }

    private suspend fun start(id: String) {
        val entry = entry(id) ?: return
        val token = Session.token ?: return
        try {
            val query = mutableMapOf<String, String?>("userId" to Session.userId, "isPlayback" to "false", "autoOpenLiveStream" to "false", "maxStreamingBitrate" to entry.quality.bitrate.toString())
            entry.audioIndex?.let { query["audioStreamIndex"] = it.toString() }
            val info = Json.parseMap(Session.data("POST", "/Items/$id/PlaybackInfo", query, mapOf("DeviceProfile" to downloadProfile))) ?: throw NoctraException.empty
            val source = info.maps("MediaSources").firstOrNull()?.let { MediaSource(it) } ?: throw NoctraException.empty
            val playSession = info.str("PlaySessionId") ?: UUID.randomUUID().toString()

            // Sous-titres texte : tous gardés en WebVTT (petits fichiers).
            val subtitles = mutableListOf<OfflineSubtitle>()
            val target = itemFolder(id)
            for (stream in source.mediaStreams.filter { it.type == "Subtitle" && it.isTextSubtitleStream }) {
                val url = Session.urlString("/Videos/$id/${source.id}/Subtitles/${stream.index}/0/Stream.vtt", mapOf("api_key" to token)) ?: continue
                val text = runCatching { Net.text(Request.Builder().url(url).build(), Net.client(240.0)) }.getOrNull() ?: continue
                if (text.first !in 200..299) continue
                val file = "sub-${stream.index}.vtt"
                withContext(Dispatchers.IO) { File(target, file).writeText(text.second) }
                subtitles += OfflineSubtitle(stream.index, stream.label, stream.isDefault || stream.isForced, file)
            }
            val defaultSubtitle = source.defaultSubtitleStreamIndex?.takeIf { index -> subtitles.any { it.index == index } }

            val container = source.container?.split(",")?.firstOrNull()
            val original = entry.quality == OfflineQuality.Original && source.supportsDirectPlay && container != null
            val url: String
            val fileName: String
            val expected: Long
            if (original) {
                url = Session.urlString("/Videos/$id/stream.$container", mapOf("static" to "true", "mediaSourceId" to source.id, "deviceId" to Session.deviceId, "tag" to source.eTag, "api_key" to token)) ?: throw NoctraException.badAddress
                fileName = "media.$container"
                expected = source.size ?: 0
            } else {
                // Copie préparée par le serveur (MKV : lisible pendant la préparation, puis hors ligne).
                val bitrate = minOf(entry.quality.bitrate, (source.bitrate ?: entry.quality.bitrate.toLong()).toInt())
                url = Session.urlString("/Videos/$id/stream.mkv", mapOf(
                    "container" to "mkv", "mediaSourceId" to source.id, "deviceId" to "noctra-offline-$id", "playSessionId" to playSession,
                    "videoCodec" to "h264", "audioCodec" to "aac", "videoBitrate" to (bitrate - 192_000).coerceAtLeast(600_000).toString(),
                    "audioBitrate" to "192000", "audioChannels" to "2", "audioStreamIndex" to entry.audioIndex?.toString(),
                    "maxWidth" to if (entry.quality == OfflineQuality.Low) "1280" else "1920", "api_key" to token
                )) ?: throw NoctraException.badAddress
                fileName = "media.mkv"
                val seconds = if (entry.duration > 0) entry.duration else 5400.0
                expected = (bitrate / 8.0 * seconds).toLong()
            }
            val file = File(target, fileName)
            file.delete()
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(entry.playerTitle)
                .setDescription("Noctra · hors ligne")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationUri(Uri.fromFile(file))
                .setAllowedOverMetered(!wifiOnly)
                .setAllowedOverRoaming(!wifiOnly)
                .addRequestHeader("Authorization", Session.authorization())
            val downloadId = manager.enqueue(request)
            update(id) {
                it.copy(subtitles = subtitles, subtitleChoice = it.subtitleChoice ?: defaultSubtitle ?: -1, expected = expected, fileName = fileName,
                    downloadId = downloadId, mediaSourceId = source.id, playSessionId = playSession, state = OfflineState.downloading)
            }
            save()
            ensureTicker()
        } catch (error: Exception) {
            update(id) { it.copy(state = OfflineState.failed, error = error.message) }
            save()
            schedule()
        }
    }

    // MARK: Commandes

    /** Pause : le transfert est arrêté ; il reprendra depuis le début à la reprise. */
    fun pause(id: String) {
        entry(id)?.let { if (it.downloadId >= 0) runCatching { manager.remove(it.downloadId) } }
        update(id) { it.copy(state = OfflineState.paused, downloadId = -1, progress = 0.0, written = 0) }
        save()
        schedule()
    }

    fun resume(id: String) {
        update(id) { it.copy(state = OfflineState.queued, error = null, progress = 0.0) }
        save()
        schedule()
    }

    fun delete(id: String) {
        entry(id)?.let { if (it.downloadId >= 0 && it.state != OfflineState.done) runCatching { manager.remove(it.downloadId) } }
        File(folder, id).deleteRecursively()
        entries = entries.filter { it.id != id }
        save()
        schedule()
    }

    fun deleteAll() = entries.map { it.id }.forEach { delete(it) }

    fun setSubtitle(id: String, index: Int) {
        update(id) { it.copy(subtitleChoice = index) }
        save()
    }

    /** Fin de lecture hors ligne : reprise locale, « vu » à 92 %. */
    fun recordPosition(id: String, position: Double, duration: Double) {
        update(id) { entry ->
            val length = if (duration > 0) duration else entry.duration
            if (length > 0 && position / length > 0.92) entry.copy(played = true, position = 0.0) else entry.copy(position = position)
        }
        save()
    }

    // MARK: Avancement (lu au gestionnaire de téléchargements)

    private fun ensureTicker() {
        if (ticker?.isActive == true) return
        ticker = Session.scope.launch {
            while (isActive) {
                val running = entries.filter { it.state == OfflineState.downloading && it.downloadId >= 0 }
                if (running.isEmpty()) break
                for (entry in running) poll(entry)
                delay(1000)
            }
        }
    }

    private fun poll(entry: OfflineEntry) {
        val cursor = runCatching { manager.query(DownloadManager.Query().setFilterById(entry.downloadId)) }.getOrNull() ?: return
        cursor.use {
            if (!it.moveToFirst()) {
                update(entry.id) { e -> e.copy(state = OfflineState.failed, error = "Téléchargement interrompu. Touchez pour réessayer.", downloadId = -1) }
                save()
                schedule()
                return
            }
            val status = it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            val written = it.getLong(it.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
            val total = it.getLong(it.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
            when (status) {
                DownloadManager.STATUS_SUCCESSFUL -> {
                    val size = mediaFile(entry)?.length() ?: written
                    update(entry.id) { e -> e.copy(state = OfflineState.done, progress = 1.0, written = size, error = null) }
                    save()
                    Notices.announce("Téléchargé : ${entry.playerTitle}")
                    if (entry.quality != OfflineQuality.Original) entry.playSessionId?.let { ps ->
                        Session.scope.launch { runCatching { Session.data("DELETE", "/Videos/ActiveEncodings", mapOf("deviceId" to "noctra-offline-${entry.id}", "playSessionId" to ps)) } }
                    }
                    schedule()
                }
                DownloadManager.STATUS_FAILED -> {
                    val reason = it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
                    val message = when (reason) {
                        DownloadManager.ERROR_INSUFFICIENT_SPACE -> "Espace insuffisant sur l’appareil."
                        in 400..599 -> "Le serveur a refusé le téléchargement ($reason)."
                        else -> "Connexion perdue. Touchez pour reprendre."
                    }
                    update(entry.id) { e -> e.copy(state = OfflineState.failed, error = message, downloadId = -1) }
                    save()
                    schedule()
                }
                else -> {
                    val expected = if (total > 0) total else entry.expected
                    update(entry.id) { e -> e.copy(written = written, expected = expected, progress = if (expected > 0) minOf(1.0, written.toDouble() / expected) else e.progress) }
                }
            }
        }
    }

    private fun update(id: String, change: (OfflineEntry) -> OfflineEntry) {
        entries = entries.map { if (it.id == id) change(it) else it }
    }

    private fun save() {
        val snapshot = entries.map { it.toMap() }
        Session.scope.launch(Dispatchers.IO) {
            runCatching { File(context.filesDir, "offline-index.json").writeText(Json.stringify(snapshot)) }
        }
    }
}
