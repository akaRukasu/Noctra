package com.noctra.mobile.cast

import android.content.Intent
import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.filled.CastConnected
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Forward30
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.ScreenShare
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.Fields
import com.noctra.mobile.core.Json
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.clock
import com.noctra.mobile.core.str
import com.noctra.mobile.ui.AuroraSecondaryButton
import com.noctra.mobile.ui.BusyRow
import com.noctra.mobile.ui.SearchField
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.RemoteImage
import com.noctra.mobile.ui.SettingGroup
import com.noctra.mobile.ui.SettingRow
import com.noctra.mobile.ui.SheetColumn
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.auroraCard
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Appareil Jellyfin pilotable (Noctra TV, navigateur, autre téléphone…). */
data class CastTarget(val id: String, val name: String, val client: String, val playing: String?)

/** Bouton de diffusion de la barre du haut (tous les onglets) : télécommande du Chromecast en cours, ou envoi du titre à reprendre. */
@Composable
fun CastButton() {
    var showing by remember { mutableStateOf(false) }
    val active = ChromecastController.isActive || RemotePlayback.active != null
    Box(Modifier.size(40.dp).glass(CircleShape).focusRing(CircleShape).clickable(onClickLabel = "Diffuser sur un autre écran") { showing = true }, contentAlignment = Alignment.Center) {
        Icon(if (active) Icons.Filled.CastConnected else Icons.Filled.Cast, contentDescription = "Diffuser sur un autre écran", tint = if (active) Theme.accent else Color.White, modifier = Modifier.size(20.dp))
    }
    if (showing) CastHubSheet { showing = false }
}

/** Diffusion depuis la barre du haut : télécommande, sinon dernier titre commencé à envoyer. */
@Composable
fun CastHubSheet(onDismiss: () -> Unit) {
    if (!ChromecastController.isActive && RemotePlayback.active != null) {
        NoctraSheet(onDismiss) { RemotePanel() }
        return
    }
    if (!ChromecastController.isActive && RemotePlayback.devices.any { it.title.isNotEmpty() }) {
        NoctraSheet(onDismiss) { SheetColumn("Vos écrans") { RemoteDevicesSection() } }
        return
    }
    var resume by remember { mutableStateOf<BaseItem?>(null) }
    var loading by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        if (!ChromecastController.isActive) {
            resume = runCatching {
                Session.items(listOf("/UserItems/Resume", "/Users/{userId}/Items/Resume"), mapOf(
                    "userId" to Session.userId, "limit" to "1", "mediaTypes" to "Video", "fields" to Fields.card, "enableImageTypes" to "Primary,Backdrop,Thumb"
                )).firstOrNull()
            }.getOrNull()
        }
        loading = false
    }
    NoctraSheet(onDismiss) {
        val item = resume
        when {
            ChromecastController.isActive -> ChromecastRemoteContent(onDismiss)
            item != null -> CastContent(item, item.resumeSeconds, null, null, showItem = true, onDismiss = onDismiss)
            else -> SheetColumn("Diffuser") {
                RemoteDevicesSection()
                SettingGroup {
                    if (loading) SettingRow("Recherche du titre en cours…", trailing = { CircularProgressIndicator(color = Theme.accent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp)) })
                    else SettingRow("Ouvrez un film ou un épisode, puis touchez son bouton de diffusion pour le lire sur un autre écran.", icon = Icons.Filled.TouchApp)
                }
                ScreenMirroring()
                DisposableEffect(Unit) { ChromecastBrowser.start(); onDispose { ChromecastBrowser.stop() } }
                SettingGroup("Chromecast et Google TV du Wi-Fi") {
                    if (ChromecastBrowser.devices.isEmpty()) SettingRow(if (ChromecastBrowser.blocked) "Recherche impossible sur ce réseau." else "Recherche…")
                    ChromecastBrowser.devices.forEach { SettingRow(it.name, icon = Icons.Filled.Tv, value = it.model) }
                }
            }
        }
    }
}

/** « Lire sur… » : Chromecast et Google TV, ou un autre appareil connecté au même compte (Noctra TV, navigateur, autre téléphone). */
@Composable
fun CastSheet(item: BaseItem, startSeconds: Double, audioIndex: Int? = null, subtitleIndex: Int? = null, showItem: Boolean = false, onDismiss: () -> Unit) {
    NoctraSheet(onDismiss) { CastContent(item, startSeconds, audioIndex, subtitleIndex, showItem, onDismiss) }
}

