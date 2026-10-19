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
import com.noctra.mobile.cast.RemotePlayback
import com.noctra.mobile.core.Net
import com.noctra.mobile.core.Session
import com.noctra.mobile.play.ImmersiveEffect
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
 * suivant quand son flux tombe. Diffusable vers Noctra TV, puis pilotable depuis le téléphone.
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

    fun contains(channel: LiveChannel) = picked.any { it.id == channel.id }

    fun toggle(channel: LiveChannel) {
        val index = picked.indexOfFirst { it.id == channel.id }
        if (index >= 0) picked.removeAt(index) else if (picked.size < MAX_TILES) picked += channel
    }

    fun clear() { picked.clear(); selecting = false }

    /** Lancement : les chaînes démarrent l'une après l'autre (moins d'échecs au départ). */
    fun launch() {
        if (picked.isEmpty()) return
        LivePlayerModel.close()
        stopAll()
        tiles.clear()
        tiles += picked.take(MAX_TILES).map { MultiviewTile(it) }
        audio = tiles.firstOrNull()?.id
        featured = null
        zoomed = null
        selecting = false
        presented = true
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
    }

    fun remove(tile: MultiviewTile) {
        tile.stop()
        tiles.remove(tile)
        picked.removeAll { it.id == tile.channel.id }
        if (featured == tile.id) featured = null
        if (zoomed == tile.id) zoomed = null
        if (audio == tile.id) audio = tiles.firstOrNull()?.id
        if (tiles.isEmpty()) close() else applyAudio()
    }

    fun listen(tile: MultiviewTile) { audio = tile.id; applyAudio() }

    fun feature(tile: MultiviewTile) { zoomed = null; featured = if (featured == tile.id || tiles.size < 2) null else tile.id }

    /** Chaîne mise en avant, et seule écoutée. */
    fun solo(tile: MultiviewTile) {
        audio = tile.id
        featured = if (tiles.size > 1) tile.id else null
        zoomed = null
        applyAudio()
    }

    fun grid() { featured = null; zoomed = null }

    /** Plein écran d'une vignette, avec son son. */
    fun zoom(tile: MultiviewTile) {
        zoomed = if (zoomed == tile.id) null else tile.id
        if (zoomed != null) { audio = tile.id; applyAudio() }
    }

    fun close() {
        stopAll()
        tiles.clear()
        featured = null
        zoomed = null
        presented = false
    }

    private fun stopAll() = tiles.forEach { it.stop() }

    private fun applyAudio() = tiles.forEach { it.setVolume(if (it.id == audio) 1f else 0f) }

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
            // Lecteur natif seulement : flux directs (HLS ou MPEG-TS) et serveurs automatiques.
            servers = prepared.filter { (it.kind == LiveServer.Kind.native && it.streamURL != null) || it.kind == LiveServer.Kind.resolve }.toMutableList()
            count = servers.size
            index = -1
            next()
        }
    }

    fun setVolume(value: Float) { volume = value; player?.volume = value }

    fun stop() {
        generation += 1
        job?.cancel()
        job = null
        player?.release()
        player = null
    }

    /** Serveur suivant (choix manuel ou flux tombé) ; nouvel essai de toute la liste ensuite. */
    fun next() {
        if (servers.isEmpty()) { status = "Aucun flux direct pour le multiview"; return }
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
                servers.addAll(index, found.filter { it.kind == LiveServer.Kind.native && it.streamURL != null })
                count = servers.size
                index -= 1
                next()
            }
            return
        }
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
        status = "Connexion…"
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
                        LiveHealth.record(server, channel.id, true)
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
            frames[main] = TileFrame(0.dp, 0.dp, width, mainHeight)
            val columns = if (others.size > 4) 3 else 2
            val cellW = width / columns
            val cellH = cellW * 9f / 16f
            others.forEachIndexed { position, index -> frames[index] = TileFrame(cellW * (position % columns), mainHeight + gap + cellH * (position / columns), cellW - gap, cellH - gap) }
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
                    MultiviewTileView(tile, Modifier.offset(frame.x, frame.y).size(if (hidden) 1.dp else frame.width, if (hidden) 1.dp else frame.height)
                        .alpha(if (hidden) 0f else 1f)
                        .pointerInput(tile.id, hidden) { if (!hidden) detectTapGestures(onDoubleTap = { MultiviewStore.zoom(tile) }, onTap = { menu = tile }) })
                }
            }
        }
        Row(
            Modifier.align(Alignment.TopCenter).safeDrawingPadding().padding(horizontal = 10.dp, vertical = 4.dp).fillMaxWidth()
                .glass(CircleShape, Color(0x99000000)).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = { MultiviewStore.close() }) { Icon(Icons.Filled.Close, "Fermer le multiview", tint = Color.White) }
            Text("Multiview · ${MultiviewStore.tiles.size}/${MultiviewStore.MAX_TILES}", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.weight(1f))
            if (MultiviewStore.featured != null || MultiviewStore.zoomed != null) IconButton(onClick = { MultiviewStore.grid() }) { Icon(Icons.Filled.GridView, "Revenir à la grille", tint = Color.White) }
            if (MultiviewStore.tiles.size < MultiviewStore.MAX_TILES) IconButton(onClick = { adding = true }) { Icon(Icons.Filled.Add, "Ajouter une chaîne", tint = Color.White) }
            IconButton(onClick = { casting = true }) { Icon(Icons.Filled.Tv, "Diffuser le multiview sur un téléviseur", tint = Color.White) }
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
private fun MultiviewTileView(tile: MultiviewTile, modifier: Modifier) {
    val listening = MultiviewStore.audio == tile.id
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier.clip(shape).background(Color.Black).border(if (listening) 2.dp else 1.dp, if (listening) Theme.teal else Color.White.copy(alpha = 0.1f), shape)
            .semantics { contentDescription = tile.channel.name + if (listening) ", écoutée" else "" },
        contentAlignment = Alignment.Center
    ) {
        AndroidView(
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

/** Diffusion du multiview : Noctra TV (Android TV, LG, Samsung) le reçoit et se pilote ensuite d'ici. */
@Composable
fun MultiviewCastSheet(channels: List<LiveChannel>, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { RemotePlayback.refresh() }
    NoctraSheet(onDismiss) {
        SheetColumn("Diffuser le multiview") {
            SettingGroup("Noctra TV", footer = "Le téléviseur affiche les ${channels.size} chaînes. Depuis le téléphone : ajouter ou retirer une chaîne, en mettre une en avant et n’écouter qu’elle. Chromecast ne lit qu’une chaîne à la fois.") {
                val targets = RemotePlayback.devices.filter { it.custom }
                if (targets.isEmpty()) SettingRow("Ouvrez la version à jour de Noctra TV avec le même compte.")
                targets.forEach { target ->
                    SettingRow(target.name, value = target.title, icon = Icons.Filled.Tv, onClick = if (busy) null else ({
                        busy = true
                        scope.launch {
                            runCatching { RemotePlayback.castMultiview(channels, target) }
                                .onSuccess { MultiviewStore.close(); MultiviewStore.clear(); onDismiss() }
                                .onFailure { error = it.message }
                            busy = false
                        }
                    }))
                }
            }
            if (busy) CircularProgressIndicator(modifier = Modifier.padding(24.dp), color = Theme.accent)
            error?.let { Text(it, color = Theme.orange, modifier = Modifier.padding(24.dp)) }
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
