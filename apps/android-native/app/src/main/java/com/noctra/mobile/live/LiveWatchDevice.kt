package com.noctra.mobile.live

import android.annotation.SuppressLint
import android.net.Uri
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Prefs
import com.noctra.mobile.core.asMaps
import com.noctra.mobile.core.str
import com.noctra.mobile.ui.AuroraBackground
import com.noctra.mobile.ui.AuroraPalette
import com.noctra.mobile.ui.NoctraSheet
import com.noctra.mobile.ui.SettingGroup
import com.noctra.mobile.ui.SettingRow
import com.noctra.mobile.ui.SheetColumn
import com.noctra.mobile.ui.Theme
import com.noctra.mobile.ui.ToggleRow
import com.noctra.mobile.ui.TopBar

/**
 * Compte LiveWatch ouvert sur cet appareil, comme dans un navigateur : le lecteur officiel LiveWatch
 * lit alors la chaîne avec ce compte (VIP, sans publicité) et c'est l'appareil, pas le serveur Noctra,
 * qui demande le flux. Ne dépend d'aucune fonction du serveur.
 */
object LiveWatchDevice {
    private const val KEY = "noctra.livewatch.device"
    const val SITE = "https://livewatch.icu/"

    var enabled: Boolean
        get() = Prefs.bool(KEY)
        set(value) = Prefs.set(KEY, value)

    fun isLiveWatchHost(host: String?): Boolean {
        val value = host?.lowercase() ?: return false
        return listOf("livewatch.icu", "livewatch.top").any { value == it || value.endsWith(".$it") }
    }

    /** Lecteur officiel d'une chaîne (…/embed/…) sur le domaine actuel de LiveWatch. */
    fun embedURL(value: String?): String? {
        val uri = value?.let { runCatching { Uri.parse(it) }.getOrNull() } ?: return null
        if (!isLiveWatchHost(uri.host) || uri.path?.startsWith("/embed/") != true) return null
        return uri.buildUpon().scheme("https").authority(Uri.parse(SITE).host).build().toString()
    }

    /** Session Supabase du site LiveWatch présente dans la page (stockage local ou cookie). */
    const val LOGGED_IN_SCRIPT = "(function(){try{var k=Object.keys(localStorage);for(var i=0;i<k.length;i++){if(/^sb-.*-auth-token/.test(k[i])&&localStorage.getItem(k[i]))return true}}catch(e){}" +
        "return /(?:^|;\\s*)sb-[^=]*-auth-token/.test(document.cookie)})()"

    /** Lecteurs « mon compte » d'une fiche de chaîne LiveWatch : la chaîne et ses variantes publiées. */
    fun servers(raw: JsonMap, prefix: String, provider: String): List<LiveServer> {
        if (!enabled) return emptyList()
        val pages = mutableListOf<Pair<String, String>>()
        listOf(raw.str("vipFallbackUrl"), raw.str("externalUrl"), raw.str("embedUrl")).firstNotNullOfOrNull { embedURL(it) }?.let { pages += "mon compte LiveWatch" to it }
        for (variant in raw["liveWatchVariants"].asMaps()) {
            val url = listOf(variant.str("externalUrl"), variant.str("embedUrl")).firstNotNullOfOrNull { embedURL(it) } ?: continue
            pages += (variant.str("label")?.let { "$it · mon compte" } ?: "variante · mon compte") to url
        }
        val seen = HashSet<String>()
        return pages.filter { seen.add(it.second) }.take(12).map { (name, url) ->
            LiveServer(label = "$prefix · $name", provider = provider, kind = LiveServer.Kind.web, pageURL = url, vip = true, framed = false, sandbox = null, device = true)
        }
    }

    /** Données du site LiveWatch effacées de l'appareil (déconnexion). */
    fun signOut() {
        val cookies = CookieManager.getInstance()
        for (host in listOf("livewatch.icu", "livewatch.top")) {
            val url = "https://$host/"
            cookies.getCookie(url)?.split(";")?.map { it.substringBefore("=").trim() }?.filter { it.isNotEmpty() }?.forEach { name ->
                cookies.setCookie(url, "$name=; Max-Age=0; Path=/")
                cookies.setCookie(url, "$name=; Max-Age=0; Path=/; Domain=.$host")
            }
            WebStorage.getInstance().deleteOrigin("https://$host")
        }
        cookies.flush()
        enabled = false
    }
}

/** Réglage « LiveWatch sur cet appareil » : connexion au site, état, utilisation pour la TV. */
@Composable
fun LiveWatchDeviceScreen() {
    var enabled by remember { mutableStateOf(LiveWatchDevice.enabled) }
    var signingIn by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    Box(Modifier.fillMaxSize()) {
    AuroraBackground(AuroraPalette.tv)
    Column(Modifier.fillMaxSize()) {
        TopBar("LiveWatch")
        SettingGroup("LiveWatch sur cet appareil", "Connectez-vous avec votre compte LiveWatch VIP comme sur le site. Les chaînes LiveWatch proposent alors « mon compte LiveWatch » : le lecteur officiel, sans publicité, lu directement par cet appareil.") {
            SettingRow("Se connecter sur LiveWatch", icon = Icons.Filled.AccountCircle, onClick = { signingIn = true })
            ToggleRow("Utiliser ce compte pour la TV", enabled) { enabled = it; LiveWatchDevice.enabled = it }
            note?.let { Text(it, color = Theme.accent, modifier = Modifier.fillMaxWidth()) }
        }
        SettingGroup {
            SettingRow("Se déconnecter de LiveWatch sur cet appareil", tint = Theme.orange, onClick = {
                LiveWatchDevice.signOut()
                enabled = false
                note = "Compte LiveWatch retiré de cet appareil."
            })
        }
    }
    }
    if (signingIn) LiveWatchLoginSheet({ signingIn = false }) { loggedIn ->
        if (loggedIn) {
            enabled = true
            LiveWatchDevice.enabled = true
            note = "Compte LiveWatch connecté : il sera proposé en premier sur les chaînes LiveWatch."
        } else note = "Connexion non détectée. Si vous êtes bien connecté sur le site, activez « Utiliser ce compte pour la TV »."
    }
}

/** Site LiveWatch dans l'appli : la session reste dans les données web de l'appareil. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun LiveWatchLoginSheet(onDismiss: () -> Unit, onDone: (Boolean) -> Unit) {
    var web by remember { mutableStateOf<WebView?>(null) }
    NoctraSheet(onDismiss) {
        Column(Modifier.fillMaxSize()) {
            SheetColumn("LiveWatch") {
                TextButton(onClick = {
                    val view = web
                    if (view == null) { onDone(false); onDismiss() }
                    else view.evaluateJavascript(LiveWatchDevice.LOGGED_IN_SCRIPT) { result -> CookieManager.getInstance().flush(); onDone(result == "true"); onDismiss() }
                }) { Text("Terminé : je suis connecté") }
            }
            Box(Modifier.fillMaxWidth().height(620.dp)) {
                AndroidView(factory = { context ->
                    WebView(context).apply {
                        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        // Même navigateur que le lecteur des chaînes (session reconnue par le lecteur officiel).
                        settings.userAgentString = settings.userAgentString.replace("; wv", "").replace(Regex("Version/\\d+\\.\\d+ "), "")
                        CookieManager.getInstance().setAcceptCookie(true)
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                        webViewClient = WebViewClient()
                        loadUrl(LiveWatchDevice.SITE)
                        web = this
                    }
                }, onRelease = { it.destroy() }, modifier = Modifier.fillMaxSize())
            }
        }
    }
}
