package com.noctra.mobile.admin

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.ViewModule
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.map
import com.noctra.mobile.core.str
import com.noctra.mobile.core.strings
import com.noctra.mobile.ui.LocalNavigator
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.rememberPush
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val libraryTypes: Map<String, Pair<String, ImageVector>> = mapOf(
    "movies" to ("Films" to Icons.Filled.Movie), "tvshows" to ("Séries" to Icons.Filled.Tv), "music" to ("Musique" to Icons.Filled.MusicNote),
    "musicvideos" to ("Clips" to Icons.Filled.MusicNote), "homevideos" to ("Vidéos et photos" to Icons.Filled.Photo), "boxsets" to ("Collections" to Icons.Filled.VideoLibrary),
    "books" to ("Livres" to Icons.Filled.Book), "mixed" to ("Mixte" to Icons.Filled.ViewModule)
)

/** Médiathèques du serveur : analyse, réglages, dossiers, création. */
@Composable
fun LibrariesAdminScreen() {
    val scope = rememberCoroutineScope()
    val push = rememberPush()
    var folders by remember { mutableStateOf<List<JsonMap>>(emptyList()) }
    var note by remember { mutableStateOf<String?>(null) }
    var adding by remember { mutableStateOf(false) }
    suspend fun load() { runCatching { jellyfin("/Library/VirtualFolders") }.getOrNull()?.let { folders = it.asMaps() } }
    LaunchedEffect(Unit) { while (true) { load(); delay(6000) } }
    AdminScaffold("Médiathèques", actions = { BarButton(Icons.Filled.Add, "Nouvelle médiathèque") { adding = true } }) {
        section {
            ActionLine("Analyser toutes les médiathèques", Icons.Filled.Sync) {
                scope.launch { note = runCatching { Session.data("POST", "/Library/Refresh"); "Analyse de toutes les médiathèques lancée." }.getOrElse { it.message } }
            }
            note?.let { NoteLine(it) }
        }
        section("Médiathèques") {
            if (folders.isEmpty()) LoadingLine()
            folders.forEachIndexed { index, folder ->
                if (index > 0) RowDivider()
                val type = (folder.str("CollectionType") ?: "mixed").lowercase()
                val info = libraryTypes[type] ?: ("Mixte" to Icons.Filled.Folder)
                AdminRow(folder.str("Name") ?: "", icon = info.second, detail = "${info.first} · ${folder.strings("Locations").size} dossier(s)",
                    onClick = { push { LibraryAdminDetail(folder) } },
                    trailing = if (folder.str("RefreshStatus") == "Active") ({ Text("${AdminFormat.number(folder["RefreshProgress"]).toInt()} %", color = Theme.lilac, fontSize = 12.sp) }) else null)
            }
        }
    }
    if (adding) NewLibrarySheet(onDismiss = { adding = false }) { scope.launch { load() } }
}

private val optionFields = listOf(
    "EnableRealtimeMonitor" to "Surveiller les nouveaux fichiers",
    "AutomaticallyAddToCollection" to "Ajouter aux collections automatiquement",
    "EnableChapterImageExtraction" to "Images des chapitres",
    "ExtractChapterImagesDuringLibraryScan" to "Images des chapitres pendant l’analyse",
    "EnableTrickplayImageExtraction" to "Aperçus de la barre de lecture",
    "SaveLocalMetadata" to "Enregistrer les illustrations dans les dossiers",
    "SaveSubtitlesWithMedia" to "Enregistrer les sous-titres avec les fichiers",
    "EnableEmbeddedTitles" to "Titres intégrés aux fichiers",
    "EnableEmbeddedEpisodeInfos" to "Infos d’épisodes intégrées aux fichiers",
    "EnablePhotos" to "Afficher les photos"
)

