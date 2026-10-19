package com.noctra.mobile.cast

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.noctra.mobile.core.*
import com.noctra.mobile.live.*
import com.noctra.mobile.ui.*
import kotlinx.coroutines.*

data class RemoteDevice(val id: String, val name: String, val title: String, val paused: Boolean,
    val position: Double, val duration: Double, val live: Boolean, val custom: Boolean, val volume: Int?)

/** Les états Jellyfin et Noctra TV restent liés à la session choisie, sans lancer de lecture. */
object RemotePlayback {
    var devices by mutableStateOf<List<RemoteDevice>>(emptyList())
        private set
    var selected by mutableStateOf<String?>(null)
        private set
    var problem by mutableStateOf<String?>(null)
    private var polling: Job? = null
    private var ownSession: String? = null
    private val states = mutableMapOf<String, Pair<Long, JsonMap>>()
    val active: RemoteDevice? get() = devices.firstOrNull { it.id == selected }

    fun start() {
        stop()
        polling = Session.scope.launch { while (isActive && Session.isSignedIn) { refresh(); delay(5000) } }
    }
    fun stop() { polling?.cancel(); polling = null; devices = emptyList(); selected = null; ownSession = null; states.clear() }
    fun select(id: String) { selected = id; problem = null }
    fun receive(command: JsonMap): Boolean {
        if (command.str("Name") != "PlayMediaSource") return false
        val args = command["Arguments"].asMap() ?: return true
        if (args.str("NoctraRemoteState") != "1") return false
        val id = args.str("sessionId") ?: return true
        if (devices.none { it.id == id && it.custom }) return true
        val payload = args.str("state")?.let { runCatching { Json.parseMap(it) }.getOrNull() } ?: return true
        states[id] = System.currentTimeMillis() to payload
        devices = devices.map { if (it.id == id) applyState(it, payload) else it }
        if (selected == null && devices.count { it.title.isNotEmpty() } == 1) selected = devices.first { it.title.isNotEmpty() }.id
        return true
    }
    private fun applyState(device: RemoteDevice, state: JsonMap): RemoteDevice {
        // Le lecteur Jellyfin natif continue à être décrit par /Sessions.
        if (!state.flag("live")) return device.copy(live = false)
        return device.copy(title = state.str("title") ?: "TV en direct", live = true, paused = !state.flag("playing"),
            position = state.double("position") ?: 0.0, duration = 0.0, volume = state.int("volume"))
    }
    suspend fun refresh() {
        val list = runCatching { Json.parse(Session.data("GET", "/Sessions", mapOf("controllableByUserId" to Session.userId, "activeWithinSeconds" to "60"))) }.getOrNull()?.asMaps() ?: return
        if (!Session.isSignedIn || !currentCoroutineContext().isActive) return
        ownSession = list.firstOrNull { it.str("DeviceId") == Session.deviceId }?.str("Id")
        devices = list.mapNotNull { raw ->
            val id = raw.str("Id") ?: return@mapNotNull null
            if (raw.str("DeviceId") == Session.deviceId) return@mapNotNull null
            val caps = raw["Capabilities"].asMap().orEmpty()
            if (raw["SupportsRemoteControl"] != true && caps["SupportsMediaControl"] != true) return@mapNotNull null
            val item = raw["NowPlayingItem"].asMap().orEmpty()
            val play = raw["PlayState"].asMap().orEmpty()
            var device = RemoteDevice(id, raw.str("DeviceName") ?: "Noctra TV", item.str("Name") ?: "", play.flag("IsPaused"),
                (play.long("PositionTicks") ?: 0) / 10_000_000.0, (item.long("RunTimeTicks") ?: 0) / 10_000_000.0,
                false, raw.str("Client")?.contains("Noctra TV", true) == true && "PlayMediaSource" in caps.strings("SupportedCommands"), play.int("VolumeLevel"))
            states[id]?.takeIf { System.currentTimeMillis() - it.first < 15000 }?.let { device = applyState(device, it.second) }
            device
        }
        if (selected != null && devices.none { it.id == selected }) selected = null
        if (selected == null && devices.count { it.title.isNotEmpty() } == 1) selected = devices.first { it.title.isNotEmpty() }.id
        val reply = ownSession ?: return
        // Consultation sans effet sur la lecture ; une ancienne TV n'est jamais sollicitée.
        for (device in devices.filter { it.custom }) runCatching { custom(device.id, mapOf("action" to "state", "replyTo" to reply, "targetId" to device.id)) }
    }
    private suspend fun custom(id: String, arguments: Map<String, String>) {
        Session.data("POST", "/Sessions/$id/Command", json = mapOf("Name" to "PlayMediaSource", "Arguments" to (arguments + ("NoctraCommand" to "1"))))
    }
    fun command(action: String, value: Double? = null) {
        val device = active ?: return
        Session.scope.launch {
            runCatching {
                if (device.live) custom(device.id, mapOf("action" to action, "value" to (value ?: 0.0).toString()))
                else when (action) {
                    "volume" -> Session.data("POST", "/Sessions/${device.id}/Command", json = mapOf("Name" to "SetVolume", "Arguments" to mapOf("Volume" to (value ?: 0.0).toInt().toString())))
                    "seek" -> Session.data("POST", "/Sessions/${device.id}/Playing/Seek", mapOf("seekPositionTicks" to (maxOf(0.0, value ?: 0.0) * 10_000_000).toLong().toString()))
                    else -> Session.data("POST", "/Sessions/${device.id}/Playing/" + when(action) { "toggle" -> "PlayPause"; "stop" -> "Stop"; "next" -> "NextTrack"; "previous" -> "PreviousTrack"; else -> "PlayPause" })
                }
                delay(300); refresh()
            }.onFailure { problem = it.message ?: "La TV ne répond pas." }
        }
    }
    suspend fun castLive(channel: LiveChannel, target: RemoteDevice) {
        require(target.custom) { "Mettez Noctra TV à jour pour recevoir les chaînes." }
        val raw = channel.entries.firstOrNull()?.raw ?: error("Chaîne indisponible")
        val entries = channel.entries.map { mapOf("channel" to it.raw, "source" to mapOf("id" to it.sourceId, "name" to it.source)) }
        val payload = raw + mapOf("name" to channel.name, "country" to channel.country, "_entries" to entries, "_sources" to channel.entries.map { it.source }.distinct())
        custom(target.id, mapOf("action" to "playLive", "channel" to Json.stringify(payload)))
        select(target.id)
    }
}

