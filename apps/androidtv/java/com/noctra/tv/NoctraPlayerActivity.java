package com.noctra.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.media3.ui.PlayerView;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;

/**
 * Lecteur plein écran des chaînes TV de Noctra (NoctraStream : ExoPlayer,
 * reconnexions et retour au direct). Un échec définitif est renvoyé à
 * l'accueil Noctra, qui propose alors un autre serveur de la chaîne.
 *
 * Chaînes : bandeau avec le programme en cours (horaires, avancement) et le
 * suivant ; ▲ ▼ (ou CH+ / CH−) changent de chaîne sans quitter le lecteur.
 * L'accueil choisit le serveur de la nouvelle chaîne et renvoie son flux
 * (commande « load ») ; OK ou Info réaffichent le bandeau.
 *
 * Panneau des chaînes (bouton « Chaînes » de la barre de commandes, ◀,
 * Menu ou Guide) : la liste de la source avec le programme en cours, pour
 * changer de chaîne directement, la lecture continuant derrière.
 * Panneau des serveurs (bouton « Serveurs », ▶) : les serveurs de la chaîne
 * en cours, pour en changer sans quitter le lecteur. Un flux qui tombe ne
 * ferme plus le lecteur : l'accueil passe seul au serveur suivant.
 */
public class NoctraPlayerActivity extends Activity implements NoctraStream.Callback, NoctraPlayerBus.Player {

    static final String EXTRA_URL = "noctra_url";
    static final String EXTRA_TITLE = "noctra_title";
    static final String EXTRA_SUBTITLE = "noctra_subtitle";
    static final String EXTRA_MIME = "noctra_mime";
    static final String EXTRA_TOKEN = "noctra_token";
    /** En-têtes du flux (JSON) : ceux de la page web où il a été repéré (Referer, Origin, cookies…). */
    static final String EXTRA_HEADERS = "noctra_headers";
    static final String EXTRA_ERROR = "noctra_error";
    static final String EXTRA_PLAYED = "noctra_played";
    // Films et épisodes (lecture Jellyfin) :
    static final String EXTRA_VOD = "noctra_vod";
    static final String EXTRA_AUTHORIZATION = "noctra_authorization";
    static final String EXTRA_JELLYFIN_BASE = "noctra_jellyfin_base";
    static final String EXTRA_ITEM_ID = "noctra_item_id";
    static final String EXTRA_MEDIA_SOURCE_ID = "noctra_media_source_id";
    static final String EXTRA_PLAY_SESSION_ID = "noctra_play_session_id";
    static final String EXTRA_DEVICE_ID = "noctra_device_id";
    static final String EXTRA_START_MS = "noctra_start_ms";
    static final String EXTRA_POSITION_MS = "noctra_position_ms";
    static final String EXTRA_ENDED = "noctra_ended";
    // SyncPlay : départ en pause, le groupe pilote la lecture.
    static final String EXTRA_SYNC = "noctra_sync";
    /** Chaîne : {now:{title,start,stop}, next:{title,start}, position, zap} (JSON). */
    static final String EXTRA_EPG = "noctra_epg";
    private static final long SEEK_STEP_MS = 10000;
    private static final long REPORT_MS = 10000;
    static final int RESULT_ERROR = RESULT_FIRST_USER;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private NoctraStream stream;
    private TextView status;
    private LinearLayout banner;
    private NoctraPlaybackReport report;
    private boolean vod;
    private boolean reportedStart;
    private boolean ended;
    private boolean sync;
    private TextView syncLabel;
    private long pendingSeekMs = -1;
    private PlayerView playerView;
    private TextView titleView;
    private TextView subtitleView;
    private TextView nowView;
    private TextView nextView;
    private TextView statsView;
    private final Runnable updateStats = new Runnable() {
        @Override
        public void run() {
            if (statsView == null || vod || stream == null || banner.getAlpha() == 0f) return;
            statsView.setText(stream.diagnostics());
            statsView.setVisibility(TextView.VISIBLE);
            handler.postDelayed(this, 1000);
        }
    };
    private ProgressBar nowProgress;
    private JSONObject epg;
    private String playSessionId;
    private int zapDelta;
    private LinearLayout panel;
    private TextView panelTitle;
    private ListView channelList;
    private ArrayAdapter<JSONObject> channelAdapter;
    private final List<JSONObject> channelItems = new ArrayList<JSONObject>();
    private int currentChannel = -1;
    private String panelMode = "channels";
    // Échec signalé à l'accueil : sans nouveau flux sous 20 s, le lecteur se ferme.
    private String failure;
    private final Runnable failTimeout = new Runnable() {
        @Override
        public void run() {
            finishWith(false, failure);
        }
    };
    private final Runnable sendZap = new Runnable() {
        @Override
        public void run() {
            if (zapDelta == 0) return;
            try {
                JSONObject message = new JSONObject();
                message.put("type", "playerEvent");
                message.put("event", "zap");
                message.put("delta", zapDelta);
                NoctraPlayerBus.fromPlayer(message);
            } catch (Exception ignored) {
            }
            zapDelta = 0;
        }
    };
    private final Runnable tickGuide = new Runnable() {
        @Override
        public void run() {
            renderGuide();
            handler.postDelayed(this, 30000);
        }
    };

