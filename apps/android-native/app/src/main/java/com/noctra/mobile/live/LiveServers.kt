package com.noctra.mobile.live

import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Net
import com.noctra.mobile.core.Prefs
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.double
import com.noctra.mobile.core.flag
import com.noctra.mobile.core.str
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Request
import java.util.UUID

// Choix du serveur d'une chaîne, comme Noctra TV : serveurs de toutes les
// sources, accès VIP du serveur Noctra en priorité, fiabilité mémorisée sur
// l'appareil, test de chaque flux avant le lancement, meilleur serveur lancé
// tout seul après un court compte à rebours.

/** Un serveur possible pour une chaîne. */
data class LiveServer(
    val id: String = UUID.randomUUID().toString(),
    var label: String,
    val provider: String,
    val kind: Kind,
    var streamURL: String? = null,
    val headers: Map<String, String> = emptyMap(),
    var mpegts: Boolean = false,
    var pageURL: String? = null,
    val resolveURL: String? = null,
    val vip: Boolean = false,
    var compatPage: Boolean = false,
    var manualOnly: Boolean = false,
    var fallback: Boolean = false,
    /** Lu par le moteur web (hls.js ou mpegts.js) plutôt que par ExoPlayer. */
    var webEngine: Boolean = false,
    /** Résolveur d'origine : nouveau lien du même serveur après une coupure. */
    var renewURL: String? = null,
    /** Relais officiel à préparer par le serveur Noctra avant l'ouverture (NorthTV). */
    var relayPrepare: String? = null,
    /** Lecteur d'un site ouvert dans un cadre, comme sur PC (et non sa page entière). */
    var framed: Boolean = false,
    /** Restrictions du cadre (null : aucune, pour les lecteurs qui les refusent). */
    var sandbox: String? = LiveServerFactory.defaultSandbox,
    var format: Format = Format.unknown,
    var probe: Probe = Probe.untested,
    var probeMs: Double = 0.0,
    var margin: Double = 0.0,
    var probeNote: String? = null,
    var probedAt: Long? = null
) {
    enum class Kind { native, resolve, web }
    enum class Probe { untested, testing, up, slow, late, down, noVideo, stale }
    /** Contenu réel du flux, lu par le test : liste HLS, flux MPEG-TS continu, fichier vidéo. */
    enum class Format { unknown, hls, ts, file }

    val host: String
        get() = (streamURL ?: pageURL ?: resolveURL)?.let { Session.noctraURL(it) ?: it }?.toHttpUrlOrNull()?.host?.removePrefix("www.") ?: ""

    val kindName: String get() = when (kind) { Kind.native -> if (mpegts) "ts" else "native"; Kind.resolve -> "resolve"; Kind.web -> "web" }

    /** Serveurs testables : flux directs, et pages de lecteurs (hors secours manuels et relais à préparer). */
    val testable: Boolean get() = when (kind) {
        Kind.native -> streamURL != null
        Kind.web -> pageURL != null && !manualOnly && relayPrepare == null
        Kind.resolve -> false
    }

    /** Résultat d'un test : état, et flux MPEG-TS continu reconnu. */
    fun applied(result: ProbeResult): LiveServer = copy(
        probe = result.state, probeMs = result.ms, margin = result.margin, probeNote = result.note, probedAt = System.currentTimeMillis(),
        format = if (result.format != Format.unknown) result.format else format, mpegts = mpegts || result.format == Format.ts
    )
}

data class ProbeResult(val state: LiveServer.Probe, val ms: Double = 0.0, val margin: Double = 0.0, val format: LiveServer.Format = LiveServer.Format.unknown, val note: String? = null)

/** Fiabilité des serveurs : réussites, échecs et coupures, par serveur d'une chaîne et par famille. */
object LiveHealth {
    private const val storeKey = "noctra.tv.health.v1"
    private const val recent = 20 * 60 * 1000L
    private var cache: MutableMap<String, MutableMap<String, Double>>? = null

    private fun store(): MutableMap<String, MutableMap<String, Double>> {
        cache?.let { return it }
        val loaded = mutableMapOf<String, MutableMap<String, Double>>()
        (Prefs.json(storeKey).asMap())?.forEach { (key, value) ->
            val entry = value.asMap() ?: return@forEach
            loaded[key] = entry.mapNotNull { (k, v) -> (v as? Number)?.let { k to it.toDouble() } }.toMap().toMutableMap()
        }
        cache = loaded
        return loaded
    }

    private fun save() {
        val all = store()
        if (all.size > 600) {
            all.entries.sortedBy { maxOf(it.value["o"] ?: 0.0, it.value["f"] ?: 0.0) }.take(all.size - 600).map { it.key }.forEach { all.remove(it) }
        }
        Prefs.setJson(storeKey, all)
    }

    private fun ids(server: LiveServer, channel: String) = listOf("c|$channel|${server.label}", "f|${server.provider}|${server.kindName}|${server.host}")

