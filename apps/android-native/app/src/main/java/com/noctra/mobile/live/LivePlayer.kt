package com.noctra.mobile.live

import android.net.Uri
import android.webkit.WebView
import androidx.annotation.OptIn
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
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
import com.noctra.mobile.NoctraApplication
import com.noctra.mobile.core.Net
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.str
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID

/** Lecteur web : moteur web de l'appli (flux MPEG-TS ou HLS) ou page d'un site. */
data class WebPlayerRequest(val id: String = UUID.randomUUID().toString(), val title: String, val mode: Mode, val url: String) {
    enum class Mode { mpegts, hls, page }
    val isEngine: Boolean get() = mode != Mode.page
}

/**
 * Lecteur de la TV en direct. Chaque serveur est lu par le moteur qui lui
 * convient : ExoPlayer (HLS et MPEG-TS continu, comme Northlive) ou moteur web
 * (hls.js, mpegts.js), avec passage de l'un à l'autre quand un flux est refusé,
 * mémorisé par fournisseur. Lecteurs des sites dans un lecteur web qui signale
 * lecture et erreurs. Chaînes et serveurs changeables sans quitter le lecteur ;
 * serveur suivant (ou nouveau lien du même serveur) en cas de coupure.
 */
@OptIn(UnstableApi::class)
object LivePlayerModel {
    var presented by mutableStateOf(false)
        private set
    var channel by mutableStateOf<LiveChannel?>(null)
        private set
    var context by mutableStateOf<List<LiveChannel>>(emptyList())
        private set
    var servers by mutableStateOf<List<LiveServer>>(emptyList())
        private set
    var current by mutableStateOf<LiveServer?>(null)
        private set
    var web by mutableStateOf<WebPlayerRequest?>(null)
        private set
    var status by mutableStateOf<String?>(null)
        private set
    var loading by mutableStateOf(false)
        private set
    var paused by mutableStateOf(false)
        private set
    var expanding by mutableIntStateOf(0)
        private set
    var probing by mutableIntStateOf(0)
        private set
    /** Aucun serveur n'a pu lire : la liste des serveurs s'ouvre. */
    var askServer by mutableStateOf(false)
    var player by mutableStateOf<ExoPlayer?>(null)
        private set
    var webView: WebView? = null

    private val tried = mutableSetOf<String>()
    private val engines = mutableMapOf<String, MutableSet<Boolean>>()
    private val played = mutableSetOf<String>()
    private val renewed = mutableSetOf<String>()
    private var watch: Job? = null
    private var refresh: Job? = null
    private var stalls = 0
    private var readyAt: Long? = null
    private var generation = 0
    private var webPlaying = false
    private var listener: Player.Listener? = null

    val position: Int? get() = channel?.let { current -> context.indexOfFirst { it.id == current.id }.takeIf { it >= 0 } }
    val engineMode: Boolean get() = web?.isEngine == true
    private val failing = setOf(LiveServer.Probe.down, LiveServer.Probe.noVideo, LiveServer.Probe.stale)

    // MARK: Lancement

    fun start(channel: LiveChannel, servers: List<LiveServer>, first: LiveServer, context: List<LiveChannel>) {
        this.channel = channel
        this.context = if (context.any { it.id == channel.id }) context else listOf(channel) + context
        this.servers = servers
        reset()
        presented = true
        play(first)
        expandAndProbe()
    }

    private fun reset() {
        tried.clear(); engines.clear(); played.clear(); renewed.clear()
        expanding = 0
        askServer = false
    }

    private fun updateServer(id: String, change: (LiveServer) -> LiveServer) { servers = servers.map { if (it.id == id) change(it) else it } }

    /** Autre chaîne depuis le lecteur : ses serveurs sont préparés, le meilleur démarre. */
    fun open(target: LiveChannel) {
        finishMeasure()
        generation += 1
        val token = generation
        channel = target
        servers = emptyList()
        current = null
        web = null
        reset()
        loading = true
        status = "Recherche des serveurs de « ${target.name} »…"
        player?.stop()
        LiveStore.noteRecent(target)
        watch?.cancel()
        watch = Session.scope.launch {
            val list = LiveLauncher.prepare(target)
            if (token != generation) return@launch
            servers = list
            val best = list.firstOrNull { !it.manualOnly } ?: list.firstOrNull()
            if (best != null) { play(best); expandAndProbe() } else {
                loading = false
                status = "Aucun serveur ne propose « ${target.name} » pour le moment."
            }
        }
    }

