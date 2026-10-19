package com.noctra.mobile.play

import android.media.MediaCodecList
import android.net.Uri
import androidx.annotation.OptIn
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.noctra.mobile.NoctraApplication
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.Json
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.MediaStream
import com.noctra.mobile.core.Net
import com.noctra.mobile.core.NoctraException
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.maps
import com.noctra.mobile.core.str
import com.noctra.mobile.core.MediaSource as JellyfinSource
import com.noctra.mobile.offline.OfflineEntry
import com.noctra.mobile.offline.OfflineStore
import com.noctra.mobile.sync.SyncPlayManager
import com.noctra.mobile.ui.Notices
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.Request
import java.io.File
import java.util.UUID
import kotlin.math.abs

/** Suivi de lecture envoyé à Jellyfin (reprise, « vu »). */
data class PlaybackReport(val itemId: String, val mediaSourceId: String, val playSessionId: String, val playMethod: String)

/** Sous-titre texte proposé dans le lecteur. */
data class SubtitleChoice(val index: Int, val label: String, val url: String, val alternate: String?)

/**
 * Lecteur vidéo (ExoPlayer de Media3) : films et épisodes, hors ligne.
 * Décision de Jellyfin selon les formats lus par l'appareil (lecture directe,
 * sinon flux HLS adapté). En groupe SyncPlay, la lecture suit les ordres du groupe.
 */
@OptIn(UnstableApi::class)
object PlaybackManager {
    var presented by mutableStateOf(false)
        private set
    var player by mutableStateOf<ExoPlayer?>(null)
        private set
    var title by mutableStateOf("")
        private set
    var subtitleText by mutableStateOf("")
        private set
    var subtitleStatus by mutableStateOf<String?>(null)
        private set
    var subtitles by mutableStateOf<List<SubtitleChoice>>(emptyList())
        private set
    var subtitleIndex by mutableStateOf(-1)
        private set
    /** Lectures terminées : reprises et « À suivre » à mettre à jour. */
    var endedCount by mutableIntStateOf(0)
        private set

    /** Lecture terminée ailleurs (Chromecast) : reprises à mettre à jour. */
    fun noteEnded() { endedCount += 1 }

    val isPlaying: Boolean get() = presented
    var syncMode = false
        private set
    var currentItemId: String? = null
        private set
    var lastMediaURL: String? = null
        private set
    var lastMediaIsDirect = false
        private set
    var lastSubtitleURL: String? = null
        private set

    private var report: PlaybackReport? = null
    private var offlineId: String? = null
    private var cues: List<SubtitleCue> = emptyList()
    private var progressJob: Job? = null
    private var subtitleJob: Job? = null
    private var commandUntil = 0L
    private var lastSample = 0.0
    private var lastSampleAt = 0L
    private var readyReported = false

    val positionSeconds: Double get() = (player?.currentPosition ?: 0L) / 1000.0

    // MARK: Films et épisodes