    fun record(server: LiveServer, channel: String, ok: Boolean) {
        val all = store()
        val now = System.currentTimeMillis().toDouble()
        for (id in ids(server, channel)) {
            val entry = all.getOrPut(id) { mutableMapOf("ok" to 0.0, "fail" to 0.0) }
            if (ok) { entry["ok"] = minOf(50.0, (entry["ok"] ?: 0.0) + 1); entry["o"] = now } else { entry["fail"] = minOf(50.0, (entry["fail"] ?: 0.0) + 1); entry["f"] = now }
            if ((entry["ok"] ?: 0.0) + (entry["fail"] ?: 0.0) > 20) {
                entry["ok"] = Math.round((entry["ok"] ?: 0.0) * 0.7).toDouble()
                entry["fail"] = Math.round((entry["fail"] ?: 0.0) * 0.7).toDouble()
            }
        }
        save()
        if (ok) Prefs.set("noctra.tv.server.$channel", server.label)
    }

    /** Coupures pendant la lecture (pour 10 min regardées), moyenne glissante. */
    fun recordSmooth(server: LiveServer, channel: String, stalls: Int, seconds: Double) {
        if (seconds < 30) return
        val rate = minOf(10.0, stalls / (seconds / 600))
        val weight = minOf(0.4, 0.4 * seconds / 120)
        val all = store()
        for (id in ids(server, channel)) {
            val entry = all.getOrPut(id) { mutableMapOf("ok" to 0.0, "fail" to 0.0) }
            entry["cut"] = entry["cut"]?.let { it * (1 - weight) + rate * weight } ?: rate
        }
        save()
    }

    // Moteur de lecture qui marche pour chaque famille (fournisseur + hôte) : au-dessus de zéro, le moteur web passe avant ExoPlayer.
    private const val engineKey = "noctra.tv.engine.v1"
    private fun engineID(server: LiveServer) = "${server.provider}|${server.host}"

    /** Moteur appris pour ce fournisseur ; sinon, comme le site : moteur web (Shaka) d'abord. */
    fun prefersWeb(server: LiveServer): Boolean {
        val learned = Prefs.json(engineKey).asMap()?.double(engineID(server)) ?: 0.0
        return learned >= 0
    }

    fun noteEngine(server: LiveServer, web: Boolean, ok: Boolean) {
        val all = (Prefs.json(engineKey).asMap() ?: emptyMap()).mapNotNull { (k, v) -> (v as? Number)?.let { k to it.toDouble() } }.toMap().toMutableMap()
        val id = engineID(server)
        all[id] = ((all[id] ?: 0.0) + if (web == ok) 1 else -1).coerceIn(-3.0, 3.0)
        Prefs.setJson(engineKey, if (all.size > 300) all.entries.take(300).associate { it.key to it.value } else all)
    }

    // Confiance dans les tests, par fournisseur et type de serveur.
    private const val trustKey = "noctra.tv.probetrust.v1"
    private fun trustID(server: LiveServer) = "${server.provider}|${server.kindName}"

    fun probeTrust(server: LiveServer): Double {
        val misses = Prefs.json(trustKey).asMap()?.double(trustID(server)) ?: 0.0
        return 1 / (1 + misses * 0.5)
    }

    fun noteProbe(server: LiveServer, accurate: Boolean) {
        if (server.probe != LiveServer.Probe.up && server.probe != LiveServer.Probe.slow) return
        val all = (Prefs.json(trustKey).asMap() ?: emptyMap()).mapNotNull { (k, v) -> (v as? Number)?.let { k to it.toDouble() } }.toMap().toMutableMap()
        val id = trustID(server)
        all[id] = ((all[id] ?: 0.0) + if (accurate) -1 else 1).coerceIn(0.0, 6.0)
        Prefs.setJson(trustKey, all)
    }

    // Derniers tests de chaque serveur (4 min) : une chaîne rouverte ou zappée est classée tout de suite.
    private val probes = LinkedHashMap<String, Pair<ProbeResult, Long>>()

    fun cache(result: ProbeResult, server: LiveServer, channel: String) {
        if (result.state == LiveServer.Probe.untested || result.state == LiveServer.Probe.testing) return
        probes["$channel|${server.label}"] = result to System.currentTimeMillis()
        if (probes.size > 400) probes.keys.take(100).forEach { probes.remove(it) }
    }

    fun withCachedProbes(servers: List<LiveServer>, channel: String): List<LiveServer> = servers.map { server ->
        val entry = probes["$channel|${server.label}"]
        if (server.probe != LiveServer.Probe.untested || entry == null || System.currentTimeMillis() - entry.second > 240_000) server
        else server.applied(entry.first).copy(probedAt = entry.second)
    }

    fun remembered(channel: String): String? = Prefs.string("noctra.tv.server.$channel")

