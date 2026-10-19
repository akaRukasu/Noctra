package com.noctra.mobile.cast

import android.annotation.SuppressLint
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.noctra.mobile.NoctraApplication
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.Json
import com.noctra.mobile.core.MediaSource
import com.noctra.mobile.core.NoctraException
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.maps
import com.noctra.mobile.core.str
import com.noctra.mobile.play.PlaybackManager
import com.noctra.mobile.play.PlaybackReport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.Executors
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

// Chromecast, Google TV et téléviseurs « Chromecast intégré », sans SDK :
// découverte mDNS (_googlecast._tcp) puis protocole Cast v2 (messages
// protobuf sur TLS, port 8009) avec le lecteur multimédia par défaut de Google.

/** Appareil Cast trouvé sur le réseau local. */
data class ChromecastDevice(val id: String, val name: String, val model: String, val host: InetAddress, val port: Int)

/** Recherche des appareils Cast du Wi-Fi. */
object ChromecastBrowser {
    var devices by mutableStateOf<List<ChromecastDevice>>(emptyList())
        private set
    var searching by mutableStateOf(false)
        private set
    var blocked by mutableStateOf(false)
        private set
    private var manager: NsdManager? = null
    private var listener: NsdManager.DiscoveryListener? = null
    private var lock: WifiManager.MulticastLock? = null
    private val pending = ArrayDeque<NsdServiceInfo>()
    private var resolving = false
    private val main = android.os.Handler(android.os.Looper.getMainLooper())

    fun start() {
        if (listener != null) return
        val context = NoctraApplication.instance
        val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: run { blocked = true; return }
        manager = nsd
        runCatching {
            lock = (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager)?.createMulticastLock("noctra-cast")?.apply { setReferenceCounted(false); acquire() }
        }
        val discovery = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) { main.post { searching = true; blocked = false } }
            override fun onDiscoveryStopped(serviceType: String) { main.post { searching = false } }
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) { main.post { blocked = true; searching = false; listener = null } }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onServiceFound(info: NsdServiceInfo) { main.post { pending.addLast(info); resolveNext() } }
            override fun onServiceLost(info: NsdServiceInfo) { main.post { devices = devices.filter { it.id != info.serviceName } } }
        }
        listener = discovery
        runCatching { nsd.discoverServices("_googlecast._tcp", NsdManager.PROTOCOL_DNS_SD, discovery) }.onFailure { blocked = true; listener = null }
    }

    /** Une résolution à la fois (limite des anciennes versions d'Android). */
    @Suppress("DEPRECATION")
    private fun resolveNext() {
        if (resolving) return
        val info = pending.removeFirstOrNull() ?: return
        val nsd = manager ?: return
        resolving = true
        runCatching {
            nsd.resolveService(info, object : NsdManager.ResolveListener {
                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    main.post {
                        resolving = false
                        // Déjà en cours : nouvel essai un peu plus tard.
                        if (errorCode == NsdManager.FAILURE_ALREADY_ACTIVE) main.postDelayed({ pending.addLast(info); resolveNext() }, 400) else resolveNext()
                    }
                }

                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    val attributes = serviceInfo.attributes.mapValues { (_, value) -> value?.let { String(it, Charsets.UTF_8) } ?: "" }
                    val host = serviceInfo.host
                    main.post {
                        resolving = false
                        if (host != null) {
                            val device = ChromecastDevice(serviceInfo.serviceName, attributes["fn"]?.takeIf { it.isNotEmpty() } ?: serviceInfo.serviceName, attributes["md"]?.takeIf { it.isNotEmpty() } ?: "Chromecast", host, serviceInfo.port)
                            devices = (devices.filter { it.id != device.id } + device).sortedBy { it.name.lowercase() }
                        }
                        resolveNext()
                    }
                }
            })
        }.onFailure { resolving = false }
    }

    fun stop() {
        listener?.let { runCatching { manager?.stopServiceDiscovery(it) } }
        listener = null
        runCatching { lock?.release() }
        lock = null
        searching = false
    }
}

// MARK: Messages Cast v2

