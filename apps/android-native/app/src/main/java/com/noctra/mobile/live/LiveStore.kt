package com.noctra.mobile.live

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Prefs
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.TVSourceRoute
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.flag
import com.noctra.mobile.core.str
import com.noctra.mobile.core.strings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.net.URLEncoder
import java.time.Instant
import java.time.OffsetDateTime

/** Entrée d'une source pour une chaîne : source, identifiant de la source, fiche brute. */
data class LiveEntry(val source: String, val sourceId: String, val raw: JsonMap)

/** Chaîne, éventuellement proposée par plusieurs sources (réunies par leur nom et leur pays). */
class LiveChannel(val id: String, val name: String, val logo: String?, val group: String?, val country: String, val entries: List<LiveEntry>) {
    var number: Int = 0

    val vip: Boolean get() = entries.any { it.raw.flag("vipPlayback") }
    val raw: JsonMap get() = entries.firstOrNull()?.raw ?: emptyMap()
    val home: String? get() = raw.str("homeName")
    val away: String? get() = raw.str("awayName")
    val league: String? get() = listOf(raw["leagueName"], raw["category"], raw["group"]).mapNotNull { it as? String }.firstOrNull { it.isNotEmpty() }
    val score: String? get() = raw.str("score")
    val isLive: Boolean get() = entries.any { it.raw.flag("isLive") }
    val start: Long? get() = date(raw["startTime"])
    val secondaryLogo: String? get() = raw.str("secondaryLogo")

    override fun equals(other: Any?) = other is LiveChannel && other.id == id
    override fun hashCode() = id.hashCode()

    companion object {
        /** Date d'un évènement (secondes, millisecondes ou ISO 8601) en millisecondes. */
        fun date(value: Any?): Long? = when (value) {
            is Number -> value.toDouble().let { if (it > 10_000_000_000) it.toLong() else (it * 1000).toLong() }
            is String -> value.toDoubleOrNull()?.let { date(it) } ?: runCatching { OffsetDateTime.parse(value).toInstant().toEpochMilli() }.getOrNull()
                ?: runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()
            else -> null
        }
    }
}

/** Catalogue d'une source, préparé hors du fil principal (noms, pays et clés calculés). */
class Catalog(val source: String, val sourceId: String, val entries: List<Entry>, val events: List<Entry>, val vip: JsonMap?) {
    data class Entry(val key: String, val name: String, val logo: String?, val group: String?, val country: String, val raw: JsonMap)

