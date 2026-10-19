package com.noctra.mobile.admin

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.flag
import com.noctra.mobile.core.int
import com.noctra.mobile.core.maps
import com.noctra.mobile.core.str
import com.noctra.mobile.ui.AuroraPalette
import com.noctra.mobile.ui.SearchField
import com.noctra.mobile.ui.SeriesStatusTag
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.rememberPush
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.net.URLEncoder
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import androidx.compose.material.icons.filled.Storage
import com.noctra.mobile.ui.LocalNavigator
import androidx.compose.runtime.saveable.rememberSaveable
import com.noctra.mobile.ui.Notices

// Explorateur média des administrateurs, comme sur le site : racines autorisées (dont
// Trash), dossiers, renommage, corbeille, nouveau dossier, doublons, sagas et séries.

private fun encode(value: String) = URLEncoder.encode(value, "UTF-8")

private fun dateLabel(value: Any?): String? = AdminFormat.date(value)?.let { DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.FRANCE).format(Date(it)) }

@Composable
fun FileExplorerScreen() {
    val scope = rememberCoroutineScope()
    val push = rememberPush()
    var roots by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    // Dossier en cours gardé en revenant d'un autre écran (doublons, déplacement…).
    var root by rememberSaveable { mutableStateOf("") }
    var path by rememberSaveable { mutableStateOf("") }
    var parent by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var truncated by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    var renaming by remember { mutableStateOf<JsonMap?>(null) }
    var trashing by remember { mutableStateOf<JsonMap?>(null) }
    var creating by remember { mutableStateOf(false) }
    var emptying by remember { mutableStateOf(false) }

    suspend fun open(target: String, at: String) {
        if (target.isEmpty()) return
        loading = true
        try {
            val json = Session.noctraJSON("/api/files?root=${encode(target)}&path=${encode(at)}", 30.0).asMap()
            root = target
            path = json?.str("path") ?: at
            parent = json?.get("parent") as? String
            items = json?.maps("items") ?: emptyList()
            truncated = json?.flag("truncated") == true
            failed = null
        } catch (failure: kotlinx.coroutines.CancellationException) {
            throw failure
        } catch (failure: Exception) {
            failed = failure.message
        } finally {
            loading = false
        }
    }

    fun act(route: String, body: Map<String, Any?>, done: String) {
        scope.launch {
            try {
                Session.noctraSend("POST", route, body, 120.0)
                note = done
                open(root, path)
            } catch (failure: Exception) {
                failed = failure.message
            }
        }
    }

    LaunchedEffect(Unit) {
        try {
            roots = Session.noctraJSON("/api/files/roots", 20.0).asMap()?.maps("roots") ?: emptyList()
            val first = roots.firstOrNull { it.flag("available") }?.str("id")
            if (first == null) {
                failed = "Aucun dossier média configuré ou accessible."
                loading = false
            } else if (root.isNotEmpty() && roots.any { it.str("id") == root }) open(root, path) else open(first, "")
        } catch (failure: Exception) {
            failed = failure.message
            loading = false
        }
    }

    AdminScaffold("Explorateur média", AuroraPalette.requests, actions = {
        BarButton(Icons.Filled.CreateNewFolder, "Nouveau dossier") { if (root.isNotEmpty()) creating = true }
    }) {
        section(footer = "Navigation limitée aux racines autorisées, dont Trash. Les suppressions vont dans .noctra-trash.") {
            ActionLine("Stockage de la seedbox", Icons.Filled.Storage) { push { StorageScreen() } }
            RowDivider()
            ActionLine("Détecter les doublons", Icons.Filled.Verified) { push { DuplicatesScreen() } }
            RowDivider()
            ActionLine("Sagas de films", Icons.Filled.Movie) { push { CompletenessScreen("movie") } }
            RowDivider()
            ActionLine("Séries", Icons.Filled.Tv) { push { CompletenessScreen("series") } }
            if (root == "trash") {
                RowDivider()
                ActionLine("Vider Trash", Icons.Filled.Delete, destructive = true) { emptying = true }
            }
        }
        if (roots.size > 1) item {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                roots.forEach { entry ->
                    val id = entry.str("id") ?: ""
                    androidx.compose.material3.TextButton(onClick = { scope.launch { open(id, "") } }, enabled = entry.flag("available")) {
                        Text(entry.str("label") ?: id, color = if (id == root) Theme.accent else Theme.muted)
                    }
                }
            }
        }
        section {
            Text("/$path", color = Theme.muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
            parent?.let { up ->
                RowDivider()
                ActionLine("Dossier parent", Icons.Filled.ArrowUpward) { scope.launch { open(root, up) } }
            }
            if (loading) LoadingLine()
            failed?.let { NoteLine(it, Theme.orange) }
            note?.let { NoteLine(it) }
        }
        section {
            items.forEachIndexed { index, entry ->
                if (index > 0) RowDivider()
                val directory = entry.str("type") == "directory"
                val manageable = entry.flag("manageable")
                val onOpen: (() -> Unit)? = if (directory) { { scope.launch { open(root, entry.str("path") ?: "") } } } else null
                AdminRow(
                    entry.str("name") ?: "", detail = fileDetail(entry), icon = if (directory) Icons.Filled.Folder else Icons.Filled.Description,
                    tint = if (directory) Theme.accent else Theme.muted,
                    onClick = onOpen,
                    menu = if (manageable) listOf(
                        "Renommer" to { renaming = entry },
                        "Déplacer vers…" to {
                            val name = entry.str("name") ?: ""
                            val source = entry.str("path") ?: ""
                            val from = root
                            push {
                                val navigator = LocalNavigator.current
                                FolderPickerScreen(roots, from, path, "Déplacer « $name »") { targetRoot, targetPath ->
                                    Session.scope.launch {
                                        val message = try {
                                            Session.noctraSend("POST", "/api/files/move", mapOf("root" to from, "path" to source, "targetRoot" to targetRoot, "targetPath" to targetPath), 120.0)
                                            "« $name » déplacé."
                                        } catch (failure: Exception) {
                                            failure.message ?: "Déplacement impossible."
                                        }
                                        Notices.announce(message)
                                        navigator?.pop()
                                    }
                                }
                            }
                        },
                        "Supprimer · mettre à la corbeille" to { trashing = entry }
                    ) else emptyList()
                )
            }
            if (!loading && items.isEmpty() && failed == null) NoteLine("Ce dossier est vide.", Theme.muted)
            if (truncated) NoteLine("Seuls les 1 000 premiers éléments sont affichés.", Theme.muted)
        }
    }

    renaming?.let { entry ->
        Prompt("Renommer", listOf("Nom"), listOf(entry.str("name") ?: ""), "Renommer", onDismiss = { renaming = null }) { values ->
            val name = values.first().trim()
            if (name.isNotEmpty() && name != entry.str("name")) act("/api/files/rename", mapOf("root" to root, "path" to entry.str("path"), "name" to name), "« ${entry.str("name")} » renommé en « $name ».")
        }
    }
    trashing?.let { entry ->
        Confirm("Mettre à la corbeille ?", entry.str("name"), "Mettre à la corbeille", onDismiss = { trashing = null }) {
            act("/api/files/trash", mapOf("root" to root, "path" to entry.str("path")), "« ${entry.str("name")} » placé dans la corbeille.")
        }
    }
    if (creating) {
        Prompt("Nouveau dossier", listOf("Nom du dossier"), confirm = "Créer", onDismiss = { creating = false }) { values ->
            val name = values.first().trim()
            if (name.isNotEmpty()) act("/api/files/mkdir", mapOf("root" to root, "path" to path, "name" to name), "Dossier « $name » créé.")
        }
    }
    if (emptying) {
        Confirm("Vider Trash définitivement ?", null, "Vider Trash", onDismiss = { emptying = false }) {
            act("/api/files/empty-trash", mapOf("root" to root), "Trash vidé.")
        }
    }
}