/** Message Cast (CastMessage du protocole, encodé en protobuf à la main). */
data class CastMessage(val source: String, val destination: String, val namespace: String, val payload: String) {
    fun encoded(): ByteArray {
        val out = ByteArrayOutputStream()
        varint(0x08, out); varint(0, out)          // protocol_version = CASTV2_1_0
        string(2, source, out)
        string(3, destination, out)
        string(4, namespace, out)
        varint(0x28, out); varint(0, out)          // payload_type = STRING
        string(6, payload, out)
        return out.toByteArray()
    }

    companion object {
        fun decode(bytes: ByteArray): CastMessage? {
            var index = 0
            val fields = HashMap<Int, String>()
            fun readVarint(): Long? {
                var result = 0L
                var shift = 0
                while (index < bytes.size) {
                    val byte = bytes[index].toInt() and 0xFF
                    index += 1
                    result = result or ((byte and 0x7F).toLong() shl shift)
                    if (byte and 0x80 == 0) return result
                    shift += 7
                    if (shift > 63) return null
                }
                return null
            }
            while (index < bytes.size) {
                val key = readVarint() ?: return null
                val field = (key shr 3).toInt()
                when ((key and 7).toInt()) {
                    0 -> readVarint() ?: return null
                    1 -> index += 8
                    5 -> index += 4
                    2 -> {
                        val length = readVarint()?.toInt() ?: return null
                        if (length < 0 || index + length > bytes.size) return null
                        fields[field] = String(bytes, index, length, Charsets.UTF_8)
                        index += length
                    }
                    else -> return null
                }
            }
            val namespace = fields[4] ?: return null
            return CastMessage(fields[2] ?: "", fields[3] ?: "", namespace, fields[6] ?: "")
        }

        private fun varint(value: Long, out: ByteArrayOutputStream) {
            var rest = value
            do {
                var byte = (rest and 0x7F).toInt()
                rest = rest ushr 7
                if (rest != 0L) byte = byte or 0x80
                out.write(byte)
            } while (rest != 0L)
        }

        private fun string(field: Long, text: String, out: ByteArrayOutputStream) {
            val bytes = text.toByteArray(Charsets.UTF_8)
            varint(field shl 3 or 2, out)
            varint(bytes.size.toLong(), out)
            out.write(bytes)
        }
    }
}

/** Connexion TLS vers l'appareil (certificat auto-signé de l'appareil accepté, réseau local seulement). */
class CastChannel(private val device: ChromecastDevice, private val onReady: () -> Unit, private val onMessage: (CastMessage) -> Unit, private val onClosed: (Boolean) -> Unit) {
    private var socket: SSLSocket? = null
    private val writer = Executors.newSingleThreadExecutor()
    @Volatile private var closed = false

    @SuppressLint("CustomX509TrustManager", "TrustAllX509TrustManager")
    fun start() {
        Thread({
            var ready = false
            try {
                val trust = object : X509TrustManager {
                    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
                }
                val context = SSLContext.getInstance("TLS").apply { init(null, arrayOf<TrustManager>(trust), SecureRandom()) }
                val created = context.socketFactory.createSocket() as SSLSocket
                created.connect(InetSocketAddress(device.host, device.port), 8000)
                created.soTimeout = 0
                created.keepAlive = true
                created.startHandshake()
                socket = created
                ready = true
                onReady()
                val input = DataInputStream(created.inputStream)
                while (!closed) {
                    val length = input.readInt()
                    if (length < 0 || length > 4_000_000) break
                    val body = ByteArray(length)
                    input.readFully(body)
                    CastMessage.decode(body)?.let(onMessage)
                }
            } catch (_: Exception) {
            }
            if (!closed) { closed = true; onClosed(!ready) }
            runCatching { socket?.close() }
        }, "noctra-cast").apply { isDaemon = true }.start()
    }

    fun send(message: CastMessage) {
        val body = message.encoded()
        if (closed) return
        runCatching { writer.execute {
            runCatching {
                val out = socket?.outputStream ?: return@runCatching
                val length = body.size
                out.write(byteArrayOf((length shr 24 and 0xFF).toByte(), (length shr 16 and 0xFF).toByte(), (length shr 8 and 0xFF).toByte(), (length and 0xFF).toByte()))
                out.write(body)
                out.flush()
            }
        } }
    }

