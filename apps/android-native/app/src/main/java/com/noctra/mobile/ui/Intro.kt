package com.noctra.mobile.ui

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Logo Noctra (public/noctra-mark.svg) dessiné en natif : tuile nuit, « N » en dégradé, point ciel. */
@Composable
fun NoctraMark(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        scale(size.minDimension / 64f, pivot = Offset.Zero) {
            drawRoundRect(
                brush = Brush.radialGradient(listOf(Color(0xFF242B50), Color(0xFF080B17)), center = Offset(19f, 14f), radius = 54f),
                topLeft = Offset(2f, 2f), size = Size(60f, 60f), cornerRadius = CornerRadius(18f)
            )
            val letter = Path().apply { moveTo(17f, 45f); lineTo(17f, 19f); lineTo(47f, 45f); lineTo(47f, 19f) }
            drawPath(
                letter,
                Brush.linearGradient(0f to Color(0xFF78A8FF), 0.52f to Color(0xFF8B6CFF), 1f to Color(0xFFD070FF), start = Offset(9f, 9f), end = Offset(55f, 55f)),
                style = Stroke(width = 7f, cap = StrokeCap.Round, join = StrokeJoin.Round)
            )
            drawCircle(Color(0xFF72E8FF), radius = 4f, center = Offset(47f, 18f))
        }
    }
}

/**
 * Intro animée à l'ouverture, comme sur le site : le logo arrive en tournant
 * avec un halo violet, « NOCTRA » se resserre en dégradé, puis tout s'efface.
 */
@Composable
fun NoctraIntro(finished: () -> Unit) {
    val context = LocalContext.current
    val mark = remember { Animatable(0f) }
    val word = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        // Animations désactivées dans les options d'accessibilité : intro immobile et brève.
        val still = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        if (still) {
            mark.snapTo(1f)
            word.snapTo(1f)
        } else {
            // cubic-bezier(.2, 1.3, .3, 1) du site : léger rebond du logo.
            launch { mark.animateTo(1f, tween(1100, easing = CubicBezierEasing(0.2f, 1.3f, 0.3f, 1f))) }
            launch { delay(250); word.animateTo(1f, tween(900, easing = CubicBezierEasing(0.22f, 1f, 0.36f, 1f))) }
        }
        delay(if (still) 400 else 1250)
        finished()
    }
    Box(Modifier.fillMaxSize().background(Brush.radialGradient(listOf(Color(0xFF12112A), Theme.background))), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Box(
                Modifier.size(84.dp).graphicsLayer {
                    val progress = mark.value
                    scaleX = 0.4f + 0.6f * progress
                    scaleY = 0.4f + 0.6f * progress
                    rotationZ = -12f * (1f - progress)
                    alpha = progress.coerceIn(0f, 1f)
                },
                contentAlignment = Alignment.Center
            ) {
                // Halo violet du site (drop-shadow 30 px).
                Box(Modifier.requiredSize(170.dp).background(Brush.radialGradient(listOf(Theme.violet.copy(alpha = 0.55f), Color.Transparent))))
                NoctraMark(Modifier.fillMaxSize())
            }
            // letter-spacing du site : 1,2 em → 0,5 em (police de 22).
            val spacing = 26.4f - 15.4f * word.value
            Text(
                "NOCTRA",
                style = Theme.display(22).copy(letterSpacing = spacing.sp, brush = Theme.gradient),
                modifier = Modifier.padding(start = spacing.dp).graphicsLayer { alpha = word.value.coerceIn(0f, 1f) }
            )
        }
    }
}
