package com.noctra.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.app.UiModeManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;

/**
 * Noctra pour Android et Android TV.
 *
 * L'appli affiche l'écran de connexion partagé (assets/launcher, servi sous
 * https://appassets.androidplatform.net), puis charge l'interface web du
 * serveur Noctra choisi dans une WebView plein écran : même session, mêmes
 * cookies et même stockage que dans un navigateur.
 *
 * Canal natif : après chaque chargement d'une page de confiance (lanceur ou
 * serveur mémorisé), l'appli transmet un MessagePort au cadre principal avec
 * postWebMessage, limité à l'origine attendue. Les iframes des fournisseurs TV
 * ne le reçoivent jamais. Le script public/noctra-app-bridge.js du serveur
 * s'en sert (retour, sortie, écran allumé pendant la lecture).
 *
 * Uniquement des classes du système Android, sans bibliothèque : l'APK se
 * construit aussi sans accès aux dépôts de Google (apps/scripts/build-android.mjs).
 */
public class MainActivity extends Activity {

    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String ASSET_ORIGIN = "https://" + ASSET_HOST;
    private static final String LAUNCHER_URL = ASSET_ORIGIN + "/assets/launcher/index.html";
    private static final String KEY_SERVER = "server";
    private static final String KEY_AUTO = "auto";
    private static final int FILE_CHOOSER_REQUEST = 41;

