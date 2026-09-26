package com.noctra.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;

/**
 * Lecteur web des chaînes (pages des fournisseurs : sports…), dans son propre
 * processus (« :webplayer », voir le manifeste) et sa propre WebView.
 *
 * Ces pages externes (publicités, lecteurs lourds) peuvent saturer la mémoire
 * ou faire planter le moteur web du téléviseur : ici, seul ce processus
 * s'arrête, l'accueil Noctra reste ouvert et propose un autre serveur.
 *
 * Les flèches déplacent un curseur, OK envoie un vrai appui tactile (lecture,
 * plein écran), Retour quitte. Quand le pont du serveur Noctra trouve le flux
 * vidéo, il est renvoyé à l'accueil qui le lit avec le lecteur natif.
 */
public class NoctraWebPlayerActivity extends Activity {

    static final String EXTRA_URL = "noctra_url";
    static final String EXTRA_TITLE = "noctra_title";
    static final String EXTRA_SUBTITLE = "noctra_subtitle";
    static final String EXTRA_TOKEN = "noctra_token";
    static final String EXTRA_COMPAT = "noctra_compat";
    static final String EXTRA_ERROR = "noctra_error";
    static final String EXTRA_MEDIA = "noctra_media";
    static final String EXTRA_PLAYING = "noctra_playing";
    static final int RESULT_ERROR = RESULT_FIRST_USER;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private WebView webView;
    private View cursor;
    private TextView hint;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private WebChromeClient chromeClient;
    private WebMessagePort hostPort;
    private String appBase;
    private float cursorX;
    private float cursorY;
    private boolean playing;
    private boolean finished;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Processus séparé : dossier de données distinct de celui de l'accueil (Android 9+).
        if (Build.VERSION.SDK_INT >= 28) {
            try { WebView.setDataDirectorySuffix("webplayer"); } catch (Throwable ignored) { }
        }
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        Intent intent = getIntent();
        String url = intent.getStringExtra(EXTRA_URL);
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            finishWith(false, "Adresse du lecteur invalide.", null);
            return;
        }
        appBase = NoctraConfig.NOCTRA_URL + "/tv-app/";

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        hint = new TextView(this);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String subtitle = intent.getStringExtra(EXTRA_SUBTITLE);
        hint.setText((title == null ? "" : title) + (subtitle == null || subtitle.isEmpty() ? "" : "  ·  " + subtitle)
            + "\n◀ ▲ ▼ ▶ déplacer le curseur · OK cliquer (lecture, plein écran) · Retour quitter");
        hint.setTextColor(Color.rgb(242, 246, 244));
        hint.setTextSize(15);
        hint.setPadding(dp(18), dp(12), dp(18), dp(12));
        hint.setBackgroundColor(Color.argb(200, 9, 10, 15));
        FrameLayout.LayoutParams hintParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
        hintParams.setMargins(dp(24), dp(20), dp(24), 0);
        root.addView(hint, hintParams);

        cursor = new View(this);
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(Color.argb(235, 242, 246, 244));
        dot.setStroke(dp(3), Color.rgb(9, 10, 15));
        cursor.setBackground(dot);
        root.addView(cursor, new FrameLayout.LayoutParams(dp(22), dp(22)));
        setContentView(root);
        root.post(new Runnable() {
            @Override
            public void run() {
                cursorX = root.getWidth() / 2f;
                cursorY = root.getHeight() / 2f;
                placeCursor();
            }
        });
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (hint != null) hint.animate().alpha(0f).setDuration(500).start();
            }
        }, 8000);

        configure();
        Uri.Builder page = Uri.parse(appBase + "player.html").buildUpon();
        String fragment = new Uri.Builder()
            .appendQueryParameter("src", url)
            .appendQueryParameter("token", intent.getStringExtra(EXTRA_TOKEN) == null ? "" : intent.getStringExtra(EXTRA_TOKEN))
            .appendQueryParameter("base", NoctraConfig.NOCTRA_URL)
            .appendQueryParameter("compat", intent.getBooleanExtra(EXTRA_COMPAT, false) ? "1" : "0")
            .build().getEncodedQuery();
        webView.loadUrl(page.build().toString() + "#" + fragment);
    }

    private void configure() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString().replace("; wv)", ")").replaceAll("Version/[\\d.]+ ", ""));
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return asset(request.getUrl().toString());
            }

            // Le cadre principal reste la page du lecteur : publicités et
            // redirections « _top » ne remplacent pas la page.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return !request.getUrl().toString().startsWith(appBase);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith(appBase)) offerChannel();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        finishWith(false, "Le lecteur web s'est arrêté (mémoire du téléviseur saturée).", null);
                    }
                });
                return true;
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
                cursor.bringToFront();
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                if (customViewCallback != null) customViewCallback.onCustomViewHidden();
                customViewCallback = null;
            }

            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        };
        webView.setWebChromeClient(chromeClient);
    }

    private WebResourceResponse asset(String url) {
        if (!url.startsWith(appBase)) return null;
        String name = url.substring(appBase.length());
        int cut = name.length();
        if (name.indexOf('?') >= 0) cut = Math.min(cut, name.indexOf('?'));
        if (name.indexOf('#') >= 0) cut = Math.min(cut, name.indexOf('#'));
        name = name.substring(0, cut);
        if (!name.equals("player.html") && !name.equals("player.js")) return null;
        String extension = MimeTypeMap.getFileExtensionFromUrl(name);
        try {
            InputStream stream = getAssets().open("noctra-tv/" + name);
            return new WebResourceResponse(extension.equals("js") ? "text/javascript" : "text/html", "utf-8", stream);
        } catch (IOException error) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    private void offerChannel() {
        try {
            if (hostPort != null) hostPort.close();
            WebMessagePort[] channel = webView.createWebMessageChannel();
            hostPort = channel[0];
            hostPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
                @Override
                public void onMessage(WebMessagePort port, WebMessage message) {
                    if (port == hostPort) onPageMessage(message.getData());
                }
            });
            Uri server = Uri.parse(NoctraConfig.NOCTRA_URL);
            webView.postWebMessage(new WebMessage("noctra-host", new WebMessagePort[] { channel[1] }), Uri.parse(server.getScheme() + "://" + server.getAuthority()));
        } catch (Throwable ignored) {
            // Sans canal : le lecteur fonctionne, sans passage automatique au lecteur natif.
        }
    }

    private void onPageMessage(String raw) {
        try {
            JSONObject message = new JSONObject(raw);
            String state = message.optString("state");
            if (state.equals("playing")) {
                playing = true;
                if (hint != null) hint.animate().alpha(0f).setDuration(400).start();
            } else if (state.equals("media")) {
                String media = message.optString("url");
                if (media.startsWith("https://") || media.startsWith("http://")) finishWith(true, null, media);
            } else if (state.equals("error")) {
                finishWith(false, message.optString("message", "Ce lecteur web ne répond pas."), null);
            }
        } catch (Throwable ignored) {
        }
    }

    // ── Curseur ────────────────────────────────────────────────────────────
    private void placeCursor() {
        cursor.setTranslationX(cursorX - dp(11));
        cursor.setTranslationY(cursorY - dp(11));
    }

    private void touch(int action, float x, float y, long downTime) {
        MotionEvent event = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            root.dispatchTouchEvent(event);
        } finally {
            event.recycle();
        }
    }

    private void tap() {
        long downTime = SystemClock.uptimeMillis();
        touch(MotionEvent.ACTION_DOWN, cursorX, cursorY, downTime);
        touch(MotionEvent.ACTION_UP, cursorX, cursorY, downTime);
    }

    private void swipe(float dy) {
        long downTime = SystemClock.uptimeMillis();
        float y = root.getHeight() / 2f;
        touch(MotionEvent.ACTION_DOWN, cursorX, y, downTime);
        for (int i = 1; i <= 5; i++) touch(MotionEvent.ACTION_MOVE, cursorX, y + dy * i / 5f, downTime);
        touch(MotionEvent.ACTION_UP, cursorX, y + dy, downTime);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        boolean move = code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT
            || code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN;
        boolean click = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_NUMPAD_ENTER;
        if ((!move && !click) || root == null) return super.dispatchKeyEvent(event);
        if (event.getAction() != KeyEvent.ACTION_DOWN) return true;
        try {
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
        } catch (Throwable ignored) {
        }
        return true;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    // ── Fin ────────────────────────────────────────────────────────────────
    private void finishWith(boolean ok, String error, String media) {
        if (finished) return;
        finished = true;
        Intent data = new Intent();
        data.putExtra(EXTRA_PLAYING, playing);
        if (error != null) data.putExtra(EXTRA_ERROR, error);
        if (media != null) data.putExtra(EXTRA_MEDIA, media);
        setResult(ok ? RESULT_OK : RESULT_ERROR, data);
        finish();
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            chromeClient.onHideCustomView();
            return;
        }
        finishWith(true, null, null);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (!isFinishing()) finishWith(true, null, null);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (hostPort != null) {
            try { hostPort.close(); } catch (Throwable ignored) { }
        }
        if (webView != null) {
            try {
                root.removeView(webView);
                webView.destroy();
            } catch (Throwable ignored) {
            }
        }
        super.onDestroy();
        // Processus dédié : on le libère entièrement (mémoire du lecteur web).
        android.os.Process.killProcess(android.os.Process.myPid());
    }
}
