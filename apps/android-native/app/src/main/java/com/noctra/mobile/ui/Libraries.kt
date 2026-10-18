package com.noctra.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.ViewModule
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.admin.AdminFormat
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.Fields
import com.noctra.mobile.core.Json
import com.noctra.mobile.core.LibraryRoute
import com.noctra.mobile.core.NoctraException
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.int
import com.noctra.mobile.offline.OfflineLibraryScreen
import com.noctra.mobile.offline.OfflineState
import com.noctra.mobile.offline.OfflineStore
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class LibrariesModel {
    var libraries by mutableStateOf<List<BaseItem>>(emptyList())
    var loading by mutableStateOf(true)
    var failed by mutableStateOf(false)

    suspend fun load() {
        loading = true
        val views = runCatching { Session.items(listOf("/UserViews", "/Users/{userId}/Views"), mapOf("userId" to Session.userId)) }.getOrNull()
        libraries = (views ?: emptyList()).filter { it.collectionType !in setOf("livetv", "playlists") }
        failed = views == null
        loading = false
    }
}

/** Médiathèques : grandes tuiles avec l'image de chaque bibliothèque. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibrariesScreen() {
    val model = screenModel { LibrariesModel() }
    val scope = rememberCoroutineScope()
    val push = rememberPush()
    LaunchedEffect(Unit) { if (model.libraries.isEmpty()) model.load() }
    Box(Modifier.fillMaxSize()) {
        AuroraBackground()
        Column(Modifier.fillMaxSize()) {
            TopBar("Médiathèques", large = true) { AccountButton() }
            PullToRefreshBox(isRefreshing = model.loading && model.libraries.isNotEmpty(), onRefresh = { scope.launch { model.load() } }, modifier = Modifier.weight(1f)) {
                LazyVerticalGrid(GridCells.Adaptive(300.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    item(span = { GridItemSpan(maxLineSpan) }) { OfflineTile { push { OfflineLibraryScreen() } } }
                    items(model.libraries, key = { it.id }) { library ->
                        val source = remember { MutableInteractionSource() }
                        Box(
                            Modifier.fillMaxWidth().height(170.dp).pressScale(source, 0.97f).clip(RoundedCornerShape(26.dp)).focusRing(RoundedCornerShape(26.dp))
                                .clickable(interactionSource = source, indication = null) { push { LibraryGridScreen(LibraryRoute(library.id, library.title, library.collectionType)) } }
                        ) {
                            RemoteImage(Session.image(library.id, tag = library.imageTags["Primary"], width = 900), Modifier.fillMaxSize())
                            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.5f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.7f))))
                            Row(
                                Modifier.align(Alignment.BottomStart).padding(14.dp).glass(CircleShape, Color(0x8C0F1122)).padding(horizontal = 16.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(libraryIcon(library.collectionType), contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                                Text(library.title, color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    if (model.loading && model.libraries.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) { LoadingView() }
                    if (model.failed && model.libraries.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
                        MessageView(Icons.Filled.WifiOff, NoctraException.unreachable.message ?: "") { scope.launch { model.load() } }
                    }
                }
            }
        }
    }
}

/** « Sur cet appareil » : titres téléchargés, lisibles sans connexion. */
@Composable
fun OfflineTile(onClick: () -> Unit) {
    val count = OfflineStore.downloaded.size
    val running = OfflineStore.entries.count { it.state == OfflineState.downloading || it.state == OfflineState.queued }
    val source = remember { MutableInteractionSource() }
    Row(
        Modifier.fillMaxWidth().pressScale(source, 0.98f).auroraPanel(22.dp).focusRing(RoundedCornerShape(22.dp)).clickable(interactionSource = source, indication = null, onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Icon(Icons.Filled.DownloadForOffline, contentDescription = null, tint = Theme.lilac, modifier = Modifier.size(30.dp))
        Column(Modifier.weight(1f)) {
            Text("Sur cet appareil", color = Theme.ink, fontWeight = FontWeight.SemiBold)
            Text(
                if (count == 0 && running == 0) "Films et épisodes à regarder hors ligne"
                else listOfNotNull(if (count > 0) "$count titre${if (count > 1) "s" else ""} · ${AdminFormat.bytes(OfflineStore.usedBytes.toDouble())}" else null,
                    if (running > 0) "$running en cours" else null).joinToString(" · "),
                color = Theme.muted, fontSize = 12.sp
            )
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Theme.muted)
    }
}

fun libraryIcon(type: String?) = when (type) {
    "movies" -> Icons.Filled.Movie
    "tvshows" -> Icons.Filled.Tv
    "music" -> Icons.Filled.LibraryMusic
    "boxsets" -> Icons.Filled.ViewModule
    else -> Icons.Filled.Folder
}

enum class LibrarySort(val label: String, val sortBy: String, val order: String) {
    Added("Ajout récent", "DateCreated,SortName", "Descending"),
    Name("Titre", "SortName", "Ascending"),
    Year("Année", "ProductionYear,SortName", "Descending"),
    Rating("Note", "CommunityRating,SortName", "Descending")
}

class LibraryGridModel(val library: LibraryRoute) {
    var items by mutableStateOf<List<BaseItem>>(emptyList())
    var total = Int.MAX_VALUE
    var loading by mutableStateOf(false)
    var sort by mutableStateOf(LibrarySort.Added)

    suspend fun loadMore() {
        if (loading || items.size >= total) return
        loading = true
        val types = when (library.collectionType) { "movies" -> "Movie"; "tvshows" -> "Series"; else -> null }
        val page = runCatching {
            Session.json(listOf("/Items", "/Users/{userId}/Items"), mapOf(
                "userId" to Session.userId, "parentId" to library.id, "recursive" to if (types == null) null else "true",
                "includeItemTypes" to types, "sortBy" to sort.sortBy, "sortOrder" to sort.order, "fields" to Fields.card,
                "startIndex" to items.size.toString(), "limit" to "60", "enableTotalRecordCount" to "true"
            )).asMap()
        }.getOrNull()
        if (page == null) { total = items.size; loading = false; return }
        val fresh = BaseItem.items(page)
        items = items + fresh
        total = if (fresh.isEmpty()) items.size else page.int("TotalRecordCount") ?: Int.MAX_VALUE
        loading = false
    }

    suspend fun resort(value: LibrarySort) {
        sort = value
        items = emptyList()
        total = Int.MAX_VALUE
        loadMore()
    }
}

/** Grille d'une médiathèque : chargement progressif, tri. */
@Composable
fun LibraryGridScreen(library: LibraryRoute) {
    val model = screenModel("grid-" + library.id) { LibraryGridModel(library) }
    val scope = rememberCoroutineScope()
    val state = rememberLazyGridState()
    var menu by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { if (model.items.isEmpty()) model.loadMore() }
    val nearEnd by remember { derivedStateOf { val last = state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0; last >= model.items.size - 12 } }
    LaunchedEffect(nearEnd, model.items.size) { if (nearEnd && model.items.isNotEmpty()) model.loadMore() }
    Box(Modifier.fillMaxSize()) {
        AuroraBackground()
        Column(Modifier.fillMaxSize()) {
            TopBar(library.name) {
                Box {
                    IconButton(onClick = { menu = true }, modifier = Modifier.glass(CircleShape).focusRing(CircleShape)) { Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Trier", tint = Theme.ink) }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        LibrarySort.entries.forEach { option ->
                            DropdownMenuItem(text = { Text((if (option == model.sort) "✓ " else "") + option.label) }, onClick = { menu = false; scope.launch { model.resort(option) } })
                        }
                    }
                }
            }
            PosterGrid(model.items, state, Modifier.weight(1f)) { if (model.loading) LoadingView() }
        }
    }
}