    /** Note (plus haut = plus fiable) et verdict lisible. */
    fun score(server: LiveServer, channel: String): Pair<Double, String> {
        val all = store()
        val now = System.currentTimeMillis()
        var score = 0.0
        var verdict = ""
        for ((level, key) in ids(server, channel).withIndex()) {
            val entry = all[key] ?: continue
            val weight = if (level == 0) 1.0 else 0.3
            val ok = entry["ok"] ?: 0.0
            val fail = entry["fail"] ?: 0.0
            val rate = (ok + 1) / (ok + fail + 2)
            score += (rate - 0.5) * 2 * weight
            val failedAt = entry["f"]
            val okAt = entry["o"]
            val failedRecently = failedAt != null && now - failedAt < recent && (okAt == null || failedAt > okAt)
            if (failedRecently) score -= 2 * weight
            entry["cut"]?.let { score -= minOf(3.0, it * 0.75) * weight }
            if (level != 0 || verdict.isNotEmpty()) continue
            verdict = when {
                failedRecently -> "Échec récent"
                (entry["cut"] ?: 0.0) >= 2 -> "Coupures fréquentes"
                fail >= 2 && rate < 0.45 -> "Instable"
                ok >= 2 && rate >= 0.75 -> "Fiable"
                else -> ""
            }
        }
        return score to verdict
    }

    fun text(server: LiveServer, channel: String): String {
        val all = store()
        val keys = ids(server, channel)
        val verdict = score(server, channel).second
        all[keys[0]]?.let { own ->
            val ok = (own["ok"] ?: 0.0).toInt()
            val total = ok + (own["fail"] ?: 0.0).toInt()
            if (total > 0) return "${verdict.ifEmpty { "Essayé" }} · $ok/$total réussites"
        }
        all[keys[1]]?.let { family ->
            val ok = (family["ok"] ?: 0.0).toInt()
            val total = ok + (family["fail"] ?: 0.0).toInt()
            if (total > 0) return "Même fournisseur · $ok/$total réussites"
        }
        return "Jamais essayé"
    }

    /** Classement : flux directs d'abord, fiabilité, résultat des tests, dernier serveur qui a marché. */
    fun rank(servers: List<LiveServer>, channel: String): List<LiveServer> {
        val remembered = remembered(channel)
        val failing = setOf(LiveServer.Probe.down, LiveServer.Probe.noVideo, LiveServer.Probe.stale)
        return servers.withIndex().map { (index, server) ->
            val (health, verdict) = score(server, channel)
            var base = when (server.kind) { LiveServer.Kind.native -> if (server.mpegts) 1.5 else 0.0; LiveServer.Kind.resolve -> 1.0; LiveServer.Kind.web -> 2.0 }
            if (server.compatPage) base += 3
            if (server.manualOnly) base += 4
            if (server.fallback) base += 0.5
            // VIP LiveWatch : plus prioritaire d'office (vérification jusqu'à 1 min 30) ;
            // il remonte s'il a déjà marché (fiabilité apprise ci-dessous).
            if (server.vip && server.kind == LiveServer.Kind.resolve) base += 2
            base -= health
            val trust = probeTrust(server)
            when (server.probe) {
                LiveServer.Probe.up -> { base -= 6 * trust; base += minOf(1.5, server.probeMs / 4000); if (server.margin >= 2) base -= 0.5 }
                LiveServer.Probe.slow -> base -= 3 * trust
                LiveServer.Probe.late -> base += 1
                LiveServer.Probe.down, LiveServer.Probe.noVideo, LiveServer.Probe.stale -> base += 8
                else -> {}
            }
            val usable = verdict != "Échec récent" && verdict != "Coupures fréquentes" && server.probe !in failing
            if (remembered != null && server.label == remembered && usable) base -= 10
            Triple(base, index, server)
        }.sortedWith(compareBy({ it.first }, { it.second })).map { it.third }
    }
}

// MARK: Serveurs d'une chaîne

object LiveServerFactory {
    /** Cadre des lecteurs des sites, réglé comme sur PC. */
    const val defaultSandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation"
    /** Lecteurs publiés qui refusent toute restriction de cadre (comme sur PC). */
    private val openFrameProviders = setOf("BrigitteTV", "DLStreams", "DaddyLive", "Streamed", "Volkamax", "FCTV33", "RénéVéo", "BowdTV", "Xtemus", "Alternative")

    /** Lecteur d'un site dans un cadre (comme sur PC), sans restriction pour les fournisseurs qui les refusent. */
    private fun framedPage(label: String, provider: String, url: String, vip: Boolean, raw: JsonMap): LiveServer {
        val open = (!Session.isNoctraOrigin(url) && provider in openFrameProviders) || raw.flag("noSandbox") || provider == "Alternative"
        return LiveServer(label = label, provider = provider, kind = LiveServer.Kind.web, pageURL = url, vip = vip, framed = true, sandbox = if (open) null else defaultSandbox)
    }

