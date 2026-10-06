package com.noctra.tv;

import android.net.Uri;

import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;

import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lecteur standard (Jellyfin) : film lu en plusieurs morceaux à la fois.
 *
 * Le lecteur standard lit le fichier du film d'un seul tenant, sur une seule
 * connexion. Quand le serveur bride ou bloque chaque connexion (seedbox :
 * débit irrégulier, connexions qui restent muettes plusieurs secondes), la
 * vidéo arrive par à-coups et l'image se fige. Ici, la suite du fichier est
 * demandée par morceaux (plages d'octets), 4 à la fois ; un morceau qui
 * n'avance plus pendant 6 s (3 s s'il est attendu par le lecteur) est
 * redemandé sur une nouvelle connexion, à
 * partir de ce qui est déjà reçu. Les en-têtes (jeton) restent ceux du
 * lecteur : chaque morceau passe par sa propre source HTTP.
 *
 * Seuls les fichiers lus tels quels (/Videos/…/stream) sont concernés ; les
 * flux convertis (HLS) et le reste passent sans changement.
 */
final class NoctraParallelDataSource implements DataSource {
    private static final int CHUNK = 3 * 1024 * 1024;
    private static final int PARALLEL = 4;
    private static final int AHEAD = 6;
    private static final long STALL_MS = 6000;
    // Morceau attendu par le lecteur : relancé plus vite (l'image en dépend).
    private static final long HEAD_STALL_MS = 3000;
    private static final int ATTEMPTS = 6;
    private static final int MAX_REPLACEMENTS = 8;
    private static final Pattern CONTENT_RANGE = Pattern.compile("bytes\\s+(\\d+)-(\\d+)/(\\d+)");

    /** Appelé par le lecteur standard (patch de VideoManager) à la création de son lecteur. */
    static DataSource.Factory wrap(final DataSource.Factory upstream) {
        return new DataSource.Factory() {
            @Override
            public DataSource createDataSource() {
                return new NoctraParallelDataSource(upstream);
            }
        };
    }

    /** Réserve du lecteur standard : départ avec 6 s, reprise avec 15 s, jusqu'à 90 s. */
    static void tune(ExoPlayer.Builder builder) {
        try {
            builder.setLoadControl(new DefaultLoadControl.Builder().setBufferDurationsMs(50000, 90000, 6000, 15000).build());
        } catch (Throwable ignored) {
            // Réglages par défaut du lecteur.
        }
    }

    static boolean progressive(Uri uri) {
        if (uri == null || uri.getScheme() == null || !uri.getScheme().startsWith("http")) return false;
        String path = String.valueOf(uri.getPath()).toLowerCase(Locale.ROOT);
        return path.contains("/videos/") && path.contains("/stream") && !path.contains(".m3u8");
    }

    // ── Morceau du fichier ──────────────────────────────────────────────
    private final class Chunk {
        final long start;
        final int size;
        final byte[] data;
        // Ouverture à laquelle appartient ce morceau (une nouvelle ouverture l'arrête).
        final AtomicBoolean stop = NoctraParallelDataSource.this.stop;
        final DataSpec base = spec;
        int filled;
        boolean done;
        IOException error;
        // Tentative en cours : une connexion bloquée est abandonnée (numéro
        // changé) et une nouvelle repart de ce qui est déjà reçu, sans attendre
        // que l'ancienne se débloque.
        int generation;
        DataSource active;
        volatile long lastDataAt = System.currentTimeMillis();

        Chunk(long start, int size) {
            this.start = start;
            this.size = size;
            this.data = new byte[size];
        }

        private synchronized boolean current(int gen) {
            return generation == gen && !done;
        }

        void attempt(int gen, DataSource opened) {
            int failures = 0;
            byte[] buffer = new byte[64 * 1024];
            DataSource source = opened;
            while (!stop.get() && current(gen)) {
                try {
                    int from;
                    synchronized (this) {
                        from = filled;
                        if (from >= size) { done = true; notifyAll(); return; }
                    }
                    if (source == null) {
                        source = upstream.createDataSource();
                        synchronized (this) { if (generation != gen) { closeQuietly(source); return; } active = source; }
                        lastDataAt = System.currentTimeMillis();
                        source.open(base.subrange(start + from - base.position, size - from));
                    } else {
                        synchronized (this) { active = source; }
                    }
                    lastDataAt = System.currentTimeMillis();
                    while (true) {
                        int want;
                        synchronized (this) {
                            if (generation != gen || stop.get()) { closeQuietly(source); return; }
                            want = Math.min(buffer.length, size - filled);
                        }
                        if (want <= 0) break;
                        int count = source.read(buffer, 0, want);
                        if (count == END) break;
                        synchronized (this) {
                            if (generation != gen) { closeQuietly(source); return; }
                            System.arraycopy(buffer, 0, data, filled, count);
                            filled += count;
                            lastDataAt = System.currentTimeMillis();
                            notifyAll();
                        }
                    }
                    closeQuietly(source);
                    source = null;
                    synchronized (this) {
                        if (generation != gen) return;
                        if (filled >= size) { done = true; active = null; notifyAll(); return; }
                    }
                    // Fin de réponse avant la fin du morceau : la suite est redemandée.
                    throw new IOException("morceau incomplet");
                } catch (IOException failure) {
                    closeQuietly(source);
                    source = null;
                    if (stop.get() || !current(gen)) return;
                    if (++failures >= ATTEMPTS) {
                        synchronized (this) { error = failure; done = true; notifyAll(); }
                        return;
                    }
                    try { Thread.sleep(Math.min(2000, 300L * failures)); } catch (InterruptedException interrupted) { return; }
                }
            }
        }