@Composable
private fun CastContent(item: BaseItem, startSeconds: Double, audioIndex: Int?, subtitleIndex: Int?, showItem: Boolean, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var targets by remember { mutableStateOf<List<CastTarget>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var castingTo by remember { mutableStateOf<String?>(null) }
    var sent by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    DisposableEffect(Unit) { ChromecastBrowser.start(); onDispose { ChromecastBrowser.stop() } }
    LaunchedEffect(Unit) {
        val list = runCatching { Json.parse(Session.data("GET", "/Sessions", mapOf("controllableByUserId" to Session.userId, "activeWithinSeconds" to "960"))) }.getOrNull().asMaps()
        targets = list.mapNotNull { entry ->
            val id = entry.str("Id") ?: return@mapNotNull null
            if (entry.str("DeviceId") == Session.deviceId) return@mapNotNull null
            // Administrateur : jamais les appareils d'un autre compte.
            if (!Session.sameUser(entry.str("UserId"), Session.userId)) return@mapNotNull null
            val remote = (entry["SupportsRemoteControl"] as? Boolean) ?: (entry["Capabilities"].asMap()?.get("SupportsMediaControl") as? Boolean) ?: false
            if (!remote) return@mapNotNull null
            CastTarget(id, entry.str("DeviceName") ?: "Appareil", entry.str("Client") ?: "", entry["NowPlayingItem"].asMap()?.str("Name"))
        }
        loading = false
    }
    SheetColumn("Lire sur…") {
        if (showItem) {
            SettingGroup("À envoyer", "Autre titre : ouvrez sa fiche, puis touchez le bouton de diffusion.") {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    RemoteImage(Session.thumb(item, 400) ?: Session.poster(item), Modifier.size(84.dp, 48.dp).clip(RoundedCornerShape(10.dp)))
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(if (item.type == "Episode") item.seriesName ?: item.title else item.title, color = Theme.ink, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            if (startSeconds > 30) "Reprise à ${clock(startSeconds)}" + if (item.type == "Episode") " · " + (item.episodeLabel ?: "") else "" else "Depuis le début",
                            color = Theme.muted, fontSize = 12.sp, maxLines = 1
                        )
                    }
                }
            }
        }
        SettingGroup("Chromecast et Google TV", "Chromecast, Google TV, Android TV et téléviseurs « Chromecast intégré » sur le même Wi-Fi.") {
            if (ChromecastBrowser.devices.isEmpty()) {
                SettingRow(if (ChromecastBrowser.blocked) "Recherche impossible sur ce réseau." else "Recherche sur le Wi-Fi…", trailing = {
                    if (!ChromecastBrowser.blocked) CircularProgressIndicator(color = Theme.accent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                })
            }
            ChromecastBrowser.devices.forEach { device ->
                SettingRow(device.name, value = device.model, icon = Icons.Filled.Tv, onClick = if (castingTo != null) null else ({
                    castingTo = device.id
                    scope.launch {
                        try {
                            ChromecastController.cast(item, startSeconds, audioIndex, subtitleIndex, device)
                            sent = device.id
                            delay(600)
                            onDismiss()
                        } catch (failure: Exception) {
                            error = failure.message
                        } finally {
                            castingTo = null
                        }
                    }
                }), trailing = {
                    if (castingTo == device.id) CircularProgressIndicator(color = Theme.accent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    else if (sent == device.id || (ChromecastController.device?.id == device.id && castingTo == null)) Icon(Icons.Filled.CastConnected, contentDescription = null, tint = Theme.accent)
                })
            }
        }
        ScreenMirroring()
        RemoteDevicesSection()
        SettingGroup("Appareils Noctra et Jellyfin") {
            if (loading) SettingRow("Recherche…", trailing = { CircularProgressIndicator(color = Theme.accent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp)) })
            if (!loading && targets.isEmpty()) SettingRow("Aucun autre appareil connecté. Ouvrez Noctra TV ou Noctra sur un autre écran.")
            targets.forEach { target ->
                SettingRow(target.name, value = target.playing?.let { "Lecture : $it" } ?: target.client, icon = clientIcon(target.client), onClick = {
                    scope.launch {
                        try {
                            Session.data("POST", "/Sessions/${target.id}/Playing", mapOf("playCommand" to "PlayNow", "itemIds" to item.id, "startPositionTicks" to (startSeconds * 10_000_000).toLong().toString()))
                            RemotePlayback.select(target.id)
                            sent = target.id
                            delay(700)
                            onDismiss()
                        } catch (failure: Exception) {
                            error = failure.message
                        }
                    }
                }, trailing = { if (sent == target.id) Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Theme.accent) })
            }
        }
        error?.let { Text(it, color = Theme.orange, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 22.dp, vertical = 6.dp)) }
    }
}

