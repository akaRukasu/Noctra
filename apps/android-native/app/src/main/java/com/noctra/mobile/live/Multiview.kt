package com.noctra.mobile.live

import android.graphics.Color as AndroidColor
import android.net.Uri
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.noctra.mobile.NoctraApplication
import com.noctra.mobile.cast.ChromecastBrowser
import com.noctra.mobile.cast.ChromecastController
import com.noctra.mobile.cast.ChromecastDevice
import com.noctra.mobile.cast.RemotePlayback
import com.noctra.mobile.core.Net
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.str
import com.noctra.mobile.play.ImmersiveEffect
import com.noctra.mobile.ui.BusyRow
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.SearchField
import com.noctra.mobile.ui.SettingGroup
import com.noctra.mobile.ui.SettingRow
import com.noctra.mobile.ui.SheetColumn
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.glass
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID
import kotlin.math.ceil

/**
 * Multiview : plusieurs chaînes de n'importe quelle source à l'écran, comme sur la version web et
 * Noctra TV. Une chaîne est écoutée, une peut être mise en avant, chacune passe seule au serveur
 * suivant quand son flux tombe. Diffusable vers Noctra TV ou un Chromecast (image composée par le
 * serveur Noctra), puis pilotable depuis le téléphone.
 */
object MultiviewStore {
    const val MAX_TILES = 9

    /** Chaînes choisies dans les listes (avant le lancement). */
    val picked = mutableStateListOf<LiveChannel>()
    /** Choix en cours : un appui sur une chaîne l'ajoute ou la retire. */
    var selecting by mutableStateOf(false)
    var presented by mutableStateOf(false)
        private set
    val tiles = mutableStateListOf<MultiviewTile>()
    var audio by mutableStateOf<String?>(null)
        private set
    var featured by mutableStateOf<String?>(null)
        private set
    /** Vignette en plein écran (les autres continuent en arrière-plan). */
    var zoomed by mutableStateOf<String?>(null)
        private set
    /** Chromecast qui reçoit le multiview composé par le serveur Noctra. */
    var castDevice by mutableStateOf<ChromecastDevice?>(null)
        private set
    var castNote by mutableStateOf<String?>(null)
        private set
    private var mosaicId: String? = null
    private var mosaicJob: Job? = null

    fun contains(channel: LiveChannel) = picked.any { it.id == channel.id }

    fun toggle(channel: LiveChannel) {
        val index = picked.indexOfFirst { it.id == channel.id }
        if (index >= 0) picked.removeAt(index) else if (picked.size < MAX_TILES) picked += channel
    }

    fun clear() { picked.clear(); selecting = false }

    /** Lancement : les chaînes démarrent l'une après l'autre (moins d'échecs au départ). */
    fun launch(present: Boolean = true) {
        if (picked.isEmpty()) return
        LivePlayerModel.close()
        stopAll()
        tiles.clear()
        tiles += picked.take(MAX_TILES).map { MultiviewTile(it) }
        audio = tiles.firstOrNull()?.id
        featured = null
        zoomed = null
        selecting = false
        presented = present
        tiles.forEachIndexed { index, tile -> tile.start(index * 400L) }
        applyAudio()
    }

    fun add(channel: LiveChannel) {
        if (tiles.size >= MAX_TILES || tiles.any { it.channel.id == channel.id }) return
        val tile = MultiviewTile(channel)
        tiles += tile
        if (picked.none { it.id == channel.id }) picked += channel
        tile.start(0)
        applyAudio()
        mosaicChanged()
    }

    fun remove(tile: MultiviewTile) {
        tile.stop()
        tiles.remove(tile)
        picked.removeAll { it.id == tile.channel.id }
        if (featured == tile.id) featured = null
        if (zoomed == tile.id) zoomed = null
        if (audio == tile.id) audio = tiles.firstOrNull()?.id
        if (tiles.isEmpty()) close() else { applyAudio(); mosaicChanged() }
    }

    fun listen(tile: MultiviewTile) { audio = tile.id; applyAudio(); mosaicChanged() }

    fun feature(tile: MultiviewTile) { zoomed = null; featured = if (featured == tile.id || tiles.size < 2) null else tile.id; mosaicChanged() }

    /** Chaîne mise en avant, et seule écoutée. */
    fun solo(tile: MultiviewTile) {
        audio = tile.id
        featured = if (tiles.size > 1) tile.id else null
        zoomed = null
        applyAudio()
        mosaicChanged()
    }

