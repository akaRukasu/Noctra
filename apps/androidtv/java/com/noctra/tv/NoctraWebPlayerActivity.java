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
import android.os.Message;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SafeBrowsingResponse;
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
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
 *
 * Flux repéré : dès que la page (ou un de ses cadres) demande une liste de
 * lecture HLS (.m3u8), son adresse et ses en-têtes (Referer, Origin, cookies,
 * identité) sont transmis au lecteur natif de l'appli, plus stable que la
 * vidéo de la page sur les téléviseurs. Si le lecteur natif échoue, l'accueil
 * rouvre ce lecteur web sans repérage (EXTRA_SNIFF).
 *
 * Pour se comporter comme sur PC (où ces lecteurs fonctionnent) : identité de
 * navigateur de bureau ; cadre configuré comme sur PC (bac à sable et référent
 * propres à chaque fournisseur, ex. aucun référent pour LiveWatch) ; une page
 * ouverte par le lecteur (souvent l'étape publicitaire qui débloque la chaîne)
 * s'affiche comme un nouvel onglet — le lecteur passe en arrière-plan comme
 * sur PC — puis on revient seul au lecteur après quelques secondes (ou avec
 * Retour) ; page ouverte en entier quand elle refuse d'être intégrée
 * (automatique, ou OK maintenu). Une erreur du serveur du lecteur est affichée.
 */
public class NoctraWebPlayerActivity extends Activity {

    static final String EXTRA_URL = "noctra_url";
    static final String EXTRA_TITLE = "noctra_title";
    static final String EXTRA_SUBTITLE = "noctra_subtitle";
    static final String EXTRA_TOKEN = "noctra_token";
    static final String EXTRA_COMPAT = "noctra_compat";
    static final String EXTRA_SANDBOX = "noctra_sandbox";
    static final String EXTRA_REFERRER = "noctra_referrer";
    static final String EXTRA_SNIFF = "noctra_sniff";
    static final String EXTRA_HEADERS = "noctra_headers";
    /** Durée d'affichage d'une page ouverte par le lecteur (souvent sa publicité). */
    private static final int TAB_MS = 8000;
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
    private String source;
    private boolean direct;
    private String diagnostic;
    private String referrer;
    private WebView tab;
    private final Runnable backToPlayer = new Runnable() {
        @Override
        public void run() {
            closeTab();
        }
    };
    private final List<WebView> popups = new ArrayList<WebView>();
    private int crashes;
    private boolean lite;
    private int consoleErrors;
    private int blocked;
    private boolean sniff;
    private volatile boolean handedOff;
    private volatile String userAgent;

    /** Régies publicitaires lourdes, bloquées en mode allégé (après un arrêt du moteur web). */
    private static final String[] AD_HOSTS = {
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adnxs.com", "popads.net", "popcash.net",
        "propellerads.com", "adsterra.com", "exoclick.com", "juicyads.com", "a-ads.com", "adcash.com", "hilltopads.net",
        "clickadu.com", "onclickads.net", "monetag.com", "histats.com", "adskeeper.com", "mgid.com", "taboola.com",
        "outbrain.com", "revcontent.com", "trafficjunky.net", "yandex.ru", "mc.yandex.ru", "adservice.google.com"
    };

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
        NoctraWebLog.start(this, intent.getStringExtra(EXTRA_TITLE) + " · " + url);
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable error) {
                StackTraceElement[] stack = error.getStackTrace();
                NoctraWebLog.add(NoctraWebPlayerActivity.this, "Plantage : " + error + (stack.length > 0 ? " @ " + stack[0] : ""));
                if (previous != null) previous.uncaughtException(thread, error);
            }
        });
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            finishWith(false, "Adresse du lecteur invalide.", null);
            return;
        }
        appBase = NoctraConfig.NOCTRA_URL + "/tv-app/";
        source = url;
        sniff = intent.getBooleanExtra(EXTRA_SNIFF, true);
        referrer = intent.getStringExtra(EXTRA_REFERRER);
        if (referrer == null || referrer.isEmpty()) referrer = "strict-origin-when-cross-origin";

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        try {
            webView = new WebView(this);
        } catch (Throwable error) {
            NoctraWebLog.add(this, "Moteur web indisponible : " + error);
            finishWith(false, "Le moteur web du téléviseur est indisponible (" + error.getClass().getSimpleName() + ").", null);
            return;
        }
        webView.setBackgroundColor(Color.BLACK);
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        hint = new TextView(this);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String subtitle = intent.getStringExtra(EXTRA_SUBTITLE);
        hint.setText((title == null ? "" : title) + (subtitle == null || subtitle.isEmpty() ? "" : "  ·  " + subtitle)
            + "\n◀ ▲ ▼ ▶ déplacer le curseur · OK cliquer (lecture, plein écran) · OK maintenu : page entière · Retour quitter");
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
        Uri.Builder fragment = new Uri.Builder()
            .appendQueryParameter("src", url)
            .appendQueryParameter("token", intent.getStringExtra(EXTRA_TOKEN) == null ? "" : intent.getStringExtra(EXTRA_TOKEN))
            .appendQueryParameter("base", NoctraConfig.NOCTRA_URL)
            .appendQueryParameter("compat", intent.getBooleanExtra(EXTRA_COMPAT, false) ? "1" : "0")
            .appendQueryParameter("referrer", referrer);
        if (intent.hasExtra(EXTRA_SANDBOX)) fragment.appendQueryParameter("sandbox", intent.getStringExtra(EXTRA_SANDBOX));
        webView.loadUrl(page.build().toString() + "#" + fragment.build().getEncodedQuery());
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
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(desktopUserAgent(settings.getUserAgentString()));
        userAgent = settings.getUserAgentString();
        // Navigation sécurisée de la WebView : elle bloque (page blanche) les
        // sites de streaming qu'elle juge douteux, que l'utilisateur ouvre ici
        // volontairement, comme sur son PC.
        if (Build.VERSION.SDK_INT >= 26) {
            try { settings.setSafeBrowsingEnabled(false); } catch (Throwable ignored) { }
            // Moteur web du lecteur gardé en priorité (moins d'arrêts faute de mémoire).
            try { webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false); } catch (Throwable ignored) { }
        }
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (sniff && !handedOff && isStream(request.getUrl())) handOff(request);
                if (lite && isAd(request.getUrl())) {
                    blocked++;
                    return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                }
                return asset(request.getUrl().toString());
            }

            @Override
            public void onSafeBrowsingHit(WebView view, WebResourceRequest request, int threatType, SafeBrowsingResponse callback) {
                NoctraWebLog.add(NoctraWebPlayerActivity.this, "Navigation sécurisée ignorée : " + request.getUrl().getHost());
                callback.proceed(false);
            }

            // Le cadre principal reste la page du lecteur : publicités et
            // redirections « _top » ne remplacent pas la page.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String target = request.getUrl().toString();
                if (target.startsWith(appBase)) return false;
                // Page entière : redirections et pages du même site seulement.
                return !(direct && (request.isRedirect() || sameHost(request.getUrl(), Uri.parse(source))));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith(appBase)) offerChannel();
                else if (url != null) NoctraWebLog.add(NoctraWebPlayerActivity.this, "Page chargée : " + Uri.parse(url).getHost());
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (!isSourceDocument(request)) return;
                int status = response.getStatusCode();
                NoctraWebLog.add(NoctraWebPlayerActivity.this, "Réponse " + status + " : " + request.getUrl().getHost());
                report("Le serveur du lecteur a répondu « erreur " + status + " »"
                    + (status == 403 ? " (accès refusé)" : status == 404 ? " (lecteur introuvable)" : status >= 500 ? " (serveur en panne)" : "")
                    + ". Essayez un autre serveur.");
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!isSourceDocument(request)) return;
                NoctraWebLog.add(NoctraWebPlayerActivity.this, "Injoignable : " + request.getUrl().getHost() + " (" + error.getDescription() + ")");
                report("Le lecteur est injoignable (" + error.getDescription() + "). Essayez un autre serveur.");
            }

            @Override
            public boolean onRenderProcessGone(final WebView view, RenderProcessGoneDetail detail) {
                final boolean crashed = Build.VERSION.SDK_INT >= 26 && detail != null && detail.didCrash();
                NoctraWebLog.add(NoctraWebPlayerActivity.this, crashed ? "Moteur web planté" : "Moteur web arrêté par le système (mémoire)");
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (view != webView) return;
                        // Premier arrêt : nouvel essai allégé (page seule, régies bloquées).
                        if (++crashes == 1 && !finished) restart();
                        else finishWith(false, crashed ? "Le moteur web du téléviseur a planté sur ce lecteur." : "Le lecteur web s'est arrêté (mémoire du téléviseur saturée).", null);
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

            // Fenêtre ouverte par le lecteur (souvent l'étape publicitaire
            // qui débloque la chaîne) : affichée comme un nouvel onglet.
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                try {
                    WebView popup = createTab();
                    WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                    transport.setWebView(popup);
                    resultMsg.sendToTarget();
                    showTab(popup);
                    return true;
                } catch (Throwable error) {
                    return false;
                }
            }

            @Override
            public void onCloseWindow(WebView window) {
                closeWindow(window);
            }

            // Page qui refuse d'être intégrée (X-Frame-Options, CSP) : elle
            // est ouverte en entier, comme un onglet.
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                String text = message == null ? null : message.message();
                if (text != null && message.messageLevel() == ConsoleMessage.MessageLevel.ERROR && consoleErrors++ < 8) {
                    NoctraWebLog.add(NoctraWebPlayerActivity.this, "Erreur de la page : " + text);
                }
                if (text != null && !direct && text.startsWith("Refused to") && (text.contains("X-Frame-Options") || text.contains("frame-ancestors"))) {
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            openDirect();
                        }
                    });
                }
                return false;
            }
        };
        webView.setWebChromeClient(chromeClient);
    }

    /** Liste de lecture HLS demandée par la page ou un de ses cadres (hors publicités et Noctra). */
    private boolean isStream(Uri url) {
        if (url == null || url.getPath() == null || isAd(url)) return false;
        String scheme = url.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) return false;
        if (url.toString().startsWith(appBase)) return false;
        String path = url.getPath().toLowerCase();
        return path.endsWith(".m3u8") || path.endsWith(".m3u") || path.contains(".m3u8/");
    }

    /** Flux trouvé : transmis au lecteur natif avec les en-têtes de la page. */
    private void handOff(WebResourceRequest request) {
        handedOff = true;
        final String media = request.getUrl().toString();
        final org.json.JSONObject headers = new org.json.JSONObject();
        try {
            Map<String, String> sent = request.getRequestHeaders();
            if (sent != null) {
                for (Map.Entry<String, String> entry : sent.entrySet()) {
                    String key = entry.getKey();
                    if (key == null || entry.getValue() == null) continue;
                    String lower = key.toLowerCase();
                    if (lower.equals("referer")) headers.put("Referer", entry.getValue());
                    else if (lower.equals("origin")) headers.put("Origin", entry.getValue());
                    else if (lower.equals("user-agent")) headers.put("User-Agent", entry.getValue());
                }
            }
            // Fil réseau de la WebView : identité mémorisée (aucun appel à la WebView ici).
            if (!headers.has("User-Agent") && userAgent != null) headers.put("User-Agent", userAgent);
            String cookies = CookieManager.getInstance().getCookie(media);
            if (cookies != null && !cookies.isEmpty()) headers.put("Cookie", cookies);
        } catch (Throwable ignored) {
        }
        NoctraWebLog.add(this, "Flux repéré : " + request.getUrl().getHost() + " → lecteur natif");
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (finished) return;
                finished = true;
                Intent data = new Intent();
                data.putExtra(EXTRA_PLAYING, playing);
                data.putExtra(EXTRA_MEDIA, media);
                data.putExtra(EXTRA_HEADERS, headers.toString());
                setResult(RESULT_OK, data);
                finish();
            }
        });
    }

    private static boolean isAd(Uri url) {
        String host = url == null || url.getHost() == null ? "" : url.getHost().toLowerCase();
        for (String ad : AD_HOSTS) {
            if (host.equals(ad) || host.endsWith("." + ad)) return true;
        }
        return false;
    }

    /** Nouvel essai après un arrêt du moteur web : WebView neuve, page seule, sans régies. */
    private void restart() {
        for (WebView popup : popups) destroy(popup);
        popups.clear();
        tab = null;
        handler.removeCallbacks(backToPlayer);
        if (customView != null) chromeClient.onHideCustomView();
        root.removeView(webView);
        destroy(webView);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        root.addView(webView, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        configure();
        lite = true;
        direct = false;
        NoctraWebLog.add(this, "Nouvel essai allégé");
        openDirect();
        if (hint != null) hint.setText("Le moteur web s'est arrêté · nouvel essai allégé (publicités bloquées)…");
    }

    /** Identité du navigateur de bureau (même version de Chrome que la WebView). */
    static String desktopUserAgent(String original) {
        Matcher chrome = Pattern.compile("Chrome/([\\d.]+)").matcher(original == null ? "" : original);
        String version = chrome.find() ? chrome.group(1) : "124.0.0.0";
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + version + " Safari/537.36";
    }

    static boolean sameHost(Uri a, Uri b) {
        if (a == null || b == null || a.getHost() == null || b.getHost() == null) return false;
        String left = a.getHost().toLowerCase();
        String right = b.getHost().toLowerCase();
        return left.equals(right) || left.endsWith("." + right) || right.endsWith("." + left);
    }

    private boolean isSourceDocument(WebResourceRequest request) {
        if (request == null || request.getUrl() == null) return false;
        String url = request.getUrl().toString();
        return request.isForMainFrame() ? direct && sameHost(request.getUrl(), Uri.parse(source)) : url.equals(source);
    }

    /** Erreur du lecteur : affichée à l'écran et transmise à l'accueil à la sortie. */
    private void report(final String message) {
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (finished || playing || hint == null) return;
                diagnostic = message;
                hint.setText(message + "\nRetour : choisir un autre serveur · OK maintenu : page entière");
                hint.animate().cancel();
                hint.setAlpha(1f);
            }
        });
    }

    /** La page du fournisseur, en entier (sans le cadre Noctra), comme sur un onglet de PC. */
    private void openDirect() {
        if (direct || finished || webView == null) return;
        direct = true;
        NoctraWebLog.add(this, "Page entière");
        Map<String, String> headers = new HashMap<String, String>();
        Uri server = Uri.parse(NoctraConfig.NOCTRA_URL);
        // Même provenance que depuis la page Noctra sur PC.
        if (!sameHost(Uri.parse(source), server) && !"no-referrer".equals(referrer)) headers.put("Referer", server.getScheme() + "://" + server.getAuthority() + "/");
        webView.loadUrl(source, headers);
        if (hint != null) {
            hint.setText("Page du lecteur ouverte en entier · ◀ ▲ ▼ ▶ curseur · OK cliquer · Retour quitter");
            hint.animate().cancel();
            hint.setAlpha(1f);
            hint.animate().alpha(0f).setStartDelay(5000).setDuration(500).start();
        }
    }

    // ── Onglets ouverts par le lecteur ─────────────────────────────────────
    private WebView createTab() {
        final WebView popup = new WebView(this);
        popup.setBackgroundColor(Color.BLACK);
        WebSettings settings = popup.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(webView.getSettings().getUserAgentString());
        popup.setWebViewClient(new WebViewClient() {
            // Liens vers une appli (intent:, market:…) ignorés.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("http".equals(scheme) || "https".equals(scheme));
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        closeWindow(popup);
                    }
                });
                return true;
            }
        });
        popup.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView window) {
                closeWindow(window);
            }
        });
        popups.add(popup);
        while (popups.size() > 4) {
            WebView oldest = popups.remove(0);
            if (oldest == tab) closeTab();
            destroy(oldest);
        }
        return popup;
    }

    /** Onglet au premier plan : le lecteur passe en arrière-plan, comme sur PC. */
    private void showTab(WebView popup) {
        if (tab != null) closeTab();
        NoctraWebLog.add(this, "Onglet ouvert par le lecteur");
        tab = popup;
        root.addView(popup, 1, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setVisibility(View.INVISIBLE);
        popup.requestFocus();
        if (hint != null) {
            hint.setText("Page ouverte par le lecteur · retour au lecteur dans " + (TAB_MS / 1000) + " s · Retour : revenir maintenant");
            hint.animate().cancel();
            hint.setAlpha(1f);
        }
        handler.removeCallbacks(backToPlayer);
        handler.postDelayed(backToPlayer, TAB_MS);
    }

    /** Retour au lecteur ; la page ouverte reste chargée tant que le lecteur ne la ferme pas. */
    private void closeTab() {
        handler.removeCallbacks(backToPlayer);
        if (tab == null) return;
        root.removeView(tab);
        tab = null;
        webView.setVisibility(View.VISIBLE);
        webView.requestFocus();
        if (hint != null) {
            hint.setText("Retour au lecteur · OK sur la vidéo pour lancer la lecture");
            hint.animate().cancel();
            hint.setAlpha(1f);
            hint.animate().alpha(0f).setStartDelay(3000).setDuration(500).start();
        }
    }

    private void closeWindow(WebView window) {
        if (window == tab) closeTab();
        if (popups.remove(window)) destroy(window);
    }

    private static void destroy(WebView view) {
        try {
            view.stopLoading();
            view.destroy();
        } catch (Throwable ignored) {
        }
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
            if (state.equals("loaded")) {
                NoctraWebLog.add(this, "Cadre du lecteur chargé");
            } else if (state.equals("playing")) {
                if (!playing) NoctraWebLog.add(this, "Lecture en cours");
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
                // OK maintenu (≈ 1 s) : page du lecteur en entier.
                else if (event.getRepeatCount() == 12 && !direct) openDirect();
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
        if (error == null && !playing) error = diagnostic;
        NoctraWebLog.add(this, "Fin : " + (error != null ? error : ok ? "fermé" : "échec") + (blocked > 0 ? " · " + blocked + " publicités bloquées" : ""));
        if (error != null) data.putExtra(EXTRA_ERROR, error);
        if (media != null) data.putExtra(EXTRA_MEDIA, media);
        setResult(ok ? RESULT_OK : RESULT_ERROR, data);
        finish();
    }

    @Override
    public void onBackPressed() {
        if (tab != null) {
            closeTab();
            return;
        }
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
        for (WebView popup : popups) destroy(popup);
        popups.clear();
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