/** Diffusion d'écran du système (Miracast, téléviseurs compatibles). */
@Composable
private fun ScreenMirroring() {
    val context = LocalContext.current
    SettingGroup(footer = "Téléviseurs compatibles avec la diffusion d’écran d’Android.") {
        SettingRow("Diffuser l’écran", icon = Icons.Filled.ScreenShare, onClick = {
            val intents = listOf(Intent("android.settings.CAST_SETTINGS"), Intent(Settings.ACTION_WIRELESS_SETTINGS))
            for (intent in intents) {
                if (runCatching { context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess) break
            }
        })
    }
}

private fun clientIcon(client: String): ImageVector {
    val name = client.lowercase()
    return when {
        name.contains("tv") || name.contains("android") -> Icons.Filled.Tv
        name.contains("web") || name.contains("chrome") || name.contains("edge") -> Icons.Filled.Computer
        else -> Icons.Filled.PhoneAndroid
    }
}

// MARK: Mini-lecteur et télécommande

/** Lecture en cours sur un Chromecast : capsule au-dessus des onglets. */
@Composable
fun ChromecastMiniPlayer() {
    var showRemote by remember { mutableStateOf(false) }
    val cast = ChromecastController
    AnimatedVisibility(cast.isActive, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
        Row(
            Modifier.padding(horizontal = 16.dp).widthIn(max = 520.dp).fillMaxWidth().glass(CircleShape, Color(0xE00E0E20)).border(1.dp, Theme.lilac.copy(alpha = 0.45f), CircleShape)
                .focusRing(CircleShape).clickable { showRemote = true }.padding(start = 8.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            RemoteImage(cast.artwork, Modifier.size(54.dp, 34.dp).clip(RoundedCornerShape(8.dp)))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(cast.title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (cast.connecting) "Connexion à ${cast.device?.name ?: ""}…" else cast.device?.name ?: "", color = Theme.muted, fontSize = 11.sp, maxLines = 1)
            }
            Box(Modifier.size(40.dp).clip(CircleShape).focusRing(CircleShape).clickable { cast.togglePlay() }, contentAlignment = Alignment.Center) {
                Icon(if (cast.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = if (cast.isPlaying) "Pause" else "Lecture", tint = Color.White)
            }
        }
    }
    if (showRemote) NoctraSheet({ showRemote = false }) { ChromecastRemoteContent { showRemote = false } }
}

/**
 * Télécommande du Chromecast : avance, recul, volume, arrêt ; pour une chaîne de TV, zapping,
 * liste des chaînes, serveur suivant et retour sur le téléphone.
 */
@Composable
private fun ChromecastRemoteContent(onDismiss: () -> Unit) {
    val cast = ChromecastController
    var scrub by remember { mutableStateOf<Float?>(null) }
    var choosingChannel by remember { mutableStateOf(false) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(1000); now = System.currentTimeMillis() } }
    val current = scrub?.toDouble() ?: cast.currentPosition(now)
    SheetColumn(cast.device?.name ?: "Chromecast") {
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
            RemoteImage(cast.artwork, Modifier.fillMaxWidth().aspectRatio(16f / 9f).auroraCard(22.dp))
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(cast.title, style = Theme.display(22), color = Theme.ink, textAlign = TextAlign.Center)
                if (cast.subtitle.isNotEmpty()) Text(cast.subtitle, color = Theme.muted, fontSize = 14.sp)
                if (cast.live != null) cast.liveServer?.let { Text("Serveur : $it", color = Theme.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
            if (cast.duration > 0) {
                Column {
                    Slider(
                        value = current.toFloat().coerceIn(0f, cast.duration.toFloat()), valueRange = 0f..maxOf(cast.duration.toFloat(), 1f),
                        onValueChange = { scrub = it }, onValueChangeFinished = { scrub?.let { cast.seek(it.toDouble()) }; scrub = null },
                        colors = SliderDefaults.colors(thumbColor = Theme.lilac, activeTrackColor = Theme.lilac)
                    )
                    Row {
                        Text(clock(current), color = Theme.muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                        Spacer(Modifier.weight(1f))
                        Text("-" + clock(maxOf(0.0, cast.duration - current)), color = Theme.muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                    }
                }
            }
            val idle = cast.liveBusy == null
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.CenterVertically) {
                if (cast.live != null) RemoteControl(Icons.Filled.SkipPrevious, "Chaîne précédente") { if (idle) cast.zapLive(-1) }
                if (cast.duration > 0) RemoteControl(Icons.Filled.Replay10, "Reculer de 10 s") { cast.skip(-10.0) }
                RemoteControl(if (cast.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (cast.isPlaying) "Pause" else "Lecture", large = true) { cast.togglePlay() }
                if (cast.duration > 0) RemoteControl(Icons.Filled.Forward30, "Avancer de 30 s") { cast.skip(30.0) }
                if (cast.live != null) RemoteControl(Icons.Filled.SkipNext, "Chaîne suivante") { if (idle) cast.zapLive(1) }
            }
            if (cast.live != null) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LiveAction("Chaînes", Icons.AutoMirrored.Filled.List, Modifier.weight(1f)) { if (idle) choosingChannel = true }
                    LiveAction("Serveur suivant", Icons.Filled.Autorenew, Modifier.weight(1f)) { if (idle) cast.nextLiveServer() }
                    LiveAction("Sur le téléphone", Icons.Filled.PhoneAndroid, Modifier.weight(1f)) { cast.liveBackToPhone(); onDismiss() }
                }
                cast.liveBusy?.let { BusyRow(it) }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(40.dp).clip(CircleShape).focusRing(CircleShape).clickable { cast.toggleMute() }, contentAlignment = Alignment.Center) {
                    Icon(if (cast.muted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp, contentDescription = "Son", tint = Color.White)
                }
                Slider(value = cast.volume.toFloat(), onValueChange = { cast.changeVolume(it.toDouble()) }, valueRange = 0f..1f, modifier = Modifier.weight(1f),
                    colors = SliderDefaults.colors(thumbColor = Theme.lilac, activeTrackColor = Theme.lilac))
            }
            cast.problem?.let { problem ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Filled.Warning, contentDescription = null, tint = Theme.orange, modifier = Modifier.size(18.dp))
                    Text(problem, color = Theme.orange, fontSize = 13.sp)
                }
            }
            AuroraSecondaryButton(onClick = { cast.stop(); onDismiss() }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Stop, contentDescription = null, tint = Theme.red)
                Spacer(Modifier.width(8.dp))
                Text("Arrêter la diffusion", color = Theme.red)
            }
        }
    }
    if (choosingChannel) CastChannelPicker { choosingChannel = false }
}

