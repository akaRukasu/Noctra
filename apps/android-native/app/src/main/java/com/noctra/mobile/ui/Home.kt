package com.noctra.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.Fields
import com.noctra.mobile.core.NoctraException
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.int
import com.noctra.mobile.core.str
import com.noctra.mobile.offline.OfflineLibraryScreen
import com.noctra.mobile.offline.OfflineStore
import com.noctra.mobile.play.PlaybackManager
import com.noctra.mobile.sync.SyncPlayManager
import com.noctra.mobile.sync.SyncPlaySheet
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.util.Locale

/** Médiathèque mise en avant sur l'accueil (catalogue du serveur Noctra). */
data class HomeLibrary(val id: String, val name: String, val type: String?, val count: Int?, val image: String?)

class HomeModel {
    var hero by mutableStateOf<List<BaseItem>>(emptyList())
    var heroIsResume by mutableStateOf(true)
    var resume by mutableStateOf<List<BaseItem>>(emptyList())
    var nextUp by mutableStateOf<List<BaseItem>>(emptyList())
    var libraries by mutableStateOf<List<HomeLibrary>>(emptyList())
    var latest by mutableStateOf<List<Pair<BaseItem, List<BaseItem>>>>(emptyList())
    var loading by mutableStateOf(true)
    var failure by mutableStateOf<String?>(null)
    var loaded = false

    suspend fun load() = coroutineScope {
        loading = true
        val card = Fields.card
        val resumeTask = async { loadResume() }
        val nextTask = async { runCatching { Session.items("/Shows/NextUp", mapOf("userId" to Session.userId, "limit" to "20", "fields" to card, "enableResumable" to "false")) }.getOrNull() }
        val newestTask = async {
            runCatching {
                BaseItem.list(Session.json(listOf("/Items/Latest", "/Users/{userId}/Items/Latest"), mapOf("userId" to Session.userId, "limit" to "12", "includeItemTypes" to "Movie,Series",
                    "fields" to "Overview,Genres,ProductionYear,OfficialRating", "enableImageTypes" to "Backdrop,Logo,Primary")))
            }.getOrNull()
        }
        val viewsTask = async { runCatching { Session.items(listOf("/UserViews", "/Users/{userId}/Views"), mapOf("userId" to Session.userId)) }.getOrNull() }
        val catalogTask = async { loadLibraries() }
        val resumed = resumeTask.await()
        val next = nextTask.await()
        val newest = newestTask.await()
        val views = viewsTask.await()
        val catalog = catalogTask.await()
        resume = resumed
        nextUp = next ?: emptyList()
        // Carrousel : « Continuer à regarder » ; sans reprise, les nouveautés.
        if (resumed.isNotEmpty()) {
            hero = resumed.take(10)
            heroIsResume = true
        } else {
            val fresh = newest ?: emptyList()
            hero = fresh.filter { it.backdropImageTags.isNotEmpty() }.ifEmpty { fresh }.take(8)
            heroIsResume = false
        }
        val viewItems = views ?: emptyList()
        val media = viewItems.filter { it.collectionType in setOf("movies", "tvshows") }
        libraries = if (catalog.isEmpty()) media.take(4).map {
            HomeLibrary(it.id, it.title, it.collectionType, null, Session.image(it.id, tag = it.imageTags["Primary"], width = 600))
        } else catalog
        latest = media.take(6).map { library ->
            async {
                val items = runCatching {
                    BaseItem.list(Session.json(listOf("/Items/Latest", "/Users/{userId}/Items/Latest"), mapOf("userId" to Session.userId, "parentId" to library.id, "limit" to "18", "fields" to card)))
                }.getOrNull() ?: emptyList()
                library to items
            }
        }.awaitAll().filter { it.second.isNotEmpty() }
        // Pas de reprise ni de nouveautés globales : le carrousel prend les derniers ajouts des médiathèques.
        if (hero.isEmpty()) {
            val pool = latest.flatMap { it.second }.filter { it.type == "Movie" || it.type == "Series" }
            hero = pool.filter { it.backdropImageTags.isNotEmpty() }.ifEmpty { pool }.take(8)
            heroIsResume = false
        }
        failure = if (views == null && newest == null) NoctraException.unreachable.message else null
        loading = false
        loaded = true
    }

    /** Reprises vues par Noctra (titres vraiment commencés), sinon par Jellyfin. */
    private suspend fun loadResume(): List<BaseItem> {
        if (Session.hasNoctra) {
            val items = runCatching { BaseItem.list(Session.noctraJSON("/api/home/resume", 20.0).asMap()?.get("items")) }.getOrNull()
            if (!items.isNullOrEmpty()) return items
        }
        return runCatching {
            Session.items(listOf("/UserItems/Resume", "/Users/{userId}/Items/Resume"), mapOf("userId" to Session.userId, "limit" to "20", "mediaTypes" to "Video",
                "fields" to Fields.card, "enableImageTypes" to "Primary,Backdrop,Thumb"))
        }.getOrNull() ?: emptyList()
    }

