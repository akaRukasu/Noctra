package com.noctra.mobile.admin

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.flag
import com.noctra.mobile.core.map
import com.noctra.mobile.core.int
import com.noctra.mobile.core.Json
import com.noctra.mobile.core.maps
import com.noctra.mobile.core.str
import com.noctra.mobile.live.LiveStore
import com.noctra.mobile.ui.AuroraBackground
import com.noctra.mobile.ui.AuroraPalette
import com.noctra.mobile.ui.Notices
import com.noctra.mobile.ui.SearchField
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.TopBar
import com.noctra.mobile.ui.rememberPush
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.net.URLEncoder

// MARK: Appareils et clés

@Composable
fun DevicesAdminScreen() {
    val scope = rememberCoroutineScope()
    var devices by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var renaming by remember { mutableStateOf<Pair<String, String>?>(null) }
    suspend fun load() {
        runCatching { jellyfin("/Devices").asMap() }.getOrNull()?.let { json -> devices = json.maps("Items").sortedByDescending { AdminFormat.date(it["DateLastActivity"]) ?: 0L } }
    }
    LaunchedEffect(Unit) { load() }
    AdminScaffold("Appareils") {
        section {
            if (devices.isEmpty()) LoadingLine()
            devices.forEachIndexed { index, device ->
                if (index > 0) RowDivider()
                val id = device.str("Id") ?: ""
                val name = device.str("CustomName") ?: device.str("Name") ?: "Appareil"
                AdminRow(name, detail = listOfNotNull(listOfNotNull(device.str("AppName"), device.str("AppVersion"), device.str("LastUserName")).joinToString(" · "), AdminFormat.relative(device["DateLastActivity"])).joinToString("\n"),
                    menu = listOfNotNull(
                        "Renommer" to { renaming = id to name },
                        if (id != Session.deviceId) "Supprimer" to { scope.launch { runCatching { Session.data("DELETE", "/Devices", mapOf("id" to id)) }; load() } } else null
                    ))
            }
        }
    }
    renaming?.let { (id, name) ->
        Prompt("Renommer l’appareil", listOf("Nom"), listOf(name), "Renommer", onDismiss = { renaming = null }) { values ->
            scope.launch { runCatching { Session.data("POST", "/Devices/Options", mapOf("id" to id), json = mapOf("CustomName" to values[0])) }; load() }
        }
    }
}

@Composable
fun ApiKeysScreen() {
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var keys by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var creating by remember { mutableStateOf(false) }
    suspend fun load() { runCatching { jellyfin("/Auth/Keys").asMap() }.getOrNull()?.let { keys = it.maps("Items") } }
    LaunchedEffect(Unit) { load() }
    AdminScaffold("Clés d’API", actions = { BarButton(Icons.Filled.Add, "Nouvelle clé") { creating = true } }) {
        section(footer = "Les clés d’API donnent un accès complet au serveur : ne les partagez qu’avec des applications de confiance.") {
            if (keys.isEmpty()) NoteLine("Aucune clé d’API.", Theme.muted)
            keys.forEachIndexed { index, key ->
                if (index > 0) RowDivider()
                val token = key.str("AccessToken") ?: ""
                AdminRow(key.str("AppName") ?: "Application", detail = "$token\nCréée ${AdminFormat.relative(key["DateCreated"])}", menu = listOf(
                    "Copier la clé" to { clipboard.setText(AnnotatedString(token)); Notices.announce("Clé copiée.") },
                    "Révoquer" to { scope.launch { runCatching { Session.data("DELETE", "/Auth/Keys/$token") }; load() } }
                ))
            }
        }
    }
    if (creating) Prompt("Nouvelle clé d’API", listOf("Nom de l’application"), confirm = "Créer", onDismiss = { creating = false }) { values ->
        scope.launch { runCatching { Session.data("POST", "/Auth/Keys", mapOf("app" to values[0])) }; load() }
    }
}

// MARK: Extensions

private val pluginStatus = mapOf("Active" to "Active", "Disabled" to "Désactivée", "Restart" to "Redémarrage nécessaire", "NotSupported" to "Non compatible",
    "Malfunctioned" to "En erreur", "Superceded" to "Remplacée", "Deleted" to "Supprimée")