    /** Chaîne précédente (-1) ou suivante (+1) de la liste d'où elle a été ouverte. */
    fun zap(delta: Int) {
        val index = position ?: return
        if (context.size < 2) return
        open(context[(index + delta + context.size) % context.size])
    }

    // MARK: Serveurs

    /** Serveurs automatiques demandés en arrière-plan (le VIP LiveWatch vérifie ses flux, jusqu'à une minute). */
    private fun expandAndProbe() {
        val token = channel?.id ?: return
        for (server in servers.filter { it.kind == LiveServer.Kind.resolve && it.id != current?.id }.take(16)) {
            expanding += 1
            Session.scope.launch {
                val found = LiveServerFactory.resolve(server, if (server.vip) 70.0 else 45.0)
                if (channel?.id != token) return@launch
                expanding = maxOf(0, expanding - 1)
                val index = servers.indexOfFirst { it.id == server.id }
                if (index < 0) return@launch
                servers = if (found.isEmpty()) servers.map { if (it.id == server.id) it.copy(probe = LiveServer.Probe.down) else it }
                else servers.toMutableList().apply { removeAt(index); addAll(index, LiveHealth.rank(LiveHealth.withCachedProbes(found, token), token)) }
                if (found.isNotEmpty()) probeAll()
            }
        }
        probeAll()
        retest()
    }

    /** Pendant la lecture : nouveau test des autres serveurs toutes les 3 min. */
    private fun retest() {
        refresh?.cancel()
        val token = channel?.id ?: return
        refresh = Session.scope.launch {
            while (isActive) {
                delay(180_000)
                if (channel?.id != token || !presented) return@launch
                val now = System.currentTimeMillis()
                servers = servers.map {
                    if (it.testable && it.id != current?.id && it.probe != LiveServer.Probe.testing && now - (it.probedAt ?: 0L) > 150_000) it.copy(probe = LiveServer.Probe.untested) else it
                }
                probeAll()
            }
        }
    }

    /** Tests des serveurs (6 à la fois) : flux directs et pages des lecteurs. */
    fun probeAll(force: Boolean = false) {
        val token = channel?.id ?: return
        if (force) servers = servers.map { if (it.testable && it.probe != LiveServer.Probe.testing) it.copy(probe = LiveServer.Probe.untested) else it }
        val targets = servers.filter { it.testable && it.probe == LiveServer.Probe.untested }.take(36)
        if (targets.isEmpty()) return
        val ids = targets.map { it.id }.toSet()
        servers = servers.map { if (it.id in ids) it.copy(probe = LiveServer.Probe.testing) else it }
        probing += 1
        Session.scope.launch {
            LiveServerFactory.probeMany(targets) { id, result ->
                if (channel?.id != token) return@probeMany
                updateServer(id) { it.applied(result) }
                servers.firstOrNull { it.id == id }?.let { server ->
                    LiveHealth.cache(result, server, token)
                    if (result.state == LiveServer.Probe.down || result.state == LiveServer.Probe.noVideo) LiveHealth.record(server, token, false)
                }
            }
            probing = if (channel?.id == token) maxOf(0, probing - 1) else 0
        }
    }

    // MARK: Lecture

