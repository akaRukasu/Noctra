package com.noctra.mobile.admin

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import com.noctra.mobile.core.Json
import com.noctra.mobile.core.Session
import com.noctra.mobile.ui.AuroraBackground
import com.noctra.mobile.ui.AuroraPalette
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.TopBar
import com.noctra.mobile.ui.auroraPanel
import com.noctra.mobile.ui.focusRing
import com.noctra.mobile.ui.glass
import java.time.Instant
import java.time.OffsetDateTime
import java.util.Locale

/** Formats communs de l'administration (tailles, débits, durées, dates). */
object AdminFormat {
    fun bytes(value: Double): String {
        if (value <= 0) return "0 o"
        val units = listOf("o", "Ko", "Mo", "Go", "To", "Po")
        var size = value
        var unit = 0
        while (size >= 1000 && unit < units.size - 1) { size /= 1000; unit += 1 }
        return if (unit == 0) "${size.toInt()} o" else String.format(Locale.FRANCE, if (size >= 100) "%.0f %s" else "%.1f %s", size, units[unit])
    }

    fun speed(value: Double) = bytes(value) + "/s"

    fun duration(seconds: Double): String {
        if (!seconds.isFinite() || seconds <= 0 || seconds >= 8_640_000) return "∞"
        val total = seconds.toInt()
        return when {
            total >= 86_400 -> "${total / 86_400} j ${total % 86_400 / 3600} h"
            total >= 3600 -> "${total / 3600} h ${String.format(Locale.FRANCE, "%02d", total % 3600 / 60)}"
            total >= 60 -> "${total / 60} min"
            else -> "$total s"
        }
    }

    /** Dates Jellyfin (« 2026-10-18T18:43:29.1234567Z »), en millisecondes. */
    fun date(value: Any?): Long? {
        var text = (value as? String)?.takeIf { it.isNotEmpty() } ?: return null
        text = text.replace(Regex("\\.\\d+"), "")
        if (!text.endsWith("Z") && !text.contains('+') && !Regex("-\\d{2}:\\d{2}$").containsMatchIn(text)) text += "Z"
        return runCatching { Instant.parse(text).toEpochMilli() }.getOrNull() ?: runCatching { OffsetDateTime.parse(text).toInstant().toEpochMilli() }.getOrNull()
    }

    fun relative(value: Any?): String {
        val millis = date(value) ?: return ""
        return DateUtils.getRelativeTimeSpanString(millis, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()
    }

    fun number(value: Any?): Double = (value as? Number)?.toDouble() ?: (value as? String)?.toDoubleOrNull() ?: 0.0
}

/** Réponse JSON brute d'une route Jellyfin (écrans d'administration). */
suspend fun jellyfin(path: String, query: Map<String, String?> = emptyMap()): Any? = Json.parse(Session.data("GET", path, query))

// MARK: Écrans et rubriques

/** Écran d'administration : fond aurore, barre du haut, liste défilante. */
@Composable
fun AdminScaffold(title: String, palette: AuroraPalette = AuroraPalette.main, actions: @Composable RowScope.() -> Unit = {}, content: LazyListScope.() -> Unit) {
    Box(Modifier.fillMaxSize()) {
        AuroraBackground(palette)
        Column(Modifier.fillMaxSize()) {
            TopBar(title, actions = actions)
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 30.dp), content = content)
        }
    }
}

/** Rubrique (comme une section de liste iOS) : titre, panneau, note. */
fun LazyListScope.section(header: String? = null, footer: String? = null, key: Any? = null, content: @Composable ColumnScope.() -> Unit) {
    item(key = key) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
            if (header != null) Text(header.uppercase(), color = Theme.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp, modifier = Modifier.padding(start = 6.dp, bottom = 6.dp, top = 6.dp))
            Column(Modifier.fillMaxWidth().auroraPanel(18.dp), content = content)
            if (footer != null) Text(footer, color = Theme.muted, fontSize = 12.sp, modifier = Modifier.padding(start = 6.dp, top = 6.dp, end = 6.dp))
        }
    }
}

@Composable
fun RowDivider() = HorizontalDivider(color = Theme.line, modifier = Modifier.padding(start = 16.dp))