@Composable
fun PluginsScreen() {
    val scope = rememberCoroutineScope()
    var plugins by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var note by remember { mutableStateOf<String?>(null) }
    suspend fun load() { runCatching { jellyfin("/Plugins") }.getOrNull()?.let { list -> plugins = list.asMaps().sortedBy { it.str("Name") ?: "" } } }
    fun act(method: String, path: String, success: String) {
        scope.launch { note = runCatching { Session.data(method, path); success }.getOrElse { it.message }; load() }
    }
    LaunchedEffect(Unit) { load() }
    AdminScaffold("Extensions") {
        note?.let { text -> item { NoteLine(text) } }
        section {
            if (plugins.isEmpty()) LoadingLine()
            plugins.forEachIndexed { index, plugin ->
                if (index > 0) RowDivider()
                val id = plugin.str("Id") ?: ""
                val version = plugin.str("Version") ?: ""
                val status = plugin.str("Status") ?: ""
                AdminRow(plugin.str("Name") ?: "", detail = listOfNotNull("Version $version · ${pluginStatus[status] ?: status}", plugin.str("Description")).joinToString("\n"),
                    detailColor = if (status == "Active") Theme.teal else Theme.orange,
                    menu = listOfNotNull(
                        when (status) {
                            "Active" -> "Désactiver" to { act("POST", "/Plugins/$id/$version/Disable", "Extension désactivée (redémarrage nécessaire).") }
                            "Disabled" -> "Activer" to { act("POST", "/Plugins/$id/$version/Enable", "Extension activée (redémarrage nécessaire).") }
                            else -> null
                        },
                        if (plugin["CanUninstall"] != false) "Désinstaller" to { act("DELETE", "/Plugins/$id/$version", "Extension désinstallée (redémarrage nécessaire).") } else null
                    ))
            }
        }
    }
}

