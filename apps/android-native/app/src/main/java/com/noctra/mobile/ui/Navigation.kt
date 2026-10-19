package com.noctra.mobile.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.util.UUID

/** Écran d'une pile de navigation ; ses modèles (données chargées) survivent quand un autre écran le recouvre. */
class Screen(val content: @Composable () -> Unit) {
    val id: String = UUID.randomUUID().toString()
    val store = mutableMapOf<String, Any>()
}

/** Pile de navigation d'un onglet (comme NavigationStack). */
class Navigator(root: Screen) {
    val stack = mutableStateListOf(root)
    val top: Screen get() = stack.last()
    val canPop: Boolean get() = stack.size > 1

    fun push(content: @Composable () -> Unit) { stack.add(Screen(content)) }
    fun pop() { if (stack.size > 1) stack.removeAt(stack.lastIndex) }
    fun popToRoot() { while (stack.size > 1) stack.removeAt(stack.lastIndex) }
}

val LocalNavigator = staticCompositionLocalOf<Navigator?> { null }
val LocalScreen = staticCompositionLocalOf<Screen?> { null }

/** Modèle propre à l'écran affiché : gardé tant que l'écran est dans la pile. */
@Composable
inline fun <reified T : Any> screenModel(key: String = T::class.java.name, crossinline create: () -> T): T {
    val screen = LocalScreen.current
    @Suppress("UNCHECKED_CAST")
    return if (screen == null) remember { create() } else screen.store.getOrPut(key) { create() } as T
}

/** Affiche le haut de la pile, avec la transition latérale d'iOS et le retour système. */
@Composable
fun NavigatorHost(navigator: Navigator) {
    val holder = rememberSaveableStateHolder()
    BackHandler(enabled = navigator.canPop) { navigator.pop() }
    CompositionLocalProvider(LocalNavigator provides navigator) {
        AnimatedContent(
            targetState = navigator.top,
            transitionSpec = {
                // Écran précédent encore dans la pile : on avance ; sinon on revient.
                val forward = initialState in navigator.stack
                if (forward) (slideInHorizontally(tween(320)) { it / 3 } + fadeIn(tween(220))) togetherWith (slideOutHorizontally(tween(320)) { -it / 6 } + fadeOut(tween(200)))
                else (slideInHorizontally(tween(320)) { -it / 6 } + fadeIn(tween(220))) togetherWith (slideOutHorizontally(tween(320)) { it / 3 } + fadeOut(tween(200)))
            },
            label = "navigation"
        ) { screen ->
            holder.SaveableStateProvider(screen.id) {
                CompositionLocalProvider(LocalScreen provides screen) {
                    Box(Modifier.fillMaxSize()) { screen.content() }
                }
            }
        }
    }
}

/** Ouvre un écran dans la pile de l'onglet en cours. */
@Composable
fun rememberPush(): (@Composable () -> Unit) -> Unit {
    val navigator = LocalNavigator.current
    return remember(navigator) { { content -> navigator?.push(content) } }
}

/** Barre du haut d'un écran : retour, titre en Sora, actions. */
@Composable
fun TopBar(title: String, modifier: Modifier = Modifier, large: Boolean = false, actions: @Composable RowScope.() -> Unit = {}) {
    val navigator = LocalNavigator.current
    Column(modifier.fillMaxWidth().statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (navigator?.canPop == true) {
                IconButton(onClick = { navigator.pop() }, modifier = Modifier.size(44.dp).glass(CircleShape).focusRing(CircleShape)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour", tint = Theme.ink)
                }
                Spacer(Modifier.width(8.dp))
            } else {
                Spacer(Modifier.width(12.dp))
            }
            if (!large) {
                Text(title, style = Theme.display(18, androidx.compose.ui.text.font.FontWeight.SemiBold), color = Theme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            } else {
                Spacer(Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically, content = actions)
            Spacer(Modifier.width(8.dp))
        }
        if (large) {
            Text(title, style = Theme.display(28), color = Theme.ink, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 20.dp, vertical = 2.dp))
        }
    }
}
