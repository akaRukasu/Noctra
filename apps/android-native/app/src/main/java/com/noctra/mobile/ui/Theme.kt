package com.noctra.mobile.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Density
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.R

/**
 * Identité visuelle de Noctra Web (« Aurora 2 », public/noctra-aurora.css) :
 * fond nuit, dégradé lilas → rose → ciel, police de titre Sora, liserés
 * dégradés et halos violets — comme l'appli iOS.
 */
object Theme {
    val background = Color(0xFF05060D)
    val ink = Color(0xFFF5F3FF)
    val muted = Color(0xFFA9ADC6)
    val violet = Color(0xFFA78BFA)
    val lilac = Color(0xFFC4B5FD)
    val pink = Color(0xFFF0ABFC)
    val cyan = Color(0xFF7DD3FC)
    val teal = Color(0xFF5EEAD4)
    val deepViolet = Color(0xFF8B5CF6)
    val fuchsia = Color(0xFFD946EF)
    val onAccent = Color(0xFF140F2A)
    val accent = lilac
    val orange = Color(0xFFFDBA74)
    val gold = Color(0xFFFCD34D)
    val red = Color(0xFFF87171)
    val line = Color(0x24C4B5FD)
    val lineStrong = Color(0x47D6C8FF)
    val surface = Color(0x9E101222)
    val card = Color(0xD10E1326)
    val panel = Color(0xB80C0F1F)

    /** --na-grad : linear-gradient(115deg, #c4b5fd, #f0abfc 42%, #7dd3fc). */
    val gradient = Brush.linearGradient(0f to lilac, 0.42f to pink, 1f to cyan)
    val titleGradient = Brush.horizontalGradient(0f to Color.White, 0.34f to Color(0xFFF5F0FF), 0.62f to lilac, 0.84f to pink, 1f to cyan)
    val sectionGradient = Brush.horizontalGradient(listOf(Color.White, Color(0xFFF1EDFF), Color(0xFFCDBFFF)))
    val posterTitleGradient = Brush.horizontalGradient(0f to Color.White, 0.4f to Color.White, 0.7f to Color(0xFFE9E2FF), 1f to Color(0xFFC7D8FF))
    val ringGradient = Brush.linearGradient(0f to Color(0x9EDDD6FE), 0.35f to pink.copy(alpha = 0.22f), 0.6f to cyan.copy(alpha = 0.10f), 1f to cyan.copy(alpha = 0.55f))

    val sora = FontFamily(
        Font(R.font.sora_regular, FontWeight.Normal),
        Font(R.font.sora_semibold, FontWeight.Medium),
        Font(R.font.sora_semibold, FontWeight.SemiBold),
        Font(R.font.sora_bold, FontWeight.Bold),
        Font(R.font.sora_extrabold, FontWeight.ExtraBold),
        Font(R.font.sora_extrabold, FontWeight.Black)
    )

    fun display(size: Int, weight: FontWeight = FontWeight.Bold) = TextStyle(fontFamily = sora, fontWeight = weight, fontSize = size.sp, letterSpacing = (-0.02 * size).sp)
}

/** Teintes d'un espace (TV en vert d'eau, demandes en pêche…). */
data class AuroraPalette(val k1: Color, val k2: Color, val k3: Color) {
    companion object {
        val main = AuroraPalette(Theme.lilac, Theme.pink, Theme.cyan)
        val tv = AuroraPalette(Theme.teal, Theme.cyan, Theme.lilac)
        val requests = AuroraPalette(Color(0xFFFDBA74), Color(0xFFF9A8D4), Theme.lilac)
        val roulette = AuroraPalette(Color(0xFFFCD34D), Color(0xFFFDA4AF), Theme.lilac)
    }
}

@Composable
fun NoctraTheme(content: @Composable () -> Unit) {
    val colors = darkColorScheme(
        primary = Theme.lilac, onPrimary = Theme.onAccent, secondary = Theme.cyan, onSecondary = Theme.onAccent,
        tertiary = Theme.teal, background = Theme.background, onBackground = Theme.ink, surface = Color(0xFF0D0F1E),
        onSurface = Theme.ink, surfaceVariant = Color(0xFF161A30), onSurfaceVariant = Theme.muted, outline = Theme.lineStrong,
        surfaceContainer = Color(0xFF111427), surfaceContainerHigh = Color(0xFF151932), surfaceContainerHighest = Color(0xFF1A1F3A),
        surfaceContainerLow = Color(0xFF0D1020), surfaceContainerLowest = Color(0xFF080A15), error = Theme.red
    )
    val base = Typography()
    val typography = base.copy(
        displayLarge = base.displayLarge.copy(fontFamily = Theme.sora),
        displayMedium = base.displayMedium.copy(fontFamily = Theme.sora),
        displaySmall = base.displaySmall.copy(fontFamily = Theme.sora),
        headlineLarge = base.headlineLarge.copy(fontFamily = Theme.sora, fontWeight = FontWeight.Bold),
        headlineMedium = base.headlineMedium.copy(fontFamily = Theme.sora, fontWeight = FontWeight.Bold),
        headlineSmall = base.headlineSmall.copy(fontFamily = Theme.sora, fontWeight = FontWeight.Bold),
        titleLarge = base.titleLarge.copy(fontFamily = Theme.sora, fontWeight = FontWeight.SemiBold)
    )
    // Grande taille de police d'Android : texte agrandi jusqu'à 115 % (au-delà, onglets,
    // pastilles et lignes se coupent). Écrans et images suivent la taille d'affichage.
    val density = LocalDensity.current
    val scaled = Density(density.density, density.fontScale.coerceIn(0.85f, 1.15f))
    CompositionLocalProvider(LocalDensity provides scaled) {
        MaterialTheme(colorScheme = colors, typography = typography, content = content)
    }
}