    /** Serveurs LiveWatch de la même chaîne (« Serveur 2 », « SAT »…) publiés par le serveur Noctra. */
    private fun liveWatchVariants(raw: JsonMap, prefix: String, provider: String, vip: Boolean, exclude: Set<String>): List<LiveServer> {
        val variants = raw["liveWatchVariants"].asMaps()
        if (variants.size < 2) return emptyList()
        val used = exclude.toMutableSet()
        return variants.take(12).mapIndexedNotNull { index, variant ->
            val page = listOfNotNull(variant.str("embedUrl"), variant.str("externalUrl")).firstOrNull() ?: return@mapIndexedNotNull null
            val url = Session.noctraURL(page) ?: return@mapIndexedNotNull null
            if (!used.add(url)) return@mapIndexedNotNull null
            LiveServer(label = "$prefix · " + (variant.str("label") ?: "serveur ${index + 1}"), provider = provider, kind = LiveServer.Kind.web, pageURL = url, vip = vip)
        }
    }

    /** Sources LiveWatch à lecteur officiel (comme sur PC et Noctra TV). */
    private val liveWatchOfficial = setOf("livewatch-north", "livewatch-frame", "livewatch-sports", "livewatch-football", "livewatch-bosstv", "livewatch-jacktv", "livewatch-daily")
    private val variantSuffix = Regex("\\.([A-Za-z0-9]{1,3})\\s*$")
    private val northPath = Regex("^/embed/north/([^/]+)/?$")

    fun servers(channel: LiveChannel): List<LiveServer> {
        val list = mutableListOf<LiveServer>()
        val perSource = channel.entries.groupingBy { it.source }.eachCount()
        val seen = mutableMapOf<String, Int>()
        for (entry in channel.entries.take(80)) {
            var prefix = entry.source
            if ((perSource[entry.source] ?: 0) > 1) {
                seen[entry.source] = (seen[entry.source] ?: 0) + 1
                val name = entry.raw["name"] as? String
                val variant = name?.let { variantSuffix.find(it) }
                if (variant != null) prefix += " · variante " + variant.groupValues[1].lowercase()
                else if ((seen[entry.source] ?: 0) > 1) prefix += " · ${seen[entry.source]}"
            }
            list += options(entry.raw, entry.sourceId, prefix, entry.raw.str("provider") ?: entry.source)
        }
        return list
    }

