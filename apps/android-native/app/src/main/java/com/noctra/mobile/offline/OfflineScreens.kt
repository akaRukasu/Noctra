package com.noctra.mobile.offline

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SdStorage
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.admin.AdminFormat
import com.noctra.mobile.core.BaseItem
import com.noctra.mobile.core.clock
import com.noctra.mobile.play.PlaybackManager
import com.noctra.mobile.ui.AuroraBackground
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.ProgressLine
import com.noctra.mobile.ui.RemoteImage
import com.noctra.mobile.ui.SectionTitle
import com.noctra.mobile.ui.SettingGroup
import com.noctra.mobile.ui.SettingRow
import com.noctra.mobile.ui.SheetColumn
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.TopBar
import com.noctra.mobile.ui.auroraPanel
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass

/** Bouton « Télécharger » d'une fiche : qualité au choix, avancement, lecture hors ligne. */
@Composable
fun OfflineButton(item: BaseItem, audioIndex: Int?) {
    var choosing by remember { mutableStateOf(false) }
    var managing by remember { mutableStateOf(false) }
    val entry = OfflineStore.entry(item.id)
    IconButton(
        onClick = { if (entry != null && entry.state != OfflineState.failed) managing = true else choosing = true },
        modifier = Modifier.size(50.dp).glass(CircleShape).focusRing(CircleShape)
    ) {
        when (entry?.state) {
            OfflineState.done -> Icon(Icons.Filled.CheckCircle, contentDescription = "Téléchargé", tint = Theme.teal)
            OfflineState.downloading, OfflineState.queued, OfflineState.paused -> Box(contentAlignment = Alignment.Center) {
                CircularProgressIndicator(progress = { maxOf(0.03f, entry.progress.toFloat()) }, modifier = Modifier.size(24.dp), color = Theme.lilac, trackColor = Color.White.copy(alpha = 0.2f), strokeWidth = 3.dp, strokeCap = StrokeCap.Round)
                Icon(if (entry.state == OfflineState.paused) Icons.Filled.Pause else Icons.Filled.ArrowDownward, contentDescription = null, tint = Theme.ink, modifier = Modifier.size(12.dp))
            }
            OfflineState.failed -> Icon(Icons.Filled.ErrorOutline, contentDescription = "Échec", tint = Theme.orange)
            null -> Icon(Icons.Filled.DownloadForOffline, contentDescription = "Télécharger", tint = Theme.ink)
        }
    }
    if (choosing) NoctraSheet({ choosing = false }, full = false) {
        SheetColumn("Télécharger pour regarder hors ligne") {
            Text("Originale : fichier d’origine. Les autres qualités prennent moins de place.", color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            SettingGroup {
                OfflineQuality.entries.forEach { quality ->
                    SettingRow(quality.label + if (quality == OfflineStore.defaultQuality) " ✓" else "", value = quality.detail, onClick = {
                        choosing = false
                        OfflineStore.download(item, quality, audioIndex)
                    })
                }
            }
        }
    }
    if (managing && entry != null) NoctraSheet({ managing = false }, full = false) {
        SheetColumn(entry.heading) {
            SettingGroup {
                when (entry.state) {
                    OfflineState.done -> SettingRow("Lire hors ligne", icon = Icons.Filled.PlayArrow, onClick = { managing = false; PlaybackManager.playOffline(entry) })
                    OfflineState.paused -> SettingRow("Reprendre le téléchargement", icon = Icons.Filled.PlayArrow, onClick = { managing = false; OfflineStore.resume(entry.id) })
                    else -> SettingRow("Mettre en pause", icon = Icons.Filled.Pause, onClick = { managing = false; OfflineStore.pause(entry.id) })
                }
                SettingRow(if (entry.state == OfflineState.done) "Supprimer de l’appareil" else "Annuler le téléchargement", icon = Icons.Filled.DeleteSweep, tint = Theme.red, onClick = { managing = false; OfflineStore.delete(entry.id) })
            }
        }
    }
}

/** « Sur cet appareil » : téléchargements en cours et titres lisibles sans connexion. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OfflineLibraryScreen() {
    var confirmClear by remember { mutableStateOf(false) }
    var choosingSubtitle by remember { mutableStateOf<OfflineEntry?>(null) }
    val movies = OfflineStore.downloaded.filter { !it.isEpisode }.sortedBy { it.title.lowercase() }
    val series = OfflineStore.downloaded.filter { it.isEpisode }.groupBy { it.seriesName ?: "Séries" }.toSortedMap(compareBy { it.lowercase() })
        .mapValues { (_, list) -> list.sortedWith(compareBy({ it.seasonNumber ?: 0 }, { it.episodeNumber ?: 0 })) }

    fun play(entry: OfflineEntry, subtitle: Int) {
        val current = OfflineStore.entry(entry.id) ?: return
        PlaybackManager.playOffline(current, subtitle)
    }

    Box(Modifier.fillMaxSize()) {
        AuroraBackground()
        Column(Modifier.fillMaxSize()) {
            TopBar("Sur cet appareil") {
                if (OfflineStore.entries.isNotEmpty()) IconButton(onClick = { confirmClear = true }, modifier = Modifier.glass(CircleShape).focusRing(CircleShape)) {
                    Icon(Icons.Filled.DeleteSweep, contentDescription = "Tout supprimer", tint = Theme.ink)
                }
            }
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    Row(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Stat(Icons.Filled.Storage, AdminFormat.bytes(OfflineStore.usedBytes.toDouble()), "utilisés", Theme.lilac, Modifier.weight(1f))
                        Stat(Icons.Filled.SdStorage, AdminFormat.bytes(OfflineStore.freeBytes.toDouble()), "libres", Theme.teal, Modifier.weight(1f))
                    }
                    if (OfflineStore.wifiOnly && OfflineStore.onMeteredNetwork && OfflineStore.active.any { it.state == OfflineState.queued || it.state == OfflineState.downloading }) {
                        Text("En attente du Wi-Fi (réglable dans le compte).", color = Theme.orange, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                    }
                    if (OfflineStore.offline) Text("Hors connexion : seuls les titres téléchargés sont disponibles.", color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                }
                if (OfflineStore.active.isNotEmpty()) {
                    item { SectionTitle("En cours", Modifier.padding(horizontal = 20.dp, vertical = 6.dp)) }
                    items(OfflineStore.active) { entry -> ActiveRow(entry) }
                }
                if (movies.isNotEmpty()) {
                    item { SectionTitle("Films", Modifier.padding(horizontal = 20.dp, vertical = 6.dp)) }
                    items(movies, key = { "m-" + it.id }) { entry -> DoneRow(entry, { choosingSubtitle = entry }) { play(entry, it) } }
                }
                series.forEach { (name, episodes) ->
                    item(key = "s-$name") { SectionTitle(name, Modifier.padding(horizontal = 20.dp, vertical = 6.dp)) }
                    items(episodes, key = { "e-" + it.id }) { entry -> DoneRow(entry, { choosingSubtitle = entry }) { play(entry, it) } }
                }
                if (OfflineStore.entries.isEmpty()) item {
                    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Filled.DownloadForOffline, contentDescription = null, tint = Theme.lilac, modifier = Modifier.size(48.dp))
                        Text("Aucun téléchargement", style = Theme.display(20), color = Theme.ink)
                        Text("Touchez ↓ dans la fiche d’un film ou d’une saison pour le garder sur l’appareil et le regarder sans connexion.", color = Theme.muted, textAlign = TextAlign.Center)
                    }
                }
            }
        }
    }
    if (confirmClear) AlertDialog(
        onDismissRequest = { confirmClear = false },
        confirmButton = { TextButton(onClick = { confirmClear = false; OfflineStore.deleteAll() }) { Text("Tout supprimer", color = Theme.red) } },
        dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Annuler") } },
        title = { Text("Supprimer tous les téléchargements ?") }
    )
    choosingSubtitle?.let { entry ->
        NoctraSheet({ choosingSubtitle = null }, full = false) {
            SheetColumn("Sous-titres") {
                SettingGroup {
                    SettingRow("Sans sous-titres", onClick = { choosingSubtitle = null; OfflineStore.setSubtitle(entry.id, -1); play(entry, -1) })
                    entry.subtitles.forEach { subtitle ->
                        SettingRow(subtitle.label + if (entry.subtitleChoice == subtitle.index) " ✓" else "", onClick = {
                            choosingSubtitle = null
                            OfflineStore.setSubtitle(entry.id, subtitle.index)
                            play(entry, subtitle.index)
                        })
                    }
                }
            }
        }
    }
}

@Composable
private fun Stat(icon: androidx.compose.ui.graphics.vector.ImageVector, value: String, caption: String, color: Color, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(color.copy(alpha = 0.16f)).padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
            Text(value, color = Theme.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        }
        Text(caption, color = Theme.muted, fontSize = 11.sp)
    }
}

private fun status(entry: OfflineEntry): String = when (entry.state) {
    OfflineState.queued -> if (OfflineStore.wifiOnly && OfflineStore.onMeteredNetwork) "En attente du Wi-Fi" else "En attente"
    OfflineState.paused -> "En pause · touchez pour reprendre"
    OfflineState.failed -> entry.error ?: "Échec · touchez pour réessayer"
    OfflineState.downloading -> {
        val size = if (entry.expected > 0) "${AdminFormat.bytes(entry.written.toDouble())} / ${if (entry.quality != OfflineQuality.Original) "≈ " else ""}${AdminFormat.bytes(entry.expected.toDouble())}" else AdminFormat.bytes(entry.written.toDouble())
        "${(entry.progress * 100).toInt()} % · $size"
    }
    OfflineState.done -> ""
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ActiveRow(entry: OfflineEntry) {
    Row(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().auroraPanel(18.dp).focusRing(RoundedCornerShape(18.dp))
            .combinedClickable(onClick = {
                when (entry.state) {
                    OfflineState.paused, OfflineState.failed -> OfflineStore.resume(entry.id)
                    OfflineState.downloading -> OfflineStore.pause(entry.id)
                    else -> {}
                }
            }, onLongClick = { OfflineStore.delete(entry.id) }).padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically
    ) {
        RemoteImage(OfflineStore.posterFile(entry)?.let { "file://" + it.absolutePath }, Modifier.size(50.dp, 75.dp).clip(RoundedCornerShape(10.dp)))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(entry.playerTitle, color = Theme.ink, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            ProgressLine(entry.progress)
            Text(status(entry), color = if (entry.state == OfflineState.failed) Theme.orange else Theme.muted, fontSize = 12.sp, maxLines = 2)
        }
        IconButton(onClick = { OfflineStore.delete(entry.id) }) { Icon(Icons.Filled.DeleteSweep, contentDescription = "Annuler", tint = Theme.muted) }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DoneRow(entry: OfflineEntry, chooseSubtitle: () -> Unit, play: (Int) -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Row(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().auroraPanel(18.dp).focusRing(RoundedCornerShape(18.dp))
            .combinedClickable(onClick = {
                if (entry.subtitles.size > 1 || (entry.subtitles.size == 1 && entry.subtitleChoice == null)) chooseSubtitle() else play(entry.subtitleChoice ?: -1)
            }, onLongClick = { menu = true }).padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically
    ) {
        val image = (if (entry.isEpisode) OfflineStore.backdropFile(entry) else OfflineStore.posterFile(entry))?.let { "file://" + it.absolutePath }
        Box(Modifier.size(if (entry.isEpisode) 96.dp else 50.dp, if (entry.isEpisode) 54.dp else 75.dp).clip(RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
            RemoteImage(image, Modifier.fillMaxSize())
            Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp).glass(CircleShape, Color(0x66000000)).padding(5.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(if (entry.isEpisode) listOfNotNull(entry.episodeLabel, entry.title).filter { it.isNotEmpty() }.joinToString(" · ") else entry.title, color = Theme.ink, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(entry.year?.toString(), if (entry.duration > 0) clock(entry.duration) else null, AdminFormat.bytes(entry.written.toDouble()),
                if (entry.quality == OfflineQuality.Original) null else entry.quality.label).joinToString(" · "), color = Theme.muted, fontSize = 12.sp, maxLines = 1)
            entry.resumeProgress?.let { ProgressLine(it, Modifier.widthIn(max = 160.dp)) }
        }
        if (entry.played) Icon(Icons.Filled.CheckCircle, contentDescription = "Vu", tint = Theme.accent, modifier = Modifier.size(16.dp))
    }
    if (menu) NoctraSheet({ menu = false }, full = false) {
        SheetColumn(entry.playerTitle) {
            SettingGroup {
                SettingRow(if (entry.resumeProgress != null) "Reprendre" else "Lecture", icon = Icons.Filled.PlayArrow, onClick = { menu = false; play(entry.subtitleChoice ?: -1) })
                if (entry.resumeProgress != null) SettingRow("Lire depuis le début", onClick = { menu = false; OfflineStore.recordPosition(entry.id, 0.0, entry.duration); play(entry.subtitleChoice ?: -1) })
                if (entry.subtitles.isNotEmpty()) SettingRow("Sous-titres…", onClick = { menu = false; chooseSubtitle() })
                SettingRow("Supprimer de l’appareil", icon = Icons.Filled.DeleteSweep, tint = Theme.red, onClick = { menu = false; OfflineStore.delete(entry.id) })
            }
        }
    }
}