/** Ligne de liste : icône, titre, détail, action et menu facultatifs. */
@Composable
fun AdminRow(
    title: String, modifier: Modifier = Modifier, detail: String? = null, detailColor: Color = Theme.muted, icon: ImageVector? = null, tint: Color = Theme.accent,
    onClick: (() -> Unit)? = null, menu: List<Pair<String, () -> Unit>> = emptyList(), leading: @Composable (() -> Unit)? = null, trailing: @Composable (() -> Unit)? = null
) {
    var open by remember { mutableStateOf(false) }
    Row(
        modifier.fillMaxWidth().then(if (onClick != null) Modifier.focusRing(RoundedCornerShape(12.dp)).clickable(onClick = onClick) else Modifier).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        leading?.invoke()
        if (icon != null) Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, color = Theme.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (!detail.isNullOrEmpty()) Text(detail, color = detailColor, fontSize = 12.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
        }
        trailing?.invoke()
        if (menu.isNotEmpty()) {
            Box {
                Box(Modifier.size(36.dp).clip(CircleShape).focusRing(CircleShape).clickable { open = true }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.MoreVert, contentDescription = "Actions", tint = Theme.muted)
                }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.background(Color(0xFF151932))) {
                    menu.forEach { (label, action) ->
                        DropdownMenuItem(text = { Text(label, color = if (label.startsWith("Supprimer") || label.startsWith("Révoquer") || label.startsWith("Désinstaller") || label.startsWith("Arrêter") || label.startsWith("Retirer")) Theme.red else Theme.ink) }, onClick = { open = false; action() })
                    }
                }
            }
        }
    }
}

@Composable
fun ToggleLine(title: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().focusRing(RoundedCornerShape(12.dp)).clickable(enabled = enabled) { onChange(!checked) }.padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, color = if (enabled) Theme.ink else Theme.muted, fontSize = 15.sp, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled, colors = SwitchDefaults.colors(checkedTrackColor = Theme.lilac, checkedThumbColor = Theme.onAccent))
    }
}

/** Choix dans une liste (menu déroulant). */
@Composable
fun <T> ChoiceLine(title: String, options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().focusRing(RoundedCornerShape(12.dp)).clickable { open = true }.padding(horizontal = 16.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(title, color = Theme.ink, fontSize = 15.sp, modifier = Modifier.weight(1f))
            Text(options.firstOrNull { it.first == selected }?.second ?: selected?.toString() ?: "—", color = Theme.accent, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 200.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.background(Color(0xFF151932))) {
            options.forEach { (value, label) ->
                DropdownMenuItem(text = { Text((if (value == selected) "✓ " else "") + label, color = Theme.ink) }, onClick = { open = false; onSelect(value) })
            }
        }
    }
}

/** Champ de saisie d'un formulaire. */
@Composable
fun FieldLine(label: String, value: String, modifier: Modifier = Modifier, numeric: Boolean = false, secret: Boolean = false, lines: Int = 1, mono: Boolean = false, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) }, singleLine = lines == 1, minLines = lines,
        visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (numeric) KeyboardType.Number else if (secret) KeyboardType.Password else KeyboardType.Text),
        textStyle = androidx.compose.ui.text.TextStyle(color = Theme.ink, fontSize = if (mono) 13.sp else 15.sp, fontFamily = if (mono) androidx.compose.ui.text.font.FontFamily.Monospace else null),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Theme.lilac, unfocusedBorderColor = Theme.lineStrong, focusedLabelColor = Theme.lilac, cursorColor = Theme.lilac),
        modifier = modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
    )
}