    fun grid() { featured = null; zoomed = null; mosaicChanged() }

    /** Plein écran d'une vignette, avec son son. */
    fun zoom(tile: MultiviewTile) {
        zoomed = if (zoomed == tile.id) null else tile.id
        if (zoomed != null) { audio = tile.id; applyAudio() }
        mosaicChanged()
    }

    /** Multiview démarré pour une diffusion : ouvert ensuite comme télécommande. */
    fun show() { if (tiles.isNotEmpty()) presented = true }

    fun close() {
        stopCasting()
        stopAll()
        tiles.clear()
        featured = null
        zoomed = null
        presented = false
    }

    private fun stopAll() = tiles.forEach { it.stop() }

    // Multiview diffusé : le son passe par le téléviseur, le téléphone reste muet.
    private fun applyAudio() = tiles.forEach { it.setVolume(if (castDevice == null && it.id == audio) 1f else 0f) }

    /** Diffusion sur un Chromecast ; le multiview démarre d'abord ici s'il ne l'est pas encore. */
    suspend fun cast(device: ChromecastDevice) {
        val address = prepareMosaic()
        ChromecastController.endLive()
        ChromecastController.castStream(address, "Multiview", tiles.joinToString(" · ") { it.channel.name }, null, device)
        castDevice = device
        castNote = null
        applyAudio()
    }

    fun stopCasting() {
        mosaicJob?.cancel()
        if (castDevice != null) ChromecastController.stop()
        castDevice = null
        castNote = null
        mosaicId?.let { id -> Session.scope.launch { runCatching { Session.noctraSend("DELETE", "/api/tv/mosaic/$id", null, 10.0) } } }
        mosaicId = null
        applyAudio()
    }

    /** Une vignette lit (de nouveau) : la mosaïque diffusée la reprend. */
    fun tilePlaying() = mosaicChanged()

    /** Serveur à jour et ffmpeg présent, multiview lancé si besoin, attente des chaînes qui lisent (45 s au plus). */
    private suspend fun prepareMosaic(): String {
        val check = runCatching { Session.noctraJSON("/api/tv/mosaic", 15.0).asMap() }.getOrNull()
            ?: throw IllegalStateException("Diffuser le multiview sur Chromecast nécessite le serveur Noctra 200.0.144.")
        if (check["available"] != true) throw IllegalStateException("ffmpeg est introuvable sur le serveur Noctra : il compose le multiview diffusé. Indiquez son chemin dans NOCTRA_FFMPEG.")
        // Lancé depuis la barre des chaînes : multiview démarré sans l'ouvrir sous la feuille de diffusion.
        if (tiles.isEmpty()) launch(present = false)
        val started = System.currentTimeMillis()
        while (System.currentTimeMillis() - started < 45_000) {
            val playing = tiles.count { it.playing }
            if (playing == tiles.size || (playing > 0 && System.currentTimeMillis() - started > 12_000)) break
            delay(500)
        }
        return requestMosaic(true)
    }

    /** Chaînes qui lisent, envoyées au serveur dans l'ordre affiché (adresse, en-têtes, son, mise en avant). */
    private suspend fun requestMosaic(wait: Boolean): String {
        val live = tiles.filter { it.playing && it.current?.streamURL != null }
        if (live.isEmpty()) throw IllegalStateException("Aucune chaîne du multiview ne lit encore : réessayez quand une image apparaît.")
        val list = live.map { tile ->
            val server = tile.current!!
            val stream = server.streamURL!!
            val uri = java.net.URI(stream)
            val address = if (Session.isNoctraOrigin(stream)) uri.rawPath + (uri.rawQuery?.let { "?$it" } ?: "") else stream
            mapOf("url" to address, "headers" to server.headers, "name" to tile.channel.name)
        }
        val main = zoomed ?: featured
        val body = mutableMapOf<String, Any?>(
            "tiles" to list,
            "audio" to live.indexOfFirst { it.id == audio }.coerceAtLeast(0),
            "featured" to live.indexOfFirst { it.id == main },
            "wait" to wait
        )
        mosaicId?.let { body["id"] = it }
        val json = Session.noctraSend("POST", "/api/tv/mosaic", body, 40.0).asMap()
        val id = json?.str("id")
        val cast = json?.str("cast")?.let { Session.noctraURL(it) }
        if (id == null || cast == null) error("Le serveur ne fournit pas le multiview diffusé.")
        mosaicId = id
        return cast
    }

