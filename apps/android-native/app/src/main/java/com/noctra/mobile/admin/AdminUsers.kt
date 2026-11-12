package com.noctra.mobile.admin

import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.SdStorage
import androidx.compose.material.icons.filled.Star
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.flag
import com.noctra.mobile.core.map
import com.noctra.mobile.core.maps
import com.noctra.mobile.core.str
import com.noctra.mobile.core.strings
import com.noctra.mobile.ui.AuroraPalette
import com.noctra.mobile.ui.LocalNavigator
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.ProgressLine
import com.noctra.mobile.ui.RemoteImage
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import com.noctra.mobile.ui.rememberPush
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// MARK: Utilisateurs

@Composable
fun UserAvatar(id: String, name: String, tag: String?) {
    Box(Modifier.size(42.dp).clip(CircleShape).background(Theme.gradient), contentAlignment = Alignment.Center) {
        Text(name.take(1).uppercase(), color = Theme.onAccent, fontWeight = FontWeight.Bold)
        if (tag != null) RemoteImage(Session.urlString("/Users/$id/Images/Primary", mapOf("tag" to tag, "maxWidth" to "120")), Modifier.fillMaxSize(), placeholder = false)
    }
}

@Composable
fun UsersAdminScreen() {
    val scope = rememberCoroutineScope()
    val push = rememberPush()
    var users by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }
    suspend fun load() {
        runCatching { jellyfin("/Users") }.getOrNull()?.let { list -> users = list.asMaps().sortedBy { (it.str("Name") ?: "").lowercase() } }
        loaded = true
    }
    LaunchedEffect(Unit) { load() }
    AdminScaffold("Utilisateurs", actions = { BarButton(Icons.Filled.PersonAdd, "Nouvel utilisateur") { adding = true } }) {
        section {
            if (!loaded) LoadingLine()
            if (loaded && users.isEmpty()) NoteLine("Liste des utilisateurs indisponible.", Theme.muted)
            users.forEachIndexed { index, user ->
                if (index > 0) RowDivider()
                val id = user.str("Id") ?: ""
                val name = user.str("Name") ?: "?"
                val policy = user.map("Policy") ?: emptyMap()
                val activity = AdminFormat.relative(user["LastActivityDate"])
                AdminRow(name, leading = { UserAvatar(id, name, user.str("PrimaryImageTag")) },
                    detail = if (policy.flag("IsDisabled")) "Désactivé" else if (activity.isEmpty()) "Jamais connecté" else "Actif $activity",
                    detailColor = if (policy.flag("IsDisabled")) Theme.orange else Theme.muted,
                    trailing = { if (policy.flag("IsAdministrator")) Icon(Icons.Filled.Star, contentDescription = "Administrateur", tint = Theme.gold, modifier = Modifier.size(16.dp)) },
                    onClick = { push { UserEditScreen(id) } })
            }
        }
    }
    if (adding) Prompt("Nouvel utilisateur", listOf("Nom d’utilisateur", "Mot de passe (facultatif)"), confirm = "Créer", secret = setOf(1), onDismiss = { adding = false }) { values ->
        scope.launch { runCatching { Session.data("POST", "/Users/New", json = mapOf("Name" to values[0].trim(), "Password" to values.getOrElse(1) { "" })) }; load() }
    }
}

private val userFlags = listOf(
    "IsAdministrator" to "Administrateur", "IsDisabled" to "Compte désactivé", "IsHidden" to "Masqué sur l’écran de connexion",
    "EnableRemoteAccess" to "Accès hors du réseau local", "EnableMediaPlayback" to "Lecture des médias",
    "EnableVideoPlaybackTranscoding" to "Transcodage vidéo", "EnableAudioPlaybackTranscoding" to "Transcodage audio",
    "EnablePlaybackRemuxing" to "Remux (changement de conteneur)", "EnableContentDownloading" to "Téléchargement des médias",
    "EnableLiveTvAccess" to "TV en direct du serveur", "EnableRemoteControlOfOtherUsers" to "Contrôle des autres utilisateurs",
    "EnableSharedDeviceControl" to "Contrôle des appareils partagés", "EnableContentDeletion" to "Suppression de médias"
)

