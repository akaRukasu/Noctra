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

import androidx.media3.ui.PlayerView;

/**
 * Lecteur plein écran des chaînes TV de Noctra (NoctraStream : ExoPlayer,
 * reconnexions et retour au direct). Un échec définitif est renvoyé à
 * l'accueil Noctra, qui propose alors un autre serveur de la chaîne.
 */
public class NoctraPlayerActivity extends Activity implements NoctraStream.Callback {

    static final String EXTRA_URL = "noctra_url";
    static final String EXTRA_TITLE = "noctra_title";
    static final String EXTRA_SUBTITLE = "noctra_subtitle";
    static final String EXTRA_MIME = "noctra_mime";
    static final String EXTRA_TOKEN = "noctra_token";
    static final String EXTRA_ERROR = "noctra_error";
    static final String EXTRA_PLAYED = "noctra_played";
    static final int RESULT_ERROR = RESULT_FIRST_USER;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private NoctraStream stream;
    private TextView status;
    private LinearLayout banner;

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

        setContentView(root);
        handler.postDelayed(hideBanner, 5000);
        stream = new NoctraStream(this, playerView, this, url, intent.getStringExtra(EXTRA_MIME), intent.getStringExtra(EXTRA_TOKEN), false);
        stream.start();
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

    private void finishWith(boolean ok, String error) {
        if (stream != null) stream.release();
        Intent data = new Intent();
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
        if (stream != null) stream.release();
        super.onDestroy();
    }
}
