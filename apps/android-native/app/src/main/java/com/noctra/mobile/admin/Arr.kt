package com.noctra.mobile.admin

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RssFeed
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Prefs
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.flag
import com.noctra.mobile.core.int
import com.noctra.mobile.core.map
import com.noctra.mobile.core.maps
import com.noctra.mobile.core.str
import com.noctra.mobile.core.strings
import com.noctra.mobile.ui.AuroraBackground
import com.noctra.mobile.ui.AuroraPalette
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.Notices
import com.noctra.mobile.ui.ProgressLine
import com.noctra.mobile.ui.RemoteImage
import com.noctra.mobile.ui.SearchField
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.TopBar
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import com.noctra.mobile.ui.rememberPush
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.net.URLEncoder
import java.text.DateFormat
import java.util.Date
import java.util.Locale

// Radarr (films) et Sonarr (séries) via le serveur Noctra : vue d'ensemble,
// bibliothèque, manquants, calendrier, file d'attente, historique, ajout,
// et recherche interactive (releases des indexeurs, envoi au client).

enum class ArrKind(val key: String, val label: String) {
    Radarr("radarr", "Radarr"), Sonarr("sonarr", "Sonarr")
}

private enum class ArrSection(val label: String, val key: String) {
    overview("Vue d’ensemble", "overview"), library("Bibliothèque", "library"), wanted("Manquants", "wanted"),
    calendar("Calendrier", "calendar"), queue("File", "queue"), history("Historique", "history"), add("Ajouter", "add")
}

private fun encode(value: String) = URLEncoder.encode(value, "UTF-8")

@Composable
fun ArrHubScreen(kind: ArrKind) {
    var view by remember { mutableStateOf(ArrSection.overview) }
    Box(Modifier.fillMaxSize()) {
        AuroraBackground(AuroraPalette.requests)
        Column(Modifier.fillMaxSize()) {
            TopBar(kind.label)
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ArrSection.entries.forEach { section ->
                    val active = section == view
                    Text(section.label, color = if (active) Theme.onAccent else Theme.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(CircleShape).background(if (active) Theme.accent else Color(0x991A1D33)).focusRing(CircleShape).clickable { view = section }.padding(horizontal = 14.dp, vertical = 9.dp))
                }
            }
            AnimatedContent(view, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "arr", modifier = Modifier.weight(1f)) { section ->
                when (section) {
                    ArrSection.overview -> ArrOverview(kind)
                    ArrSection.library, ArrSection.wanted -> ArrLibrary(kind, section == ArrSection.wanted)
                    ArrSection.calendar, ArrSection.queue, ArrSection.history -> ArrFeed(kind, section.key)
                    ArrSection.add -> ArrAdd(kind)
                }
            }
        }
    }
}

@Composable
private fun ArrList(content: LazyListScope.() -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 30.dp), content = content)
}

// MARK: Vue d'ensemble

@Composable
private fun ArrOverview(kind: ArrKind) {
    val scope = rememberCoroutineScope()
    val push = rememberPush()
    var data by remember { mutableStateOf<JsonMap>(emptyMap()) }
    var failed by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(kind) {
        try {
            data = Session.noctraSend("GET", "/api/servarr/center?type=${kind.key}&view=overview", null).asMap() ?: emptyMap()
            failed = null
        } catch (failure: Exception) {
            failed = "${kind.label} injoignable : ${failure.message}"
        }
    }
    fun command(name: String) {
        scope.launch { note = runCatching { Session.noctraSend("POST", "/api/servarr/command", mapOf("type" to kind.key, "name" to name)); "Commande envoyée à ${kind.label}." }.getOrElse { it.message } }
    }
    ArrList {
        failed?.let { text -> item { NoteLine(text, Theme.orange) } }
        val metrics = data.map("metrics")
        if (metrics == null && failed == null) item { LoadingLine() }
        if (metrics != null) {
            section {
                Value("Version", data.str("version") ?: "—")
                Value(if (kind == ArrKind.Radarr) "Films" else "Séries", "${metrics.int("total") ?: 0}")
                Value("Surveillés", "${metrics.int("monitored") ?: 0}")
                Value("Manquants", "${metrics.int("missing") ?: 0}")
                Value("Espace libre", AdminFormat.bytes(AdminFormat.number(metrics["freeSpace"])))
            }
            section {
                ActionLine("Synchroniser les flux RSS", Icons.Filled.RssFeed) { command("RssSync") }
                ActionLine("Actualiser les téléchargements", Icons.Filled.Refresh) { command("RefreshMonitoredDownloads") }
                ActionLine("Chercher tout ce qui manque", Icons.Filled.Search) { command(if (kind == ArrKind.Radarr) "MoviesSearch" else "SeriesSearch") }
                note?.let { NoteLine(it) }
            }
        }
        val health = data.maps("health")
        if (health.isNotEmpty()) section("Santé") { health.forEach { AdminRow(it.str("message") ?: "", icon = Icons.Filled.Warning, tint = Theme.orange) } }
        val queue = data.maps("queue")
        if (queue.isNotEmpty()) section("Téléchargements en cours") { queue.forEachIndexed { i, item -> if (i > 0) RowDivider(); QueueRow(item) } }
        val calendar = data.maps("calendar")
        if (calendar.isNotEmpty()) section("À venir") { calendar.forEachIndexed { i, item -> if (i > 0) RowDivider(); CalendarRow(item) } }
        val recent = data.maps("recent")
        if (recent.isNotEmpty()) section("Ajoutés récemment") { recent.forEachIndexed { i, item -> if (i > 0) RowDivider(); ItemRow(item) { push { ArrItemScreen(kind, item) } } } }
    }
}