/** Fiche d'un utilisateur : nom, mot de passe, droits, médiathèques, suppression. */
@Composable
fun UserEditScreen(userId: String) {
    val scope = rememberCoroutineScope()
    val navigator = LocalNavigator.current
    var user by remember { mutableStateOf<JsonMap>(emptyMap()) }
    var policy by remember { mutableStateOf<JsonMap>(emptyMap()) }
    var name by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var folders by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var dirty by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    suspend fun load() {
        runCatching { jellyfin("/Users/$userId").asMap() }.getOrNull()?.let { json ->
            user = json
            policy = json.map("Policy") ?: emptyMap()
            name = json.str("Name") ?: ""
        }
        runCatching { jellyfin("/Library/MediaFolders", mapOf("isHidden" to "false")).asMap() }.getOrNull()?.let { media ->
            folders = media.maps("Items").mapNotNull { entry -> entry.str("Id")?.let { it to (entry.str("Name") ?: it) } }
        }
        dirty = false
    }
    LaunchedEffect(userId) { load() }
    fun setPolicy(key: String, value: Any?) { policy = policy + (key to value); dirty = true }
    fun save() {
        saving = true
        scope.launch {
            try {
                Session.send("POST", listOf("/Users/$userId/Policy"), json = policy)
                val trimmed = name.trim()
                if (trimmed.isNotEmpty() && trimmed != user.str("Name")) {
                    Session.send("POST", listOf("/Users/$userId", "/Users"), mapOf("userId" to userId), user + mapOf("Name" to trimmed, "Policy" to policy))
                }
                note = "Modifications enregistrées."
                load()
            } catch (failure: Exception) {
                note = failure.message
            } finally {
                saving = false
            }
        }
    }
    fun setPassword(reset: Boolean) {
        scope.launch {
            note = runCatching {
                Session.send("POST", listOf("/Users/$userId/Password", "/Users/Password"), mapOf("userId" to userId),
                    if (reset) mapOf("ResetPassword" to true) else mapOf("NewPw" to password, "CurrentPw" to "", "ResetPassword" to false))
                password = ""
                if (reset) "Mot de passe supprimé." else "Mot de passe modifié."
            }.getOrElse { it.message }
        }
    }

    AdminScaffold(name.ifEmpty { "Utilisateur" }, actions = { SaveButton(enabled = dirty, busy = saving) { save() } }) {
        section("Profil") {
            FieldLine("Nom", name) { name = it; dirty = true }
            AdminFormat.relative(user["LastActivityDate"]).takeIf { it.isNotEmpty() }?.let { AdminRow("Dernière activité", trailing = { Text(it, color = Theme.muted, fontSize = 13.sp) }) }
        }
        section("Mot de passe") {
            FieldLine("Nouveau mot de passe", password, secret = true) { password = it }
            ActionLine("Définir le mot de passe", enabled = password.isNotEmpty()) { setPassword(false) }
            ActionLine("Supprimer le mot de passe", destructive = true) { setPassword(true) }
        }
        section("Droits") {
            userFlags.forEach { (key, label) -> ToggleLine(label, policy[key] == true) { setPolicy(key, it) } }
            ChoiceLine("SyncPlay", listOf("CreateAndJoinGroups" to "Créer et rejoindre", "JoinGroups" to "Rejoindre seulement", "None" to "Désactivé"), policy.str("SyncPlayAccess") ?: "CreateAndJoinGroups") { setPolicy("SyncPlayAccess", it) }
            ChoiceLine("Débit hors réseau local", listOf(0 to "Illimité") + listOf(60, 40, 20, 12, 8, 4, 2).map { it * 1_000_000 to "$it Mb/s" }, (policy["RemoteClientBitrateLimit"] as? Number)?.toInt() ?: 0) { setPolicy("RemoteClientBitrateLimit", it) }
            ChoiceLine("Lectures simultanées", listOf(0 to "Illimitées") + (1..6).map { it to "$it" }, (policy["MaxActiveSessions"] as? Number)?.toInt() ?: 0) { setPolicy("MaxActiveSessions", it) }
        }
        section("Médiathèques") {
            ToggleLine("Toutes les médiathèques", policy["EnableAllFolders"] == true) { setPolicy("EnableAllFolders", it) }
            if (policy["EnableAllFolders"] != true) folders.forEach { (id, label) ->
                val enabled = policy.strings("EnabledFolders")
                ToggleLine(label, id in enabled) { on -> setPolicy("EnabledFolders", enabled.filter { it != id } + if (on) listOf(id) else emptyList()) }
            }
        }
        note?.let { text -> item { NoteLine(text) } }
        section {
            ActionLine("Supprimer l’utilisateur", destructive = true, enabled = userId != Session.userId) { confirmDelete = true }
        }
    }
    if (confirmDelete) Confirm("Supprimer « $name » ?", "Le compte, sa progression et ses favoris seront supprimés du serveur.", "Supprimer", onDismiss = { confirmDelete = false }) {
        scope.launch { runCatching { Session.data("DELETE", "/Users/$userId") }.onSuccess { navigator?.pop() }.onFailure { note = it.message } }
    }
}

