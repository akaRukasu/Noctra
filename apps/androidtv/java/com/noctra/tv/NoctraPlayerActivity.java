package com.noctra.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * Lecteur natif des chaînes TV de Noctra : ExoPlayer (Media3) déjà présent
 * dans l'appli Jellyfin, lecture HLS ou flux direct.
 *
 * Le flux est d'abord ouvert avec le type indiqué (HLS par défaut pour les
 * flux Noctra), puis avec l'autre type en cas d'échec. Un échec définitif est
 * renvoyé à l'accueil Noctra, qui propose alors un autre serveur de la chaîne.
 *
 * Aucune interface d'écoute Media3 n'est implémentée (elles sont réduites par
 * R8 dans l'APK Jellyfin) : l'état du lecteur est relevé régulièrement.
 */
public class NoctraPlayerActivity extends Activity {

    static final String EXTRA_URL = "noctra_url";
    static final String EXTRA_TITLE = "noctra_title";
    static final String EXTRA_SUBTITLE = "noctra_subtitle";
    static final String EXTRA_MIME = "noctra_mime";
    static final String EXTRA_TOKEN = "noctra_token";
    static final String EXTRA_ERROR = "noctra_error";
    static final int RESULT_ERROR = RESULT_FIRST_USER;

    private static final String HLS = "application/x-mpegURL";
    private static final long POLL_MS = 500;
    private static final long START_TIMEOUT_MS = 30000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> attempts = new ArrayList<String>();
    private PlayerView playerView;
    private Player player;
    private TextView status;
    private LinearLayout banner;
    private String url;
    private int attempt;
    private long startedAt;
    private boolean ready;

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            check();
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
        url = intent.getStringExtra(EXTRA_URL);
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            fail("Adresse de flux invalide.");
            return;
        }
        String mime = intent.getStringExtra(EXTRA_MIME);
        boolean hls = (mime != null && mime.toLowerCase().contains("mpegurl"))
            || url.contains(".m3u8") || url.contains("/api/tv/stream/");
        if (mime != null && !mime.isEmpty() && !mime.toLowerCase().contains("mpegurl")) {
            attempts.add(mime);
            attempts.add(HLS);
        } else if (hls) {
            attempts.add(HLS);
            attempts.add("");
        } else {
            attempts.add("");
            attempts.add(HLS);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        playerView = new PlayerView(this);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setUseController(true);
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

        setContentView(root);
        handler.postDelayed(hideBanner, 5000);
        start();
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value == null ? "" : value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setSingleLine(false);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void start() {
        release();
        ready = false;
        startedAt = System.currentTimeMillis();
        HashMap<String, String> headers = new HashMap<String, String>();
        String token = getIntent().getStringExtra(EXTRA_TOKEN);
        if (token != null && !token.isEmpty()) headers.put("x-noctra-token", token);
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent("NoctraTV/" + NoctraConfig.VERSION)
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(headers);
        ExoPlayer exoPlayer = new ExoPlayer.Builder(this)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(http))
            .build();
        player = exoPlayer;
        MediaItem.Builder item = new MediaItem.Builder().setUri(url);
        String mime = attempts.get(attempt);
        if (!mime.isEmpty()) item.setMimeType(mime);
        playerView.setPlayer(player);
        player.setMediaItem(item.build());
        player.prepare();
        player.setPlayWhenReady(true);
        handler.removeCallbacks(poll);
        handler.postDelayed(poll, POLL_MS);
    }

    private void check() {
        if (player == null) return;
        PlaybackException error = player.getPlayerError();
        int state = player.getPlaybackState();
        if (state == Player.STATE_READY) {
            ready = true;
            status.setVisibility(TextView.GONE);
        }
        if (error != null) {
            retry("Lecture impossible (" + PlaybackException.getErrorCodeName(error.errorCode) + ").");
            return;
        }
        if (!ready && System.currentTimeMillis() - startedAt > START_TIMEOUT_MS) {
            retry("Le flux ne répond pas.");
            return;
        }
        if (state == Player.STATE_ENDED) {
            status.setText("Fin du direct.");
            status.setVisibility(TextView.VISIBLE);
        }
        handler.postDelayed(poll, POLL_MS);
    }

    private void retry(String message) {
        // Un direct déjà lancé qui coupe est relancé tel quel, une fois.
        if (!ready && attempt + 1 < attempts.size()) {
            attempt++;
            status.setText("Nouvelle tentative…");
            status.setVisibility(TextView.VISIBLE);
            start();
        } else if (ready) {
            ready = false;
            status.setText("Reconnexion…");
            status.setVisibility(TextView.VISIBLE);
            start();
        } else {
            fail(message);
        }
    }

    private void fail(String message) {
        release();
        Intent data = new Intent();
        data.putExtra(EXTRA_ERROR, message);
        setResult(RESULT_ERROR, data);
        finish();
    }

    private void release() {
        handler.removeCallbacks(poll);
        if (player != null) {
            try {
                if (playerView != null) playerView.setPlayer(null);
                player.release();
            } catch (Exception ignored) {
            }
            player = null;
        }
    }

    @Override
    public void onBackPressed() {
        release();
        setResult(RESULT_OK);
        finish();
    }

    @Override
    protected void onStop() {
        super.onStop();
        // En arrière-plan (touche Accueil) : le direct s'arrête.
        if (!isFinishing()) {
            release();
            setResult(RESULT_OK);
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(hideBanner);
        release();
        super.onDestroy();
    }
}
