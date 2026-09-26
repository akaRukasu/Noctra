package com.noctra.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.List;

/**
 * Multiview : 2 à 4 chaînes en direct à l'écran, chacune avec son lecteur
 * (NoctraStream, tampon réduit). Le son suit la vignette sélectionnée ; OK
 * l'agrandit en plein écran, Retour revient à la grille puis à l'accueil.
 */
public class NoctraMultiviewActivity extends Activity {

    static final String EXTRA_URLS = "noctra_urls";
    static final String EXTRA_TITLES = "noctra_titles";
    static final String EXTRA_SUBTITLES = "noctra_subtitles";
    static final String EXTRA_MIMES = "noctra_mimes";
    static final String EXTRA_AUTHORIZED = "noctra_authorized";
    static final String EXTRA_TOKEN = "noctra_token";

    private static final int ACCENT = Color.rgb(112, 217, 194);

    private final List<Tile> tiles = new ArrayList<Tile>();
    private final List<LinearLayout> rows = new ArrayList<LinearLayout>();
    private Tile zoomed;

    private final class Tile implements NoctraStream.Callback {
        FrameLayout frame;
        TextView label;
        TextView status;
        NoctraStream stream;
        String title;

        @Override
        public void onStatus(NoctraStream source, String text) {
            status.setText(text == null ? "" : text);
            status.setVisibility(text == null ? View.GONE : View.VISIBLE);
        }

        @Override
        public void onFailed(NoctraStream source, String message) {
            String text = message != null && message.contains("DECODER")
                ? "Le téléviseur ne peut pas décoder un flux de plus."
                : "Flux indisponible.";
            status.setText(text);
            status.setVisibility(View.VISIBLE);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        Intent intent = getIntent();
        String[] urls = intent.getStringArrayExtra(EXTRA_URLS);
        String[] titles = intent.getStringArrayExtra(EXTRA_TITLES);
        String[] subtitles = intent.getStringArrayExtra(EXTRA_SUBTITLES);
        String[] mimes = intent.getStringArrayExtra(EXTRA_MIMES);
        boolean[] authorized = intent.getBooleanArrayExtra(EXTRA_AUTHORIZED);
        String token = intent.getStringExtra(EXTRA_TOKEN);
        if (urls == null || urls.length == 0) {
            finish();
            return;
        }
        int count = Math.min(4, urls.length);

        LinearLayout grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setBackgroundColor(Color.rgb(5, 6, 9));
        grid.setPadding(dp(6), dp(6), dp(6), dp(6));
        int perRow = count == 1 ? 1 : 2;
        for (int i = 0; i < count; i++) {
            if (i % perRow == 0) {
                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                grid.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
                rows.add(row);
            }
            Tile tile = createTile(value(titles, i), value(subtitles, i));
            rows.get(rows.size() - 1).addView(tile.frame, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
            String url = urls[i];
            boolean withToken = authorized != null && i < authorized.length && authorized[i];
            tile.stream = new NoctraStream(this, (PlayerView) tile.frame.getChildAt(0), tile, url, value(mimes, i), withToken ? token : null, true);
            tile.stream.setVolume(i == 0 ? 1f : 0f);
            tiles.add(tile);
        }
        // 3 chaînes : la dernière rangée garde une case vide pour conserver la grille 2×2.
        if (count == 3) rows.get(1).addView(new View(this), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        setContentView(grid);
        for (Tile tile : tiles) tile.stream.start();
        tiles.get(0).frame.requestFocus();
    }

    private static String value(String[] values, int index) {
        return values != null && index < values.length && values[index] != null ? values[index] : "";
    }

    private Tile createTile(String title, String subtitle) {
        final Tile tile = new Tile();
        tile.title = title;
        tile.frame = new FrameLayout(this);
        tile.frame.setFocusable(true);
        tile.frame.setPadding(dp(4), dp(4), dp(4), dp(4));
        tile.frame.setBackground(border(false));
        PlayerView view = new PlayerView(this);
        view.setUseController(false);
        view.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        view.setKeepContentOnPlayerReset(true);
        view.setFocusable(false);
        tile.frame.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        tile.label = new TextView(this);
        tile.label.setTextColor(Color.rgb(242, 246, 244));
        tile.label.setTextSize(15);
        tile.label.setPadding(dp(12), dp(6), dp(12), dp(6));
        tile.label.setBackgroundColor(Color.argb(170, 9, 10, 15));
        tile.label.setText(subtitle.isEmpty() ? title : title + "  ·  " + subtitle);
        tile.label.setSingleLine(true);
        FrameLayout.LayoutParams labelParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        labelParams.setMargins(dp(10), 0, dp(10), dp(10));
        tile.frame.addView(tile.label, labelParams);

        tile.status = new TextView(this);
        tile.status.setTextColor(Color.rgb(242, 246, 244));
        tile.status.setTextSize(15);
        tile.status.setPadding(dp(14), dp(8), dp(14), dp(8));
        tile.status.setBackgroundColor(Color.argb(170, 9, 10, 15));
        tile.status.setVisibility(View.GONE);
        tile.frame.addView(tile.status, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        tile.frame.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View view, boolean hasFocus) {
                if (hasFocus) select(tile);
            }
        });
        tile.frame.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                toggleZoom(tile);
            }
        });
        return tile;
    }

    private GradientDrawable border(boolean active) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.BLACK);
        drawable.setCornerRadius(dp(10));
        drawable.setStroke(dp(3), active ? ACCENT : Color.rgb(28, 31, 42));
        return drawable;
    }

    // Le son suit la vignette sélectionnée.
    private void select(Tile selected) {
        for (Tile tile : tiles) {
            boolean active = tile == selected;
            tile.frame.setBackground(border(active));
            tile.label.setText((active ? "♪  " : "") + tile.label.getText().toString().replaceFirst("^♪  ", ""));
            if (tile.stream != null) tile.stream.setVolume(active ? 1f : 0f);
        }
    }

    private void toggleZoom(Tile tile) {
        zoomed = zoomed == tile ? null : tile;
        for (LinearLayout row : rows) {
            boolean rowVisible = false;
            for (int i = 0; i < row.getChildCount(); i++) {
                View child = row.getChildAt(i);
                boolean visible = zoomed == null || child == zoomed.frame;
                child.setVisibility(visible ? View.VISIBLE : View.GONE);
                if (visible && (zoomed != null || child.isFocusable())) rowVisible = true;
            }
            row.setVisibility(zoomed == null || rowVisible ? View.VISIBLE : View.GONE);
        }
        tile.frame.requestFocus();
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
            toggleZoom(zoomed);
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
            if (tile.stream != null) tile.stream.release();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
