package com.noctra.mobile.ui.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material.icons.filled.Downloading
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.cast.CastSheet
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.Fields
import com.noctra.mobile.core.Person
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.clock
import com.noctra.mobile.offline.OfflineButton
import com.noctra.mobile.offline.OfflineQuality
import com.noctra.mobile.offline.OfflineState
import com.noctra.mobile.offline.OfflineStore
import com.noctra.mobile.play.PlaybackManager
import com.noctra.mobile.sync.SyncPlayManager
import com.noctra.mobile.ui.AuroraPrimaryButton
import com.noctra.mobile.ui.AuroraSecondaryButton
import com.noctra.mobile.ui.ItemRow
import com.noctra.mobile.ui.LocalNavigator
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.ProgressLine
import com.noctra.mobile.ui.RemoteImage
import com.noctra.mobile.ui.SectionTitle
import com.noctra.mobile.ui.SettingGroup
import com.noctra.mobile.ui.SettingRow
import com.noctra.mobile.ui.SheetColumn
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import com.noctra.mobile.ui.pressScale
import com.noctra.mobile.ui.screenModel
import kotlinx.coroutines.launch

class DetailModel(val item: BaseItem) {
    var detail by mutableStateOf<BaseItem?>(null)
    var seasons by mutableStateOf<List<BaseItem>>(emptyList())
    var season by mutableStateOf<String?>(null)
    var episodes by mutableStateOf<List<BaseItem>>(emptyList())
    var nextEpisode by mutableStateOf<BaseItem?>(null)
    var similar by mutableStateOf<List<BaseItem>>(emptyList())
    var audioIndex by mutableStateOf<Int?>(null)
    var subtitleIndex by mutableStateOf<Int?>(null)
    var favorite by mutableStateOf(item.userData?.isFavorite == true)
    var played by mutableStateOf(item.userData?.played == true)
    var starting by mutableStateOf(false)
    var playError by mutableStateOf<String?>(null)

    val shown: BaseItem get() = detail ?: item
    val playTarget: BaseItem?
        get() = when {
            shown.isSeries -> nextEpisode ?: episodes.firstOrNull()
            shown.type == "Season" -> episodes.firstOrNull { it.userData?.played != true } ?: episodes.firstOrNull()
            else -> shown
        }

    suspend fun load() {
        val full = runCatching { BaseItem.from(Session.json(listOf("/Items/${item.id}", "/Users/{userId}/Items/${item.id}"), mapOf("userId" to Session.userId, "fields" to Fields.detail))) }.getOrNull()
        if (full != null) {
            detail = full
            favorite = full.userData?.isFavorite == true
            played = full.userData?.played == true
            val streams = full.mediaSources.firstOrNull()?.mediaStreams ?: emptyList()
            if (audioIndex == null) audioIndex = (streams.firstOrNull { it.type == "Audio" && it.isDefault } ?: streams.firstOrNull { it.type == "Audio" })?.index
            if (subtitleIndex == null) subtitleIndex = streams.firstOrNull { it.type == "Subtitle" && (it.isForced || it.isDefault) }?.index ?: -1
        }
        val current = full ?: item
        if (current.isSeries) {
            seasons = runCatching { Session.items("/Shows/${current.id}/Seasons", mapOf("userId" to Session.userId, "fields" to Fields.card)) }.getOrNull() ?: emptyList()
            nextEpisode = runCatching { Session.items("/Shows/NextUp", mapOf("userId" to Session.userId, "seriesId" to current.id, "fields" to Fields.card, "limit" to "1")) }.getOrNull()?.firstOrNull()
            val preferred = nextEpisode?.seasonId ?: season ?: seasons.firstOrNull()?.id
            if (preferred != null) { season = preferred; loadEpisodes(preferred) }
        } else if (current.type == "Season") {
            season = current.id
            loadEpisodes(current.id)
        }
        if (similar.isEmpty()) similar = runCatching { Session.items("/Items/${item.id}/Similar", mapOf("userId" to Session.userId, "limit" to "16", "fields" to Fields.card)) }.getOrNull() ?: emptyList()
    }

    suspend fun loadEpisodes(seasonId: String) {
        val seriesId = if (shown.isSeries) shown.id else shown.seriesId ?: shown.id
        episodes = runCatching { Session.items("/Shows/$seriesId/Episodes", mapOf("userId" to Session.userId, "seasonId" to seasonId, "fields" to Fields.card + ",MediaSources")) }.getOrNull() ?: emptyList()
    }

    suspend fun play(target: BaseItem, fromStart: Boolean) {
        if (starting) return
        starting = true
        try {
            val same = target.id == shown.id
            PlaybackManager.play(target, if (same) audioIndex else null, if (same) subtitleIndex else null, if (fromStart) 0.0 else target.resumeSeconds)
        } catch (error: Exception) {
            playError = error.message
        }
        starting = false
    }