    private final Runnable sendSeek = new Runnable() {
        @Override
        public void run() {
            if (pendingSeekMs < 0) return;
            event("user", "seek", pendingSeekMs);
            pendingSeekMs = -1;
        }
    };

    private final Runnable progress = new Runnable() {
        @Override
        public void run() {
            if (report == null || stream == null) return;
            if (stream.hasPlayed()) {
                if (!reportedStart) {
                    reportedStart = true;
                    report.started(stream.positionMs());
                } else {
                    report.progress(stream.positionMs(), stream.isPaused());
                }
            }
            handler.postDelayed(this, reportedStart ? REPORT_MS : 1000);
        }
    };

    private final Runnable hideBanner = new Runnable() {
        @Override
        public void run() {
            banner.animate().alpha(0f).setDuration(400).start();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        Intent intent = getIntent();
        String url = intent.getStringExtra(EXTRA_URL);
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            finishWith(false, "Adresse de flux invalide.");
            return;
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        playerView = new PlayerView(this);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setUseController(true);
        playerView.setKeepContentOnPlayerReset(true);
        root.addView(playerView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        banner = new LinearLayout(this);
        banner.setOrientation(LinearLayout.VERTICAL);
        banner.setPadding(dp(32), dp(24), dp(32), dp(24));
        banner.setBackgroundColor(Color.argb(150, 9, 10, 15));
        titleView = text(intent.getStringExtra(EXTRA_TITLE), 26, Color.rgb(242, 246, 244));
        banner.addView(titleView);
        subtitleView = text(intent.getStringExtra(EXTRA_SUBTITLE), 16, Color.rgb(112, 217, 194));
        banner.addView(subtitleView);
        nowView = text("", 18, Color.rgb(242, 246, 244));
        nowView.setPadding(0, dp(12), 0, dp(6));
        banner.addView(nowView);
        nowProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        nowProgress.setMax(1000);
        banner.addView(nowProgress, new LinearLayout.LayoutParams(dp(420), dp(6)));
        nextView = text("", 15, Color.rgb(170, 180, 196));
        nextView.setPadding(0, dp(6), 0, 0);
        banner.addView(nextView);
        // Diagnostic du direct (réserve, débit reçu, coupures, relais), tenu à jour.
        statsView = text("", 13, Color.rgb(231, 185, 110));
        statsView.setPadding(0, dp(6), 0, 0);
        statsView.setVisibility(TextView.GONE);
        banner.addView(statsView);
        playSessionId = intent.getStringExtra(EXTRA_PLAY_SESSION_ID);
        try {
            epg = intent.hasExtra(EXTRA_EPG) ? new JSONObject(intent.getStringExtra(EXTRA_EPG)) : null;
        } catch (Exception error) {
            epg = null;
        }
        renderGuide();
        FrameLayout.LayoutParams bannerParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
        bannerParams.setMargins(dp(40), dp(32), dp(40), 0);
        root.addView(banner, bannerParams);

        status = text("", 18, Color.rgb(242, 246, 244));
        status.setGravity(Gravity.CENTER);
        status.setPadding(dp(24), dp(12), dp(24), dp(12));
        status.setBackgroundColor(Color.argb(170, 9, 10, 15));
        status.setVisibility(TextView.GONE);
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        statusParams.bottomMargin = dp(64);
        root.addView(status, statusParams);

        sync = intent.getBooleanExtra(EXTRA_SYNC, false);
        syncLabel = text("", 16, Color.rgb(112, 217, 194));
        syncLabel.setPadding(dp(18), dp(10), dp(18), dp(10));
        syncLabel.setBackgroundColor(Color.argb(190, 9, 10, 15));
        syncLabel.setVisibility(sync ? TextView.VISIBLE : TextView.GONE);
        syncLabel.setText("SyncPlay · en attente du groupe…");
        FrameLayout.LayoutParams syncParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        syncParams.setMargins(0, dp(32), dp(40), 0);
        root.addView(syncLabel, syncParams);
        // En groupe, les touches deviennent des demandes au groupe (voir dispatchKeyEvent).
        if (sync) playerView.setUseController(false);

        buildPanel(root);
        setContentView(root);
        if (canManage()) addControlButtons();
        handler.postDelayed(hideBanner, epg != null ? 7000 : 5000);
        handler.postDelayed(tickGuide, 30000);
        NoctraPlayerBus.player = this;
        vod = intent.getBooleanExtra(EXTRA_VOD, false);
        if (vod) {
            // Film ou épisode : en-tête Jellyfin (jeton) et suivi de lecture.
            HashMap<String, String> headers = new HashMap<String, String>();
            String authorization = intent.getStringExtra(EXTRA_AUTHORIZATION);
            if (authorization != null) headers.put("Authorization", authorization);
            stream = new NoctraStream(this, playerView, this, url, intent.getStringExtra(EXTRA_MIME), headers, false, false,
                intent.getLongExtra(EXTRA_START_MS, 0));
            if (authorization != null) {
                report = new NoctraPlaybackReport(intent.getStringExtra(EXTRA_JELLYFIN_BASE), authorization,
                    intent.getStringExtra(EXTRA_ITEM_ID), intent.getStringExtra(EXTRA_MEDIA_SOURCE_ID),
                    intent.getStringExtra(EXTRA_PLAY_SESSION_ID), intent.getStringExtra(EXTRA_DEVICE_ID));
                handler.postDelayed(progress, 1000);
            }
        } else {
            stream = liveStream(url, intent.getStringExtra(EXTRA_MIME), intent.getStringExtra(EXTRA_HEADERS), intent.getStringExtra(EXTRA_TOKEN));
        }
        if (sync) stream.setAutoplay(false);
        stream.start();
    }

    // ── Panneau des chaînes ────────────────────────────────────────────────
    private void buildPanel(FrameLayout root) {
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(20), dp(24), dp(12), dp(16));
        panel.setBackgroundColor(Color.argb(238, 9, 10, 15));
        panel.setVisibility(View.GONE);
        panelTitle = text("Chaînes", 22, Color.rgb(242, 246, 244));
        panel.addView(panelTitle);
        TextView keys = text("OK : regarder · Retour : fermer", 13, Color.rgb(150, 160, 176));
        keys.setPadding(0, dp(2), 0, dp(12));
        panel.addView(keys);
        channelList = new ListView(this);
        channelList.setDivider(null);
        channelList.setSelector(new ColorDrawable(Color.argb(110, 112, 217, 194)));
        channelList.setItemsCanFocus(false);
        channelAdapter = new ArrayAdapter<JSONObject>(this, 0, channelItems) {
            @Override
            public View getView(int position, View convertView, ViewGroup parent) {
                LinearLayout row = convertView instanceof LinearLayout ? (LinearLayout) convertView : channelRow();
                JSONObject item = getItem(position);
                TextView name = (TextView) row.getChildAt(0);
                TextView programme = (TextView) row.getChildAt(1);
                ProgressBar bar = (ProgressBar) row.getChildAt(2);
                boolean current = position == currentChannel;
                name.setText((position + 1) + "   " + (current ? "▶ " : "") + item.optString("name"));
                name.setTextColor(current ? Color.rgb(112, 217, 194) : Color.rgb(242, 246, 244));
                JSONObject now = item.optJSONObject("now");
                long start = now == null ? 0 : now.optLong("start");
                long stop = now == null ? 0 : now.optLong("stop");
                programme.setText(now != null && !now.optString("title").isEmpty()
                    ? (start > 0 ? hour(start) + (stop > 0 ? "–" + hour(stop) : "") + "  " : "") + now.optString("title")
                    : item.optString("sub"));
                long time = System.currentTimeMillis();
                bar.setVisibility(stop > start && start > 0 ? View.VISIBLE : View.INVISIBLE);
                if (stop > start) bar.setProgress((int) Math.max(0, Math.min(1000, (time - start) * 1000 / (stop - start))));
                return row;
            }
        };
        channelList.setAdapter(channelAdapter);
        channelList.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                closePanel();
                if ("servers".equals(panelMode)) pickServer(position);
                else if (position != currentChannel) zapTo(position);
            }
        });
        panel.addView(channelList, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(panel, new FrameLayout.LayoutParams(dp(480), ViewGroup.LayoutParams.MATCH_PARENT, Gravity.START));
    }

    private LinearLayout channelRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(12), dp(9), dp(12), dp(9));
        TextView name = text("", 17, Color.rgb(242, 246, 244));
        name.setSingleLine(true);
        TextView programme = text("", 13, Color.rgb(170, 180, 196));
        programme.setSingleLine(true);
        row.addView(name);
        row.addView(programme);
        ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(1000);
        LinearLayout.LayoutParams barParams = new LinearLayout.LayoutParams(dp(200), dp(4));
        barParams.topMargin = dp(4);
        row.addView(bar, barParams);
        return row;
    }

    /** Boutons « Chaînes » et « Serveurs » ajoutés à la barre de commandes du lecteur. */
    private void addControlButtons() {
        try {
            int id = getResources().getIdentifier("exo_basic_controls", "id", getPackageName());
            View controls = id == 0 ? null : playerView.findViewById(id);
            if (!(controls instanceof LinearLayout)) return;
            ((LinearLayout) controls).addView(controlButton("⇄  Serveurs", "servers"), 0, buttonParams());
            if (canZap()) ((LinearLayout) controls).addView(controlButton("☰  Chaînes", "channels"), 0, buttonParams());
        } catch (Throwable ignored) {
            // Sans boutons : ◀ (chaînes) et ▶ (serveurs) ouvrent aussi les panneaux.
        }
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40));
        params.gravity = Gravity.CENTER_VERTICAL;
        params.setMargins(dp(6), 0, dp(6), 0);
        return params;
    }

    private TextView controlButton(String label, final String mode) {
        TextView button = text(label, 16, Color.rgb(242, 246, 244));
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(16), 0, dp(16), 0);
        button.setFocusable(true);
        button.setClickable(true);
        final GradientDrawable idle = new GradientDrawable();
        idle.setCornerRadius(dp(20));
        idle.setColor(Color.argb(60, 255, 255, 255));
        final GradientDrawable focused = new GradientDrawable();
        focused.setCornerRadius(dp(20));
        focused.setColor(Color.rgb(112, 217, 194));
        button.setBackground(idle);
        button.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View view, boolean hasFocus) {
                view.setBackground(hasFocus ? focused : idle);
                ((TextView) view).setTextColor(hasFocus ? Color.rgb(7, 17, 15) : Color.rgb(242, 246, 244));
            }
        });
        button.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openPanel(mode);
            }
        });
        return button;
    }

    private boolean panelOpen() {
        return panel != null && panel.getVisibility() == View.VISIBLE;
    }

    private void openPanel(String mode) {
        if (panelOpen() || !canManage() || ("channels".equals(mode) && !canZap())) return;
        panelMode = mode;
        panelTitle.setText("servers".equals(mode) ? "Serveurs" : "Chaînes");
        channelItems.clear();
        currentChannel = -1;
        channelAdapter.notifyDataSetChanged();
        try { playerView.hideController(); } catch (Throwable ignored) { }
        panel.setVisibility(View.VISIBLE);
        panel.setAlpha(0f);
        panel.animate().alpha(1f).setDuration(160).start();
        channelList.requestFocus();
        if (currentChannel >= 0) channelList.setSelection(currentChannel);
        // La liste (et son guide) est demandée à l'accueil, qui la connaît.
        try {
            JSONObject message = new JSONObject();
            message.put("type", "playerEvent");
            message.put("event", mode);
            NoctraPlayerBus.fromPlayer(message);
        } catch (Exception ignored) {
        }
    }

    private void closePanel() {
        if (!panelOpen()) return;
        panel.setVisibility(View.GONE);
        playerView.requestFocus();
    }

    private final StringBuilder typedNumber = new StringBuilder();
    private final Runnable sendNumber = new Runnable() {
        @Override
        public void run() {
            if (typedNumber.length() == 0) return;
            int number = 0;
            try { number = Integer.parseInt(typedNumber.toString()); } catch (NumberFormatException ignored) { }
            typedNumber.setLength(0);
            // Nombre de chaînes de la liste : « 3 / 180 » dans le guide envoyé par l'accueil.
            int total = 0;
            java.util.regex.Matcher position = java.util.regex.Pattern.compile("/\\s*(\\d+)").matcher(epg == null ? "" : epg.optString("position"));
            if (position.find()) {
                try { total = Integer.parseInt(position.group(1)); } catch (NumberFormatException ignored) { }
            }
            if (number > 0 && (total == 0 || number <= total)) {
                zapTo(number - 1, true);
                return;
            }
            onStatus(stream, "Pas de chaîne n° " + number + (total > 0 ? " (" + total + " chaînes)" : ""));
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (typedNumber.length() == 0 && stream != null && stream.hasPlayed()) onStatus(stream, null);
                }
            }, 2500);
        }
    };

    private void zapTo(int index) {
        zapTo(index, false);
    }

    private void zapTo(int index, boolean typed) {
        try {
            JSONObject message = new JSONObject();
            message.put("type", "playerEvent");
            message.put("event", "zapTo");
            message.put("index", index);
            if (typed) message.put("number", true);
            NoctraPlayerBus.fromPlayer(message);
        } catch (Exception ignored) {
        }
    }

    private void pickServer(int index) {
        try {
            JSONObject message = new JSONObject();
            message.put("type", "playerEvent");
            message.put("event", "server");
            message.put("index", index);
            NoctraPlayerBus.fromPlayer(message);
        } catch (Exception ignored) {
        }
    }

    /** Liste reçue de l'accueil : {mode, items:[{name, sub, now}], current, title, update}. */
    private void showChannels(JSONObject command) {
        org.json.JSONArray items = command.optJSONArray("items");
        if (items == null) return;
        // Réponse pour l'autre panneau (ouvert puis fermé entre-temps) : ignorée.
        if (!command.optString("mode", "channels").equals(panelMode)) return;
        int selected = channelList.getSelectedItemPosition();
        channelItems.clear();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            channelItems.add(item == null ? new JSONObject() : item);
        }
        currentChannel = command.optInt("current", -1);
        panelTitle.setText(command.optString("title", "Chaînes"));
        channelAdapter.notifyDataSetChanged();
        if (!panelOpen()) return;
        int target = command.optBoolean("update", false) && selected >= 0 ? selected : currentChannel;
        if (target >= 0 && target < channelItems.size()) channelList.setSelection(target);
        channelList.requestFocus();
    }

    /** Chaîne en direct ; en-têtes éventuels (flux repéré dans une page web) et jeton Noctra. */
    private NoctraStream liveStream(String url, String mime, String headersJson, String token) {
        HashMap<String, String> headers = new HashMap<String, String>();
        if (headersJson != null) {
            try {
                JSONObject json = new JSONObject(headersJson);
                java.util.Iterator<String> keys = json.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    headers.put(key, json.optString(key));
                }
            } catch (Exception ignored) {
            }
        }
        if (token != null && !token.isEmpty()) headers.put("x-noctra-token", token);
        return new NoctraStream(this, playerView, this, url, mime, headers, false, true, 0);
    }

    // ── Guide des programmes et zapping ────────────────────────────────────
    private static String hour(long ms) {
        return new SimpleDateFormat("HH:mm", Locale.FRANCE).format(new Date(ms));
    }

    /** Programme en cours (horaires, avancement) et suivant ; passe seul au suivant à l'heure. */
    private void renderGuide() {
        if (nowView == null) return;
        JSONObject now = epg == null ? null : epg.optJSONObject("now");
        JSONObject next = epg == null ? null : epg.optJSONObject("next");
        long time = System.currentTimeMillis();
        if (now != null && now.optLong("stop") > 0 && now.optLong("stop") <= time && next != null && next.optLong("start") <= time) {
            now = next;
            next = null;
            try {
                epg.put("now", now);
                epg.remove("next");
            } catch (Exception ignored) {
            }
        }
        String position = epg == null ? "" : epg.optString("position");
        boolean zap = epg != null && epg.optBoolean("zap", false);
        if (now != null && !now.optString("title").isEmpty()) {
            long start = now.optLong("start");
            long stop = now.optLong("stop");
            nowView.setText("En ce moment" + (start > 0 && stop > 0 ? " · " + hour(start) + " – " + hour(stop) : "") + "\n" + now.optString("title"));
            nowView.setVisibility(TextView.VISIBLE);
            nowProgress.setVisibility(start > 0 && stop > start ? ProgressBar.VISIBLE : ProgressBar.GONE);
            if (stop > start) nowProgress.setProgress((int) Math.max(0, Math.min(1000, (time - start) * 1000 / (stop - start))));
        } else {
            nowView.setText(epg == null ? "" : "Programme non communiqué par la source");
            nowView.setVisibility(epg == null ? TextView.GONE : TextView.VISIBLE);
            nowProgress.setVisibility(ProgressBar.GONE);
        }
        String after = next != null && !next.optString("title").isEmpty()
            ? "Ensuite" + (next.optLong("start") > 0 ? " · " + hour(next.optLong("start")) : "") + " · " + next.optString("title") : "";
        String keys = zap ? "▲ ▼ changer de chaîne · ◀ liste des chaînes · ▶ serveurs" + (position.isEmpty() ? "" : " · " + position)
            : epg != null && epg.optBoolean("managed", false) ? "▶ changer de serveur" : "";
        nextView.setText(after + (after.isEmpty() || keys.isEmpty() ? "" : "\n") + keys);
        nextView.setVisibility(after.isEmpty() && keys.isEmpty() ? TextView.GONE : TextView.VISIBLE);
    }

    private void showBanner() {
        renderGuide();
        handler.removeCallbacks(hideBanner);
        banner.animate().cancel();
        banner.setAlpha(1f);
        handler.postDelayed(hideBanner, 6000);
        handler.removeCallbacks(updateStats);
        updateStats.run();
    }

    private boolean canZap() {
        return !vod && !sync && epg != null && epg.optBoolean("zap", false);
    }

    /** Chaîne lancée depuis la liste de l'accueil : serveurs et échecs gérés sans quitter le lecteur. */
    private boolean canManage() {
        return !vod && !sync && epg != null && epg.optBoolean("managed", false);
    }

    // ── SyncPlay et commandes à distance ───────────────────────────────────
    private void event(String type, String action, long positionMs) {
        try {
            JSONObject message = new JSONObject();
            message.put("type", "playerEvent");
            message.put("event", type);
            message.put("action", action);
            message.put("positionMs", positionMs);
            message.put("playing", stream != null && stream.wantsToPlay());
            NoctraPlayerBus.fromPlayer(message);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onReadyChanged(NoctraStream source, boolean ready) {
        if (source == stream && vod) event("state", ready ? "ready" : "buffering", stream.positionMs());
        // Direct : premier démarrage de ce flux signalé à l'accueil (fiabilité du serveur).
        if (source == stream && !vod && ready && !reportedLive) {
            reportedLive = true;
            try {
                JSONObject message = new JSONObject();
                message.put("type", "playerEvent");
                message.put("event", "live");
                message.put("action", "playing");
                message.put("playSessionId", playSessionId == null ? "" : playSessionId);
                NoctraPlayerBus.fromPlayer(message);
            } catch (Exception ignored) {
            }
        }
    }
    private boolean reportedLive;

    @Override
    public void onCommand(JSONObject command) {
        if (stream == null || finished) return;
        String action = command.optString("command");
        long position = command.has("positionMs") ? command.optLong("positionMs") : -1;
        if (action.equals("pause")) {
            stream.pause();
            if (position >= 0) stream.seek(position);
        } else if (action.equals("unpause")) {
            if (position >= 0) stream.seek(position);
            stream.play();
        } else if (action.equals("playpause")) {
            if (stream.wantsToPlay()) stream.pause(); else stream.play();
        } else if (action.equals("seek")) {
            if (command.optBoolean("pause", false)) stream.pause();
            if (position >= 0) stream.seek(position);
        } else if (action.equals("stop")) {
            finishWith(true, null);
            return;
        } else if (action.equals("zapping") && !vod) {
            // Chaîne choisie : affichée tout de suite, pendant la recherche de son flux.
            titleView.setText(command.optString("title"));
            subtitleView.setText(command.optString("subtitle"));
            epg = command.optJSONObject("epg");
            onStatus(stream, command.optString("message", "Connexion…"));
            showBanner();
        } else if ((action.equals("channels") || action.equals("servers")) && !vod) {
            showChannels(command);
        } else if (action.equals("guide") && !vod) {
            JSONObject guide = command.optJSONObject("epg");
            if (guide != null) {
                epg = guide;
                renderGuide();
            }
        } else if (action.equals("load") && !vod) {
            String url = command.optString("url");
            if (!url.startsWith("https://") && !url.startsWith("http://")) return;
            handler.removeCallbacks(failTimeout);
            failure = null;
            if (stream != null) stream.release();
            JSONObject headers = command.optJSONObject("headers");
            stream = liveStream(url, command.optString("mime"), headers == null ? null : headers.toString(),
                command.has("token") ? command.optString("token") : null);
            playSessionId = command.optString("playSessionId", playSessionId);
            reportedLive = false;
            titleView.setText(command.optString("title"));
            subtitleView.setText(command.optString("subtitle"));
            JSONObject guide = command.optJSONObject("epg");
            if (guide != null) epg = guide;
            onStatus(stream, null);
            stream.start();
            showBanner();
            return;
        }
        if (command.has("status") && syncLabel != null) {
            String text = command.optString("status");
            syncLabel.setText(text);
            syncLabel.setVisibility(text.isEmpty() ? TextView.GONE : TextView.VISIBLE);
        }
    }

    private static String clock(long ms) {
        long seconds = Math.max(0, ms / 1000);
        long hours = seconds / 3600;
        String minutes = String.valueOf((seconds / 60) % 60);
        String rest = String.valueOf(seconds % 60);
        if (rest.length() < 2) rest = "0" + rest;
        if (hours > 0 && minutes.length() < 2) minutes = "0" + minutes;
        return (hours > 0 ? hours + ":" : "") + minutes + ":" + rest;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Panneau ouvert : la liste reçoit les flèches et OK ; ◀ / Retour le ferment.
        if (panelOpen()) {
            int code = event.getKeyCode();
            if (code == KeyEvent.KEYCODE_BACK || code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT
                || code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_GUIDE) {
                if (event.getAction() == KeyEvent.ACTION_UP) closePanel();
                return true;
            }
            return super.dispatchKeyEvent(event);
        }
        if (canManage() && stream != null && !canZap()) {
            int code = event.getKeyCode();
            boolean controls = false;
            try { controls = playerView.isControllerFullyVisible(); } catch (Throwable ignored) { }
            if (code == KeyEvent.KEYCODE_DPAD_RIGHT && !controls) {
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) openPanel("servers");
                return true;
            }
        }
        if (canZap() && stream != null) {
            int code = event.getKeyCode();
            boolean controls = false;
            try { controls = playerView.isControllerFullyVisible(); } catch (Throwable ignored) { }
            if ((code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_GUIDE || code == KeyEvent.KEYCODE_TV_INPUT
                || (code == KeyEvent.KEYCODE_DPAD_LEFT && !controls))) {
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) openPanel("channels");
                return true;
            }
            if (code == KeyEvent.KEYCODE_DPAD_RIGHT && !controls) {
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) openPanel("servers");
                return true;
            }
            int delta = code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_CHANNEL_UP || code == KeyEvent.KEYCODE_PAGE_UP ? -1
                : code == KeyEvent.KEYCODE_DPAD_DOWN || code == KeyEvent.KEYCODE_CHANNEL_DOWN || code == KeyEvent.KEYCODE_PAGE_DOWN ? 1 : 0;
            if (delta != 0) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    // Appuis rapprochés cumulés : une seule demande (ex. ▼ ▼ ▼ = 3 chaînes plus loin).
                    zapDelta += delta;
                    onStatus(stream, zapDelta > 0 ? "Chaîne suivante" + (zapDelta > 1 ? " (+" + zapDelta + ")" : "") + "…"
                        : "Chaîne précédente" + (zapDelta < -1 ? " (" + zapDelta + ")" : "") + "…");
                    handler.removeCallbacks(sendZap);
                    handler.postDelayed(sendZap, 450);
                }
                return true;
            }
            if (event.getAction() == KeyEvent.ACTION_DOWN && code == KeyEvent.KEYCODE_INFO) {
                showBanner();
                return true;
            }
            // Numéro de chaîne (touches 0-9, comme sur une box TV) : validé après 1,5 s ou par OK.
            int digit = code >= KeyEvent.KEYCODE_0 && code <= KeyEvent.KEYCODE_9 ? code - KeyEvent.KEYCODE_0
                : code >= KeyEvent.KEYCODE_NUMPAD_0 && code <= KeyEvent.KEYCODE_NUMPAD_9 ? code - KeyEvent.KEYCODE_NUMPAD_0 : -1;
            if (digit >= 0) {
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0 && typedNumber.length() < 4) {
                    typedNumber.append(digit);
                    onStatus(stream, "Chaîne " + typedNumber + "…");
                    handler.removeCallbacks(sendNumber);
                    handler.postDelayed(sendNumber, 1500);
                }
                return true;
            }
            if (typedNumber.length() > 0 && event.getAction() == KeyEvent.ACTION_DOWN
                && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER)) {
                handler.removeCallbacks(sendNumber);
                sendNumber.run();
                return true;
            }
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0
                && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER)) showBanner();
        }
        if (!sync || stream == null) return super.dispatchKeyEvent(event);
        int code = event.getKeyCode();
        boolean toggle = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER
            || code == KeyEvent.KEYCODE_NUMPAD_ENTER || code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
        boolean play = code == KeyEvent.KEYCODE_MEDIA_PLAY;
        boolean pause = code == KeyEvent.KEYCODE_MEDIA_PAUSE;
        boolean back = code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_MEDIA_REWIND;
        boolean forward = code == KeyEvent.KEYCODE_DPAD_RIGHT || code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD;
        if (!toggle && !play && !pause && !back && !forward) return super.dispatchKeyEvent(event);
        if (event.getAction() != KeyEvent.ACTION_DOWN) return true;
        long position = stream.positionMs();
        if (toggle || play || pause) {
            if (event.getRepeatCount() > 0) return true;
            boolean resume = play || (toggle && !stream.wantsToPlay());
            event("user", resume ? "unpause" : "pause", position);
            syncLabel.setText("SyncPlay · " + (resume ? "reprise demandée au groupe…" : "pause demandée au groupe…"));
            syncLabel.setVisibility(TextView.VISIBLE);
            return true;
        }
        // Avance / retour : cumulés, puis une seule demande au groupe.
        if (pendingSeekMs < 0) pendingSeekMs = position;
        pendingSeekMs = Math.max(0, pendingSeekMs + (forward ? SEEK_STEP_MS : -SEEK_STEP_MS));
        long duration = stream.durationMs();
        if (duration > 0) pendingSeekMs = Math.min(pendingSeekMs, duration - 1000);
        syncLabel.setText("SyncPlay · aller à " + clock(pendingSeekMs) + (duration > 0 ? " / " + clock(duration) : ""));
        syncLabel.setVisibility(TextView.VISIBLE);
        handler.removeCallbacks(sendSeek);
        handler.postDelayed(sendSeek, 800);
        return true;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value == null ? "" : value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onStatus(NoctraStream source, String text) {
        // Ancien flux (chaîne précédente, déjà remplacée) : ignoré.
        if (source != null && source != stream) return;
        if (text == null) {
            status.setVisibility(TextView.GONE);
        } else {
            status.setText(text);
            status.setVisibility(TextView.VISIBLE);
        }
    }

    @Override
    public void onFailed(NoctraStream source, String message) {
        if (source != null && source != stream) return;
        if (canManage() && failure == null) {
            // L'accueil choisit un autre serveur et renvoie son flux (« load »).
            failure = message == null ? "Flux indisponible." : message;
            onStatus(stream, "Serveur indisponible · recherche d'un autre serveur…");
            try {
                JSONObject event = new JSONObject();
                event.put("type", "playerEvent");
                event.put("event", "failed");
                event.put("message", failure);
                event.put("played", stream != null && stream.hasPlayed());
                NoctraPlayerBus.fromPlayer(event);
            } catch (Exception ignored) {
            }
            handler.postDelayed(failTimeout, 20000);
            return;
        }
        finishWith(false, message);
    }

    @Override
    public void onEnded(NoctraStream source) {
        if (source != null && source != stream) return;
        ended = true;
        finishWith(true, null);
    }

    private boolean finished;

    private void finishWith(boolean ok, String error) {
        if (finished) return;
        finished = true;
        handler.removeCallbacks(progress);
        handler.removeCallbacks(sendSeek);
        handler.removeCallbacks(sendZap);
        handler.removeCallbacks(tickGuide);
        handler.removeCallbacks(failTimeout);
        if (NoctraPlayerBus.player == this) NoctraPlayerBus.player = null;
        long position = stream == null ? 0 : stream.positionMs();
        if (ended && stream != null) position = Math.max(position, stream.durationMs());
        if (report != null) {
            if (!reportedStart && stream != null && stream.hasPlayed()) report.started(position);
            report.stopped(position);
            report = null;
        }
        if (stream != null) stream.release();
        Intent data = new Intent();
        data.putExtra(EXTRA_VOD, vod);
        data.putExtra(EXTRA_SYNC, sync);
        data.putExtra(EXTRA_PLAY_SESSION_ID, playSessionId);
        data.putExtra(EXTRA_POSITION_MS, position);
        data.putExtra(EXTRA_ENDED, ended);
        data.putExtra(EXTRA_PLAYED, stream != null && stream.hasPlayed());
        if (!ok) data.putExtra(EXTRA_ERROR, error);
        setResult(ok ? RESULT_OK : RESULT_ERROR, data);
        finish();
    }

    @Override
    public void onBackPressed() {
        if (panelOpen()) {
            closePanel();
            return;
        }
        finishWith(true, null);
    }

    @Override
    protected void onStop() {
        super.onStop();
        // En arrière-plan (touche Accueil) : le direct s'arrête.
        if (!isFinishing()) finishWith(true, null);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(hideBanner);
        if (!finished) finishWith(true, null);
        if (stream != null) stream.release();
        super.onDestroy();
    }
}