    fun cancel() {
        closed = true
        runCatching { writer.execute { runCatching { socket?.close() } } }
        writer.shutdown()
    }
}

// MARK: Lecture sur l'appareil

/** Titre lu sur un Chromecast : lancement, télécommande, suivi de lecture Jellyfin. */
object ChromecastController {
    var device by mutableStateOf<ChromecastDevice?>(null)
        private set
    var connecting by mutableStateOf(false)
        private set
    var title by mutableStateOf("")
        private set
    var subtitle by mutableStateOf("")
        private set
    var artwork by mutableStateOf<String?>(null)
        private set
    var playerState by mutableStateOf("IDLE")
        private set
    var position by mutableDoubleStateOf(0.0)
        private set
    var duration by mutableDoubleStateOf(0.0)
        private set
    var volume by mutableDoubleStateOf(1.0)
        private set
    var muted by mutableStateOf(false)
        private set
    var problem by mutableStateOf<String?>(null)

    val isActive: Boolean get() = device != null
    val isPlaying: Boolean get() = playerState == "PLAYING" || playerState == "BUFFERING"

    private var channel: CastChannel? = null
    private var transportId: String? = null
    private var appSessionId: String? = null
    private var mediaSessionId: Int? = null
    private var requestId = 1
    private var pendingLoad: Map<String, Any?>? = null
    private var heartbeat: Job? = null
    private var positionAt = System.currentTimeMillis()
    private var report: PlaybackReport? = null
    private var reportedStart = false
    private var lastReport = 0L

    private const val receiverApp = "CC1AD845"
    private const val connectionNS = "urn:x-cast:com.google.cast.tp.connection"
    private const val heartbeatNS = "urn:x-cast:com.google.cast.tp.heartbeat"
    private const val receiverNS = "urn:x-cast:com.google.cast.receiver"
    private const val mediaNS = "urn:x-cast:com.google.cast.media"
    private const val sender = "sender-noctra"

    /** Position estimée (le Chromecast n'envoie l'état qu'aux changements). */
    fun currentPosition(now: Long = System.currentTimeMillis()): Double {
        if (playerState != "PLAYING") return position
        val value = position + (now - positionAt) / 1000.0
        return if (duration > 0) minOf(value, duration) else value
    }

    /** Profil Chromecast : MP4/WebM H.264 lus tels quels, sinon HLS MPEG-TS H.264/AAC. */
    private val deviceProfile: Map<String, Any?> = mapOf(
        "Name" to "Noctra Chromecast",
        "MaxStreamingBitrate" to 40_000_000,
        "MaxStaticBitrate" to 40_000_000,
        "DirectPlayProfiles" to listOf(
            mapOf("Container" to "mp4,m4v,webm", "Type" to "Video", "VideoCodec" to "h264,vp8,vp9", "AudioCodec" to "aac,mp3,opus,vorbis,flac"),
            mapOf("Container" to "mp3,aac,m4a,flac,ogg,wav,webm", "Type" to "Audio")
        ),
        "TranscodingProfiles" to listOf(
            mapOf("Container" to "ts", "Type" to "Video", "VideoCodec" to "h264", "AudioCodec" to "aac,mp3", "Protocol" to "hls",
                "Context" to "Streaming", "MaxAudioChannels" to "2", "MinSegments" to 1, "BreakOnNonKeyFrames" to true),
            mapOf("Container" to "mp3", "Type" to "Audio", "AudioCodec" to "mp3", "Protocol" to "http", "Context" to "Streaming")
        ),
        "ContainerProfiles" to emptyList<Any>(),
        "CodecProfiles" to emptyList<Any>(),
        "SubtitleProfiles" to listOf("vtt", "webvtt", "srt", "subrip", "ass", "ssa", "mov_text", "ttml").map { mapOf("Format" to it, "Method" to "External") } +
            listOf("pgssub", "pgs", "dvdsub", "dvbsub", "vobsub").map { mapOf("Format" to it, "Method" to "Encode") }
    )

