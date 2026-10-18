package com.noctra.mobile.discover

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridItemSpanScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Casino
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Label
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.admin.TrackerSearchScreen
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.Json
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Prefs
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.double
import com.noctra.mobile.core.flag
import com.noctra.mobile.core.int
import com.noctra.mobile.core.map
import com.noctra.mobile.core.maps
import com.noctra.mobile.core.str
import com.noctra.mobile.ui.AccountButton
import com.noctra.mobile.ui.AuroraBackground
import com.noctra.mobile.ui.AuroraPalette
import com.noctra.mobile.ui.AuroraPrimaryButton
import com.noctra.mobile.ui.AuroraSecondaryButton
import com.noctra.mobile.ui.LoadingView
import com.noctra.mobile.ui.MessageView
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.RemoteImage
import com.noctra.mobile.ui.SearchField
import com.noctra.mobile.ui.SectionTitle
import com.noctra.mobile.ui.SheetColumn
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.TopBar
import com.noctra.mobile.ui.auroraCard
import com.noctra.mobile.ui.detail.ItemDetailScreen
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import com.noctra.mobile.ui.pressScale
import com.noctra.mobile.ui.rememberPush
import com.noctra.mobile.ui.screenModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.net.URLEncoder
import java.util.Locale
import kotlin.math.roundToInt

/** Titre proposé par Jellyseerr / TMDB (Découvrir, Demandes). */
data class SeerrItem(
    val id: Int, val mediaType: String, val title: String, val posterPath: String?, val backdropPath: String?, val date: String?,
    val vote: Double?, val overview: String?, val status: Int?, val jellyfinId: String?, val reason: String?
) {
    val key: String get() = "$mediaType:$id"
    val year: String? get() = date?.takeIf { it.length >= 4 }?.take(4)
    val poster: String? get() = posterPath?.let { "https://image.tmdb.org/t/p/w342$it" }
    val statusLabel: String? get() = when (status) { 2 -> "En attente"; 3 -> "En cours"; 4 -> "Partiel"; 5 -> "Disponible"; else -> null }

    companion object {
        fun from(json: JsonMap): SeerrItem? {
            val id = json.int("id") ?: return null
            val type = json.str("mediaType") ?: return null
            if (type != "movie" && type != "tv") return null
            val info = json.map("mediaInfo")
            return SeerrItem(
                id, type, json.str("title") ?: json.str("name") ?: "Sans titre", json.str("posterPath"), json.str("backdropPath"),
                json.str("releaseDate") ?: json.str("firstAirDate"), json.double("voteAverage"), json.str("overview"),
                info?.int("status"), info?.str("jellyfinMediaId"), json.str("reason")
            )
        }
    }
}

/** Fiche Jellyfin ouverte par son identifiant (Découvrir, Demandes, Roulette). */
fun itemRef(id: String) = BaseItem(mapOf("Id" to id))

private enum class HubSection(val label: String) { discover("Découvrir"), requests("Demandes"), roulette("Roulette") }

private class HubState { var section by mutableStateOf(HubSection.discover) }

private val full: LazyGridItemSpanScope.() -> GridItemSpan = { GridItemSpan(maxLineSpan) }

