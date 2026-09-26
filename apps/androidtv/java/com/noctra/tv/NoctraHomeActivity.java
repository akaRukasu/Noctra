package com.noctra.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;

/**
 * Accueil Noctra de l'appli Noctra TV : menu du haut (Accueil, Médiathèques,
 * TV en direct, Découvrir, Demandes, Roulette, Rechercher, Jellyfin).
 *
 * L'interface (assets/noctra-tv) est servie par l'appli elle-même sous
 * NOCTRA_URL/tv-app/ : même origine que l'API Noctra et que Jellyfin, sans
 * rien installer sur le serveur. Les fiches, médiathèques et la lecture des
 * films et séries s'ouvrent dans les écrans natifs de Jellyfin ; les chaînes
 * TV dans NoctraPlayerActivity (ExoPlayer).
 *
 * Canal natif : un MessagePort transmis au seul cadre principal, limité à
 * l'origine du serveur. Les lecteurs web des chaînes (iframes) n'y ont pas accès.
 */
public class NoctraHomeActivity extends Activity {

    private static final int PLAYER_REQUEST = 7;

    private FrameLayout root;
    private WebView webView;
    private WebChromeClient chromeClient;
    private WebMessagePort hostPort;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private NoctraSession session;
    private String appBase;
    private Uri server;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        session = NoctraSession.read(this);
        if (session == null) {
            // Session illisible : l'appli Jellyfin reste utilisable telle quelle.
            openJellyfin(new Intent());
            finish();
            return;
        }
        appBase = NoctraConfig.NOCTRA_URL + "/tv-app/";
        server = Uri.parse(NoctraConfig.NOCTRA_URL);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(9, 10, 15));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(9, 10, 15));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        configureWebView();
        webView.loadUrl(appBase + "index.html");
        webView.requestFocus();
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " NoctraTV/" + NoctraConfig.VERSION);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetResponse(request.getUrl().toString());
            }

            // Le cadre principal reste sur l'interface Noctra : un lecteur web
            // ne peut pas remplacer la page (liens « _top », redirections).
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return !request.getUrl().toString().startsWith(appBase);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith(appBase)) offerHostChannel();
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
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                if (customViewCallback != null) customViewCallback.onCustomViewHidden();
                customViewCallback = null;
                webView.requestFocus();
            }

            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        };
        webView.setWebChromeClient(chromeClient);
    }

    // ── Interface embarquée (assets/noctra-tv) ────────────────────────────
    private WebResourceResponse assetResponse(String url) {
        if (!url.startsWith(appBase)) return null;
        String name = url.substring(appBase.length());
        int end = name.length();
        int query = name.indexOf('?');
        int hash = name.indexOf('#');
        if (query >= 0) end = Math.min(end, query);
        if (hash >= 0) end = Math.min(end, hash);
        name = name.substring(0, end);
        if (name.isEmpty()) name = "index.html";
        if (name.contains("..")) return null;
        String extension = MimeTypeMap.getFileExtensionFromUrl(name);
        String mime = extension.equals("js") ? "text/javascript"
            : extension.equals("css") ? "text/css"
            : extension.equals("svg") ? "image/svg+xml"
            : extension.equals("html") ? "text/html"
            : MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        try {
            InputStream stream = getAssets().open("noctra-tv/" + name);
            WebResourceResponse response = new WebResourceResponse(mime == null ? "application/octet-stream" : mime, "utf-8", stream);
            java.util.HashMap<String, String> headers = new java.util.HashMap<String, String>();
            headers.put("Cache-Control", "no-store");
            response.setResponseHeaders(headers);
            return response;
        } catch (IOException error) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    // ── Canal natif ────────────────────────────────────────────────────────
    private void offerHostChannel() {
        if (hostPort != null) {
            try { hostPort.close(); } catch (Exception ignored) { }
        }
        WebMessagePort[] channel = webView.createWebMessageChannel();
        hostPort = channel[0];
        hostPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override
            public void onMessage(WebMessagePort port, WebMessage message) {
                if (port == hostPort) handleMessage(message.getData());
            }
        });
        String origin = server.getScheme() + "://" + server.getAuthority();
        webView.postWebMessage(new WebMessage("noctra-host", new WebMessagePort[] { channel[1] }), Uri.parse(origin));
    }

    private void send(JSONObject message) {
        if (hostPort == null) return;
        try {
            hostPort.postMessage(new WebMessage(message.toString()));
        } catch (Exception ignored) {
            // Page rechargée entre-temps : le prochain canal renverra l'état.
        }
    }

    private void sendSession() {
        try {
            JSONObject message = new JSONObject();
            message.put("type", "session");
            message.put("token", session.accessToken);
            message.put("userId", session.userId);
            message.put("userName", session.userName);
            message.put("serverAddress", session.serverAddress);
            message.put("noctraUrl", NoctraConfig.NOCTRA_URL);
            message.put("jellyfinUrl", NoctraConfig.JELLYFIN_URL);
            message.put("version", NoctraConfig.VERSION);
            send(message);
        } catch (Exception ignored) {
        }
    }

    private void handleMessage(String raw) {
        if (raw == null) return;
        JSONObject message;
        try {
            message = new JSONObject(raw);
        } catch (Exception error) {
            return;
        }
        String action = message.optString("action");
        if (action.equals("hello")) {
            sendSession();
        } else if (action.equals("openItem") || action.equals("openLibrary")) {
            String id = message.optString("id");
            if (!id.matches("[0-9a-fA-F-]{32,36}")) return;
            Intent intent = new Intent();
            intent.putExtra("ItemId", id);
            if (action.equals("openLibrary")) intent.putExtra("ItemIsUserView", true);
            openJellyfin(intent);
        } else if (action.equals("openJellyfin")) {
            openJellyfin(new Intent());
        } else if (action.equals("play")) {
            String url = message.optString("url");
            if (!url.startsWith("https://") && !url.startsWith("http://")) return;
            Intent intent = new Intent(this, NoctraPlayerActivity.class);
            intent.putExtra(NoctraPlayerActivity.EXTRA_URL, url);
            intent.putExtra(NoctraPlayerActivity.EXTRA_TITLE, message.optString("title"));
            intent.putExtra(NoctraPlayerActivity.EXTRA_SUBTITLE, message.optString("subtitle"));
            intent.putExtra(NoctraPlayerActivity.EXTRA_MIME, message.optString("mime"));
            Uri target = Uri.parse(url);
            // Le jeton ne part que vers le serveur Noctra, jamais vers un autre hôte.
            if (sameOrigin(target, server)) intent.putExtra(NoctraPlayerActivity.EXTRA_TOKEN, session.accessToken);
            try {
                startActivityForResult(intent, PLAYER_REQUEST);
            } catch (ActivityNotFoundException ignored) {
            }
        } else if (action.equals("keepScreenOn")) {
            if (message.optBoolean("data", false)) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else if (action.equals("exit")) {
            moveTaskToBack(true);
        }
    }

    // Écrans Jellyfin : StartupActivity vérifie la session puis ouvre l'écran
    // demandé (NoctraRouting). Retour revient ensuite à l'accueil Noctra.
    private void openJellyfin(Intent intent) {
        intent.setComponent(new ComponentName(this, "org.jellyfin.androidtv.ui.startup.StartupActivity"));
        intent.putExtra(NoctraRouting.EXTRA_OPEN, true);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PLAYER_REQUEST) return;
        try {
            JSONObject message = new JSONObject();
            message.put("type", "playerClosed");
            message.put("ok", resultCode != NoctraPlayerActivity.RESULT_ERROR);
            message.put("error", data == null ? "" : data.getStringExtra(NoctraPlayerActivity.EXTRA_ERROR));
            send(message);
        } catch (Exception ignored) {
        }
    }

    // ── Retour ─────────────────────────────────────────────────────────────
    @Override
    public void onBackPressed() {
        if (customView != null) {
            chromeClient.onHideCustomView();
            return;
        }
        webView.evaluateJavascript(
            "(function(){try{return window.NoctraTV?String(NoctraTV.back()):'exit'}catch(e){return 'exit'}})()",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String result) {
                    String value = result == null ? "" : result.replace("\"", "");
                    if (!value.equals("handled")) moveTaskToBack(true);
                }
            });
    }

    // ── Cycle de vie ───────────────────────────────────────────────────────
    @Override
    protected void onResume() {
        super.onResume();
        if (webView == null) return;
        webView.onResume();
        // Changement d'utilisateur dans les écrans Jellyfin : nouvelle session.
        NoctraSession current = NoctraSession.read(this);
        if (current != null && !current.accessToken.equals(session.accessToken)) {
            session = current;
            sendSession();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            CookieManager.getInstance().flush();
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (hostPort != null) {
            try { hostPort.close(); } catch (Exception ignored) { }
        }
        if (webView != null) {
            root.removeView(webView);
            webView.destroy();
        }
        super.onDestroy();
    }

    private static int port(Uri uri) {
        if (uri.getPort() != -1) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    static boolean sameOrigin(Uri a, Uri b) {
        return a.getScheme() != null && a.getScheme().equalsIgnoreCase(b.getScheme())
            && a.getHost() != null && a.getHost().equalsIgnoreCase(b.getHost())
            && port(a) == port(b);
    }
}