@Composable
private fun LiveAction(title: String, icon: ImageVector, modifier: Modifier, action: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).glass(RoundedCornerShape(18.dp), Color(0x33FFFFFF)).focusRing(RoundedCornerShape(18.dp)).clickable(onClick = action).padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(icon, contentDescription = null, tint = Color.White)
        Text(title, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Chaîne à envoyer au Chromecast : la liste d'où la chaîne a été ouverte, puis toutes à la recherche. */
@Composable
private fun CastChannelPicker(onDismiss: () -> Unit) {
    val cast = ChromecastController
    var query by remember { mutableStateOf("") }
    val results = remember(query, cast.liveContext) {
        val term = query.trim()
        if (term.isEmpty()) cast.liveContext.ifEmpty { com.noctra.mobile.live.LiveStore.channels }
        else (com.noctra.mobile.live.LiveStore.channels + com.noctra.mobile.live.LiveStore.events).filter { it.name.contains(term, ignoreCase = true) }.take(200)
    }
    NoctraSheet(onDismiss) {
        Column(Modifier.fillMaxWidth()) {
            Text("Chaînes", style = Theme.display(20), color = Theme.ink, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            SearchField(query, "Toutes les chaînes", Modifier.padding(horizontal = 16.dp)) { query = it }
            LazyColumn(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                items(results, key = { it.id }) { channel ->
                    Row(Modifier.fillMaxWidth().clickable { onDismiss(); cast.castOther(channel) }.padding(horizontal = 20.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(channel.name, color = Theme.ink, fontSize = 15.sp, fontWeight = if (channel.id == cast.live?.id) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(1f))
                        if (channel.id == cast.live?.id) Icon(Icons.Filled.Tv, contentDescription = "Diffusée", tint = Theme.teal, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun RemoteControl(icon: ImageVector, label: String, large: Boolean = false, action: () -> Unit) {
    val size = if (large) 78.dp else 58.dp
    Box(
        Modifier.size(size).glass(CircleShape, if (large) Theme.lilac.copy(alpha = 0.45f) else Color(0x991A1D33)).focusRing(CircleShape).clickable(onClickLabel = label, onClick = action),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(if (large) 38.dp else 28.dp))
    }
}