    companion object {
        private val versus = Regex("\\s(?:vs\\.?|v\\.?|contre)\\s", RegexOption.IGNORE_CASE)
        private val timed = Regex("\\s[x×]\\s|\\b\\d{1,2}[:h]\\d{2}\\b")

        /** Chaînes lisibles d'une source, et à part les évènements (matchs du jour). */
        fun prepare(list: List<JsonMap>, sports: Boolean): Pair<List<Entry>, List<Entry>> {
            val channels = mutableListOf<Entry>()
            val events = mutableListOf<Entry>()
            for (raw in list) {
                val name = raw.str("name") ?: continue
                val playable = raw.str("streamUrl") != null || raw["resolverUrl"] != null || raw["embedUrl"] != null || raw["externalUrl"] != null || raw["vipFallbackUrl"] != null
                if (!playable) continue
                val home = raw.str("homeName") ?: ""
                val away = raw.str("awayName") ?: ""
                val match = (home.isNotEmpty() && away.isNotEmpty()) || versus.containsMatchIn(name)
                val dated = sports && (raw.str("eventId") != null || raw["startTime"] != null || timed.containsMatchIn(name))
                if (raw.flag("isEvent") || match || dated) {
                    // Même match proposé par plusieurs sources : une seule ligne, tous les serveurs.
                    val key = "event:" + if (home.isNotEmpty() && away.isNotEmpty()) ChannelNaming.normalize(home) + "|" + ChannelNaming.normalize(away) else ChannelNaming.normalize(name)
                    events += Entry(key, name, raw.str("logo"), raw.str("group"), "", raw)
                    continue
                }
                val country = ChannelNaming.country(raw)
                channels += Entry(ChannelNaming.key(name, country), name, raw.str("logo"), raw.str("group"), country, raw)
            }
            return channels to events
        }

        /** Évènements de toutes les sources Sport réunis, en direct d'abord puis par horaire. */
        fun mergeEvents(catalogs: List<Catalog>): List<LiveChannel> {
            val byKey = LinkedHashMap<String, Triple<String, String?, MutableList<LiveEntry>>>()
            for (catalog in catalogs) for (entry in catalog.events) {
                byKey.getOrPut(entry.key) { Triple(entry.name, entry.logo, mutableListOf()) }.third += LiveEntry(catalog.source, catalog.sourceId, entry.raw)
            }
            val limit = System.currentTimeMillis() - 5 * 3600 * 1000L
            return byKey.map { (key, value) -> LiveChannel(key, value.first, value.second, null, "", value.third) }
                .filter { channel -> val start = channel.start; !(start != null && start < limit && !channel.isLive) }
                .sortedWith(compareBy<LiveChannel>({ !it.isLive }, { it.start ?: Long.MAX_VALUE }))
        }

        class Merged(val channels: List<LiveChannel>, val countries: Map<String, Int>, val categories: Map<String, List<String>>)

        private val trailingCode = Regex("\\s[A-Z]{2,3}$")

        /** Chaînes de toutes les sources réunies, nom le plus soigné, catégorie, numéros TNT. */
        fun merge(catalogs: List<Catalog>): Merged {
            class Builder(var country: String) {
                val names = mutableListOf<String>()
                var logo: String? = null
                val groups = HashMap<String, Int>()
                val entries = mutableListOf<LiveEntry>()
            }
            val byKey = LinkedHashMap<String, Builder>()
            for (catalog in catalogs) for (entry in catalog.entries) {
                val builder = byKey.getOrPut(entry.key) { Builder(entry.country) }
                if (builder.country.isEmpty()) builder.country = entry.country
                if (builder.logo == null) builder.logo = entry.logo
                entry.group?.takeIf { it.isNotEmpty() }?.let { builder.groups[it] = (builder.groups[it] ?: 0) + 1 }
                builder.names += entry.name
                builder.entries += LiveEntry(catalog.source, catalog.sourceId, entry.raw)
            }
            val channels = byKey.map { (key, builder) ->
                val digits = key.filter { it.isDigit() }
                var name: String
                if (builder.country.isNotEmpty() && builder.country != "fr") {
                    name = ChannelNaming.cleanName(builder.names[0])
                    if (builder.country.length == 2 && !trailingCode.containsMatchIn(name)) name += " " + builder.country.uppercase()
                } else name = ChannelNaming.displayName(builder.names, digits)
                val groups = builder.groups.entries.sortedByDescending { it.value }.map { it.key }
                LiveChannel(key, name, builder.logo, ChannelNaming.category(name, groups), builder.country, builder.entries)
            }.sortedBy { ChannelNaming.normalize(it.name) }
            // Numéros : TNT pour les chaînes françaises (1 TF1, 2 France 2…), puis 30, 31…
            val used = HashSet<Int>()
            var next = 30
            for (channel in channels) if (channel.country == "fr" || channel.country.isEmpty()) {
                ChannelNaming.tntNumbers[channel.id]?.takeIf { it !in used }?.let { channel.number = it; used += it }
            }
            for (channel in channels) if ((channel.country == "fr" || channel.country.isEmpty()) && channel.number == 0) { channel.number = next; next += 1 }
            val countries = HashMap<String, Int>()
            val categories = HashMap<String, MutableSet<String>>()
            for (channel in channels) {
                val code = channel.country.ifEmpty { "?" }
                countries[code] = (countries[code] ?: 0) + 1
                channel.group?.let { categories.getOrPut(code) { mutableSetOf() } += it; categories.getOrPut("") { mutableSetOf() } += it }
            }
            return Merged(channels, countries, categories.mapValues { (_, set) -> ChannelNaming.categoryOrder.filter { it in set } })
        }
    }
}