/** Grille d'affiches adaptée à la largeur (téléphone, tablette, téléviseur). */
@Composable
fun PosterGrid(items: List<BaseItem>, state: androidx.compose.foundation.lazy.grid.LazyGridState = rememberLazyGridState(), modifier: Modifier = Modifier, footer: @Composable () -> Unit = {}) {
    LazyVerticalGrid(GridCells.Adaptive(112.dp), modifier.fillMaxSize(), state = state, contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        items(items) { item ->
            androidx.compose.foundation.layout.BoxWithConstraints { PosterCard(item, maxWidth) }
        }
        item(span = { GridItemSpan(maxLineSpan) }) { footer() }
    }
}

class SearchModel {
    var query by mutableStateOf("")
    var results by mutableStateOf<List<BaseItem>>(emptyList())
    var searching by mutableStateOf(false)
}

/** Recherche : films, séries, épisodes. */
@Composable
fun SearchScreen() {
    val model = screenModel { SearchModel() }
    LaunchedEffect(model.query) {
        val term = model.query.trim()
        if (term.length < 2) { model.results = emptyList(); return@LaunchedEffect }
        // Saisie en cours : on attend une courte pause avant d'interroger le serveur.
        delay(300)
        model.searching = true
        val found = runCatching {
            Session.items(listOf("/Items", "/Users/{userId}/Items"), mapOf("userId" to Session.userId, "searchTerm" to term, "recursive" to "true", "limit" to "60",
                "includeItemTypes" to "Movie,Series,Episode", "fields" to Fields.card))
        }.getOrNull()
        model.results = found ?: emptyList()
        model.searching = false
    }
    Box(Modifier.fillMaxSize()) {
        AuroraBackground()
        Column(Modifier.fillMaxSize()) {
            TopBar("Recherche", large = true) { AccountButton() }
            SearchField(model.query, "Rechercher dans Noctra", Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) { model.query = it }
            when {
                model.query.isEmpty() -> MessageView(Icons.Filled.Search, "Films, séries, épisodes…")
                model.results.isEmpty() && !model.searching -> MessageView(Icons.Filled.HelpOutline, "Aucun résultat pour « ${model.query} ».")
                else -> PosterGrid(model.results, modifier = Modifier.weight(1f)) { if (model.searching) LoadingView() }
            }
        }
    }
}

/** Champ de recherche en capsule de verre. */
@Composable
fun SearchField(value: String, placeholder: String, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    TextField(
        value = value, onValueChange = onChange, singleLine = true,
        placeholder = { Text(placeholder, color = Theme.muted) },
        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = Theme.accent) },
        trailingIcon = { if (value.isNotEmpty()) IconButton(onClick = { onChange("") }) { Icon(Icons.Filled.Close, contentDescription = "Effacer", tint = Theme.muted) } },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        shape = CircleShape,
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color(0xB31A1D33), unfocusedContainerColor = Color(0x991A1D33),
            focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Theme.accent,
            focusedTextColor = Theme.ink, unfocusedTextColor = Theme.ink
        ),
        modifier = modifier.fillMaxWidth()
    )
}