private fun fileDetail(entry: JsonMap): String {
    val type = entry.str("type") ?: ""
    val parts = mutableListOf<String>()
    if (type == "directory") parts += "Dossier"
    else {
        val extension = entry.str("extension")?.uppercase().orEmpty()
        parts += if (type == "file") extension.ifEmpty { "Fichier" } else "Lien"
        parts += AdminFormat.bytes(AdminFormat.number(entry["size"]))
    }
    dateLabel(entry["modifiedAt"])?.let { parts += it }
    return parts.joinToString(" · ")
}

// MARK: Doublons

/** Fichiers en double (empreinte SHA-256 confirmée) : une copie conservée, les autres supprimables. */
@Composable
fun DuplicatesScreen() {
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<JsonMap>(mapOf("running" to true, "message" to "Inventaire des médiathèques…")) }
    var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    var confirm by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    var generation by remember { mutableStateOf(0) }
    val running = status.flag("running")
    val groups = status.maps("groups")

    suspend fun start() {
        val token = ++generation
        selected = emptySet()
        failed = null
        status = mapOf("running" to true, "message" to "Inventaire des médiathèques…")
        try {
            Session.noctraSend("POST", "/api/files/duplicates/start", emptyMap<String, Any>(), 20.0)
        } catch (failure: kotlinx.coroutines.CancellationException) {
            throw failure
        } catch (failure: Exception) {
            if (failure.message?.contains("déjà en cours", ignoreCase = true) != true) failed = failure.message
        }
        while (token == generation) {
            runCatching { Session.noctraJSON("/api/files/duplicates/status", 20.0).asMap() }.getOrNull()?.let { status = it }
            if (!status.flag("running")) return
            delay(900)
        }
    }

    LaunchedEffect(Unit) { start() }

    AdminScaffold("Fichiers en double", AuroraPalette.requests, actions = {
        BarButton(Icons.Filled.Refresh, "Revérifier") { if (!running) scope.launch { start() } }
        if (selected.isNotEmpty() && !deleting) BarButton(Icons.Filled.Delete, "Supprimer la sélection") { confirm = true }
    }) {
        section {
            NoteLine(status.str("message") ?: "Préparation de l’analyse…", Theme.ink)
            if (running) {
                val candidates = AdminFormat.number(status["candidateFiles"])
                val value = if (status.str("phase") == "hash" && candidates > 0) (AdminFormat.number(status["hashedFiles"]) / candidates).coerceIn(0.05, 0.99) else 0.05
                Row(Modifier.padding(horizontal = 16.dp)) { Progress(value) }
                NoteLine("${AdminFormat.number(status["scannedFiles"]).toLong()} fichiers inventoriés · ${AdminFormat.number(status["hashedFiles"]).toLong()} empreintes vérifiées", Theme.muted)
                status.str("current")?.let { NoteLine(it, Theme.muted) }
            } else if (groups.isNotEmpty() || status.str("phase") == "complete") {
                AdminRow("Groupes", trailing = { Text("${groups.size}", color = Theme.accent) })
                AdminRow("Doublons", trailing = { Text("${AdminFormat.number(status["duplicateFiles"]).toLong()}", color = Theme.accent) })
                AdminRow("Récupérable", trailing = { Text(AdminFormat.bytes(AdminFormat.number(status["reclaimableBytes"])), color = Theme.accent) })
                if (selected.isNotEmpty()) NoteLine("${selected.size} copie${if (selected.size > 1) "s" else ""} sélectionnée${if (selected.size > 1) "s" else ""} · bouton corbeille en haut pour supprimer.")
            }
            failed?.let { NoteLine(it, Theme.orange) }
            note?.let { NoteLine(it) }
        }
        if (!running) {
            groups.forEachIndexed { groupIndex, group ->
                val keep = (group["keep"] as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value } ?: emptyMap()
                section("${keep.str("name") ?: "Fichier"} · ${AdminFormat.bytes(AdminFormat.number(group["size"]))}", key = "dup-$groupIndex") {
                    AdminRow("Conserver · ${keep.str("rootLabel") ?: keep.str("root") ?: "Média"}", detail = keep.str("path"), icon = Icons.Filled.Verified, tint = Theme.teal)
                    group.maps("duplicates").forEachIndexed { duplicateIndex, duplicate ->
                        RowDivider()
                        val key = "$groupIndex:$duplicateIndex"
                        ToggleLine("${duplicate.str("rootLabel") ?: duplicate.str("root") ?: "Média"} · ${duplicate.str("path") ?: ""}", key in selected) { on ->
                            selected = if (on) selected + key else selected - key
                        }
                    }
                }
            }
            if (groups.isEmpty() && status.str("phase") == "complete") item { NoteLine("Aucun doublon exact détecté dans les médiathèques.", Theme.muted) }
        }
    }

    if (confirm) {
        Confirm("Supprimer définitivement ${selected.size} copie${if (selected.size > 1) "s" else ""} ?", "Une copie de chaque fichier reste conservée.", "Supprimer", onDismiss = { confirm = false }) {
            val payload = selected.mapNotNull { key ->
                val (groupIndex, duplicateIndex) = key.split(":").mapNotNull { it.toIntOrNull() }.takeIf { it.size == 2 } ?: return@mapNotNull null
                val group = groups.getOrNull(groupIndex) ?: return@mapNotNull null
                val keep = group["keep"] as? Map<*, *> ?: return@mapNotNull null
                val duplicate = group.maps("duplicates").getOrNull(duplicateIndex) ?: return@mapNotNull null
                mapOf("root" to duplicate["root"], "path" to duplicate["path"], "keepRoot" to keep["root"], "keepPath" to keep["path"], "size" to group["size"], "hash" to group["hash"])
            }
            if (payload.isEmpty()) return@Confirm
            deleting = true
            scope.launch {
                try {
                    val json = Session.noctraSend("POST", "/api/files/duplicates/delete", mapOf("items" to payload), 180.0).asMap()
                    note = json?.str("message") ?: "${AdminFormat.number(json?.get("removed")).toInt()} doublon(s) supprimé(s)."
                    val errors = json?.maps("errors").orEmpty()
                    errors.firstOrNull()?.let { first -> failed = "${errors.size} fichier(s) non supprimé(s) : ${first.str("message") ?: "vérification refusée"}" }
                    start()
                } catch (failure: Exception) {
                    failed = failure.message
                } finally {
                    deleting = false
                }
            }
        }
    }
}