    suspend fun toggleFavorite() {
        val target = !favorite
        favorite = target
        runCatching { Session.send(if (target) "POST" else "DELETE", listOf("/UserFavoriteItems/${item.id}", "/Users/{userId}/FavoriteItems/${item.id}"), mapOf("userId" to Session.userId)) }
            .onFailure { favorite = !target }
    }

    suspend fun togglePlayed() {
        val target = !played
        played = target
        runCatching { Session.send(if (target) "POST" else "DELETE", listOf("/UserPlayedItems/${item.id}", "/Users/{userId}/PlayedItems/${item.id}"), mapOf("userId" to Session.userId)) }
            .onFailure { played = !target }
    }
}

/** Fiche d'un film, d'une série ou d'un épisode : fond étirable, lecture, pistes, saisons. */
@Composable
fun ItemDetailScreen(item: BaseItem) {
    val model = screenModel("detail-" + item.id) { DetailModel(item) }
    val scope = rememberCoroutineScope()
    val navigator = LocalNavigator.current
    val list = rememberLazyListState()
    var showCast by remember { mutableStateOf(false) }
    var overviewOpen by remember { mutableStateOf(false) }
    var seasonQuality by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { model.load() }
    LaunchedEffect(PlaybackManager.endedCount) { if (PlaybackManager.endedCount > 0) model.load() }
    val shown = model.shown
    val headerImage = if (shown.type == "Episode") Session.thumb(shown, 1600) else Session.backdrop(shown, 1600)

    Box(Modifier.fillMaxSize().background(Theme.background)) {
        // Halo de l'image derrière le titre et les boutons.
        RemoteImage(headerImage, Modifier.fillMaxWidth().height(520.dp).blur(50.dp).graphicsLayer { alpha = 0.35f }, placeholder = false)
        LazyColumn(state = list, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
            item {
                Column {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
                        RemoteImage(headerImage, Modifier.fillMaxSize().graphicsLayer {
                            // Léger parallaxe au défilement.
                            if (list.firstVisibleItemIndex == 0) translationY = list.firstVisibleItemScrollOffset * 0.5f
                        })
                        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(120.dp).background(Brush.verticalGradient(listOf(Color.Transparent, Theme.background.copy(alpha = 0.6f), Theme.background))))
                    }
                    Column(Modifier.padding(horizontal = 20.dp).offset(y = (-44).dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        val logo = Session.logo(shown)
                        if (logo != null) {
                            RemoteImage(logo, Modifier.height(72.dp).widthIn(max = 260.dp).fillMaxWidth(), contentScale = ContentScale.Fit, alignment = Alignment.BottomStart, placeholder = false)
                        } else {
                            Text(if (shown.type == "Episode") shown.seriesName ?: shown.title else shown.title, style = Theme.display(32).copy(brush = Theme.posterTitleGradient), maxLines = 3)
                        }
                        if (shown.type == "Episode") Text(listOfNotNull(shown.episodeLabel, shown.name).joinToString(" · "), color = Theme.ink, fontWeight = FontWeight.SemiBold)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (shown.subtitleLine.isNotEmpty()) Text(shown.subtitleLine, color = Color.White.copy(alpha = 0.75f), fontSize = 14.sp)
                            shown.communityRating?.let {
                                Icon(Icons.Filled.Star, contentDescription = null, tint = Color.White.copy(alpha = 0.75f), modifier = Modifier.size(14.dp))
                                Text(String.format(java.util.Locale.FRANCE, "%.1f", it), color = Color.White.copy(alpha = 0.75f), fontSize = 14.sp)
                            }
                        }
                        if (shown.genres.isNotEmpty()) Text(shown.genres.take(3).joinToString(" · "), color = Theme.muted, fontSize = 13.sp)
                    }
                }
            }
            item { Actions(model, onCast = { showCast = true }) }
            shown.overview?.takeIf { it.isNotEmpty() }?.let { overview ->
                item {
                    Text(overview, color = Color.White.copy(alpha = 0.85f), maxLines = if (overviewOpen) Int.MAX_VALUE else 4, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(horizontal = 20.dp).clickable { overviewOpen = !overviewOpen })
                }
            }
            if (shown.isSeries || shown.type == "Season") {
                if (model.seasons.size > 1) item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(model.seasons, key = { it.id }) { entry ->
                            val selected = model.season == entry.id
                            Text(entry.title, color = if (selected) Theme.onAccent else Theme.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
                                modifier = Modifier.clip(CircleShape).background(if (selected) Theme.lilac else Color(0x991A1D33)).focusRing(CircleShape)
                                    .clickable { model.season = entry.id; scope.launch { model.loadEpisodes(entry.id) } }.padding(horizontal = 14.dp, vertical = 9.dp))
                        }
                    }
                }
                if (model.episodes.isNotEmpty()) item {
                    val seasonDownloaded = model.episodes.all { OfflineStore.entry(it.id) != null }
                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.End) {
                        AuroraSecondaryButton(onClick = { seasonQuality = true }, enabled = !seasonDownloaded) {
                            Icon(if (seasonDownloaded) Icons.Filled.DownloadDone else Icons.Filled.DownloadForOffline, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(if (seasonDownloaded) "Saison sur l’appareil" else "Télécharger la saison", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                items(model.episodes, key = { "ep-" + it.id }) { episode ->
                    EpisodeRow(episode) { scope.launch { model.play(episode, false) } }
                }
            }
            val people = shown.people.filter { it.type == "Actor" }.take(20)
            if (people.isNotEmpty()) item { CastRow(people) }
            item { ItemRow("Dans le même genre", model.similar) }
        }
        // Barre du haut : retour, favori, vu.
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (navigator?.canPop == true) IconButton(onClick = { navigator.pop() }, modifier = Modifier.size(44.dp).glass(CircleShape, Color(0x99101222)).focusRing(CircleShape)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour", tint = Theme.ink)
            }
            Spacer(Modifier.weight(1f))
            Row(Modifier.glass(CircleShape, Color(0x99101222))) {
                IconButton(onClick = { scope.launch { model.toggleFavorite() } }, modifier = Modifier.focusRing(CircleShape)) {
                    Icon(if (model.favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, contentDescription = "Favori", tint = Theme.lilac)
                }
                IconButton(onClick = { scope.launch { model.togglePlayed() } }, modifier = Modifier.focusRing(CircleShape)) {
                    Icon(if (model.played) Icons.Filled.CheckCircle else Icons.Outlined.CheckCircle, contentDescription = "Vu", tint = Theme.lilac)
                }
            }
        }
    }

    if (showCast) model.playTarget?.let { target ->
        CastSheet(target, target.resumeSeconds, if (target.id == shown.id) model.audioIndex else null, if (target.id == shown.id) model.subtitleIndex else null) { showCast = false }
    }
    if (seasonQuality) NoctraSheet({ seasonQuality = false }, full = false) {
        SheetColumn("Télécharger ${model.episodes.size} épisode${if (model.episodes.size > 1) "s" else ""}") {
            Text("Les épisodes se téléchargent l’un après l’autre, même appli fermée.", color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp))
            SettingGroup {
                OfflineQuality.entries.forEach { quality ->
                    SettingRow(quality.label, value = quality.detail, onClick = { seasonQuality = false; OfflineStore.download(model.episodes, quality) })
                }
            }
        }
    }
    model.playError?.let { message ->
        AlertDialog(onDismissRequest = { model.playError = null }, confirmButton = { TextButton(onClick = { model.playError = null }) { Text("OK") } },
            title = { Text("Lecture impossible") }, text = { Text(message) })
    }
}