    suspend fun cast(item: BaseItem, startSeconds: Double, audioIndex: Int?, subtitleIndex: Int?, target: ChromecastDevice) {
        val token = Session.token ?: throw NoctraException.http(401)
        val query = mutableMapOf<String, String?>("userId" to Session.userId, "isPlayback" to "true", "autoOpenLiveStream" to "true", "maxStreamingBitrate" to "40000000")
        audioIndex?.let { query["audioStreamIndex"] = it.toString() }
        subtitleIndex?.let { query["subtitleStreamIndex"] = it.toString() }
        val info = Json.parseMap(Session.data("POST", "/Items/${item.id}/PlaybackInfo", query, mapOf("DeviceProfile" to deviceProfile))) ?: throw NoctraException.empty
        val source = info.maps("MediaSources").firstOrNull()?.let { MediaSource(it) } ?: throw NoctraException.empty
        val playSession = info.str("PlaySessionId") ?: UUID.randomUUID().toString()

        // Le Chromecast ne peut pas envoyer d'en-tête : le jeton voyage dans l'adresse.
        var mediaURL: String? = null
        var contentType = "video/mp4"
        var method = "DirectPlay"
        val container = source.container?.split(",")?.firstOrNull()
        val transcoding = source.transcodingUrl
        if (source.supportsDirectPlay && container != null) {
            mediaURL = Session.urlString("/Videos/${item.id}/stream.$container", mapOf(
                "static" to "true", "mediaSourceId" to source.id, "deviceId" to Session.deviceId,
                "playSessionId" to playSession, "tag" to source.eTag, "api_key" to token
            ))
            contentType = if (container == "webm") "video/webm" else "video/mp4"
        } else if (transcoding != null) {
            val lower = transcoding.lowercase()
            val separator = if (transcoding.contains("?")) "&" else "?"
            mediaURL = Session.jellyfinBase + if (lower.contains("api_key=") || lower.contains("apikey=")) transcoding else "$transcoding${separator}api_key=$token"
            contentType = "application/x-mpegURL"
            method = if (source.supportsDirectStream) "DirectStream" else "Transcode"
        }
        mediaURL ?: throw NoctraException.empty

        val heading = if (item.type == "Episode") item.seriesName ?: item.title else item.title
        val detail = if (item.type == "Episode") listOfNotNull(item.episodeLabel, item.name).joinToString(" · ") else item.productionYear?.toString() ?: ""
        val image = Session.backdrop(item, 1280)
        val media = mutableMapOf<String, Any?>(
            "contentId" to mediaURL, "contentUrl" to mediaURL, "contentType" to contentType, "streamType" to "BUFFERED",
            "metadata" to mapOf(
                "metadataType" to if (item.type == "Episode") 2 else 1, "title" to heading, "subtitle" to detail,
                "seriesTitle" to (item.seriesName ?: ""), "images" to (image?.let { listOf(mapOf("url" to it)) } ?: emptyList())
            )
        )
        if (contentType.contains("mpegURL")) {
            media["hlsSegmentFormat"] = "ts"
            media["hlsVideoSegmentFormat"] = "mpeg2_ts"
        }
        val load = mutableMapOf<String, Any?>("type" to "LOAD", "autoplay" to true, "currentTime" to startSeconds)
        val chosen = subtitleIndex ?: source.defaultSubtitleStreamIndex ?: -1
        val stream = source.mediaStreams.firstOrNull { it.index == chosen && it.type == "Subtitle" }
        val vtt = if (chosen >= 0 && stream != null && stream.deliveryMethod != "Encode" && stream.isTextSubtitleStream)
            Session.urlString("/Videos/${item.id}/${source.id}/Subtitles/$chosen/0/Stream.vtt", mapOf("api_key" to token)) else null
        if (stream != null && vtt != null) {
            media["tracks"] = listOf(mapOf(
                "trackId" to 1, "type" to "TEXT", "subtype" to "SUBTITLES", "trackContentId" to vtt,
                "trackContentType" to "text/vtt", "name" to stream.label, "language" to (stream.language ?: "fr")
            ))
            media["textTrackStyle"] = mapOf("backgroundColor" to "#00000000", "foregroundColor" to "#FFFFFFFF", "edgeType" to "OUTLINE", "edgeColor" to "#000000FF", "fontScale" to 1.1)
            load["activeTrackIds"] = listOf(1)
        }
        load["media"] = media

        finishReport()
        title = heading
        subtitle = detail
        artwork = image
        position = startSeconds
        positionAt = System.currentTimeMillis()
        duration = (item.runTimeTicks ?: 0L) / 10_000_000.0
        playerState = "BUFFERING"
        problem = null
        report = PlaybackReport(item.id, source.id, playSession, method)
        reportedStart = false

        val transport = transportId
        if (device?.id == target.id && channel != null && transport != null) send(load, mediaNS, transport)
        else {
            pendingLoad = load
            connect(target)
        }
    }

