package com.noctra.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.core.str
import kotlinx.coroutines.launch

/** État d'une série de la médiathèque : complète, épisodes manquants, en cours, à vérifier (comme sur le site). */
data class SeriesStatus(val state: String, val label: String, val detail: String)

/** États demandés au serveur (/api/library/series-status), deux à la fois, gardés en mémoire. */
object SeriesStatusStore {
    val results = mutableStateMapOf<String, SeriesStatus>()
    private val queue = ArrayDeque<String>()
    private val pending = mutableSetOf<String>()
    private var active = 0

    fun request(id: String) {
        if (!Session.hasNoctra || results.containsKey(id) || id in pending) return
        pending += id
        queue.addLast(id)
        pump()
    }

    private fun pump() {
        while (active < 2 && queue.isNotEmpty()) {
            val id = queue.removeFirst()
            active += 1
            Session.scope.launch {
                val json = runCatching { Session.noctraJSON("/api/library/series-status?id=$id", 120.0).asMap() }.getOrNull()
                results[id] = json?.let { SeriesStatus(it.str("state") ?: "unknown", it.str("label") ?: "Non vérifié", it.str("description") ?: "") }
                    ?: SeriesStatus("unknown", "Non vérifié", "Vérification momentanément indisponible.")
                pending -= id
                active -= 1
                pump()
            }
        }
    }
}

/** Pastille d'état, couleurs du site (complète, incomplète, en cours, à vérifier). */
@Composable
fun SeriesStatusTag(state: String, label: String, modifier: Modifier = Modifier, large: Boolean = false) {
    val (ink, fill) = when (state) {
        "complete" -> Color(0xFF8AE2C1) to Color(0xFF142D29)
        "incomplete" -> Color(0xFFFFD09B) to Color(0xFF30241B)
        "ongoing" -> Color(0xFFB7C6FF) to Color(0xFF202840)
        else -> Color(0xFFB8C0D3) to Color(0xFF171D2B)
    }
    val shape = RoundedCornerShape(7.dp)
    Text(
        label, color = ink, fontSize = if (large) 12.sp else 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
        modifier = modifier.background(fill.copy(alpha = 0.92f), shape).border(1.dp, ink.copy(alpha = 0.7f), shape)
            .padding(horizontal = if (large) 8.dp else 6.dp, vertical = if (large) 3.dp else 2.dp)
    )
}

/** État d'une série, chargé quand la carte ou la fiche apparaît. */
@Composable
fun SeriesStatusBadge(id: String, modifier: Modifier = Modifier, large: Boolean = false) {
    LaunchedEffect(id) { SeriesStatusStore.request(id) }
    val status = SeriesStatusStore.results[id] ?: return
    if (status.state == "not-series") return
    SeriesStatusTag(status.state, status.label, modifier.semantics { contentDescription = "${status.label}. ${status.detail}" }, large)
}