    /** Changement pendant la diffusion : mosaïque mise à jour (même adresse, le Chromecast continue). */
    private fun mosaicChanged() {
        if (castDevice == null) return
        if (!ChromecastController.isActive) { stopCasting(); return }
        mosaicJob?.cancel()
        mosaicJob = Session.scope.launch {
            delay(1_200)
            runCatching { requestMosaic(false) }.onSuccess { castNote = null }.onFailure { castNote = it.message }
        }
    }

    /** Chaînes à diffuser : celles affichées, sinon celles choisies. */
    val castChannels: List<LiveChannel> get() = if (tiles.isEmpty()) picked.toList() else tiles.map { it.channel }
}

/** Vignette du multiview : une chaîne, son lecteur, ses serveurs essayés dans l'ordre. */
@OptIn(UnstableApi::class)
class MultiviewTile(val channel: LiveChannel) {
    val id: String = UUID.randomUUID().toString()
    var status by mutableStateOf<String?>("Recherche des serveurs…")
        private set
    var count by mutableIntStateOf(0)
        private set
    var player by mutableStateOf<ExoPlayer?>(null)
        private set
    /** Serveur en cours et lecture effective (pour la mosaïque diffusée). */
    var current by mutableStateOf<LiveServer?>(null)
        private set
    var playing by mutableStateOf(false)
        private set
    /** Lecteur du site dans la vignette (sinon : ExoPlayer). */
    var web by mutableStateOf<WebPlayerRequest?>(null)
        private set
    var webView: android.webkit.WebView? = null
    val muted: Boolean get() = volume == 0f
    /** Page du site affichée en entier (sinon : vidéo seule, le reste du site masqué). */
    var fullPage by mutableStateOf(false)
        private set
    private var servers: MutableList<LiveServer> = mutableListOf()
    private var index = -1
    private var generation = 0
    private var job: Job? = null
    private var rounds = 0
    private var volume = 0f
    private var listener: Player.Listener? = null

    fun start(delayMs: Long) {
        generation += 1
        val token = generation
        job?.cancel()
        job = Session.scope.launch {
            if (delayMs > 0) delay(delayMs)
            val prepared = LiveLauncher.prepare(channel)
            if (token != generation) return@launch
            // Flux directs (HLS ou MPEG-TS) et serveurs automatiques d'abord, puis les lecteurs des sites :
            // une chaîne sans flux direct passe quand même dans le multiview.
            servers = ordered(prepared).toMutableList()
            count = servers.size
            index = -1
            next()
        }
    }

    /** Vidéo seule ou page entière du site (tous ses cadres). */
    fun showFullPage(value: Boolean) {
        fullPage = value
        webView?.evaluateJavascript("window.__noctraFocus&&window.__noctraFocus(${!value})", null)
    }

    fun setVolume(value: Float) {
        volume = value
        player?.volume = value
        // Lecteur du site : vidéos de la page (tous ses cadres).
        webView?.evaluateJavascript("window.__noctraMute&&window.__noctraMute(${value == 0f})", null)
    }

    /** Serveurs lisibles dans une vignette, dans l'ordre d'essai. */
    private fun ordered(list: List<LiveServer>): List<LiveServer> {
        val direct = list.filter { (it.kind == LiveServer.Kind.native && it.streamURL != null) || it.kind == LiveServer.Kind.resolve }
        val pages = list.filter { it.kind == LiveServer.Kind.web && (it.pageURL != null || it.relayPrepare != null) }
        return direct + pages
    }

    /** Lecteur du site (page) dans la vignette. */
    private fun playWeb(server: LiveServer, token: Int) {
        player?.stop()
        current = server
        status = "Connexion · ${server.label}…"
        val prepare = server.relayPrepare
        if (prepare != null && server.pageURL == null) {
            // Relais officiel (LiveWatch VIP) : page préparée par le serveur Noctra.
            job = Session.scope.launch {
                val json = runCatching { Session.noctraJSON(prepare, 20.0).asMap() }.getOrNull()
                if (token != generation) return@launch
                val url = json?.str("embedUrl")?.let { Session.noctraURL(it) }
                if (url == null) { next(); return@launch }
                playWeb(server.copy(pageURL = url), token)
            }
            return
        }
        val url = server.pageURL ?: run { next(); return }
        web = WebPlayerRequest(title = channel.name, mode = WebPlayerRequest.Mode.page, url = url, framed = server.framed, sandbox = server.sandbox)
        fullPage = false
        job = Session.scope.launch {
            delay(40_000)
            // Lecture non signalée : la page reste affichée (bouton Lecture à toucher).
            if (token == generation && !playing) status = null
        }
    }