/** Onglet Découvrir : sélections personnalisées, demandes, roulette. */
@Composable
fun DiscoverHub() {
    val state = screenModel { HubState() }
    val haptics = LocalHapticFeedback.current
    Box(Modifier.fillMaxSize()) {
        AuroraBackground(when (state.section) { HubSection.requests -> AuroraPalette.requests; HubSection.roulette -> AuroraPalette.roulette; else -> AuroraPalette.main })
        Column(Modifier.fillMaxSize()) {
            TopBar(state.section.label) { AccountButton() }
            Row(Modifier.padding(horizontal = 20.dp, vertical = 6.dp).fillMaxWidth().glass(CircleShape).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                HubSection.entries.forEach { section ->
                    val active = section == state.section
                    Box(
                        Modifier.weight(1f).clip(CircleShape).background(if (active) Theme.lilac else Color.Transparent).focusRing(CircleShape)
                            .clickable { haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove); state.section = section }.padding(vertical = 9.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(section.label, color = if (active) Theme.onAccent else Theme.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            AnimatedContent(state.section, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "hub", modifier = Modifier.weight(1f)) { section ->
                when (section) {
                    HubSection.discover -> DiscoverView()
                    HubSection.requests -> RequestsView()
                    HubSection.roulette -> RouletteView()
                }
            }
        }
    }
}

// MARK: Grille TMDB

@Composable
private fun SeerrPoster(item: SeerrItem, open: (SeerrItem) -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    Column(
        Modifier.pressScale(interaction).focusRing(RoundedCornerShape(16.dp)).clickable(interactionSource = interaction, indication = null) { open(item) },
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(2f / 3f).auroraCard(16.dp)) {
            RemoteImage(item.poster, Modifier.fillMaxSize())
            item.statusLabel?.let { label ->
                Text(label, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(6.dp)
                    .glass(CircleShape, (if (item.status == 5) Theme.accent else Theme.orange).copy(alpha = 0.55f)).padding(horizontal = 8.dp, vertical = 4.dp))
            }
        }
        Text(item.title, color = Theme.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(listOfNotNull(item.year, if (item.mediaType == "tv") "Série" else "Film").joinToString(" · "), color = Theme.muted, fontSize = 12.sp, maxLines = 1)
    }
}

/** Fiche d'un titre TMDB : « Regarder » s'il est sur le serveur, « Demander » sinon, recherche interactive (admin). */
@Composable
fun SeerrSheet(item: SeerrItem, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val push = rememberPush()
    var sending by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    var requested by remember { mutableStateOf(false) }
    val status = item.status ?: 0
    NoctraSheet(onDismiss) {
        SheetColumn(item.title) {
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    RemoteImage(item.poster, Modifier.size(120.dp, 180.dp).clip(RoundedCornerShape(16.dp)))
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(item.title, style = Theme.display(22), color = Theme.ink)
                        Text(listOfNotNull(item.year, if (item.mediaType == "tv") "Série" else "Film", item.vote?.let { String.format(Locale.FRANCE, "★ %.1f", it) }, item.statusLabel).joinToString(" · "), color = Theme.muted, fontSize = 14.sp)
                        item.reason?.let { Text(it, color = Theme.accent, fontSize = 12.sp) }
                    }
                }
                item.jellyfinId?.let { id ->
                    AuroraPrimaryButton(onClick = { onDismiss(); push { ItemDetailScreen(itemRef(id)) } }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Regarder", fontWeight = FontWeight.SemiBold)
                    }
                }
                if (status < 5) {
                    AuroraSecondaryButton(onClick = {
                        sending = true
                        scope.launch {
                            try {
                                Session.noctraSend("POST", "/api/jellyseerr/request", mapOf("mediaType" to item.mediaType, "mediaId" to item.id, "title" to item.title, "year" to item.year?.toIntOrNull()))
                                requested = true
                                note = "Demande envoyée. Elle apparaîtra dans « Mes demandes »."
                            } catch (failure: Exception) {
                                note = failure.message
                            } finally {
                                sending = false
                            }
                        }
                    }, enabled = !sending && !requested && status < 2, modifier = Modifier.fillMaxWidth()) {
                        if (sending) CircularProgressIndicator(color = Theme.ink, strokeWidth = 2.dp, modifier = Modifier.size(16.dp)) else Icon(Icons.Filled.AddCircle, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(if (requested || status >= 2) "Déjà demandé" else "Demander")
                    }
                }
                if (Session.isAdmin && status < 5) {
                    AuroraSecondaryButton(onClick = { onDismiss(); push { TrackerSearchScreen(item.mediaType, item.id, item.title, item.year) } }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Filled.Search, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Recherche interactive")
                    }
                }
                note?.let { Text(it, color = Theme.muted, fontSize = 13.sp) }
                item.overview?.takeIf { it.isNotEmpty() }?.let { Text(it, color = Color.White.copy(alpha = 0.85f), fontSize = 15.sp) }
            }
        }
    }
}

// MARK: Découvrir

private class DiscoverModel {
    var category by mutableStateOf("smart")
    var items by mutableStateOf<List<SeerrItem>>(emptyList())
    var page = 1
    var more = true
    var busy by mutableStateOf(false)
    var warning by mutableStateOf<String?>(null)

    fun reset() { items = emptyList(); page = 1; more = true }

    suspend fun load() {
        if (busy || !more) return
        busy = true
        try {
            val current = category
            val json = runCatching { Session.noctraJSON("/api/discovery?category=$current&mode=balanced&page=$page", 45.0).asMap() }.getOrNull()
            if (json == null) { warning = "Découverte indisponible pour le moment."; more = false; return }
            if (current != category) return
            val seen = items.map { it.key }.toSet()
            val fresh = json.maps("results").mapNotNull { SeerrItem.from(it) }.filter { it.key !in seen }
            items = items + fresh
            more = json.flag("hasMore") && fresh.isNotEmpty()
            page = json.int("nextPage") ?: (page + 1)
            warning = json.str("warning")
        } finally {
            busy = false
        }
    }
}

private val categories = listOf(
    "smart" to "Pour toi", "trending" to "Tendances", "cinema" to "Au cinéma", "streaming" to "Streaming",
    "series" to "Séries", "anime" to "Animes", "animation" to "Animation", "year" to "Cette année",
    "classics" to "Classiques", "gems" to "Pépites"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DiscoverView() {
    val model = screenModel { DiscoverModel() }
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf<SeerrItem?>(null) }
    LaunchedEffect(Unit) { if (model.items.isEmpty()) model.load() }
    PullToRefreshBox(isRefreshing = model.busy && model.items.isNotEmpty(), onRefresh = { model.reset(); scope.launch { model.load() } }, modifier = Modifier.fillMaxSize()) {
        LazyVerticalGrid(
            GridCells.Adaptive(108.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 30.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            item(span = full) {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    categories.forEach { (key, label) ->
                        Pill(label, model.category == key) {
                            if (model.category != key) {
                                model.category = key
                                model.reset()
                                scope.launch { model.load() }
                            }
                        }
                    }
                }
            }
            itemsIndexed(model.items) { index, item ->
                if (index == model.items.size - 1) LaunchedEffect(model.items.size) { model.load() }
                SeerrPoster(item) { selected = it }
            }
            if (model.busy) item(span = full) { LoadingView() }
            if (!model.busy && model.items.isEmpty()) item(span = full) {
                MessageView(Icons.Filled.AutoAwesome, model.warning ?: "Aucune suggestion pour le moment.") { model.more = true; scope.launch { model.load() } }
            }
        }
    }
    selected?.let { item -> SeerrSheet(item) { selected = null } }
}

@Composable
private fun Pill(title: String, selected: Boolean, action: () -> Unit) {
    Text(
        title, color = if (selected) Theme.onAccent else Theme.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
        modifier = Modifier.clip(CircleShape).background(if (selected) Theme.accent else Color(0x991A1D33)).border(1.dp, Color(0x33FFFFFF), CircleShape)
            .focusRing(CircleShape).clickable(onClick = action).padding(horizontal = 14.dp, vertical = 9.dp)
    )
}

// MARK: Demandes

private data class Request(val title: String, val poster: String?, val label: String, val jellyfinId: String?, val mediaType: String, val tmdbId: Int?, val year: String?)

private class RequestsModel {
    var query by mutableStateOf("")
    var results by mutableStateOf<List<SeerrItem>>(emptyList())
    var mine by mutableStateOf<List<Request>>(emptyList())
    var quota by mutableStateOf<String?>(null)
    var loading by mutableStateOf(true)
    var searching by mutableStateOf(false)

    suspend fun loadMine() {
        try {
            val json = runCatching { Session.noctraJSON("/api/jellyseerr/requests").asMap() }.getOrNull() ?: return
            val labels = mapOf(1 to "En attente", 2 to "Approuvée", 3 to "Refusée")
            mine = json.maps("results").take(40).map { request ->
                val media = request.map("media") ?: emptyMap()
                val available = media.int("status") == 5
                val date = request.str("releaseDate") ?: ""
                Request(
                    request.str("displayTitle") ?: media.str("title") ?: media.str("name") ?: "Demande",
                    request.str("posterPath")?.let { "https://image.tmdb.org/t/p/w185$it" },
                    if (available) "Disponible" else labels[request.int("status") ?: 0] ?: "Enregistrée",
                    media.str("jellyfinMediaId"), if (request.str("mediaType") == "tv") "tv" else "movie", media.int("tmdbId"),
                    date.takeIf { it.length >= 4 }?.take(4)
                )
            }
            val quota = json.map("quota")
            val remaining = quota?.int("remaining")
            if (quota?.flag("enforced") == true && remaining != null) this.quota = "$remaining demande${if (remaining > 1) "s" else ""} possible${if (remaining > 1) "s" else ""}"
        } finally {
            loading = false
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RequestsView() {
    val model = screenModel { RequestsModel() }
    val scope = rememberCoroutineScope()
    val push = rememberPush()
    var selected by remember { mutableStateOf<SeerrItem?>(null) }
    LaunchedEffect(Unit) { model.loadMine() }
    LaunchedEffect(model.query) {
        val term = model.query.trim()
        if (term.length < 2) { model.results = emptyList(); return@LaunchedEffect }
        delay(350)
        model.searching = true
        val json = runCatching { Session.noctraJSON("/api/jellyseerr/search?q=" + URLEncoder.encode(term, "UTF-8")).asMap() }.getOrNull()
        model.results = json?.maps("results")?.mapNotNull { SeerrItem.from(it) } ?: emptyList()
        model.searching = false
    }
    PullToRefreshBox(isRefreshing = false, onRefresh = { scope.launch { model.loadMine() } }, modifier = Modifier.fillMaxSize()) {
        LazyVerticalGrid(
            GridCells.Adaptive(108.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 30.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item(span = full) { SearchField(model.query, "Film ou série à demander…", Modifier.padding(vertical = 6.dp)) { model.query = it } }
            if (model.query.isNotEmpty()) {
                if (model.searching) item(span = full) { LoadingView() }
                itemsIndexed(model.results) { _, item -> SeerrPoster(item) { selected = it } }
            } else {
                item(span = full) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SectionTitle("Mes demandes", Modifier.weight(1f))
                        model.quota?.let { Text(it, color = Theme.muted, fontSize = 12.sp) }
                    }
                }
                if (model.loading) item(span = full) { LoadingView() }
                if (!model.loading && model.mine.isEmpty()) item(span = full) { MessageView(Icons.Filled.Inbox, "Aucune demande pour le moment. Cherchez un titre ci-dessus.") }
                itemsIndexed(model.mine, span = { _, _ -> GridItemSpan(maxLineSpan) }) { _, entry ->
                    Row(
                        Modifier.fillMaxWidth().glass(RoundedCornerShape(20.dp), Color(0x8C141829)).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        RemoteImage(entry.poster, Modifier.size(54.dp, 81.dp).clip(RoundedCornerShape(10.dp)))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(entry.title, color = Theme.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(entry.label, color = if (entry.label == "Disponible") Theme.accent else Theme.orange, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                        val tmdb = entry.tmdbId
                        if (Session.isAdmin && tmdb != null && entry.label != "Disponible") {
                            RoundAction(Icons.Filled.Search, "Recherche interactive") { push { TrackerSearchScreen(entry.mediaType, tmdb, entry.title, entry.year) } }
                        }
                        entry.jellyfinId?.let { id -> RoundAction(Icons.Filled.PlayArrow, "Regarder") { push { ItemDetailScreen(itemRef(id)) } } }
                    }
                }
            }
        }
    }
    selected?.let { item -> SeerrSheet(item) { selected = null } }
}

@Composable
private fun RoundAction(icon: ImageVector, label: String, action: () -> Unit) {
    Box(Modifier.size(44.dp).glass(CircleShape).focusRing(CircleShape).clickable(onClickLabel = label, onClick = action), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = label, tint = Theme.ink, modifier = Modifier.size(20.dp))
    }
}

// MARK: Roulette

private class RouletteModel {
    var library by mutableStateOf(Prefs.string("noctra.roulette.library") ?: "")
    var genre by mutableStateOf(Prefs.string("noctra.roulette.genre") ?: "")
    var rating by mutableIntStateOf(Prefs.string("noctra.roulette.rating")?.toIntOrNull() ?: 0)
    var unplayed by mutableStateOf(Prefs.bool("noctra.roulette.unplayed", true))
    var libraries by mutableStateOf<List<Pair<String, String>>>(emptyList())
    var genres by mutableStateOf<List<String>>(emptyList())
    var pool by mutableStateOf<List<JsonMap>>(emptyList())
    var winner by mutableStateOf<JsonMap?>(null)
    var rolling by mutableStateOf(false)
    var revealed by mutableStateOf(false)
    var message by mutableStateOf<String?>(null)
    var loaded = false

    fun save() {
        Prefs.set("noctra.roulette.library", library)
        Prefs.set("noctra.roulette.genre", genre)
        Prefs.set("noctra.roulette.rating", rating.toString())
        Prefs.set("noctra.roulette.unplayed", unplayed)
    }

    suspend fun loadOptions() {
        loaded = true
        runCatching { Session.noctraJSON("/api/libraries").asMap() }.getOrNull()?.let { json ->
            libraries = json.mapNotNull { (label, value) -> value.asMap()?.str("id")?.let { it to label } }.sortedBy { it.second }
        }
        loadGenres()
    }

    suspend fun loadGenres() {
        val list = runCatching {
            Json.parse(Session.data("GET", "/Genres", mapOf(
                "userId" to Session.userId, "parentId" to library.ifEmpty { null }, "includeItemTypes" to "Movie,Series",
                "recursive" to "true", "sortBy" to "SortName", "enableTotalRecordCount" to "false"
            ))).asMap()?.maps("Items")
        }.getOrNull() ?: emptyList()
        genres = list.mapNotNull { it.str("Name") }
    }
}

private const val landing = 26

@Composable
private fun RouletteView() {
    val model = screenModel { RouletteModel() }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val push = rememberPush()
    val offset = remember { Animatable(0f) }
    val density = LocalDensity.current
    LaunchedEffect(Unit) { if (!model.loaded) model.loadOptions() }

    fun draw() {
        model.save()
        model.rolling = true
        model.revealed = false
        model.winner = null
        model.message = null
        scope.launch {
            var query = "count=10&rating=${model.rating}" + if (model.unplayed) "&unplayed=1" else ""
            if (model.library.isNotEmpty()) query += "&library=" + model.library
            if (model.genre.isNotEmpty()) query += "&genre=" + URLEncoder.encode(model.genre, "UTF-8")
            val results = runCatching { Session.noctraJSON("/api/roulette?$query").asMap()?.maps("results") }.getOrNull()
            if (results.isNullOrEmpty()) {
                model.rolling = false
                model.pool = emptyList()
                model.message = "Aucun titre ne correspond à ces réglages" + if (model.genre.isEmpty()) "." else " (genre « ${model.genre} »)."
                return@launch
            }
            model.pool = results
            model.winner = results[0]
            offset.snapTo(0f)
            delay(80)
            // Rouleau : départ rapide, ralentissement progressif sur le titre tiré.
            val step = with(density) { (120.dp + 12.dp).toPx() }
            val spin = launch { offset.animateTo(-landing * step, tween(3600, easing = CubicBezierEasing(0.08f, 0.7f, 0.12f, 1f))) }
            for (index in 0 until 18) {
                delay(60L + index * index * 2L)
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            }
            spin.join()
            delay(300)
            model.revealed = true
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            model.rolling = false
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Choice(Icons.Filled.Layers, model.libraries.firstOrNull { it.first == model.library }?.second ?: "Médiathèques", listOf("" to "Toutes") + model.libraries, model.library, Modifier.weight(1f)) {
                    model.library = it
                    model.genre = ""
                    scope.launch { model.loadGenres() }
                }
                Choice(Icons.Filled.Label, model.genre.ifEmpty { "Genres" }, listOf("" to "Tous les genres") + model.genres.map { it to it }, model.genre, Modifier.weight(1f)) { model.genre = it }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f).glass(CircleShape).padding(3.dp)) {
                    listOf(0 to "Toutes", 6 to "6+", 7 to "7+", 8 to "8+").forEach { (value, label) ->
                        val active = model.rating == value
                        Box(Modifier.weight(1f).clip(CircleShape).background(if (active) Theme.gold.copy(alpha = 0.85f) else Color.Transparent).focusRing(CircleShape).clickable { model.rating = value }.padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                            Text(label, color = if (active) Theme.onAccent else Theme.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                Text(
                    "Non vus", color = if (model.unplayed) Theme.onAccent else Theme.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(CircleShape).background(if (model.unplayed) Theme.lilac else Color(0x991A1D33)).focusRing(CircleShape).clickable { model.unplayed = !model.unplayed }.padding(horizontal = 14.dp, vertical = 10.dp)
                )
            }
        }
        val winner = model.winner
        when {
            winner != null && model.revealed -> {
                val id = winner.str("id") ?: ""
                AnimatedContent(true, transitionSpec = { (scaleIn(initialScale = 0.6f) + fadeIn()) togetherWith fadeOut() }, label = "reveal") { _ ->
                    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        RemoteImage(Session.image(id, width = 500), Modifier.size(200.dp, 300.dp).shadow(24.dp, RoundedCornerShape(24.dp), ambientColor = Theme.lilac, spotColor = Theme.lilac).clip(RoundedCornerShape(24.dp)).border(1.dp, Theme.ringGradient, RoundedCornerShape(24.dp)))
                        Text(winner.str("title") ?: "", style = Theme.display(28).copy(brush = Theme.posterTitleGradient), textAlign = TextAlign.Center)
                        Text(listOfNotNull(winner.int("year")?.toString(), winner.double("rating")?.let { String.format(Locale.FRANCE, "★ %.1f", it) }).joinToString(" · "), color = Theme.muted)
                        winner.str("overview")?.let { Text(it, color = Color.White.copy(alpha = 0.8f), fontSize = 15.sp, maxLines = 5, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center) }
                        AuroraPrimaryButton(onClick = { push { ItemDetailScreen(itemRef(id)) } }) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("Voir la fiche", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            model.pool.isNotEmpty() -> {
                BoxWithConstraints(Modifier.fillMaxWidth().height(180.dp).clipToBounds()) {
                    val half = maxWidth / 2
                    val start = with(density) { (half - 60.dp).toPx() }
                    Row(Modifier.wrapContentWidth(Alignment.Start, unbounded = true).offset { IntOffset((start + offset.value).roundToInt(), 0) }, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        for (index in 0 until landing + 4) {
                            val pick = if (index == landing) (model.winner ?: model.pool[0]) else model.pool[(index * 7 + 3) % model.pool.size]
                            RemoteImage(Session.image(pick.str("id"), width = 300), Modifier.size(120.dp, 180.dp).clip(RoundedCornerShape(16.dp)))
                        }
                    }
                    Box(Modifier.align(Alignment.Center).width(4.dp).fillMaxHeight().shadow(10.dp, CircleShape, ambientColor = Theme.accent, spotColor = Theme.accent).background(Theme.accent, CircleShape))
                }
            }
            else -> Column(Modifier.fillMaxWidth().padding(vertical = 40.dp, horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Filled.Casino, contentDescription = null, tint = Theme.pink, modifier = Modifier.size(64.dp))
                Text("Prêt pour le tirage ?", style = Theme.display(24).copy(brush = Theme.titleGradient))
                Text(model.message ?: "Réglez vos envies puis lancez la roulette.", color = Theme.muted, textAlign = TextAlign.Center)
            }
        }
        AuroraPrimaryButton(onClick = { draw() }, enabled = !model.rolling, modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
            Icon(Icons.Filled.Casino, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text(if (model.rolling) "La roulette tourne…" else "Lancer la roulette", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        }
    }
}

@Composable
private fun Choice(icon: ImageVector, title: String, options: List<Pair<String, String>>, selected: String, modifier: Modifier = Modifier, select: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        Row(
            Modifier.fillMaxWidth().glass(CircleShape).focusRing(CircleShape).clickable { open = true }.padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)
        ) {
            Icon(icon, contentDescription = null, tint = Theme.accent, modifier = Modifier.size(18.dp))
            Text(title, color = Theme.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.background(Color(0xFF151932))) {
            options.forEach { (value, label) ->
                DropdownMenuItem(text = { Text((if (value == selected) "✓ " else "") + label, color = Theme.ink) }, onClick = { open = false; select(value) })
            }
        }
    }
}
