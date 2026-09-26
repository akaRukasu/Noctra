package com.noctra.tv;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * Lecture d'une chaîne en direct avec ExoPlayer (Media3 de l'appli Jellyfin),
 * pensée pour les connexions instables :
 * - tampon plus large qu'à l'origine, et une réserve plus grande après une
 *   coupure pour éviter les coupures à répétition ;
 * - nouvelles tentatives sur les segments HLS avant de signaler une erreur ;
 * - retour au direct quand le flux a trop de retard (BEHIND_LIVE_WINDOW) ;
 * - surveillance des blocages : une mise en mémoire tampon trop longue relance
 *   le flux ;
 * - reconnexions espacées (1, 2, 4, 8 s…) tant que le flux a déjà fonctionné ;
 * - au premier démarrage, essai HLS puis flux direct (ou l'inverse).
 *
 * Aucune interface d'écoute Media3 n'est implémentée (elles sont réduites par
 * R8 dans l'APK Jellyfin) : l'état du lecteur est relevé régulièrement.
 */
final class NoctraStream {

    interface Callback {
        /** Texte d'état à afficher (null : rien à afficher). */
        void onStatus(NoctraStream stream, String status);
        /** Échec définitif : le flux ne peut pas être lu. */
        void onFailed(NoctraStream stream, String message);
    }

    static final String HLS = "application/x-mpegURL";
    private static final int BEHIND_LIVE_WINDOW = 1002;
    private static final long POLL_MS = 500;
    private static final long START_TIMEOUT_MS = 30000;
    private static final long STALL_TIMEOUT_MS = 15000;
    private static final long STABLE_MS = 30000;
    private static final int MAX_RECONNECTS = 8;

    private final Context context;
    private final PlayerView view;
    private final Callback callback;
    private final String url;
    private final String token;
    private final boolean compact;
    private final List<String> attempts = new ArrayList<String>();
    private final Handler handler = new Handler(Looper.getMainLooper());

    private Player player;
    private int attempt;
    private boolean played;
    private boolean ready;
    private boolean released;
    private long startedAt;
    private long bufferingSince;
    private long readySince;
    private int reconnects;
    private float volume = 1f;

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            check();
        }
    };

    private final Runnable restart = new Runnable() {
        @Override
        public void run() {
            if (!released) open();
        }
    };

    /**
     * @param compact tampon réduit (multiview : plusieurs lecteurs à la fois).
     */
    NoctraStream(Context context, PlayerView view, Callback callback, String url, String mime, String token, boolean compact) {
        this.context = context;
        this.view = view;
        this.callback = callback;
        this.url = url;
        this.token = token;
        this.compact = compact;
        String hint = mime == null ? "" : mime;
        boolean hls = hint.toLowerCase().contains("mpegurl") || url.contains(".m3u8") || url.contains("/api/tv/stream/");
        if (!hint.isEmpty() && !hint.toLowerCase().contains("mpegurl")) {
            attempts.add(hint);
            attempts.add(HLS);
        } else if (hls) {
            attempts.add(HLS);
            attempts.add("");
        } else {
            attempts.add("");
            attempts.add(HLS);
        }
    }

    boolean hasPlayed() {
        return played;
    }

    void start() {
        released = false;
        open();
    }

    void setVolume(float value) {
        volume = value;
        if (player != null) {
            try { player.setVolume(value); } catch (Exception ignored) { }
        }
    }

    private void open() {
        closePlayer();
        ready = false;
        startedAt = System.currentTimeMillis();
        bufferingSince = 0;
        HashMap<String, String> headers = new HashMap<String, String>();
        if (token != null && !token.isEmpty()) headers.put("x-noctra-token", token);
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent("NoctraTV/" + NoctraConfig.VERSION)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(12000)
            .setReadTimeoutMs(20000)
            .setDefaultRequestProperties(headers);
        DefaultMediaSourceFactory sources = new DefaultMediaSourceFactory(http)
            .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(6));
        DefaultLoadControl buffer = compact
            ? new DefaultLoadControl.Builder().setBufferDurationsMs(12000, 30000, 2000, 4000).build()
            : new DefaultLoadControl.Builder().setBufferDurationsMs(20000, 60000, 2500, 6000).build();
        ExoPlayer exoPlayer = new ExoPlayer.Builder(context)
            .setMediaSourceFactory(sources)
            .setLoadControl(buffer)
            .build();
        player = exoPlayer;
        MediaItem.Builder item = new MediaItem.Builder().setUri(url);
        String mime = attempts.get(attempt);
        if (!mime.isEmpty()) item.setMimeType(mime);
        view.setPlayer(player);
        player.setVolume(volume);
        player.setMediaItem(item.build());
        player.prepare();
        player.setPlayWhenReady(true);
        handler.removeCallbacks(poll);
        handler.postDelayed(poll, POLL_MS);
    }

    private void check() {
        if (player == null || released) return;
        long now = System.currentTimeMillis();
        PlaybackException error = player.getPlayerError();
        int state = player.getPlaybackState();
        if (error != null) {
            if (error.errorCode == BEHIND_LIVE_WINDOW && played) {
                // Trop de retard sur le direct : on revient au bord du direct.
                callback.onStatus(this, "Retour au direct…");
                player.seekToDefaultPosition();
                player.prepare();
                handler.postDelayed(poll, POLL_MS);
                return;
            }
            recover("Lecture impossible (" + PlaybackException.getErrorCodeName(error.errorCode) + ").");
            return;
        }
        if (state == Player.STATE_READY) {
            if (!ready) {
                ready = true;
                played = true;
                readySince = now;
                callback.onStatus(this, null);
            }
            bufferingSince = 0;
            if (reconnects > 0 && now - readySince > STABLE_MS) reconnects = 0;
        } else if (state == Player.STATE_BUFFERING) {
            ready = false;
            if (bufferingSince == 0) bufferingSince = now;
            if (played && now - bufferingSince > STALL_TIMEOUT_MS) {
                recover("Le flux ne répond plus.");
                return;
            }
        } else if (state == Player.STATE_ENDED) {
            // Un direct ne se termine pas : fin de playlist = coupure côté source.
            recover("Le direct s'est interrompu.");
            return;
        }
        if (!played && now - startedAt > START_TIMEOUT_MS) {
            recover("Le flux ne répond pas.");
            return;
        }
        handler.postDelayed(poll, POLL_MS);
    }

    private void recover(String message) {
        if (!played && attempt + 1 < attempts.size()) {
            attempt++;
            callback.onStatus(this, "Nouvelle tentative…");
            open();
            return;
        }
        if (played && reconnects < MAX_RECONNECTS) {
            long delay = Math.min(8000, 1000L << Math.min(3, reconnects));
            reconnects++;
            closePlayer();
            callback.onStatus(this, "Reconnexion… (" + reconnects + "/" + MAX_RECONNECTS + ")");
            handler.postDelayed(restart, delay);
            return;
        }
        release();
        callback.onFailed(this, message);
    }

    private void closePlayer() {
        handler.removeCallbacks(poll);
        if (player == null) return;
        try {
            view.setPlayer(null);
            player.release();
        } catch (Exception ignored) {
        }
        player = null;
    }

    void release() {
        released = true;
        handler.removeCallbacks(restart);
        closePlayer();
    }
}
