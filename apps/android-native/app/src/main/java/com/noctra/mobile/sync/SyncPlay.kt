package com.noctra.mobile.sync

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Weekend
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.Json
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Net
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.str
import com.noctra.mobile.core.strings
import com.noctra.mobile.play.PlaybackManager
import com.noctra.mobile.ui.AuroraPalette
import com.noctra.mobile.ui.AuroraPrimaryButton
import com.noctra.mobile.ui.AuroraSecondaryButton
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.Notices
import com.noctra.mobile.ui.SectionTitle
import com.noctra.mobile.ui.SheetColumn
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.auroraPanel
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.time.Instant
import java.time.OffsetDateTime

/**
 * SyncPlay (regarder ensemble) et commandes à distance de Jellyfin. Même
 * protocole que Jellyfin Web et Noctra TV : canal temps réel Jellyfin
 * (WebSocket), ordres datés à l'horloge du serveur et appliqués au même
 * instant sur chaque appareil. Reçoit aussi « Lire sur… » depuis un autre appareil.
 */
object SyncPlayManager {
    data class Group(val id: String, val name: String, val participants: List<String>, val state: String?)

    var group by mutableStateOf<Group?>(null)
        private set
    var status by mutableStateOf<String?>(null)
        private set
    private var socket: WebSocket? = null
    private var keepAlive: Job? = null
    private var pinger: Job? = null
    private var retry = 0
    /** Écart avec l'horloge du serveur (ms) et aller-retour mesuré. */
    private var offset = 0.0
    private var rtt = 0.0
    private var playlistItemId = ""
    private var lastCommand = ""
    private val timers = mutableListOf<Job>()
    private val scope get() = Session.scope

    // MARK: Connexion

    fun start() {
        scope.launch { reportCapabilities() }
        connect()
    }

    fun stopAll() {
        socket?.close(1001, null)
        socket = null
        keepAlive?.cancel()
        pinger?.cancel()
        group = null
    }

    private suspend fun reportCapabilities() {
        runCatching {
            Session.data("POST", "/Sessions/Capabilities/Full", json = mapOf(
                "PlayableMediaTypes" to listOf("Video", "Audio"),
                "SupportedCommands" to listOf("DisplayMessage", "Play", "Playstate"),
                "SupportsMediaControl" to true,
                "SupportsPersistentIdentifier" to true
            ))
        }
    }