/** Catalogues TV du serveur Noctra, favoris, chaînes récentes, pays choisi, accès VIP. */
object LiveStore {
    var sources by mutableStateOf<List<TVSourceRoute>>(emptyList())
        private set
    var channels by mutableStateOf<List<LiveChannel>>(emptyList())
        private set
    var loadedSources by mutableIntStateOf(0)
        private set
    var loading by mutableStateOf(false)
        private set
    var failed by mutableStateOf(false)
        private set
    var favorites by mutableStateOf(Prefs.strings("noctra.tv.favorites").toSet())
        private set
    var recents by mutableStateOf(Prefs.strings("noctra.tv.recents"))
        private set
    var countries by mutableStateOf<Map<String, Int>>(emptyMap())
        private set
    /** Matchs et évènements du jour (sources Sport), tous serveurs réunis. */
    var events by mutableStateOf<List<LiveChannel>>(emptyList())
        private set
    /** Rubrique et description de chaque source (chaînes, sports, alternatives, personnelles). */
    var sourceInfo by mutableStateOf<Map<String, Pair<String, String>>>(emptyMap())
        private set
    var categoriesByCountry by mutableStateOf<Map<String, List<String>>>(emptyMap())
        private set
    var liveWatchVip by mutableStateOf(false)
        private set
    var liveWatchConfigured by mutableStateOf(false)
        private set
    var providerKeys by mutableStateOf<Map<String, Boolean>>(emptyMap())
        private set
    /** Pays affiché : France par défaut, les autres au choix. */
    var country by mutableStateOf(Prefs.string("noctra.tv.country") ?: "fr")
        private set
    private var loadedAt = 0L

    fun setCountry(value: String) { country = value; Prefs.set("noctra.tv.country", value) }

    val categories: List<String> get() = categoriesByCountry[country] ?: emptyList()

    /** Pays proposés : France, tous, puis les autres par nombre de chaînes. */
    val countryChoices: List<String>
        get() = listOf("fr", "") + countries.filter { it.key != "fr" && it.key != "?" }.entries.sortedByDescending { it.value }.map { it.key } + if (countries["?"] != null) listOf("?") else emptyList()

    suspend fun loadSources() {
        val list = runCatching { Session.noctraJSON("/api/tv/sources").asMap()?.get("sources").asMaps() }.getOrNull()
        if (list == null) { failed = sources.isEmpty(); return }
        failed = false
        val info = mutableMapOf<String, Pair<String, String>>()
        sources = list.mapNotNull { entry ->
            val id = entry.str("id") ?: return@mapNotNull null
            if (entry["enabled"] == false) return@mapNotNull null
            info[id] = (entry.str("section") ?: "channels") to (entry.str("description") ?: "")
            TVSourceRoute(id, entry.str("name") ?: id, null)
        }
        sourceInfo = info
    }

    /** Accès VIP actifs sur le serveur (comme sur la version web). */
    suspend fun loadAccess() {
        runCatching { Session.noctraJSON("/api/tv/livewatch/session", 15.0).asMap() }.getOrNull()?.let { status ->
            liveWatchConfigured = status.flag("configured")
            liveWatchVip = status.flag("active") && status["isVip"] != false
        }
        if (Session.isAdmin) runCatching { Session.noctraJSON("/api/tv/provider-keys", 15.0).asMap() }.getOrNull()?.let { keys ->
            providerKeys = keys.mapNotNull { (k, v) -> (v as? Boolean)?.let { k to it } }.toMap()
        }
    }

    private fun encode(value: String) = URLEncoder.encode(value, "UTF-8")