    @Suppress("UNCHECKED_CAST")
    private fun options(raw: JsonMap, sourceId: String, prefix: String, provider: String): List<LiveServer> {
        val vip = raw.flag("vipPlayback")
        val transport = (raw["transport"] as? String)?.lowercase() ?: ""
        val tsTransport = transport in setOf("ts", "mpegts", "mpeg-ts") || (raw["streamKind"] as? String)?.lowercase() == "mpeg-ts"
        val headers = (raw["headers"] as? Map<String, Any?>)?.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }?.toMap() ?: emptyMap()
        val resolver = raw.str("resolverUrl") ?: raw.str("resolveUrl")
        val pages = listOf(raw["vipFallbackUrl"], raw["externalUrl"], raw["embedUrl"]).mapNotNull { it as? String }.filter { it.isNotEmpty() }
        val embed = pages.firstOrNull { it.lowercase().startsWith("http") }
        // Lecteur officiel LiveWatch (hors VIP) : sa page ; NorthTV passe d'abord par le relais préparé par le serveur.
        if (sourceId in liveWatchOfficial && !(raw["playbackType"] == "resolver" && resolver != null) && embed != null) {
            val result = mutableListOf<LiveServer>()
            val url = embed.toHttpUrlOrNull()
            if (sourceId == "livewatch-north" && raw.flag("liveWatchSameOriginBridge") && url != null && url.host.lowercase().endsWith("livewatch.top")) {
                northPath.find(url.encodedPath)?.let { match ->
                    result += LiveServer(label = "$prefix · relais officiel", provider = provider, kind = LiveServer.Kind.web, vip = vip,
                        relayPrepare = "/api/tv/livewatch/prepare/north/" + match.groupValues[1], compatPage = true)
                }
            }
            result += LiveServer(label = "$prefix · lecteur officiel", provider = provider, kind = LiveServer.Kind.web, pageURL = embed)
            result += liveWatchVariants(raw, prefix, provider, false, setOf(embed))
            return result
        }
        val list = mutableListOf<LiveServer>()
        val stream = raw.str("streamUrl")?.let { Session.noctraURL(it) }
        if (raw["playbackType"] == "stream" && stream != null) {
            val path = stream.toHttpUrlOrNull()?.encodedPath?.lowercase() ?: ""
            list += LiveServer(label = "$prefix · flux direct", provider = provider, kind = LiveServer.Kind.native, streamURL = stream, headers = headers,
                mpegts = tsTransport || (path.endsWith(".ts") && !path.contains("m3u8")), vip = vip)
        } else if (resolver != null) {
            list += LiveServer(label = prefix + if (vip) " · VIP" else " · automatique", provider = provider, kind = LiveServer.Kind.resolve, resolveURL = resolver, vip = vip)
        } else if (stream != null) {
            list += LiveServer(label = "$prefix · flux direct", provider = provider, kind = LiveServer.Kind.native, streamURL = stream, headers = headers, mpegts = tsTransport, vip = vip)
        }
        // Lecteur du site en plus du flux : le lecteur seul (embedUrl), comme sur PC, plutôt que la page
        // entière du site (externalUrl, avec ses publicités) ; proposé en secours manuel à côté d'un flux.
        val used = list.mapNotNull { it.streamURL }.toSet()
        val players = listOf(raw["embedUrl"], raw["vipFallbackUrl"], raw["externalUrl"], raw["url"]).mapNotNull { it as? String }
            .filter { it.lowercase().startsWith("http") || it.startsWith("/") }
        val pageUrl = players.firstOrNull()?.let { Session.noctraURL(it) }
        if (pageUrl != null && pageUrl !in used) {
            val manual = list.isNotEmpty()
            list += framedPage(prefix + if (manual) " · lecteur du site" else " · lecteur web", provider, pageUrl, vip, raw).copy(fallback = manual, manualOnly = manual)
            // VIP : chaque variante arrive du résolveur en flux VIP (comme sur PC), pas en page publique.
            if (!(vip && resolver != null)) list += liveWatchVariants(raw, prefix, provider, vip, setOf(pageUrl)).map { it.copy(fallback = manual, manualOnly = manual) }
        }
        return list
    }

    /** Serveurs proposés par un résolveur du serveur Noctra (VIP, serveurs automatiques). */
    @Suppress("UNCHECKED_CAST")
    suspend fun resolve(server: LiveServer, timeout: Double = 45.0): List<LiveServer> {
        val path = server.resolveURL ?: return emptyList()
        val json = runCatching { Session.noctraJSON(path, timeout).asMap() }.getOrNull() ?: return emptyList()
        val vipActive = json.flag("vipActive")
        val list = json["options"].asMaps().ifEmpty { if (json["streamUrl"] != null || json["url"] != null) listOf(json) else emptyList() }
        val base = server.label.replace(" · automatique", "").replace(" · VIP", "")
        return list.take(24).mapIndexedNotNull { index, option ->
            val name = option.str("label")?.let { "$base · $it" } ?: "$base · serveur ${index + 1}"
            val vip = server.vip || (vipActive && (option["vip"] as? Boolean ?: true))
            val headers = (option["headers"] as? Map<String, Any?>)?.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }?.toMap() ?: emptyMap()
            val transport = (option["transport"] as? String)?.lowercase() ?: ""
            val stream = option.str("streamUrl")?.let { Session.noctraURL(it) }
            val next = option.str("resolveUrl")
            val page = option.str("url")?.let { Session.noctraURL(it) }
            val item = when {
                stream != null -> LiveServer(label = name, provider = server.provider, kind = LiveServer.Kind.native, streamURL = stream, headers = headers,
                    mpegts = transport in setOf("ts", "mpegts", "mpeg-ts") || (option["streamKind"] as? String)?.lowercase() == "mpeg-ts", vip = vip, renewURL = server.resolveURL)
                next != null && option["url"] == null -> LiveServer(label = name, provider = server.provider, kind = LiveServer.Kind.resolve, resolveURL = next, vip = vip)
                page != null -> framedPage(name, server.provider, page, vip, option)
                else -> return@mapIndexedNotNull null
            }
            // Variantes VIP non vérifiées d'avance : la route HLS du serveur les résout à la lecture ;
            // elles servent de relais automatiques, comme sur PC.
            item.copy(compatPage = option.flag("compatPage"), manualOnly = option.flag("manualOnly") && !(item.vip && item.kind == LiveServer.Kind.native), fallback = option.flag("fallback"))
        }
    }

    // MARK: Test d'un flux

    private sealed interface Fetch {
        data class Done(val data: ByteArray, val status: Int, val url: String, val header: (String) -> String?) : Fetch
        data object Failed : Fetch
        data object TimedOut : Fetch
    }

    /** Requête d'un test : en-têtes du serveur, jeton Noctra vers le serveur Noctra seulement. */
    private fun request(target: String, server: LiveServer, page: Boolean = false): Request? {
        val builder = runCatching { Request.Builder().url(target) }.getOrNull() ?: return null
        for ((key, value) in server.headers) runCatching { builder.header(key, value) }
        if (Session.isNoctraOrigin(target)) Session.token?.let { builder.header("x-noctra-token", it) }
        if (page) builder.header("Accept", "text/html,application/xhtml+xml,*/*;q=0.8")
        builder.header("Cache-Control", "no-cache")
        return builder.build()
    }

    /** Début d'une réponse (au plus `limit` octets) : un flux continu (MPEG-TS) ne se termine jamais, on n'en lit que le début. */
    private suspend fun fetchHead(request: Request?, limit: Int, seconds: Double): Fetch {
        if (request == null) return Fetch.Failed
        return withTimeoutOrNull((seconds * 1000).toLong()) {
            withContext(Dispatchers.IO) {
                runCatching {
                    val call = Net.client(seconds + 2).newCall(request)
                    val response = call.execute()
                    response.use { answer ->
                        val source = answer.body?.source()
                        val buffer = okio.Buffer()
                        if (source != null) {
                            while (buffer.size < limit) {
                                val read = source.read(buffer, minOf(16_384L, limit - buffer.size))
                                if (read < 0) break
                            }
                        }
                        val headers = answer.headers
                        Fetch.Done(buffer.readByteArray(), answer.code, answer.request.url.toString()) { name -> headers[name] }
                    }
                }.getOrElse { Fetch.Failed }
            }
        } ?: Fetch.TimedOut
    }

    /** Nature du flux (début de la réponse seulement), pour choisir le lecteur. */
    suspend fun sniff(server: LiveServer): LiveServer.Format {
        val url = server.streamURL ?: return LiveServer.Format.unknown
        val result = fetchHead(request(url, server), 4096, 6.0)
        return if (result is Fetch.Done && result.status < 400) format(result.data) else LiveServer.Format.unknown
    }

    private fun format(data: ByteArray): LiveServer.Format {
        val text = String(data, 0, minOf(data.size, 2048), Charsets.UTF_8)
        if (text.contains("#EXTM3U")) return LiveServer.Format.hls
        if (transportStream(data)) return LiveServer.Format.ts
        if (data.size >= 8 && String(data, 4, 4, Charsets.US_ASCII) in setOf("ftyp", "moov", "moof", "styp", "free", "mdat")) return LiveServer.Format.file
        return LiveServer.Format.unknown
    }

    /** Paquets MPEG-TS (0x47 tous les 188 octets), même précédés d'une fausse image. */
    private fun transportStream(bytes: ByteArray): Boolean {
        if (bytes.size < 189) return bytes.firstOrNull() == 0x47.toByte()
        for (start in 0 until minOf(bytes.size - 188, 2048)) {
            if (bytes[start] == 0x47.toByte() && bytes[start + 188] == 0x47.toByte() && (start + 376 >= bytes.size || bytes[start + 376] == 0x47.toByte())) return true
        }
        return false
    }

    private fun looksLikeMedia(data: ByteArray): Boolean {
        if (data.size < 8) return false
        if (transportStream(data)) return true
        if (String(data, 4, 4, Charsets.US_ASCII) in setOf("ftyp", "moof", "styp", "sidx", "mdat", "free")) return true
        return data[0] == 0x49.toByte() && data[1] == 0x44.toByte() && data[2] == 0x33.toByte()
    }

    private fun pageLike(data: ByteArray): Boolean {
        val head = String(data, 0, minOf(data.size, 512), Charsets.UTF_8).lowercase()
        return head.contains("<html") || head.contains("<!doctype") || head.startsWith("{")
    }

    private fun statusNote(code: Int): String = when (code) {
        401, 403 -> "accès refusé ($code)"
        404, 410 -> "lien expiré ($code)"
        429 -> "trop de demandes (429)"
        in 500..599 -> "erreur du fournisseur ($code)"
        else -> "réponse $code"
    }

    private fun lines(text: String) = text.split("\n").map { it.trim() }
    private fun targetDuration(text: String) = lines(text).firstOrNull { it.startsWith("#EXT-X-TARGETDURATION:") }?.substring(22)?.trim()?.toDoubleOrNull()
    private fun mediaSequence(text: String) = lines(text).firstOrNull { it.startsWith("#EXT-X-MEDIA-SEQUENCE:") }?.substring(22)?.trim()?.toLongOrNull()
    private fun segmentCount(text: String) = lines(text).count { it.startsWith("#EXTINF:") }
    private fun lastSegment(text: String) = lines(text).lastOrNull { it.isNotEmpty() && !it.startsWith("#") }
    private fun resolveAgainst(base: String, uri: String): String? = base.toHttpUrlOrNull()?.resolve(uri)?.toString()

    /** Test d'un serveur : flux direct (liste HLS ou flux continu) ou page de lecteur. */
    suspend fun probe(server: LiveServer): ProbeResult = if (server.kind == LiveServer.Kind.web) probePage(server) else probeStream(server)

    private suspend fun probeStream(server: LiveServer): ProbeResult {
        val url = server.streamURL ?: return ProbeResult(LiveServer.Probe.untested)
        val began = System.currentTimeMillis()
        var latency: Double? = null
        fun elapsed() = latency ?: (System.currentTimeMillis() - began).toDouble()
        fun result(state: LiveServer.Probe, note: String? = null, format: LiveServer.Format = LiveServer.Format.hls, margin: Double = 0.0) = ProbeResult(state, elapsed(), margin, format, note)
        val first = fetchHead(request(url, server), 524_288, 12.0)
        latency = (System.currentTimeMillis() - began).toDouble()
        val data: ByteArray
        val finalUrl: String
        when (first) {
            Fetch.TimedOut -> return result(LiveServer.Probe.late, "pas de réponse en 12 s", LiveServer.Format.unknown)
            Fetch.Failed -> return result(LiveServer.Probe.down, "serveur injoignable", LiveServer.Format.unknown)
            is Fetch.Done -> {
                if (first.status >= 400) return result(LiveServer.Probe.down, statusNote(first.status), LiveServer.Format.unknown)
                data = first.data
                finalUrl = first.url
            }
        }
        when (format(data)) {
            LiveServer.Format.ts -> return probeTransport(server, elapsed())
            LiveServer.Format.file -> return result(LiveServer.Probe.up, "fichier vidéo", LiveServer.Format.file)
            LiveServer.Format.unknown -> return result(LiveServer.Probe.noVideo, if (pageLike(data)) "page web reçue au lieu d’un flux" else "réponse sans vidéo", LiveServer.Format.unknown)
            LiveServer.Format.hls -> {}
        }
        var text = String(data, Charsets.UTF_8)
        var playlistURL = finalUrl
        // Liste principale : première variante.
        if (text.contains("#EXT-X-STREAM-INF")) {
            val all = text.split("\n")
            val index = all.indexOfFirst { it.startsWith("#EXT-X-STREAM-INF") }
            val uri = all.drop(index + 1).firstOrNull { it.isNotBlank() && !it.startsWith("#") }?.trim()
            val variant = uri?.let { resolveAgainst(playlistURL, it) } ?: return result(LiveServer.Probe.noVideo, "liste principale sans variante")
            when (val answer = fetchHead(request(variant, server), 524_288, 12.0)) {
                Fetch.TimedOut -> return result(LiveServer.Probe.late, "variante sans réponse en 12 s")
                Fetch.Failed -> return result(LiveServer.Probe.down, "variante injoignable")
                is Fetch.Done -> {
                    if (answer.status >= 400) return result(LiveServer.Probe.down, "variante : " + statusNote(answer.status))
                    val body = String(answer.data, Charsets.UTF_8)
                    if (!body.contains("#EXTM3U")) return result(LiveServer.Probe.noVideo, "variante sans liste HLS")
                    text = body
                    playlistURL = answer.url
                }
            }
        }
        // Chiffrement FairPlay ou Widevine : illisible hors des applis du fournisseur.
        if (text.contains("METHOD=SAMPLE-AES", ignoreCase = true) && (text.contains("skd://") || text.contains("widevine", ignoreCase = true))) return result(LiveServer.Probe.noVideo, "flux chiffré (DRM)")
        val listedAt = System.currentTimeMillis()
        val list = lines(text)
        val last = list.indexOfLast { it.isNotEmpty() && !it.startsWith("#") }
        if (last < 0) return result(LiveServer.Probe.stale, "liste vide (aucun segment)")
        val segment = resolveAgainst(playlistURL, list[last]) ?: return result(LiveServer.Probe.stale, "liste vide (aucun segment)")
        val duration = list.take(last).lastOrNull { it.startsWith("#EXTINF:") }?.substring(8)?.split(",")?.firstOrNull()?.toDoubleOrNull() ?: 0.0
        val sent = System.currentTimeMillis()
        val margin: Double
        when (val answer = fetchHead(request(segment, server), 12_000_000, 15.0)) {
            Fetch.TimedOut -> return result(LiveServer.Probe.late, "segment trop long à recevoir")
            Fetch.Failed -> return result(LiveServer.Probe.down, "segment injoignable")
            is Fetch.Done -> {
                if (answer.status >= 400) return result(LiveServer.Probe.down, "segment : " + statusNote(answer.status))
                if (!looksLikeMedia(answer.data)) return result(LiveServer.Probe.noVideo, if (pageLike(answer.data)) "segment remplacé par une page web" else "segment sans vidéo")
                val took = maxOf(1L, System.currentTimeMillis() - sent).toDouble()
                margin = if (duration > 0) duration * 1000 / took else 0.0
            }
        }
        // Direct qui avance : la liste est relue après une durée de segment.
        if (!text.contains("#EXT-X-ENDLIST")) {
            val target = targetDuration(text) ?: maxOf(duration, 4.0)
            val pause = minOf(10.0, maxOf(0.0, target * 1.15 - (System.currentTimeMillis() - listedAt) / 1000.0))
            if (pause > 0) delay((pause * 1000).toLong())
            val again = fetchHead(request(playlistURL, server), 524_288, 10.0)
            if (again is Fetch.Done && again.status < 400 && again.header("x-noctra-playlist") != "stale") {
                val body = String(again.data, Charsets.UTF_8)
                if (body.contains("#EXTM3U")) {
                    val before = mediaSequence(text)
                    val after = mediaSequence(body)
                    val moved = if (before != null && after != null) after > before || segmentCount(body) > segmentCount(text) else lastSegment(body) != list[last]
                    if (!moved) return result(LiveServer.Probe.stale, "direct figé (aucun nouveau segment)")
                }
            }
        }
        val factor = String.format(java.util.Locale.FRANCE, "%.1f", margin)
        if (margin > 0 && margin < 1.2) return result(LiveServer.Probe.slow, "débit trop juste ici (×$factor)", margin = margin)
        return result(LiveServer.Probe.up, if (margin >= 2) "débit large (×$factor)" else if (margin > 0) "débit suffisant (×$factor)" else null, margin = margin)
    }

    /** Flux MPEG-TS continu : débit reçu pendant 3 s. */
    private suspend fun probeTransport(server: LiveServer, latency: Double): ProbeResult {
        val url = server.streamURL ?: return ProbeResult(LiveServer.Probe.untested)
        val started = System.currentTimeMillis()
        var received = 0L
        withTimeoutOrNull(3200) {
            withContext(Dispatchers.IO) {
                runCatching {
                    val req = request(url, server) ?: return@runCatching
                    Net.client(6.0).newCall(req).execute().use { answer ->
                        if (answer.code >= 400) return@use
                        val source = answer.body?.source() ?: return@use
                        val buffer = okio.Buffer()
                        val deadline = started + 3000
                        while (System.currentTimeMillis() < deadline && received < 1_500_000) {
                            val read = source.read(buffer, 65_536)
                            if (read < 0) break
                            received += read
                            buffer.clear()
                        }
                    }
                }
            }
        }
        val seconds = maxOf(0.5, (System.currentTimeMillis() - started) / 1000.0)
        val rate = received / seconds
        if (received < 32_768) return ProbeResult(LiveServer.Probe.stale, latency, format = LiveServer.Format.ts, note = "flux MPEG-TS presque vide")
        if (rate < 120_000) return ProbeResult(LiveServer.Probe.slow, latency, format = LiveServer.Format.ts, note = "MPEG-TS · ${(rate * 8 / 1000).toInt()} kbit/s reçus")
        return ProbeResult(LiveServer.Probe.up, latency, format = LiveServer.Format.ts, note = String.format(java.util.Locale.FRANCE, "MPEG-TS · %.1f Mbit/s reçus", rate * 8 / 1_000_000))
    }

    /** Page d'un lecteur web : réponse, protection anti-robot, lecteur présent. */
    private suspend fun probePage(server: LiveServer): ProbeResult {
        val url = server.pageURL ?: return ProbeResult(LiveServer.Probe.untested)
        val began = System.currentTimeMillis()
        fun ms() = (System.currentTimeMillis() - began).toDouble()
        return when (val answer = fetchHead(request(url, server, page = true), 262_144, 12.0)) {
            Fetch.TimedOut -> ProbeResult(LiveServer.Probe.late, ms(), note = "page sans réponse en 12 s")
            Fetch.Failed -> ProbeResult(LiveServer.Probe.down, ms(), note = "site injoignable")
            is Fetch.Done -> {
                val html = String(answer.data, Charsets.UTF_8).lowercase()
                when {
                    listOf("cf-chl", "just a moment", "challenge-platform", "ddos-guard").any { html.contains(it) } -> ProbeResult(LiveServer.Probe.late, ms(), note = "site protégé (vérification anti-robot)")
                    answer.status >= 400 -> ProbeResult(LiveServer.Probe.down, ms(), note = "page : " + statusNote(answer.status))
                    listOf("<video", "<iframe", ".m3u8", "jwplayer", "clappr", "hls.js", "hls.min.js", "videojs", "video.js", "plyr", "shaka", "mpegts", "flowplayer", "player").any { html.contains(it) } ->
                        ProbeResult(LiveServer.Probe.up, ms(), note = "lecteur présent sur la page")
                    (html.contains("404") && (html.contains("not found") || html.contains("introuvable"))) || html.trim().length < 64 -> ProbeResult(LiveServer.Probe.noVideo, ms(), note = "page vide ou introuvable")
                    else -> ProbeResult(LiveServer.Probe.up, ms(), note = "page en ligne")
                }
            }
        }
    }

    /** Tests de plusieurs serveurs, 6 à la fois ; chaque résultat est remis dès qu'il arrive (fil principal). */
    suspend fun probeMany(servers: List<LiveServer>, apply: (String, ProbeResult) -> Unit) = coroutineScope {
        val gate = Semaphore(6)
        servers.map { server ->
            async {
                val result = gate.withPermit { probe(server) }
                withContext(Dispatchers.Main) { apply(server.id, result) }
            }
        }.awaitAll()
    }
}