@Composable
fun RemoteDevicesSection() {
    val devices = RemotePlayback.devices.filter { it.title.isNotEmpty() }
    if (devices.isEmpty()) return
    SettingGroup("En cours sur vos écrans") {
        devices.forEach { device -> SettingRow(device.name, value = device.title, icon = Icons.Filled.Tv, onClick = { RemotePlayback.select(device.id) }) }
    }
}

@Composable
fun RemoteMiniPlayer() {
    val device = RemotePlayback.active ?: return
    var showing by remember { mutableStateOf(false) }
    Surface(color = Theme.background, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable { showing = true }) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Tv, null, tint = Theme.accent)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(device.title.ifEmpty { "Télécommande" }, maxLines = 1); Text(device.name, color = Theme.muted) }
            IconButton(onClick = { RemotePlayback.command("toggle") }) { Icon(if (device.paused) Icons.Filled.PlayArrow else Icons.Filled.Pause, "Lecture ou pause") }
        }
    }
    if (showing) NoctraSheet({ showing = false }) { RemotePanel() }
}

@Composable
fun RemotePanel() {
    val device = RemotePlayback.active ?: return
    var volume by remember(device.id, device.volume) { mutableFloatStateOf((device.volume ?: 100).toFloat()) }
    var seek by remember(device.id) { mutableStateOf<Float?>(null) }
    SheetColumn(device.name) {
        Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Icon(Icons.Filled.Tv, null, tint = Theme.accent, modifier = Modifier.size(64.dp))
            Text(device.title.ifEmpty { "Télécommande" }, color = Theme.ink, style = MaterialTheme.typography.titleLarge)
            if (device.live) Text("EN DIRECT", color = Theme.teal)
            if (!device.live && device.duration > 0) Slider(value = seek ?: device.position.toFloat().coerceIn(0f, device.duration.toFloat()), onValueChange = { seek = it },
                onValueChangeFinished = { seek?.let { RemotePlayback.command("seek", it.toDouble()) }; seek = null }, valueRange = 0f..device.duration.toFloat())
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { if (device.live) RemotePlayback.command("previous") else RemotePlayback.command("seek", device.position - 10) }) { Icon(if (device.live) Icons.Filled.SkipPrevious else Icons.Filled.Replay10, if (device.live) "Chaîne précédente" else "Reculer de 10 secondes") }
                FilledIconButton(onClick = { RemotePlayback.command("toggle") }, modifier = Modifier.size(64.dp)) { Icon(if (device.paused) Icons.Filled.PlayArrow else Icons.Filled.Pause, "Lecture ou pause") }
                IconButton(onClick = { if (device.live) RemotePlayback.command("next") else RemotePlayback.command("seek", device.position + 30) }) { Icon(if (device.live) Icons.Filled.SkipNext else Icons.Filled.Forward30, if (device.live) "Chaîne suivante" else "Avancer de 30 secondes") }
            }
            Text("Volume", color = Theme.muted)
            Slider(value = volume, onValueChange = { volume = it }, onValueChangeFinished = { RemotePlayback.command("volume", volume.toDouble()) }, valueRange = 0f..100f)
            OutlinedButton(onClick = { RemotePlayback.command("stop") }) { Text("Arrêter la lecture") }
            RemotePlayback.problem?.let { Text(it, color = Theme.orange) }
            if (RemotePlayback.devices.size > 1) RemotePlayback.devices.forEach { other -> if (other.id != device.id) TextButton(onClick = { RemotePlayback.select(other.id) }) { Text(other.name) } }
        }
    }
}

