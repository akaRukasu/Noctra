package com.noctra.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.graphics.drawable.GradientDrawable;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.RenderProcessGoneDetail;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;

/**
 * Accueil Noctra de l'appli Noctra TV : menu du haut (Accueil, Médiathèques,
 * TV en direct, Découvrir, Demandes, Roulette, Rechercher, compte).
 *
 * L'interface (assets/noctra-tv) est servie par l'appli elle-même sous
 * NOCTRA_URL/tv-app/ : même origine que l'API Noctra et que Jellyfin, sans
 * rien installer sur le serveur. Les fiches, médiathèques et la lecture des
 * films et séries s'ouvrent dans les écrans natifs de Jellyfin ; les chaînes
 * TV dans NoctraPlayerActivity (ExoPlayer) ou NoctraMultiviewActivity.
 *
 * Lecteurs web des chaînes (sports…) : leurs boutons sont dans des pages
 * externes, hors de portée des flèches. Pendant leur affichage, un curseur
 * se déplace avec les flèches et OK envoie un vrai appui tactile.
 *
 * Canal natif : un MessagePort transmis au seul cadre principal, limité à
 * l'origine du serveur. Les lecteurs web des chaînes (iframes) n'y ont pas accès.
 */
public class NoctraHomeActivity extends Activity {

    private static final int PLAYER_REQUEST = 7;
    private static final int MULTIVIEW_REQUEST = 8;

