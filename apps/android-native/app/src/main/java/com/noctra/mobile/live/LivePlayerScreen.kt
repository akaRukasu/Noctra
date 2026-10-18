package com.noctra.mobile.live

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.os.Handler
import android.os.Looper
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PictureInPictureAlt
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.SettingsInputAntenna
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.noctra.mobile.MainActivity
import com.noctra.mobile.Pip
import com.noctra.mobile.core.Json
import com.noctra.mobile.core.Net
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.str
import com.noctra.mobile.play.ImmersiveEffect
import com.noctra.mobile.play.coerceAspect
import com.noctra.mobile.play.findActivity
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.SearchField
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import kotlinx.coroutines.delay
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import kotlin.math.roundToInt

/**
 * Lecteur TV plein écran : vidéo (ExoPlayer ou lecteur web), commandes qui se
 * masquent seules, chaîne précédente/suivante (glisser verticalement ou
 * touches Chaîne +/− et haut/bas de la télécommande), chaînes et serveurs
 * sans quitter le lecteur.
 */
@OptIn(UnstableApi::class)
@Composable
fun LivePlayerScreen() {
    val model = LivePlayerModel
    var controls by remember { mutableStateOf(true) }
    var hideTick by remember { mutableIntStateOf(0) }
    var showChannels by remember { mutableStateOf(false) }
    var showServers by remember { mutableStateOf(false) }
    var drag by remember { mutableFloatStateOf(0f) }
    val haptics = LocalHapticFeedback.current
    val focus = remember { FocusRequester() }
    // Page d'un site : elle reçoit les touchers, les commandes de l'appli se replient.
    val pageMode = model.web != null && !model.engineMode
    ImmersiveEffect()

    fun scheduleHide() { hideTick += 1 }
    fun toggleControls() { controls = !controls; if (controls) scheduleHide() }
    fun zap(delta: Int) {
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        model.zap(delta)
        scheduleHide()
    }

    BackHandler {
        when {
            showChannels -> showChannels = false
            showServers -> showServers = false
            else -> model.close()
        }
    }
    LaunchedEffect(hideTick, controls, showChannels, showServers, model.askServer) {
        if (!controls || showChannels || showServers || model.askServer) return@LaunchedEffect
        delay(if (pageMode) 4000 else 5000)
        controls = false
    }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    LaunchedEffect(controls) { if (!controls && !pageMode) runCatching { focus.requestFocus() } }
    LaunchedEffect(model.askServer) { if (model.askServer) { controls = true; showServers = true } }
    LaunchedEffect(model.player) {
        val exo = model.player ?: return@LaunchedEffect
        while (true) {
            val size = exo.videoSize
            if (size.width > 0 && size.height > 0) Pip.aspect = Rational(size.width, size.height).coerceAspect()
            delay(1000)
        }
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (event.key) {
                    Key.ChannelUp, Key.PageUp -> { zap(1); true }
                    Key.ChannelDown, Key.PageDown -> { zap(-1); true }
                    Key.MediaPlayPause, Key.MediaPlay, Key.MediaPause -> { model.togglePause(); true }
                    Key.DirectionUp -> if (!controls && !pageMode) { zap(1); true } else false
                    Key.DirectionDown -> if (!controls && !pageMode) { zap(-1); true } else false
                    Key.DirectionCenter, Key.Enter, Key.NumPadEnter, Key.DirectionLeft, Key.DirectionRight ->
                        if (!controls && !pageMode) { controls = true; scheduleHide(); true } else { scheduleHide(); false }
                    else -> { if (controls) scheduleHide(); false }
                }
            }
            .focusRequester(focus).focusable()
    ) {
        Box(Modifier.fillMaxSize().offset { IntOffset(0, (drag / 3).roundToInt()) }) {
            val web = model.web
            if (web != null) {
                key(web.id) { LiveWebView(web, Modifier.fillMaxSize()) }
            } else {
                val exo = model.player
                AndroidView(
                    factory = { context ->
                        PlayerView(context).apply {
                            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                            useController = false
                            keepScreenOn = true
                            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                            setShutterBackgroundColor(AndroidColor.BLACK)
                            setKeepContentOnPlayerReset(true)
                            isFocusable = false
                            player = exo
                        }
                    },
                    update = { view -> if (view.player !== model.player) view.player = model.player },
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
        if (!pageMode) {
            Box(
                Modifier.fillMaxSize()
                    .pointerInput(Unit) { detectTapGestures(onTap = { toggleControls() }) }
                    .pointerInput(Unit) {
                        detectVerticalDragGestures(
                            onDragEnd = {
                                // Glisser vers le haut : chaîne suivante ; vers le bas : précédente.
                                if (drag < -240f) zap(1) else if (drag > 240f) zap(-1)
                                drag = 0f
                            },
                            onDragCancel = { drag = 0f },
                            onVerticalDrag = { change, amount -> change.consume(); drag += amount }
                        )
                    }
            )
        }
        if (model.loading || model.status != null) {
            Column(
                Modifier.align(Alignment.Center).padding(horizontal = 30.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (model.loading) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(44.dp))
                model.status?.let { status ->
                    Text(
                        status, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                        modifier = Modifier.widthIn(max = 520.dp).glass(RoundedCornerShape(22.dp), Color(0x8C000000)).padding(horizontal = 18.dp, vertical = 12.dp)
                    )
                }
            }
        }
        if (!Pip.active) {
            AnimatedVisibility(controls, enter = fadeIn(), exit = fadeOut(), modifier = Modifier.fillMaxSize()) {
                Controls(pageMode, ::scheduleHide, ::zap, collapse = { controls = false }, channels = { showChannels = true }, servers = { showServers = true })
            }
            if (!controls && pageMode) {
                // Commandes repliées au-dessus d'une page : un bouton pour les rouvrir.
                Row(Modifier.safeDrawingPadding().padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CircleButton(Icons.Filled.Close, "Quitter le lecteur") { model.close() }
                    CircleButton(Icons.Filled.ExpandMore, "Afficher les commandes") { controls = true; scheduleHide() }
                }
            }
        }
    }

    if (showChannels) {
        LiveChannelSheet(onDismiss = { showChannels = false }) { channel ->
            showChannels = false
            model.open(channel)
        }
    }
    if (showServers) {
        LivePlayerServers(onDismiss = { showServers = false; model.askServer = false }) { server, engine ->
            showServers = false
            model.play(server, web = engine)
        }
    }
}

@Composable
private fun Controls(pageMode: Boolean, poke: () -> Unit, zap: (Int) -> Unit, collapse: () -> Unit, channels: () -> Unit, servers: () -> Unit) {
    val model = LivePlayerModel
    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x99000000), Color.Transparent, Color.Transparent, Color(0x99000000)))).safeDrawingPadding().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CircleButton(Icons.Filled.Close, "Quitter le lecteur", size = 48.dp) { model.close() }
            Column(
                Modifier.weight(1f).glass(RoundedCornerShape(22.dp), Color(0x73000000)).padding(horizontal = 14.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    val number = model.channel?.number ?: 0
                    if (number > 0 && LiveStore.country == "fr") Text("$number", color = Theme.teal, fontSize = 12.sp, fontWeight = FontWeight.Black, fontFamily = FontFamily.Monospace)
                    Text(model.channel?.name ?: "", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    Text("EN DIRECT", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Black, modifier = Modifier.background(Color(0xFFEF4444), CircleShape).padding(horizontal = 5.dp, vertical = 2.dp))
                }
                model.current?.let { server ->
                    Text((if (server.vip) "VIP · " else "") + server.label + if (model.engineMode) " · moteur web" else "", color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            if (!pageMode) CircleButton(Icons.Filled.PictureInPictureAlt, "Image dans l’image") { MainActivity.current?.enterPip() }
            if (pageMode) CircleButton(Icons.Filled.ExpandLess, "Replier les commandes") { collapse() }
        }
        Spacer(Modifier.weight(1f))
        if (!pageMode) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(22.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                CircleButton(Icons.Filled.SkipPrevious, "Chaîne précédente", size = 52.dp) { zap(-1) }
                CircleButton(if (model.paused) Icons.Filled.PlayArrow else Icons.Filled.Pause, if (model.paused) "Lecture" else "Pause", size = 68.dp) { model.togglePause(); poke() }
                CircleButton(Icons.Filled.SkipNext, "Chaîne suivante", size = 52.dp) { zap(1) }
            }
            Spacer(Modifier.weight(1f))
        }
        Row(Modifier.fillMaxWidth().widthIn(max = 640.dp).align(Alignment.CenterHorizontally), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            if (pageMode) CircleButton(Icons.Filled.SkipPrevious, "Chaîne précédente") { zap(-1) }
            Pill(Icons.AutoMirrored.Filled.List, "Chaînes", Modifier.weight(1f)) { channels(); poke() }
            Pill(Icons.Filled.Dns, "Serveurs · ${model.servers.size}", Modifier.weight(1f), busy = model.expanding > 0 || model.probing > 0) { servers(); poke() }
            if (pageMode) CircleButton(Icons.Filled.SkipNext, "Chaîne suivante") { zap(1) }
        }
    }
}