/** Diffusion de la chaîne choisie ; la lecture locale n'est fermée qu'après l'envoi. */
@Composable
fun LiveCastSheet(channel: LiveChannel, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var remote by remember { mutableStateOf(false) }
    DisposableEffect(Unit) { ChromecastBrowser.start(); onDispose { } }
    LaunchedEffect(Unit) { RemotePlayback.refresh() }
    NoctraSheet(onDismiss) {
        if (remote && RemotePlayback.active != null) RemotePanel()
        else SheetColumn("Diffuser · ${channel.name}") {
            SettingGroup("Chromecast et Google TV") {
                if (ChromecastBrowser.devices.isEmpty()) SettingRow("Recherche sur le Wi-Fi…")
                ChromecastBrowser.devices.forEach { target -> SettingRow(target.name, icon = Icons.Filled.Cast, onClick = if (busy) null else ({
                    busy = true
                    scope.launch { runCatching { ChromecastController.castLive(channel, target) }.onSuccess { LivePlayerModel.close(); onDismiss() }.onFailure { error = it.message }; busy = false }
                })) }
            }
            SettingGroup("Noctra TV") {
                val targets = RemotePlayback.devices.filter { it.custom }
                if (targets.isEmpty()) SettingRow("Ouvrez la version à jour de Noctra TV avec le même compte.")
                targets.forEach { target -> SettingRow(target.name, value = target.title, icon = Icons.Filled.Tv, onClick = if (busy) null else ({
                    busy = true
                    scope.launch { runCatching { RemotePlayback.castLive(channel, target) }.onSuccess { LivePlayerModel.close(); remote = true }.onFailure { error = it.message }; busy = false }
                })) }
            }
            if (busy) CircularProgressIndicator(modifier = Modifier.padding(24.dp), color = Theme.accent)
            error?.let { Text(it, color = Theme.orange, modifier = Modifier.padding(24.dp)) }
        }
    }
}
