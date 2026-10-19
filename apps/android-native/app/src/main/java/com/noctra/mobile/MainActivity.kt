package com.noctra.mobile

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.cast.ChromecastController
import com.noctra.mobile.cast.ChromecastMiniPlayer
import com.noctra.mobile.core.Session
import com.noctra.mobile.discover.DiscoverHub
import com.noctra.mobile.live.LiveLauncher
import com.noctra.mobile.live.LivePlayerModel
import com.noctra.mobile.live.LivePlayerScreen
import com.noctra.mobile.live.LiveServerSheet
import com.noctra.mobile.live.LiveTVHome
import com.noctra.mobile.offline.OfflineStore
import com.noctra.mobile.play.PlaybackManager
import com.noctra.mobile.play.PlayerScreen
import com.noctra.mobile.sync.SyncPlayManager
import com.noctra.mobile.ui.HomeScreen
import com.noctra.mobile.ui.LibrariesScreen
import com.noctra.mobile.ui.LoginScreen
import com.noctra.mobile.ui.Navigator
import com.noctra.mobile.ui.NavigatorHost
import com.noctra.mobile.ui.NoctraTheme
import com.noctra.mobile.ui.Notices
import com.noctra.mobile.ui.Screen
import com.noctra.mobile.ui.SearchScreen
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.glass
import kotlinx.coroutines.delay

/** Image dans l'image : lecteur en cours et état de la fenêtre. */
object Pip {
    var active by mutableStateOf(false)
    /** Rapport largeur/hauteur de la vidéo en cours (16:9 par défaut). */
    var aspect: Rational = Rational(16, 9)
    fun wanted(): Boolean = PlaybackManager.isPlaying || LivePlayerModel.presented
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        current = this
        setContent { NoctraTheme { Root() } }
    }

    override fun onDestroy() {
        if (current === this) current = null
        super.onDestroy()
    }

    /** Appli quittée pendant une vidéo : elle continue en image dans l'image. */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        enterPip()
    }

    fun enterPip() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !Pip.wanted()) return
        if (!packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)) return
        runCatching { enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(Pip.aspect).build()) }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        Pip.active = isInPictureInPictureMode
    }

    companion object {
        var current: MainActivity? = null
            private set
    }
}

@Composable
private fun Root() {
    LaunchedEffect(Session.isSignedIn) {
        if (!Session.isSignedIn) { SyncPlayManager.stopAll(); return@LaunchedEffect }
        OfflineStore.schedule()
        // Cookie de session Noctra (TV, images) et canal temps réel (SyncPlay, « Lire sur… »).
        Session.establishNoctraSession()
        SyncPlayManager.start()
    }
    Box(Modifier.fillMaxSize().background(Theme.background)) {
        Crossfade(Session.isSignedIn, label = "root") { signedIn ->
            if (signedIn) MainTabs() else LoginScreen()
        }
        // Lecteurs plein écran au-dessus de tout.
        if (PlaybackManager.presented) PlayerScreen()
        if (LivePlayerModel.presented) LivePlayerScreen()
        if (!Pip.active) Overlays()
    }
}

private enum class AppTab(val label: String, val icon: ImageVector) {
    Home("Accueil", Icons.Filled.Home),
    Libraries("Médias", Icons.Filled.VideoLibrary),
    Live("TV", Icons.Filled.LiveTv),
    Discover("Découvrir", Icons.Filled.AutoAwesome),
    Search("Recherche", Icons.Filled.Search)
}