    private fun connect() {
        val token = Session.token ?: return
        var base = Session.jellyfinBase
        if (base.startsWith("https", ignoreCase = true)) base = "wss" + base.drop(5) else if (base.startsWith("http", ignoreCase = true)) base = "ws" + base.drop(4)
        // OkHttp n'accepte que http(s) pour bâtir l'adresse : ws(s) y est converti tout seul.
        val http = base.replaceFirst(Regex("^ws", RegexOption.IGNORE_CASE), "http")
        val url = "$http/socket".toHttpUrlOrNull()?.newBuilder()?.addQueryParameter("api_key", token)?.addQueryParameter("deviceId", Session.deviceId)?.build() ?: return
        socket?.close(1001, null)
        lateinit var created: WebSocket
        created = Net.client.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                val json = Json.parseMap(text) ?: return
                scope.launch {
                    if (socket !== webSocket) return@launch
                    retry = 0
                    handle(json)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                scope.launch {
                    if (socket !== webSocket) return@launch
                    // Reconnexion espacée (2, 4, 8… 30 s).
                    val wait = minOf(30_000L, 2000L shl minOf(retry, 4))
                    retry += 1
                    delay(wait)
                    if (socket === webSocket && Session.isSignedIn) connect()
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                onFailure(webSocket, IllegalStateException("closed"), null)
            }
        })
        socket = created
    }

    private fun send(json: Map<String, Any?>) {
        socket?.send(Json.stringify(json))
    }

    private fun handle(message: JsonMap) {
        val data = message["Data"]
        when (message.str("MessageType")) {
            "ForceKeepAlive" -> {
                val seconds = maxOf(10.0, (data as? Number)?.toDouble() ?: 60.0) / 2
                keepAlive?.cancel()
                keepAlive = scope.launch {
                    while (isActive) {
                        send(mapOf("MessageType" to "KeepAlive"))
                        delay((seconds * 1000).toLong())
                    }
                }
            }
            "SyncPlayGroupUpdate" -> data.asMap()?.let { groupUpdate(it) }
            "SyncPlayCommand" -> data.asMap()?.let { groupCommand(it) }
            "Play" -> {
                // « Lire sur cet appareil » depuis un autre appareil.
                val play = data.asMap() ?: return
                val id = (play["ItemIds"] as? List<*>)?.firstOrNull()?.toString()?.replace("-", "") ?: return
                val ticks = (play["StartPositionTicks"] as? Number)?.toDouble() ?: 0.0
                scope.launch { playItem(id, ticks / 10_000_000, false) }
            }
            "Playstate" -> {
                if (group != null) return
                val state = data.asMap() ?: return
                when (state.str("Command")) {
                    "Pause" -> PlaybackManager.commandPause(null)
                    "Unpause" -> PlaybackManager.commandPlay(null)
                    "PlayPause" -> PlaybackManager.commandToggle()
                    "Stop" -> PlaybackManager.stop()
                    "Seek" -> (state["SeekPositionTicks"] as? Number)?.let { PlaybackManager.commandPlay(it.toDouble() / 10_000_000) }
                }
            }
            "GeneralCommand" -> {
                val command = data.asMap() ?: return
                if (command.str("Name") != "DisplayMessage") return
                val arguments = command["Arguments"].asMap() ?: return
                val text = listOfNotNull(arguments.str("Header"), arguments.str("Text")).joinToString(" · ")
                if (text.isNotEmpty()) Notices.announce(text)
            }
        }
    }

    // MARK: Groupes

    suspend fun groups(): List<Group> {
        val list = runCatching { Json.parse(Session.data("GET", "/SyncPlay/List")) }.getOrNull().asMaps()
        return list.mapNotNull { entry ->
            val id = entry.str("GroupId") ?: return@mapNotNull null
            Group(id, entry.str("GroupName") ?: "Groupe", entry.strings("Participants"), entry.str("State"))
        }
    }

    suspend fun create(name: String) { Session.data("POST", "/SyncPlay/New", json = mapOf("GroupName" to name)) }

    suspend fun join(id: String) { Session.data("POST", "/SyncPlay/Join", json = mapOf("GroupId" to id)) }

    suspend fun leave() {
        runCatching { Session.data("POST", "/SyncPlay/Leave", json = emptyMap<String, Any>()) }
        leaveLocally(null)
    }

    suspend fun setQueue(itemId: String, startSeconds: Double) {
        Session.data("POST", "/SyncPlay/SetNewQueue", json = mapOf(
            "PlayingQueue" to listOf(itemId), "PlayingItemPosition" to 0, "StartPositionTicks" to (startSeconds * 10_000_000).toLong()
        ))
    }

    private fun leaveLocally(message: String?) {
        group = null
        playlistItemId = ""
        status = null
        timers.forEach { it.cancel() }
        timers.clear()
        pinger?.cancel()
        if (message != null) Notices.announce(message)
    }

    private fun groupUpdate(update: JsonMap) {
        val data = update["Data"]
        when (update.str("Type")) {
            "GroupJoined" -> {
                val info = data.asMap()
                val joined = Group(update.str("GroupId") ?: "", info?.str("GroupName") ?: "Groupe", info?.strings("Participants") ?: emptyList(), info?.str("State"))
                group = joined
                Notices.announce("SyncPlay : vous avez rejoint « ${joined.name} ».")
                scope.launch { syncClock() }
                pinger?.cancel()
                pinger = scope.launch {
                    while (isActive) {
                        delay(60_000)
                        syncClock()
                        runCatching { Session.data("POST", "/SyncPlay/Ping", json = mapOf("Ping" to rtt.toInt())) }
                    }
                }
            }
            "UserJoined" -> (data as? String)?.let { name ->
                group = group?.let { it.copy(participants = it.participants + name) }
                Notices.announce("SyncPlay : $name a rejoint le groupe.")
            }
            "UserLeft" -> (data as? String)?.let { name ->
                group = group?.let { it.copy(participants = it.participants - name) }
                Notices.announce("SyncPlay : $name a quitté le groupe.")
            }
            "GroupLeft" -> leaveLocally("SyncPlay : vous avez quitté le groupe.")
            "NotInGroup" -> leaveLocally(null)
            "GroupDoesNotExist", "LibraryAccessDenied", "JoinGroupDenied", "CreateGroupDenied" ->
                leaveLocally(if (update.str("Type") == "LibraryAccessDenied") "SyncPlay : un titre du groupe n’est pas accessible à votre compte." else "SyncPlay : action refusée par le serveur.")
            "StateUpdate" -> {
                val state = data.asMap()?.str("State")
                group = group?.copy(state = state)
                status = when (state) { "Waiting" -> "En attente des autres…"; "Paused" -> "En pause"; else -> null }
            }
            "PlayQueue" -> data.asMap()?.let { playQueue(it) }
        }
    }

    private fun playQueue(queue: JsonMap) {
        val list = queue["Playlist"].asMaps()
        val index = (queue["PlayingItemIndex"] as? Number)?.toInt() ?: 0
        if (index < 0 || index >= list.size) {
            if (PlaybackManager.syncMode) PlaybackManager.stop()
            playlistItemId = ""
            return
        }
        val entry = list[index]
        val entryId = entry.str("PlaylistItemId") ?: ""
        if (entryId == playlistItemId && PlaybackManager.syncMode) return
        playlistItemId = entryId
        val itemId = (entry["ItemId"]?.toString() ?: "").replace("-", "")
        val ticks = (queue["StartPositionTicks"] as? Number)?.toDouble() ?: 0.0
        scope.launch { playItem(itemId, ticks / 10_000_000, true) }
    }

    private suspend fun playItem(id: String, startSeconds: Double, sync: Boolean) {
        if (id.isEmpty()) return
        val item = runCatching { BaseItem.from(Session.json(listOf("/Items/$id", "/Users/{userId}/Items/$id"), mapOf("userId" to Session.userId))) }.getOrNull() ?: return
        runCatching { PlaybackManager.play(item, startSeconds = startSeconds, sync = sync) }.onFailure { Notices.announce("Lecture impossible : ${it.message}") }
    }

    private fun groupCommand(command: JsonMap) {
        val name = command.str("Command") ?: ""
        val time = command.str("When") ?: ""
        val ticks = (command["PositionTicks"] as? Number)?.toDouble() ?: 0.0
        val item = command.str("PlaylistItemId") ?: ""
        val key = listOf(name, time, ticks.toString(), item).joinToString("|")
        if (key == lastCommand) return
        lastCommand = key
        if (item.isNotEmpty() && playlistItemId.isNotEmpty() && item != playlistItemId) return
        val position = ticks / 10_000_000
        when (name) {
            "Unpause" -> atServerTime(time) { late -> PlaybackManager.commandPlay(position + late); status = null }
            "Pause" -> atServerTime(time) { PlaybackManager.commandPause(position); status = "En pause" }
            "Seek" -> {
                status = "Synchronisation…"
                PlaybackManager.commandSeek(position) { ready(position, false) }
            }
            "Stop" -> PlaybackManager.stop()
        }
    }

    /** Ordre daté à l'horloge du serveur : appliqué au même instant, ou rattrapé s'il est passé. */
    private fun atServerTime(time: String, action: (Double) -> Unit) {
        val date = parse(time) ?: run { action(0.0); return }
        val local = date - offset
        val wait = local - System.currentTimeMillis()
        if (wait <= 0) { action(-wait / 1000); return }
        timers += scope.launch {
            delay(wait.toLong())
            action(maxOf(0.0, (System.currentTimeMillis() - local) / 1000))
        }
    }

    // MARK: État du lecteur → groupe

    fun ready(position: Double, playing: Boolean) {
        if (group == null) return
        scope.launch { runCatching { Session.data("POST", "/SyncPlay/Ready", json = body(position, playing)) } }
    }

    fun requestPause() = post("Pause")
    fun requestUnpause() = post("Unpause")

    fun requestSeek(position: Double) {
        if (group == null) return
        scope.launch { runCatching { Session.data("POST", "/SyncPlay/Seek", json = mapOf("PositionTicks" to (position * 10_000_000).toLong())) } }
    }

    private fun post(path: String) {
        if (group == null) return
        scope.launch { runCatching { Session.data("POST", "/SyncPlay/$path", json = emptyMap<String, Any>()) } }
    }

    private fun body(position: Double, playing: Boolean): Map<String, Any?> = mapOf(
        "When" to Instant.ofEpochMilli((System.currentTimeMillis() + offset).toLong()).toString(),
        "PositionTicks" to (position * 10_000_000).toLong(), "IsPlaying" to playing, "PlaylistItemId" to playlistItemId
    )

    // MARK: Horloge du serveur

    /** Écart d'horloge : meilleure de 5 mesures (aller-retour le plus court). */
    private suspend fun syncClock() {
        var best: Pair<Double, Double>? = null
        repeat(5) {
            val sent = System.currentTimeMillis().toDouble()
            val json = runCatching { Json.parseMap(Session.data("GET", "/GetUtcTime")) }.getOrNull() ?: return@repeat
            val t1 = json.str("RequestReceptionTime")?.let { parse(it) } ?: return@repeat
            val t2 = json.str("ResponseTransmissionTime")?.let { parse(it) } ?: return@repeat
            val received = System.currentTimeMillis().toDouble()
            val roundTrip = (received - sent) - (t2 - t1)
            val shift = ((t1 - sent) + (t2 - received)) / 2
            if (best == null || roundTrip < best!!.first) best = roundTrip to shift
        }
        best?.let { offset = it.second; rtt = maxOf(0.0, it.first) }
    }

    /** Dates de Jellyfin (jusqu'à 7 décimales, « Z » parfois absent), en millisecondes. */
    fun parse(text: String): Double? {
        val value = if (!text.endsWith("Z") && !text.contains('+') && text.length <= 28 && !Regex("[+-]\\d{2}:\\d{2}$").containsMatchIn(text)) text + "Z" else text
        val instant = runCatching { Instant.parse(value) }.getOrNull() ?: runCatching { OffsetDateTime.parse(value).toInstant() }.getOrNull() ?: return null
        return instant.toEpochMilli().toDouble() + (instant.nano % 1_000_000) / 1_000_000.0
    }
}

