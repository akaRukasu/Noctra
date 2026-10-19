package com.noctra.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.BuildConfig
import com.noctra.mobile.admin.AdminFormat
import com.noctra.mobile.admin.AdminHomeScreen
import com.noctra.mobile.admin.ArrHubScreen
import com.noctra.mobile.admin.ArrKind
import com.noctra.mobile.admin.DownloadsScreen
import com.noctra.mobile.admin.UsersAdminScreen
import com.noctra.mobile.cast.CastButton
import com.noctra.mobile.core.Prefs
import com.noctra.mobile.core.Session
import com.noctra.mobile.live.LiveLauncher
import com.noctra.mobile.offline.OfflineLibraryScreen
import com.noctra.mobile.offline.OfflineQuality
import com.noctra.mobile.offline.OfflineStore
import com.noctra.mobile.play.SubtitleSize
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import androidx.compose.material.icons.filled.Folder
import com.noctra.mobile.admin.FileExplorerScreen
import androidx.compose.material.icons.filled.Storage
import com.noctra.mobile.admin.StorageScreen

/** Boutons de la barre du haut : diffusion et compte. */
@Composable
fun AccountButton() {
    var showing by remember { mutableStateOf(false) }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        CastButton()
        AccountAvatar(34, 16, Modifier.focusRing(CircleShape).clickable { showing = true })
    }
    if (showing) AccountSheet { showing = false }
}

/** Photo de profil Jellyfin dans un rond ; initiale du nom tant qu'elle charge ou sans photo. */
@Composable
fun AccountAvatar(size: Int, letterSize: Int, modifier: Modifier = Modifier) {
    Box(modifier.size(size.dp).clip(CircleShape).background(Theme.gradient), contentAlignment = Alignment.Center) {
        Text((Session.userName ?: "?").take(1).uppercase(), color = Theme.onAccent, fontWeight = FontWeight.Bold, fontSize = letterSize.sp)
        RemoteImage(Session.avatarURL(size * 3), Modifier.matchParentSize(), placeholder = false)
    }
}

@Composable
fun AccountSheet(dismiss: () -> Unit) {
    val push = rememberPush()
    val scope = rememberCoroutineScope()
    var refreshNote by remember { mutableStateOf<String?>(null) }
    var subtitleSize by remember { mutableStateOf(SubtitleSize.current) }
    var picker by remember { mutableStateOf(LiveLauncher.showPicker) }
    var wifiOnly by remember { mutableStateOf(OfflineStore.wifiOnly) }
    var quality by remember { mutableStateOf(OfflineStore.defaultQuality) }
    fun open(content: @Composable () -> Unit) { dismiss(); push(content) }

    NoctraSheet(dismiss) {
        SheetColumn("Compte") {
            Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                AccountAvatar(52, 22)
                Column {
                    Text(Session.userName ?: "—", style = Theme.display(20), color = Theme.ink)
                    Text(if (Session.isAdmin) "Administrateur" else "Utilisateur", color = Theme.muted, fontSize = 12.sp)
                }
            }
            SettingGroup {
                SettingRow("Serveur", value = Session.jellyfinBase.toHttpUrlOrNull()?.host ?: "—")
                SettingRow("TV en direct", value = if (Session.hasNoctra) "Disponible" else "Indisponible")
            }
            SettingGroup("Lecture") {
                ChoiceRow("Taille des sous-titres", SubtitleSize.entries.map { it.label }, subtitleSize.ordinal) {
                    subtitleSize = SubtitleSize.entries[it]
                    SubtitleSize.current = subtitleSize
                }
            }
            SettingGroup("TV en direct", "Les serveurs sont classés par fiabilité et testés ; le meilleur se lance tout seul après quelques secondes. Désactivé : il se lance directement.") {
                ToggleRow("Choisir le serveur à chaque chaîne", picker) { picker = it; LiveLauncher.showPicker = it }
            }
            SettingGroup("Téléchargements hors ligne", "Les téléchargements continuent appli fermée. Avec « Wi-Fi uniquement », ils attendent un réseau Wi-Fi.") {
                SettingRow("Sur cet appareil", value = AdminFormat.bytes(OfflineStore.usedBytes.toDouble()), icon = Icons.Filled.DownloadForOffline, onClick = { open { OfflineLibraryScreen() } })
                ChoiceRow("Qualité par défaut", OfflineQuality.entries.map { it.label }, quality.ordinal) {
                    quality = OfflineQuality.entries[it]
                    OfflineStore.defaultQuality = quality
                }
                ToggleRow("Wi-Fi uniquement", wifiOnly) { wifiOnly = it; OfflineStore.wifiOnly = it }
            }
            if (Session.isAdmin) {
                SettingGroup("Administration", refreshNote) {
                    SettingRow("Tableau de bord", icon = Icons.Filled.Speed, onClick = { open { AdminHomeScreen() } })
                    SettingRow("Utilisateurs", icon = Icons.Filled.Group, onClick = { open { UsersAdminScreen() } })
                    if (Session.hasNoctra) {
                        SettingRow("Téléchargements", icon = Icons.Filled.Download, onClick = { open { DownloadsScreen() } })
                        SettingRow("Radarr · films", icon = Icons.Filled.Movie, onClick = { open { ArrHubScreen(ArrKind.Radarr) } })
                        SettingRow("Sonarr · séries", icon = Icons.Filled.Tv, onClick = { open { ArrHubScreen(ArrKind.Sonarr) } })
                        SettingRow("Explorateur média", icon = Icons.Filled.Folder, onClick = { open { FileExplorerScreen() } })
                        SettingRow("Stockage de la seedbox", icon = Icons.Filled.Storage, onClick = { open { StorageScreen() } })
                    }
                    SettingRow("Actualiser les médiathèques", icon = Icons.Filled.Sync, onClick = {
                        scope.launch {
                            refreshNote = try {
                                if (Session.hasNoctra) Session.noctraSend("POST", "/api/libraries/refresh") else Session.data("POST", "/Library/Refresh")
                                "Actualisation des médiathèques lancée."
                            } catch (error: Exception) { error.message }
                        }
                    })
                }
            }
            SettingGroup {
                SettingRow("Se déconnecter", icon = Icons.AutoMirrored.Filled.Logout, tint = Theme.red, onClick = { dismiss(); Session.signOut() })
            }
            SettingGroup { SettingRow("Version", value = BuildConfig.VERSION_NAME) }
        }
    }
}

/** Interrupteur d'une ligne de réglage. */
@Composable
fun ToggleRow(title: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    SettingRow(title, onClick = { onChange(!checked) }, trailing = {
        Switch(checked = checked, onCheckedChange = onChange, colors = SwitchDefaults.colors(checkedTrackColor = Theme.lilac, checkedThumbColor = Theme.onAccent))
    })
}

/** Choix dans une liste (menu déroulant). */
@Composable
fun ChoiceRow(title: String, options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        SettingRow(title, value = options.getOrNull(selected), onClick = { open = true })
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.align(Alignment.CenterEnd)) {
            options.forEachIndexed { index, option ->
                DropdownMenuItem(text = { Text((if (index == selected) "✓ " else "") + option) }, onClick = { open = false; onSelect(index) })
            }
        }
    }
}