@Composable
private fun Value(title: String, value: String) {
    AdminRow(title, trailing = { Text(value, color = Theme.muted, fontSize = 14.sp) })
}

// MARK: Bibliothèque et manquants

@Composable
private fun ArrLibrary(kind: ArrKind, wanted: Boolean) {
    val push = rememberPush()
    var entries by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var page by remember { mutableStateOf(1) }
    var total by remember { mutableStateOf(Int.MAX_VALUE) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    suspend fun load(reset: Boolean) {
        if (reset) { page = 1; total = Int.MAX_VALUE }
        if (loading || (page - 1) * 40 >= total) return
        loading = true
        try {
            val json = runCatching {
                Session.noctraJSON("/api/servarr/center?type=${kind.key}&view=${if (wanted) "wanted" else "library"}&page=$page&pageSize=40&q=${encode(query)}", 45.0).asMap()
            }.getOrNull() ?: return
            val fresh = json.maps("items")
            entries = if (reset) fresh else entries + fresh
            total = json.int("totalRecords") ?: entries.size
            page += 1
        } finally {
            loading = false
        }
    }
    LaunchedEffect(query) { delay(300); load(true) }
    ArrList {
        item { SearchField(query, "Rechercher dans ${kind.label}", Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) { query = it } }
        items(entries.size) { index ->
            val item = entries[index]
            if (index == entries.size - 1) LaunchedEffect(entries.size) { load(false) }
            Column(Modifier.padding(horizontal = 16.dp)) {
                ItemRow(item) { push { ArrItemScreen(kind, item) } }
                RowDivider()
            }
        }
        if (loading) item { LoadingLine() }
        if (!loading && entries.isEmpty()) item { NoteLine(if (wanted) "Rien ne manque." else "Aucun résultat.", Theme.muted) }
    }
}

@Composable
private fun ItemRow(item: JsonMap, open: () -> Unit) {
    val progress = item.int("progress") ?: 0
    val parts = listOfNotNull(item["year"]?.let { (it as? Number)?.toInt()?.toString() ?: it.toString() }, item.str("status")).filter { it.isNotEmpty() }
    val state = listOfNotNull(if (item.flag("monitored")) "Surveillé" else null, if (item.flag("hasFile")) "Disponible" else "Manquant", if (progress in 1..99) "$progress %" else null)
    AdminRow(item.str("title") ?: "", detail = (parts + state).joinToString(" · "), detailColor = if (item.flag("hasFile")) Theme.teal else Theme.orange, onClick = open,
        leading = { RemoteImage(item.str("poster"), Modifier.size(44.dp, 66.dp).clip(RoundedCornerShape(8.dp))) })
}

/** Film ou série de Radarr / Sonarr : surveillance, recherches, saisons et épisodes. */
@Composable
fun ArrItemScreen(kind: ArrKind, item: JsonMap) {
    val scope = rememberCoroutineScope()
    val push = rememberPush()
    val id = item.int("serviceId") ?: item.int("id") ?: 0
    val episodeId = item.int("episodeId")
    val title = item.str("title") ?: ""
    var monitored by remember { mutableStateOf(item.flag("monitored")) }
    var note by remember { mutableStateOf<String?>(null) }
    var episodes by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var seasons by remember { mutableStateOf<List<Int>>(emptyList()) }
    LaunchedEffect(id) {
        if (kind == ArrKind.Sonarr && episodeId == null) {
            runCatching { Session.noctraJSON("/api/servarr/episodes?seriesId=$id", 30.0).asMap() }.getOrNull()?.let { json ->
                seasons = (json["seasons"] as? List<*>)?.mapNotNull { (it as? Number)?.toInt() } ?: emptyList()
                episodes = json.maps("episodes")
            }
        }
    }
    fun command(name: String) {
        scope.launch {
            note = runCatching {
                Session.noctraSend("POST", "/api/servarr/command", mapOf("type" to kind.key, "name" to name, (if (kind == ArrKind.Radarr) "movieId" else "seriesId") to id))
                "Commande envoyée à ${kind.label}."
            }.getOrElse { it.message }
        }
    }
    AdminScaffold(title.ifEmpty { kind.label }, AuroraPalette.requests) {
        item {
            Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                RemoteImage(item.str("poster"), Modifier.size(90.dp, 135.dp).clip(RoundedCornerShape(12.dp)))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(title, style = Theme.display(20), color = Theme.ink)
                    item.str("path")?.let { Text(it, color = Theme.muted, fontSize = 11.sp, fontFamily = FontFamily.Monospace) }
                    AdminFormat.number(item["sizeOnDisk"]).takeIf { it > 0 }?.let { Text(AdminFormat.bytes(it), color = Theme.muted, fontSize = 12.sp) }
                }
            }
        }
        if (episodeId == null) section {
            ToggleLine("Surveillé", monitored) { value ->
                monitored = value
                scope.launch {
                    note = runCatching {
                        Session.noctraSend("POST", "/api/servarr/monitor", mapOf("type" to kind.key, "id" to id, "monitored" to value))
                        if (value) "Surveillance activée." else "Surveillance désactivée."
                    }.getOrElse { it.message }
                }
            }
        }
        section("Recherche") {
            ActionLine(if (kind == ArrKind.Sonarr && episodeId == null) "Recherche interactive · série complète" else "Recherche interactive", Icons.Filled.Search) {
                push {
                    when {
                        kind == ArrKind.Radarr -> InteractiveSearchScreen(kind, title, "id=$id")
                        episodeId != null -> InteractiveSearchScreen(kind, title, "id=$episodeId")
                        else -> InteractiveSearchScreen(kind, "$title · série complète", "seriesId=$id&allSeasons=1")
                    }
                }
            }
            if (episodeId == null) {
                ActionLine("Recherche automatique", Icons.Filled.Search) { command(if (kind == ArrKind.Radarr) "MoviesSearch" else "SeriesSearch") }
                ActionLine("Actualiser les informations", Icons.Filled.Refresh) { command(if (kind == ArrKind.Radarr) "RefreshMovie" else "RefreshSeries") }
                ActionLine("Analyser le dossier", Icons.Filled.Folder) { command(if (kind == ArrKind.Radarr) "RescanMovie" else "RescanSeries") }
                ActionLine("Changer de dossier", Icons.Filled.Folder) { push { ArrMoveScreen(kind, id, title, item.str("path") ?: "") } }
            }
            note?.let { NoteLine(it) }
        }
        if (kind == ArrKind.Sonarr && episodeId == null) for (season in seasons) section("Saison $season", key = "season-$season") {
            ActionLine("Recherche interactive · saison $season", Icons.Filled.Search) { push { InteractiveSearchScreen(kind, "$title · saison $season", "seriesId=$id&seasonNumber=$season") } }
            episodes.filter { it.int("seasonNumber") == season }.forEach { episode ->
                RowDivider()
                val number = episode.int("episodeNumber") ?: 0
                AdminRow("$number. ${episode.str("title") ?: ""}", onClick = { push { InteractiveSearchScreen(kind, "$title · S${season}E$number", "id=${episode.int("id") ?: 0}") } },
                    trailing = { Icon(if (episode.flag("hasFile")) Icons.Filled.CheckCircle else Icons.Filled.Schedule, contentDescription = null, tint = if (episode.flag("hasFile")) Theme.teal else Theme.orange, modifier = Modifier.size(20.dp)) })
            }
        }
    }
}