    /** Toutes les chaînes : catalogues chargés 6 à la fois (bouquets compris), réunis par nom et par pays. */
    suspend fun loadAll(force: Boolean = false) {
        if (loading || !(force || channels.isEmpty() || System.currentTimeMillis() - loadedAt > 1_800_000)) return
        loading = true
        try {
            if (sources.isEmpty()) { Session.establishNoctraSession(); loadSources() }
            Session.scope.launch { loadAccess() }
            loadedSources = 0
            val catalogs = mutableListOf<Catalog>()
            val lock = Mutex()
            val gate = Semaphore(6)
            val sections = sourceInfo.mapValues { it.value.first }
            suspend fun fetch(source: TVSourceRoute, ref: String?): Pair<Catalog, List<String>> {
                val path = if (ref != null) "/api/tv/catalog?ref=" + encode(ref) else "/api/tv/catalog?source=" + encode(source.id)
                val json = runCatching { Session.noctraJSON(path, 45.0).asMap() }.getOrNull()
                val list = json?.get("channels").asMaps()
                // Noms, pays et clés calculés hors du fil principal.
                val prepared = withContext(Dispatchers.Default) { Catalog.prepare(list, sections[source.id] == "sports") }
                val groups = if (ref == null) json?.get("groups").asMaps().mapNotNull { it.str("ref") }.take(60) else emptyList()
                return Catalog(source.name, source.id, prepared.first, prepared.second, json?.get("liveWatchVip").asMap()) to groups
            }
            var merges = 0
            suspend fun visit(source: TVSourceRoute, ref: String?) {
                val (catalog, refs) = gate.withPermit { fetch(source, ref) }
                val snapshot = lock.withLock {
                    catalogs += catalog
                    loadedSources += 1
                    merges += 1
                    if (catalog.vip?.flag("active") == true) liveWatchVip = true
                    if (merges % 4 == 0 || channels.isEmpty()) catalogs.toList() else null
                }
                // Liste affichée au fil du chargement.
                if (snapshot != null) apply(withContext(Dispatchers.Default) { Catalog.merge(snapshot) })
                // Source en bouquets : les chaînes de chaque bouquet.
                coroutineScope { refs.map { async { visit(source, it) } }.awaitAll() }
            }
            coroutineScope { sources.map { source -> async { visit(source, null) } }.awaitAll() }
            val snapshot = lock.withLock { catalogs.toList() }
            val merged = withContext(Dispatchers.Default) { Catalog.merge(snapshot) }
            val matches = withContext(Dispatchers.Default) { Catalog.mergeEvents(snapshot) }
            apply(merged)
            events = matches
            loadedAt = System.currentTimeMillis()
        } finally {
            loading = false
        }
    }

    private fun apply(merged: Catalog.Companion.Merged) {
        channels = merged.channels
        countries = merged.countries
        categoriesByCountry = merged.categories
    }

    fun toggleFavorite(channel: LiveChannel) {
        favorites = if (channel.id in favorites) favorites - channel.id else favorites + channel.id
        Prefs.setStrings("noctra.tv.favorites", favorites.toList())
    }

    fun noteRecent(channel: LiveChannel) {
        recents = (listOf(channel.id) + recents.filter { it != channel.id }).take(24)
        Prefs.setStrings("noctra.tv.recents", recents)
    }
}

/** État de la fenêtre « Serveurs » d'une chaîne. */
class LivePick(val channel: LiveChannel) {
    var servers by mutableStateOf<List<LiveServer>>(emptyList())
    var preparing by mutableStateOf(true)
    var countdown by mutableIntStateOf(4)
    var auto by mutableStateOf(true)
    var launching by mutableStateOf(false)

    val best: LiveServer?
        get() = servers.firstOrNull { it.probe != LiveServer.Probe.down && it.probe != LiveServer.Probe.noVideo && it.probe != LiveServer.Probe.stale && !it.manualOnly } ?: servers.firstOrNull()

