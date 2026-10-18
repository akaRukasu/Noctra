package com.noctra.mobile.admin

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.noctra.mobile.ui.AuroraBackground
import com.noctra.mobile.ui.MessageView
import com.noctra.mobile.ui.TopBar
import java.util.Locale

/** Formats communs de l'administration (tailles, durées). */
object AdminFormat {
    fun bytes(value: Double): String {
        if (value <= 0) return "0 o"
        val units = listOf("o", "Ko", "Mo", "Go", "To", "Po")
        var size = value
        var unit = 0
        while (size >= 1024 && unit < units.size - 1) { size /= 1024; unit += 1 }
        return if (unit == 0) "${size.toInt()} o" else String.format(Locale.FRANCE, if (size >= 100) "%.0f %s" else "%.1f %s", size, units[unit])
    }
}

enum class ArrKind(val label: String) { Radarr("Radarr"), Sonarr("Sonarr") }

@Composable
private fun Pending(title: String) {
    Box(Modifier.fillMaxSize()) {
        AuroraBackground()
        Column(Modifier.fillMaxSize()) {
            TopBar(title)
            MessageView(Icons.Filled.Build, "Chargement…")
        }
    }
}

@Composable fun AdminHomeScreen() = Pending("Tableau de bord")
@Composable fun UsersAdminScreen() = Pending("Utilisateurs")
@Composable fun DownloadsScreen() = Pending("Téléchargements")
@Composable fun ArrHubScreen(kind: ArrKind) = Pending(kind.label)
@Composable fun TrackerSearchScreen(mediaType: String, tmdbId: Int, title: String, year: String?) = Pending("Recherche interactive")