    /** Serveur choisi (ou suivant). `web` impose un moteur ; sinon celui qui a marché pour ce fournisseur. */
    fun play(server: LiveServer, web: Boolean? = null, note: String? = null) {
        val channel = channel ?: return
        finishMeasure()
        generation += 1
        val token = generation
        watch?.cancel()
        tried += server.id
        current = server
        loading = true
        webPlaying = false
        askServer = false
        status = note ?: "Connexion à ${server.label}…"
        when (server.kind) {
            LiveServer.Kind.resolve -> {
                stopVideo()
                this.web = null
                if (note == null) status = if (server.vip) "Préparation de l’accès VIP (vérification des flux, jusqu’à une minute)…" else "Recherche des serveurs de ${server.label}…"
                watch = Session.scope.launch {
                    val found = LiveHealth.rank(LiveServerFactory.resolve(server, if (server.vip) 70.0 else 45.0), channel.id)
                    if (token != generation) return@launch
                    val index = servers.indexOfFirst { it.id == server.id }
                    if (index >= 0) servers = servers.toMutableList().apply { removeAt(index); addAll(index, found) }
                    probeAll()
                    val first = found.firstOrNull { !it.manualOnly }
                    if (first != null) play(first) else fail(server, "${server.label} n’a proposé aucun serveur : serveur suivant…")
                }
            }
            LiveServer.Kind.web -> {
                stopVideo()
                val prepare = server.relayPrepare
                if (prepare != null && server.pageURL == null) {
                    status = "Préparation du relais officiel…"
                    watch = Session.scope.launch {
                        val json = runCatching { Session.noctraJSON(prepare, 20.0).asMap() }.getOrNull()
                        if (token != generation) return@launch
                        val url = json?.str("embedUrl")?.let { Session.noctraURL(it) }
                        if (url == null) { fail(server, "Relais officiel indisponible : serveur suivant…"); return@launch }
                        val prepared = server.copy(pageURL = url)
                        updateServer(server.id) { it.copy(pageURL = url) }
                        current = prepared
                        openPage(prepared, token)
                    }
                    return
                }
                openPage(server, token)
            }
            LiveServer.Kind.native -> {
                val useWeb = web ?: (server.webEngine || LiveHealth.prefersWeb(server))
                if (useWeb) playEngine(server, token) else playExo(server, token)
            }
        }
    }

    /** Page d'un site (lecteur externe) : lecture et erreurs signalées par la page. */
    private fun openPage(server: LiveServer, token: Int) {
        val url = server.pageURL ?: run { fail(server); return }
        web = WebPlayerRequest(title = channel?.name ?: "", mode = WebPlayerRequest.Mode.page, url = url)
        loading = false
        status = "Lecteur du site : touchez Lecture dans la page si la vidéo ne démarre pas."
        watch = Session.scope.launch {
            delay(7000)
            if (token == generation && !webPlaying) status = null
        }
    }

    /** Moteur web : hls.js, ou mpegts.js pour un flux MPEG-TS continu. */
    private fun playEngine(server: LiveServer, token: Int) {
        val url = server.streamURL ?: run { fail(server); return }
        stopVideo()
        engines.getOrPut(server.id) { mutableSetOf() } += true
        web = null
        watch = Session.scope.launch {
            var target = server
            if (!target.mpegts && target.format == LiveServer.Format.unknown) {
                val format = LiveServerFactory.sniff(server)
                if (token != generation) return@launch
                target = target.copy(format = format, mpegts = format == LiveServer.Format.ts)
                updateServer(server.id) { it.copy(format = format, mpegts = format == LiveServer.Format.ts) }
                current = target
            }
            web = WebPlayerRequest(title = channel?.name ?: "", mode = if (target.mpegts) WebPlayerRequest.Mode.mpegts else WebPlayerRequest.Mode.hls, url = url)
            paused = false
            delay(if (target.mpegts) 25_000 else 30_000)
            if (token == generation && !webPlaying) engineFailed(target, true, "le moteur web n’a pas démarré la vidéo")
        }
    }

