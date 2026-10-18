package com.noctra.mobile.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.Session
import com.noctra.mobile.offline.OfflineState
import com.noctra.mobile.offline.OfflineStore
import com.noctra.mobile.play.PlaybackManager
import kotlinx.coroutines.launch

/** Bandeau d'information commun de l'appli (erreurs de lecture, téléchargements, SyncPlay…). */
object Notices {
    var current by mutableStateOf<String?>(null)
        private set
    private var serial = 0
    var id by mutableStateOf(0)
        private set

    fun announce(message: String) {
        serial += 1
        id = serial
        current = message
    }

    fun clear() { current = null }
}

/** Image distante (cache mémoire et disque), fondu à l'arrivée ; fond neutre pendant le chargement. */
@Composable
fun RemoteImage(url: String?, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Crop, alignment: Alignment = Alignment.Center, placeholder: Boolean = true) {
    val context = LocalContext.current
    Box(modifier.then(if (placeholder && contentScale == ContentScale.Crop) Modifier.background(Theme.surface) else Modifier)) {
        if (url != null) {
            AsyncImage(
                model = remember(url) { ImageRequest.Builder(context).data(url).crossfade(220).build() },
                contentDescription = null,
                contentScale = contentScale,
                alignment = alignment,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

/** Barre d'avancement (reprise de lecture). */
@Composable
fun ProgressLine(value: Double, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.22f))) {
        Box(Modifier.fillMaxWidth(value.toFloat().coerceIn(0.03f, 1f)).height(4.dp).clip(CircleShape).background(Theme.gradient))
    }
}

/** Ouvre la fiche d'un titre dans l'onglet en cours. */
@Composable
fun rememberOpenItem(): (BaseItem) -> Unit {
    val push = rememberPush()
    return remember(push) { { item -> push { com.noctra.mobile.ui.detail.ItemDetailScreen(item) } } }
}

/** Carte cliquable (appui : fiche ; appui long : actions rapides), sélectionnable à la télécommande. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ItemCard(item: BaseItem, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val open = rememberOpenItem()
    var menu by remember { mutableStateOf(false) }
    val source = remember { MutableInteractionSource() }
    Box(modifier) {
        Box(
            Modifier.pressScale(source).focusRing(RoundedCornerShape(18.dp))
                .combinedClickable(interactionSource = source, indication = null, onClick = { open(item) }, onLongClick = { menu = true })
        ) { content() }
        ItemActionsMenu(item, menu) { menu = false }
    }
}

/** Affiche verticale. */
@Composable
fun PosterCard(item: BaseItem, width: Dp = 128.dp, modifier: Modifier = Modifier) {
    ItemCard(item, modifier.width(width)) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.width(width).aspectRatio(2f / 3f).auroraCard()) {
                RemoteImage(Session.poster(item), Modifier.fillMaxSize())
                item.progress?.let { ProgressLine(it, Modifier.align(Alignment.BottomCenter).padding(8.dp)) }
                if (item.userData?.played == true) PlayedBadge(Modifier.align(Alignment.TopEnd).padding(6.dp))
            }
            Text(item.displayTitle, color = Color(0xFFF3F0FF), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                when (item.type) {
                    "Episode" -> item.episodeLabel ?: ""
                    "Season" -> item.title
                    else -> item.productionYear?.toString() ?: " "
                },
                color = Theme.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun PlayedBadge(modifier: Modifier = Modifier) {
    Box(modifier.size(24.dp).clip(CircleShape).background(Brush.linearGradient(listOf(Theme.deepViolet, Theme.fuchsia))), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.Check, contentDescription = "Vu", tint = Color.White, modifier = Modifier.size(14.dp))
    }
}

/** Vignette 16:9 : reprises, épisodes. */
@Composable
fun WideCard(item: BaseItem, width: Dp = 250.dp, modifier: Modifier = Modifier) {
    ItemCard(item, modifier.width(width)) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.width(width).aspectRatio(16f / 9f).auroraCard()) {
                RemoteImage(Session.thumb(item), Modifier.fillMaxSize())
                item.progress?.let { ProgressLine(it, Modifier.align(Alignment.BottomCenter).padding(10.dp)) }
            }
            Text(if (item.type == "Episode") item.seriesName ?: item.title else item.title, color = Color(0xFFF3F0FF), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (item.type == "Episode") listOfNotNull(item.episodeLabel, item.name).joinToString(" · ") else item.subtitleLine,
                color = Theme.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/** Appui long sur une affiche : actions rapides (lecture, hors ligne, favori, vu). */
@Composable
fun ItemActionsMenu(item: BaseItem, expanded: Boolean, dismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var favorite by remember(item.id) { mutableStateOf(item.userData?.isFavorite == true) }
    var played by remember(item.id) { mutableStateOf(item.userData?.played == true) }
    DropdownMenu(expanded = expanded, onDismissRequest = dismiss, modifier = Modifier.background(Color(0xFF151932))) {
        Text(item.displayTitle, color = Theme.ink, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp), maxLines = 2)
        if (item.subtitleLine.isNotEmpty()) Text(item.subtitleLine, color = Theme.muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 6.dp))
        HorizontalDivider(color = Theme.line)
        if (item.isPlayable) {
            MenuRow(if (item.progress != null) "Reprendre" else "Lecture", Icons.Filled.PlayArrow) {
                dismiss()
                scope.launch { runCatching { PlaybackManager.play(item, startSeconds = item.resumeSeconds) }.onFailure { Notices.announce("Lecture impossible : ${it.message}") } }
            }
            if (item.progress != null) MenuRow("Lire depuis le début", Icons.Filled.Replay) {
                dismiss()
                scope.launch { runCatching { PlaybackManager.play(item, startSeconds = 0.0) }.onFailure { Notices.announce("Lecture impossible : ${it.message}") } }
            }
            val offline = OfflineStore.entry(item.id)
            if (offline != null) {
                if (offline.state == OfflineState.done) MenuRow("Lire hors ligne", Icons.Filled.DownloadForOffline) { dismiss(); PlaybackManager.playOffline(offline) }
                MenuRow(if (offline.state == OfflineState.done) "Supprimer le téléchargement" else "Annuler le téléchargement", Icons.Filled.Delete) { dismiss(); OfflineStore.delete(item.id) }
            } else {
                MenuRow("Télécharger", Icons.Filled.ArrowDownward) { dismiss(); OfflineStore.download(item) }
            }
        }
        MenuRow(if (favorite) "Retirer des favoris" else "Ajouter aux favoris", if (favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder) {
            dismiss()
            val target = !favorite
            favorite = target
            scope.launch {
                runCatching { Session.send(if (target) "POST" else "DELETE", listOf("/UserFavoriteItems/${item.id}", "/Users/{userId}/FavoriteItems/${item.id}"), mapOf("userId" to Session.userId)) }
                    .onFailure { favorite = !target }
            }
        }
        MenuRow(if (played) "Marquer comme non vu" else "Marquer comme vu", if (played) Icons.Filled.VisibilityOff else Icons.Filled.CheckCircle) {
            dismiss()
            val target = !played
            played = target
            scope.launch {
                runCatching { Session.send(if (target) "POST" else "DELETE", listOf("/UserPlayedItems/${item.id}", "/Users/{userId}/PlayedItems/${item.id}"), mapOf("userId" to Session.userId)) }
                    .onFailure { played = !target }
            }
        }
    }
}

@Composable
fun MenuRow(title: String, icon: ImageVector, destructive: Boolean = false, action: () -> Unit) {
    DropdownMenuItem(
        text = { Text(title, color = if (destructive) Theme.red else Theme.ink) },
        leadingIcon = { Icon(icon, contentDescription = null, tint = if (destructive) Theme.red else Theme.accent) },
        onClick = action
    )
}

/** Rangée horizontale avec alignement magnétique des cartes. */
@Composable
fun ItemRow(title: String, items: List<BaseItem>, wide: Boolean = false, compact: Boolean = false) {
    if (items.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle(title, Modifier.padding(horizontal = 20.dp))
        val state = rememberLazyListState()
        LazyRow(
            state = state,
            flingBehavior = rememberSnapFlingBehavior(state),
            contentPadding = PaddingValues(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            items(items) { item ->
                if (wide) WideCard(item, if (compact) 220.dp else 250.dp) else PosterCard(item, if (compact) 118.dp else 128.dp)
            }
        }
    }
}

@Composable
fun LoadingView(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().heightIn(min = 240.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Theme.accent)
    }
}

@Composable
fun MessageView(icon: ImageVector, text: String, modifier: Modifier = Modifier, retry: (() -> Unit)? = null) {
    Column(modifier.fillMaxWidth().heightIn(min = 260.dp).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically)) {
        Icon(icon, contentDescription = null, tint = Theme.accent, modifier = Modifier.size(42.dp))
        Text(text, color = Theme.muted, textAlign = TextAlign.Center)
        if (retry != null) AuroraSecondaryButton(onClick = retry) { Text("Réessayer") }
    }
}