/** Une médiathèque : nom, dossiers, analyse, options, suppression. */
@Composable
fun LibraryAdminDetail(folder: JsonMap) {
    val scope = rememberCoroutineScope()
    val navigator = LocalNavigator.current
    val folderName = folder.str("Name") ?: ""
    val itemId = folder.str("ItemId") ?: ""
    var name by remember { mutableStateOf(folderName) }
    var locations by remember { mutableStateOf(folder.strings("Locations")) }
    var options by remember { mutableStateOf(folder.map("LibraryOptions") ?: emptyMap()) }
    var optionsDirty by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var confirmReplace by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    fun perform(success: String, work: suspend () -> Unit) {
        scope.launch { note = runCatching { work(); success }.getOrElse { it.message } }
    }
    fun refresh(replace: Boolean) = perform(if (replace) "Actualisation complète lancée." else "Analyse lancée.") {
        Session.data("POST", "/Items/$itemId/Refresh", mapOf(
            "Recursive" to "true", "MetadataRefreshMode" to if (replace) "FullRefresh" else "Default", "ImageRefreshMode" to if (replace) "FullRefresh" else "Default",
            "ReplaceAllMetadata" to replace.toString(), "ReplaceAllImages" to replace.toString()
        ))
    }
    AdminScaffold(folderName) {
        section("Nom") {
            FieldLine("Nom", name) { name = it }
            ActionLine("Renommer", enabled = name.isNotBlank() && name != folderName) {
                perform("Médiathèque renommée.") { Session.data("POST", "/Library/VirtualFolders/Name", mapOf("name" to folderName, "newName" to name.trim(), "refreshLibrary" to "true")) }
            }
        }
        section("Dossiers", "Menu ⋮ d’un dossier pour le retirer.") {
            locations.forEach { path ->
                AdminRow(path, icon = Icons.Filled.Folder, menu = listOf("Retirer" to {
                    perform("Dossier retiré.") {
                        Session.data("DELETE", "/Library/VirtualFolders/Paths", mapOf("name" to folderName, "path" to path, "refreshLibrary" to "true"))
                        locations = locations - path
                    }
                }))
                RowDivider()
            }
            ActionLine("Ajouter un dossier", Icons.Filled.CreateNewFolder) { picking = true }
        }
        section("Analyse") {
            ActionLine("Analyser cette médiathèque", Icons.Filled.Refresh) { refresh(false) }
            ActionLine("Remplacer toutes les métadonnées", Icons.Filled.Sync) { confirmReplace = true }
        }
        val fields = optionFields.filter { options.containsKey(it.first) }
        if (fields.isNotEmpty()) section("Options") {
            fields.forEach { (key, label) -> ToggleLine(label, options[key] == true) { options = options + (key to it); optionsDirty = true } }
            ActionLine("Enregistrer les options", enabled = optionsDirty) {
                perform("Options enregistrées.") {
                    Session.data("POST", "/Library/VirtualFolders/LibraryOptions", json = mapOf("Id" to itemId, "LibraryOptions" to options))
                    optionsDirty = false
                }
            }
        }
        note?.let { text -> item { NoteLine(text) } }
        section(footer = "Les fichiers ne sont pas supprimés, seulement la médiathèque.") {
            ActionLine("Supprimer la médiathèque", destructive = true) { confirmDelete = true }
        }
    }
    if (picking) FolderPicker(onDismiss = { picking = false }) { path ->
        perform("Dossier ajouté ; analyse lancée.") {
            Session.data("POST", "/Library/VirtualFolders/Paths", mapOf("refreshLibrary" to "true"), json = mapOf("Name" to folderName, "PathInfo" to mapOf("Path" to path)))
            locations = locations + path
        }
    }
    if (confirmDelete) Confirm("Supprimer « $folderName » ?", null, "Supprimer", onDismiss = { confirmDelete = false }) {
        scope.launch {
            runCatching { Session.data("DELETE", "/Library/VirtualFolders", mapOf("name" to folderName, "refreshLibrary" to "true")) }
                .onSuccess { navigator?.pop() }.onFailure { note = it.message }
        }
    }
    if (confirmReplace) Confirm("Remplacer toutes les métadonnées ?", "Les fiches et les images seront téléchargées à nouveau. Cela peut prendre longtemps.", "Remplacer", onDismiss = { confirmReplace = false }) { refresh(true) }
}