    private fun exoPlayer(): ExoPlayer {
        player?.let { return it }
        val app = NoctraApplication.instance
        val renderers = DefaultRenderersFactory(app).setEnableDecoderFallback(true)
        val exo = ExoPlayer.Builder(app, renderers)
            .setAudioAttributes(androidx.media3.common.AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .build()
        player = exo
        return exo
    }

    /** ExoPlayer : HLS et MPEG-TS continu (nature du flux lue au besoin avant la lecture). */
    private fun playExo(server: LiveServer, token: Int) {
        val url = server.streamURL ?: run { fail(server); return }
        engines.getOrPut(server.id) { mutableSetOf() } += false
        web = null
        val exo = exoPlayer()
        exo.stop()
        watch = Session.scope.launch {
            var target = server
            if (target.format == LiveServer.Format.unknown && !target.mpegts) {
                val format = LiveServerFactory.sniff(server)
                if (token != generation) return@launch
                target = target.copy(format = format, mpegts = format == LiveServer.Format.ts)
                updateServer(server.id) { it.copy(format = format, mpegts = format == LiveServer.Format.ts) }
                current = target
            }
            val headers = target.headers + Session.noctraHeaders(url)
            val network = OkHttpDataSource.Factory(Net.client).setDefaultRequestProperties(headers)
            val extractors = DefaultExtractorsFactory().setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES or DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS)
            val factory = DefaultMediaSourceFactory(DefaultDataSource.Factory(NoctraApplication.instance, network), extractors)
            val mime = when {
                target.mpegts || target.format == LiveServer.Format.ts -> MimeTypes.VIDEO_MP2T
                target.format == LiveServer.Format.file -> null
                else -> MimeTypes.APPLICATION_M3U8
            }
            val item = MediaItem.Builder().setUri(Uri.parse(url)).apply { if (mime != null) setMimeType(mime) }
                .setMediaMetadata(MediaMetadata.Builder().setTitle(channel?.name).build())
                .setLiveConfiguration(MediaItem.LiveConfiguration.Builder().setTargetOffsetMs(8000).build())
                .build()
            listener?.let { exo.removeListener(it) }
            val failed = mutableStateOf<String?>(null)
            val watcher = object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) { failed.value = error.errorCodeName.removePrefix("ERROR_CODE_").lowercase().replace('_', ' ') }
                override fun onPlaybackStateChanged(state: Int) { if (state == Player.STATE_BUFFERING && readyAt != null) stalls += 1 }
            }
            listener = watcher
            exo.addListener(watcher)
            exo.setMediaSource(factory.createMediaSource(item))
            exo.prepare()
            paused = false
            exo.playWhenReady = true
            stalls = 0
            val started = System.currentTimeMillis()
            var ready = false
            var waitingSince: Long? = null
            while (isActive && token == generation) {
                delay(500)
                failed.value?.let { reason -> engineFailed(target, false, reason); return@launch }
                if (!ready) {
                    if (exo.playbackState == Player.STATE_READY && (exo.isPlaying || paused)) {
                        ready = true
                        succeeded(target, false)
                    } else if (System.currentTimeMillis() - started > if (exo.playbackState == Player.STATE_READY) 25_000 else 15_000) {
                        engineFailed(target, false, if (exo.playbackState == Player.STATE_READY) "mise en mémoire trop lente" else "aucune image reçue")
                        return@launch
                    }
                } else if (!paused && exo.playbackState == Player.STATE_BUFFERING) {
                    // Coupure : 15 s sans image, nouveau lien du même serveur ou serveur suivant.
                    val since = waitingSince ?: System.currentTimeMillis().also { waitingSince = it }
                    loading = true
                    if (System.currentTimeMillis() - since > 15_000) {
                        stalls += 3
                        fail(target, "Coupure prolongée : serveur suivant…")
                        return@launch
                    }
                } else {
                    waitingSince = null
                    loading = false
                }
            }
        }
    }

    private fun succeeded(server: LiveServer, web: Boolean) {
        val channel = channel ?: return
        readyAt = System.currentTimeMillis()
        loading = false
        status = null
        played += server.id
        LiveHealth.record(server, channel.id, true)
        LiveHealth.noteProbe(server, true)
        if (server.kind == LiveServer.Kind.native) LiveHealth.noteEngine(server, web, true)
    }

    /** Moteur refusé : l'autre moteur pour le même flux, puis le serveur suivant. */
    private fun engineFailed(server: LiveServer, web: Boolean, reason: String) {
        LiveHealth.noteEngine(server, web, false)
        val other = !web
        val tested = engines[server.id] ?: emptySet<Boolean>()
        if (other !in tested && server.id !in played) {
            play(server, other, if (web) "Moteur web en échec ($reason) : essai avec le lecteur natif…" else "Lecteur natif en échec ($reason) : essai avec le moteur web…")
            return
        }
        fail(server, "${server.label} : $reason. Serveur suivant…")
    }

    private fun fail(server: LiveServer, message: String = "Ce serveur ne répond pas : serveur suivant…") {
        val channel = channel ?: return
        // Coupure d'un serveur qui lisait : nouveau lien (jeton neuf) du même serveur, une fois.
        val renew = server.renewURL
        if (server.id in played && renew != null && server.id !in renewed) {
            renewed += server.id
            generation += 1
            val token = generation
            stopVideo()
            web = null
            loading = true
            status = "Reconnexion au serveur…"
            watch = Session.scope.launch {
                val parent = LiveServer(label = server.label, provider = server.provider, kind = LiveServer.Kind.resolve, resolveURL = renew, vip = server.vip)
                val fresh = LiveServerFactory.resolve(parent, if (server.vip) 70.0 else 45.0)
                if (token != generation) return@launch
                val replacement = (fresh.firstOrNull { it.kind == LiveServer.Kind.native } ?: fresh.firstOrNull())?.copy(label = server.label, renewURL = renew)
                if (replacement == null) { fail(server.copy(renewURL = null), message); return@launch }
                servers = servers.map { if (it.id == server.id) replacement else it }
                renewed += replacement.id
                val engine = engines[server.id]?.singleOrNull()
                play(replacement, engine)
            }
            return
        }
        LiveHealth.record(server, channel.id, false)
        // Annoncé « en ligne » par le test mais jamais lu : ce test compte moins pour ce fournisseur.
        if (server.id !in played) LiveHealth.noteProbe(server, false)
        val open = servers.filter { it.id !in tried && !it.manualOnly }
        val candidate = open.firstOrNull { it.probe == LiveServer.Probe.up } ?: open.firstOrNull { it.probe == LiveServer.Probe.slow }
            ?: open.firstOrNull { it.probe !in failing && it.probe != LiveServer.Probe.late } ?: open.firstOrNull { it.probe !in failing } ?: open.firstOrNull()
        if (candidate == null) {
            stopVideo()
            web = null
            loading = false
            status = if (expanding > 0) "Les serveurs essayés ne répondent pas. D’autres serveurs arrivent : choisissez-en un dans la liste."
            else "Aucun serveur de « ${channel.name} » ne répond. Essayez un serveur de secours ou une autre chaîne."
            askServer = true
            return
        }
        play(candidate, note = message)
    }

    // MARK: Événements du lecteur web

    /** Messages des pages (moteur web, ponts Noctra des sites) : lecture, flux trouvé, erreur. */
    fun webEvent(request: String, state: String, message: String, url: String) {
        val web = web ?: return
        if (web.id != request) return
        val server = current ?: return
        when (state) {
            "playing", "ready" -> {
                if (webPlaying) return
                webPlaying = true
                succeeded(server, true)
            }
            "media" -> {
                // Flux repéré par le pont du serveur : proposé comme serveur direct.
                val stream = Session.noctraURL(url) ?: return
                if (servers.any { it.streamURL == stream }) return
                val direct = LiveServer(label = server.label + " · direct", provider = server.provider, kind = LiveServer.Kind.native, streamURL = stream, vip = server.vip, renewURL = server.renewURL)
                val index = (servers.indexOfFirst { it.id == server.id }.takeIf { it >= 0 } ?: (servers.size - 1)) + 1
                servers = servers.toMutableList().apply { add(minOf(index, size), direct) }
                probeAll()
            }
            "error", "stalled", "vip-missed" -> {
                val text = message.ifEmpty { if (state == "vip-missed") "le VIP n’a pas été accepté par le site" else "le lecteur a signalé une erreur" }
                if (web.isEngine && !webPlaying) engineFailed(server, true, text)
                else if (state != "stalled" || web.isEngine) fail(server, "$text Serveur suivant…")
            }
        }
    }

    // MARK: Commandes

    fun togglePause() {
        if (engineMode) {
            webView?.evaluateJavascript("(function(){var v=document.querySelector('video');if(!v)return;if(v.paused)v.play();else v.pause();})()", null)
        } else player?.let { if (paused) it.play() else it.pause() }
        paused = !paused
    }

    private fun stopVideo() {
        watch?.cancel()
        player?.stop()
    }

    private fun finishMeasure() {
        val start = readyAt
        val server = current
        val channel = channel
        if (start != null && server != null && channel != null) LiveHealth.recordSmooth(server, channel.id, stalls, (System.currentTimeMillis() - start) / 1000.0)
        readyAt = null
        stalls = 0
    }

    fun close() {
        refresh?.cancel()
        finishMeasure()
        generation += 1
        stopVideo()
        listener?.let { player?.removeListener(it) }
        listener = null
        player?.release()
        player = null
        web = null
        webView = null
        current = null
        status = null
        askServer = false
        presented = false
    }
}
