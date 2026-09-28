package com.noctra.tv;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Lecture d'une chaîne en direct avec ExoPlayer (Media3 de l'appli Jellyfin),
 * pensée pour les connexions instables :
 * - tampon plus large qu'à l'origine, et une réserve plus grande après une
 *   coupure pour éviter les coupures à répétition ;
 * - après un blocage en pleine lecture, 6 s de réserve en plus sur le direct
 *   (24 s au plus, jamais trop près du début de la fenêtre du flux) ;
 * - nouvelles tentatives sur les segments HLS avant de signaler une erreur ;
 * - retour au direct quand le flux a trop de retard (BEHIND_LIVE_WINDOW) ;
 * - surveillance des blocages : une mise en mémoire tampon trop longue relance
 *   le flux ;
 * - reprise en douceur avant toute reconnexion : un blocage de plus de 7 s
 *   relance d'abord la lecture au bord du direct, une erreur passagère
 *   (réseau, segment manquant) est d'abord retentée dans le même lecteur,
 *   sans écran noir ni nouveau décodeur ;
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
        /** Fin d'un film ou d'un épisode (jamais pour un direct). */
        void onEnded(NoctraStream stream);
        /** Prêt à lire (true) ou en chargement (false) : suivi SyncPlay. */
        void onReadyChanged(NoctraStream stream, boolean ready);
    }

    static final String HLS = "application/x-mpegURL";
    private static final int BEHIND_LIVE_WINDOW = 1002;
    private static final long POLL_MS = 500;
    private static final long START_TIMEOUT_MS = 30000;
    private static final long STALL_TIMEOUT_MS = 15000;
    private static final long SOFT_STALL_MS = 7000;
    private static final int MAX_SOFT_RETRIES = 2;
    private static final long STABLE_MS = 30000;
    private static final int MAX_RECONNECTS = 8;

    private final Context context;
    private final PlayerView view;
    private final Callback callback;
    private final String url;
    private final Map<String, String> headers;
    private final boolean compact;
    private final boolean live;
    private final long startMs;
    private long positionMs;
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
    private boolean edgeSought;
    private int softRetries;
    private float volume = 1f;
    private boolean playWhenReady = true;
    private int maxWidth;
    private int maxHeight;

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

    /** Chaîne en direct. Le jeton Noctra n'est envoyé qu'au serveur Noctra (choix de l'appelant). */
    NoctraStream(Context context, PlayerView view, Callback callback, String url, String mime, String token, boolean compact) {
        this(context, view, callback, url, mime, tokenHeaders(token), compact, true, 0);
    }

    /**
     * @param compact tampon réduit (multiview : plusieurs lecteurs à la fois).
     * @param live direct (retour au direct, jamais de fin) ou film/épisode (reprise à la position).
     */
    NoctraStream(Context context, PlayerView view, Callback callback, String url, String mime, Map<String, String> headers,
                 boolean compact, boolean live, long startMs) {
        this.context = context;
        this.view = view;
        this.callback = callback;
        this.url = url;
        this.headers = headers == null ? new HashMap<String, String>() : headers;
        this.compact = compact;
        this.live = live;
        this.startMs = Math.max(0, startMs);
        this.positionMs = this.startMs;
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

    // Réserve supplémentaire sur le direct : 0 au départ (démarrage normal,
    // au point prévu par le flux), puis 6 s de plus après chaque blocage en
    // pleine lecture (24 s au plus), gardée pour les chaînes suivantes. Elle
    // n'est prise qu'une fois le flux prêt, sans jamais s'approcher à moins de
    // 8 s du début de la fenêtre du direct (segments bientôt effacés).
    private static long extraOffsetMs;
    private static final long WINDOW_SAFETY_MS = 8000;
    private boolean reserveApplied;
    // Mise en mémoire qui suit ce recul : pas un blocage.
    private boolean reserveSeeking;

    private static void widenLiveOffset() {
        extraOffsetMs = Math.min(24000, extraOffsetMs + 6000);
    }

    /** Recul dans la fenêtre du direct pour garder plus de réserve (connexion irrégulière). */
    private void applyLiveReserve() {
        if (reserveApplied || !live || extraOffsetMs <= 0 || player == null) return;
        reserveApplied = true;
        try {
            long window = player.getDuration();
            long position = player.getCurrentPosition();
            if (window <= 0 || position <= 0) return;
            long target = Math.max(WINDOW_SAFETY_MS, position - extraOffsetMs);
            if (target < position - 2000) {
                reserveSeeking = true;
                player.seekTo(target);
            }
        } catch (Exception ignored) {
        }
    }

    private static Map<String, String> tokenHeaders(String token) {
        HashMap<String, String> map = new HashMap<String, String>();
        if (token != null && !token.isEmpty()) map.put("x-noctra-token", token);
        return map;
    }

    boolean hasPlayed() {
        return played;
    }

    long positionMs() {
        if (player != null && played) {
            try { positionMs = Math.max(0, player.getCurrentPosition()); } catch (Exception ignored) { }
        }
        return positionMs;
    }

    long durationMs() {
        try { return player == null ? 0 : Math.max(0, player.getDuration()); } catch (Exception error) { return 0; }
    }

    boolean isPaused() {
        try { return player != null && ready && !player.isPlaying(); } catch (Exception error) { return false; }
    }

    void start() {
        released = false;
        open();
    }

    /** Démarrage en pause (SyncPlay : le groupe décide du départ). */
    void setAutoplay(boolean autoplay) {
        playWhenReady = autoplay;
    }

    void play() {
        playWhenReady = true;
        if (player != null) player.setPlayWhenReady(true);
    }

    void pause() {
        playWhenReady = false;
        if (player != null) player.setPlayWhenReady(false);
    }

    void seek(long ms) {
        positionMs = Math.max(0, ms);
        if (player != null) {
            try { player.seekTo(positionMs); } catch (Exception ignored) { }
        }
    }

    boolean wantsToPlay() {
        return playWhenReady;
    }

    /** Résolution maximale (vignette du multiview) : moins de travail pour le décodeur. */
    void setMaxVideoSize(int width, int height) {
        maxWidth = width;
        maxHeight = height;
        applyMaxVideoSize();
    }

    private void applyMaxVideoSize() {
        if (player == null || maxWidth <= 0 || maxHeight <= 0) return;
        try {
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setMaxVideoSize(maxWidth, maxHeight).build());
        } catch (Throwable ignored) {
        }
    }

    // Décodeur de secours : si les décodeurs matériels sont tous occupés
    // (multiview), un autre décodeur (logiciel) prend le relais. Le réglage
    // existe dans l'APK Jellyfin mais sans accesseur : il est activé directement.
    // Décodeurs FFmpeg de l'APK (AC3, E-AC3, DTS…) en renfort des décodeurs
    // du téléviseur : plus de chaînes muettes faute de décodeur audio.
    private DefaultRenderersFactory renderers() {
        DefaultRenderersFactory factory = new DefaultRenderersFactory(context);
        try {
            factory.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON);
        } catch (Throwable ignored) {
        }
        try {
            java.lang.reflect.Field fallback = DefaultRenderersFactory.class.getDeclaredField("enableDecoderFallback");
            fallback.setAccessible(true);
            fallback.setBoolean(factory, true);
        } catch (Throwable ignored) {
        }
        return factory;
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
        reserveApplied = false;
        startedAt = System.currentTimeMillis();
        bufferingSince = 0;
        // Flux repéré dans une page web : même identité que la page (sinon refus).
        String agent = headers.containsKey("User-Agent") ? headers.get("User-Agent") : "NoctraTV/" + NoctraConfig.VERSION;
        DataSource.Factory http;
        if (headers.containsKey("x-noctra-doh")) {
            // Site bloqué par le DNS du fournisseur d'accès : OkHttp et DNS sécurisé.
            HashMap<String, String> properties = new HashMap<String, String>(headers);
            properties.remove("x-noctra-doh");
            http = new OkHttpDataSource.Factory(NoctraDns.client())
                .setUserAgent(agent)
                .setDefaultRequestProperties(properties);
        } else {
            http = new DefaultHttpDataSource.Factory()
                .setUserAgent(agent)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(12000)
                .setReadTimeoutMs(20000)
                .setDefaultRequestProperties(headers);
        }
        // Direct : segments « déguisés » (faux en-tête d'image) nettoyés avant lecture.
        DataSource.Factory data = live ? new NoctraCleanDataSource.Factory(http) : http;
        DefaultMediaSourceFactory sources = new DefaultMediaSourceFactory(data)
            .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(6));
        DefaultLoadControl buffer = compact
            ? new DefaultLoadControl.Builder().setBufferDurationsMs(12000, 30000, 2000, 4000).build()
            : new DefaultLoadControl.Builder().setBufferDurationsMs(20000, 60000, 2500, 6000).build();
        ExoPlayer exoPlayer = new ExoPlayer.Builder(context, renderers())
            .setMediaSourceFactory(sources)
            .setLoadControl(buffer)
            .build();
        player = exoPlayer;
        applyMaxVideoSize();
        MediaItem.Builder item = new MediaItem.Builder().setUri(url);
        String mime = attempts.get(attempt);
        if (!mime.isEmpty()) item.setMimeType(mime);
        view.setPlayer(player);
        player.setVolume(volume);
        // Film ou épisode : reprise à la position (début, reprise, ou point de coupure).
        if (live) player.setMediaItem(item.build());
        else player.setMediaItem(item.build(), positionMs);
        player.prepare();
        player.setPlayWhenReady(playWhenReady);
        handler.removeCallbacks(poll);
        handler.postDelayed(poll, POLL_MS);
    }

    private void check() {
        if (player == null || released) return;
        long now = System.currentTimeMillis();
        PlaybackException error = player.getPlayerError();
        int state = player.getPlaybackState();
        if (error != null) {
            if (live && error.errorCode == BEHIND_LIVE_WINDOW && played) {
                // Trop de retard sur le direct : on revient au bord du direct.
                callback.onStatus(this, "Retour au direct…");
                player.seekToDefaultPosition();
                player.prepare();
                handler.postDelayed(poll, POLL_MS);
                return;
            }
            // Erreur passagère d'un direct qui fonctionnait : nouvel essai dans
            // le même lecteur (image conservée) avant de tout reconstruire.
            if (live && played && softRetries < MAX_SOFT_RETRIES) {
                softRetries++;
                callback.onStatus(this, "Reprise du flux…");
                try {
                    player.seekToDefaultPosition();
                    player.prepare();
                    player.setPlayWhenReady(playWhenReady);
                } catch (Exception ignored) {
                }
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
                applyLiveReserve();
                readySince = now;
                callback.onStatus(this, null);
                callback.onReadyChanged(this, true);
            }
            bufferingSince = 0;
            edgeSought = false;
            if (!live) positionMs();
            if ((reconnects > 0 || softRetries > 0) && now - readySince > STABLE_MS) {
                reconnects = 0;
                softRetries = 0;
            }
        } else if (state == Player.STATE_BUFFERING) {
            // Blocage en pleine lecture : réserve plus grande à la prochaine ouverture.
            if (ready && live && !reserveSeeking) widenLiveOffset();
            reserveSeeking = false;
            if (ready) callback.onReadyChanged(this, false);
            ready = false;
            if (bufferingSince == 0) bufferingSince = now;
            // Direct bloqué : d'abord un saut au bord du direct (segments récents).
            if (live && played && !edgeSought && now - bufferingSince > SOFT_STALL_MS) {
                edgeSought = true;
                callback.onStatus(this, "Retour au direct…");
                try { player.seekToDefaultPosition(); } catch (Exception ignored) { }
            }
            if (played && now - bufferingSince > (live ? STALL_TIMEOUT_MS : STALL_TIMEOUT_MS * 3)) {
                recover("Le flux ne répond plus.");
                return;
            }
        } else if (state == Player.STATE_ENDED) {
            if (!live) {
                handler.removeCallbacks(poll);
                callback.onEnded(this);
                return;
            }
            // Un direct ne se termine pas : fin de playlist = coupure côté source.
            recover("Le direct s'est interrompu.");
            return;
        }
        // Film : le serveur peut mettre du temps à préparer la conversion.
        if (!played && now - startedAt > (live ? START_TIMEOUT_MS : START_TIMEOUT_MS * 2)) {
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