        // Connexion muette : abandonnée (fermée à part) et remplacée.
        void replace(long now) {
            final int gen;
            final DataSource stalled;
            synchronized (this) {
                if (done || generation >= MAX_REPLACEMENTS) return;
                generation++;
                gen = generation;
                stalled = active;
                active = null;
                lastDataAt = now;
            }
            closeLater(stalled);
            ExecutorService retries = retryPool;
            if (retries == null) return;
            try {
                retries.execute(new Runnable() {
                    @Override
                    public void run() { attempt(gen, null); }
                });
            } catch (Exception ignored) {
                // Source fermée entre-temps.
            }
        }
    }

    private static void closeLater(final DataSource source) {
        if (source == null) return;
        Thread thread = new Thread(new Runnable() {
            @Override
            public void run() { closeQuietly(source); }
        }, "noctra-parallel-close");
        thread.setDaemon(true);
        thread.start();
    }

    private static final int END = -1;
    private final DataSource.Factory upstream;
    private DataSource direct;
    private TransferListener listener;
    private DataSpec spec;
    private Uri uri;
    private Map<String, List<String>> headers = Collections.emptyMap();
    private volatile boolean closed;
    private volatile AtomicBoolean stop = new AtomicBoolean(true);
    private ExecutorService pool;
    private volatile ExecutorService retryPool;
    private Thread watchdog;
    private volatile long readPosition;
    private long end;
    private final Map<Long, Chunk> chunks = new HashMap<Long, Chunk>();

    private NoctraParallelDataSource(DataSource.Factory upstream) {
        this.upstream = upstream;
    }

    @Override
    public void addTransferListener(TransferListener transferListener) {
        listener = transferListener;
    }

    @Override
    public long open(DataSpec dataSpec) throws IOException {
        closed = false;
        stop = new AtomicBoolean(false);
        spec = dataSpec;
        uri = dataSpec.uri;
        if (!progressive(dataSpec.uri)) return openDirect(dataSpec);
        // Premier morceau ouvert ici : taille du fichier (Content-Range) connue.
        DataSource first = upstream.createDataSource();
        long wanted = dataSpec.length == -1 ? CHUNK : Math.min(CHUNK, dataSpec.length);
        long got;
        try {
            got = first.open(dataSpec.subrange(0, wanted));
        } catch (IOException error) {
            closeQuietly(first);
            throw error;
        }
        long total = totalLength(first.getResponseHeaders());
        if (total <= 0 || (got != -1 && got > wanted)) {
            // Serveur sans plages d'octets : lecture d'un seul tenant, comme avant.
            closeQuietly(first);
            return openDirect(dataSpec);
        }
        headers = first.getResponseHeaders();
        end = dataSpec.length == -1 ? total : Math.min(total, dataSpec.position + dataSpec.length);
        readPosition = dataSpec.position;
        if (readPosition >= end) {
            closeQuietly(first);
            return 0;
        }
        pool = Executors.newFixedThreadPool(PARALLEL, new ThreadFactory() {
            @Override
            public Thread newThread(Runnable runnable) {
                Thread thread = new Thread(runnable, "noctra-parallel");
                thread.setDaemon(true);
                return thread;
            }
        });
        retryPool = Executors.newCachedThreadPool(new ThreadFactory() {
            @Override
            public Thread newThread(Runnable runnable) {
                Thread thread = new Thread(runnable, "noctra-parallel-retry");
                thread.setDaemon(true);
                return thread;
            }
        });
        final Chunk chunk = new Chunk(readPosition, (int) Math.min(CHUNK, end - readPosition));
        final DataSource opened = first;
        synchronized (chunks) { chunks.put(chunk.start, chunk); }
        pool.execute(new Runnable() {
            @Override
            public void run() { chunk.attempt(0, opened); }
        });
        schedule();
        startWatchdog();
        return end - dataSpec.position;
    }

    private long openDirect(DataSpec dataSpec) throws IOException {
        direct = upstream.createDataSource();
        if (listener != null) direct.addTransferListener(listener);
        return direct.open(dataSpec);
    }