    suspend fun play(item: BaseItem, audioIndex: Int? = null, subtitleIndex: Int? = null, startSeconds: Double, sync: Boolean = false) {
        // En groupe SyncPlay : le titre est proposé au groupe, qui lance la lecture pour tous.
        if (!sync && SyncPlayManager.group != null) {
            SyncPlayManager.setQueue(item.id, startSeconds)
            return
        }
        suspend fun fetchInfo(directPlay: Boolean): JsonMap {
            val query = mutableMapOf<String, String?>("userId" to Session.userId, "isPlayback" to "true", "autoOpenLiveStream" to "true", "maxStreamingBitrate" to "120000000")
            audioIndex?.let { query["audioStreamIndex"] = it.toString() }
            subtitleIndex?.let { query["subtitleStreamIndex"] = it.toString() }
            val body = mutableMapOf<String, Any?>("DeviceProfile" to DeviceProfile.streaming)
            if (!directPlay) { body["EnableDirectPlay"] = false; body["AllowVideoStreamCopy"] = true; body["AllowAudioStreamCopy"] = true }
            return Json.parseMap(Session.data("POST", "/Items/${item.id}/PlaybackInfo", query, body)) ?: throw NoctraException.empty
        }
        var info = fetchInfo(true)
        var source = info.maps("MediaSources").firstOrNull()?.let { JellyfinSource(it) } ?: throw NoctraException.empty
        // Lecture directe : le fichier joue sa piste audio par défaut. Autre langue choisie :
        // flux préparé par le serveur avec cette piste (vidéo recopiée).
        val audios = source.mediaStreams.filter { it.type == "Audio" }
        val fileDefault = (audios.firstOrNull { it.isDefault } ?: audios.firstOrNull())?.index
        if (source.supportsDirectPlay && audioIndex != null && audios.size > 1 && audioIndex != fileDefault) {
            runCatching { fetchInfo(false) }.getOrNull()?.let { retry ->
                retry.maps("MediaSources").firstOrNull()?.let { JellyfinSource(it) }?.takeIf { it.transcodingUrl != null }?.let { info = retry; source = it }
            }
        }
        val playSession = info.str("PlaySessionId") ?: UUID.randomUUID().toString()
        val url: String
        val method: String
        val container = source.container?.split(",")?.firstOrNull()
        if (source.supportsDirectPlay && container != null) {
            url = Session.urlString("/Videos/${item.id}/stream.$container", mapOf(
                "static" to "true", "mediaSourceId" to source.id, "deviceId" to Session.deviceId,
                "playSessionId" to playSession, "tag" to source.eTag, "api_key" to Session.token
            )) ?: throw NoctraException.badAddress
            method = "DirectPlay"
        } else if (source.transcodingUrl != null) {
            url = Session.jellyfinBase + source.transcodingUrl
            method = if (source.supportsDirectStream) "DirectStream" else "Transcode"
        } else throw NoctraException.empty

        // Sous-titres texte : fichier WebVTT lu par l'appli. Sous-titres image : incrustés par le serveur.
        val choices = textSubtitles(item.id, source)
        val chosen = subtitleIndex ?: source.defaultSubtitleStreamIndex ?: -1
        val heading = if (item.type == "Episode") listOfNotNull(item.seriesName, item.episodeLabel, item.name).joinToString(" · ") else item.title
        lastMediaURL = url
        lastMediaIsDirect = method == "DirectPlay"
        present(Uri.parse(url), heading, startSeconds, PlaybackReport(item.id, source.id, playSession, method), sync, Session.authHeaders, if (method == "DirectPlay") null else "application/x-mpegURL")
        currentItemId = item.id
        currentItem = item
        audioTracks = source.mediaStreams.filter { it.type == "Audio" }.map { it.index to it.label }
        this.audioIndex = audioIndex ?: source.defaultAudioStreamIndex ?: fileDefault
        burnedSubtitles = source.mediaStreams.filter { it.type == "Subtitle" && !(it.deliveryMethod != "Encode" && it.isTextSubtitleStream) }.map { it.index to it.label + " (incrustés)" }
        val burned = source.mediaStreams.firstOrNull { it.index == chosen && it.type == "Subtitle" }?.deliveryMethod == "Encode"
        subtitles = choices
        if (burned) { this.subtitleIndex = chosen; burnedIndex = chosen; subtitleJob?.cancel(); cues = emptyList(); subtitleText = "" } else { burnedIndex = -1; selectSubtitle(chosen) }
    }

    /** Pistes du titre en cours : langues, sous-titres incrustés par le serveur (image). */
    var audioTracks by mutableStateOf<List<Pair<Int, String>>>(emptyList())
        private set
    var audioIndex by mutableStateOf<Int?>(null)
        private set
    var burnedSubtitles by mutableStateOf<List<Pair<Int, String>>>(emptyList())
        private set
    private var burnedIndex = -1
    private var currentItem: BaseItem? = null
    var switching by mutableStateOf(false)
        private set

    /** Autre langue (ou sous-titres incrustés) pendant la lecture : nouveau flux repris au même moment. */
    fun switchStream(audio: Int?, subtitle: Int) {
        val item = currentItem ?: return
        val position = positionSeconds
        switching = true
        Session.scope.launch {
            try {
                play(item, audio, subtitle, maxOf(position, 6.0), sync = syncMode)
            } catch (failure: Exception) {
                Notices.announce("Cette piste n’est pas disponible : ${failure.message}")
            } finally {
                switching = false
            }
        }
    }

    /** Sous-titres choisis dans le lecteur : texte changé sur place, incrustés par un nouveau flux. */
    fun chooseSubtitle(index: Int) {
        if (index >= 0 && burnedSubtitles.any { it.first == index } || burnedIndex >= 0) switchStream(audioIndex, index) else selectSubtitle(index)
    }

