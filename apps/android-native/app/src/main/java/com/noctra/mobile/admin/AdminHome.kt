package com.noctra.mobile.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Article
import androidx.compose.material.icons.automirrored.filled.ListAlt
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Lan
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SettingsSuggest
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.clock
import com.noctra.mobile.core.flag
import com.noctra.mobile.core.map
import com.noctra.mobile.core.maps
import com.noctra.mobile.core.str
import com.noctra.mobile.core.strings
import com.noctra.mobile.ui.RemoteImage
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import com.noctra.mobile.ui.rememberPush
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Accueil de l'administration (comme les Réglages d'iOS). */
@Composable
fun AdminHomeScreen() {
    val push = rememberPush()
    AdminScaffold("Tableau de bord") {
        section("Serveur") {
            Link("Vue d’ensemble", Icons.Filled.Speed, Theme.lilac) { push { AdminDashboardScreen() } }
            Link("Paramètres généraux", Icons.Filled.Settings, Theme.cyan) { push { ConfigFormScreen("Paramètres généraux", "/System/Configuration", AdminForms.general) } }
            Link("Lecture et transcodage", Icons.Filled.Movie, Theme.pink) { push { ConfigFormScreen("Lecture et transcodage", "/System/Configuration/encoding", AdminForms.encoding) } }
            Link("Réseau", Icons.Filled.Lan, Theme.teal) {
                push { ConfigFormScreen("Réseau", "/System/Configuration/network", AdminForms.network, "Une erreur ici peut rendre le serveur injoignable. Les changements s’appliquent après un redémarrage du serveur.") }
            }
            Link("Personnalisation", Icons.Filled.Palette, Theme.gold) { push { ConfigFormScreen("Personnalisation", "/System/Configuration/branding", AdminForms.branding) } }
        }
        section("Contenu") {
            Link("Médiathèques", Icons.Filled.VideoLibrary, Theme.lilac) { push { LibrariesAdminScreen() } }
            Link("Tâches planifiées", Icons.Filled.Schedule, Theme.cyan) { push { ScheduledTasksScreen() } }
            if (Session.hasNoctra) {
                Link("Téléchargements", Icons.Filled.Download, Theme.orange) { push { DownloadsScreen() } }
                Link("TV en direct et accès VIP", Icons.Filled.LiveTv, Theme.teal) { push { LiveAdminScreen() } }
                Link("Radarr · films", Icons.Filled.Movie, Theme.orange) { push { ArrHubScreen(ArrKind.Radarr) } }
                Link("Sonarr · séries", Icons.Filled.Tv, Theme.cyan) { push { ArrHubScreen(ArrKind.Sonarr) } }
            }
        }
        section("Comptes et appareils") {
            Link("Utilisateurs", Icons.Filled.People, Theme.pink) { push { UsersAdminScreen() } }
            Link("Appareils", Icons.Filled.Devices, Theme.cyan) { push { DevicesAdminScreen() } }
            Link("Clés d’API", Icons.Filled.Key, Theme.gold) { push { ApiKeysScreen() } }
        }
        section("Extensions") {
            Link("Extensions installées", Icons.Filled.Extension, Theme.lilac) { push { PluginsScreen() } }
            Link("Catalogue", Icons.Filled.Apps, Theme.teal) { push { PluginCatalogScreen() } }
            Link("Dépôts", Icons.Filled.Inventory2, Theme.cyan) { push { RepositoriesScreen() } }
        }
        section("Surveillance") {
            Link("Activité", Icons.AutoMirrored.Filled.ListAlt, Theme.pink) { push { ActivityScreen() } }
            Link("Journaux", Icons.AutoMirrored.Filled.Article, Theme.muted) { push { LogsScreen() } }
        }
    }
}

@Composable
private fun Link(title: String, icon: ImageVector, color: Color, open: () -> Unit) {
    AdminRow(title, leading = { TileIcon(icon, color) }, onClick = open, trailing = { Text("›", color = Theme.muted, fontSize = 22.sp) })
}

// MARK: Vue d'ensemble

private fun deviceIcon(entry: JsonMap): ImageVector {
    val client = ((entry.str("Client") ?: "") + " " + (entry.str("DeviceName") ?: "")).lowercase()
    return when {
        client.contains("tv") || client.contains("android") -> Icons.Filled.Tv
        client.contains("iphone") || client.contains("ios") || client.contains("ipad") -> Icons.Filled.PhoneAndroid
        else -> Icons.Filled.Computer
    }
}

