package com.noctra.mobile.live

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.HighQuality
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.TVSourceRoute
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.str
import com.noctra.mobile.ui.AccountButton
import com.noctra.mobile.ui.AuroraBackground
import com.noctra.mobile.ui.AuroraPalette
import com.noctra.mobile.ui.AuroraPrimaryButton
import com.noctra.mobile.ui.LoadingView
import com.noctra.mobile.ui.MessageView
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.Notices
import com.noctra.mobile.ui.RemoteImage
import com.noctra.mobile.ui.SearchField
import com.noctra.mobile.ui.SectionTitle
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.TopBar
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import com.noctra.mobile.ui.pressScale
import com.noctra.mobile.ui.rememberPush
import com.noctra.mobile.ui.screenModel
import kotlinx.coroutines.launch
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private enum class LiveTab(val label: String) { all("Chaînes"), sport("Sport"), favorites("Favoris"), recents("Récentes"), sources("Sources") }

private class LiveHomeState {
    var tab by mutableStateOf(LiveTab.all)
    var query by mutableStateOf("")
    var category by mutableStateOf<String?>(null)
}

private val full: (androidx.compose.foundation.lazy.grid.LazyGridItemSpanScope) -> GridItemSpan = { GridItemSpan(it.maxLineSpan) }

/** TV en direct : chaînes du pays choisi, matchs du jour, favoris, récentes et sources. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveTVHome() {
    val state = screenModel { LiveHomeState() }
    val scope = rememberCoroutineScope()
    val store = LiveStore
    LaunchedEffect(Session.hasNoctra) { if (Session.hasNoctra) runCatching { store.loadAll() } }
    val term = state.query.trim()
    val shown: List<LiveChannel> = remember(state.tab, term, state.category, store.channels, store.events, store.favorites, store.recents, store.country) {
        var list: List<LiveChannel> = when (state.tab) {
            LiveTab.all -> {
                // Pays choisi (France par défaut) ; la recherche couvre tous les pays.
                val code = store.country
                val base = if (code.isEmpty() || term.isNotEmpty()) store.channels else store.channels.filter { it.country.ifEmpty { "?" } == code }
                if (code == "fr" && term.isEmpty()) base.sortedBy { it.number } else base
            }
            LiveTab.sport -> store.events
            LiveTab.favorites -> (store.channels + store.events).filter { it.id in store.favorites }
            LiveTab.recents -> store.recents.mapNotNull { key -> store.channels.firstOrNull { it.id == key } }
            LiveTab.sources -> emptyList()
        }
        state.category?.let { category -> list = list.filter { it.group == category } }
        if (term.isNotEmpty()) list = list.filter { it.name.contains(term, ignoreCase = true) }
        list
    }

    Box(Modifier.fillMaxSize()) {
        AuroraBackground(AuroraPalette.tv)
        Column(Modifier.fillMaxSize()) {
            TopBar("TV en direct", large = true) {
                CountryMenu { state.category = null }
                AccountButton()
            }
            if (!Session.hasNoctra) {
                MessageView(Icons.Filled.WifiOff, "La TV en direct demande le serveur Noctra (adresse …/noctra).") {
                    scope.launch { Session.establishNoctraSession(); runCatching { store.loadAll(force = true) } }
                }
                return@Column
            }
            PullToRefreshBox(isRefreshing = store.loading && store.channels.isNotEmpty(), onRefresh = { scope.launch { runCatching { store.loadAll(force = true) } } }, modifier = Modifier.weight(1f)) {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(if (state.tab == LiveTab.sources) 160.dp else 104.dp),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 30.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item(span = full) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            SearchField(state.query, "Chaîne") { state.query = it }
                            TabStrip(state.tab) { state.tab = it; state.category = null }
                            AccessBar()
                        }
                    }
                    when (state.tab) {
                        LiveTab.sources -> sourcesGrid()
                        LiveTab.sport -> {
                            if (store.loading && store.events.isEmpty()) item(span = full) { LoadingLine("Chargement des matchs de toutes les sources Sport…") }
                            items(shown, span = { full(this) }) { event -> EventRow(event, shown) }
                            if (!store.loading && shown.isEmpty()) item(span = full) {
                                MessageView(Icons.Filled.EmojiEvents, "Aucun match pour le moment. Les sources Sport sont aussi dans l’onglet Sources.") { scope.launch { runCatching { store.loadAll(force = true) } } }
                            }
                        }
                        else -> {
                            if (state.tab == LiveTab.all && store.categories.isNotEmpty()) item(span = full) { CategoryChips(store.categories, state.category) { state.category = it } }
                            if (store.loading) item(span = full) { LoadingLine("Chargement des chaînes… ${store.loadedSources}/${maxOf(store.sources.size, 1)} sources") }
                            items(shown) { channel -> ChannelTile(channel, shown) }
                            if (!store.loading && shown.isEmpty()) item(span = full) {
                                MessageView(
                                    if (state.tab == LiveTab.favorites) Icons.Filled.Star else Icons.Filled.Tv,
                                    when (state.tab) {
                                        LiveTab.favorites -> "Appuyez longuement sur une chaîne pour l’ajouter aux favoris."
                                        LiveTab.recents -> "Les chaînes regardées apparaîtront ici."
                                        else -> if (store.failed) "Sources TV indisponibles." else "Aucune chaîne."
                                    }
                                ) { scope.launch { runCatching { store.loadAll(force = true) } } }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LoadingLine(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        CircularProgressIndicator(color = Theme.teal, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
        Text(text, color = Theme.muted, fontSize = 13.sp)
    }
}

/** Pays affichés : France d'abord, les autres au choix. */
@Composable
private fun CountryMenu(changed: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    val store = LiveStore
    Box {
        Row(
            Modifier.glass(CircleShape).focusRing(CircleShape).clickable { open = true }.padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(Icons.Filled.Public, contentDescription = null, tint = Theme.teal, modifier = Modifier.size(18.dp))
            Text(ChannelNaming.countryLabel(store.country), color = Theme.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.background(Color(0xFF151932)).heightIn(max = 460.dp)) {
            store.countryChoices.forEach { code ->
                val count = if (code.isEmpty()) store.channels.size else store.countries[code] ?: 0
                DropdownMenuItem(
                    text = { Text((if (code == store.country) "✓ " else "") + "${ChannelNaming.countryLabel(code)} · $count", color = Theme.ink) },
                    onClick = { open = false; store.setCountry(code); changed() }
                )
            }
        }
    }
}

@Composable
private fun TabStrip(selected: LiveTab, select: (LiveTab) -> Unit) {
    val haptics = LocalHapticFeedback.current
    Row(Modifier.fillMaxWidth().glass(CircleShape, Color(0x991A1D33)).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        LiveTab.entries.forEach { tab ->
            val active = tab == selected
            Box(
                Modifier.weight(1f).clip(CircleShape).background(if (active) Theme.teal.copy(alpha = 0.85f) else Color.Transparent)
                    .focusRing(CircleShape).clickable { haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove); select(tab) }.padding(vertical = 9.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(tab.label, color = if (active) Theme.onAccent else Theme.ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** Accès VIP actifs sur le serveur Noctra (LiveWatch Premium, Movix, Northlive). */
@Composable
private fun AccessBar() {
    val store = LiveStore
    val access = listOfNotNull(
        if (store.liveWatchVip) "LiveWatch VIP Premium" else null,
        if (store.providerKeys["movix"] == true) "Movix" else null,
        if (store.providerKeys["northlive"] == true) "Northlive" else null
    )
    if (access.isEmpty()) return
    Row(
        Modifier.glass(CircleShape, Color(0x40F59E0B)).padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(Icons.Filled.Star, contentDescription = null, tint = Theme.gold, modifier = Modifier.size(16.dp))
        Text("Accès VIP : " + access.joinToString(" · ") + " · serveurs proposés en premier", color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
    }
}

@Composable
private fun CategoryChips(categories: List<String>, selected: String?, select: (String?) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Chip("Toutes", selected == null) { select(null) }
        categories.forEach { name -> Chip(name, selected == name) { select(if (selected == name) null else name) } }
    }
}

@Composable
private fun Chip(title: String, selected: Boolean, action: () -> Unit) {
    Text(
        title, color = if (selected) Theme.onAccent else Theme.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
        modifier = Modifier.clip(CircleShape).background(if (selected) Theme.teal.copy(alpha = 0.8f) else Color(0x991A1D33))
            .border(1.dp, if (selected) Theme.teal.copy(alpha = 0.55f) else Color(0x1F99F6E4), CircleShape)
            .focusRing(CircleShape).clickable(onClick = action).padding(horizontal = 14.dp, vertical = 9.dp)
    )
}

/** Toutes les sources, par rubrique : chaînes, sport, alternatives, personnelles. */
private fun LazyGridScope.sourcesGrid() {
    val store = LiveStore
    val sections = listOf(
        Triple("channels", "Chaînes", Icons.Filled.Tv), Triple("sports", "Sport", Icons.Filled.EmojiEvents),
        Triple("alternatives", "Alternatives", Icons.Filled.Shuffle), Triple("personal", "Mes sources", Icons.Filled.AccountCircle)
    )
    val known = sections.map { it.first }.toSet()
    for ((key, title, icon) in sections) {
        val list = store.sources.filter { source ->
            val value = store.sourceInfo[source.id]?.first ?: "channels"
            value == key || (key == "personal" && value !in known)
        }
        if (list.isEmpty()) continue
        item(span = full) { SectionTitle(title, Modifier.padding(top = 10.dp), detail = "${list.size}") }
        items(list) { source -> SourceCard(source, icon) }
    }
}

@Composable
private fun SourceCard(source: TVSourceRoute, icon: ImageVector) {
    val push = rememberPush()
    val interaction = remember { MutableInteractionSource() }
    val shape = RoundedCornerShape(24.dp)
    Column(
        Modifier.fillMaxWidth().heightIn(min = 116.dp).pressScale(interaction).clip(shape).background(Color(0xD10E1326)).border(1.dp, Theme.teal.copy(alpha = 0.25f), shape)
            .focusRing(shape).clickable(interactionSource = interaction, indication = null) { push { LiveChannelsScreen(source) } }.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(icon, contentDescription = null, tint = Theme.accent, modifier = Modifier.size(24.dp))
        Text(source.name, color = Theme.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        LiveStore.sourceInfo[source.id]?.second?.takeIf { it.isNotEmpty() }?.let { Text(it, color = Theme.muted, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
    }
}

// MARK: Matchs et chaînes

private val hourFormat = DateTimeFormatter.ofPattern("HH:mm", Locale.FRANCE)
private val dayFormat = DateTimeFormatter.ofPattern("d MMM", Locale.FRANCE)

/** Match du jour : en direct ou horaire, équipes, score, nombre de serveurs. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun EventRow(event: LiveChannel, context: List<LiveChannel>) {
    val interaction = remember { MutableInteractionSource() }
    val shape = RoundedCornerShape(18.dp)
    val haptics = LocalHapticFeedback.current
    Row(
        Modifier.fillMaxWidth().pressScale(interaction, 0.98f).clip(shape).background(Color(0xD10E1326))
            .border(1.dp, if (event.isLive) Color(0x73EF4444) else Theme.teal.copy(alpha = 0.2f), shape).focusRing(shape)
            .combinedClickable(interactionSource = interaction, indication = null, onClick = { LiveLauncher.open(event, context) }, onLongClick = {
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                toggleFavorite(event)
            })
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(Modifier.width(58.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            val start = event.start
            when {
                event.isLive -> Text("DIRECT", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black, modifier = Modifier.background(Color(0xFFEF4444), CircleShape).padding(horizontal = 6.dp, vertical = 3.dp))
                start != null -> {
                    val date = Instant.ofEpochMilli(start).atZone(ZoneId.systemDefault())
                    Text(hourFormat.format(date), color = Theme.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    if (date.toLocalDate() != LocalDate.now()) Text(dayFormat.format(date), color = Theme.muted, fontSize = 11.sp)
                }
                else -> Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = Theme.muted)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            event.league?.let { Text(it, color = Theme.teal, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            val home = event.home
            val away = event.away
            if (home != null && away != null) {
                Team(home, event.logo)
                Team(away, event.secondaryLogo)
            } else {
                Text(event.name, color = Theme.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            event.score?.let { Text(it, color = Theme.ink, fontSize = 17.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace) }
            Text("${event.entries.size} serveur${if (event.entries.size > 1) "s" else ""}", color = Theme.muted, fontSize = 11.sp)
            if (event.id in LiveStore.favorites) Icon(Icons.Filled.Star, contentDescription = "Favori", tint = Theme.gold, modifier = Modifier.size(14.dp))
            if (LiveLauncher.opening == event.id) CircularProgressIndicator(color = Theme.teal, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
        }
    }
}

@Composable
private fun Team(name: String, logo: String?) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        logo?.let { Session.noctraURL(it) }?.let { RemoteImage(it, Modifier.size(20.dp), contentScale = ContentScale.Fit, placeholder = false) }
        Text(name, color = Theme.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

private fun toggleFavorite(channel: LiveChannel) {
    val adding = channel.id !in LiveStore.favorites
    LiveStore.toggleFavorite(channel)
    Notices.announce(if (adding) "« ${channel.name} » ajoutée aux favoris" else "« ${channel.name} » retirée des favoris")
}

/** Case d'une chaîne : appui pour regarder, appui long pour les favoris. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ChannelTile(channel: LiveChannel, context: List<LiveChannel>) {
    val interaction = remember { MutableInteractionSource() }
    val haptics = LocalHapticFeedback.current
    val shape = RoundedCornerShape(20.dp)
    Column(
        Modifier.fillMaxWidth().pressScale(interaction).combinedClickable(interactionSource = interaction, indication = null, onClick = {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            LiveLauncher.open(channel, context)
        }, onLongClick = {
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            toggleFavorite(channel)
        }),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Fond plein plutôt que du verre : des milliers de cases défilent sans flou derrière chacune.
        Box(
            Modifier.fillMaxWidth().height(72.dp).clip(shape).background(Color(0xD10E1326))
                .border(1.dp, Brush.linearGradient(listOf(Theme.teal.copy(alpha = 0.35f), Color.White.copy(alpha = 0.04f), Theme.lilac.copy(alpha = 0.3f))), shape)
                .focusRing(shape),
            contentAlignment = Alignment.Center
        ) {
            val logo = channel.logo?.let { Session.noctraURL(it) }
            if (logo != null) RemoteImage(logo, Modifier.fillMaxSize().padding(14.dp), contentScale = ContentScale.Fit, placeholder = false)
            else Text(channel.name.take(2).uppercase(), color = Theme.teal, fontSize = 22.sp, fontWeight = FontWeight.Black)
            if (LiveLauncher.opening == channel.id) Box(Modifier.size(36.dp).glass(CircleShape, Color(0x99000000)), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
            }
            Row(Modifier.align(Alignment.TopStart).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                if (channel.number > 0 && LiveStore.country == "fr") Text("${channel.number}", color = Theme.teal, fontSize = 11.sp, fontWeight = FontWeight.Black, fontFamily = FontFamily.Monospace)
                if (channel.vip) Icon(Icons.Filled.Star, contentDescription = "VIP", tint = Theme.gold, modifier = Modifier.size(10.dp))
            }
            if (channel.id in LiveStore.favorites) Icon(Icons.Filled.Star, contentDescription = "Favori", tint = Color(0xFFFACC15), modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).size(12.dp))
        }
        Text(channel.name, color = Theme.ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        if (channel.entries.size > 1) Text("${channel.entries.size} serveurs", color = Theme.muted, fontSize = 11.sp)
    }
}

// MARK: Chaînes d'une source

private class SourceModel(val route: TVSourceRoute) {
    var channels by mutableStateOf<List<LiveChannel>>(emptyList())
    var bouquets by mutableStateOf<List<TVSourceRoute>>(emptyList())
    var loading by mutableStateOf(true)
    var loaded = false

    suspend fun load() {
        loading = true
        try {
            Session.establishNoctraSession()
            val path = route.ref?.let { "/api/tv/catalog?ref=" + URLEncoder.encode(it, "UTF-8") } ?: ("/api/tv/catalog?source=" + URLEncoder.encode(route.id, "UTF-8"))
            val json = runCatching { Session.noctraJSON(path).asMap() }.getOrNull() ?: return
            val seen = HashSet<String>()
            val sourceId = route.id.substringBefore("|")
            channels = json["channels"].asMaps().withIndex().mapNotNull { (index, entry) ->
                val name = entry.str("name")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                var id = route.id + "|" + name
                if (id in seen) id += "#$index"
                seen += id
                LiveChannel(id, name, entry.str("logo"), entry.str("group"), ChannelNaming.country(entry), listOf(LiveEntry(route.name, sourceId, entry)))
            }
            bouquets = json["groups"].asMaps().mapNotNull { group ->
                val ref = group.str("ref") ?: return@mapNotNull null
                TVSourceRoute(route.id + "|" + ref, group.str("name") ?: group.str("title") ?: ref, ref)
            }.take(200)
            loaded = true
        } finally {
            loading = false
        }
    }
}

/** Chaînes d'une source (ou d'un bouquet). */
@Composable
fun LiveChannelsScreen(route: TVSourceRoute) {
    val model = screenModel("source-" + route.id) { SourceModel(route) }
    val scope = rememberCoroutineScope()
    val push = rememberPush()
    var query by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { if (!model.loaded) model.load() }
    val term = query.trim()
    val channels = if (term.isEmpty()) model.channels else model.channels.filter { it.name.contains(term, ignoreCase = true) }
    val bouquets = if (term.isEmpty()) model.bouquets else model.bouquets.filter { it.name.contains(term, ignoreCase = true) }
    Box(Modifier.fillMaxSize()) {
        AuroraBackground(AuroraPalette.tv)
        Column(Modifier.fillMaxSize()) {
            TopBar(route.name)
            LazyVerticalGrid(
                columns = GridCells.Adaptive(104.dp), modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 30.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item(span = full) { SearchField(query, if (model.bouquets.isEmpty()) "Chaîne" else "Bouquet ou chaîne") { query = it } }
                if (model.bouquets.isNotEmpty()) {
                    item(span = full) { SectionTitle("Bouquets", Modifier.padding(top = 6.dp), detail = "${bouquets.size}") }
                    // Bouquets plus larges que les chaînes : deux cases chacun.
                    items(bouquets, span = { GridItemSpan(minOf(2, maxLineSpan)) }) { bouquet -> BouquetCard(bouquet.name) { push { LiveChannelsScreen(bouquet) } } }
                    if (channels.isNotEmpty()) item(span = full) { SectionTitle("Chaînes", Modifier.padding(top = 6.dp), detail = "${channels.size}") }
                }
                items(channels) { channel -> ChannelTile(channel, channels) }
                if (model.loading && model.channels.isEmpty() && model.bouquets.isEmpty()) item(span = full) { LoadingView() }
                if (!model.loading && model.channels.isEmpty() && model.bouquets.isEmpty()) item(span = full) {
                    MessageView(Icons.Filled.Tv, "Aucune chaîne dans cette source.") { scope.launch { model.load() } }
                }
            }
        }
    }
}

/** Carte d'un bouquet : emoji du fournisseur (ou icône du thème), nom, teinte propre. */
@Composable
fun BouquetCard(name: String, onClick: () -> Unit) {
    val trimmed = name.trim()
    val (symbol, title) = remember(name) { splitSymbol(trimmed) }
    val tint = remember(name) {
        val palette = listOf(Theme.teal, Theme.lilac, Theme.cyan, Color(0xFFFDBA74), Color(0xFFF9A8D4), Theme.gold)
        var sum = 0
        name.forEach { sum = (sum * 31 + it.code) and 0xFFFF }
        palette[sum % palette.size]
    }
    val interaction = remember { MutableInteractionSource() }
    val shape = RoundedCornerShape(24.dp)
    Column(
        Modifier.fillMaxWidth().heightIn(min = 138.dp).pressScale(interaction).clip(shape)
            .background(Brush.linearGradient(listOf(tint.copy(alpha = 0.22f), Color(0xE60E1326)))).border(1.dp, tint.copy(alpha = 0.35f), shape)
            .focusRing(shape).clickable(interactionSource = interaction, indication = null, onClick = onClick).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(Modifier.size(46.dp).clip(CircleShape).background(tint.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
            if (symbol != null) Text(symbol, fontSize = 24.sp) else Icon(bouquetIcon(name), contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
        }
        Spacer(Modifier.weight(1f, fill = false))
        Text(title.ifEmpty { name }, color = Theme.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Voir les chaînes", color = tint, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        }
    }
}

/** Emoji en tête du nom (drapeau, symbole) séparé du titre. */
private fun splitSymbol(text: String): Pair<String?, String> {
    if (text.isEmpty()) return null to text
    val first = text.codePointAt(0)
    val type = Character.getType(first)
    val emoji = first >= 0x1F000 || type == Character.OTHER_SYMBOL.toInt() || first in 0x2600..0x27BF
    if (!emoji) return null to text
    var end = Character.charCount(first)
    // Drapeaux (deux lettres régionales), sélecteur de variante, séquences avec liaison.
    if (first in 0x1F1E6..0x1F1FF && end < text.length && text.codePointAt(end) in 0x1F1E6..0x1F1FF) end += Character.charCount(text.codePointAt(end))
    while (end < text.length) {
        val next = text.codePointAt(end)
        if (next == 0xFE0F || next == 0x200D || next in 0x1F3FB..0x1F3FF) {
            end += Character.charCount(next)
            if (next == 0x200D && end < text.length) end += Character.charCount(text.codePointAt(end))
        } else break
    }
    return text.substring(0, end) to text.substring(end).trim()
}

private fun bouquetIcon(name: String): ImageVector {
    val text = name.lowercase()
    val table = listOf(
        "sport" to Icons.Filled.EmojiEvents, "foot" to Icons.Filled.SportsSoccer, "ciné" to Icons.Filled.Movie, "cine" to Icons.Filled.Movie, "film" to Icons.Filled.Movie,
        "série" to Icons.Filled.VideoLibrary, "serie" to Icons.Filled.VideoLibrary, "enfant" to Icons.Filled.ChildCare, "kids" to Icons.Filled.ChildCare,
        "jeunesse" to Icons.Filled.ChildCare, "info" to Icons.Filled.Info, "news" to Icons.Filled.Info, "musique" to Icons.Filled.MusicNote, "music" to Icons.Filled.MusicNote,
        "docu" to Icons.Filled.Public, "adult" to Icons.Filled.VisibilityOff, "radio" to Icons.Filled.Radio, "france" to Icons.Filled.Flag,
        "4k" to Icons.Filled.HighQuality, "uhd" to Icons.Filled.HighQuality
    )
    return table.firstOrNull { text.contains(it.first) }?.second ?: Icons.Filled.Layers
}

// MARK: Fenêtre des serveurs au lancement

/** Serveurs d'une chaîne au lancement : meilleur serveur, compte à rebours, tous les serveurs classés et testés. */
@Composable
fun LiveServerSheet(pick: LivePick, onDismiss: () -> Unit) {
    NoctraSheet(onDismiss) {
        LazyColumn(Modifier.fillMaxWidth().fillMaxHeight(0.92f)) {
            item {
                Row(Modifier.padding(horizontal = 20.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LiveTv, contentDescription = null, tint = Theme.teal, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(pick.channel.name, style = Theme.display(20), color = Theme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text("Annuler", color = Theme.accent, fontWeight = FontWeight.SemiBold, modifier = Modifier.clip(CircleShape).focusRing(CircleShape).clickable(onClick = onDismiss).padding(horizontal = 12.dp, vertical = 8.dp))
                }
            }
            item {
                Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val best = pick.best
                    when {
                        pick.preparing -> LoadingLine("Recherche des serveurs de toutes les sources…")
                        best != null -> {
                            Text("Meilleur serveur", color = Theme.teal, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text(best.label, color = Theme.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                            if (pick.auto && !pick.launching) Text("Lancement dans ${pick.countdown} s · touchez un autre serveur pour le choisir", color = Theme.muted, fontSize = 12.sp)
                            AuroraPrimaryButton(onClick = { LiveLauncher.start(pick, best) }, enabled = !pick.launching, modifier = Modifier.fillMaxWidth()) {
                                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text(if (pick.launching) "Lancement…" else "Regarder maintenant", fontWeight = FontWeight.SemiBold)
                            }
                        }
                        else -> Text("Aucun serveur ne propose cette chaîne pour le moment.", color = Theme.orange)
                    }
                }
            }
            if (pick.servers.isNotEmpty()) {
                item {
                    Text("${pick.servers.size} serveur${if (pick.servers.size > 1) "s" else ""} · classés par fiabilité".uppercase(), color = Theme.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp, modifier = Modifier.padding(start = 20.dp, top = 12.dp, bottom = 4.dp))
                }
                items(pick.servers, key = { it.id }) { server ->
                    PickRow(server, pick)
                    HorizontalDivider(color = Theme.line, modifier = Modifier.padding(start = 56.dp))
                }
            }
        }
    }
}

@Composable
private fun PickRow(server: LiveServer, pick: LivePick) {
    Row(
        Modifier.fillMaxWidth().focusRing(RoundedCornerShape(12.dp)).clickable(enabled = !pick.launching) { LiveLauncher.start(pick, server) }.padding(horizontal = 20.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            when (server.kind) { LiveServer.Kind.web -> Icons.Filled.Public; LiveServer.Kind.resolve -> Icons.Filled.Star; else -> Icons.Filled.LiveTv },
            contentDescription = null, tint = Theme.teal, modifier = Modifier.size(22.dp)
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(server.label, color = Theme.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (server.vip) VipBadge()
            }
            Text(listOfNotNull(server.probeNote, LiveHealth.text(server, pick.channel.id)).joinToString(" · "), color = Theme.muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        val (label, color) = pickInfo(server)
        if (server.probe == LiveServer.Probe.testing) CircularProgressIndicator(color = Theme.muted, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
        if (label.isNotEmpty()) {
            Text(label, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(CircleShape).background(color.copy(alpha = 0.35f)).padding(horizontal = 8.dp, vertical = 4.dp))
        }
    }
}

private fun pickInfo(server: LiveServer): Pair<String, Color> = when (server.probe) {
    LiveServer.Probe.untested -> (when (server.kind) { LiveServer.Kind.web -> "Lecteur web"; LiveServer.Kind.resolve -> "Automatique"; else -> "" }) to Theme.muted
    LiveServer.Probe.testing -> "Test…" to Theme.muted
    LiveServer.Probe.up -> (if (server.format == LiveServer.Format.ts) "En ligne · MPEG-TS" else if (server.probeMs > 3500) "En ligne · lent" else if (server.margin >= 2 || server.margin == 0.0) "En ligne" else "En ligne · juste") to Theme.teal
    LiveServer.Probe.slow -> "Trop lent ici" to Theme.orange
    LiveServer.Probe.late -> "Lent à répondre" to Theme.orange
    LiveServer.Probe.down -> "Hors ligne" to Theme.red
    LiveServer.Probe.noVideo -> "Pas de vidéo" to Theme.red
    LiveServer.Probe.stale -> "Direct figé" to Theme.orange
}
