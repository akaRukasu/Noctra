package com.noctra.mobile.play

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.util.Rational
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PictureInPictureAlt
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.noctra.mobile.MainActivity
import com.noctra.mobile.Pip
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import kotlinx.coroutines.delay

fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return null
}

/** Plein écran pendant la lecture : barres du système masquées, écran allumé. */
@Composable
fun ImmersiveEffect() {
    val view = LocalView.current
    DisposableEffect(Unit) {
        val activity = view.context.findActivity()
        val window = activity?.window
        if (window != null) {
            val controller = WindowCompat.getInsetsController(window, view)
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        onDispose {
            if (window != null) {
                WindowCompat.getInsetsController(window, view).show(WindowInsetsCompat.Type.systemBars())
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }
}

/** Sous-titres de l'appli, au-dessus de la vidéo (taille choisie dans le compte). */
@Composable
fun SubtitleLayer(text: String, status: String?, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().safeDrawingPadding()) {
        if (status != null) Text(status, color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.align(Alignment.TopCenter).padding(top = 58.dp))
        if (text.isNotEmpty()) {
            Text(
                text, color = Color.White, fontSize = SubtitleSize.current.sp.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                style = TextStyle(shadow = Shadow(Color.Black, blurRadius = 6f)),
                modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 28.dp, vertical = 64.dp).background(Color.Black.copy(alpha = 0.35f)).padding(horizontal = 8.dp, vertical = 2.dp)
            )
        }
    }
}

/** Lecteur plein écran des films, épisodes et téléchargements (commandes de Media3). */
@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen() {
    val exo = PlaybackManager.player ?: return
    var controls by remember { mutableStateOf(true) }
    var subtitleMenu by remember { mutableStateOf(false) }
    // Générique en cours (bouton « Passer… »), relu à chaque image de sous-titres.
    var marker by remember { mutableStateOf<MediaMarker?>(null) }
    // Boutons ±15 s de Media3 : jamais au-delà de la dernière seconde du titre.
    val bounded = remember(exo) { BoundedSeekPlayer(exo) }
    ImmersiveEffect()
    BackHandler { PlaybackManager.close() }
    LaunchedEffect(exo) {
        while (true) {
            PlaybackManager.refreshSubtitle()
            val active = PlaybackManager.activeMarker(exo.currentPosition)
            if (active != marker) marker = active
            val size = exo.videoSize
            if (size.width > 0 && size.height > 0) Pip.aspect = Rational(size.width, size.height).coerceAspect()
            delay(120)
        }
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { context ->
                PlayerView(context).apply {
                    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    player = bounded
                    keepScreenOn = true
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    setShowSubtitleButton(false)
                    setShowNextButton(false)
                    setShowPreviousButton(false)
                    controllerShowTimeoutMs = 4000
                    setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility -> controls = visibility == android.view.View.VISIBLE })
                    requestFocus()
                }
            },
            update = { view ->
                if (view.player !== bounded) view.player = bounded
                view.useController = !Pip.active
                view.controllerShowTimeoutMs = if (subtitleMenu) 0 else 4000
                if (subtitleMenu) view.showController()
            },
            modifier = Modifier.fillMaxSize()
        )
        SubtitleLayer(PlaybackManager.subtitleText, PlaybackManager.subtitleStatus)
        // Retour des sauts de 15 s, cumulé sur les appuis répétés.
        PlaybackManager.seekNote?.takeIf { !Pip.active }?.let { note ->
            Text(note, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.Center).padding(bottom = 140.dp).background(Color(0xCC09090F), RoundedCornerShape(14.dp)).padding(horizontal = 18.dp, vertical = 10.dp))
        }
        // « Passer le générique (de fin) » et « Épisode suivant » (distincts, jamais automatiques).
        val current = marker
        val next = PlaybackManager.nextEpisode
        val showNext = next != null && !PlaybackManager.syncMode && (current?.type == MediaMarker.Type.outro || controls)
        if (!Pip.active && (current != null || showNext)) {
            Row(
                Modifier.align(Alignment.BottomEnd).safeDrawingPadding().padding(end = 20.dp, bottom = if (controls) 120.dp else 36.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (current != null) PlayerPill(current.label, primary = true) { PlaybackManager.skip(current) }
                if (showNext && next != null) PlayerPill("Épisode suivant", primary = current == null, description = "Épisode suivant : " + listOfNotNull(next.episodeLabel, next.name).joinToString(" · ")) { PlaybackManager.playNext() }
            }
        }
        AnimatedVisibility((controls || subtitleMenu) && !Pip.active, enter = fadeIn(), exit = fadeOut(), modifier = Modifier.align(Alignment.TopCenter)) {
            Column(Modifier.fillMaxWidth().safeDrawingPadding().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.75f), Color.Transparent))).padding(horizontal = 16.dp, vertical = 10.dp)) {
              Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                IconButton(onClick = { PlaybackManager.close() }, modifier = Modifier.size(46.dp).glass(CircleShape, Color(0x99000000)).focusRing(CircleShape)) {
                    Icon(Icons.Filled.Close, contentDescription = "Fermer", tint = Color.White)
                }
                androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                val hasTracks = PlaybackManager.audioTracks.size > 1 || PlaybackManager.subtitles.isNotEmpty() || PlaybackManager.burnedSubtitles.isNotEmpty()
                if (PlaybackManager.switching) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
                if (hasTracks) {
                    Box {
                        IconButton(onClick = { subtitleMenu = true }, modifier = Modifier.size(46.dp).glass(CircleShape, Color(0x99000000)).focusRing(CircleShape)) {
                            Icon(Icons.Filled.Subtitles, contentDescription = "Langue audio et sous-titres", tint = if (PlaybackManager.subtitleIndex >= 0) Theme.accent else Color.White)
                        }
                        DropdownMenu(expanded = subtitleMenu, onDismissRequest = { subtitleMenu = false }, modifier = Modifier.background(Color(0xFF151932))) {
                            if (PlaybackManager.audioTracks.size > 1) {
                                Text("LANGUE AUDIO", color = Theme.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
                                PlaybackManager.audioTracks.forEach { (index, label) ->
                                    DropdownMenuItem(text = { Text((if (index == PlaybackManager.audioIndex) "✓ " else "") + label, color = Theme.ink) }, onClick = {
                                        subtitleMenu = false
                                        if (index != PlaybackManager.audioIndex) PlaybackManager.switchStream(index, PlaybackManager.subtitleIndex)
                                    })
                                }
                                HorizontalDivider(color = Theme.line)
                            }
                            Text("SOUS-TITRES", color = Theme.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
                            DropdownMenuItem(text = { Text((if (PlaybackManager.subtitleIndex < 0) "✓ " else "") + "Aucun", color = Theme.ink) }, onClick = { subtitleMenu = false; PlaybackManager.chooseSubtitle(-1) })
                            (PlaybackManager.subtitles.map { it.index to it.label } + PlaybackManager.burnedSubtitles).forEach { (index, label) ->
                                DropdownMenuItem(text = { Text((if (index == PlaybackManager.subtitleIndex) "✓ " else "") + label, color = Theme.ink) }, onClick = { subtitleMenu = false; PlaybackManager.chooseSubtitle(index) })
                            }
                        }
                    }
                }
                IconButton(onClick = { MainActivity.current?.enterPip() }, modifier = Modifier.size(46.dp).glass(CircleShape, Color(0x99000000)).focusRing(CircleShape)) {
                    Icon(Icons.Filled.PictureInPictureAlt, contentDescription = "Image dans l’image", tint = Color.White)
                }
              }
              Text(PlaybackManager.title, color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 10.dp, start = 4.dp, end = 4.dp))
            }
        }
    }
}