/** Tableau de bord du serveur : lectures en cours (pause, arrêt, message), appareils, tâches, activité. */
@Composable
fun AdminDashboardScreen() {
    val scope = rememberCoroutineScope()
    var info by remember { mutableStateOf<JsonMap>(emptyMap()) }
    var sessions by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var tasks by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var activity by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<String?>(null) }
    var messageTarget by remember { mutableStateOf<Pair<String, String>?>(null) }
    var menu by remember { mutableStateOf(false) }

    suspend fun load() = coroutineScope {
        val infoTask = async { runCatching { jellyfin("/System/Info") }.getOrNull() }
        val sessionsTask = async { runCatching { jellyfin("/Sessions", mapOf("activeWithinSeconds" to "960")) }.getOrNull() }
        val tasksTask = async { runCatching { jellyfin("/ScheduledTasks", mapOf("isHidden" to "false")) }.getOrNull() }
        val logTask = async { runCatching { jellyfin("/System/ActivityLog/Entries", mapOf("startIndex" to "0", "limit" to "25")) }.getOrNull() }
        infoTask.await().asMap()?.let { info = it }
        sessionsTask.await()?.let { list -> sessions = list.asMaps().filter { it.str("DeviceId") != Session.deviceId || it["NowPlayingItem"] != null } }
        tasksTask.await()?.let { list -> tasks = list.asMaps().sortedWith(compareBy<JsonMap>({ it.str("State") != "Running" }, { it.str("Name") ?: "" })) }
        logTask.await().asMap()?.let { activity = it.maps("Items") }
        loaded = true
    }
    fun act(block: suspend () -> Unit) { scope.launch { runCatching { block() }.onFailure { note = it.message }; load() } }
    LaunchedEffect(Unit) { while (true) { load(); delay(5000) } }
    val playing = sessions.filter { it["NowPlayingItem"] != null }
    val idle = sessions.filter { it["NowPlayingItem"] == null }

    AdminScaffold("Tableau de bord", actions = {
        Box {
            Box(Modifier.size(40.dp).glass(CircleShape).focusRing(CircleShape).clickable { menu = true }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.MoreVert, contentDescription = "Actions du serveur", tint = Theme.ink)
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, modifier = Modifier.background(Color(0xFF151932))) {
                DropdownMenuItem(text = { Text("Actualiser les médiathèques", color = Theme.ink) }, onClick = {
                    menu = false
                    act {
                        if (Session.hasNoctra) Session.noctraSend("POST", "/api/libraries/refresh", null) else Session.data("POST", "/Library/Refresh")
                        note = "Actualisation des médiathèques lancée."
                    }
                })
                DropdownMenuItem(text = { Text("Redémarrer le serveur", color = Theme.ink) }, onClick = { menu = false; confirm = "restart" })
                DropdownMenuItem(text = { Text("Arrêter le serveur", color = Theme.red) }, onClick = { menu = false; confirm = "shutdown" })
            }
        }
    }) {
        item {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(info.str("ServerName") ?: "Serveur", style = Theme.display(24).copy(brush = Theme.titleGradient))
                Text(listOfNotNull("Version ${info.str("Version") ?: "—"}", info.str("OperatingSystemDisplayName")).joinToString(" · "), color = Theme.muted, fontSize = 14.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Badge("${playing.size} lecture${if (playing.size > 1) "s" else ""}", Theme.lilac, Icons.Filled.PlayCircle)
                    Badge("${sessions.size} appareil${if (sessions.size > 1) "s" else ""}", Theme.cyan, Icons.Filled.Devices)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (info.flag("HasPendingRestart")) Badge("Redémarrage requis", Theme.orange, Icons.Filled.Refresh)
                    if (info.flag("HasUpdateAvailable")) Badge("Mise à jour", Theme.teal, Icons.Filled.SystemUpdate)
                }
                note?.let { Text(it, color = Theme.accent, fontSize = 13.sp) }
            }
        }
        section("Lectures en cours") {
            if (playing.isEmpty()) NoteLine(if (loaded) "Aucune lecture en ce moment." else "Chargement…", Theme.muted)
            playing.forEachIndexed { index, entry ->
                if (index > 0) RowDivider()
                PlayingRow(entry,
                    command = { id, name -> act { Session.data("POST", "/Sessions/$id/Playing/$name") } },
                    message = { id, name -> messageTarget = id to name })
            }
        }
        if (idle.isNotEmpty()) section("Appareils connectés") {
            idle.forEachIndexed { index, entry ->
                if (index > 0) RowDivider()
                AdminRow(entry.str("DeviceName") ?: "Appareil", icon = deviceIcon(entry),
                    detail = listOfNotNull(entry.str("UserName"), entry.str("Client"), AdminFormat.relative(entry["LastActivityDate"])).filter { it.isNotEmpty() }.joinToString(" · "))
            }
        }
        section("Tâches planifiées") {
            tasks.forEachIndexed { index, task ->
                if (index > 0) RowDivider()
                TaskRow(task) { id, running -> act { Session.data(if (running) "DELETE" else "POST", "/ScheduledTasks/Running/$id") } }
            }
        }
        if (activity.isNotEmpty()) section("Activité récente") {
            activity.forEachIndexed { index, entry ->
                if (index > 0) RowDivider()
                AdminRow(entry.str("Name") ?: "", detail = listOfNotNull(entry.str("ShortOverview"), AdminFormat.relative(entry["Date"])).filter { it.isNotEmpty() }.joinToString("\n"))
            }
        }
    }

    confirm?.let { action ->
        Confirm(if (action == "shutdown") "Arrêter le serveur ?" else "Redémarrer le serveur ?", "Les lectures en cours seront interrompues.", if (action == "shutdown") "Arrêter" else "Redémarrer", onDismiss = { confirm = null }) {
            act {
                Session.data("POST", if (action == "restart") "/System/Restart" else "/System/Shutdown")
                note = if (action == "restart") "Redémarrage du serveur demandé." else "Arrêt du serveur demandé."
            }
        }
    }
    messageTarget?.let { (id, name) ->
        Prompt("Message", listOf("Texte affiché sur l’écran"), confirm = "Envoyer", message = "Vers « $name »", onDismiss = { messageTarget = null }) { values ->
            act {
                Session.data("POST", "/Sessions/$id/Message", json = mapOf("Header" to "Noctra", "Text" to values[0], "TimeoutMs" to 10_000))
                note = "Message envoyé à « $name »."
            }
        }
    }
}