// MARK: Téléchargements (qBittorrent via Noctra)

private enum class TorrentFilter(val label: String) { all("Tous"), downloading("En cours"), done("Terminés"), paused("En pause"), errors("Erreurs") }

/** Centre de téléchargements : débits, filtres, actions sur chaque torrent, ajout d'un fichier .torrent. */
@Composable
fun DownloadsScreen() {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var overview by remember { mutableStateOf<JsonMap>(emptyMap()) }
    var torrents by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var filter by remember { mutableStateOf(TorrentFilter.all) }
    var deleting by remember { mutableStateOf<Pair<String, String>?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    var failed by remember { mutableStateOf(false) }
    suspend fun load() {
        val json = runCatching { Session.noctraJSON("/api/downloads?live=${System.currentTimeMillis() / 1000}", 12.0).asMap() }.getOrNull()
        if (json == null) { failed = true; return }
        failed = false
        overview = json
        torrents = json.maps("torrents")
    }
    fun action(hash: String, name: String) { scope.launch { runCatching { Session.noctraSend("POST", "/api/downloads/$hash/$name", null) }.onFailure { note = it.message }; load() } }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            note = runCatching {
                val (fileName, bytes) = withContext(Dispatchers.IO) {
                    val label = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null } ?: "fichier.torrent"
                    label to (context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0))
                }
                if (bytes.isEmpty()) "Fichier illisible." else {
                    val result = Session.noctraSend("POST", "/api/downloads/add", mapOf("name" to fileName, "dataBase64" to Base64.encodeToString(bytes, Base64.NO_WRAP), "startPaused" to false)).asMap()
                    if (result?.flag("alreadyPresent") == true) "Ce torrent est déjà dans la liste." else "Torrent ajouté."
                }
            }.getOrElse { it.message }
            load()
        }
    }
    LaunchedEffect(Unit) { while (true) { load(); delay(2000) } }
    val shown = torrents.filter { torrent ->
        val errored = torrent.flag("errored")
        val active = torrent.flag("active")
        val completed = torrent.flag("completed")
        when (filter) {
            TorrentFilter.all -> true
            TorrentFilter.downloading -> active && !completed && !errored
            TorrentFilter.done -> completed && !errored
            TorrentFilter.paused -> !active && !errored
            TorrentFilter.errors -> errored
        }
    }
    AdminScaffold("Téléchargements", AuroraPalette.requests, actions = { BarButton(Icons.Filled.Add, "Ajouter un fichier .torrent") { picker.launch("*/*") } }) {
        item {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Stat(Icons.Filled.ArrowDownward, AdminFormat.speed(AdminFormat.number(overview["downloadSpeed"])), Theme.cyan, Modifier.weight(1f))
                    Stat(Icons.Filled.ArrowUpward, AdminFormat.speed(AdminFormat.number(overview["uploadSpeed"])), Theme.pink, Modifier.weight(1f))
                    if (overview["freeSpace"] != null) Stat(Icons.Filled.SdStorage, AdminFormat.bytes(AdminFormat.number(overview["freeSpace"])), Theme.teal, Modifier.weight(1f))
                }
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TorrentFilter.entries.forEach { entry ->
                        val active = entry == filter
                        Text(entry.label, color = if (active) Theme.onAccent else Theme.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clip(CircleShape).background(if (active) Theme.orange else Color(0x991A1D33)).focusRing(CircleShape).clickable { filter = entry }.padding(horizontal = 14.dp, vertical = 8.dp))
                    }
                }
                note?.let { Text(it, color = Theme.accent, fontSize = 13.sp) }
                if (failed && torrents.isEmpty()) Text("Centre de téléchargements injoignable.", color = Theme.orange, fontSize = 13.sp)
            }
        }
        section {
            if (shown.isEmpty() && !failed) NoteLine(if (torrents.isEmpty()) "Chargement…" else "Aucun torrent dans cette catégorie.", Theme.muted)
            shown.forEachIndexed { index, torrent ->
                if (index > 0) RowDivider()
                val hash = torrent.str("hash") ?: ""
                val name = torrent.str("name") ?: ""
                val progress = AdminFormat.number(torrent["progress"])
                val active = torrent.flag("active")
                val completed = torrent.flag("completed")
                val errored = torrent.flag("errored")
                val down = AdminFormat.number(torrent["downloadSpeed"])
                val up = AdminFormat.number(torrent["uploadSpeed"])
                Column(Modifier.padding(bottom = 10.dp)) {
                    AdminRow(name,
                        detail = listOfNotNull(torrent.str("stateLabel"), "${(progress * 100).toInt()} %", AdminFormat.bytes(AdminFormat.number(torrent["size"]))).joinToString(" · ") +
                            when { active && !completed && down > 0 -> "\n↓ ${AdminFormat.speed(down)} · ${AdminFormat.duration(AdminFormat.number(torrent["eta"]))}"; up > 0 -> "\n↑ ${AdminFormat.speed(up)}"; else -> "" },
                        detailColor = if (errored) Theme.orange else Theme.muted,
                        menu = listOf(
                            (if (active) "Mettre en pause" else "Reprendre") to { action(hash, if (active) "pause" else "resume") },
                            "Revérifier" to { action(hash, "recheck") },
                            "Réannoncer" to { action(hash, "reannounce") },
                            "Priorité maximale" to { action(hash, "top") },
                            "Priorité minimale" to { action(hash, "bottom") },
                            "Supprimer…" to { deleting = hash to name }
                        ))
                    Box(Modifier.padding(horizontal = 16.dp)) { ProgressLine(progress) }
                }
            }
        }
    }
    deleting?.let { (hash, name) ->
        Confirm("Supprimer ce torrent ?", name, "Torrent et fichiers", onDismiss = { deleting = null }, extra = "Torrent uniquement" to {
            scope.launch { note = runCatching { Session.noctraSend("POST", "/api/downloads/$hash/delete", mapOf("deleteFiles" to false)); "Torrent supprimé, fichiers conservés." }.getOrElse { it.message }; load() }
        }) {
            scope.launch { note = runCatching { Session.noctraSend("POST", "/api/downloads/$hash/delete", mapOf("deleteFiles" to true)); "Torrent et fichiers supprimés." }.getOrElse { it.message }; load() }
        }
    }
}

@Composable
private fun Stat(icon: ImageVector, value: String, color: Color, modifier: Modifier = Modifier) {
    Row(modifier.glass(RoundedCornerShape(16.dp), color.copy(alpha = 0.25f)).padding(vertical = 10.dp, horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
        Text(value, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