/** Bouton du lecteur au-dessus de la vidéo (blanc : principal ou sélectionné à la télécommande). */
@Composable
private fun PlayerPill(label: String, primary: Boolean, description: String = label, action: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val filled = primary || focused
    Text(
        label, color = if (filled) Color(0xFF0B0D12) else Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier
            .background(if (filled) Color(0xF2F5F7FA) else Color(0xB309090F), RoundedCornerShape(50))
            .border(2.dp, Color(0xD9F5F7FA), RoundedCornerShape(50))
            .clickable(interactionSource = interaction, indication = null, onClickLabel = description, onClick = action)
            .padding(horizontal = 20.dp, vertical = 12.dp)
    )
}

/** ±15 s bornés : l'avance s'arrête une seconde avant la fin (pas de fermeture du titre). */
@OptIn(UnstableApi::class)
private class BoundedSeekPlayer(player: Player) : ForwardingPlayer(player) {
    override fun seekForward() {
        val length = duration
        if (isCurrentMediaItemDynamic || length == C.TIME_UNSET || length <= 0) { super.seekForward(); return }
        seekTo(minOf(currentPosition + seekForwardIncrement, maxOf(length - 1000, currentPosition)))
    }
}

/** Rapport accepté par l'image dans l'image (entre 1:2,39 et 2,39:1). */
fun Rational.coerceAspect(): Rational {
    val value = numerator.toDouble() / denominator
    return when {
        value > 2.39 -> Rational(239, 100)
        value < 1 / 2.39 -> Rational(100, 239)
        else -> this
    }
}