/** Bouton texte d'une rubrique. */
@Composable
fun ActionLine(title: String, icon: ImageVector? = null, destructive: Boolean = false, enabled: Boolean = true, busy: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().focusRing(RoundedCornerShape(12.dp)).clickable(enabled = enabled && !busy, onClick = onClick).padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        val color = when { !enabled -> Theme.muted; destructive -> Theme.red; else -> Theme.accent }
        if (busy) CircularProgressIndicator(color = color, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        else if (icon != null) Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(22.dp))
        Text(title, color = color, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** Bouton « Enregistrer » de la barre du haut. */
@Composable
fun SaveButton(enabled: Boolean, busy: Boolean, title: String = "Enregistrer", onClick: () -> Unit) {
    Box(Modifier.clip(CircleShape).glass(CircleShape).focusRing(CircleShape).clickable(enabled = enabled && !busy, onClick = onClick).padding(horizontal = 14.dp, vertical = 9.dp), contentAlignment = Alignment.Center) {
        if (busy) CircularProgressIndicator(color = Theme.accent, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
        else Text(title, color = if (enabled) Theme.accent else Theme.muted, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** Bouton rond de la barre du haut (ajouter, actions). */
@Composable
fun BarButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    Box(Modifier.size(40.dp).glass(CircleShape).focusRing(CircleShape).clickable(onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = label, tint = Theme.ink, modifier = Modifier.size(20.dp))
    }
}

@Composable
fun NoteLine(text: String, color: Color = Theme.accent) {
    Text(text, color = color, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
}

@Composable
fun LoadingLine(text: String? = null) {
    Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        CircularProgressIndicator(color = Theme.accent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        if (text != null) Text(text, color = Theme.muted, fontSize = 13.sp)
    }
}

@Composable
fun Progress(value: Double) {
    LinearProgressIndicator(progress = { value.toFloat().coerceIn(0f, 1f) }, color = Theme.lilac, trackColor = Color.White.copy(alpha = 0.15f), modifier = Modifier.fillMaxWidth().clip(CircleShape))
}

/** Pastille colorée (état, compteur). */
@Composable
fun Badge(text: String, color: Color, icon: ImageVector? = null) {
    Row(Modifier.glass(CircleShape, color.copy(alpha = 0.3f)).padding(horizontal = 9.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        if (icon != null) Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
        Text(text, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** Petite étiquette d'une release (qualité, taille, sources). */
@Composable
fun Tag(text: String?, color: Color) {
    if (text.isNullOrEmpty()) return
    Text(text, color = if (color == Theme.muted) Color.White.copy(alpha = 0.8f) else color, fontSize = 11.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.background(color.copy(alpha = 0.18f), CircleShape).padding(horizontal = 7.dp, vertical = 3.dp))
}

/** Icône d'une rubrique, sur une pastille colorée (comme les Réglages d'iOS). */
@Composable
fun TileIcon(icon: ImageVector, color: Color) {
    Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(Brush.verticalGradient(listOf(color, color.copy(alpha = 0.7f)))), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
    }
}

// MARK: Fenêtres

/** Confirmation d'une action (suppression, redémarrage…). */
@Composable
fun Confirm(title: String, message: String? = null, confirm: String, destructive: Boolean = true, onDismiss: () -> Unit, extra: Pair<String, () -> Unit>? = null, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Color(0xFF151932),
        title = { Text(title, color = Theme.ink) },
        text = message?.let { { Text(it, color = Theme.muted) } },
        confirmButton = {
            Row {
                extra?.let { (label, action) -> TextButton(onClick = { onDismiss(); action() }) { Text(label, color = Theme.accent) } }
                TextButton(onClick = { onDismiss(); onConfirm() }) { Text(confirm, color = if (destructive) Theme.red else Theme.accent) }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler", color = Theme.muted) } }
    )
}

/** Saisie d'un ou plusieurs textes (message, nom, clé…). */
@Composable
fun Prompt(title: String, fields: List<String>, initial: List<String> = emptyList(), confirm: String, message: String? = null, secret: Set<Int> = emptySet(), onDismiss: () -> Unit, onConfirm: (List<String>) -> Unit) {
    var values by remember { mutableStateOf(fields.indices.map { initial.getOrNull(it) ?: "" }) }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Color(0xFF151932),
        title = { Text(title, color = Theme.ink) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (message != null) Text(message, color = Theme.muted, fontSize = 13.sp)
                fields.forEachIndexed { index, label ->
                    FieldLine(label, values[index], secret = index in secret) { text -> values = values.toMutableList().also { it[index] = text } }
                }
            }
        },
        confirmButton = { TextButton(onClick = { onDismiss(); onConfirm(values) }, enabled = values.firstOrNull()?.isNotBlank() == true) { Text(confirm, color = Theme.accent) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler", color = Theme.muted) } }
    )
}
