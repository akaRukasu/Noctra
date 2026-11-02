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
 * - réserve agrandie sur le direct : 12 s de recul une fois le flux prêt, 6 s
 *   de plus après chaque blocage (36 s au plus, jamais trop près du début de
 *   la fenêtre du flux) ;
 * - direct à vitesse fixe (pas de rattrapage qui revide la réserve),
 *   définition plafonnée si les coupures se répètent ;
 * - diagnostic : réserve, débit reçu par segment, coupures, relais.
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
    // Direct qui ne démarre pas : 15 s au premier essai, 10 s au second (autre
    // format), puis serveur suivant (avant : 30 s par essai, soit 1 min).
    private static final long LIVE_START_MS = 15000;
    private static final long LIVE_RETRY_START_MS = 10000;
    private static final long STALL_TIMEOUT_MS = 15000;
    private static final long SLOW_QUIET_MS = 8000;
    private static final long SLOW_WAIT_MS = 60000;
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
        this.headers = headers == null ? new HashMap<String, String>() : new HashMap<String, String>(headers);
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

    // Sur un direct, le lecteur ne peut charger que jusqu'au bord du direct :
    // la réserve est la distance au direct. Une fois le flux prêt (démarrage
    // au point prévu par le flux), la lecture recule de 12 s pour agrandir la
    // réserve (place pour charger plusieurs segments à la fois), puis de 6 s
    // de plus après chaque blocage (36 s au plus), sans
    // jamais s'approcher à moins de 8 s du début de la fenêtre du direct
    // (segments bientôt effacés). Vitesse fixe : l'avance reste acquise.
    private static long extraOffsetMs = 12000;
    // Marge au début de la fenêtre du direct (segments encore listés par la
    // source) : 4 s suffisent ; à 8 s, une source à fenêtre courte ne laissait
    // presque aucune réserve (0 à 2 s : coupure au moindre segment en retard).
    private static final long WINDOW_SAFETY_MS = 4000;
    private boolean reserveApplied;
    // noctra.81 : retard visé sur le direct (la réserve ne peut pas le dépasser) :
    // 12 s de plus que le recul de départ, sans quitter les trois quarts de la
    // fenêtre. En dessous, lecture à 97 % (imperceptible) jusqu'à le retrouver :
    // la source qui met 13 s pour un segment ne coupe plus l'image.
    private boolean slowed;
    private boolean speedBroken;
    // Bord du direct : dernière avancée (retard qui remonte d'un coup = la
    // source a publié de nouveaux segments). Figé longtemps : liste en retard.
    private long lastRetard = -1;
    private long edgeMovedAt;
    // Mise en mémoire qui suit ce recul : pas un blocage.
    private boolean reserveSeeking;

    private static void widenLiveOffset() {
        extraOffsetMs = Math.min(36000, extraOffsetMs + 6000);
    }

    // Coupures répétées (2 en 3 min) : définition plafonnée (720p, puis 540p)
    // sur les flux qui en proposent plusieurs ; levée après 5 min sans coupure.
    private static int qualityCap;
    private static long lastStallAt;
    private static long stableSince;
    private static final int[][] CAPS = { { 1280, 720 }, { 960, 540 } };

    private void noteStall(long now) {
        if (lastStallAt > 0 && now - lastStallAt < 180000 && qualityCap < CAPS.length) {
            qualityCap++;
            applyMaxVideoSize();
        }
        lastStallAt = now;
        stableSince = 0;
    }

    private void noteStable(long now) {
        if (qualityCap == 0) return;
        if (stableSince == 0) stableSince = now;
        if (now - stableSince > 300000 && now - lastStallAt > 300000) {
            qualityCap = 0;
            stableSince = 0;
            applyMaxVideoSize();
        }
    }

    /** Retard sur le direct ramené vers l'objectif par un léger ralenti (jamais d'accélération). */
    // Bord du direct suivi à chaque passage (lecture et coupure) : pendant une
    // coupure, la fenêtre qui glisse fait remonter le retard ; s'il ne remonte
    // plus, la source ne publie plus rien.
    private void trackEdge(long now) {
        try {
            long window = player.getDuration();
            long position = player.getCurrentPosition();
            if (window <= 0 || position < 0 || position > window) return;
            long retard = window - position;
            if (lastRetard < 0 || retard > lastRetard + 800) edgeMovedAt = now;
            lastRetard = retard;
        } catch (Throwable ignored) {
        }
    }

    // noctra.83 : coupure de plus de 10 s pendant que la source ne publie plus
    // rien depuis 15 s (diagnostic « liste figée ») : seul un autre serveur peut
    // aider. Signalé une fois par coupure au lecteur, qui prévient l'accueil.
    private static final long STUCK_STALL_MS = 10000;
    private static final long STUCK_EDGE_MS = 15000;
    private boolean stuckReported;
    private boolean stuckPending;

    /** Source figée pendant une coupure (une seule fois par coupure). */
    boolean takeSourceStuck() {
        boolean value = stuckPending;
        stuckPending = false;
        return value;
    }

    private void keepLiveDistance(long now) {
        try {
            long window = player.getDuration();
            long position = player.getCurrentPosition();
            if (window <= 0 || position < 0 || position > window) return;
            long retard = window - position;
            if (speedBroken) return;
            long goal = Math.min(window - Math.max(WINDOW_SAFETY_MS, window / 4), 12000 + extraOffsetMs);
            if (!slowed && retard < goal - 3000) {
                player.setPlaybackSpeed(0.97f);
                slowed = true;
            } else if (slowed && retard >= goal) {
                player.setPlaybackSpeed(1f);
                slowed = false;
            }
        } catch (Throwable error) {
            speedBroken = true;
        }
    }

    /** Recul dans la fenêtre du direct pour garder plus de réserve (connexion irrégulière). */
    private void applyLiveReserve() {
        if (reserveApplied || !live || extraOffsetMs <= 0 || player == null) return;
        reserveApplied = true;
        try {
            long window = player.getDuration();
            long position = player.getCurrentPosition();
            if (window <= 0 || position <= 0) return;
            // Marge au début de la fenêtre : 4 s, et au moins un quart de la
            // fenêtre (fenêtre de 38 s : 9,5 s). Placée tout au début, la lecture
            // en sortait au premier segment bloqué (retard 38 s sur 38 s).
            long margin = Math.max(WINDOW_SAFETY_MS, window / 4);
            long target = Math.max(margin, position - extraOffsetMs);
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

    /** Coupures depuis l'ouverture de ce flux. */
    int stallCount() {
        return stalls;
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
        stalls = 0;
        NoctraCleanDataSource.resetStats();
        if (!compact) NoctraPrefetchDataSource.reset();
        open();
    }

    private int stalls;
    // Film : débit annoncé par le serveur (b/s), affiché dans le diagnostic.
    private long sourceBitrate;

    // Film : fichier d'origine lu directement (4 connexions, sans conversion
    // par le serveur), avec repli sur le flux préparé par le serveur si
    // l'appareil ne sait pas le lire. Langues audio et sous-titres choisies.
    private String directUrl;
    private boolean directFailed;
    private String audioLanguage = "";
    private String textLanguage = "";

    void setDirect(String address, String audio, String text) {
        directUrl = address;
        audioLanguage = audio == null ? "" : audio;
        textLanguage = text == null ? "" : text;
    }

    boolean isDirect() {
        return !live && directUrl != null && !directFailed;
    }

    // Langues voulues, appliquées par réflexion (méthodes présentes dans le lecteur de l'APK).
    private void applyTrackPreferences() {
        if (player == null) return;
        try {
            Object parameters = player.getClass().getMethod("getTrackSelectionParameters").invoke(player);
            Object builder = parameters.getClass().getMethod("buildUpon").invoke(parameters);
            Class<?> type = builder.getClass();
            if (!audioLanguage.isEmpty()) builder = type.getMethod("setPreferredAudioLanguage", String.class).invoke(builder, audioLanguage);
            if (textLanguage.isEmpty()) {
                builder = type.getMethod("setTrackTypeDisabled", int.class, boolean.class).invoke(builder, 3, true);
            } else {
                builder = type.getMethod("setTrackTypeDisabled", int.class, boolean.class).invoke(builder, 3, false);
                builder = type.getMethod("setPreferredTextLanguage", String.class).invoke(builder, textLanguage);
            }
            Object built = builder.getClass().getMethod("build").invoke(builder);
            for (java.lang.reflect.Method method : player.getClass().getMethods()) {
                if (method.getName().equals("setTrackSelectionParameters") && method.getParameterTypes().length == 1) {
                    method.invoke(player, built);
                    break;
                }
            }
        } catch (Throwable ignored) {
            // Pistes par défaut du fichier.
        }
    }

    void setSourceBitrate(long bitrate) {
        sourceBitrate = Math.max(0, bitrate);
    }

    // Film : vidéo du fichier d'origine (format, définition), comparée à l'image reçue.
    private String sourceCodec = "";
    private int sourceWidth, sourceHeight;

    void setSourceVideo(String codec, int width, int height) {
        sourceCodec = codec == null ? "" : codec;
        sourceWidth = width;
        sourceHeight = height;
    }

    private static String codecName(String value) {
        String codec = value == null ? "" : value.toLowerCase(java.util.Locale.ROOT);
        if (codec.contains("hevc") || codec.contains("h265") || codec.startsWith("hvc") || codec.startsWith("hev")) return "HEVC";
        if (codec.contains("avc") || codec.contains("h264")) return "H264";
        if (codec.contains("av01") || codec.contains("av1")) return "AV1";
        if (codec.contains("vp9")) return "VP9";
        if (codec.contains("mpeg2")) return "MPEG2";
        return codec.replace("video/", "").toUpperCase(java.util.Locale.ROOT);
    }

    /** Image reçue par l'appareil (format du décodeur), d'origine ou convertie par le serveur. */
    private String receivedVideo() {
        if (player == null) return null;
        try {
            // Par réflexion : méthode présente dans le lecteur de l'APK, pas forcément dans son interface.
            Object format = player.getClass().getMethod("getVideoFormat").invoke(player);
            if (format == null) return null;
            Class<?> type = format.getClass();
            String mime = (String) type.getField("sampleMimeType").get(format);
            int width = type.getField("width").getInt(format), height = type.getField("height").getInt(format);
            String codec = codecName(mime);
            StringBuilder text = new StringBuilder("Image reçue : ").append(codec);
            if (width > 0 && height > 0) text.append(" ").append(width).append("×").append(height);
            if (!sourceCodec.isEmpty() && sourceWidth > 0) {
                boolean same = codec.equals(codecName(sourceCodec)) && Math.abs(width - sourceWidth) <= 8;
                text.append(same ? " (d'origine)" : " · convertie par le serveur (original " + codecName(sourceCodec) + " " + sourceWidth + "×" + sourceHeight + ")");
            }
            return text.toString();
        } catch (Throwable ignored) {
            return null;
        }
    }

    /**
     * Diagnostic du direct, affiché dans le bandeau et pendant une coupure :
     * « Réserve 12 s · Réception 8,4 Mb/s · dernier segment 1,2 s · 3 coupures · relais Noctra ».
     */
    String diagnostics() {
        StringBuilder text = new StringBuilder();
        try {
            if (player != null) text.append("Réserve ").append(Math.max(0, player.getTotalBufferedDuration()) / 1000).append(" s");
            // Direct : longueur de la fenêtre publiée par la source et retard sur
            // le direct (la réserve ne peut pas dépasser ce retard).
            if (player != null && live) {
                long window = player.getDuration();
                long position = player.getCurrentPosition();
                if (window > 0 && position >= 0 && position <= window) {
                    text.append(" · fenêtre ").append(window / 1000).append(" s · retard ").append((window - position) / 1000).append(" s");
                }
                if (slowed) text.append(" · ralenti 97 %");
                long frozen = edgeMovedAt > 0 ? System.currentTimeMillis() - edgeMovedAt : 0;
                if (frozen > 10000) text.append(" · liste figée depuis ").append(frozen / 1000).append(" s");
            }
        } catch (Throwable ignored) {
        }
        String reception = NoctraCleanDataSource.receptionSummary();
        if (!reception.isEmpty()) text.append(text.length() > 0 ? " · " : "").append(reception);
        text.append(text.length() > 0 ? " · " : "").append(stalls).append(stalls > 1 ? " coupures" : " coupure");
        int hedges = NoctraPrefetchDataSource.hedgeCount();
        if (live && hedges > 0) text.append(" · ").append(hedges).append(hedges > 1 ? " segments relancés" : " segment relancé");
        if (!live && sourceBitrate > 0) text.append(" · film ").append(Math.round(sourceBitrate / 1e6)).append(" Mb/s");
        if (qualityCap > 0) text.append(" · définition limitée à ").append(CAPS[qualityCap - 1][1]).append("p");
        text.append(!live ? (isDirect() ? " · fichier d'origine (" + NoctraParallelDataSource.summary() + ")" : " · serveur Jellyfin")
            : url.contains("/api/tv/") ? " · relais du serveur Noctra" : " · flux direct");
        String received = live ? null : receivedVideo();
        if (received != null) text.append("\n").append(received);
        // Film coupé plusieurs fois : la réception ne suit pas son débit.
        if (!live && stalls >= 2) text.append("\nCoupures répétées : choisir une qualité plus basse (menu du compte › Qualité des films).");
        return text.toString();
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
        if (player == null) return;
        int width = maxWidth > 0 ? maxWidth : Integer.MAX_VALUE;
        int height = maxHeight > 0 ? maxHeight : Integer.MAX_VALUE;
        if (live && qualityCap > 0) {
            width = Math.min(width, CAPS[qualityCap - 1][0]);
            height = Math.min(height, CAPS[qualityCap - 1][1]);
        }
        if (width == Integer.MAX_VALUE && maxWidth <= 0 && qualityCap == 0 && !capApplied) return;
        capApplied = width != Integer.MAX_VALUE;
        try {
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setMaxVideoSize(width, height).build());
        } catch (Throwable ignored) {
        }
    }
    private boolean capApplied;

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
        slowed = false;
        lastRetard = -1;
        edgeMovedAt = 0;
        startedAt = System.currentTimeMillis();
        bufferingSince = 0;
        // Flux repéré dans une page web : même identité que la page (sinon refus).
        String agent = headers.containsKey("User-Agent") ? headers.get("User-Agent") : "NoctraTV/" + NoctraConfig.VERSION;
        DataSource.Factory http;
        boolean direct = isDirect();
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
                // Direct : une connexion muette est abandonnée plus tôt (8 s) et
                // la requête relancée, au lieu de vider la réserve en attendant.
                .setConnectTimeoutMs(live ? 8000 : 12000)
                .setReadTimeoutMs(live ? 8000 : 20000)
                .setDefaultRequestProperties(headers);
        }
        // Direct : segments « déguisés » (faux en-tête d'image) nettoyés avant lecture.
        // Films aussi : mesure de la réception des segments (diagnostic des coupures).
        // Segments suivants chargés plusieurs à la fois (débit bridé par
        // connexion : seedbox, relais) ; pas avec le DNS sécurisé (OkHttp), ni
        // en multiview (jusqu'à 12 flux : trop de requêtes à la fois).
        DataSource.Factory data;
        if (direct) {
            // Fichier d'origine : morceaux lus 4 à la fois (voir NoctraParallelDataSource).
            NoctraParallelDataSource.resetStats();
            data = NoctraParallelDataSource.wrap(http);
        } else {
            if (!compact && !headers.containsKey("x-noctra-doh")) http = new NoctraPrefetchDataSource.Factory(http, headers, agent);
            data = new NoctraCleanDataSource.Factory(http);
        }
        DefaultMediaSourceFactory sources = new DefaultMediaSourceFactory(data)
            // Avant la première image d'un direct : 3 nouvelles tentatives par
            // requête (erreur vite constatée) ; ensuite 6 (coupures passagères).
            .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(live && !played ? 3 : 6));
        DefaultLoadControl buffer = compact
            ? new DefaultLoadControl.Builder().setBufferDurationsMs(12000, 30000, 2000, 4000).build()
            // Réception Wi-Fi irrégulière (projecteurs, clés TV) : démarrage avec 3 s
            // d'avance et reprise après une coupure avec 8 s (au lieu de 2,5 s et
            // 6 s), pour ne pas repartir aussitôt vers une nouvelle coupure.
            : live ? new DefaultLoadControl.Builder().setBufferDurationsMs(30000, 60000, 3000, 8000).build()
            // Film : la réserve peut se remplir à l'avance (rien n'est « en direct ») ;
            // départ avec 6 s et reprise avec 15 s pour éviter les coupures en série
            // quand le serveur répond par à-coups (seedbox).
            : new DefaultLoadControl.Builder().setBufferDurationsMs(50000, 90000, 6000, 15000).build();
        // Avance et retour rapides de 15 s (boutons des commandes, touches ⏪ ⏩).
        // Direct : seulement si la source garde une fenêtre de retour (les
        // boutons n'apparaissent pas sans elle), sans dépasser le bord du direct.
        ExoPlayer exoPlayer = new ExoPlayer.Builder(context, renderers())
            .setMediaSourceFactory(sources)
            .setLoadControl(buffer)
            .setSeekBackIncrementMs(15000)
            .setSeekForwardIncrementMs(15000)
            .build();
        player = exoPlayer;
        applyMaxVideoSize();
        MediaItem.Builder item = new MediaItem.Builder().setUri(direct ? directUrl : url);
        String mime = direct ? "" : attempts.get(attempt);
        if (!mime.isEmpty()) item.setMimeType(mime);
        if (!live) applyTrackPreferences();
        if (live) {
            // Jamais d'accélération : après une coupure, le lecteur ne rattrape
            // plus le direct en accélérant (ce qui revidait la réserve). Le point
            // de départ reste celui prévu par le flux.
            // noctra.80 : léger ralenti permis (97 %, imperceptible) quand la
            // lecture s'est rapprochée du direct plus que prévu (liste de la
            // source en retard) : l'avance revient peu à peu, sans saut.
            try {
                item.setLiveConfiguration(new MediaItem.LiveConfiguration.Builder()
                    .setMinPlaybackSpeed(0.97f)
                    .setMaxPlaybackSpeed(1f)
                    .build());
            } catch (Throwable ignored) {
            }
        }
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
                // Trop de retard sur le direct : retour dans la fenêtre, avec de
                // l'avance (au bord du direct, la réserve restait à ~10 s pour le
                // reste de la séance) : jusqu'à la moitié de la fenêtre derrière
                // le direct, jamais à moins d'un quart de fenêtre de son début.
                callback.onStatus(this, "Retour au direct…");
                long window = 0;
                try { window = player.getDuration(); } catch (Exception ignored) { }
                if (window > 0) {
                    long margin = Math.max(WINDOW_SAFETY_MS, window / 4);
                    long back = Math.min(extraOffsetMs, window / 2);
                    player.seekTo(Math.max(margin, window - back));
                } else {
                    player.seekToDefaultPosition();
                }
                player.prepare();
                handler.postDelayed(poll, POLL_MS);
                return;
            }
            // Erreur passagère d'un direct qui fonctionnait : nouvel essai dans
            // le même lecteur (image conservée) avant de tout reconstruire.
            // Reprise à la même position : l'avance prise sur le direct (réserve)
            // est gardée ; position sortie de la fenêtre : retour au direct (ci-dessus).
            if (live && played && softRetries < MAX_SOFT_RETRIES) {
                softRetries++;
                callback.onStatus(this, "Reprise du flux…");
                try {
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
        if (live) trackEdge(now);
        if (state == Player.STATE_READY) {
            stuckReported = false;
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
            if (live) {
                noteStable(now);
                keepLiveDistance(now);
            }
            if (!live) positionMs();
            if ((reconnects > 0 || softRetries > 0) && now - readySince > STABLE_MS) {
                reconnects = 0;
                softRetries = 0;
            }
        } else if (state == Player.STATE_BUFFERING) {
            // Blocage en pleine lecture : réserve plus grande à la prochaine ouverture.
            if (ready && !reserveSeeking) {
                if (live) {
                    widenLiveOffset();
                    noteStall(now);
                }
                stalls++;
            }
            reserveSeeking = false;
            if (ready) callback.onReadyChanged(this, false);
            ready = false;
            if (bufferingSince == 0) bufferingSince = now;
            if (live && played && !stuckReported && now - bufferingSince > STUCK_STALL_MS
                && edgeMovedAt > 0 && now - edgeMovedAt > STUCK_EDGE_MS) {
                stuckReported = true;
                stuckPending = true;
                callback.onStatus(this, "Source figée · recherche d'un autre serveur… " + diagnostics());
            }
            // Coupure en cours : chiffres affichés pour comprendre d'où elle vient.
            if (played && now - bufferingSince > 1500 && !edgeSought) callback.onStatus(this, "Mise en mémoire… " + diagnostics());
            // Direct bloqué : d'abord un saut au bord du direct (segments récents).
            if (live && played && !edgeSought && now - bufferingSince > SOFT_STALL_MS) {
                edgeSought = true;
                callback.onStatus(this, "Retour au direct…");
                try { player.seekToDefaultPosition(); } catch (Exception ignored) { }
            }
            if (played && now - bufferingSince > (live ? STALL_TIMEOUT_MS : STALL_TIMEOUT_MS * 3)) {
                // Des données arrivent encore (réception lente, Wi-Fi faible) :
                // on attend (1 min au plus) ; reconnecter viderait la réserve
                // et ferait repartir de zéro. Rien reçu depuis 8 s : flux coupé.
                long quiet = now - NoctraCleanDataSource.lastDataAt();
                if (quiet < SLOW_QUIET_MS && now - bufferingSince < SLOW_WAIT_MS) {
                    callback.onStatus(this, "Réception lente… " + diagnostics());
                } else {
                    recover("Le flux ne répond plus.");
                    return;
                }
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
        // Film : démarrage suivi à l'écran (préparation par le serveur, premiers segments).
        if (!live && !played && now - startedAt > 3000) {
            callback.onStatus(this, "Démarrage du film… " + (now - startedAt) / 1000 + " s");
        }
        // Film : le serveur peut mettre du temps à préparer la conversion.
        if (!played && now - startedAt > (live ? (attempt == 0 ? LIVE_START_MS : LIVE_RETRY_START_MS) : isDirect() ? START_TIMEOUT_MS : START_TIMEOUT_MS * 2)) {
            recover("Le flux ne répond pas.");
            return;
        }
        handler.postDelayed(poll, POLL_MS);
    }

    private void recover(String message) {
        // Fichier d'origine illisible ici (format, décodeur) : flux préparé par le serveur.
        if (!played && isDirect()) {
            directFailed = true;
            callback.onStatus(this, "Lecture directe impossible · fichier préparé par le serveur…");
            open();
            return;
        }
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
