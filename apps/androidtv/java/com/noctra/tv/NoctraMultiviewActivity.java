package com.noctra.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Multiview : jusqu'à 12 chaînes en direct à l'écran, chacune avec son lecteur
 * (NoctraStream, tampon réduit, définition limitée à la taille de sa vignette
 * et décodeur de secours quand ceux du téléviseur sont tous occupés).
 *
 * OK sur une vignette ouvre son menu : écouter cette chaîne (le son reste sur
 * elle même en se déplaçant), la mettre en avant (grande vignette, les autres
 * sur le côté), plein écran, changer de serveur, retirer la chaîne, ou en
 * ajouter une autre (catalogue des sources déjà ouvertes dans l'accueil).
 * Un flux qui tombe passe seul au serveur suivant de la chaîne.
 */
public class NoctraMultiviewActivity extends Activity {

    static final String EXTRA_ITEMS = "noctra_items";
    static final String EXTRA_TOKEN = "noctra_token";
    static final int MAX_TILES = 12;

    /**
     * Chaînes proposées par « Ajouter une chaîne » : [{title, subtitle, group,
     * stream, mime, resolver}], posé par l'accueil juste avant l'ouverture
     * (même processus ; trop volumineux pour l'Intent).
     */
    static volatile String catalog;

    /** Multiview ouvert (commandes du téléphone : ajouter, retirer, mettre en avant, son). */
    static volatile NoctraMultiviewActivity active;
    /** État envoyé au téléphone : {tiles:[{title, subtitle}], audio, featured} ; vide hors multiview. */
    static volatile String state = "{\"tiles\":[]}";
    /** Prévenu à chaque changement (l'accueil le transmet au téléphone). */
    static volatile Runnable onChange;

    private static final int ACCENT = Color.rgb(112, 217, 194);
    private static final int GAP = 6;

    private final List<Tile> tiles = new ArrayList<Tile>();
    private FrameLayout root;
    private String token;
    private Tile audio;
    private Tile featured;
    private Tile zoomed;

    private static final class Option {
        String label;
        String url;
        String resolve;
        String mime;
        /** Lecteur d'un site : la page est ouverte dans la vignette, son flux repéré puis lu en natif. */
        String page = "";
        String sandbox;
        String referrer = "strict-origin-when-cross-origin";
        /** En-têtes de la page pour le flux repéré (Referer, Origin, User-Agent, Cookie). */
        Map<String, String> headers;
    }

    /** Délai du repérage du flux d'une page de site avant le serveur suivant. */
    private static final long SNIFF_MS = 35000;

    /** Délais des nouveaux essais d'une vignette dont tous les serveurs ont échoué. */
    private static final long[] RETRY_MS = { 20000, 45000, 90000, 180000 };
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());

    private final class Tile implements NoctraStream.Callback {
        FrameLayout frame;
        PlayerView view;
        TextView label;
        TextView status;
        NoctraStream stream;
        String title;
        String subtitle;
        int maxWidth;
        int maxHeight;
        final List<Option> options = new ArrayList<Option>();
        final List<Integer> failed = new ArrayList<Integer>();
        int current = -1;
        int generation;
        /** Dernier lien neuf demandé au même serveur (coupure après lecture). */
        long renewedAt;
        int retries;
        Runnable retry;
        /** Page d'un site ouverte pour repérer son flux (détruite dès qu'il est trouvé). */
        WebView web;

        @Override
        public void onStatus(NoctraStream source, String text) {
            if (source != stream) return;
            showStatus(this, text);
        }

        @Override
        public void onReadyChanged(NoctraStream source, boolean ready) {
            // Lecture établie : les nouveaux essais repartent de zéro.
            if (source == stream && ready) {
                retries = 0;
                failed.clear();
            }
        }

        @Override
        public void onEnded(NoctraStream source) {
            // Un direct ne se termine pas (géré par NoctraStream).
        }

        @Override
        public void onFailed(NoctraStream source, String message) {
            if (source != stream) return;
            Option option = current >= 0 && current < options.size() ? options.get(current) : null;
            long now = System.currentTimeMillis();
            // Coupure d'un flux qui fonctionnait : lien neuf du même serveur
            // (jeton expiré le plus souvent), au plus une fois toutes les 2 min.
            if (source.hasPlayed() && option != null && (!option.resolve.isEmpty() || !option.page.isEmpty()) && now - renewedAt > 120000) {
                renewedAt = now;
                option.url = "";
                showStatus(this, "Reconnexion au serveur…");
                play(this, current);
                return;
            }
            if (source.hasPlayed()) retries = 0;
            if (!failed.contains(current)) failed.add(current);
            int next = nextOption(this);
            if (next >= 0) {
                showStatus(this, "Serveur indisponible · essai du suivant…");
                play(this, next);
            } else if (message != null && message.contains("DECODER")) {
                showStatus(this, "Le téléviseur ne peut pas décoder un flux de plus.");
            } else {
                scheduleRetry(this);
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        token = getIntent().getStringExtra(EXTRA_TOKEN);
        JSONArray items;
        try {
            items = new JSONArray(getIntent().getStringExtra(EXTRA_ITEMS));
        } catch (Exception error) {
            finish();
            return;
        }
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(5, 6, 9));
        setContentView(root);
        for (int i = 0; i < items.length() && tiles.size() < MAX_TILES; i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            Tile tile = createTile(item.optString("title"), item.optString("subtitle"));
            JSONArray options = item.optJSONArray("options");
            for (int j = 0; options != null && j < options.length(); j++) {
                JSONObject source = options.optJSONObject(j);
                if (source == null) continue;
                Option option = new Option();
                option.label = source.optString("label", "Serveur " + (j + 1));
                option.url = source.optString("url", "");
                option.resolve = source.optString("resolve", "");
                option.mime = source.optString("mime", "");
                option.page = source.optString("page", "");
                option.sandbox = source.isNull("sandbox") ? null : source.optString("sandbox", null);
                option.referrer = source.optString("referrer", option.referrer);
                if (!option.url.isEmpty() || !option.resolve.isEmpty() || !option.page.isEmpty()) tile.options.add(option);
            }
            if (tile.options.isEmpty()) continue;
            tiles.add(tile);
            root.addView(tile.frame);
        }
        if (tiles.isEmpty()) {
            finish();
            return;
        }
        audio = tiles.get(0);
        root.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View view, int left, int top, int right, int bottom, int oldLeft, int oldTop, int oldRight, int oldBottom) {
                if (right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) arrange();
            }
        });
        // Démarrages échelonnés : 12 connexions et décodeurs à la fois
        // saturent les petits boîtiers (échecs au lancement).
        for (int i = 0; i < tiles.size(); i++) {
            final Tile tile = tiles.get(i);
            if (i == 0) {
                play(tile, 0);
                continue;
            }
            showStatus(tile, "Connexion…");
            final int generation = tile.generation;
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (!isFinishing() && generation == tile.generation && tile.stream == null) play(tile, 0);
                }
            }, i * 400L);
        }
        refreshLabels();
        tiles.get(0).frame.requestFocus();
        active = this;
        publish();
    }

    // ── Commandes du téléphone (Noctra mobile) ─────────────────────────────
    /**
     * {command: add|remove|feature|audio|solo|grid|close, index, item:{title, subtitle, options}}.
     * « solo » met la chaîne en avant et n'écoute qu'elle.
     */
    static void remote(final JSONObject message) {
        final NoctraMultiviewActivity activity = active;
        if (activity == null) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (activity.isFinishing() || active != activity) return;
                activity.command(message);
            }
        });
    }

    private void command(JSONObject message) {
        String command = message.optString("command");
        int index = message.optInt("index", -1);
        Tile tile = index >= 0 && index < tiles.size() ? tiles.get(index) : null;
        if (command.equals("add")) {
            JSONObject item = message.optJSONObject("item");
            if (item == null || tiles.size() >= MAX_TILES) return;
            Tile added = createTile(item.optString("title"), item.optString("subtitle"));
            JSONArray options = item.optJSONArray("options");
            for (int j = 0; options != null && j < options.length(); j++) {
                JSONObject source = options.optJSONObject(j);
                if (source == null) continue;
                Option option = new Option();
                option.label = source.optString("label", "Serveur " + (j + 1));
                option.url = source.optString("url", "");
                option.resolve = source.optString("resolve", "");
                option.mime = source.optString("mime", "");
                if (!option.url.isEmpty() || !option.resolve.isEmpty()) added.options.add(option);
            }
            if (added.options.isEmpty()) return;
            tiles.add(added);
            root.addView(added.frame);
            zoomed = null;
            arrange();
            play(added, 0);
            added.frame.requestFocus();
        } else if (command.equals("close")) {
            finish();
            return;
        } else if (tile == null) {
            if (command.equals("grid")) { featured = null; zoomed = null; arrange(); }
        } else if (command.equals("remove")) {
            removeTile(tile);
            return;
        } else if (command.equals("audio")) {
            audio = tile;
        } else if (command.equals("feature")) {
            featured = tiles.size() > 1 && featured != tile ? tile : null;
            zoomed = null;
            arrange();
        } else if (command.equals("solo")) {
            audio = tile;
            featured = tiles.size() > 1 ? tile : null;
            zoomed = null;
            arrange();
            tile.frame.requestFocus();
        }
        refreshLabels();
    }

    private void publish() {
        try {
            JSONObject value = new JSONObject();
            JSONArray list = new JSONArray();
            for (Tile tile : tiles) list.put(new JSONObject().put("title", tile.title).put("subtitle", tile.subtitle));
            value.put("tiles", list);
            value.put("audio", tiles.indexOf(audio));
            value.put("featured", featured == null ? -1 : tiles.indexOf(featured));
            state = value.toString();
        } catch (Exception ignored) {
        }
        Runnable listener = onChange;
        if (listener != null) listener.run();
    }

    // ── Vignettes ──────────────────────────────────────────────────────────
    private Tile createTile(String title, String subtitle) {
        final Tile tile = new Tile();
        tile.title = title;
        tile.subtitle = subtitle;
        tile.frame = new FrameLayout(this);
        tile.frame.setFocusable(true);
        tile.frame.setPadding(dp(4), dp(4), dp(4), dp(4));
        tile.frame.setBackground(border(false));
        tile.view = new PlayerView(this);
        tile.view.setUseController(false);
        tile.view.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        tile.view.setKeepContentOnPlayerReset(true);
        tile.view.setFocusable(false);
        tile.frame.addView(tile.view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        tile.label = text(15);
        tile.label.setSingleLine(true);
        FrameLayout.LayoutParams labelParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        labelParams.setMargins(dp(10), 0, dp(10), dp(10));
        tile.frame.addView(tile.label, labelParams);

        tile.status = text(15);
        tile.status.setVisibility(View.GONE);
        tile.frame.addView(tile.status, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        tile.frame.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View view, boolean hasFocus) {
                tile.frame.setBackground(border(hasFocus));
            }
        });
        tile.frame.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                menu(tile);
            }
        });
        return tile;
    }

    private TextView text(int size) {
        TextView view = new TextView(this);
        view.setTextColor(Color.rgb(242, 246, 244));
        view.setTextSize(size);
        view.setPadding(dp(12), dp(6), dp(12), dp(6));
        view.setBackgroundColor(Color.argb(180, 9, 10, 15));
        return view;
    }

    private GradientDrawable border(boolean active) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.BLACK);
        drawable.setCornerRadius(dp(10));
        drawable.setStroke(dp(3), active ? ACCENT : Color.rgb(28, 31, 42));
        return drawable;
    }

    private void showStatus(Tile tile, String text) {
        tile.status.setText(text == null ? "" : text);
        tile.status.setVisibility(text == null ? View.GONE : View.VISIBLE);
    }

    private void refreshLabels() {
        float size = tiles.size() > 6 ? 12 : tiles.size() > 4 ? 13 : 15;
        for (Tile tile : tiles) {
            tile.label.setTextSize(size);
            tile.status.setTextSize(size);
            Option option = tile.current >= 0 && tile.current < tile.options.size() ? tile.options.get(tile.current) : null;
            String server = option == null || tile.options.size() < 2 ? "" : "  ·  " + option.label;
            tile.label.setText((tile == audio ? "♪  " : "") + tile.title + (tile.subtitle.isEmpty() ? "" : "  ·  " + tile.subtitle) + server);
            if (tile.stream != null) tile.stream.setVolume(tile == audio ? 1f : 0f);
        }
        if (active == this) publish();
    }

    // ── Disposition : grille, écran mis en avant, plein écran ──────────────
    // Grille : 1, 2 (côte à côte, 16:9), 2 × 2, 3 × 2, 3 × 3 puis 4 × 3 ;
    // dernière rangée incomplète centrée. Mis en avant : grande vignette à
    // gauche, les autres sur une ou deux colonnes à droite.
    private void arrange() {
        int width = root.getWidth();
        int height = root.getHeight();
        if (width == 0 || height == 0) return;
        int gap = dp(GAP);
        int count = tiles.size();
        boolean side = featured != null && count > 1;
        int others = count - 1;
        int sideColumns = others > 4 ? 2 : 1;
        int mainWidth = Math.round(width * (sideColumns == 2 ? 0.6f : 0.7f));
        int columns = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
        int rows = (count + columns - 1) / columns;
        for (int i = 0; i < count; i++) {
            Tile tile = tiles.get(i);
            int x, y, w, h;
            boolean large = false;
            if (zoomed != null) {
                boolean visible = tile == zoomed;
                tile.frame.setVisibility(visible ? View.VISIBLE : View.GONE);
                x = 0; y = 0; w = width; h = height;
                large = visible;
            } else if (side) {
                tile.frame.setVisibility(View.VISIBLE);
                if (tile == featured) {
                    x = gap; y = gap; w = mainWidth - gap * 2; h = height - gap * 2;
                    large = true;
                } else {
                    int position = 0;
                    for (Tile other : tiles) {
                        if (other == tile) break;
                        if (other != featured) position++;
                    }
                    int sideRows = (others + sideColumns - 1) / sideColumns;
                    int slotW = (width - mainWidth) / sideColumns;
                    int slotH = (height - gap) / Math.max(sideRows, 1);
                    x = mainWidth + (position % sideColumns) * slotW; y = gap + (position / sideColumns) * slotH;
                    w = slotW - gap; h = slotH - gap;
                }
            } else {
                tile.frame.setVisibility(View.VISIBLE);
                int cellW = (width - gap) / columns;
                int cellH = (height - gap) / rows;
                if (count == 2) cellH = Math.min(height - gap * 2, Math.round((cellW - gap) * 9f / 16f) + gap);
                int top = count == 2 ? (height - cellH) / 2 : 0;
                int row = i / columns;
                int inRow = row == rows - 1 ? count - row * columns : columns;
                int shift = (columns - inRow) * cellW / 2;
                x = gap + shift + (i % columns) * cellW; y = top + gap + row * cellH;
                w = cellW - gap; h = cellH - gap;
                large = count == 1;
            }
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(Math.max(1, w), Math.max(1, h));
            params.leftMargin = x;
            params.topMargin = y;
            tile.frame.setLayoutParams(params);
            // Définition adaptée à la vignette (flux HLS à plusieurs qualités) :
            // moins de débit et de décodage, donc plus de chaînes simultanées.
            tile.maxWidth = large ? Integer.MAX_VALUE : Math.max(640, w * 3 / 2);
            tile.maxHeight = large ? Integer.MAX_VALUE : Math.max(360, h * 3 / 2);
            if (tile.stream != null) tile.stream.setMaxVideoSize(tile.maxWidth, tile.maxHeight);
        }
    }

    private void menu(final Tile tile) {
        final List<String> labels = new ArrayList<String>();
        final List<Runnable> actions = new ArrayList<Runnable>();
        if (tile != audio) {
            labels.add("♪  Écouter cette chaîne");
            actions.add(new Runnable() { @Override public void run() { audio = tile; refreshLabels(); } });
        }
        if (tiles.size() > 1) {
            labels.add(featured == tile ? "Revenir à la grille" : "Mettre en avant");
            actions.add(new Runnable() { @Override public void run() { featured = featured == tile ? null : tile; arrange(); publish(); tile.frame.requestFocus(); } });
        }
        labels.add(zoomed == tile ? "Quitter le plein écran" : "Plein écran");
        actions.add(new Runnable() { @Override public void run() { zoomed = zoomed == tile ? null : tile; arrange(); tile.frame.requestFocus(); } });
        if (tile.options.size() > 1 || !tile.failed.isEmpty()) {
            labels.add("Changer de serveur (" + tile.options.size() + ")");
            actions.add(new Runnable() { @Override public void run() { servers(tile); } });
        }
        if (tiles.size() < MAX_TILES && !channels().isEmpty()) {
            labels.add("＋  Ajouter une chaîne (" + tiles.size() + "/" + MAX_TILES + ")");
            actions.add(new Runnable() { @Override public void run() { addChannel(); } });
        }
        labels.add(tiles.size() > 1 ? "✕  Retirer cette chaîne" : "✕  Retirer cette chaîne et quitter");
        actions.add(new Runnable() { @Override public void run() { removeTile(tile); } });
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(tile.title)
            .setItems(labels.toArray(new String[0]), new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    actions.get(which).run();
                }
            })
            .show();
    }

    private void servers(final Tile tile) {
        String[] labels = new String[tile.options.size()];
        for (int i = 0; i < labels.length; i++) {
            Option option = tile.options.get(i);
            labels[i] = (i == tile.current ? "▶  " : "") + option.label
                + (option.url.isEmpty() ? "  (automatique)" : "") + (tile.failed.contains(i) ? "  · échec" : "");
        }
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(tile.title + " · serveurs")
            .setItems(labels, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    tile.failed.remove(Integer.valueOf(which));
                    play(tile, which);
                }
            })
            .show();
    }

    // ── Ajouter et retirer des chaînes ─────────────────────────────────────
    private List<JSONObject> channelList;

    private List<JSONObject> channels() {
        if (channelList != null) return channelList;
        channelList = new ArrayList<JSONObject>();
        try {
            JSONArray list = new JSONArray(catalog == null ? "[]" : catalog);
            for (int i = 0; i < list.length(); i++) {
                JSONObject channel = list.optJSONObject(i);
                if (channel != null && (!channel.optString("stream").isEmpty() || !channel.optString("resolver").isEmpty())) channelList.add(channel);
            }
        } catch (Exception ignored) {
        }
        return channelList;
    }

    private boolean present(JSONObject channel) {
        for (Tile tile : tiles) {
            if (tile.title.equals(channel.optString("title")) && tile.subtitle.equals(channel.optString("subtitle"))) return true;
        }
        return false;
    }

    /** Catalogue : d'abord le groupe (source, bouquet, catégorie), puis la chaîne. */
    private void addChannel() {
        final Map<String, List<JSONObject>> groups = new LinkedHashMap<String, List<JSONObject>>();
        for (JSONObject channel : channels()) {
            if (present(channel)) continue;
            String group = channel.optString("group", "Chaînes");
            if (!groups.containsKey(group)) groups.put(group, new ArrayList<JSONObject>());
            groups.get(group).add(channel);
        }
        if (groups.isEmpty()) {
            Toast.makeText(this, "Toutes les chaînes disponibles sont déjà affichées.", Toast.LENGTH_LONG).show();
            return;
        }
        if (groups.size() == 1) {
            pickChannel(groups.keySet().iterator().next(), groups.values().iterator().next());
            return;
        }
        final List<String> names = new ArrayList<String>(groups.keySet());
        String[] labels = new String[names.size()];
        for (int i = 0; i < labels.length; i++) labels[i] = names.get(i) + "  (" + groups.get(names.get(i)).size() + ")";
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Ajouter une chaîne")
            .setItems(labels, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    pickChannel(names.get(which), groups.get(names.get(which)));
                }
            })
            .show();
    }

    private void pickChannel(String group, final List<JSONObject> list) {
        String[] labels = new String[list.size()];
        for (int i = 0; i < labels.length; i++) labels[i] = list.get(i).optString("title", "Chaîne " + (i + 1));
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(group)
            .setItems(labels, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    addTile(list.get(which));
                }
            })
            .show();
    }

    private void addTile(final JSONObject channel) {
        if (tiles.size() >= MAX_TILES) return;
        final Tile tile = createTile(channel.optString("title"), channel.optString("subtitle"));
        tiles.add(tile);
        root.addView(tile.frame);
        zoomed = null;
        arrange();
        refreshLabels();
        tile.frame.requestFocus();
        String stream = channel.optString("stream");
        if (!stream.isEmpty()) {
            Option option = new Option();
            option.label = "Flux direct";
            option.url = stream;
            option.resolve = "";
            option.mime = channel.optString("mime");
            tile.options.add(option);
            play(tile, 0);
            return;
        }
        // Serveurs de la chaîne demandés au serveur Noctra.
        showStatus(tile, "Recherche des serveurs…");
        final String resolver = channel.optString("resolver");
        final String mime = channel.optString("mime");
        new Thread(new Runnable() {
            @Override
            public void run() {
                final List<Option> found = options(resolver, mime);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (isFinishing() || !tiles.contains(tile)) return;
                        if (found.isEmpty()) {
                            removeTile(tile);
                            Toast.makeText(NoctraMultiviewActivity.this, channel.optString("title") + " : aucun flux direct (lecteur web seulement).", Toast.LENGTH_LONG).show();
                            return;
                        }
                        tile.options.addAll(found);
                        play(tile, 0);
                    }
                });
            }
        }).start();
    }

    private void removeTile(Tile tile) {
        tile.generation++;
        closePage(tile);
        if (tile.stream != null) tile.stream.release();
        tile.stream = null;
        int index = tiles.indexOf(tile);
        tiles.remove(tile);
        root.removeView(tile.frame);
        if (tiles.isEmpty()) {
            finish();
            return;
        }
        if (featured == tile) featured = null;
        if (zoomed == tile) zoomed = null;
        if (audio == tile) audio = tiles.get(0);
        arrange();
        refreshLabels();
        tiles.get(Math.max(0, Math.min(index, tiles.size() - 1))).frame.requestFocus();
    }

    /** Serveurs d'une chaîne (réponse du résolveur Noctra) utilisables dans une vignette. */
    private List<Option> options(String address, String mime) {
        List<Option> direct = new ArrayList<Option>();
        List<Option> automatic = new ArrayList<Option>();
        List<Option> pages = new ArrayList<Option>();
        JSONObject result = fetch(address);
        if (result == null) return direct;
        try {
            URL base = new URL(address);
            JSONArray list = result.optJSONArray("options");
            if (list == null) list = new JSONArray().put(result);
            for (int i = 0; i < list.length(); i++) {
                JSONObject item = list.optJSONObject(i);
                if (item == null || item.optBoolean("manualOnly", false)) continue;
                String stream = item.optString("streamUrl", "");
                String resolve = item.optString("resolveUrl", "");
                String page = item.optString("url", "");
                Option option = new Option();
                option.label = item.optString("label", "");
                option.url = "";
                option.resolve = "";
                option.mime = item.optString("transport").matches("(?i)ts|mpegts|mpeg-ts") ? "video/mp2t" : mime;
                if (!stream.isEmpty()) {
                    option.url = new URL(base, stream).toString();
                    if (option.label.isEmpty()) option.label = "Flux direct";
                    direct.add(option);
                } else if (!resolve.isEmpty() && page.isEmpty()) {
                    option.resolve = new URL(base, resolve).toString();
                    if (option.label.isEmpty()) option.label = "Serveur " + (i + 1);
                    automatic.add(option);
                } else if (!page.isEmpty() && !new URL(base, page).getHost().toLowerCase().contains("livewatch.")) {
                    // Lecteur d'un site : flux repéré sur sa page (jamais la page publique LiveWatch, avec publicités).
                    option.page = new URL(base, page).toString();
                    if (option.label.isEmpty()) option.label = "Lecteur du site";
                    pages.add(option);
                }
            }
        } catch (Exception ignored) {
        }
        direct.addAll(automatic);
        direct.addAll(pages);
        return direct;
    }

    // ── Lecture et changement de serveur ───────────────────────────────────
    private int nextOption(Tile tile) {
        for (int step = 1; step <= tile.options.size(); step++) {
            int index = (tile.current + step) % tile.options.size();
            if (!tile.failed.contains(index)) return index;
        }
        return -1;
    }

    /**
     * Tous les serveurs de la vignette ont échoué : nouvel essai de toute la
     * liste après 20 s, 45 s, 1 min 30 puis 3 min (coupure passagère d'une source).
     */
    private void scheduleRetry(final Tile tile) {
        if (tile.retries >= RETRY_MS.length) {
            showStatus(tile, "Flux indisponible · OK › Changer de serveur");
            return;
        }
        final long delay = RETRY_MS[tile.retries++];
        final int generation = tile.generation;
        showStatus(tile, "Flux indisponible · nouvel essai dans " + (delay / 1000) + " s");
        if (tile.retry != null) handler.removeCallbacks(tile.retry);
        tile.retry = new Runnable() {
            @Override
            public void run() {
                if (isFinishing() || generation != tile.generation) return;
                tile.failed.clear();
                for (Option option : tile.options) {
                    if (!option.resolve.isEmpty() || !option.page.isEmpty()) option.url = "";
                }
                play(tile, 0);
            }
        };
        handler.postDelayed(tile.retry, delay);
    }

    private void play(final Tile tile, final int index) {
        if (tile.retry != null) handler.removeCallbacks(tile.retry);
        if (tile.stream != null) tile.stream.release();
        tile.stream = null;
        closePage(tile);
        tile.current = index;
        final int generation = ++tile.generation;
        refreshLabels();
        final Option option = tile.options.get(index);
        if (!option.url.isEmpty()) {
            start(tile, option);
            return;
        }
        if (!option.page.isEmpty()) {
            sniff(tile, option, index, generation);
            return;
        }
        // Serveur « automatique » : le serveur Noctra fournit le flux à la demande.
        showStatus(tile, "Connexion à " + option.label + "…");
        new Thread(new Runnable() {
            @Override
            public void run() {
                final String url = resolve(option.resolve);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (isFinishing() || generation != tile.generation) return;
                        if (url == null) {
                            if (!tile.failed.contains(index)) tile.failed.add(index);
                            int next = nextOption(tile);
                            if (next >= 0) play(tile, next);
                            else scheduleRetry(tile);
                            return;
                        }
                        option.url = url;
                        start(tile, option);
                    }
                });
            }
        }).start();
    }

    private void start(Tile tile, Option option) {
        String url = option.url;
        boolean ours = NoctraHomeActivity.sameOrigin(Uri.parse(url), Uri.parse(NoctraConfig.NOCTRA_URL));
        if (option.headers != null && !option.headers.isEmpty()) {
            // Flux repéré sur la page d'un site : lu avec les en-têtes de la page (jeton Noctra pour nos adresses).
            Map<String, String> headers = new HashMap<String, String>(option.headers);
            if (ours && token != null) headers.put("x-noctra-token", token);
            tile.stream = new NoctraStream(this, tile.view, tile, url, option.mime, headers, true, true, 0);
        } else {
            tile.stream = new NoctraStream(this, tile.view, tile, url, option.mime, ours ? token : null, true);
        }
        tile.stream.setVolume(tile == audio ? 1f : 0f);
        if (tile.maxWidth > 0) tile.stream.setMaxVideoSize(tile.maxWidth, tile.maxHeight);
        tile.stream.start();
    }

    // ── Lecteurs des sites : flux repéré sur la page ───────────────────────
    /**
     * Page du lecteur ouverte dans la vignette (comme le lecteur web de Noctra TV) ; la première liste
     * HLS qu'elle demande est reprise par le lecteur natif de la vignette, avec les en-têtes de la page :
     * son, définition et changement de serveur restent ceux du multiview. Sans flux en 35 s : serveur suivant.
     */
    @SuppressWarnings("SetJavaScriptEnabled")
    private void sniff(final Tile tile, final Option option, final int index, final int generation) {
        showStatus(tile, "Lecteur du site · recherche du flux…");
        final WebView web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(false);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(NoctraWebPlayerActivity.desktopUserAgent(settings.getUserAgentString()));
        final String agent = settings.getUserAgentString();
        if (Build.VERSION.SDK_INT >= 26) {
            try { settings.setSafeBrowsingEnabled(false); } catch (Throwable ignored) { }
        }
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        final boolean[] found = { false };
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!found[0] && isStream(url)) {
                    found[0] = true;
                    final Map<String, String> headers = new HashMap<String, String>();
                    Map<String, String> sent = request.getRequestHeaders();
                    if (sent != null) {
                        for (Map.Entry<String, String> entry : sent.entrySet()) {
                            if (entry.getKey() == null || entry.getValue() == null) continue;
                            String lower = entry.getKey().toLowerCase();
                            if (lower.equals("referer")) headers.put("Referer", entry.getValue());
                            else if (lower.equals("origin")) headers.put("Origin", entry.getValue());
                            else if (lower.equals("user-agent")) headers.put("User-Agent", entry.getValue());
                        }
                    }
                    if (!headers.containsKey("User-Agent")) headers.put("User-Agent", agent);
                    String cookies = CookieManager.getInstance().getCookie(url.toString());
                    if (cookies != null && !cookies.isEmpty()) headers.put("Cookie", cookies);
                    final String media = url.toString();
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (isFinishing() || generation != tile.generation) return;
                            closePage(tile);
                            option.url = media;
                            option.headers = headers;
                            option.mime = "";
                            start(tile, option);
                        }
                    });
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Page principale : jamais quittée pour une publicité ou une autre appli.
                return request.isForMainFrame() && found[0];
            }

            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                if (tile.web == view) tile.web = null;
                ((ViewGroup) view.getParent()).removeView(view);
                view.destroy();
                pageFailed(tile, index, generation);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        tile.web = web;
        // Sous le libellé et l'état : la page est visible le temps du repérage.
        tile.frame.addView(web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        String sandbox = option.sandbox == null ? "" : " sandbox=\"" + attribute(option.sandbox) + "\"";
        String html = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style></head>"
            + "<body><iframe src=\"" + attribute(option.page) + "\"" + sandbox + " referrerpolicy=\"" + attribute(option.referrer) + "\""
            + " allow=\"autoplay *; fullscreen *; encrypted-media *\" allowfullscreen></iframe></body></html>";
        web.loadDataWithBaseURL(NoctraConfig.NOCTRA_URL + "/", html, "text/html", "utf-8", null);
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (isFinishing() || generation != tile.generation || found[0]) return;
                closePage(tile);
                pageFailed(tile, index, generation);
            }
        }, SNIFF_MS);
    }

    private void pageFailed(Tile tile, int index, int generation) {
        if (isFinishing() || generation != tile.generation) return;
        if (!tile.failed.contains(index)) tile.failed.add(index);
        int next = nextOption(tile);
        if (next >= 0) {
            showStatus(tile, "Lecteur du site sans flux · essai du suivant…");
            play(tile, next);
        } else {
            scheduleRetry(tile);
        }
    }

    private void closePage(Tile tile) {
        WebView web = tile.web;
        tile.web = null;
        if (web == null) return;
        try {
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.stopLoading();
            web.destroy();
        } catch (Throwable ignored) {
        }
    }

    /** Liste HLS demandée par la page (pas une publicité ni un script). */
    private static boolean isStream(Uri url) {
        if (url == null || url.getPath() == null) return false;
        String scheme = url.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) return false;
        String text = url.toString().toLowerCase();
        if (text.contains("/tv-app/") || text.matches(".*(?:^|[/._=?&-])(?:ads?|vast|vpaid|preroll|advert[a-z]*|adserver|doubleclick|imasdk)(?:[/._=?&-]|$).*")) return false;
        String path = url.getPath().toLowerCase();
        String query = url.getEncodedQuery() == null ? "" : url.getEncodedQuery().toLowerCase();
        return path.contains(".m3u8") || path.endsWith(".m3u")
            || (query.contains(".m3u8") && !path.matches(".*\\.(?:js|html?|php|css)$"));
    }

    private static String attribute(String value) {
        return value == null ? "" : value.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;");
    }

    private String resolve(String address) {
        JSONObject result = fetch(address);
        if (result == null) return null;
        try {
            URL target = new URL(address);
            JSONArray options = result.optJSONArray("options");
            if (options == null) {
                String direct = result.optString("streamUrl", "");
                return direct.isEmpty() ? null : new URL(target, direct).toString();
            }
            for (int i = 0; i < options.length(); i++) {
                JSONObject option = options.optJSONObject(i);
                if (option == null || option.optBoolean("manualOnly", false)) continue;
                String stream = option.optString("streamUrl", "");
                if (!stream.isEmpty()) return new URL(target, stream).toString();
            }
            return null;
        } catch (Exception error) {
            return null;
        }
    }

    private JSONObject fetch(String address) {
        HttpURLConnection connection = null;
        try {
            URL target = new URL(address);
            connection = (HttpURLConnection) target.openConnection();
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(30000);
            if (token != null && NoctraHomeActivity.sameOrigin(Uri.parse(address), Uri.parse(NoctraConfig.NOCTRA_URL))) {
                connection.setRequestProperty("x-noctra-token", token);
            }
            if (connection.getResponseCode() != 200) return null;
            InputStream input = connection.getInputStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = input.read(chunk)) != -1) buffer.write(chunk, 0, read);
            input.close();
            return new JSONObject(buffer.toString("UTF-8"));
        } catch (Exception error) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // En plein écran, les flèches ne quittent pas la vignette agrandie.
        if (zoomed != null && event.getAction() == KeyEvent.ACTION_DOWN) {
            int code = event.getKeyCode();
            if (code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT
                || code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN) return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (zoomed != null) {
            Tile tile = zoomed;
            zoomed = null;
            arrange();
            tile.frame.requestFocus();
            return;
        }
        finish();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (!isFinishing()) finish();
    }

    @Override
    protected void onDestroy() {
        if (active == this) {
            active = null;
            state = "{\"tiles\":[]}";
            Runnable listener = onChange;
            if (listener != null) listener.run();
        }
        handler.removeCallbacksAndMessages(null);
        for (Tile tile : tiles) {
            tile.generation++;
            closePage(tile);
            if (tile.stream != null) tile.stream.release();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