    /** Les chaînes utilisent un accès TV temporaire ; le jeton du compte reste sur le téléphone. */
    suspend fun castLive(live: com.noctra.mobile.live.LiveChannel, target: ChromecastDevice) {
        val model = com.noctra.mobile.live.LivePlayerModel
        val native = com.noctra.mobile.live.LiveServer.Kind.native
        val failing = setOf(com.noctra.mobile.live.LiveServer.Probe.down, com.noctra.mobile.live.LiveServer.Probe.noVideo, com.noctra.mobile.live.LiveServer.Probe.stale)
        // Serveurs de toutes les sources de la chaîne, le plus fiable d'abord ; celui qui lit déjà en tête.
        var choices = com.noctra.mobile.live.LiveHealth.rank(if (model.channel?.id == live.id) model.servers else com.noctra.mobile.live.LiveLauncher.prepare(live), live.id)
        val current = model.current?.takeIf { model.channel?.id == live.id }
        if (current != null) choices = listOf(current) + choices.filter { it.id != current.id }
        var lastError: Throwable? = null
        var attempts = 0
        for (candidate in choices) {
            if (attempts >= 5) break
            if (candidate.probe in failing) continue
            val streams = when {
                candidate.kind == native && candidate.streamURL != null && !candidate.mpegts -> listOf(candidate)
                candidate.kind == com.noctra.mobile.live.LiveServer.Kind.resolve ->
                    com.noctra.mobile.live.LiveServerFactory.resolve(candidate, 45.0).filter { it.kind == native && it.streamURL != null && !it.mpegts }.take(2)
                else -> emptyList()
            }
            for (server in streams) {
                if (attempts >= 5) break
                // Test rapide avant l'envoi : un flux refusé (LiveWatch VIP sans autorisation…) passe au suivant.
                if (com.noctra.mobile.live.LiveServerFactory.probe(server).state in failing) continue
                attempts += 1
                try {
                    castLiveStream(server, live, target)
                    return
                } catch (error: kotlinx.coroutines.TimeoutCancellationException) {
                    lastError = IllegalStateException("Le Chromecast n’a pas démarré la lecture.")
                } catch (error: kotlinx.coroutines.CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    lastError = error
                }
            }
        }
        throw lastError ?: IllegalStateException("Aucun serveur de cette chaîne n’est lisible par le Chromecast pour le moment. Essayez Noctra TV ou un autre serveur.")
    }