// MARK: Calendrier, file d'attente, historique

private val eventLabels = mapOf("grabbed" to "Récupéré", "downloadFolderImported" to "Importé", "downloadFailed" to "Échec", "movieFileDeleted" to "Fichier supprimé",
    "episodeFileDeleted" to "Fichier supprimé", "movieFileRenamed" to "Renommé", "episodeFileRenamed" to "Renommé", "downloadIgnored" to "Ignoré")

@Composable
private fun ArrFeed(kind: ArrKind, view: String) {
    var items by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    LaunchedEffect(view) {
        while (isActive) {
            runCatching { Session.noctraJSON("/api/servarr/center?type=${kind.key}&view=$view&pageSize=60", 45.0).asMap() }.getOrNull()?.let { items = it.maps("items") }
            loaded = true
            if (view != "queue") break
            delay(5000)
        }
    }
    ArrList {
        if (!loaded) item { LoadingLine() }
        if (loaded && items.isEmpty()) item { NoteLine("Rien pour le moment.", Theme.muted) }
        section {
            items.forEachIndexed { index, item ->
                if (index > 0) RowDivider()
                when (view) {
                    "queue" -> QueueRow(item)
                    "calendar" -> CalendarRow(item)
                    else -> AdminRow(item.str("title") ?: "", detail = listOfNotNull(
                        listOfNotNull(eventLabels[item.str("eventType") ?: ""] ?: item.str("eventType"), item.str("quality"), item.str("indexer")).filter { it.isNotEmpty() }.joinToString(" · "),
                        item.str("sourceTitle"), AdminFormat.relative(item["date"])
                    ).filter { it.isNotEmpty() }.joinToString("\n"))
                }
            }
        }
    }
}