    fun update(id: String, change: (LiveServer) -> LiveServer) { servers = servers.map { if (it.id == id) change(it) else it } }
}

/** Lancement d'une chaîne : serveurs de toutes les sources classés, testés, meilleur serveur lancé tout seul dans le lecteur TV. */
object LiveLauncher {
    var problem by mutableStateOf<String?>(null)
    var pick by mutableStateOf<LivePick?>(null)
        private set
    var opening by mutableStateOf<String?>(null)
        private set
    private var context: List<LiveChannel> = emptyList()

    /** Fenêtre des serveurs à chaque lancement (sinon : meilleur serveur directement). */
    var showPicker: Boolean
        get() = Prefs.bool("noctra.tv.picker", true)
        set(value) = Prefs.set("noctra.tv.picker", value)

    fun dismissPick() {
        pick?.auto = false
        pick = null
    }

    /** Serveurs de toutes les sources ; les automatiques (VIP compris) demandés tout de suite, 4 s au plus. */
    suspend fun prepare(channel: LiveChannel): List<LiveServer> = coroutineScope {
        val initial = LiveServerFactory.servers(channel)
        val expanded = initial.map { server ->
            async {
                if (server.kind != LiveServer.Kind.resolve) listOf(server)
                else LiveServerFactory.resolve(server, 4.0).ifEmpty { listOf(server) }
            }
        }.awaitAll().flatten()
        LiveHealth.rank(LiveHealth.withCachedProbes(expanded, channel.id), channel.id)
    }

    fun open(channel: LiveChannel, context: List<LiveChannel> = emptyList()) {
        if (opening != null) return
        opening = channel.id
        this.context = context
        LiveStore.noteRecent(channel)
        val pick = LivePick(channel)
        if (showPicker) this.pick = pick
        Session.scope.launch {
            try {
                pick.servers = prepare(channel)
                pick.preparing = false
                if (pick.servers.isEmpty()) {
                    if (this@LiveLauncher.pick === pick) this@LiveLauncher.pick = null
                    problem = "Aucun serveur ne propose « ${channel.name} » pour le moment."
                    return@launch
                }
                if (!showPicker) { pick.servers.firstOrNull()?.let { start(pick, it) }; return@launch }
                // Tests des flux pendant le compte à rebours.
                val probing = launch { probe(pick) }
                while (pick.countdown > 0 && pick.auto && !pick.launching && this@LiveLauncher.pick === pick) {
                    delay(1000)
                    pick.countdown -= 1
                }
                if (!pick.auto || pick.launching || this@LiveLauncher.pick !== pick) return@launch
                pick.servers = LiveHealth.rank(pick.servers, channel.id)
                pick.best?.let { start(pick, it) }
                probing.cancel()
            } finally {
                opening = null
            }
        }
    }

    private suspend fun probe(pick: LivePick) {
        val targets = pick.servers.filter { it.testable && it.probe == LiveServer.Probe.untested }.take(20)
        for (target in targets) pick.update(target.id) { it.copy(probe = LiveServer.Probe.testing) }
        LiveServerFactory.probeMany(targets) { id, result ->
            pick.update(id) { it.applied(result) }
            pick.servers.firstOrNull { it.id == id }?.let { server ->
                LiveHealth.cache(result, server, pick.channel.id)
                if (result.state == LiveServer.Probe.down || result.state == LiveServer.Probe.noVideo) LiveHealth.record(server, pick.channel.id, false)
            }
        }
    }

    /** Serveur choisi (ou meilleur) : lancé dans le lecteur TV, les autres en relais. */
    fun start(pick: LivePick, server: LiveServer) {
        if (pick.launching) return
        pick.launching = true
        pick.auto = false
        val ranked = LiveHealth.rank(pick.servers, pick.channel.id)
        val ordered = listOf(server) + ranked.filter { it.id != server.id }
        if (this.pick === pick) this.pick = null
        LivePlayerModel.start(pick.channel, ordered, server, context)
    }
}
