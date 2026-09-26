package com.noctra.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.UiModeManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * Noctra pour Android et Android TV.
 *
 * L'appli affiche l'écran de connexion partagé (assets/launcher), puis charge
 * l'interface web du serveur Noctra choisi dans une WebView plein écran : même
 * session, mêmes cookies et même stockage que dans un navigateur. Le script
 * public/noctra-app-bridge.js du serveur dialogue avec l'appli par le canal
 * « NoctraHost » (retour, sortie, écran allumé pendant la lecture).
 */
class MainActivity : ComponentActivity() {

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private val prefs by lazy { getSharedPreferences("noctra", Context.MODE_PRIVATE) }

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var chromeClient: WebChromeClient

    private val isTv: Boolean by lazy {
        val uiMode = getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        uiMode.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }
    private val platform get() = if (isTv) "androidtv" else "android"

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }

    private val serverBase: String?
        get() = prefs.getString(KEY_SERVER, null)?.takeIf { it.startsWith("http://") || it.startsWith("https://") }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#050711")) }
        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#050711"))
            isFocusable = true
            isFocusableInTouchMode = true
        }
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // Pas de dessin sous les barres système (comme la PWA Android), sauf en plein écran vidéo.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            if (customView == null) view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            else view.setPadding(0, 0, 0, 0)
            WindowInsetsCompat.CONSUMED
        }

        configureWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = handleBack()
        })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            loadLauncher(manual = false)
        }
        webView.requestFocus()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = false
            displayZoomControls = false
            setSupportZoom(false)
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
            allowFileAccess = false
            allowContentAccess = false
            userAgentString = "$userAgentString NoctraApp/${BuildConfig.VERSION_NAME} ($platform)"
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "NoctraHost", setOf("*")) { _, message, sourceOrigin, isMainFrame, _ ->
                handleNativeMessage(message.data, sourceOrigin, isMainFrame)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val url = request.url
                val scheme = url.scheme?.lowercase()
                if (scheme == "http" || scheme == "https") {
                    if (url.host == ASSET_HOST || sameOrigin(url, serverBase) || request.isRedirect) return false
                    openExternal(url)
                    return true
                }
                openExternal(url)
                return true
            }

            // Redirection du serveur (http → https, autre chemin) : l'adresse
            // réellement servie devient celle de l'appli.
            override fun onPageFinished(view: WebView, url: String?) {
                val index = url?.indexOf("/client/index.html") ?: -1
                if (url != null && index > 0 && isHttp(url)) {
                    val base = url.substring(0, index)
                    if (base != serverBase) saveServer(base, prefs.getBoolean(KEY_AUTO, true))
                }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame || request.url.host == ASSET_HOST) return
                if (!sameOrigin(request.url, serverBase)) return
                loadLauncher(manual = true, error = getString(R.string.server_unreachable))
            }

            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                recreate()
                return true
            }
        }

        chromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (customView != null) {
                    callback.onCustomViewHidden()
                    return
                }
                customView = view
                customViewCallback = callback
                root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                view.setBackgroundColor(Color.BLACK)
                setVideoFullscreen(true)
            }

            override fun onHideCustomView() {
                val view = customView ?: return
                root.removeView(view)
                customView = null
                customViewCallback?.onCustomViewHidden()
                customViewCallback = null
                setVideoFullscreen(false)
                webView.requestFocus()
            }

            // Supprime l'icône grise que la WebView affiche avant la première image.
            override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    fileChooser.launch(params.createIntent())
                    true
                } catch (error: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }

            // Liens target=_blank / window.open : ouverts dans le navigateur.
            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                val catcher = WebView(this@MainActivity)
                catcher.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        openExternal(request.url)
                        view.destroy()
                        return true
                    }
                }
                val transport = resultMsg.obj as WebView.WebViewTransport
                transport.webView = catcher
                resultMsg.sendToTarget()
                return true
            }
        }

        webView.webChromeClient = chromeClient

        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            startDownload(url, userAgent, contentDisposition, mimeType)
        }
    }

    // ── Écran de connexion ─────────────────────────────────────────────────
    private fun loadLauncher(manual: Boolean, error: String? = null) {
        val builder = Uri.parse(LAUNCHER_URL).buildUpon()
            .appendQueryParameter("platform", platform)
            .appendQueryParameter("server", serverBase ?: "")
            .appendQueryParameter("auto", if (prefs.getBoolean(KEY_AUTO, true)) "1" else "0")
        if (manual) builder.appendQueryParameter("manual", "1")
        if (error != null) builder.appendQueryParameter("error", error)
        webView.loadUrl(builder.build().toString())
    }

    // ── Messages du lanceur et du pont web ────────────────────────────────
    private fun handleNativeMessage(raw: String?, sourceOrigin: Uri, isMainFrame: Boolean) {
        if (!isMainFrame || raw == null) return
        val fromLauncher = sourceOrigin.scheme == "https" && sourceOrigin.host == ASSET_HOST
        val fromServer = sameOrigin(sourceOrigin, serverBase)
        if (!fromLauncher && !fromServer) return
        val message = try { JSONObject(raw) } catch (error: Exception) { return }
        val data = message.optJSONObject("data")
        when (message.optString("action")) {
            "saveServer" -> if (fromLauncher && data != null) saveServer(data.optString("url"), data.optBoolean("auto", true))
            "openServer" -> if (fromLauncher && data != null) {
                val base = data.optString("base")
                val url = data.optString("url")
                if (isHttp(base) && isHttp(url) && sameOrigin(Uri.parse(url), base)) {
                    saveServer(base, prefs.getBoolean(KEY_AUTO, true))
                    webView.loadUrl(url)
                }
            }
            "changeServer" -> loadLauncher(manual = true)
            "keepScreenOn" -> setKeepScreenOn(message.optBoolean("data", false))
            "exit" -> finish()
        }
    }

    private fun saveServer(url: String, auto: Boolean) {
        if (!isHttp(url)) return
        prefs.edit().putString(KEY_SERVER, url.trimEnd('/')).putBoolean(KEY_AUTO, auto).apply()
    }

    private fun setKeepScreenOn(enabled: Boolean) {
        if (enabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    // ── Retour ─────────────────────────────────────────────────────────────
    private fun handleBack() {
        if (customView != null) {
            chromeClient.onHideCustomView()
            return
        }
        webView.evaluateJavascript(
            "(function(){try{return window.NoctraApp&&NoctraApp.back?String(NoctraApp.back()):'none'}catch(e){return 'none'}})()"
        ) { result ->
            when (result?.trim('"')) {
                "handled" -> Unit
                // À l'accueil : l'appli passe en arrière-plan sans perdre la session.
                "exit" -> if (webView.url?.contains(ASSET_HOST) == true) finish() else moveTaskToBack(true)
                else -> if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
            }
        }
    }

    // ── Plein écran ────────────────────────────────────────────────────────
    private fun setVideoFullscreen(enabled: Boolean) {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        if (enabled) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
            if (!isTv) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
            if (!isTv) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        ViewCompat.requestApplyInsets(root)
    }

    // ── Liens externes et téléchargements ─────────────────────────────────
    private fun openExternal(uri: Uri) {
        val intent = if (uri.scheme == "intent") {
            try { Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME) } catch (error: Exception) { null }
        } else {
            Intent(Intent.ACTION_VIEW, uri)
        }
        try {
            if (intent != null) startActivity(intent.addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (error: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    private fun startDownload(url: String, userAgent: String, contentDisposition: String?, mimeType: String?) {
        try {
            val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url))
                .setMimeType(mimeType)
                .addRequestHeader("User-Agent", userAgent)
                .setTitle(fileName)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            } else {
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName)
            }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        } catch (error: Exception) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show()
        }
    }

    // ── Cycle de vie ───────────────────────────────────────────────────────
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        root.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val LAUNCHER_URL = "https://$ASSET_HOST/assets/launcher/index.html"
        const val KEY_SERVER = "server"
        const val KEY_AUTO = "auto"

        fun isHttp(value: String?) = value != null && (value.startsWith("http://") || value.startsWith("https://"))

        fun sameOrigin(uri: Uri, base: String?): Boolean {
            if (base == null) return false
            val server = Uri.parse(base)
            fun port(u: Uri) = if (u.port != -1) u.port else if (u.scheme == "https") 443 else 80
            return uri.scheme.equals(server.scheme, ignoreCase = true) &&
                uri.host.equals(server.host, ignoreCase = true) &&
                port(uri) == port(server)
        }
    }
}