    private fun textSubtitles(itemId: String, source: JellyfinSource): List<SubtitleChoice> =
        source.mediaStreams.filter { it.type == "Subtitle" && it.deliveryMethod != "Encode" && it.isTextSubtitleStream }.mapNotNull { stream ->
            val url = Session.urlString("/Videos/$itemId/${source.id}/Subtitles/${stream.index}/0/Stream.vtt", mapOf("api_key" to Session.token)) ?: return@mapNotNull null
            SubtitleChoice(stream.index, stream.label, url, Session.urlString("/Videos/$itemId/${source.id}/Subtitles/${stream.index}/Stream.vtt", mapOf("api_key" to Session.token)))
        }

    /** Sous-titres choisis (−1 : aucun) : fichier préparé par le serveur (la première fois, il extrait la piste : jusqu'à quelques minutes). */
    fun selectSubtitle(index: Int) {
        subtitleIndex = index
        subtitleJob?.cancel()
        cues = emptyList()
        subtitleText = ""
        subtitleStatus = null
        lastSubtitleURL = null
        val choice = subtitles.firstOrNull { it.index == index } ?: return
        lastSubtitleURL = choice.url
        if (choice.url.startsWith("file:") || choice.url.startsWith("/")) {
            val path = choice.url.removePrefix("file://")
            cues = runCatching { WebVTT.parse(File(path).readText()) }.getOrDefault(emptyList())
            if (cues.isEmpty()) flash("Sous-titres illisibles")
            return
        }
        subtitleStatus = "Sous-titres en préparation…"
        subtitleJob = Session.scope.launch {
            for (candidate in listOfNotNull(choice.url, choice.alternate)) {
                for (attempt in 0 until 2) {
                    val result = runCatching { Net.text(Request.Builder().url(candidate).headers(okhttp3.Headers.Builder().apply { Session.authHeaders.forEach { (k, v) -> add(k, v) } }.build()).build(), Net.client(if (attempt == 0) 240.0 else 120.0)) }.getOrNull() ?: continue
                    if (result.first == 404) break
                    if (result.first !in 200..299) continue
                    val parsed = WebVTT.parse(result.second)
                    if (parsed.isNotEmpty()) {
                        cues = parsed
                        subtitleStatus = null
                        return@launch
                    }
                }
            }
            flash("Sous-titres indisponibles pour ce titre")
        }
    }

    private fun flash(text: String) {
        subtitleStatus = text
        Session.scope.launch { delay(4000); if (subtitleStatus == text) subtitleStatus = null }
    }

    /** Texte à afficher (appelé par le lecteur à chaque image de sous-titres). */
    fun refreshSubtitle() {
        if (cues.isEmpty()) { if (subtitleText.isNotEmpty()) subtitleText = ""; return }
        val text = WebVTT.at(cues, positionSeconds)
        if (text != subtitleText) subtitleText = text
    }

    // MARK: Hors ligne

    /** Titre téléchargé : fichier local, reprise gardée sur l'appareil, suivi envoyé au serveur quand il est joignable. */
    fun playOffline(entry: OfflineEntry, subtitle: Int? = null) {
        val file = OfflineStore.mediaFile(entry)
        if (file == null) {
            Notices.announce("Fichier introuvable : supprimez puis téléchargez à nouveau ce titre.")
            return
        }
        val report = if (Session.isSignedIn && entry.mediaSourceId != null) PlaybackReport(entry.id, entry.mediaSourceId!!, UUID.randomUUID().toString(), "DirectPlay") else null
        present(Uri.fromFile(file), entry.playerTitle, if (entry.position > 5) entry.position else 0.0, report, false, emptyMap(), null)
        offlineId = entry.id
        currentItemId = entry.id
        subtitles = entry.subtitles.mapNotNull { sub -> OfflineStore.subtitleFile(entry, sub.index)?.let { SubtitleChoice(sub.index, sub.label, it.absolutePath, null) } }
        selectSubtitle(subtitle ?: entry.subtitleChoice ?: -1)
    }

    // MARK: Présentation