// MARK: Feuille SyncPlay

/** Feuille SyncPlay : regarder ensemble. Groupe actuel (participants, état), groupes ouverts à rejoindre, création d'un groupe. */
@Composable
fun SyncPlaySheet(onDismiss: () -> Unit) {
    val sync = SyncPlayManager
    val scope = rememberCoroutineScope()
    var groups by remember { mutableStateOf<List<SyncPlayManager.Group>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var name by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf<String?>(null) }
    suspend fun reload() { groups = sync.groups(); loading = false }
    LaunchedEffect(Unit) { reload() }
    val fallbackName = "Soirée de ${Session.userName ?: "Noctra"}"
    fun create() {
        working = "new"
        scope.launch {
            try { sync.create(name.ifBlank { fallbackName }); onDismiss() } catch (failure: Exception) { error = failure.message } finally { working = null }
        }
    }

    NoctraSheet(onDismiss) {
        SheetColumn("SyncPlay") {
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Box(Modifier.size(58.dp).shadow(16.dp, CircleShape, ambientColor = Theme.lilac, spotColor = Theme.lilac).background(Theme.gradient, CircleShape), contentAlignment = Alignment.Center) {
                        Icon(if (sync.group == null) Icons.Filled.Groups else Icons.Filled.LiveTv, contentDescription = null, tint = Color.Black.copy(alpha = 0.8f), modifier = Modifier.size(28.dp))
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(if (sync.group == null) "Regarder ensemble" else "Vous êtes dans un groupe", style = Theme.display(24), color = Theme.ink)
                        Text("Le film ou l’épisode lancé démarre au même instant pour tout le groupe ; pause, lecture et avance sont partagées.", color = Color.White.copy(alpha = 0.75f), fontSize = 14.sp)
                    }
                }
                val current = sync.group
                if (current != null) {
                    Column(Modifier.fillMaxWidth().auroraPanel(26.dp, AuroraPalette.roulette).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(current.name, color = Theme.ink, fontSize = 19.sp, fontWeight = FontWeight.Bold, maxLines = 2, modifier = Modifier.weight(1f))
                            sync.status?.let { Text(it, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.glass(CircleShape, Theme.teal.copy(alpha = 0.45f)).padding(horizontal = 10.dp, vertical = 5.dp)) }
                        }
                        Text("${current.participants.size} participant${if (current.participants.size > 1) "s" else ""}", color = Theme.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        current.participants.forEach { person ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Avatar(person, 34.dp)
                                Text(person, color = Theme.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                if (person == Session.userName) Text("Vous", color = Theme.teal, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        AuroraSecondaryButton(onClick = { scope.launch { sync.leave(); onDismiss() } }, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, tint = Theme.red)
                            Spacer(Modifier.width(8.dp))
                            Text("Quitter le groupe", color = Theme.red)
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SectionTitle("Groupes ouverts", Modifier.weight(1f), detail = if (loading) null else "${groups.size}")
                            Icon(Icons.Filled.Refresh, contentDescription = "Actualiser", tint = Theme.accent, modifier = Modifier.size(40.dp).focusRing(CircleShape).clickable { loading = true; scope.launch { reload() } }.padding(8.dp))
                        }
                        if (loading) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            CircularProgressIndicator(color = Theme.accent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                            Text("Recherche des groupes…", color = Theme.muted)
                        } else if (groups.isEmpty()) Row(
                            Modifier.fillMaxWidth().auroraPanel(22.dp, AuroraPalette.roulette).padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(Icons.Filled.Weekend, contentDescription = null, tint = Theme.lilac)
                            Text("Aucun groupe ouvert. Créez le vôtre ci-dessous : les autres le verront ici.", color = Color.White.copy(alpha = 0.75f), fontSize = 14.sp)
                        }
                        groups.forEach { group ->
                            Row(
                                Modifier.fillMaxWidth().auroraPanel(22.dp, AuroraPalette.roulette).padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)
                            ) {
                                Box {
                                    group.participants.take(3).forEachIndexed { index, person -> Box(Modifier.offset(x = (index * 26).dp)) { Avatar(person, 36.dp) } }
                                    Spacer(Modifier.width((36 + 26 * (minOf(3, group.participants.size) - 1).coerceAtLeast(0)).dp))
                                }
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text(group.name, color = Theme.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(if (group.participants.isEmpty()) "Personne pour le moment" else group.participants.joinToString(", "), color = Theme.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                AuroraPrimaryButton(onClick = {
                                    working = group.id
                                    scope.launch {
                                        try { sync.join(group.id); onDismiss() } catch (failure: Exception) { error = failure.message } finally { working = null }
                                    }
                                }, enabled = working == null) {
                                    if (working == group.id) CircularProgressIndicator(color = Theme.onAccent, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                                    else Text("Rejoindre", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        SectionTitle("Nouveau groupe")
                        TextField(
                            value = name, onValueChange = { name = it }, singleLine = true,
                            placeholder = { Text(fallbackName, color = Theme.muted) },
                            leadingIcon = { Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Theme.accent) },
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go), keyboardActions = KeyboardActions(onGo = { create() }),
                            shape = CircleShape,
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = Color(0xB31A1D33), unfocusedContainerColor = Color(0x991A1D33),
                                focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Theme.accent,
                                focusedTextColor = Theme.ink, unfocusedTextColor = Theme.ink
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                        AuroraPrimaryButton(onClick = { create() }, enabled = working == null, modifier = Modifier.fillMaxWidth()) {
                            if (working == "new") CircularProgressIndicator(color = Theme.onAccent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                            else Icon(Icons.Filled.AddCircle, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Créer et rejoindre", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                error?.let { message ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Filled.Warning, contentDescription = null, tint = Theme.orange, modifier = Modifier.size(18.dp))
                        Text(message, color = Theme.orange, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun Avatar(person: String, size: Dp) {
    val palette = listOf(Theme.teal, Theme.lilac, Theme.cyan, Color(0xFFF9A8D4), Color(0xFFFDBA74))
    var sum = 0
    person.forEach { sum = (sum + it.code) and 0xFFFF }
    Box(Modifier.size(size).background(palette[sum % palette.size], CircleShape).border(2.dp, Theme.background, CircleShape), contentAlignment = Alignment.Center) {
        Text(person.take(1).uppercase(), color = Color.Black.copy(alpha = 0.8f), fontSize = (size.value * 0.42f).sp, fontWeight = FontWeight.Bold)
    }
}