    /** Événements de la page de la vignette : vidéo lancée, erreur. */
    fun webEvent(request: String, state: String) {
        val server = current ?: return
        if (request != web?.id) return
        when (state) {
            "playing", "ready" -> if (!playing) {
                playing = true
                rounds = 0
                status = null
                setVolume(volume)
                LiveHealth.record(server, channel.id, true)
                MultiviewStore.tilePlaying()
            }
            "error" -> if (!playing) {
                LiveHealth.record(server, channel.id, false)
                status = "Serveur indisponible · essai du suivant…"
                next()
            }
        }
    }

    fun stop() {
        generation += 1
        job?.cancel()
        job = null
        playing = false
        web = null
        webView = null
        player?.release()
        player = null
    }

    /** Serveur suivant (choix manuel ou flux tombé) ; nouvel essai de toute la liste ensuite. */
    fun next() {
        playing = false
        if (servers.isEmpty()) { status = "Aucun serveur pour le multiview"; return }
        index += 1
        generation += 1
        val token = generation
        job?.cancel()
        if (index >= servers.size) {
            index = -1
            rounds += 1
            if (rounds > 3) { status = "Flux indisponible · touchez pour réessayer"; return }
            status = "Flux indisponible · nouvel essai dans 20 s"
            job = Session.scope.launch { delay(20_000); if (token == generation) next() }
            return
        }
        val candidate = servers[index]
        if (candidate.kind == LiveServer.Kind.resolve) {
            status = "Connexion à ${candidate.label}…"
            job = Session.scope.launch {
                val found = LiveServerFactory.resolve(candidate, if (candidate.vip) 60.0 else 30.0)
                if (token != generation) return@launch
                servers.removeAt(index)
                servers.addAll(index, ordered(found).filter { it.kind != LiveServer.Kind.resolve })
                count = servers.size
                index -= 1
                next()
            }
            return
        }
        if (candidate.kind == LiveServer.Kind.web) { playWeb(candidate, token); return }
        play(candidate, token)
    }

    fun retry() { rounds = 0; index = -1; next() }

    private fun exo(): ExoPlayer {
        player?.let { return it }
        val app = NoctraApplication.instance
        // Sans prise du focus audio : le son ne va qu'à la vignette écoutée (volume 1, les autres 0).
        val exo = ExoPlayer.Builder(app, DefaultRenderersFactory(app).setEnableDecoderFallback(true))
            .setAudioAttributes(androidx.media3.common.AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), false)
            .build()
        // Vignette : définition réduite (moins de débit et de décodage pour plusieurs chaînes).
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon().setMaxVideoSize(1280, 720).build()
        exo.volume = volume
        player = exo
        return exo
    }

    private fun play(server: LiveServer, token: Int) {
        val url = server.streamURL ?: run { next(); return }
        web = null
        current = server
        status = "Connexion · ${server.label}…"
        val exo = exo()
        exo.stop()
        listener?.let { exo.removeListener(it) }
        var failed: String? = null
        val watcher = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) { failed = error.errorCodeName }
        }
        listener = watcher
        exo.addListener(watcher)
        val network = OkHttpDataSource.Factory(Net.client).setDefaultRequestProperties(server.headers + Session.noctraHeaders(url))
        val extractors = DefaultExtractorsFactory().setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES or DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS)
        val factory = DefaultMediaSourceFactory(DefaultDataSource.Factory(NoctraApplication.instance, network), extractors)
        val item = MediaItem.Builder().setUri(Uri.parse(url))
            .apply { if (server.mpegts || server.format == LiveServer.Format.ts) setMimeType(MimeTypes.VIDEO_MP2T) else if (server.format != LiveServer.Format.file) setMimeType(MimeTypes.APPLICATION_M3U8) }
            .setLiveConfiguration(MediaItem.LiveConfiguration.Builder().setTargetOffsetMs(8000).build())
            .build()
        exo.setMediaSource(factory.createMediaSource(item))
        exo.prepare()
        exo.playWhenReady = true
        job = Session.scope.launch {
            val started = System.currentTimeMillis()
            var ready = false
            var waitingSince: Long? = null
            while (isActive && token == generation) {
                delay(500)
                if (failed != null) {
                    LiveHealth.record(server, channel.id, false)
                    status = "Serveur indisponible · essai du suivant…"
                    next()
                    return@launch
                }
                if (!ready) {
                    if (exo.playbackState == Player.STATE_READY && exo.isPlaying) {
                        ready = true
                        rounds = 0
                        status = null
                        playing = true
                        LiveHealth.record(server, channel.id, true)
                        MultiviewStore.tilePlaying()
                    } else if (System.currentTimeMillis() - started > if (server.vip) 30_000 else 20_000) {
                        LiveHealth.record(server, channel.id, false)
                        status = "Serveur trop lent · essai du suivant…"
                        next()
                        return@launch
                    }
                } else if (exo.playbackState == Player.STATE_BUFFERING) {
                    val since = waitingSince ?: System.currentTimeMillis().also { waitingSince = it }
                    if (System.currentTimeMillis() - since > 15_000) {
                        status = "Coupure · serveur suivant…"
                        next()
                        return@launch
                    }
                } else waitingSince = null
            }
        }
    }
}