    private suspend fun loadLibraries(): List<HomeLibrary> {
        if (!Session.hasNoctra) return emptyList()
        val json = runCatching { Session.noctraJSON("/api/libraries", 20.0).asMap() }.getOrNull() ?: return emptyList()
        return json.mapNotNull { (label, value) ->
            val entry = value.asMap() ?: return@mapNotNull null
            val id = entry.str("id") ?: return@mapNotNull null
            HomeLibrary(id, label, entry.str("type"), entry.int("count"), entry.str("image")?.let { Session.noctraURL(it) })
        }.sortedByDescending { it.count ?: 0 }
    }
}

/** Accueil, comme Noctra TV : « À l'affiche chez vous », carrousel, derniers ajouts, « À suivre », médiathèques. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen() {
    val model = screenModel { HomeModel() }
    val scope = rememberCoroutineScope()
    val push = rememberPush()
    var showSync by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { if (!model.loaded) model.load() }
    LaunchedEffect(PlaybackManager.endedCount) { if (PlaybackManager.endedCount > 0) model.load() }
    Box(Modifier.fillMaxSize()) {
        AuroraBackground()
        RefreshBox(onRefresh = { model.load() }, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(26.dp)) {
                item {
                    Column(Modifier.statusBarsPadding()) {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            val group = SyncPlayManager.group
                            Row(
                                Modifier.glass(CircleShape).focusRing(CircleShape).clickable { showSync = true }.padding(horizontal = 14.dp, vertical = 9.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Filled.Groups, contentDescription = null, tint = if (group == null) Color.White else Theme.accent, modifier = Modifier.size(18.dp))
                                Text(group?.let { "SyncPlay · ${it.participants.size}" } ?: "SyncPlay", color = if (group == null) Color.White else Theme.accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            }
                            Spacer(Modifier.weight(1f))
                            AccountButton()
                        }
                        Heading()
                    }
                }
                item {
                    when {
                        model.hero.isNotEmpty() -> HeroCarousel(model.hero, model.heroIsResume)
                        model.loading -> Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(390.dp).clip(RoundedCornerShape(30.dp)).background(Theme.surface), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Theme.accent)
                        }
                        model.failure != null -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                            MessageView(Icons.Filled.WifiOff, model.failure ?: "") { scope.launch { model.load() } }
                            if (OfflineStore.downloaded.isNotEmpty()) {
                                AuroraPrimaryButton(onClick = { push { OfflineLibraryScreen() } }) {
                                    Icon(Icons.Filled.DownloadForOffline, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Regarder mes téléchargements")
                                }
                            }
                        }
                    }
                }
                if (!model.heroIsResume) item { ItemRow("Reprendre", model.resume, wide = true) }
                else if (model.resume.size > model.hero.size) item { ItemRow("Autres titres à reprendre", model.resume.drop(model.hero.size), wide = true) }
                items(model.latest, key = { "latest-" + it.first.id }) { entry -> ItemRow("Derniers ajouts · ${entry.first.title}", entry.second) }
                // « À suivre » et les médiathèques ferment l'accueil.
                item { ItemRow("À suivre", model.nextUp, wide = true) }
                if (model.libraries.isNotEmpty()) item { LibraryBlock(model.libraries) }
            }
        }
    }
    if (showSync) SyncPlaySheet { showSync = false }
}

@Composable
private fun Heading() {
    Column(Modifier.padding(horizontal = 20.dp).padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("VOTRE SALLE DE CINÉMA", style = androidx.compose.ui.text.TextStyle(brush = Theme.gradient, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.6.sp))
        Text(buildAnnotatedString {
            withStyle(SpanStyle(brush = Theme.titleGradient)) { append("À l’affiche chez vous") }
            withStyle(SpanStyle(brush = Theme.gradient)) { append(".") }
        }, style = Theme.display(32), maxLines = 2)
        Text("Votre collection. À votre rythme.", color = Color(0xFFB8B5D6), fontSize = 15.sp)
    }
}

@Composable
private fun LibraryBlock(libraries: List<HomeLibrary>) {
    val push = rememberPush()
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("Médiathèques", Modifier.padding(horizontal = 20.dp))
        BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
            val columns = if (maxWidth > 700.dp) 4 else 2
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                libraries.take(4).chunked(columns).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        row.forEach { library ->
                            val source = remember { MutableInteractionSource() }
                            Column(
                                Modifier.weight(1f).pressScale(source).focusRing(RoundedCornerShape(20.dp))
                                    .clickable(interactionSource = source, indication = null) { push { LibraryGridScreen(com.noctra.mobile.core.LibraryRoute(library.id, library.name, library.type)) } },
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                RemoteImage(library.image ?: Session.image(library.id, width = 600), Modifier.fillMaxWidth().aspectRatio(16f / 9f).auroraCard(20.dp))
                                Row(Modifier.padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(library.name, color = Color(0xFFF3F0FF), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                    library.count?.let { Text("$it", color = Theme.muted, fontSize = 12.sp) }
                                }
                            }
                        }
                        repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

/** Carrousel : pages magnétiques, image entière en 16:9, informations dessous sur la même image floutée. */
@Composable
fun HeroCarousel(items: List<BaseItem>, resume: Boolean) {
    val pager = rememberPagerState { items.size }
    val scope = rememberCoroutineScope()
    val open = rememberOpenItem()
    var starting by remember { mutableStateOf<String?>(null) }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val fullWidth = maxWidth
        val cardWidth = minOf(fullWidth - 32.dp, 760.dp)
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            HorizontalPager(state = pager, contentPadding = PaddingValues(horizontal = (fullWidth - cardWidth) / 2), pageSpacing = 12.dp, modifier = Modifier.fillMaxWidth()) { index ->
                val item = items[index]
                val artwork = if (item.type == "Episode") Session.thumb(item, 1280) else Session.backdrop(item, 1280)
                val source = remember { MutableInteractionSource() }
                val shape = RoundedCornerShape(30.dp)
                Column(
                    Modifier.width(cardWidth).padding(vertical = 10.dp).pressScale(source, 0.97f)
                        .border(2.dp, Theme.ringGradient, shape).padding(2.dp).clip(shape).background(Color(0xFF0C0F1F))
                        .focusRing(shape).clickable(interactionSource = source, indication = null) { open(item) }
                ) {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
                        RemoteImage(artwork, Modifier.fillMaxSize().graphicsLayer {
                            val offset = (pager.currentPage - index) + pager.currentPageOffsetFraction
                            translationX = offset * 40f
                            scaleX = 1.08f; scaleY = 1.08f
                        })
                        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(56.dp).background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xE60C0F1F)))))
                    }
                    Box {
                        // Fond des informations : la même image, floutée et assombrie.
                        RemoteImage(artwork, Modifier.matchParentSize().blur(28.dp).graphicsLayer { alpha = 0.5f; scaleY = -1f }, placeholder = false)
                        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color(0x590C0F1F), Color(0xD90C0F1F)))))
                        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Eyebrow(if (resume) "CONTINUER À REGARDER" else "À L’AFFICHE", Modifier.offset(y = (-14).dp))
                            val logo = Session.logo(item)
                            if (logo != null) {
                                RemoteImage(logo, Modifier.height(50.dp).widthIn(max = 230.dp).fillMaxWidth(), contentScale = ContentScale.Fit, alignment = Alignment.CenterStart, placeholder = false)
                            } else {
                                Text(if (item.type == "Episode") item.seriesName ?: item.title else item.title, style = Theme.display(25).copy(brush = Theme.posterTitleGradient), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Text(
                                if (resume) listOfNotNull(item.episodeLabel, if (item.type == "Episode") item.name else null, remaining(item)).joinToString(" · ")
                                else listOfNotNull(item.productionYear?.toString(), item.genres.take(2).joinToString(" · ").takeIf { it.isNotEmpty() }).joinToString(" · "),
                                color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                AuroraPrimaryButton(onClick = {
                                    if (item.isSeries) { open(item); return@AuroraPrimaryButton }
                                    if (starting != null) return@AuroraPrimaryButton
                                    starting = item.id
                                    scope.launch {
                                        runCatching { PlaybackManager.play(item, startSeconds = item.resumeSeconds) }.onFailure { Notices.announce("Lecture impossible : ${it.message}") }
                                        starting = null
                                    }
                                }) {
                                    if (starting == item.id) CircularProgressIndicator(Modifier.size(18.dp), color = Theme.onAccent, strokeWidth = 2.dp)
                                    else Icon(if (item.isSeries) Icons.Filled.Info else Icons.Filled.PlayArrow, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text(if (resume) "Reprendre" else if (item.isSeries) "Voir" else "Lecture", fontWeight = FontWeight.SemiBold)
                                }
                                if (resume) item.progress?.let { ProgressLine(it, Modifier.weight(1f)) }
                            }
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally)) {
                items.indices.forEach { index ->
                    val active = index == pager.currentPage
                    Box(Modifier.height(7.dp).width(if (active) 20.dp else 7.dp).clip(CircleShape).background(if (active) Theme.accent else Color.White.copy(alpha = 0.3f)))
                }
            }
        }
    }
}

private fun remaining(item: BaseItem): String? {
    val ticks = item.runTimeTicks ?: return null
    if (ticks <= 0) return null
    val left = maxOf(0.0, ticks / 10_000_000.0 - item.resumeSeconds)
    val minutes = (left / 60).toInt()
    return if (minutes >= 60) "Reste ${minutes / 60} h ${String.format(Locale.FRANCE, "%02d", minutes % 60)}" else "Reste $minutes min"
}