    private FrameLayout root;
    private WebView webView;
    private WebChromeClient chromeClient;
    private WebMessagePort hostPort;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private NoctraSession session;
    private String appBase;
    private Uri server;
    private View cursor;
    private boolean cursorMode;
    private float cursorX;
    private float cursorY;

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
        setContentView(root);
        createWebView("index.html");
    }

    private void createWebView(String page) {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(9, 10, 15));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        root.addView(webView, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        configureWebView();
        webView.loadUrl(appBase + page);
        webView.requestFocus();
    }

    // Le moteur web s'est arrêté (mémoire saturée par un lecteur web, plantage
    // d'une page externe) : sans ce traitement, Android ferme toute l'appli.
    // On repart d'une WebView neuve, sur l'accueil Noctra.
    private void recoverWebView() {
        cursorMode = false;
        if (cursor != null) cursor.setVisibility(View.GONE);
        if (customView != null) {
            root.removeView(customView);
            customView = null;
            customViewCallback = null;
        }
        if (hostPort != null) {
            try { hostPort.close(); } catch (Exception ignored) { }
            hostPort = null;
        }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (webView != null) {
            WebView crashed = webView;
            webView = null;
            root.removeView(crashed);
            try { crashed.destroy(); } catch (Exception ignored) { }
        }
        createWebView("index.html#recovered");
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
        // Signature d'un Chrome Android ordinaire : certains lecteurs web des
        // chaînes refusent les WebView (« ; wv », « Version/4.0 »).
        settings.setUserAgentString(settings.getUserAgentString().replace("; wv)", ")").replaceAll("Version/[\\d.]+ ", ""));

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
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != webView) return true;
                root.post(new Runnable() {
                    @Override
                    public void run() {
                        recoverWebView();
                    }
                });
                return true;
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
                if (cursor != null) cursor.bringToFront();
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
        // Une action qui échoue ne doit jamais fermer l'appli.
        try {
            dispatchAction(raw);
        } catch (Throwable error) {
            try {
                JSONObject message = new JSONObject();
                message.put("type", "nativeError");
                message.put("message", String.valueOf(error.getMessage()));
                send(message);
            } catch (Exception ignored) {
            }
        }
    }

    private void dispatchAction(String raw) {
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
        } else if (action.equals("openSettings")) {
            Intent intent = new Intent();
            intent.setComponent(new ComponentName(this, "org.jellyfin.androidtv.ui.preference.PreferencesActivity"));
            intent.putExtra("screen", "org.jellyfin.androidtv.ui.preference.screen.UserPreferencesScreen");
            try {
                startActivity(intent);
            } catch (ActivityNotFoundException ignored) {
            }
        } else if (action.equals("multiview")) {
            openMultiview(message.optJSONArray("items"));
        } else if (action.equals("cursor")) {
            setCursorMode(message.optBoolean("data", false));
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

    private void openMultiview(JSONArray items) {
        if (items == null || items.length() == 0) return;
        int count = Math.min(4, items.length());
        String[] urls = new String[count];
        String[] titles = new String[count];
        String[] subtitles = new String[count];
        String[] mimes = new String[count];
        boolean[] authorized = new boolean[count];
        for (int i = 0; i < count; i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) return;
            String url = item.optString("url");
            if (!url.startsWith("https://") && !url.startsWith("http://")) return;
            urls[i] = url;
            titles[i] = item.optString("title");
            subtitles[i] = item.optString("subtitle");
            mimes[i] = item.optString("mime");
            authorized[i] = sameOrigin(Uri.parse(url), server);
        }
        Intent intent = new Intent(this, NoctraMultiviewActivity.class);
        intent.putExtra(NoctraMultiviewActivity.EXTRA_URLS, urls);
        intent.putExtra(NoctraMultiviewActivity.EXTRA_TITLES, titles);
        intent.putExtra(NoctraMultiviewActivity.EXTRA_SUBTITLES, subtitles);
        intent.putExtra(NoctraMultiviewActivity.EXTRA_MIMES, mimes);
        intent.putExtra(NoctraMultiviewActivity.EXTRA_AUTHORIZED, authorized);
        intent.putExtra(NoctraMultiviewActivity.EXTRA_TOKEN, session.accessToken);
        try {
            startActivityForResult(intent, MULTIVIEW_REQUEST);
        } catch (ActivityNotFoundException ignored) {
        }
    }

    // ── Curseur des lecteurs web ───────────────────────────────────────────
    private void setCursorMode(boolean enabled) {
        cursorMode = enabled;
        if (enabled && cursor == null) {
            cursor = new View(this);
            GradientDrawable dot = new GradientDrawable();
            dot.setShape(GradientDrawable.OVAL);
            dot.setColor(Color.argb(235, 242, 246, 244));
            dot.setStroke(dp(3), Color.rgb(9, 10, 15));
            cursor.setBackground(dot);
            cursor.setClickable(false);
            cursor.setFocusable(false);
            root.addView(cursor, new FrameLayout.LayoutParams(dp(22), dp(22)));
        }
        if (cursor == null) return;
        if (enabled) {
            cursorX = root.getWidth() / 2f;
            cursorY = root.getHeight() / 2f;
            placeCursor();
            cursor.bringToFront();
            cursor.setVisibility(View.VISIBLE);
        } else {
            cursor.setVisibility(View.GONE);
            webView.requestFocus();
        }
    }

    private void placeCursor() {
        cursor.setTranslationX(cursorX - dp(11));
        cursor.setTranslationY(cursorY - dp(11));
    }

    private void touch(int action, float x, float y, long downTime) {
        MotionEvent event = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        root.dispatchTouchEvent(event);
        event.recycle();
    }

    private void tap() {
        long downTime = SystemClock.uptimeMillis();
        touch(MotionEvent.ACTION_DOWN, cursorX, cursorY, downTime);
        touch(MotionEvent.ACTION_UP, cursorX, cursorY, downTime);
    }

    // Curseur au bord de l'écran : glissement pour faire défiler la page.
    private void swipe(float dy) {
        long downTime = SystemClock.uptimeMillis();
        float x = cursorX;
        float y = root.getHeight() / 2f;
        touch(MotionEvent.ACTION_DOWN, x, y, downTime);
        for (int i = 1; i <= 5; i++) touch(MotionEvent.ACTION_MOVE, x, y + dy * i / 5f, downTime);
        touch(MotionEvent.ACTION_UP, x, y + dy, downTime);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (!cursorMode || webView == null) return super.dispatchKeyEvent(event);
        try {
            return cursorKey(event);
        } catch (Throwable error) {
            return true;
        }
    }

    private boolean cursorKey(KeyEvent event) {
        int code = event.getKeyCode();
        boolean move = code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT
            || code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN;
        boolean click = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_NUMPAD_ENTER;
        if (!move && !click) return super.dispatchKeyEvent(event);
        if (event.getAction() != KeyEvent.ACTION_DOWN) return true;
        if (click) {
            if (event.getRepeatCount() == 0) tap();
            return true;
        }
        float step = dp(14 + Math.min(event.getRepeatCount(), 16) * 4);
        float width = root.getWidth();
        float height = root.getHeight();
        if (code == KeyEvent.KEYCODE_DPAD_LEFT) cursorX -= step;
        else if (code == KeyEvent.KEYCODE_DPAD_RIGHT) cursorX += step;
        else if (code == KeyEvent.KEYCODE_DPAD_UP) cursorY -= step;
        else cursorY += step;
        if (cursorY < 0 && event.getRepeatCount() % 4 == 0) swipe(height / 3f);
        if (cursorY > height && event.getRepeatCount() % 4 == 0) swipe(-height / 3f);
        cursorX = Math.max(0, Math.min(width - 1, cursorX));
        cursorY = Math.max(0, Math.min(height - 1, cursorY));
        placeCursor();
        return true;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
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
            message.put("played", data != null && data.getBooleanExtra(NoctraPlayerActivity.EXTRA_PLAYED, false));
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
        // Retour d'une fiche ou d'une lecture : l'accueil met à jour les reprises.
        try {
            JSONObject message = new JSONObject();
            message.put("type", "resumed");
            send(message);
        } catch (Exception ignored) {
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
