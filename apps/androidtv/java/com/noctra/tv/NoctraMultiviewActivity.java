package com.noctra.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
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
    }

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

        @Override
        public void onStatus(NoctraStream source, String text) {
            if (source != stream) return;
            showStatus(this, text);
        }

        @Override
        public void onReadyChanged(NoctraStream source, boolean ready) {
        }

        @Override
        public void onEnded(NoctraStream source) {
            // Un direct ne se termine pas (géré par NoctraStream).
        }

        @Override
        public void onFailed(NoctraStream source, String message) {
            if (source != stream) return;
            if (!failed.contains(current)) failed.add(current);
            int next = nextOption(this);
            if (next >= 0) {
                showStatus(this, "Serveur indisponible · essai du suivant…");
                play(this, next);
            } else {
                showStatus(this, message != null && message.contains("DECODER")
                    ? "Le téléviseur ne peut pas décoder un flux de plus."
                    : "Flux indisponible · OK › Changer de serveur");
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
                if (!option.url.isEmpty() || !option.resolve.isEmpty()) tile.options.add(option);
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
        for (Tile tile : tiles) play(tile, 0);
        refreshLabels();
        tiles.get(0).frame.requestFocus();
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
            actions.add(new Runnable() { @Override public void run() { featured = featured == tile ? null : tile; arrange(); tile.frame.requestFocus(); } });
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
                option.mime = "ts".equals(item.optString("transport")) ? "video/mp2t" : mime;
                if (!stream.isEmpty()) {
                    option.url = new URL(base, stream).toString();
                    if (option.label.isEmpty()) option.label = "Flux direct";
                    direct.add(option);
                } else if (!resolve.isEmpty() && page.isEmpty()) {
                    option.resolve = new URL(base, resolve).toString();
                    if (option.label.isEmpty()) option.label = "Serveur " + (i + 1);
                    automatic.add(option);
                }
            }
        } catch (Exception ignored) {
        }
        direct.addAll(automatic);
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

    private void play(final Tile tile, final int index) {
        if (tile.stream != null) tile.stream.release();
        tile.stream = null;
        tile.current = index;
        final int generation = ++tile.generation;
        refreshLabels();
        final Option option = tile.options.get(index);
        if (!option.url.isEmpty()) {
            start(tile, option.url, option.mime);
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
                            else showStatus(tile, "Flux indisponible · OK › Changer de serveur");
                            return;
                        }
                        option.url = url;
                        start(tile, url, option.mime);
                    }
                });
            }
        }).start();
    }

    private void start(Tile tile, String url, String mime) {
        boolean ours = NoctraHomeActivity.sameOrigin(Uri.parse(url), Uri.parse(NoctraConfig.NOCTRA_URL));
        tile.stream = new NoctraStream(this, tile.view, tile, url, mime, ours ? token : null, true);
        tile.stream.setVolume(tile == audio ? 1f : 0f);
        if (tile.maxWidth > 0) tile.stream.setMaxVideoSize(tile.maxWidth, tile.maxHeight);
        tile.stream.start();
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
        for (Tile tile : tiles) {
            tile.generation++;
            if (tile.stream != null) tile.stream.release();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