@Composable
private fun Actions(model: DetailModel, onCast: () -> Unit) {
    val scope = rememberCoroutineScope()
    val shown = model.shown
    val target = model.playTarget
    val resume = target?.resumeSeconds ?: 0.0
    Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            AuroraPrimaryButton(onClick = { target?.let { scope.launch { model.play(it, false) } } }, enabled = target != null && !model.starting, modifier = Modifier.weight(1f)) {
                if (model.starting) CircularProgressIndicator(Modifier.size(18.dp), color = Theme.onAccent, strokeWidth = 2.dp) else Icon(Icons.Filled.PlayArrow, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(playLabel(shown, target, resume), fontWeight = FontWeight.SemiBold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (resume > 0 && target != null) {
                IconButton(onClick = { scope.launch { model.play(target, true) } }, modifier = Modifier.size(50.dp).glass(CircleShape).focusRing(CircleShape)) {
                    Icon(Icons.Filled.Replay, contentDescription = "Depuis le début", tint = Theme.ink)
                }
            }
            if (!shown.isFolder) OfflineButton(shown, model.audioIndex)
            if (target != null) {
                // Diffusion : Chromecast, autre appareil (Noctra TV, navigateur…).
                IconButton(onClick = onCast, modifier = Modifier.size(50.dp).glass(CircleShape).focusRing(CircleShape)) {
                    Icon(Icons.Filled.Cast, contentDescription = "Lire sur…", tint = Theme.ink)
                }
            }
        }
        SyncPlayManager.group?.let { group ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Groups, contentDescription = null, tint = Theme.accent, modifier = Modifier.size(16.dp))
                Text("SyncPlay · « ${group.name} » : la lecture démarre pour tout le groupe.", color = Theme.accent, fontSize = 13.sp)
            }
        }
        if (!shown.isFolder) TrackMenus(model)
    }
}