private data class TileFrame(val x: Dp, val y: Dp, val width: Dp, val height: Dp)

/** Grille (1, 2, 2 × 2, 3 × 3…) ou chaîne mise en avant : grande à gauche (paysage) ou en haut (portrait). */
private fun multiviewLayout(width: Dp, height: Dp): List<TileFrame> {
    val tiles = MultiviewStore.tiles
    val count = tiles.size
    if (count == 0) return emptyList()
    val gap = 4.dp
    val landscape = width > height
    val zoomed = tiles.indexOfFirst { it.id == MultiviewStore.zoomed }
    if (zoomed >= 0) return (0 until count).map { if (it == zoomed) TileFrame(0.dp, 0.dp, width, height) else TileFrame(0.dp, 0.dp, 0.dp, 0.dp) }
    val main = tiles.indexOfFirst { it.id == MultiviewStore.featured }
    if (main >= 0 && count > 1) {
        val frames = MutableList(count) { TileFrame(0.dp, 0.dp, 0.dp, 0.dp) }
        val others = (0 until count).filter { it != main }
        if (landscape) {
            val mainWidth = width * 0.7f
            frames[main] = TileFrame(0.dp, 0.dp, mainWidth - gap, height)
            val columns = if (others.size > 4) 2 else 1
            val rows = ceil(others.size / columns.toDouble()).toInt().coerceAtLeast(1)
            val cellW = (width - mainWidth) / columns
            val cellH = height / rows
            others.forEachIndexed { position, index -> frames[index] = TileFrame(mainWidth + cellW * (position % columns), cellH * (position / columns), cellW - gap, cellH - gap) }
        } else {
            val mainHeight = minOf(width * 9f / 16f, height * 0.5f)
            val columns = if (others.size > 4) 3 else 2
            val rows = ceil(others.size / columns.toDouble()).toInt()
            val cellW = width / columns
            val cellH = cellW * 9f / 16f
            // Ensemble centré verticalement, comme la grille (pas de grand vide en bas).
            val top = maxOf(0.dp, (height - mainHeight - gap - cellH * rows) / 2)
            frames[main] = TileFrame(0.dp, top, width, mainHeight)
            others.forEachIndexed { position, index ->
                val row = position / columns
                val inRow = if (row == rows - 1) others.size - row * columns else columns
                val shift = cellW * (columns - inRow) / 2
                frames[index] = TileFrame(shift + cellW * (position % columns), top + mainHeight + gap + cellH * row, cellW - gap, cellH - gap)
            }
        }
        return frames
    }
    val columns = if (landscape) (if (count <= 1) 1 else if (count <= 4) 2 else 3) else (if (count <= 2) 1 else if (count <= 6) 2 else 3)
    val rows = ceil(count / columns.toDouble()).toInt()
    val cellW = width / columns
    val cellH = minOf(height / rows, cellW * 9f / 16f + gap)
    val top = maxOf(0.dp, (height - cellH * rows) / 2)
    return (0 until count).map { index ->
        val row = index / columns
        val inRow = if (row == rows - 1) count - row * columns else columns
        val shift = cellW * (columns - inRow) / 2
        TileFrame(shift + cellW * (index % columns), top + cellH * row, cellW - gap, cellH - gap)
    }
}