@Composable
fun PluginCatalogScreen() {
    val scope = rememberCoroutineScope()
    var packages by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var installed by remember { mutableStateOf<Set<String>>(emptySet()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        coroutineScope {
            val catalog = async { runCatching { jellyfin("/Packages") }.getOrNull() }
            val current = async { runCatching { jellyfin("/Plugins") }.getOrNull() }
            packages = catalog.await().asMaps().sortedBy { it.str("name") ?: "" }
            installed = current.await().asMaps().mapNotNull { it.str("Id")?.lowercase() }.toSet()
        }
        loading = false
    }
    val term = query.trim()
    val shown = if (term.isEmpty()) packages else packages.filter { (it.str("name") ?: "").contains(term, true) || (it.str("category") ?: "").contains(term, true) }
    AdminScaffold("Catalogue") {
        item { SearchField(query, "Extension ou catégorie", Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) { query = it } }
        note?.let { text -> item { NoteLine(text) } }
        if (loading) item { LoadingLine() }
        items(shown) { pack ->
            val name = pack.str("name") ?: ""
            val guid = pack.str("guid") ?: ""
            val latest = pack.maps("versions").firstOrNull()
            Column(Modifier.padding(horizontal = 16.dp)) {
                AdminRow(name, detail = listOfNotNull(listOfNotNull(pack.str("category"), latest?.str("version")?.let { "v$it" }).joinToString(" · "), pack.str("overview") ?: pack.str("description")).joinToString("\n"),
                    trailing = {
                        if (guid.lowercase() in installed) Text("Installée", color = Theme.teal, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        else if (latest != null) SaveButton(enabled = true, busy = false, title = "Installer") {
                            scope.launch {
                                note = runCatching {
                                    Session.data("POST", "/Packages/Installed/" + URLEncoder.encode(name, "UTF-8").replace("+", "%20"),
                                        mapOf("assemblyGuid" to guid, "version" to latest.str("version"), "repositoryUrl" to latest.str("repositoryUrl")))
                                    installed = installed + guid.lowercase()
                                    "Installation de « $name » lancée. Redémarrez le serveur pour l’activer."
                                }.getOrElse { it.message }
                            }
                        }
                    })
                RowDivider()
            }
        }
    }
}

@Composable
fun RepositoriesScreen() {
    val scope = rememberCoroutineScope()
    var repositories by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var adding by remember { mutableStateOf(false) }
    suspend fun load() { runCatching { jellyfin("/Repositories") }.getOrNull()?.let { repositories = it.asMaps() } }
    fun save(list: List<JsonMap>) { scope.launch { runCatching { Session.data("POST", "/Repositories", json = list) }; load() } }
    LaunchedEffect(Unit) { load() }
    AdminScaffold("Dépôts", actions = { BarButton(Icons.Filled.Add, "Nouveau dépôt") { adding = true } }) {
        section {
            repositories.forEachIndexed { index, repository ->
                if (index > 0) RowDivider()
                AdminRow(repository.str("Name") ?: "", detail = repository.str("Url"), menu = listOf("Retirer" to { save(repositories.filterIndexed { i, _ -> i != index }) }))
            }
        }
    }
    if (adding) Prompt("Nouveau dépôt", listOf("Nom", "Adresse (manifest.json)"), confirm = "Ajouter", onDismiss = { adding = false }) { values ->
        save(repositories + mapOf("Name" to values[0], "Url" to values.getOrElse(1) { "" }, "Enabled" to true))
    }
}

// MARK: Journaux

@Composable
fun LogsScreen() {
    val push = rememberPush()
    var logs by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    LaunchedEffect(Unit) { runCatching { jellyfin("/System/Logs") }.getOrNull()?.let { list -> logs = list.asMaps().sortedByDescending { AdminFormat.date(it["DateModified"]) ?: 0L } } }
    AdminScaffold("Journaux") {
        section {
            if (logs.isEmpty()) LoadingLine()
            logs.forEachIndexed { index, log ->
                if (index > 0) RowDivider()
                val name = log.str("Name") ?: ""
                AdminRow(name, detail = "${AdminFormat.bytes(AdminFormat.number(log["Size"]))} · ${AdminFormat.relative(log["DateModified"])}", onClick = { push { LogFileScreen(name) } })
            }
        }
    }
}

/** Journal du serveur : les 3 000 dernières lignes, plus récentes en haut, filtre et partage. */
@Composable
fun LogFileScreen(name: String) {
    val context = LocalContext.current
    var lines by remember { mutableStateOf<List<String>>(emptyList()) }
    var filter by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    LaunchedEffect(name) {
        runCatching { Session.data("GET", "/System/Logs/Log", mapOf("name" to name)) }.getOrNull()?.let { text ->
            lines = text.lines().filter { it.isNotEmpty() }.takeLast(3000).reversed()
        }
        loading = false
    }
    val term = filter.trim()
    val shown = if (term.isEmpty()) lines else lines.filter { it.contains(term, ignoreCase = true) }
    Box(Modifier.fillMaxSize()) {
        AuroraBackground()
        Column(Modifier.fillMaxSize()) {
            TopBar(name) {
                BarButton(Icons.Filled.Share, "Partager") {
                    val intent = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, name).putExtra(Intent.EXTRA_TEXT, lines.reversed().joinToString("\n").takeLast(200_000))
                    runCatching { context.startActivity(Intent.createChooser(intent, name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }
            }
            SearchField(filter, "Filtrer (ERR, WRN, nom…)", Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) { filter = it }
            if (loading) LoadingLine()
            SelectionContainer {
                LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
                    items(shown) { line ->
                        Text(line, fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = when {
                            line.contains("[ERR]") -> Theme.red
                            line.contains("[WRN]") -> Theme.orange
                            else -> Color.White.copy(alpha = 0.85f)
                        }, modifier = Modifier.fillMaxWidth().padding(vertical = 1.dp))
                    }
                }
            }
        }
    }
}

// MARK: TV en direct (Noctra)

/** Chaînes VIP LiveWatch connues de l'appli (famille/identifiant de leur résolveur) pour le diagnostic. */
private fun liveWatchVipChannels(): List<Pair<String, String>> {
    val pattern = Regex("/api/tv/livewatch/resolve/((?:main|daddy|north|frame)/[^?]+)")
    val seen = HashSet<String>()
    return LiveStore.channels.filter { it.vip }.mapNotNull { channel ->
        channel.entries.firstNotNullOfOrNull { entry -> entry.raw.str("resolverUrl")?.let { pattern.find(it)?.groupValues?.get(1) } }
            ?.takeIf { seen.add(it) }?.let { it to channel.name }
    }.sortedBy { it.second.lowercase() }.take(300)
}

/** Résultat du diagnostic pour une chaîne : flux VIP direct, puis réponse brute de l'API LiveWatch. */
@Composable
private fun DiagnosticRows(title: String, stream: JsonMap?, api: List<JsonMap>, failure: String?) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, color = Theme.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        failure?.let { Text(it, color = Theme.orange, fontSize = 13.sp) }
        stream?.let {
            val ok = it.flag("ok")
            Text(if (ok) "✓ Flux VIP direct : lu (${it.str("client") ?: ""})" else "✕ Flux VIP direct : échec · ${it.str("message") ?: ""}", color = if (ok) Theme.teal else Theme.orange, fontSize = 13.sp)
        }
        api.forEach { item ->
            val code = item.int("status") ?: 0
            Text("API LiveWatch · ${item.str("client") ?: "?"} : ${if (code == 0) "sans réponse" else "HTTP $code"} · ${item.str("detail") ?: ""}",
                color = if (item.flag("ok")) Theme.teal else Theme.muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
        }
    }
}

/** Accès VIP LiveWatch, clés Movix / Northlive et sources TV du serveur Noctra. */
@Composable
fun LiveAdminScreen() {
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<JsonMap>(emptyMap()) }
    var keys by remember { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    var sources by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var keyProvider by remember { mutableStateOf<String?>(null) }
    var addingSource by remember { mutableStateOf(false) }
    var working by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    var diagnosticRef by remember { mutableStateOf("") }
    var diagnosing by remember { mutableStateOf(false) }
    var report by remember { mutableStateOf<JsonMap?>(null) }
    var reportError by remember { mutableStateOf<String?>(null) }
    val clipboard = LocalClipboardManager.current
    suspend fun load() {
        // Chaînes VIP proposées au diagnostic, même si l'onglet TV n'a pas encore été ouvert.
        if (LiveStore.channels.isEmpty()) scope.launch { runCatching { LiveStore.loadAll() } }
        runCatching { Session.noctraJSON("/api/tv/livewatch/session", 20.0).asMap() }.getOrNull()?.let { status = it }
        runCatching { Session.noctraJSON("/api/tv/provider-keys", 20.0).asMap() }.getOrNull()?.let { json -> keys = json.mapNotNull { (k, v) -> (v as? Boolean)?.let { k to it } }.toMap() }
        runCatching { Session.noctraJSON("/api/tv/sources").asMap() }.getOrNull()?.let { sources = it.maps("sources") }
    }
    fun act(block: suspend () -> String) { scope.launch { note = runCatching { block() }.getOrElse { it.message }; load() } }
    LaunchedEffect(Unit) { load() }
    AdminScaffold("TV en direct", AuroraPalette.tv) {
        section("LiveWatch VIP Premium", "Le compte est gardé sur le serveur Noctra : ses chaînes VIP sont proposées en premier sur tous vos appareils.") {
            AdminRow("État", trailing = {
                Text(if (status.flag("active")) "VIP Premium actif" else if (status.flag("configured")) "Connecté, VIP inactif" else "Non connecté", color = if (status.flag("active")) Theme.teal else Theme.muted, fontSize = 14.sp)
            })
            status.str("account")?.let { AdminRow("Compte", trailing = { Text(it, color = Theme.muted, fontSize = 14.sp) }) }
            status.str("message")?.let { NoteLine(it, Theme.orange) }
            if (status.flag("configured")) {
                ActionLine("Déconnecter LiveWatch", destructive = true, busy = working) {
                    working = true
                    act {
                        try { Session.noctraSend("DELETE", "/api/tv/livewatch/session", null); "Compte LiveWatch déconnecté." } finally { working = false; scope.launch { runCatching { LiveStore.loadAll(force = true) } } }
                    }
                }
            } else {
                FieldLine("Adresse e-mail LiveWatch", email) { email = it }
                FieldLine("Mot de passe", password, secret = true) { password = it }
                ActionLine("Connecter le compte VIP", enabled = email.isNotEmpty() && password.isNotEmpty(), busy = working) {
                    working = true
                    act {
                        try {
                            val result = Session.noctraSend("POST", "/api/tv/livewatch/session", mapOf("email" to email, "password" to password)).asMap()
                            result?.let { status = it }
                            password = ""
                            if (status.flag("active")) "Compte VIP connecté : ses chaînes sont proposées en premier." else "Compte connecté, mais le VIP Premium n’est pas actif."
                        } finally { working = false; scope.launch { runCatching { LiveStore.loadAll(force = true) } } }
                    }
                }
            }
        }
        if (status.flag("configured")) section("Diagnostic VIP", "Teste depuis le serveur Noctra la session VIP, le lecteur officiel et le flux VIP direct, avec la réponse exacte de LiveWatch pour chaque manière de se présenter.") {
            ChoiceLine("Chaîne à tester", listOf("" to "Chaîne test automatique") + liveWatchVipChannels(), diagnosticRef) { diagnosticRef = it }
            RowDivider()
            ActionLine(if (diagnosing) "Diagnostic en cours…" else "Lancer le diagnostic", busy = diagnosing, enabled = !diagnosing) {
                diagnosing = true
                reportError = null
                scope.launch {
                    val path = "/api/tv/livewatch/diagnostics" + if (diagnosticRef.isEmpty()) "" else "?ref=" + URLEncoder.encode(diagnosticRef, "UTF-8")
                    runCatching { Session.noctraJSON(path, 150.0).asMap() }
                        .onSuccess { report = it }
                        .onFailure { report = null; reportError = it.message ?: "Diagnostic impossible." }
                    diagnosing = false
                }
            }
            reportError?.let { NoteLine(it, Theme.orange) }
            report?.let { result ->
                NoteLine(result.str("message") ?: "", if (result.flag("ok")) Theme.teal else Theme.orange)
                AdminRow("VIP confirmé", trailing = { Text(if (result.flag("isVip")) "Oui" else "Non", color = Theme.muted, fontSize = 14.sp) })
                result.int("sessionExpiresIn")?.let { seconds -> AdminRow("Session LiveWatch", trailing = { Text(if (seconds > 0) "valable ${seconds / 60} min" else "à renouveler", color = Theme.muted, fontSize = 14.sp) }) }
                result.str("clientMode")?.let { mode -> AdminRow("Méthode retenue", trailing = { Text(mode, color = Theme.muted, fontSize = 14.sp) }) }
                result.maps("checks").firstOrNull()?.let { check ->
                    DiagnosticRows(check.str("channel") ?: "Chaîne test", check.map("stream"), check.maps("api"), if (check.flag("ok")) null else check.str("message"))
                }
                result.map("channel")?.let { channel ->
                    val name = liveWatchVipChannels().firstOrNull { it.first == diagnosticRef }?.second ?: "Chaîne choisie"
                    DiagnosticRows(name, channel.map("stream"), channel.maps("api"), channel.str("error"))
                }
                ActionLine("Copier le rapport") {
                    clipboard.setText(AnnotatedString(Json.stringify(result)))
                    Notices.announce("Rapport copié : collez-le dans la conversation.")
                }
            }
        }
        section("Fournisseurs à clé") {
            listOf("movix" to "Movix", "northlive" to "Northlive").forEachIndexed { index, (provider, label) ->
                if (index > 0) RowDivider()
                AdminRow(label, detail = if (keys[provider] == true) "Clé enregistrée" else "Aucune clé", detailColor = if (keys[provider] == true) Theme.teal else Theme.muted,
                    trailing = { SaveButton(enabled = true, busy = false, title = if (keys[provider] == true) "Changer" else "Ajouter") { keyProvider = provider } })
            }
        }
        section("Sources TV · ${sources.size}") {
            sources.forEach { source ->
                val id = source.str("id")
                AdminRow(source.str("name") ?: "", detail = listOfNotNull(source.str("section"), source.str("description")).joinToString(" · "),
                    menu = if (source.flag("editable") && id != null) listOf("Retirer" to { act { Session.noctraSend("DELETE", "/api/tv/sources/" + URLEncoder.encode(id, "UTF-8").replace("+", "%20"), null); "Source retirée." } }) else emptyList())
                RowDivider()
            }
            ActionLine("Ajouter une source (M3U, portail…)", Icons.Filled.AddCircle) { addingSource = true }
        }
        note?.let { text -> item { NoteLine(text) } }
    }
    keyProvider?.let { provider ->
        Prompt("Clé ${if (provider == "movix") "Movix" else "Northlive"}", listOf("Clé"), confirm = "Enregistrer", onDismiss = { keyProvider = null }) { values ->
            act { Session.noctraSend("POST", "/api/tv/provider-keys", mapOf("provider" to provider, "key" to values[0])); "Clé enregistrée et vérifiée." }
        }
    }
    if (addingSource) Prompt("Nouvelle source TV", listOf("Nom", "Adresse (M3U, Xtream, portail)"), confirm = "Ajouter", onDismiss = { addingSource = false }) { values ->
        act { Session.noctraSend("POST", "/api/tv/sources", mapOf("name" to values[0], "url" to values.getOrElse(1) { "" }, "type" to "auto")); "Source ajoutée." }
    }
}