private fun playLabel(shown: BaseItem, target: BaseItem?, resume: Double): String {
    if (target == null) return "Lecture"
    val prefix = if (resume > 0) "Reprendre" else "Lecture"
    if (target.id != shown.id) target.episodeLabel?.let { return "$prefix · $it" }
    if (resume > 0) return "$prefix · ${clock(resume)}"
    return prefix
}

@Composable
private fun TrackMenus(model: DetailModel) {
    val streams = model.shown.mediaSources.firstOrNull()?.mediaStreams ?: emptyList()
    val audios = streams.filter { it.type == "Audio" }
    val subtitles = streams.filter { it.type == "Subtitle" }
    if (audios.size <= 1 && subtitles.isEmpty()) return
    var audioMenu by remember { mutableStateOf(false) }
    var subtitleMenu by remember { mutableStateOf(false) }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (audios.size > 1) Box(Modifier.weight(1f)) {
            TrackChip(Icons.Filled.GraphicEq, audios.firstOrNull { it.index == model.audioIndex }?.label ?: "Audio") { audioMenu = true }
            DropdownMenu(expanded = audioMenu, onDismissRequest = { audioMenu = false }) {
                audios.forEach { stream -> DropdownMenuItem(text = { Text((if (stream.index == model.audioIndex) "✓ " else "") + stream.label) }, onClick = { audioMenu = false; model.audioIndex = stream.index }) }
            }
        }
        if (subtitles.isNotEmpty()) Box(Modifier.weight(1f)) {
            TrackChip(Icons.Filled.Subtitles, subtitles.firstOrNull { it.index == model.subtitleIndex }?.label ?: "Sous-titres") { subtitleMenu = true }
            DropdownMenu(expanded = subtitleMenu, onDismissRequest = { subtitleMenu = false }) {
                DropdownMenuItem(text = { Text((if (model.subtitleIndex == -1) "✓ " else "") + "Aucun") }, onClick = { subtitleMenu = false; model.subtitleIndex = -1 })
                subtitles.forEach { stream -> DropdownMenuItem(text = { Text((if (stream.index == model.subtitleIndex) "✓ " else "") + stream.label) }, onClick = { subtitleMenu = false; model.subtitleIndex = stream.index }) }
            }
        }
    }
}

@Composable
private fun TrackChip(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().glass(CircleShape).focusRing(CircleShape).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = Theme.lilac, modifier = Modifier.size(18.dp))
        Text(label, color = Theme.lilac, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Ligne d'épisode : vignette, numéro, résumé, lecture directe. */
@Composable
private fun EpisodeRow(episode: BaseItem, play: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    Row(
        Modifier.padding(horizontal = 20.dp).fillMaxWidth().pressScale(source, 0.97f).focusRing(RoundedCornerShape(14.dp)).clickable(interactionSource = source, indication = null, onClick = play),
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Box(Modifier.size(150.dp, 84.dp).clip(RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
            RemoteImage(Session.thumb(episode, 480), Modifier.fillMaxSize())
            Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Color.White, modifier = Modifier.size(34.dp).glass(CircleShape, Color(0x66000000)).padding(7.dp))
            episode.progress?.let { ProgressLine(it, Modifier.align(Alignment.BottomCenter).padding(6.dp)) }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(listOfNotNull(episode.indexNumber?.let { "$it." }, episode.name).joinToString(" "), color = Theme.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (episode.userData?.played == true) Icon(Icons.Filled.CheckCircle, contentDescription = "Vu", tint = Theme.accent, modifier = Modifier.size(14.dp))
                OfflineStore.entry(episode.id)?.let { offline ->
                    Icon(if (offline.state == OfflineState.done) Icons.Filled.DownloadDone else Icons.Filled.Downloading, contentDescription = null, tint = if (offline.state == OfflineState.done) Theme.teal else Theme.muted, modifier = Modifier.size(14.dp))
                }
            }
            episode.runtime?.let { Text(it, color = Theme.muted, fontSize = 12.sp) }
            episode.overview?.let { Text(it, color = Theme.muted, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis) }
        }
    }
}

@Composable
private fun CastRow(people: List<Person>) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("Distribution", Modifier.padding(horizontal = 20.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(people) { person ->
                Column(Modifier.width(86.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    RemoteImage(Session.image(person.id, tag = person.primaryImageTag, width = 200), Modifier.size(76.dp).clip(CircleShape))
                    Text(person.name ?: "", color = Theme.ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(person.role ?: "", color = Theme.muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
