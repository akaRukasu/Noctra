package com.noctra.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.media3.ui.PlayerView;

import org.json.JSONObject;

import java.util.HashMap;

/**
 * Lecteur plein écran des chaînes TV de Noctra (NoctraStream : ExoPlayer,
 * reconnexions et retour au direct). Un échec définitif est renvoyé à
 * l'accueil Noctra, qui propose alors un autre serveur de la chaîne.
 */
public class NoctraPlayerActivity extends Activity implements NoctraStream.Callback, NoctraPlayerBus.Player {

    static final String EXTRA_URL = "noctra_url";
    static final String EXTRA_TITLE = "noctra_title";
    static final String EXTRA_SUBTITLE = "noctra_subtitle";
    static final String EXTRA_MIME = "noctra_mime";
    static final String EXTRA_TOKEN = "noctra_token";
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
        PlayerView playerView = new PlayerView(this);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setUseController(true);
        playerView.setKeepContentOnPlayerReset(true);
        root.addView(playerView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        banner = new LinearLayout(this);
        banner.setOrientation(LinearLayout.VERTICAL);
        banner.setPadding(dp(32), dp(24), dp(32), dp(24));
        banner.setBackgroundColor(Color.argb(150, 9, 10, 15));
        banner.addView(text(intent.getStringExtra(EXTRA_TITLE), 26, Color.rgb(242, 246, 244)));
        String subtitle = intent.getStringExtra(EXTRA_SUBTITLE);
        if (subtitle != null && !subtitle.isEmpty()) banner.addView(text(subtitle, 16, Color.rgb(112, 217, 194)));
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

        setContentView(root);
        handler.postDelayed(hideBanner, 5000);
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
            stream = new NoctraStream(this, playerView, this, url, intent.getStringExtra(EXTRA_MIME), intent.getStringExtra(EXTRA_TOKEN), false);
        }
        if (sync) stream.setAutoplay(false);
        stream.start();
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
    }

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
        if (text == null) {
            status.setVisibility(TextView.GONE);
        } else {
            status.setText(text);
            status.setVisibility(TextView.VISIBLE);
        }
    }

    @Override
    public void onFailed(NoctraStream source, String message) {
        finishWith(false, message);
    }

    @Override
    public void onEnded(NoctraStream source) {
        ended = true;
        finishWith(true, null);
    }

    private boolean finished;

    private void finishWith(boolean ok, String error) {
        if (finished) return;
        finished = true;
        handler.removeCallbacks(progress);
        handler.removeCallbacks(sendSeek);
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
        data.putExtra(EXTRA_PLAY_SESSION_ID, getIntent().getStringExtra(EXTRA_PLAY_SESSION_ID));
        data.putExtra(EXTRA_POSITION_MS, position);
        data.putExtra(EXTRA_ENDED, ended);
        data.putExtra(EXTRA_PLAYED, stream != null && stream.hasPlayed());
        if (!ok) data.putExtra(EXTRA_ERROR, error);
        setResult(ok ? RESULT_OK : RESULT_ERROR, data);
        finish();
    }

    @Override
    public void onBackPressed() {
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