// MARK: Sagas et séries complètes

/** Collections complètes ou non (sagas de films, séries) : manquants, à venir, à vérifier. */
@Composable
fun CompletenessScreen(kind: String) {
    val scope = rememberCoroutineScope()
    val movies = kind == "movie"
    var status by remember { mutableStateOf<JsonMap>(emptyMap()) }
    var filter by remember { mutableStateOf("attention") }
    var query by remember { mutableStateOf("") }
    var opened by remember { mutableStateOf<Set<String>>(emptySet()) }
    var entries by remember { mutableStateOf<Map<String, List<JsonMap>>>(emptyMap()) }
    var nextOffset by remember { mutableStateOf<Map<String, Int?>>(emptyMap()) }
    var generation by remember { mutableStateOf(0) }
    val running = status.flag("running")
    val all = status.maps("groups").filter { it.str("kind") == kind }
    val shown = all.filter { group ->
        val state = group.str("status") ?: ""
        val upcoming = AdminFormat.number(group["upcomingCount"]) > 0
        val matches = filter == "all" || (if (filter == "attention") state != "complete" || upcoming else state == filter)
        matches && (query.isBlank() || group.str("title")?.contains(query.trim(), ignoreCase = true) == true)
    }

    suspend fun load(restart: Boolean) {
        val token = ++generation
        entries = emptyMap()
        nextOffset = emptyMap()
        opened = emptySet()
        var current = if (restart) null else runCatching { Session.noctraJSON("/api/files/completeness/status", 20.0).asMap() }.getOrNull()
        if (current == null || current.str("phase") == "idle") {
            current = runCatching { Session.noctraSend("POST", "/api/files/completeness/start", emptyMap<String, Any>(), 20.0).asMap() }.getOrNull()
        }
        status = current ?: mapOf("phase" to "failed", "message" to "Vérification indisponible.")
        while (token == generation && status.flag("running")) {
            delay(1500)
            runCatching { Session.noctraJSON("/api/files/completeness/status", 20.0).asMap() }.getOrNull()?.let { status = it }
        }
    }

    suspend fun loadGroup(id: String, offset: Int) {
        val json = runCatching { Session.noctraJSON("/api/files/completeness/group?id=${encode(id)}&offset=$offset", 20.0).asMap() }.getOrNull()
        val rows = json?.maps("entries") ?: emptyList()
        entries = entries + (id to (if (offset == 0) rows else entries[id].orEmpty() + rows))
        nextOffset = nextOffset + (id to json?.int("nextOffset"))
    }

    LaunchedEffect(kind) { load(false) }

    AdminScaffold(if (movies) "Sagas de films" else "Séries", AuroraPalette.requests, actions = {
        BarButton(Icons.Filled.Refresh, "Revérifier") { if (!running) scope.launch { load(true) } }
    }) {
        item { SearchField(query, "Rechercher un titre", Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) { query = it } }
        section {
            if (running) {
                val total = AdminFormat.number(status["total"]).toInt()
                LoadingLine((status.str("message") ?: "Inventaire des collections…") + if (total > 0) " · ${AdminFormat.number(status["processed"]).toInt()}/$total" else "")
            }
            if (status.str("phase") == "failed") NoteLine(status.str("message") ?: "La vérification a échoué.", Theme.orange)
            if (!running && status.str("phase") == "complete") {
                val counts = all.groupingBy { it.str("status") ?: "unknown" }.eachCount()
                val missing = all.sumOf { AdminFormat.number(it["missingCount"]).toInt() }
                AdminRow("Incomplètes", trailing = { Text("${counts["incomplete"] ?: 0}", color = Theme.accent) })
                AdminRow("À jour", trailing = { Text("${counts["complete"] ?: 0}", color = Theme.accent) })
                AdminRow("À vérifier", trailing = { Text("${counts["unknown"] ?: 0}", color = Theme.accent) })
                AdminRow(if (movies) "Films absents" else "Épisodes absents", trailing = { Text("$missing", color = Theme.accent) })
            }
            ChoiceLine("État", listOf("attention" to "Manquants, à venir ou à vérifier", "incomplete" to "Incomplètes", "complete" to "À jour", "unknown" to "À vérifier", "all" to "Toutes"), filter) { filter = it }
        }
        shown.forEach { group ->
            val id = group.str("id") ?: return@forEach
            val missing = AdminFormat.number(group["missingCount"]).toInt()
            val upcoming = AdminFormat.number(group["upcomingCount"]).toInt()
            val state = group.str("status") ?: "unknown"
            val label = (if (missing > 0) "$missing manquant${if (missing > 1) "s" else ""}" else if (state == "unknown") "À vérifier" else "À jour") +
                (if (upcoming > 0) " · $upcoming à venir" else "")
            section(key = "group-$id") {
                AdminRow(
                    group.str("title") ?: "", detail = "${if (movies) "Saga" else "Série"} · ${AdminFormat.number(group["present"]).toInt()}/${AdminFormat.number(group["expected"]).toInt()} présents",
                    onClick = {
                        opened = if (id in opened) opened - id else opened + id
                        if (id !in entries) scope.launch { loadGroup(id, 0) }
                    },
                    trailing = { SeriesStatusTag(state, label) }
                )
                if (id in opened) {
                    group.str("warning")?.let { NoteLine(it, Theme.orange) }
                    val rows = entries[id]
                    if (rows == null) LoadingLine()
                    else {
                        if (rows.isEmpty()) NoteLine("Aucun contenu manquant identifié.", Theme.muted)
                        rows.forEach { row ->
                            RowDivider()
                            val season = AdminFormat.number(row["season"]).toInt()
                            val episode = AdminFormat.number(row["episode"]).toInt()
                            val prefix = if (season > 0) "S%02dE%02d · ".format(season, episode) else ""
                            val states = mapOf("missing" to "Manquant", "upcoming" to "À venir", "undated" to "Date inconnue", "unverified" to "À vérifier")
                            AdminRow(prefix + (row.str("title") ?: ""), detail = dateLabel(row["date"]) ?: "Date non annoncée",
                                trailing = { Text(states[row.str("state")] ?: "À vérifier", color = if (row.str("state") == "missing") Theme.orange else Theme.muted, fontSize = 12.sp) })
                        }
                        nextOffset[id]?.let { next -> ActionLine("Afficher la suite") { scope.launch { loadGroup(id, next) } } }
                    }
                }
            }
        }
        if (!running && shown.isEmpty() && status.str("phase") == "complete") item { NoteLine("Aucun résultat pour ces filtres.", Theme.muted) }
    }
}