/** Écran du multiview, au-dessus de tout. */
@Composable
fun MultiviewScreen() {
    var menu by remember { mutableStateOf<MultiviewTile?>(null) }
    var adding by remember { mutableStateOf(false) }
    var casting by remember { mutableStateOf(false) }
    ImmersiveEffect()
    // Retour : quitte d'abord le plein écran d'une vignette, puis le multiview.
    BackHandler { if (MultiviewStore.zoomed != null) MultiviewStore.grid() else MultiviewStore.close() }
    // Écran plein : les touches ne passent pas aux onglets en dessous.
    Box(Modifier.fillMaxSize().background(Color.Black).pointerInput(Unit) { detectTapGestures { } }) {
        BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding().padding(top = 52.dp)) {
            val frames = multiviewLayout(maxWidth, maxHeight)
            MultiviewStore.tiles.forEachIndexed { index, tile ->
                val frame = frames.getOrNull(index) ?: return@forEachIndexed
                androidx.compose.runtime.key(tile.id) {
                    // Vignette masquée (une autre en plein écran) : elle continue sans prendre de place.
                    val hidden = frame.width == 0.dp
                    val base = Modifier.offset(frame.x, frame.y).size(if (hidden) 1.dp else frame.width, if (hidden) 1.dp else frame.height).alpha(if (hidden) 0f else 1f)
                    // Lecteur de site : les touches vont à la page (bouton Lecture) ; menu par le bouton « ⋯ ».
                    MultiviewTileView(tile, if (tile.web != null) base else base.pointerInput(tile.id, hidden) { if (!hidden) detectTapGestures(onDoubleTap = { MultiviewStore.zoom(tile) }, onTap = { menu = tile }) },
                        onMenu = { menu = tile })
                }
            }
        }
        Row(
            Modifier.align(Alignment.TopCenter).safeDrawingPadding().padding(horizontal = 10.dp, vertical = 4.dp).fillMaxWidth()
                .glass(CircleShape, Color(0x99000000)).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = { MultiviewStore.close() }) { Icon(Icons.Filled.Close, "Fermer le multiview", tint = Color.White) }
            Column(Modifier.weight(1f)) {
                Text("Multiview · ${MultiviewStore.tiles.size}/${MultiviewStore.MAX_TILES}", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                MultiviewStore.castDevice?.let { Text("Diffusé sur ${it.name}", color = Theme.teal, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1) }
            }
            if (MultiviewStore.featured != null || MultiviewStore.zoomed != null) IconButton(onClick = { MultiviewStore.grid() }) { Icon(Icons.Filled.GridView, "Revenir à la grille", tint = Color.White) }
            if (MultiviewStore.tiles.size < MultiviewStore.MAX_TILES) IconButton(onClick = { adding = true }) { Icon(Icons.Filled.Add, "Ajouter une chaîne", tint = Color.White) }
            IconButton(onClick = { casting = true }) {
                Icon(Icons.Filled.Tv, MultiviewStore.castDevice?.let { "Diffusé sur ${it.name}" } ?: "Diffuser le multiview sur un téléviseur", tint = if (MultiviewStore.castDevice != null) Theme.teal else Color.White)
            }
        }
    }
    menu?.let { tile ->
        NoctraSheet({ menu = null }, full = false) {
            SheetColumn(tile.channel.name) {
                SettingGroup {
                    SettingRow(if (MultiviewStore.zoomed == tile.id) "Quitter le plein écran" else "Plein écran", onClick = { MultiviewStore.zoom(tile); menu = null })
                    if (MultiviewStore.audio != tile.id) SettingRow("Écouter cette chaîne", onClick = { MultiviewStore.listen(tile); menu = null })
                    if (MultiviewStore.tiles.size > 1) {
                        SettingRow("Mettre en avant avec le son", onClick = { MultiviewStore.solo(tile); menu = null })
                        SettingRow(if (MultiviewStore.featured == tile.id) "Revenir à la grille" else "Mettre en avant", onClick = { MultiviewStore.feature(tile); menu = null })
                    }
                    if (tile.web != null) SettingRow(if (tile.fullPage) "Vidéo seule (masquer le site)" else "Afficher toute la page du site", onClick = { tile.showFullPage(!tile.fullPage); menu = null })
                    if (tile.count > 1) SettingRow("Serveur suivant (${tile.count})", onClick = { tile.next(); menu = null })
                    if (tile.status?.contains("réessayer") == true) SettingRow("Réessayer", onClick = { tile.retry(); menu = null })
                    SettingRow("Retirer cette chaîne", tint = Theme.orange, onClick = { MultiviewStore.remove(tile); menu = null })
                }
            }
        }
    }
    if (adding) MultiviewAddSheet({ adding = false }) { MultiviewStore.add(it) }
    if (casting) MultiviewCastSheet(MultiviewStore.castChannels) { casting = false }
}