@Composable
private fun QueueRow(item: JsonMap) {
    val size = AdminFormat.number(item["size"])
    val left = AdminFormat.number(item["sizeleft"])
    Column(Modifier.padding(bottom = 8.dp)) {
        AdminRow(item.str("title") ?: "", detail = listOfNotNull(item.str("status"), item.str("timeleft")?.let { "reste $it" }, item.str("downloadClient"), item.str("errorMessage")).filter { it.isNotEmpty() }.joinToString(" · "),
            detailColor = if (item.str("errorMessage") != null) Theme.orange else Theme.muted)
        if (size > 0) Box(Modifier.padding(horizontal = 16.dp)) { ProgressLine(((size - left) / size).coerceIn(0.0, 1.0)) }
    }
}

@Composable
private fun CalendarRow(item: JsonMap) {
    val date = AdminFormat.date(item["date"])
    AdminRow(item.str("title") ?: "", detail = date?.let { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale.FRANCE).format(Date(it)) },
        leading = { RemoteImage(item.str("poster"), Modifier.size(36.dp, 54.dp).clip(RoundedCornerShape(6.dp))) },
        trailing = { Icon(if (item.flag("hasFile")) Icons.Filled.CheckCircle else Icons.Filled.Schedule, contentDescription = null, tint = if (item.flag("hasFile")) Theme.teal else Theme.muted) })
}

// MARK: Ajout

@Composable
private fun ArrAdd(kind: ArrKind) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<JsonMap?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(query) {
        val term = query.trim()
        if (term.length < 2) { results = emptyList(); return@LaunchedEffect }
        delay(450)
        searching = true
        try {
            results = Session.noctraSend("GET", "/api/servarr/lookup?type=${kind.key}&q=${encode(term)}", null).asMap()?.maps("results") ?: emptyList()
            problem = null
        } catch (failure: Exception) {
            problem = failure.message
        } finally {
            searching = false
        }
    }
    ArrList {
        item { SearchField(query, if (kind == ArrKind.Radarr) "Film à ajouter" else "Série à ajouter", Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) { query = it } }
        problem?.let { text -> item { NoteLine(text, Theme.orange) } }
        if (searching) item { LoadingLine() }
        items(results.size) { index ->
            val result = results[index]
            Column(Modifier.padding(horizontal = 16.dp)) {
                AdminRow(result.str("title") ?: "", detail = listOfNotNull(
                    listOfNotNull(result["year"]?.let { (it as? Number)?.toInt()?.toString() }, result.str("network"), result.str("studio")).joinToString(" · "), result.str("overview")
                ).filter { it.isNotEmpty() }.joinToString("\n"), onClick = { selected = result },
                    leading = { RemoteImage(result.str("poster"), Modifier.size(44.dp, 66.dp).clip(RoundedCornerShape(8.dp))) })
                RowDivider()
            }
        }
    }
    selected?.let { lookup -> ArrAddSheet(kind, lookup) { selected = null } }
}