    private static long totalLength(Map<String, List<String>> responseHeaders) {
        if (responseHeaders == null) return -1;
        for (Map.Entry<String, List<String>> header : responseHeaders.entrySet()) {
            if (header.getKey() == null || !header.getKey().equalsIgnoreCase("Content-Range") || header.getValue() == null) continue;
            for (String value : header.getValue()) {
                Matcher match = CONTENT_RANGE.matcher(value);
                if (match.find()) return Long.parseLong(match.group(3));
            }
        }
        return -1;
    }

    // Morceaux suivants demandés à l'avance (6 au plus en mémoire, 4 en même temps).
    private void schedule() {
        long chunkStart = readPosition - ((readPosition - spec.position) % CHUNK);
        synchronized (chunks) {
            for (int step = 0; step < AHEAD; step++) {
                long start = chunkStart + (long) step * CHUNK;
                if (start >= end) break;
                if (chunks.containsKey(start)) continue;
                final Chunk chunk = new Chunk(start, (int) Math.min(CHUNK, end - start));
                chunks.put(start, chunk);
                pool.execute(new Runnable() {
                    @Override
                    public void run() { chunk.attempt(0, null); }
                });
            }
        }
    }

    // Connexion muette depuis 6 s (3 s pour le morceau attendu) : fermée, le morceau repart sur une nouvelle.
    private void startWatchdog() {
        final AtomicBoolean ended = stop;
        watchdog = new Thread(new Runnable() {
            @Override
            public void run() {
                while (!ended.get()) {
                    try { Thread.sleep(1000); } catch (InterruptedException interrupted) { return; }
                    long now = System.currentTimeMillis();
                    long head = readPosition;
                    Chunk[] current;
                    synchronized (chunks) { current = chunks.values().toArray(new Chunk[0]); }
                    for (Chunk chunk : current) {
                        boolean busy;
                        synchronized (chunk) { busy = chunk.active != null && !chunk.done; }
                        boolean waited = head >= chunk.start && head < chunk.start + chunk.size;
                        if (busy && now - chunk.lastDataAt > (waited ? HEAD_STALL_MS : STALL_MS)) chunk.replace(now);
                    }
                }
            }
        }, "noctra-parallel-watch");
        watchdog.setDaemon(true);
        watchdog.start();
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
        if (direct != null) return direct.read(buffer, offset, length);
        if (length == 0) return 0;
        if (readPosition >= end) return END;
        long chunkStart = readPosition - ((readPosition - spec.position) % CHUNK);
        Chunk chunk;
        synchronized (chunks) { chunk = chunks.get(chunkStart); }
        if (chunk == null) {
            schedule();
            synchronized (chunks) { chunk = chunks.get(chunkStart); }
            if (chunk == null) throw new IOException("morceau introuvable");
        }
        int inChunk = (int) (readPosition - chunk.start);
        int count;
        synchronized (chunk) {
            while (chunk.filled <= inChunk && !chunk.done && !closed) {
                try {
                    chunk.wait(500);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IOException("lecture interrompue");
                }
            }
            if (closed) throw new IOException("source fermée");
            if (chunk.filled <= inChunk) {
                throw chunk.error != null ? chunk.error : new IOException("morceau vide");
            }
            count = Math.min(length, chunk.filled - inChunk);
            System.arraycopy(chunk.data, inChunk, buffer, offset, count);
        }
        readPosition += count;
        if (readPosition - chunk.start >= chunk.size) {
            // Morceau lu en entier : oublié, le suivant de la file est demandé.
            synchronized (chunks) { chunks.remove(chunk.start); }
            schedule();
        }
        return count;
    }

    @Override
    public Uri getUri() {
        return direct != null ? direct.getUri() : uri;
    }

    @Override
    public Map<String, List<String>> getResponseHeaders() {
        return direct != null ? direct.getResponseHeaders() : headers;
    }

    @Override
    public void close() throws IOException {
        closed = true;
        stop.set(true);
        if (direct != null) {
            DataSource source = direct;
            direct = null;
            source.close();
            return;
        }
        Chunk[] current;
        synchronized (chunks) {
            current = chunks.values().toArray(new Chunk[0]);
            chunks.clear();
        }
        for (Chunk chunk : current) {
            DataSource source;
            synchronized (chunk) {
                chunk.notifyAll();
                source = chunk.active;
                chunk.active = null;
            }
            closeLater(source);
        }
        if (pool != null) pool.shutdownNow();
        pool = null;
        if (retryPool != null) retryPool.shutdownNow();
        retryPool = null;
        if (watchdog != null) watchdog.interrupt();
        watchdog = null;
    }

    private static void closeQuietly(DataSource source) {
        try {
            if (source != null) source.close();
        } catch (Throwable ignored) {
            // Déjà fermée.
        }
    }
}