@OptIn(UnstableApi::class)
@Composable
private fun MultiviewTileView(tile: MultiviewTile, modifier: Modifier, onMenu: () -> Unit = {}) {
    val listening = MultiviewStore.audio == tile.id
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier.clip(shape).background(Color.Black).border(if (listening) 2.dp else 1.dp, if (listening) Theme.teal else Color.White.copy(alpha = 0.1f), shape)
            .semantics { contentDescription = tile.channel.name + if (listening) ", écoutée" else "" },
        contentAlignment = Alignment.Center
    ) {
        val web = tile.web
        if (web != null) {
            androidx.compose.runtime.key(web.id) {
                LiveWebView(web, Modifier.fillMaxSize(), onEvent = { state, _, _ -> tile.webEvent(web.id, state) }, onCreate = { tile.webView = it }, muted = tile.muted)
            }
        } else AndroidView(
            factory = { context ->
                PlayerView(context).apply {
                    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    useController = false
                    keepScreenOn = true
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    setShutterBackgroundColor(AndroidColor.BLACK)
                    setKeepContentOnPlayerReset(true)
                    isFocusable = false
                    player = tile.player
                }
            },
            update = { view -> if (view.player !== tile.player) view.player = tile.player },
            modifier = Modifier.fillMaxSize()
        )
        if (web != null) {
            Box(
                Modifier.align(Alignment.TopEnd).padding(6.dp).size(30.dp).clip(CircleShape).background(Color(0x99000000)).clickable(onClick = onMenu)
                    .semantics { contentDescription = "Options de ${tile.channel.name}" },
                contentAlignment = Alignment.Center
            ) { Text("⋯", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp) }
        }
        tile.status?.let { status ->
            Column(Modifier.background(Color(0x8C000000), RoundedCornerShape(10.dp)).padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (!status.contains("indisponible") && !status.contains("Aucun")) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                Text(status, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            }
        }
        Row(
            Modifier.align(Alignment.BottomStart).padding(6.dp).background(Color(0x99000000), CircleShape).padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            if (listening) Icon(Icons.Filled.VolumeUp, null, tint = Color.White, modifier = Modifier.size(12.dp))
            Text(tile.channel.name, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Chaîne à ajouter : toutes les chaînes et tous les matchs, de toutes les sources. */
@Composable
fun MultiviewAddSheet(onDismiss: () -> Unit, onPick: (LiveChannel) -> Unit) {
    var query by remember { mutableStateOf("") }
    val results = remember(query, LiveStore.channels, LiveStore.events) {
        val term = query.trim()
        val all = LiveStore.recents.mapNotNull { key -> LiveStore.channels.firstOrNull { it.id == key } } + LiveStore.events + LiveStore.channels
        val seen = HashSet<String>()
        all.filter { seen.add(it.id) }.filter { term.isEmpty() || it.name.contains(term, ignoreCase = true) }.take(200)
    }
    NoctraSheet(onDismiss) {
        Column(Modifier.fillMaxWidth()) {
            Text("Ajouter une chaîne", style = Theme.display(20), color = Theme.ink, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            SearchField(query, "Chaîne ou match", Modifier.padding(horizontal = 16.dp)) { query = it }
            LazyColumn(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                items(results, key = { it.id }) { channel ->
                    Column(Modifier.fillMaxWidth().clickable { onPick(channel); onDismiss() }.padding(horizontal = 20.dp, vertical = 10.dp)) {
                        Text(channel.name, color = Theme.ink, fontSize = 15.sp)
                        Text("${channel.entries.size} serveur${if (channel.entries.size > 1) "s" else ""}" + (channel.group?.let { " · $it" } ?: ""), color = Theme.muted, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

/**
 * Diffusion du multiview sur n'importe quel téléviseur : un Chromecast reçoit l'image composée par le
 * serveur Noctra ; Noctra TV (Android TV, LG, Samsung) affiche les chaînes lui-même. Dans tous les cas,
 * le téléphone pilote ensuite : ajouter, retirer, mettre en avant, choisir le son.
 */
@Composable
fun MultiviewCastSheet(channels: List<LiveChannel>, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { ChromecastBrowser.start(); RemotePlayback.refresh() }
    fun startCast(message: String, action: suspend () -> Unit) {
        busy = message
        error = null
        scope.launch {
            runCatching { action() }
                .onSuccess {
                    onDismiss()
                    // Multiview démarré pour la diffusion : il s'ouvre ensuite comme télécommande.
                    MultiviewStore.show()
                }
                .onFailure {
                    error = it.message
                    // Diffusion impossible : le multiview démarré en arrière-plan pour elle s'arrête.
                    if (!MultiviewStore.presented && MultiviewStore.tiles.isNotEmpty()) MultiviewStore.close()
                }
            busy = null
        }
    }
    NoctraSheet(onDismiss) {
        SheetColumn("Diffuser le multiview") {
            MultiviewStore.castDevice?.let { device ->
                SettingGroup(footer = "Les changements faits ici (chaîne ajoutée, retirée, mise en avant, son) arrivent sur le téléviseur en quelques secondes.") {
                    SettingRow("Diffusé sur ${device.name}", icon = Icons.Filled.Cast, tint = Theme.teal)
                    SettingRow("Arrêter la diffusion", tint = Theme.orange, onClick = { MultiviewStore.stopCasting() })
                }
            }
            SettingGroup("Chromecast et Google TV") {
                if (ChromecastBrowser.devices.isEmpty()) SettingRow("Recherche sur le Wi-Fi…")
                ChromecastBrowser.devices.forEach { device ->
                    SettingRow(device.name, icon = Icons.Filled.Cast, onClick = if (busy != null) null else ({
                        startCast("Préparation du multiview pour ${device.name}…") { MultiviewStore.cast(device) }
                    }))
                }
            }
            SettingGroup("Noctra TV", footer = "Le Chromecast reçoit les ${channels.size} chaînes en une seule image, composée par le serveur Noctra. Noctra TV les affiche lui-même.") {
                val targets = RemotePlayback.devices.filter { it.custom }
                if (targets.isEmpty()) SettingRow("Ouvrez la version à jour de Noctra TV avec le même compte.")
                targets.forEach { target ->
                    SettingRow(target.name, value = target.title, icon = Icons.Filled.Tv, onClick = if (busy != null) null else ({
                        startCast("Envoi au téléviseur…") {
                            RemotePlayback.castMultiview(channels, target)
                            MultiviewStore.close()
                            MultiviewStore.clear()
                        }
                    }))
                }
            }
            busy?.let { BusyRow(it) }
            error?.let { Text(it, color = Theme.orange, modifier = Modifier.padding(24.dp)) }
            MultiviewStore.castNote?.let { Text(it, color = Theme.orange, modifier = Modifier.padding(horizontal = 24.dp)) }
        }
    }
}

/** Barre du multiview sous les listes de chaînes : chaînes choisies, lancer, diffuser. */
@Composable
fun MultiviewBar(modifier: Modifier = Modifier) {
    if (!MultiviewStore.selecting && MultiviewStore.picked.isEmpty()) return
    var casting by remember { mutableStateOf(false) }
    Row(
        modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).glass(RoundedCornerShape(22.dp), Color(0xE60E1326)).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Column(Modifier.weight(1f)) {
            Text("Multiview · ${MultiviewStore.picked.size}/${MultiviewStore.MAX_TILES}", color = Theme.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text(if (MultiviewStore.picked.isEmpty()) "Touchez les chaînes à afficher" else MultiviewStore.picked.joinToString(", ") { it.name },
                color = Theme.muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        IconButton(onClick = { casting = true }, enabled = MultiviewStore.picked.isNotEmpty()) { Icon(Icons.Filled.Tv, "Diffuser le multiview", tint = Theme.ink) }
        Button(onClick = { MultiviewStore.launch() }, enabled = MultiviewStore.picked.isNotEmpty(), colors = ButtonDefaults.buttonColors(containerColor = Theme.teal, contentColor = Color.Black)) { Text("Lancer") }
        IconButton(onClick = { MultiviewStore.clear() }) { Icon(Icons.Filled.Close, "Quitter le choix du multiview", tint = Theme.muted) }
    }
    if (casting) MultiviewCastSheet(MultiviewStore.castChannels) { casting = false }
}