// MARK: Choix d'un dossier de destination

/** Parcours des dossiers (racines autorisées) pour choisir où déplacer un élément. */
@Composable
fun FolderPickerScreen(roots: List<JsonMap>, startRoot: String, startPath: String, title: String, onPick: (String, String) -> Unit) {
    val scope = rememberCoroutineScope()
    var root by remember { mutableStateOf(startRoot) }
    var path by remember { mutableStateOf(startPath) }
    var parent by remember { mutableStateOf<String?>(null) }
    var folders by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf<String?>(null) }
    suspend fun open(target: String, at: String) {
        loading = true
        try {
            val json = Session.noctraJSON("/api/files?root=${encode(target)}&path=${encode(at)}", 30.0).asMap()
            root = target
            path = json?.str("path") ?: at
            parent = json?.get("parent") as? String
            folders = json?.maps("items")?.filter { it.str("type") == "directory" } ?: emptyList()
            failed = null
        } catch (failure: kotlinx.coroutines.CancellationException) {
            throw failure
        } catch (failure: Exception) {
            failed = failure.message
        } finally {
            loading = false
        }
    }
    LaunchedEffect(Unit) { open(startRoot, startPath) }
    AdminScaffold(title, AuroraPalette.requests, actions = {
        androidx.compose.material3.TextButton(onClick = { onPick(root, path) }) { Text("Déplacer ici", color = Theme.accent) }
    }) {
        if (roots.size > 1) item {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                roots.forEach { entry ->
                    val id = entry.str("id") ?: ""
                    androidx.compose.material3.TextButton(onClick = { scope.launch { open(id, "") } }, enabled = entry.flag("available")) {
                        Text(entry.str("label") ?: id, color = if (id == root) Theme.accent else Theme.muted)
                    }
                }
            }
        }
        section {
            Text("/$path", color = Theme.muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
            parent?.let { up ->
                RowDivider()
                ActionLine("Dossier parent", Icons.Filled.ArrowUpward) { scope.launch { open(root, up) } }
            }
            if (loading) LoadingLine()
            failed?.let { NoteLine(it, Theme.orange) }
        }
        section("Dossiers") {
            folders.forEachIndexed { index, folder ->
                if (index > 0) RowDivider()
                AdminRow(folder.str("name") ?: "", icon = Icons.Filled.Folder, onClick = { scope.launch { open(root, folder.str("path") ?: "") } })
            }
            if (!loading && folders.isEmpty()) NoteLine("Aucun sous-dossier.", Theme.muted)
        }
    }
}