    /** Envoi d'un flux de chaîne au Chromecast (droit temporaire du serveur Noctra), jusqu'à la lecture. */
    private suspend fun castLiveStream(server: com.noctra.mobile.live.LiveServer, live: com.noctra.mobile.live.LiveChannel, target: ChromecastDevice) {
        val uri = java.net.URI(server.streamURL!!)
        val addressToShare = if (Session.isNoctraOrigin(server.streamURL!!)) uri.rawPath + (uri.rawQuery?.let { "?$it" } ?: "") else server.streamURL
        val access = runCatching { Session.noctraSend("POST", "/api/tv/cast", mapOf("url" to addressToShare, "headers" to server.headers)).asMap() }
            .getOrElse { throw IllegalStateException("La diffusion TV nécessite la mise à jour du serveur Noctra fournie avec cette version.", it) }
        val address = access?.str("url")?.let { Session.noctraURL(it) } ?: error("Le serveur ne fournit pas de lien de diffusion.")
        val image = live.logo?.let { Session.noctraURL(it) }
        val load = mapOf("type" to "LOAD", "autoplay" to true, "media" to mapOf(
            "contentId" to address, "contentUrl" to address, "contentType" to "application/x-mpegURL", "streamType" to "LIVE",
            "metadata" to mapOf("metadataType" to 0, "title" to live.name, "subtitle" to "TV en direct", "images" to (image?.let { listOf(mapOf("url" to it)) } ?: emptyList<Any>()))))
        finishReport()
        title = live.name; subtitle = "TV en direct"; artwork = image
        duration = 0.0; position = 0.0; playerState = "BUFFERING"; problem = null; mediaSessionId = null
        val transport = transportId
        if (device?.id == target.id && channel != null && transport != null) send(load, mediaNS, transport)
        else { pendingLoad = load; connect(target) }
        kotlinx.coroutines.withTimeout(30000) {
            while (mediaSessionId == null || playerState != "PLAYING") {
                problem?.let { throw IllegalStateException(it) }
                kotlinx.coroutines.delay(200)
            }
        }
    }

    // MARK: Télécommande

    fun togglePlay() {
        val media = mediaSessionId ?: return
        val transport = transportId ?: return
        send(mapOf("type" to if (playerState == "PLAYING") "PAUSE" else "PLAY", "mediaSessionId" to media), mediaNS, transport)
    }

    fun seek(seconds: Double) {
        val media = mediaSessionId ?: return
        val transport = transportId ?: return
        position = maxOf(0.0, seconds)
        positionAt = System.currentTimeMillis()
        send(mapOf("type" to "SEEK", "mediaSessionId" to media, "currentTime" to position), mediaNS, transport)
    }

    fun skip(delta: Double) = seek(currentPosition() + delta)

    fun changeVolume(level: Double) {
        volume = level.coerceIn(0.0, 1.0)
        send(mapOf("type" to "SET_VOLUME", "volume" to mapOf("level" to volume)), receiverNS, "receiver-0")
    }

    fun toggleMute() {
        muted = !muted
        send(mapOf("type" to "SET_VOLUME", "volume" to mapOf("muted" to muted)), receiverNS, "receiver-0")
    }

    /** Arrêt : la lecture s'arrête sur le téléviseur et l'appli Cast se ferme. */
    fun stop() {
        appSessionId?.let { send(mapOf("type" to "STOP", "sessionId" to it), receiverNS, "receiver-0") }
        Session.scope.launch { delay(300); disconnect() }
    }

    // MARK: Connexion

    private fun connect(target: ChromecastDevice) {
        disconnect(keepReport = true)
        device = target
        connecting = true
        lateinit var created: CastChannel
        created = CastChannel(
            target,
            onReady = { Session.scope.launch { if (channel === created) ready() } },
            onMessage = { message -> Session.scope.launch { if (channel === created) handle(message) } },
            onClosed = { failedToConnect ->
                Session.scope.launch {
                    if (channel !== created) return@launch
                    if (connecting || failedToConnect) problem = "Connexion au Chromecast impossible. Vérifiez qu’il est sur le même Wi-Fi."
                    disconnect()
                }
            }
        )
        channel = created
        created.start()
    }

    private fun ready() {
        send(mapOf("type" to "CONNECT"), connectionNS, "receiver-0", numbered = false)
        send(mapOf("type" to "LAUNCH", "appId" to receiverApp), receiverNS, "receiver-0")
        heartbeat?.cancel()
        heartbeat = Session.scope.launch {
            while (isActive) {
                delay(5000)
                if (channel == null) return@launch
                send(mapOf("type" to "PING"), heartbeatNS, "receiver-0", numbered = false)
                val transport = transportId
                if (transport != null && mediaSessionId != null) send(mapOf("type" to "GET_STATUS"), mediaNS, transport)
            }
        }
    }

    private fun disconnect(keepReport: Boolean = false) {
        heartbeat?.cancel()
        heartbeat = null
        channel?.cancel()
        channel = null
        transportId = null
        appSessionId = null
        mediaSessionId = null
        connecting = false
        if (!keepReport) {
            finishReport()
            device = null
            pendingLoad = null
            playerState = "IDLE"
        }
    }