@Composable
private fun PlayingRow(entry: JsonMap, command: (String, String) -> Unit, message: (String, String) -> Unit) {
    val item = entry.map("NowPlayingItem") ?: emptyMap()
    val state = entry.map("PlayState") ?: emptyMap()
    val id = entry.str("Id") ?: ""
    val paused = state.flag("IsPaused")
    val position = AdminFormat.number(state["PositionTicks"]) / 10_000_000
    val length = AdminFormat.number(item["RunTimeTicks"]) / 10_000_000
    val series = item.str("SeriesName")
    val transcoding = entry.map("TranscodingInfo")
    val method = when {
        transcoding == null -> "Lecture directe"
        transcoding.flag("IsVideoDirect") -> "Remux · vidéo d’origine"
        else -> transcoding.strings("TranscodeReasons").take(2).joinToString(", ").let { if (it.isEmpty()) "Transcodage" else "Transcodage · $it" }
    }
    val device = entry.str("DeviceName") ?: "Appareil"
    Column(Modifier.padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        AdminRow(
            series ?: item.str("Name") ?: "",
            detail = listOfNotNull(if (series != null) item.str("Name") else null, listOfNotNull(entry.str("UserName"), device).joinToString(" · "), method).joinToString("\n"),
            leading = { RemoteImage(Session.image(item.str("Id"), width = 200), Modifier.size(44.dp, 66.dp).clip(RoundedCornerShape(8.dp))) },
            trailing = { Icon(if (paused) Icons.Filled.PauseCircle else Icons.Filled.PlayCircle, contentDescription = null, tint = Theme.accent, modifier = Modifier.size(28.dp)) },
            menu = listOf(
                (if (paused) "Reprendre" else "Mettre en pause") to { command(id, if (paused) "Unpause" else "Pause") },
                "Envoyer un message" to { message(id, device) },
                "Arrêter la lecture" to { command(id, "Stop") }
            )
        )
        if (length > 0) Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Progress(minOf(1.0, position / length))
            Text("${clock(position)} / ${clock(length)}", color = Theme.muted, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
        }
    }
}