// MARK: Fond « aurore »

private data class Star(val x: Float, val y: Float, val r: Float, val color: Color)

private val stars = listOf(
    Star(0.12f, 0.18f, 1.0f, Color.White.copy(alpha = 0.6f)), Star(0.72f, 0.12f, 1.0f, Color.White.copy(alpha = 0.53f)),
    Star(0.38f, 0.62f, 1.4f, Color(0xFFE9E3FF).copy(alpha = 0.6f)), Star(0.86f, 0.48f, 1.0f, Color.White.copy(alpha = 0.47f)),
    Star(0.22f, 0.84f, 1.2f, Color(0xFFDBEAFE).copy(alpha = 0.53f)), Star(0.58f, 0.32f, 1.0f, Color.White.copy(alpha = 0.4f)),
    Star(0.92f, 0.88f, 1.3f, Color(0xFFF5D0FE).copy(alpha = 0.53f)), Star(0.04f, 0.52f, 1.0f, Color.White.copy(alpha = 0.4f))
)

/** Fond du site : nuit #05060d, nappes de lumière et poussière d'étoiles qui s'efface vers le bas. */
@Composable
fun AuroraBackground(palette: AuroraPalette = AuroraPalette.main, modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxSize()) {
        val unit = maxOf(size.width, size.height)
        drawRect(Theme.background)
        fun blob(color: Color, alpha: Float, x: Float, y: Float, radius: Float) {
            drawRect(Brush.radialGradient(listOf(color.copy(alpha = alpha), Color.Transparent), center = Offset(size.width * x, size.height * y), radius = radius))
        }
        blob(Color(0xFF4C1D95), 0.22f, 0.5f, 1.2f, unit * 0.7f)
        blob(Color(0xFF1E1B4B), 0.6f, 0.5f, -0.1f, unit * 0.55f)
        blob(if (palette.k1 == Theme.lilac) Color(0xFF8B5CF6) else palette.k1, 0.36f, 0.18f, 0.22f, unit * 0.38f)
        blob(if (palette.k3 == Theme.cyan) Color(0xFF38BDF8) else palette.k3, 0.24f, 0.82f, 0.16f, unit * 0.34f)
        blob(if (palette.k2 == Theme.pink) Color(0xFFD946EF) else palette.k2, 0.20f, 0.70f, 0.82f, unit * 0.40f)
        blob(Color(0xFF2DD4BF), 0.14f, 0.12f, 0.86f, unit * 0.30f)
        val tile = 310.dp.toPx() / 2.4f
        var y = 0f
        while (y < size.height) {
            val fade = (1f - y / size.height).coerceIn(0f, 1f) * 0.55f
            var x = 0f
            while (x < size.width) {
                for (star in stars) drawCircle(star.color.copy(alpha = star.color.alpha * fade), radius = star.r * density * 0.8f, center = Offset(x + star.x * tile, y + star.y * tile))
                x += tile
            }
            y += tile
        }
    }
}

// MARK: Logo, titres, pastilles

/** Logo de Noctra (public/noctra-mark.svg) dessiné nativement. */
@Composable
fun NoctraMark(size: Dp = 64.dp) {
    Canvas(Modifier.size(size).shadow(size / 6, RoundedCornerShape(size * 0.3f), ambientColor = Theme.violet, spotColor = Theme.violet)) {
        val s = this.size.width / 64f
        drawRoundRect(
            Brush.radialGradient(listOf(Color(0xFF242B50), Color(0xFF080B17)), center = Offset(19 * s, 14 * s), radius = 54 * s),
            topLeft = Offset(2 * s, 2 * s), size = androidx.compose.ui.geometry.Size(60 * s, 60 * s), cornerRadius = CornerRadius(18 * s)
        )
        val letter = Path().apply {
            moveTo(17 * s, 45 * s); lineTo(17 * s, 19 * s); lineTo(47 * s, 45 * s); lineTo(47 * s, 19 * s)
        }
        drawPath(letter, Brush.linearGradient(0f to Color(0xFF78A8FF), 0.52f to Color(0xFF8B6CFF), 1f to Color(0xFFD070FF), start = Offset(9 * s, 9 * s), end = Offset(55 * s, 55 * s)),
            style = Stroke(width = 7 * s, cap = StrokeCap.Round, join = StrokeJoin.Round))
        drawCircle(Color(0xFF72E8FF), radius = 4 * s, center = Offset(47 * s, 18 * s))
    }
}