/** Ligne d'un panneau de réglages (titre, valeur, action). */
@Composable
fun SettingRow(title: String, modifier: Modifier = Modifier, value: String? = null, icon: ImageVector? = null, tint: Color = Theme.accent, onClick: (() -> Unit)? = null, trailing: @Composable (() -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().then(if (onClick != null) Modifier.focusRing(RoundedCornerShape(12.dp)).clickable(onClick = onClick) else Modifier).padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        Text(title, color = Theme.ink, modifier = Modifier.weight(1f))
        if (value != null) Text(value, color = Theme.muted, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        trailing?.invoke()
    }
}

/** Groupe de réglages (comme une section de liste iOS). */
@Composable
fun SettingGroup(header: String? = null, footer: String? = null, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        if (header != null) Text(header.uppercase(), color = Theme.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp, modifier = Modifier.padding(start = 6.dp, bottom = 6.dp))
        Column(Modifier.fillMaxWidth().auroraPanel(18.dp)) { content() }
        if (footer != null) Text(footer, color = Theme.muted, fontSize = 12.sp, modifier = Modifier.padding(start = 6.dp, top = 6.dp, end = 6.dp))
    }
}

/** Feuille du bas (comme les feuilles d'iOS) : grande, fond de nuit. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoctraSheet(onDismiss: () -> Unit, full: Boolean = true, content: @Composable BoxScope.() -> Unit) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = full)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = Color(0xFF0B0D1B), contentColor = Theme.ink, dragHandle = {
        Box(Modifier.padding(vertical = 10.dp).size(width = 40.dp, height = 5.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.25f)))
    }) {
        Box(Modifier.fillMaxWidth().navigationBarsPadding(), content = content)
    }
}

/** Contenu défilant d'une feuille, avec un titre. */
@Composable
fun SheetColumn(title: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
        Text(title, style = Theme.display(20), color = Theme.ink, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        content()
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
fun InfoNote(text: String, color: Color = Theme.muted, modifier: Modifier = Modifier) {
    Row(modifier.padding(horizontal = 20.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Outlined.Info, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        Text(text, color = color, fontSize = 13.sp)
    }
}