    private fun buildPlayer(headers: Map<String, String>): ExoPlayer {
        val context = NoctraApplication.instance
        val network = OkHttpDataSource.Factory(Net.client).setDefaultRequestProperties(headers)
        val renderers = DefaultRenderersFactory(context).setEnableDecoderFallback(true)
        return ExoPlayer.Builder(context, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(context, network)))
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(30_000)
            .build()
    }

    private fun present(uri: Uri, heading: String, startSeconds: Double, report: PlaybackReport?, sync: Boolean, headers: Map<String, String>, mime: String?) {
        close(notify = false)
        val exo = buildPlayer(headers)
        val media = MediaItem.Builder().setUri(uri).apply { if (mime != null) setMimeType(mime) }
            .setMediaMetadata(MediaMetadata.Builder().setTitle(heading).build()).build()
        exo.setMediaItem(media)
        if (startSeconds > 5) {
            commandUntil = System.currentTimeMillis() + 2000
            exo.seekTo((startSeconds * 1000).toLong())
        }
        exo.playWhenReady = !sync
        exo.prepare()
        player = exo
        title = heading
        this.report = report
        syncMode = sync
        readyReported = false
        presented = true
        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_READY && !readyReported) {
                    readyReported = true
                    if (syncMode) SyncPlayManager.ready(positionSeconds, false)
                }
                if (state == Player.STATE_ENDED && !syncMode) close(notify = true)
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (!syncMode || System.currentTimeMillis() < commandUntil) return
                if (isPlaying) SyncPlayManager.requestUnpause() else if (exo.playbackState == Player.STATE_READY) SyncPlayManager.requestPause()
            }

            override fun onPlayerError(error: PlaybackException) {
                Notices.announce("Lecture impossible : ${error.errorCodeName.removePrefix("ERROR_CODE_").lowercase().replace('_', ' ')}")
            }
        })
        if (report != null) Session.scope.launch { send("/Sessions/Playing", report, startSeconds, sync) }
        progressJob = Session.scope.launch {
            var tick = 0
            lastSample = 0.0
            lastSampleAt = System.currentTimeMillis()
            while (isActive) {
                delay(1000)
                val current = player ?: break
                tick += 1
                val position = current.currentPosition / 1000.0
                if (tick % 10 == 0) this@PlaybackManager.report?.let { send("/Sessions/Playing/Progress", it, position, !current.isPlaying) }
                // Gestes de l'utilisateur dans le lecteur (avance) : transmis au groupe.
                if (syncMode) {
                    val now = System.currentTimeMillis()
                    val expected = lastSample + if (current.isPlaying) (now - lastSampleAt) / 1000.0 else 0.0
                    if (lastSample > 0 && abs(position - expected) > 3 && now > commandUntil) {
                        SyncPlayManager.requestSeek(position)
                        commandUntil = now + 2000
                    }
                    lastSample = position
                    lastSampleAt = now
                }
            }
        }
    }

    /** Fermeture du lecteur (bouton, fin du titre, groupe, autre appareil). */
    fun close(notify: Boolean = true) {
        val exo = player ?: run { presented = false; return }
        progressJob?.cancel()
        subtitleJob?.cancel()
        val position = exo.currentPosition / 1000.0
        val duration = exo.duration.takeIf { it > 0 }?.div(1000.0) ?: 0.0
        offlineId?.let { OfflineStore.recordPosition(it, position, duration) }
        offlineId = null
        exo.release()
        player = null
        presented = false
        subtitles = emptyList()
        cues = emptyList()
        subtitleText = ""
        subtitleStatus = null
        currentItemId = null
        syncMode = false
        val finished = report
        report = null
        if (finished != null) Session.scope.launch {
            send("/Sessions/Playing/Stopped", finished, position, false)
            if (finished.playMethod != "DirectPlay") runCatching { Session.data("DELETE", "/Videos/ActiveEncodings", mapOf("deviceId" to Session.deviceId, "playSessionId" to finished.playSessionId)) }
            endedCount += 1
        }
    }

    fun stop() = close(notify = false)

    private suspend fun send(path: String, report: PlaybackReport, position: Double, paused: Boolean) {
        val ticks = (maxOf(0.0, position) * 10_000_000).toLong()
        runCatching {
            Session.data("POST", path, json = mapOf("ItemId" to report.itemId, "MediaSourceId" to report.mediaSourceId, "PlaySessionId" to report.playSessionId,
                "PositionTicks" to ticks, "CanSeek" to true, "IsPaused" to paused, "PlayMethod" to report.playMethod))
        }
    }

    // MARK: Commandes (SyncPlay, autre appareil)

    fun commandPlay(position: Double?) {
        val exo = player ?: return
        commandUntil = System.currentTimeMillis() + 1500
        if (position != null) exo.seekTo((position * 1000).toLong())
        exo.play()
    }

    fun commandPause(position: Double?) {
        val exo = player ?: return
        commandUntil = System.currentTimeMillis() + 1500
        exo.pause()
        if (position != null) exo.seekTo((position * 1000).toLong())
    }

    fun commandSeek(position: Double, completion: (() -> Unit)? = null) {
        val exo = player ?: return
        commandUntil = System.currentTimeMillis() + 2500
        exo.pause()
        exo.seekTo((position * 1000).toLong())
        Session.scope.launch {
            // Prêt quand le lecteur a rechargé la position.
            repeat(40) {
                if (exo.playbackState == Player.STATE_READY) { completion?.invoke(); return@launch }
                delay(250)
            }
            completion?.invoke()
        }
    }

    fun commandToggle() {
        val exo = player ?: return
        if (exo.isPlaying) commandPause(null) else commandPlay(null)
    }
}