/** Titre de section du site : dégradé discret et trait lumineux dessous. */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, detail: String? = null) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text, style = Theme.display(21).copy(brush = Theme.sectionGradient))
            if (detail != null) Text(detail, color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(bottom = 2.dp))
        }
        Box(Modifier.width(44.dp).height(3.dp).clip(CircleShape).background(Theme.gradient))
    }
}

/** Pastille « œil » des cartes du site (point vert d'eau lumineux). */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier.clip(CircleShape).background(Color(0x990F1122)).border(1.dp, Color(0x47DDD6FE), CircleShape).padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(Theme.teal))
        Text(text, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.6.sp, color = Theme.ink)
    }
}

// MARK: Boutons, cartes, panneaux

/** Bouton principal : lilas du site, texte sombre et halo violet. */
@Composable
fun AuroraPrimaryButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable RowScope.() -> Unit) {
    Button(
        onClick = onClick, enabled = enabled,
        modifier = modifier.shadow(if (enabled) 14.dp else 0.dp, CircleShape, ambientColor = Theme.violet, spotColor = Theme.violet).focusRing(CircleShape),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(containerColor = Theme.lilac, contentColor = Theme.onAccent, disabledContainerColor = Theme.lilac.copy(alpha = 0.35f), disabledContentColor = Theme.onAccent.copy(alpha = 0.6f)),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
        content = content
    )
}

/** Bouton secondaire : verre de nuit et liseré lilas. */
@Composable
fun AuroraSecondaryButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable RowScope.() -> Unit) {
    OutlinedButton(
        onClick = onClick, enabled = enabled, modifier = modifier.focusRing(CircleShape), shape = CircleShape,
        border = BorderStroke(1.dp, Theme.lineStrong),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = Color(0x991A1D33), contentColor = Theme.ink),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 11.dp),
        content = content
    )
}

/** Panneau du site : verre de nuit et liseré dégradé. */
fun Modifier.auroraPanel(radius: Dp = 24.dp, palette: AuroraPalette = AuroraPalette.main): Modifier {
    val shape = RoundedCornerShape(radius)
    return this.clip(shape).background(Theme.panel)
        .border(1.dp, Brush.linearGradient(listOf(palette.k1.copy(alpha = 0.5f), Color.White.copy(alpha = 0.05f), palette.k3.copy(alpha = 0.4f))), shape)
}

/** Verre (capsules, boutons ronds) : fond translucide et liseré clair. */
fun Modifier.glass(shape: Shape = CircleShape, tint: Color = Color(0x991A1D33)): Modifier =
    this.clip(shape).background(tint).border(1.dp, Color(0x33FFFFFF), shape)

/** Image d'une carte du site : liseré lilas très fin, ombre profonde. */
fun Modifier.auroraCard(radius: Dp = 18.dp): Modifier {
    val shape = RoundedCornerShape(radius)
    return this.shadow(10.dp, shape, ambientColor = Color.Black, spotColor = Color.Black).clip(shape).border(1.dp, Color(0x1ADDD6FE), shape)
}

/** Appui : léger enfoncement au ressort (comme l'App Store). */
fun Modifier.pressScale(source: MutableInteractionSource, scale: Float = 0.96f): Modifier = composed {
    val pressed by source.collectIsPressedAsState()
    val value by animateFloatAsState(if (pressed) scale else 1f, spring(dampingRatio = 0.6f, stiffness = 600f), label = "press")
    this.scale(value)
}

/** Sélection à la télécommande (Android TV, clavier) : anneau lumineux autour de l'élément. */
fun Modifier.focusRing(shape: Shape = RoundedCornerShape(18.dp)): Modifier = composed {
    var focused by remember { mutableStateOf(false) }
    val value by animateFloatAsState(if (focused) 1f else 0f, label = "focus")
    this.onFocusChanged { focused = it.hasFocus }.drawWithContent {
        drawContent()
        if (value > 0f) {
            val outline = shape.createOutline(size, layoutDirection, this)
            drawOutline(outline, Theme.lilac.copy(alpha = value), style = Stroke(width = 3.dp.toPx()))
        }
    }
}