@Composable
private fun ArrAddSheet(kind: ArrKind, lookup: JsonMap, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var profiles by remember { mutableStateOf<List<Pair<Int, String>>>(emptyList()) }
    var folders by remember { mutableStateOf<List<String>>(emptyList()) }
    var profile by remember { mutableStateOf(0) }
    var folder by remember { mutableStateOf("") }
    var monitored by remember { mutableStateOf(true) }
    var search by remember { mutableStateOf(true) }
    var working by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        val settings = runCatching { Session.noctraJSON("/api/servarr/center?type=${kind.key}&view=add", 30.0).asMap()?.map("settings") }.getOrNull()
        if (settings == null) { problem = "Réglages de ${kind.label} indisponibles."; return@LaunchedEffect }
        profiles = settings.maps("qualityProfiles").mapNotNull { entry -> entry.int("id")?.let { it to (entry.str("name") ?: "Profil $it") } }
        folders = settings.maps("rootFolders").mapNotNull { it.str("path") }
        profile = profiles.firstOrNull()?.first ?: 0
        folder = folders.firstOrNull() ?: ""
    }
    NoctraSheet(onDismiss) {
        LazyColumn(Modifier.fillMaxWidth().padding(bottom = 20.dp)) {
            item { Text("Ajouter à ${kind.label}", style = Theme.display(20), color = Theme.ink, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) }
            section {
                AdminRow(lookup.str("title") ?: "")
                ChoiceLine("Profil de qualité", profiles, profile) { profile = it }
                ChoiceLine("Dossier", folders.map { it to it }, folder) { folder = it }
                ToggleLine("Surveiller", monitored) { monitored = it }
                ToggleLine(if (kind == ArrKind.Radarr) "Chercher le film tout de suite" else "Chercher les épisodes manquants", search) { search = it }
            }
            problem?.let { text -> item { NoteLine(text, Theme.orange) } }
            section {
                ActionLine("Ajouter", Icons.Filled.Download, enabled = profile != 0 && folder.isNotEmpty(), busy = working) {
                    working = true
                    scope.launch {
                        try {
                            Session.noctraSend("POST", "/api/servarr/add", mapOf("type" to kind.key, "item" to (lookup["raw"] ?: lookup), "qualityProfileId" to profile,
                                "rootFolderPath" to folder, "monitored" to monitored, "search" to search))
                            Notices.announce("« ${lookup.str("title") ?: ""} » ajouté à ${kind.label}.")
                            onDismiss()
                        } catch (failure: Exception) {
                            problem = failure.message
                        } finally {
                            working = false
                        }
                    }
                }
            }
        }
    }
}

// MARK: Recherche interactive

private enum class ReleaseSort(val label: String) {
    best("Conseillé"), seeders("Sources"), size("Taille"), age("Récent");

    /** Tri gardé pour le compte connecté sur cet appareil. */
    fun save() = Prefs.set(key(), name)

    companion object {
        private fun key() = "noctra.sort.${Session.userId ?: "anonyme"}.releases"
        fun saved(): ReleaseSort = Prefs.string(key())?.let { saved -> entries.firstOrNull { it.name == saved } } ?: best
    }

    fun apply(list: List<JsonMap>): List<JsonMap> = when (this) {
        best -> list
        seeders -> list.sortedByDescending { AdminFormat.number(it["seeders"]) }
        size -> list.sortedByDescending { AdminFormat.number(it["size"]) }
        age -> list.sortedBy { (it["ageHours"] as? Number)?.toDouble() ?: Double.MAX_VALUE }
    }
}