    private fun send(json: Map<String, Any?>, namespace: String, destination: String, numbered: Boolean = true) {
        val channel = channel ?: return
        val body = json.toMutableMap()
        if (numbered) {
            requestId += 1
            body["requestId"] = requestId
        }
        channel.send(CastMessage(sender, destination, namespace, Json.stringify(body)))
    }

    private fun handle(message: CastMessage) {
        val json = Json.parseMap(message.payload) ?: return
        when (json.str("type")) {
            "PING" -> send(mapOf("type" to "PONG"), heartbeatNS, message.source, numbered = false)
            "RECEIVER_STATUS" -> {
                val status = json["status"].asMap()
                val level = status?.get("volume").asMap()
                (level?.get("level") as? Number)?.let { volume = it.toDouble() }
                (level?.get("muted") as? Boolean)?.let { muted = it }
                val app = status?.get("applications").asMaps().firstOrNull { it.str("appId") == receiverApp }
                val transport = app?.str("transportId")
                if (app == null || transport == null) {
                    // Autre appli lancée sur le téléviseur : la session Noctra est terminée.
                    if (transportId != null && pendingLoad == null) disconnect()
                    return
                }
                appSessionId = app.str("sessionId")
                if (transportId != transport) {
                    transportId = transport
                    send(mapOf("type" to "CONNECT"), connectionNS, transport, numbered = false)
                }
                connecting = false
                pendingLoad?.let { load ->
                    pendingLoad = null
                    send(load, mediaNS, transport)
                }
            }
            "MEDIA_STATUS" -> {
                val status = json["status"].asMaps().firstOrNull() ?: return
                (status["mediaSessionId"] as? Number)?.let { mediaSessionId = it.toInt() }
                status.str("playerState")?.let { playerState = it }
                (status["currentTime"] as? Number)?.let { position = it.toDouble(); positionAt = System.currentTimeMillis() }
                ((status["media"].asMap())?.get("duration") as? Number)?.toDouble()?.takeIf { it > 0 }?.let { duration = it }
                reportProgress()
                val reason = status.str("idleReason")
                if (playerState == "IDLE" && reason in setOf("FINISHED", "CANCELLED", "INTERRUPTED")) finishReport()
                if (playerState == "IDLE" && reason == "ERROR") problem = "Le Chromecast n’a pas pu lire ce titre."
            }
            "LOAD_FAILED", "LOAD_CANCELLED", "INVALID_REQUEST" -> {
                problem = "Le Chromecast n’a pas pu lire ce titre."
                playerState = "IDLE"
            }
            "LAUNCH_ERROR" -> {
                problem = "Le lecteur Cast ne démarre pas sur cet appareil."
                disconnect()
            }
            "CLOSE" -> if (message.source == transportId) disconnect()
        }
    }

    // MARK: Suivi Jellyfin (reprise, « vu »)

    private fun reportProgress() {
        val report = report ?: return
        val now = System.currentTimeMillis()
        if (!reportedStart && playerState == "PLAYING") {
            reportedStart = true
            lastReport = now
            post("/Sessions/Playing", report, false)
        } else if (reportedStart && now - lastReport >= 10_000) {
            lastReport = now
            post("/Sessions/Playing/Progress", report, playerState == "PAUSED")
        }
    }

    private fun finishReport() {
        val report = report ?: return
        if (reportedStart) post("/Sessions/Playing/Stopped", report, false)
        this.report = null
        reportedStart = false
        PlaybackManager.noteEnded()
    }

    private fun post(path: String, report: PlaybackReport, paused: Boolean) {
        val ticks = (maxOf(0.0, currentPosition()) * 10_000_000).toLong()
        val body = mapOf(
            "ItemId" to report.itemId, "MediaSourceId" to report.mediaSourceId, "PlaySessionId" to report.playSessionId,
            "PositionTicks" to ticks, "CanSeek" to true, "IsPaused" to paused, "PlayMethod" to report.playMethod
        )
        Session.scope.launch(Dispatchers.Main) { runCatching { Session.data("POST", path, json = body) } }
    }
}