// MARK: Stockage de la seedbox

/** Stockage de la seedbox en temps réel (administrateurs) : espace utilisé et libre, quota du compte, taille de chaque médiathèque ; actualisé toutes les 10 s. */
@Composable
fun StorageScreen() {
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<JsonMap>(emptyMap()) }
    var loaded by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf<String?>(null) }
    suspend fun load(refresh: Boolean) {
        try {
            data = Session.noctraJSON("/api/files/storage${if (refresh) "?refresh=1" else ""}", 30.0).asMap() ?: emptyMap()
            failed = null
        } catch (failure: kotlinx.coroutines.CancellationException) {
            throw failure
        } catch (failure: Exception) {
            failed = failure.message
        }
        loaded = true
    }
    LaunchedEffect(Unit) {
        var first = true
        while (true) {
            load(first)
            first = false
            delay(10_000)
        }
    }
    val capacity = data["capacity"] as? Map<*, *>
    AdminScaffold("Stockage", AuroraPalette.requests, actions = { BarButton(Icons.Filled.Refresh, "Actualiser") { scope.launch { load(true) } } }) {
        section(footer = "Actualisé toutes les 10 secondes.") {
            if (capacity != null) {
                val used = AdminFormat.number(capacity["used"])
                val total = AdminFormat.number(capacity["total"])
                val ratio = if (total > 0) (used / total).coerceIn(0.0, 1.0) else 0.0
                androidx.compose.foundation.layout.Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = androidx.compose.ui.Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(AdminFormat.bytes(used), color = Theme.ink, style = Theme.display(28))
                        Text("sur ${AdminFormat.bytes(total)}", color = Theme.muted, modifier = Modifier.weight(1f))
                        Text("${(ratio * 100).toInt()} %", color = if (ratio > 0.9) Theme.orange else Theme.accent, fontSize = 16.sp)
                    }
                    Progress(ratio)
                    Text("${AdminFormat.bytes(AdminFormat.number(capacity["free"]))} libres · ${if (capacity["source"] == "quota") "quota du compte" else "disque"}", color = Theme.muted, fontSize = 12.sp)
                }
            } else if (!loaded) LoadingLine()
            else NoteLine("Stockage indisponible sur ce serveur.", Theme.muted)
            failed?.let { NoteLine(it, Theme.orange) }
        }
        val disk = data["disk"] as? Map<*, *>
        if (disk != null && data["quota"] is Map<*, *>) section("Disque de la seedbox") {
            AdminRow("Utilisé", trailing = { Text(AdminFormat.bytes(AdminFormat.number(disk["used"])), color = Theme.accent) })
            AdminRow("Libre", trailing = { Text(AdminFormat.bytes(AdminFormat.number(disk["free"])), color = Theme.accent) })
            AdminRow("Total", trailing = { Text(AdminFormat.bytes(AdminFormat.number(disk["total"])), color = Theme.accent) })
        }
        val libraries = data.maps("libraries")
        val computing = data.flag("librariesComputing")
        section("Médiathèques", footer = if (computing) "Recalcul des tailles en cours (quelques minutes pour de grosses médiathèques)." else null) {
            libraries.forEachIndexed { index, library ->
                if (index > 0) RowDivider()
                AdminRow(library.str("label") ?: "", trailing = { Text(AdminFormat.bytes(AdminFormat.number(library["bytes"])), color = Theme.accent) })
            }
            if (libraries.isEmpty()) NoteLine(if (computing) "Calcul en cours…" else "Tailles non disponibles.", Theme.muted)
        }
    }
}