/**
 * Profil de l'appareil : formats lus directement par ExoPlayer selon les décodeurs
 * présents (HEVC, AV1, AC-3… varient d'un appareil à l'autre), sinon flux HLS.
 */
object DeviceProfile {
    private val decoders: Set<String> by lazy {
        runCatching {
            MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos.filter { !it.isEncoder }.flatMap { it.supportedTypes.map(String::lowercase) }.toSet()
        }.getOrDefault(emptySet())
    }

    private fun has(mime: String) = mime in decoders

    val videoCodecs: String by lazy {
        listOfNotNull("h264", if (has("video/hevc")) "hevc" else null, if (has("video/x-vnd.on2.vp9")) "vp9" else null,
            if (has("video/av01")) "av1" else null, if (has("video/mp4v-es")) "mpeg4" else null, if (has("video/mpeg2")) "mpeg2video" else null,
            if (has("video/x-vnd.on2.vp8")) "vp8" else null).joinToString(",")
    }

    val audioCodecs: String by lazy {
        listOfNotNull("aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le", "pcm_s24le", if (has("audio/ac3")) "ac3" else null,
            if (has("audio/eac3")) "eac3" else null, if (has("audio/vnd.dts") || has("audio/vnd.dts.hd")) "dts" else null,
            if (has("audio/true-hd")) "truehd" else null, if (has("audio/alac")) "alac" else null).joinToString(",")
    }

    private val transcodeVideo: String get() = if (has("video/hevc")) "h264,hevc" else "h264"
    private val transcodeAudio: String get() = listOfNotNull("aac", "mp3", if (has("audio/ac3")) "ac3" else null, if (has("audio/eac3")) "eac3" else null).joinToString(",")

    private fun profile(name: String, maxBitrate: Int, minSegments: Int): Map<String, Any?> = mapOf(
        "Name" to name,
        "MaxStreamingBitrate" to maxBitrate,
        "MaxStaticBitrate" to maxBitrate,
        "MusicStreamingTranscodingBitrate" to 384_000,
        "DirectPlayProfiles" to listOf(
            mapOf("Container" to "mp4,m4v,mkv,webm,mov,ts,mpegts,m2ts", "Type" to "Video", "VideoCodec" to videoCodecs, "AudioCodec" to audioCodecs),
            mapOf("Container" to "mp3,aac,m4a,flac,ogg,opus,wav", "Type" to "Audio")
        ),
        "TranscodingProfiles" to listOf(
            mapOf("Container" to "ts", "Type" to "Video", "VideoCodec" to transcodeVideo, "AudioCodec" to transcodeAudio, "Protocol" to "hls",
                "Context" to "Streaming", "MaxAudioChannels" to "6", "MinSegments" to minSegments, "BreakOnNonKeyFrames" to true),
            mapOf("Container" to "aac", "Type" to "Audio", "AudioCodec" to "aac", "Protocol" to "hls", "Context" to "Streaming")
        ),
        "ContainerProfiles" to emptyList<Any>(),
        "CodecProfiles" to emptyList<Any>(),
        // Texte : fichier à part (WebVTT), la vidéo reste en lecture directe. Image : incrustation par le serveur.
        "SubtitleProfiles" to listOf("vtt", "webvtt", "srt", "subrip", "ass", "ssa", "mov_text", "ttml", "smi", "sub").map { mapOf("Format" to it, "Method" to "External") } +
            listOf("pgssub", "pgs", "dvdsub", "dvbsub", "vobsub", "xsub").map { mapOf("Format" to it, "Method" to "Encode") }
    )

    val streaming: Map<String, Any?> by lazy { profile("Noctra Android", 120_000_000, 2) }
}

/** Piste de sous-titres affichable (texte). */
fun MediaStream.isText(): Boolean = type == "Subtitle" && isTextSubtitleStream && deliveryMethod != "Encode"