/** Bouton rond en verre : toute la pastille réagit au toucher, anneau à la télécommande. */
@Composable
fun CircleButton(icon: ImageVector, label: String, size: Dp = 44.dp, tint: Color = Color.White, action: () -> Unit) {
    Box(
        Modifier.size(size).glass(CircleShape, Color(0x80141420)).focusRing(CircleShape).clickable(onClickLabel = label, onClick = action),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(if (size > 60.dp) 34.dp else if (size > 46.dp) 28.dp else 22.dp))
    }
}

@Composable
private fun Pill(icon: ImageVector, title: String, modifier: Modifier = Modifier, busy: Boolean = false, action: () -> Unit) {
    Row(
        modifier.glass(CircleShape, Color(0x80141420)).focusRing(CircleShape).clickable(onClick = action).padding(vertical = 12.dp, horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
        Text(title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (busy) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
    }
}

// MARK: Chaînes et serveurs depuis le lecteur

/** Chaînes depuis le lecteur : liste d'où la chaîne a été ouverte, puis toutes. */
@Composable
fun LiveChannelSheet(onDismiss: () -> Unit, choose: (LiveChannel) -> Unit) {
    var query by remember { mutableStateOf("") }
    val model = LivePlayerModel
    val term = query.trim()
    val shown = if (term.isEmpty()) model.context else (LiveStore.channels + LiveStore.events).filter { it.name.contains(term, ignoreCase = true) }
    NoctraSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.9f)) {
            Text("Chaînes", style = Theme.display(20), color = Theme.ink, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp))
            SearchField(query, "Toutes les chaînes", Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) { query = it }
            LazyColumn(Modifier.fillMaxWidth()) {
                items(shown) { channel ->
                    val playing = channel.id == model.channel?.id
                    Row(
                        Modifier.fillMaxWidth().focusRing(RoundedCornerShape(12.dp)).clickable { choose(channel) }.padding(horizontal = 20.dp, vertical = 13.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(if (channel.number > 0 && LiveStore.country == "fr") "${channel.number}" else "", color = Theme.teal, fontSize = 12.sp, fontWeight = FontWeight.Black, fontFamily = FontFamily.Monospace, modifier = Modifier.width(30.dp))
                        Text(channel.name, color = Theme.ink, fontSize = 15.sp, fontWeight = if (playing) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (channel.entries.size > 1) Text("${channel.entries.size}", color = Theme.muted, fontSize = 11.sp)
                        if (channel.vip) Icon(Icons.Filled.Star, contentDescription = "VIP", tint = Theme.gold, modifier = Modifier.size(14.dp))
                        if (playing) Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Theme.teal, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

/** Serveurs de la chaîne en cours, par source, avec leur état ; appui long : choisir le moteur (ExoPlayer ou moteur web). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LivePlayerServers(onDismiss: () -> Unit, choose: (LiveServer, Boolean?) -> Unit) {
    val model = LivePlayerModel
    val groups = remember(model.servers) {
        val map = LinkedHashMap<String, MutableList<LiveServer>>()
        for (server in model.servers) map.getOrPut(server.label.split(" · ").firstOrNull() ?: server.provider) { mutableListOf() } += server
        map.entries.map { it.key to it.value.toList() }
    }
    NoctraSheet(onDismiss) {
        LazyColumn(Modifier.fillMaxWidth().fillMaxHeight(0.9f)) {
            item {
                Column(Modifier.padding(horizontal = 20.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(model.channel?.name ?: "Serveurs", style = Theme.display(20), color = Theme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (model.expanding > 0 || model.probing > 0) CircularProgressIndicator(color = Theme.accent, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                        Text(serversSummary(model.servers, model.expanding, model.probing), color = Theme.muted, fontSize = 13.sp)
                    }
                    Row(
                        Modifier.glass(CircleShape).focusRing(CircleShape).clickable(enabled = model.probing == 0) { model.probeAll(force = true) }.padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Filled.NetworkCheck, contentDescription = null, tint = if (model.probing == 0) Theme.accent else Theme.muted, modifier = Modifier.size(18.dp))
                        Text("Tester à nouveau les flux", color = if (model.probing == 0) Theme.ink else Theme.muted, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            for ((name, list) in groups) {
                item {
                    Text(name.uppercase(), color = Theme.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp, modifier = Modifier.padding(start = 20.dp, top = 14.dp, bottom = 4.dp))
                }
                items(list) { server ->
                    var menu by remember { mutableStateOf(false) }
                    Box {
                        ServerRow(
                            server, model.channel?.id ?: "", playing = server.id == model.current?.id,
                            modifier = Modifier.combinedClickable(onClick = { choose(server, null) }, onLongClick = { if (server.kind == LiveServer.Kind.native) menu = true })
                        )
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, modifier = Modifier.background(Color(0xFF151932))) {
                            if (!server.mpegts) DropdownMenuItem(text = { Text("Lecteur natif") }, leadingIcon = { Icon(Icons.Filled.PlayCircle, null, tint = Theme.accent) }, onClick = { menu = false; choose(server, false) })
                            DropdownMenuItem(text = { Text("Moteur web") }, leadingIcon = { Icon(Icons.Filled.Language, null, tint = Theme.accent) }, onClick = { menu = false; choose(server, true) })
                        }
                    }
                    HorizontalDivider(color = Theme.line, modifier = Modifier.padding(start = 54.dp))
                }
            }
        }
    }
}

fun serversSummary(servers: List<LiveServer>, expanding: Int, probing: Int): String {
    val online = servers.count { it.probe == LiveServer.Probe.up || it.probe == LiveServer.Probe.slow }
    val parts = mutableListOf("${servers.size} serveur${if (servers.size > 1) "s" else ""}")
    if (online > 0) parts += "$online en ligne au test"
    if (expanding > 0) parts += "$expanding source${if (expanding > 1) "s" else ""} encore interrogée${if (expanding > 1) "s" else ""} (VIP compris)"
    else if (probing > 0) parts += "tests en cours"
    return parts.joinToString(" · ") + ". Appui long : choisir le lecteur."
}

/** Ligne d'un serveur : type, état du test, fiabilité mémorisée. */
@Composable
fun ServerRow(server: LiveServer, channel: String, playing: Boolean, modifier: Modifier = Modifier, best: Boolean = false) {
    Row(
        modifier.fillMaxWidth().focusRing(RoundedCornerShape(12.dp)).padding(horizontal = 20.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        val icon = when {
            playing -> Icons.Filled.PlayCircle
            server.kind == LiveServer.Kind.web -> Icons.Filled.Public
            server.kind == LiveServer.Kind.resolve -> Icons.Filled.AutoFixHigh
            else -> Icons.Filled.SettingsInputAntenna
        }
        Icon(icon, contentDescription = null, tint = if (playing || best) Theme.teal else Theme.muted, modifier = Modifier.size(22.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                val rest = server.label.split(" · ").drop(1).joinToString(" · ")
                Text(rest.ifEmpty { server.label }, color = Theme.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (server.vip) VipBadge()
                if (best) Text("Meilleur", color = Theme.onAccent, fontSize = 10.sp, fontWeight = FontWeight.Black, modifier = Modifier.background(Theme.teal, CircleShape).padding(horizontal = 6.dp, vertical = 2.dp))
            }
            Text(serverDetail(server, channel), color = Theme.muted, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
        if (server.probe == LiveServer.Probe.testing) CircularProgressIndicator(color = Theme.muted, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
        Text(probeText(server), color = probeColor(server), fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.End)
    }
}

@Composable
fun VipBadge() {
    Text(
        "VIP", color = Color.Black, fontSize = 10.sp, fontWeight = FontWeight.Black,
        modifier = Modifier.background(Brush.horizontalGradient(listOf(Theme.gold, Color(0xFFF59E0B))), CircleShape).padding(horizontal = 6.dp, vertical = 2.dp)
    )
}

fun serverDetail(server: LiveServer, channel: String): String {
    val parts = mutableListOf<String>()
    parts += when (server.kind) {
        LiveServer.Kind.native -> if (server.mpegts) "MPEG-TS" else if (LiveHealth.prefersWeb(server) || server.webEngine) "HLS · moteur web" else "HLS"
        LiveServer.Kind.resolve -> if (server.vip) "Accès VIP à préparer" else "Serveurs à demander"
        LiveServer.Kind.web -> if (server.manualOnly) "Lecteur du site · secours manuel" else "Lecteur du site"
    }
    server.probeNote?.let { parts += it }
    if (server.probeMs > 0 && (server.probe == LiveServer.Probe.up || server.probe == LiveServer.Probe.slow)) parts += "${server.probeMs.toInt()} ms"
    server.probedAt?.let { at ->
        val age = (System.currentTimeMillis() - at) / 1000
        if (age > 60) parts += "testé il y a ${age / 60} min"
    }
    parts += LiveHealth.text(server, channel)
    return parts.joinToString(" · ")
}

fun probeText(server: LiveServer): String = when (server.probe) {
    LiveServer.Probe.up -> "En ligne"
    LiveServer.Probe.slow -> "Lent"
    LiveServer.Probe.late -> "Lent à\nrépondre"
    LiveServer.Probe.down -> "Hors ligne"
    LiveServer.Probe.noVideo -> "Pas de vidéo"
    LiveServer.Probe.stale -> "Figé"
    LiveServer.Probe.testing -> "Test…"
    LiveServer.Probe.untested -> when (server.kind) { LiveServer.Kind.web -> "Site"; LiveServer.Kind.resolve -> "À préparer"; else -> "" }
}

fun probeColor(server: LiveServer): Color = when (server.probe) {
    LiveServer.Probe.up -> Theme.teal
    LiveServer.Probe.slow, LiveServer.Probe.stale, LiveServer.Probe.late -> Theme.orange
    LiveServer.Probe.down, LiveServer.Probe.noVideo -> Theme.red
    else -> Theme.muted
}

// MARK: Lecteur web

/**
 * Lecteur web : moteur de l'appli (hls.js, mpegts.js servis par Noctra) ou
 * page d'un site. Vidéo lancée, flux repéré et erreurs remontent au lecteur TV
 * (serveur suivant, mémoire du moteur). Fenêtres publicitaires et redirections
 * vers un autre site bloquées.
 */
@SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
@Composable
fun LiveWebView(request: WebPlayerRequest, modifier: Modifier = Modifier) {
    var fullscreen by remember { mutableStateOf<View?>(null) }
    AndroidView(
        factory = { context ->
            val view = WebView(context)
            val main = Handler(Looper.getMainLooper())
            val allowed = mutableSetOf<String>()
            var loaded = false
            fun host(url: String?): String = url?.toHttpUrlOrNull()?.host?.lowercase()?.removePrefix("www.") ?: ""
            fun report(state: String, message: String, url: String) {
                main.post { LivePlayerModel.webEvent(request.id, state, message, url) }
            }
            view.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            view.setBackgroundColor(AndroidColor.BLACK)
            view.keepScreenOn = true
            view.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(true)
                loadWithOverviewMode = true
                useWideViewPort = true
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                // Navigateur mobile ordinaire (certains lecteurs refusent les vues web).
                userAgentString = userAgentString.replace("; wv", "").replace(Regex("Version/\\d+\\.\\d+ "), "")
            }
            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setAcceptThirdPartyCookies(view, true)
                // Session Noctra (cookies de l'appli) partagée avec les pages.
                for (cookie in Net.cookies.all()) setCookie((if (cookie.secure) "https://" else "http://") + cookie.domain + cookie.path, cookie.toString())
                flush()
            }
            // Messages des lecteurs (tous les cadres) : vidéo lancée, états des ponts Noctra.
            view.addJavascriptInterface(object {
                @JavascriptInterface
                fun post(body: String) {
                    val json = Json.parseMap(body) ?: return
                    report(json.str("state") ?: "", json.str("message") ?: "", json.str("url") ?: "")
                }
            }, "NoctraAndroid")
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                runCatching { WebViewCompat.addDocumentStartJavaScript(view, bridgeScript, setOf("*")) }
            }
            view.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, navigation: WebResourceRequest): Boolean {
                    // Cadres du lecteur : libres. Page principale : même site, ou redirection pendant le premier chargement.
                    if (!navigation.isForMainFrame) return false
                    val target = navigation.url.toString()
                    val scheme = navigation.url.scheme?.lowercase() ?: ""
                    if (scheme !in setOf("http", "https", "about", "blob", "data")) return true
                    val destination = host(target)
                    if (destination.isEmpty() || destination in allowed || (!loaded && !navigation.hasGesture())) {
                        if (destination.isNotEmpty()) allowed += destination
                        return false
                    }
                    return true
                }

                override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                    // Sans script de début de document : pont ajouté au plus tôt (page principale).
                    if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) view.evaluateJavascript(bridgeScript, null)
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) view.evaluateJavascript(bridgeScript, null)
                    if (url != null && url != "about:blank") loaded = true
                }

                override fun onReceivedError(view: WebView, navigation: WebResourceRequest, error: WebResourceError) {
                    // Seul l'échec du premier chargement compte.
                    if (!navigation.isForMainFrame || loaded) return
                    report("error", "page du lecteur injoignable (${error.description}).", "")
                }
            }
            view.webChromeClient = object : WebChromeClient() {
                /** window.open et liens « nouvelle fenêtre » : publicités, jamais ouvertes. */
                override fun onCreateWindow(view: WebView?, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message?): Boolean = false

                override fun onPermissionRequest(permission: PermissionRequest) {
                    val media = permission.resources.filter { it == PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID }
                    if (media.isEmpty()) permission.deny() else permission.grant(media.toTypedArray())
                }

                override fun onShowCustomView(custom: View, callback: CustomViewCallback) { fullscreen = custom }
                override fun onHideCustomView() { fullscreen = null }
            }
            LivePlayerModel.webView = view
            val base = Session.noctraBase + "/"
            host(base).takeIf { it.isNotEmpty() }?.let { allowed += it }
            val local = Session.isNoctraOrigin(request.url)
            val token = if (local) Session.token ?: "" else ""
            when (request.mode) {
                WebPlayerRequest.Mode.page -> {
                    host(request.url).takeIf { it.isNotEmpty() }?.let { allowed += it }
                    if (local && framedBridge(request.url)) {
                        // Pont VIP LiveWatch / OHA du serveur : dans un cadre isolé, exactement comme sur PC.
                        view.loadDataWithBaseURL(base, framePage(request.url), "text/html", "utf-8", null)
                    } else view.loadUrl(request.url)
                }
                WebPlayerRequest.Mode.mpegts -> view.loadDataWithBaseURL(base, enginePage(request.url, true, token), "text/html", "utf-8", null)
                WebPlayerRequest.Mode.hls -> view.loadDataWithBaseURL(base, enginePage(request.url, false, token), "text/html", "utf-8", null)
            }
            view
        },
        onRelease = { view ->
            if (LivePlayerModel.webView === view) LivePlayerModel.webView = null
            view.stopLoading()
            view.loadUrl("about:blank")
            view.destroy()
        },
        modifier = modifier
    )
    // Plein écran demandé par la page : vue du lecteur au-dessus de tout.
    fullscreen?.let { custom ->
        val activity = androidx.compose.ui.platform.LocalContext.current.findActivity()
        DisposableEffect(custom) {
            val decor = activity?.window?.decorView as? FrameLayout
            (custom.parent as? ViewGroup)?.removeView(custom)
            decor?.addView(custom, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            onDispose { decor?.removeView(custom) }
        }
    }
}

/** Relais vers l'appli : vidéo lancée (y compris dans les cadres des sites) et messages « noctra-…-state » des ponts du serveur. */
private val bridgeScript = """
(function(){if(window.__noctraBridge)return;window.__noctraBridge=1;
function send(o){try{if(window.NoctraAndroid)window.NoctraAndroid.post(JSON.stringify(o))}catch(e){}}
addEventListener('message',function(e){var d=e.data;if(!d||typeof d!=='object')return;var t=String(d.type||'');
if(!/^noctra-[a-z0-9]+-state${'$'}/.test(t))return;send({state:String(d.state||''),message:String(d.message||''),url:String(d.url||'')})},true);
document.addEventListener('playing',function(e){var t=e.target;if(t&&t.tagName==='VIDEO')send({state:'playing'})},true);
})();
"""

/** Pages du serveur Noctra conçues pour un cadre isolé (sans même origine). */
private fun framedBridge(url: String): Boolean {
    val path = url.toHttpUrlOrNull()?.encodedPath ?: return false
    return path.contains("/api/tv/livewatch/vip/") || path.contains("/api/tv/livewatch/embed/") || path.contains("/api/tv/oha/embed/")
}

private fun escaped(value: String) = value.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;")

private fun literal(value: String) = value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "")

/** Cadre du lecteur, réglé comme sur PC : scripts, formulaires et plein écran permis, sans même origine. */
private fun framePage(url: String) = """
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#000}</style></head>
<body><iframe src="${escaped(url)}" sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
referrerpolicy="strict-origin-when-cross-origin" allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *" allowfullscreen></iframe>
<script>$bridgeScript</script></body></html>
"""

private const val tsScript = """
if(!window.mpegts||!mpegts.isSupported()){send('error','flux MPEG-TS non pris en charge ici');return}
var p=mpegts.createPlayer({type:'mpegts',isLive:true,url:U},{enableWorker:false,lazyLoad:false,liveBufferLatencyChasing:false,enableStashBuffer:true,headers:K&&same(U)?{'x-noctra-token':K}:undefined});
p.attachMediaElement(v);p.load();start();
p.on(mpegts.Events.ERROR,function(a,b){send('error','flux MPEG-TS interrompu ('+a+(b?' · '+b:'')+')')});
"""

private const val hlsScript = """
if(window.Hls&&Hls.isSupported()){
var h=new Hls({lowLatencyMode:false,liveSyncDurationCount:3,maxBufferLength:30,backBufferLength:30,
manifestLoadingTimeOut:20000,manifestLoadingMaxRetry:3,levelLoadingTimeOut:20000,levelLoadingMaxRetry:4,fragLoadingTimeOut:30000,fragLoadingMaxRetry:4,
xhrSetup:function(x,u){if(K&&same(u))x.setRequestHeader('x-noctra-token',K)}});
var net=0,media=0;
h.on(Hls.Events.ERROR,function(e,d){if(!d||!d.fatal)return;
if(d.type===Hls.ErrorTypes.NETWORK_ERROR&&net++<2){h.startLoad();return}
if(d.type===Hls.ErrorTypes.MEDIA_ERROR&&media++<2){h.recoverMediaError();return}
send('error','moteur web : '+d.details+(d.response&&d.response.code?' ('+d.response.code+')':''))});
h.on(Hls.Events.MANIFEST_PARSED,start);
h.loadSource(U);h.attachMedia(v);
}else{v.src=U;start();v.addEventListener('error',function(){send('error','vidéo illisible')})}
"""

/** Moteur web : mpegts.js (flux MPEG-TS continu) ou hls.js (liste HLS), servis par Noctra ; jeton Noctra joint aux requêtes vers Noctra seulement. */
private fun enginePage(url: String, transport: Boolean, token: String): String {
    val library = if (transport) "mpegts.js" else "hls.min.js"
    val script = if (transport) tsScript else hlsScript
    return """
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{position:fixed;inset:0;width:100%;height:100%;background:#000;object-fit:contain}</style></head>
<body><video id="v" playsinline webkit-playsinline autoplay></video>
<script src="vendor/$library"></script>
<script>
(function(){
var v=document.getElementById('v'),U='${literal(url)}',K='${literal(token)}',playing=false,waitSince=0;
function send(s,m){try{window.NoctraAndroid.post(JSON.stringify({state:s,message:m||''}))}catch(e){}}
function same(u){try{return new URL(u,location.href).origin===location.origin}catch(e){return false}}
function start(){var p=v.play();if(p&&p.catch)p.catch(function(){v.muted=true;var q=v.play();if(q&&q.catch)q.catch(function(){})})}
try{v.disableRemotePlayback=true}catch(e){}
v.addEventListener('playing',function(){playing=true;waitSince=0;send('playing')});
v.addEventListener('waiting',function(){waitSince=Date.now()});
v.addEventListener('timeupdate',function(){if(!v.paused)waitSince=0});
setInterval(function(){if(playing&&waitSince&&Date.now()-waitSince>15000){waitSince=0;send('stalled','coupure prolongée.')}},2000);
$script
})();
</script></body></html>
"""
}