@Composable
private fun SortPicker(sort: ReleaseSort, select: (ReleaseSort) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).glass(CircleShape).padding(3.dp)) {
        ReleaseSort.entries.forEach { entry ->
            val active = entry == sort
            Box(Modifier.weight(1f).clip(CircleShape).background(if (active) Theme.accent else Color.Transparent).focusRing(CircleShape).clickable { select(entry) }.padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                Text(entry.label, color = if (active) Theme.onAccent else Theme.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun ReleaseRow(release: JsonMap, grabbed: Boolean, grabbing: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().focusRing(RoundedCornerShape(12.dp)).clickable(enabled = enabled, onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Text(release.str("title") ?: "", color = Theme.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 3)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Tag(release.str("quality"), Theme.lilac)
            Tag(AdminFormat.bytes(AdminFormat.number(release["size"])), Theme.cyan)
            (release["seeders"] as? Number)?.toInt()?.let { Tag("▲ $it", if (it > 0) Theme.teal else Theme.orange) }
            (release["ageHours"] as? Number)?.toDouble()?.let { Tag(if (it < 48) "${it.toInt()} h" else "${(it / 24).toInt()} j", Theme.muted) }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(listOfNotNull(release.str("indexer"), release.strings("languages").joinToString(", "), release.str("language")).filter { it.isNotEmpty() }.joinToString(" · "),
                color = Theme.muted, fontSize = 12.sp, maxLines = 1, modifier = Modifier.weight(1f))
            when {
                grabbing -> CircularProgressIndicator(color = Theme.accent, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                grabbed -> Text("✓ Envoyée", color = Theme.teal, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                release.flag("rejected") -> Text("Refusée par le profil", color = Theme.orange, fontSize = 11.sp)
                release.flag("approved") -> Text("Conforme", color = Theme.teal, fontSize = 11.sp)
            }
        }
    }
}

/** Releases proposées par les indexeurs pour un film, un épisode, une saison ou une série : tri, envoi au client par Radarr / Sonarr. */
@Composable
fun InteractiveSearchScreen(kind: ArrKind, title: String, query: String) {
    val scope = rememberCoroutineScope()
    var releases by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var warnings by remember { mutableStateOf<List<String>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf<String?>(null) }
    var sort by remember { mutableStateOf(ReleaseSort.saved()) }
    var grabbing by remember { mutableStateOf<String?>(null) }
    var grabbed by remember { mutableStateOf<Set<String>>(emptySet()) }
    var confirm by remember { mutableStateOf<Pair<String, JsonMap>?>(null) }
    var running by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf("") }
    var series by remember { mutableStateOf(false) }
    var integrals by remember { mutableStateOf(0) }
    var seasonPacks by remember { mutableStateOf(0) }
    var pack by remember { mutableStateOf("") }
    var generation by remember { mutableStateOf(0) }
    /** Recherche suivie comme sur le site : le serveur interroge les indexeurs (saison par saison pour une série complète) et renvoie les résultats au fur et à mesure. */
    suspend fun load(force: Boolean) {
        val token = ++generation
        loading = true
        var forced = force
        try {
            repeat(3600) {
                if (token != generation) return
                val json = Session.noctraSend("GET", "/api/servarr/releases?type=${kind.key}&$query&progress=1${if (forced) "&force=1" else ""}", null, 45.0).asMap()
                forced = false
                releases = json?.maps("releases") ?: emptyList()
                warnings = json?.strings("warnings") ?: emptyList()
                failed = json?.str("error")
                series = json?.str("searchKind") == "series"
                integrals = AdminFormat.number(json?.get("integralCount")).toInt()
                seasonPacks = AdminFormat.number(json?.get("seasonPackCount")).toInt()
                if (series && pack.isEmpty()) json?.str("packMode")?.let { pack = it }
                running = json?.flag("running") == true
                val total = AdminFormat.number(json?.get("total")).toInt()
                progress = if (total > 1) "${AdminFormat.number(json?.get("completed")).toInt()}/$total saisons interrogées" else "Interrogation des indexeurs…"
                if (!running) return
                delay(1000)
            }
        } catch (failure: kotlinx.coroutines.CancellationException) {
            throw failure
        } catch (failure: Exception) {
            failed = failure.message
        } finally {
            if (token == generation) { loading = false; running = false }
        }
    }
    LaunchedEffect(query) { load(false) }
    val shown = sort.apply(if (pack.isEmpty()) releases else releases.filter { it.str("packKind") == pack })
    AdminScaffold(title, AuroraPalette.requests, actions = { BarButton(Icons.Filled.Refresh, "Relancer la recherche") { scope.launch { load(true) } } }) {
        item { SortPicker(sort) { sort = it; it.save() } }
        // Série : intégrales (toutes saisons) ou packs de saisons complètes, comme sur le site.
        if (series) section { ChoiceLine("Type de pack", listOf("" to "Tout", "integral" to "Intégrales ($integrals)", "season" to "Saisons complètes ($seasonPacks)"), pack) { pack = it } }
        if (loading || running) item { LoadingLine(progress.ifEmpty { "Interrogation des indexeurs…" }) }
        failed?.let { text -> item { NoteLine(text, Theme.orange) } }
        warnings.forEach { text -> item { NoteLine(text, Theme.orange) } }
        if (!loading && releases.isEmpty() && failed == null) item { NoteLine("Aucune release trouvée.", Theme.muted) }
        section("${shown.size} résultat${if (shown.size > 1) "s" else ""}") {
            shown.forEachIndexed { index, release ->
                if (index > 0) RowDivider()
                val key = "${release["indexerId"] ?: 0}:${release.str("guid") ?: ""}"
                ReleaseRow(release, key in grabbed, grabbing == key, grabbing == null && key !in grabbed) { confirm = key to release }
            }
        }
    }
    confirm?.let { (key, release) ->
        Confirm("Télécharger cette release ?", release.str("title"), "Envoyer au client de téléchargement", destructive = false, onDismiss = { confirm = null }) {
            grabbing = key
            scope.launch {
                try {
                    Session.noctraSend("POST", "/api/servarr/grab", mapOf("type" to kind.key, "guid" to (release.str("guid") ?: ""), "indexerId" to (release.int("indexerId") ?: 0)))
                    grabbed = grabbed + key
                    Notices.announce("Release envoyée à ${kind.label}.")
                } catch (failure: Exception) {
                    failed = failure.message
                } finally {
                    grabbing = null
                }
            }
        }
    }
}

/** Recherche interactive d'une demande ou d'un titre de Découvrir : torrents des trackers (Prowlarr), envoyés à qBittorrent dans la destination choisie. */
@Composable
fun TrackerSearchScreen(mediaType: String, tmdbId: Int, title: String, year: String?) {
    val scope = rememberCoroutineScope()
    var releases by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var destinations by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var destination by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var message by remember { mutableStateOf<String?>(null) }
    var sort by remember { mutableStateOf(ReleaseSort.saved()) }
    var grabbed by remember { mutableStateOf<Set<String>>(emptySet()) }
    var grabbing by remember { mutableStateOf<String?>(null) }
    suspend fun load(force: Boolean) = coroutineScope {
        loading = true
        // Tous les indexeurs, en laissant aux trackers lents jusqu'à une minute (mode « patient » du serveur).
        var path = "/api/discovery/availability?mediaType=$mediaType&tmdbId=$tmdbId&title=${encode(title)}&limit=40&force=1&patient=1"
        if (year != null) path += "&year=$year"
        val found = async { runCatching { Session.noctraJSON(path, 120.0).asMap() }.getOrNull() }
        val options = async { runCatching { Session.noctraJSON("/api/discovery/download-options?mediaType=$mediaType&tmdbId=$tmdbId", 20.0).asMap() }.getOrNull() }
        val availability = found.await()
        releases = availability?.maps("releases") ?: emptyList()
        message = if (availability == null) "Les trackers ne répondent pas : réessaie dans un instant." else availability.str("message")
        val settings = options.await()
        destinations = settings?.maps("destinations")?.mapNotNull { entry -> entry.str("path")?.let { it to (entry.str("label") ?: it) } } ?: emptyList()
        // Dossier de la catégorie (animés, séries, films d'animation, films), jamais Trash par défaut.
        if (destination.isEmpty()) {
            val suggested = settings?.map("suggested")?.str("path")?.takeIf { path -> destinations.any { it.first == path } }
            destination = suggested ?: destinations.firstOrNull { !it.first.contains("trash", ignoreCase = true) }?.first ?: destinations.firstOrNull()?.first ?: ""
        }
        loading = false
    }
    LaunchedEffect(tmdbId) { load(false) }
    AdminScaffold(title, AuroraPalette.requests, actions = { BarButton(Icons.Filled.Refresh, "Relancer la recherche") { scope.launch { load(true) } } }) {
        item { SortPicker(sort) { sort = it; it.save() } }
        if (destinations.isNotEmpty()) section { ChoiceLine("Destination", destinations, destination) { destination = it } }
        if (loading) item { LoadingLine("Recherche sur les trackers…") }
        message?.let { text -> item { NoteLine(text, Theme.orange) } }
        section("${releases.size} torrent${if (releases.size > 1) "s" else ""}") {
            sort.apply(releases).forEachIndexed { index, release ->
                if (index > 0) RowDivider()
                val key = release.str("downloadId") ?: "$index"
                ReleaseRow(release, key in grabbed, grabbing == key, grabbing == null && key !in grabbed) {
                    grabbing = key
                    scope.launch {
                        try {
                            val body = mutableMapOf<String, Any?>("downloadId" to key, "startPaused" to false)
                            if (destination.isNotEmpty()) body["savePath"] = destination
                            Session.noctraSend("POST", "/api/discovery/grab", body)
                            grabbed = grabbed + key
                            Notices.announce("Torrent envoyé à qBittorrent.")
                        } catch (failure: Exception) {
                            message = failure.message
                        } finally {
                            grabbing = null
                        }
                    }
                }
            }
        }
    }
}

// MARK: Recherche interactive depuis Découvrir et les demandes

/**
 * Recherche interactive comme sur le site : film → releases Radarr ; série → œuvre complète
 * (intégrales et toutes saisons), pack d'une saison ou épisode ; torrents des trackers en plus.
 */
@Composable
fun ReleaseSearchHubScreen(mediaType: String, tmdbId: Int, title: String, year: String?, initialServiceId: Int?) {
    val push = rememberPush()
    val kind = if (mediaType == "tv") ArrKind.Sonarr else ArrKind.Radarr
    var serviceId by remember { mutableStateOf(initialServiceId) }
    var resolving by remember { mutableStateOf(true) }
    var seasons by remember { mutableStateOf<List<Int>>(emptyList()) }
    var episodes by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    LaunchedEffect(tmdbId) {
        // Fiche Radarr/Sonarr retrouvée par l'identifiant TMDB (ou le titre et l'année).
        if (serviceId == null) {
            val items = runCatching { Session.noctraJSON("/api/servarr/catalog?type=${kind.key}&q=${encode(title)}", 30.0).asMap() }.getOrNull()?.maps("items") ?: emptyList()
            val match = items.firstOrNull { it.int("tmdbId") == tmdbId }
                ?: items.firstOrNull { it.str("title")?.equals(title, ignoreCase = true) == true && (year == null || (it["year"]?.toString() ?: "").startsWith(year)) }
            serviceId = match?.int("id")
        }
        val id = serviceId
        if (kind == ArrKind.Sonarr && id != null) {
            runCatching { Session.noctraJSON("/api/servarr/episodes?seriesId=$id", 30.0).asMap() }.getOrNull()?.let { json ->
                seasons = (json["seasons"] as? List<*>)?.mapNotNull { (it as? Number)?.toInt() } ?: emptyList()
                episodes = json.maps("episodes")
            }
        }
        resolving = false
    }
    AdminScaffold(title, AuroraPalette.requests) {
        val id = serviceId
        when {
            id != null && kind == ArrKind.Radarr -> section(footer = "Radarr interroge tous les indexeurs actifs.") {
                ActionLine("Releases du film", Icons.Filled.Search) { push { InteractiveSearchScreen(kind, title, "id=$id") } }
            }
            id != null -> {
                section(footer = "Sonarr interroge tous les indexeurs actifs, saison par saison.") {
                    ActionLine("Œuvre complète · intégrales et toutes saisons", Icons.Filled.Search) { push { InteractiveSearchScreen(kind, "$title · œuvre complète", "seriesId=$id&allSeasons=1") } }
                }
                for (season in seasons) section("Saison $season", key = "hub-season-$season") {
                    ActionLine("Pack saison complète", Icons.Filled.Search) { push { InteractiveSearchScreen(kind, "$title · saison $season", "seriesId=$id&seasonNumber=$season") } }
                    episodes.filter { it.int("seasonNumber") == season }.forEach { episode ->
                        RowDivider()
                        val number = episode.int("episodeNumber") ?: 0
                        AdminRow("$number. ${episode.str("title") ?: ""}", onClick = { push { InteractiveSearchScreen(kind, "$title · S${season}E$number", "id=${episode.int("id") ?: 0}") } },
                            trailing = { Icon(if (episode.flag("hasFile")) Icons.Filled.CheckCircle else Icons.Filled.Schedule, contentDescription = null, tint = if (episode.flag("hasFile")) Theme.teal else Theme.orange, modifier = Modifier.size(20.dp)) })
                    }
                }
            }
            resolving -> item { LoadingLine("Recherche de la fiche ${kind.label}…") }
            else -> item { NoteLine("Ce titre n’est pas encore dans ${kind.label} : fais d’abord la demande, puis reviens ici pour choisir la release.", Theme.orange) }
        }
        section {
            ActionLine("Torrents disponibles sur les trackers", Icons.Filled.RssFeed) { push { TrackerSearchScreen(mediaType, tmdbId, title, year) } }
        }
    }
}

// MARK: Dossier d'un film ou d'une série

/** Déplace un film ou une série vers un autre dossier racine : Radarr/Sonarr déplacent les fichiers et gardent leur suivi. */
@Composable
fun ArrMoveScreen(kind: ArrKind, id: Int, title: String, currentPath: String) {
    val scope = rememberCoroutineScope()
    var folders by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var moving by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(kind) {
        folders = runCatching { Session.noctraJSON("/api/servarr/rootfolders?type=${kind.key}", 30.0).asMap() }.getOrNull()?.maps("rootFolders") ?: emptyList()
        loading = false
    }
    AdminScaffold("Changer de dossier", AuroraPalette.requests) {
        section {
            AdminRow(title, detail = currentPath.ifEmpty { null })
            if (loading) LoadingLine()
            note?.let { NoteLine(it) }
        }
        section("Dossiers ${kind.label}") {
            folders.forEachIndexed { index, folder ->
                if (index > 0) RowDivider()
                val path = folder.str("path") ?: ""
                val current = currentPath.startsWith(if (path.endsWith("/")) path else "$path/")
                AdminRow(
                    path.split('/').lastOrNull { it.isNotEmpty() } ?: path,
                    detail = "${AdminFormat.bytes(AdminFormat.number(folder["freeSpace"]))} libres",
                    icon = Icons.Filled.Folder,
                    onClick = if (current || moving != null) null else ({ confirm = path }),
                    trailing = {
                        if (moving == path) CircularProgressIndicator(color = Theme.accent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                        else if (current) Icon(Icons.Filled.CheckCircle, contentDescription = "Dossier actuel", tint = Theme.accent, modifier = Modifier.size(20.dp))
                    }
                )
            }
        }
    }
    confirm?.let { path ->
        Confirm("Déplacer vers ce dossier ?", "${kind.label} déplace les fichiers vers $path.", "Déplacer", destructive = false, onDismiss = { confirm = null }) {
            moving = path
            scope.launch {
                note = try {
                    Session.noctraSend("POST", "/api/servarr/move", mapOf("type" to kind.key, "id" to id, "rootFolder" to path), 60.0).asMap()?.str("message") ?: "Déplacement lancé."
                } catch (failure: Exception) {
                    failure.message
                } finally {
                    moving = null
                }
            }
        }
    }
}