/** Nouvelle médiathèque : nom, type, dossiers. */
@Composable
private fun NewLibrarySheet(onDismiss: () -> Unit, created: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("movies") }
    var paths by remember { mutableStateOf<List<String>>(emptyList()) }
    var picking by remember { mutableStateOf(false) }
    var working by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    NoctraSheet(onDismiss) {
        LazyColumn(Modifier.fillMaxWidth().padding(bottom = 20.dp)) {
            item { Text("Nouvelle médiathèque", style = Theme.display(20), color = Theme.ink, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) }
            section {
                FieldLine("Nom", name) { name = it }
                ChoiceLine("Type", listOf("movies" to "Films", "tvshows" to "Séries", "music" to "Musique", "musicvideos" to "Clips", "homevideos" to "Vidéos et photos", "books" to "Livres", "mixed" to "Mixte"), type) { type = it }
            }
            section("Dossiers") {
                paths.forEach { AdminRow(it, icon = Icons.Filled.Folder); RowDivider() }
                ActionLine("Ajouter un dossier", Icons.Filled.CreateNewFolder) { picking = true }
            }
            problem?.let { text -> item { NoteLine(text, Theme.orange) } }
            section {
                ActionLine("Créer", Icons.Filled.Add, enabled = name.isNotBlank() && paths.isNotEmpty(), busy = working) {
                    working = true
                    scope.launch {
                        val title = name.trim()
                        try {
                            Session.data("POST", "/Library/VirtualFolders", mapOf("name" to title, "collectionType" to if (type == "mixed") null else type, "refreshLibrary" to "false"),
                                json = mapOf("LibraryOptions" to mapOf("EnableRealtimeMonitor" to true)))
                            for (path in paths) {
                                Session.data("POST", "/Library/VirtualFolders/Paths", mapOf("refreshLibrary" to if (path == paths.last()) "true" else "false"), json = mapOf("Name" to title, "PathInfo" to mapOf("Path" to path)))
                            }
                            created()
                            onDismiss()
                        } catch (failure: Exception) {
                            problem = failure.message
                        } finally {
                            working = false
                        }
                    }
                }
            }
        }
    }
    if (picking) FolderPicker(onDismiss = { picking = false }) { path -> if (path !in paths) paths = paths + path }
}

/** Dossiers du serveur, pour choisir l'emplacement d'une médiathèque (disques, puis sous-dossiers). */
@Composable
fun FolderPicker(onDismiss: () -> Unit, chosen: (String) -> Unit) {
    var trail by remember { mutableStateOf<List<String>>(emptyList()) }
    var entries by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val path = trail.lastOrNull()
    LaunchedEffect(path) {
        loading = true
        val json = runCatching {
            if (path != null) jellyfin("/Environment/DirectoryContents", mapOf("path" to path, "includeDirectories" to "true", "includeFiles" to "false"))
            else jellyfin("/Environment/Drives")
        }.getOrNull()
        entries = json.asMaps().mapNotNull { item -> item.str("Path")?.let { (item.str("Name") ?: it) to it } }.sortedBy { it.first.lowercase() }
        loading = false
    }
    NoctraSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.85f)) {
            Text(path?.substringAfterLast('/')?.ifEmpty { path } ?: "Disques", style = Theme.display(20), color = Theme.ink, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            if (path != null) {
                Text(path, color = Theme.muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(horizontal = 20.dp))
                ActionLine("Choisir ce dossier", Icons.Filled.CheckCircle) { chosen(path); onDismiss() }
                ActionLine("Dossier parent", Icons.AutoMirrored.Filled.ArrowBack) { trail = trail.dropLast(1) }
            }
            if (loading) LoadingLine()
            if (!loading && entries.isEmpty()) NoteLine("Aucun sous-dossier.", Theme.muted)
            LazyColumn(Modifier.fillMaxWidth()) {
                items(entries) { (label, value) ->
                    AdminRow(label, icon = if (path == null) Icons.Filled.Storage else Icons.Filled.Folder, onClick = { trail = trail + value })
                }
            }
        }
    }
}