    private FrameLayout root;
    private WebView webView;
    private SharedPreferences prefs;
    private WebChromeClient chromeClient;
    private WebMessagePort hostPort;

    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private ValueCallback<Uri[]> fileCallback;
    private boolean tv;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("noctra", Context.MODE_PRIVATE);
        UiModeManager uiMode = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
        tv = (uiMode != null && uiMode.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
            || getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(5, 7, 17));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(5, 7, 17));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        configureWebView();

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            loadLauncher(false, null);
        }
        webView.requestFocus();
    }

    private String platform() {
        return tv ? "androidtv" : "android";
    }

    private String serverBase() {
        String value = prefs.getString(KEY_SERVER, null);
        return isHttp(value) ? value : null;
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        // Jellyfin passe en disposition « TV » dès que l'agent utilisateur contient
        // « tv » (nom du modèle, « Android TV ») ; Noctra n'utilise pas cette
        // disposition. L'appli Android TV s'annonce donc « android-leanback ».
        String agent = settings.getUserAgentString().replaceAll("(?i)(smart-?)?tv", "");
        settings.setUserAgentString(agent + " NoctraApp/" + BuildConfig.VERSION_NAME
            + " (" + (tv ? "android-leanback" : "android") + ")");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetResponse(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri url = request.getUrl();
                String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase();
                if (scheme.equals("http") || scheme.equals("https")) {
                    if (ASSET_HOST.equals(url.getHost()) || sameOrigin(url, serverBase()) || request.isRedirect()) return false;
                    // Le lanceur ouvre le serveur qu'il vient de vérifier.
                    String current = view.getUrl();
                    if (current != null && current.startsWith(ASSET_ORIGIN + "/") && url.getPath() != null
                        && url.getPath().endsWith("/client/index.html")) {
                        String text = url.toString();
                        saveServer(text.substring(0, text.indexOf("/client/index.html")), prefs.getBoolean(KEY_AUTO, true));
                        return false;
                    }
                }
                openExternal(url);
                return true;
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                injectBridge(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectBridge(url);
                // Redirection du serveur (http → https, autre chemin) : l'adresse servie devient celle de l'appli.
                int index = url == null ? -1 : url.indexOf("/client/index.html");
                if (index > 0 && isHttp(url)) {
                    String base = url.substring(0, index);
                    if (!base.equals(serverBase())) saveServer(base, prefs.getBoolean(KEY_AUTO, true));
                }
                offerHostChannel(url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame() || ASSET_HOST.equals(request.getUrl().getHost())) return;
                if (!sameOrigin(request.getUrl(), serverBase())) return;
                loadLauncher(true, getString(R.string.server_unreachable));
            }
        });

        chromeClient = new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                view.setBackgroundColor(Color.BLACK);
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                setVideoFullscreen(true);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                if (customViewCallback != null) customViewCallback.onCustomViewHidden();
                customViewCallback = null;
                setVideoFullscreen(false);
                webView.requestFocus();
            }

            // Supprime l'icône grise que la WebView affiche avant la première image.
            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    fileCallback = null;
                    return false;
                }
            }

            // Liens target=_blank / window.open : ouverts dans le navigateur.
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView catcher = new WebView(MainActivity.this);
                catcher.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popup, WebResourceRequest request) {
                        openExternal(request.getUrl());
                        popup.destroy();
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(catcher);
                resultMsg.sendToTarget();
                return true;
            }
        };
        webView.setWebChromeClient(chromeClient);

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long length) {
                startDownload(url, userAgent, contentDisposition, mimeType);
            }
        });
    }

    // ── Écran de connexion (assets/launcher) ──────────────────────────────
    private WebResourceResponse assetResponse(Uri url) {
        if (!"https".equals(url.getScheme()) || !ASSET_HOST.equals(url.getHost())) return null;
        String path = url.getPath();
        if (path == null || !path.startsWith("/assets/") || path.contains("..")) return null;
        String name = path.substring("/assets/".length());
        String extension = MimeTypeMap.getFileExtensionFromUrl(name);
        String mime = extension.equals("js") ? "text/javascript"
            : extension.equals("css") ? "text/css"
            : extension.equals("svg") ? "image/svg+xml"
            : extension.equals("woff2") ? "font/woff2"
            : extension.equals("html") ? "text/html"
            : MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        try {
            InputStream stream = getAssets().open(name);
            return new WebResourceResponse(mime == null ? "application/octet-stream" : mime, "utf-8", stream);
        } catch (IOException error) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    private void loadLauncher(boolean manual, String error) {
        Uri.Builder builder = Uri.parse(LAUNCHER_URL).buildUpon()
            .appendQueryParameter("platform", platform())
            .appendQueryParameter("server", serverBase() == null ? "" : serverBase())
            .appendQueryParameter("auto", prefs.getBoolean(KEY_AUTO, true) ? "1" : "0");
        if (manual) builder.appendQueryParameter("manual", "1");
        if (error != null) builder.appendQueryParameter("error", error);
        webView.loadUrl(builder.build().toString());
    }

    // ── Pont web embarqué ──────────────────────────────────────────────────
    // Le serveur Noctra charge public/noctra-app-bridge.js avant son interface.
    // Un serveur plus ancien ne l'a pas : l'appli injecte alors sa propre copie
    // (navigation à la télécommande, touche Retour, correctifs des moteurs anciens).
    private String bridgeSource;

    private void injectBridge(String url) {
        if (url == null || !sameOrigin(Uri.parse(url), serverBase())) return;
        if (bridgeSource == null) {
            try {
                InputStream stream = getAssets().open("bridge/noctra-app-bridge.js");
                java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int read;
                while ((read = stream.read(chunk)) != -1) buffer.write(chunk, 0, read);
                stream.close();
                bridgeSource = buffer.toString("UTF-8");
            } catch (IOException error) {
                bridgeSource = "";
            }
        }
        if (bridgeSource.isEmpty()) return;
        webView.evaluateJavascript("if(!window.NoctraApp){" + bridgeSource + "\n}", null);
    }

    // ── Canal natif ────────────────────────────────────────────────────────
    private void offerHostChannel(String url) {
        if (url == null) return;
        Uri page = Uri.parse(url);
        final boolean fromLauncher = ASSET_HOST.equals(page.getHost()) && "https".equals(page.getScheme());
        final boolean fromServer = sameOrigin(page, serverBase());
        if (!fromLauncher && !fromServer) return;
        if (hostPort != null) {
            try { hostPort.close(); } catch (Exception ignored) { }
        }
        WebMessagePort[] channel = webView.createWebMessageChannel();
        hostPort = channel[0];
        hostPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override
            public void onMessage(WebMessagePort port, WebMessage message) {
                if (port != hostPort) return;
                handleNativeMessage(message.getData(), fromLauncher);
            }
        });
        Uri target = fromLauncher ? Uri.parse(ASSET_ORIGIN) : Uri.parse(origin(page));
        webView.postWebMessage(new WebMessage("noctra-host", new WebMessagePort[] { channel[1] }), target);
    }

    private void handleNativeMessage(String raw, boolean fromLauncher) {
        if (raw == null) return;
        JSONObject message;
        try {
            message = new JSONObject(raw);
        } catch (Exception error) {
            return;
        }
        JSONObject data = message.optJSONObject("data");
        switch (message.optString("action")) {
            case "saveServer":
                if (fromLauncher && data != null) saveServer(data.optString("url"), data.optBoolean("auto", true));
                break;
            case "openServer":
                if (fromLauncher && data != null) {
                    String base = data.optString("base");
                    String url = data.optString("url");
                    if (isHttp(base) && isHttp(url) && sameOrigin(Uri.parse(url), base)) {
                        saveServer(base, prefs.getBoolean(KEY_AUTO, true));
                        webView.loadUrl(url);
                    }
                }
                break;
            case "changeServer":
                loadLauncher(true, null);
                break;
            case "keepScreenOn":
                if (message.optBoolean("data", false)) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                break;
            case "exit":
                finish();
                break;
            default:
                break;
        }
    }

    private void saveServer(String url, boolean auto) {
        if (!isHttp(url)) return;
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        prefs.edit().putString(KEY_SERVER, url).putBoolean(KEY_AUTO, auto).apply();
    }

    // ── Retour ─────────────────────────────────────────────────────────────
    @Override
    public void onBackPressed() {
        if (customView != null) {
            chromeClient.onHideCustomView();
            return;
        }
        webView.evaluateJavascript(
            "(function(){try{return window.NoctraApp&&NoctraApp.back?String(NoctraApp.back()):'none'}catch(e){return 'none'}})()",
            new ValueCallback<String>() {
              @Override
              public void onReceiveValue(String result) {
                String value = result == null ? "" : result.replace("\"", "");
                if (value.equals("handled")) return;
                String current = webView.getUrl();
                boolean onLauncher = current != null && current.startsWith(ASSET_ORIGIN);
                if (value.equals("exit")) {
                    // À l'accueil : l'appli passe en arrière-plan sans perdre la session.
                    if (onLauncher) finish(); else moveTaskToBack(true);
                } else if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
              }
            });
    }

    // ── Plein écran ────────────────────────────────────────────────────────
    @SuppressWarnings("deprecation")
    private void setVideoFullscreen(boolean enabled) {
        View decor = getWindow().getDecorView();
        if (enabled) {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
            if (!tv) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            if (!tv) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    // ── Liens externes, fichiers et téléchargements ───────────────────────
    private void openExternal(Uri uri) {
        Intent intent = null;
        if ("intent".equals(uri.getScheme())) {
            try {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
            } catch (Exception ignored) {
                intent = null;
            }
        } else {
            intent = new Intent(Intent.ACTION_VIEW, uri);
        }
        if (intent == null) return;
        try {
            startActivity(intent.addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileCallback == null) return;
        fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        fileCallback = null;
    }

    private void startDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                .setMimeType(mimeType)
                .addRequestHeader("User-Agent", userAgent)
                .setTitle(fileName)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) request.addRequestHeader("Cookie", cookie);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            } else {
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
            }
            ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show();
        }
    }

    // ── Cycle de vie ───────────────────────────────────────────────────────
    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (hostPort != null) {
            try { hostPort.close(); } catch (Exception ignored) { }
        }
        root.removeView(webView);
        webView.destroy();
        super.onDestroy();
    }

    // ── Outils ─────────────────────────────────────────────────────────────
    private static boolean isHttp(String value) {
        return value != null && (value.startsWith("http://") || value.startsWith("https://"));
    }

    private static int port(Uri uri) {
        if (uri.getPort() != -1) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static String origin(Uri uri) {
        return uri.getScheme() + "://" + uri.getHost() + (uri.getPort() != -1 ? ":" + uri.getPort() : "");
    }

    private static boolean sameOrigin(Uri uri, String base) {
        if (base == null || uri == null) return false;
        Uri server = Uri.parse(base);
        return uri.getScheme() != null && uri.getScheme().equalsIgnoreCase(server.getScheme())
            && uri.getHost() != null && uri.getHost().equalsIgnoreCase(server.getHost())
            && port(uri) == port(server);
    }
}