@Composable
fun TaskRow(task: JsonMap, showDescription: Boolean = false, toggle: (String, Boolean) -> Unit) {
    val id = task.str("Id") ?: ""
    val running = task.str("State") == "Running"
    val last = task.map("LastExecutionResult")
    val failed = last?.str("Status")?.let { it != "Completed" } ?: false
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(task.str("Name") ?: "", color = Theme.ink, fontSize = 15.sp)
            if (showDescription) task.str("Description")?.let { Text(it, color = Theme.muted, fontSize = 11.sp, maxLines = 2) }
            if (running) Progress(AdminFormat.number(task["CurrentProgressPercentage"]) / 100)
            else if (last != null) Text("${if (failed) "Échec" else "Terminée"} ${AdminFormat.relative(last["EndTimeUtc"])}", color = if (failed) Theme.orange else Theme.muted, fontSize = 12.sp)
        }
        Box(Modifier.size(38.dp).glass(CircleShape).focusRing(CircleShape).clickable { toggle(id, running) }, contentAlignment = Alignment.Center) {
            Icon(if (running) Icons.Filled.Stop else Icons.Filled.PlayArrow, contentDescription = if (running) "Arrêter" else "Lancer", tint = Theme.ink, modifier = Modifier.size(20.dp))
        }
    }
}

/** Tâches planifiées par catégorie, avec avancement. */
@Composable
fun ScheduledTasksScreen() {
    val scope = rememberCoroutineScope()
    var tasks by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    suspend fun load() { runCatching { jellyfin("/ScheduledTasks", mapOf("isHidden" to "false")) }.getOrNull()?.let { tasks = it.asMaps() } }
    LaunchedEffect(Unit) { while (true) { load(); delay(3000) } }
    val categories = tasks.groupBy { it.str("Category") ?: "Autres" }.toSortedMap()
    AdminScaffold("Tâches planifiées") {
        if (tasks.isEmpty()) item { LoadingLine() }
        for ((category, list) in categories) section(category, key = category) {
            list.forEachIndexed { index, task ->
                if (index > 0) RowDivider()
                TaskRow(task, showDescription = true) { id, running -> scope.launch { runCatching { Session.data(if (running) "DELETE" else "POST", "/ScheduledTasks/Running/$id") }; load() } }
            }
        }
    }
}

/** Activité du serveur, par pages de 50. */
@Composable
fun ActivityScreen() {
    var entries by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var total by remember { mutableStateOf(Int.MAX_VALUE) }
    var loading by remember { mutableStateOf(false) }
    suspend fun load() {
        if (loading || entries.size >= total) return
        loading = true
        try {
            val json = runCatching { jellyfin("/System/ActivityLog/Entries", mapOf("startIndex" to entries.size.toString(), "limit" to "50")).asMap() }.getOrNull() ?: return
            val fresh = json.maps("Items")
            entries = entries + fresh
            total = if (fresh.isEmpty()) entries.size else (json["TotalRecordCount"] as? Number)?.toInt() ?: Int.MAX_VALUE
        } finally {
            loading = false
        }
    }
    LaunchedEffect(Unit) { load() }
    AdminScaffold("Activité") {
        items(entries.size) { index ->
            val entry = entries[index]
            if (index == entries.size - 1) LaunchedEffect(entries.size) { load() }
            val severity = entry.str("Severity") ?: "Information"
            Column(Modifier.padding(horizontal = 16.dp)) {
                AdminRow(
                    entry.str("Name") ?: "", icon = if (severity == "Error" || severity == "Warning") Icons.Filled.Warning else Icons.Filled.SettingsSuggest,
                    tint = when (severity) { "Error" -> Theme.red; "Warning" -> Theme.orange; else -> Theme.cyan },
                    detail = listOfNotNull(entry.str("ShortOverview") ?: entry.str("Overview"), AdminFormat.relative(entry["Date"])).filter { it.isNotEmpty() }.joinToString("\n")
                )
                RowDivider()
            }
        }
        if (loading) item { LoadingLine() }
    }
}