/** Onglets : barre du bas sur téléphone, rail latéral sur tablette, pliable déplié, Chromebook et téléviseur. */
@Composable
private fun MainTabs() {
    val navigators = remember {
        mapOf(
            AppTab.Home to Navigator(Screen { HomeScreen() }),
            AppTab.Libraries to Navigator(Screen { LibrariesScreen() }),
            AppTab.Live to Navigator(Screen { LiveTVHome() }),
            AppTab.Discover to Navigator(Screen { DiscoverHub() }),
            AppTab.Search to Navigator(Screen { SearchScreen() })
        )
    }
    var selected by remember { mutableStateOf(AppTab.Home) }
    val navigator = navigators.getValue(selected)
    val configuration = LocalConfiguration.current
    val television = (configuration.uiMode and Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_TELEVISION
    val wide = television || (configuration.screenWidthDp >= 600 && configuration.screenWidthDp > configuration.screenHeightDp * 0.9)
    fun select(tab: AppTab) {
        if (tab == selected) navigators.getValue(tab).popToRoot() else selected = tab
    }
    BackHandler(enabled = !navigator.canPop && selected != AppTab.Home) { selected = AppTab.Home }
    val players = PlaybackManager.presented || LivePlayerModel.presented

    if (wide) {
        Row(Modifier.fillMaxSize()) {
            if (!players) NavigationRail(containerColor = Color(0xF20A0C18), modifier = Modifier.statusBarsPadding()) {
                AppTab.entries.forEach { tab ->
                    NavigationRailItem(
                        selected = tab == selected, onClick = { select(tab) },
                        icon = { Icon(tab.icon, contentDescription = tab.label) }, label = { Text(tab.label, fontSize = 11.sp) },
                        colors = NavigationRailItemDefaults.colors(selectedIconColor = Theme.onAccent, indicatorColor = Theme.lilac, selectedTextColor = Theme.lilac, unselectedIconColor = Theme.muted, unselectedTextColor = Theme.muted)
                    )
                }
            }
            Box(Modifier.weight(1f).fillMaxSize()) { NavigatorHost(navigator) }
        }
    } else {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f).fillMaxWidth()) { NavigatorHost(navigator) }
            if (!players) NavigationBar(containerColor = Color(0xF20A0C18), tonalElevation = 0.dp) {
                AppTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = tab == selected, onClick = { select(tab) },
                        icon = { Icon(tab.icon, contentDescription = tab.label) }, label = { Text(tab.label, fontSize = 11.sp, maxLines = 1, softWrap = false, overflow = TextOverflow.Visible) }, alwaysShowLabel = true,
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = Theme.onAccent, indicatorColor = Theme.lilac, selectedTextColor = Theme.lilac, unselectedIconColor = Theme.muted, unselectedTextColor = Theme.muted)
                    )
                }
            }
        }
    }
}

/** Fenêtre des serveurs d'une chaîne, messages, Chromecast. */
@Composable
private fun Overlays() {
    LiveLauncher.pick?.let { pick -> LiveServerSheet(pick) { LiveLauncher.dismissPick() } }
    LiveLauncher.problem?.let { problem ->
        AlertDialog(onDismissRequest = { LiveLauncher.problem = null }, confirmButton = { TextButton(onClick = { LiveLauncher.problem = null }) { Text("OK") } },
            title = { Text("Chaîne indisponible") }, text = { Text(problem) })
    }
    val castProblem = ChromecastController.problem
    if (castProblem != null && !ChromecastController.isActive) {
        AlertDialog(onDismissRequest = { ChromecastController.problem = null }, confirmButton = { TextButton(onClick = { ChromecastController.problem = null }) { Text("OK") } },
            title = { Text("Chromecast") }, text = { Text(castProblem) })
    }
    Box(Modifier.fillMaxSize()) {
        // Messages SyncPlay et des autres appareils, en haut de l'écran.
        val notice = Notices.current
        LaunchedEffect(Notices.id) {
            if (notice != null) { delay(3500); Notices.clear() }
        }
        AnimatedVisibility(notice != null, enter = slideInVertically { -it } + fadeIn(), exit = slideOutVertically { -it } + fadeOut(), modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 6.dp)) {
            Text(
                notice ?: "", color = Theme.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 16.dp).glass(CircleShape, Color(0xE60E0E20)).border(1.dp, Theme.gradient, CircleShape).padding(horizontal = 18.dp, vertical = 12.dp)
            )
        }
        // Lecture en cours sur un Chromecast : capsule au-dessus des onglets.
        if (!PlaybackManager.presented && !LivePlayerModel.presented) {
            Box(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 84.dp)) { ChromecastMiniPlayer() }
        }
    }
}
