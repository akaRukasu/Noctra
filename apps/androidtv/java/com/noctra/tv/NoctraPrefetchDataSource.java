package com.noctra.tv;

import android.net.Uri;

import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;

/**
 * Segments HLS chargés plusieurs à la fois (films, épisodes, chaînes).
 *
 * Le lecteur demande les segments un par un, sur une seule connexion. Quand
 * le serveur ou la route bride chaque connexion (seedbox), la vidéo arrive
 * alors à peine plus vite qu'elle ne se lit : réserve nulle, coupures. Comme
 * le lecteur du PC, on charge en parallèle les segments qui suivent celui que
 * le lecteur demande (3 d'avance, chacun sur sa propre connexion) ; quand le
 * lecteur les demande, ils sont déjà en mémoire (ou en cours d'arrivée).
 *
 * Segment attendu par le lecteur qui n'avance plus (connexion bloquée sans
 * rien envoyer : un segment de 400 Ko mettait 40 s) : redemandé aussitôt sur
 * une nouvelle connexion, la plus rapide des deux sert la suite.
 *
 * Les listes de lecture lues par le lecteur donnent l'ordre des segments ;
 * rien n'est chargé hors de ces listes. Mémoire bornée (48 Mo), segments
 * oubliés une fois lus ou au bout d'une minute.
 */
final class NoctraPrefetchDataSource implements DataSource {
    private static final int AHEAD = 3;
    private static final long MAX_BYTES = 48L * 1024 * 1024;
    private static final long KEEP_MS = 60000;
    private static final int PLAYLIST_LIMIT = 2 * 1024 * 1024;
    private static final int END = -1;
    // Segment attendu sans nouvel octet depuis 3 s : nouvelle connexion (4 fois au plus).
    private static final long HEDGE_MS = 3000;
    private static final int MAX_HEDGES = 4;

    static final class Factory implements DataSource.Factory {
        private final DataSource.Factory upstream;
        private final Map<String, String> headers;
        private final String agent;

        Factory(DataSource.Factory upstream, Map<String, String> headers, String agent) {
            this.upstream = upstream;
            this.headers = new HashMap<String, String>(headers);
            this.agent = agent;
        }

        @Override
        public DataSource createDataSource() {
            return new NoctraPrefetchDataSource(upstream.createDataSource(), headers, agent);
        }
    }

    // ── Segments en mémoire, partagés par tous les lecteurs ─────────────────
    private static final class Entry {
        byte[] data = new byte[256 * 1024];
        int size;
        boolean done;
        IOException error;
        final long at = System.currentTimeMillis();
        volatile long lastDataAt = at;

        synchronized void append(byte[] buffer, int count) {
            if (size + count > data.length) {
                byte[] bigger = new byte[Math.max(data.length * 2, size + count)];
                System.arraycopy(data, 0, bigger, 0, size);
                data = bigger;
            }
            System.arraycopy(buffer, 0, data, size, count);
            size += count;
            lastDataAt = System.currentTimeMillis();
            notifyAll();
        }

        synchronized void finish(IOException failure) {
            error = failure;
            done = true;
            notifyAll();
        }
    }

    private static final Object LOCK = new Object();
    private static final LinkedHashMap<String, Entry> CACHE = new LinkedHashMap<String, Entry>();
    private static final LinkedHashMap<String, List<String>> PLAYLISTS = new LinkedHashMap<String, List<String>>();
    private static final ExecutorService POOL = Executors.newFixedThreadPool(AHEAD, new ThreadFactory() {
        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "noctra-prefetch");
            thread.setDaemon(true);
            return thread;
        }
    });
    // Relances : hors de la file (ses connexions peuvent toutes être bloquées).
    private static final ExecutorService HEDGES = Executors.newCachedThreadPool(new ThreadFactory() {
        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "noctra-prefetch-hedge");
            thread.setDaemon(true);
            return thread;
        }
    });
    private static volatile int hedges;

    /** Segments redemandés sur une nouvelle connexion depuis l'ouverture du flux. */
    static int hedgeCount() {
        return hedges;
    }

    /** Nouveau flux : segments et listes du précédent oubliés. */
    static void reset() {
        hedges = 0;
        synchronized (LOCK) {
            CACHE.clear();
            PLAYLISTS.clear();
        }
    }

    private final DataSource upstream;
    private final Map<String, String> headers;
    private final String agent;
    private Entry serving;
    private int servingPosition;
    private int servingHedges;
    private String servingUrl;
    private Uri uri;
    private boolean upstreamOpen;
    private boolean capture;
    private byte[] captured;
    private int capturedSize;
    private String openedUrl;

    private NoctraPrefetchDataSource(DataSource upstream, Map<String, String> headers, String agent) {
        this.upstream = upstream;
        this.headers = headers;
        this.agent = agent;
    }

    @Override
    public void addTransferListener(TransferListener transferListener) {
        upstream.addTransferListener(transferListener);
    }

    @Override
    public long open(DataSpec dataSpec) throws IOException {
        uri = dataSpec.uri;
        String url = dataSpec.uri == null ? "" : dataSpec.uri.toString();
        openedUrl = url;
        // Lecture partielle (plage d'octets) : toujours demandée au serveur.
        boolean whole = dataSpec.position == 0 && dataSpec.length == -1;
        if (whole && !url.isEmpty()) {
            Entry entry;
            synchronized (LOCK) {
                entry = CACHE.get(url);
                if (entry != null && entry.done && entry.error != null) {
                    CACHE.remove(url);
                    entry = null;
                }
            }
            schedule(url);
            if (entry != null) {
                serving = entry;
                servingUrl = url;
                servingPosition = 0;
                servingHedges = 0;
                return -1;
            }
        }
        long length = upstream.open(dataSpec);
        upstreamOpen = true;
        capture = whole;
        captured = null;
        capturedSize = 0;
        return length;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
        if (length == 0) return 0;
        if (serving != null) {
            Entry entry = serving;
            while (true) {
                synchronized (entry) {
                    if (servingPosition < entry.size || (entry.done && entry.error == null)) break;
                    if (!entry.done) {
                        try {
                            entry.wait(500);
                        } catch (InterruptedException interrupted) {
                            Thread.currentThread().interrupt();
                            throw new IOException("lecture interrompue");
                        }
                        if (servingPosition < entry.size || (entry.done && entry.error == null)) break;
                        if (!entry.done && System.currentTimeMillis() - entry.lastDataAt < HEDGE_MS) continue;
                    }
                    // Plus de relance possible : on attend la fin (ou l'erreur) de celle-ci.
                    if (servingHedges >= MAX_HEDGES) {
                        if (entry.done) break;
                        continue;
                    }
                }
                // Connexion muette : le segment repart sur une nouvelle connexion
                // (depuis le début ; les octets déjà servis sont sautés).
                entry = hedge(servingUrl, entry);
                serving = entry;
                servingHedges++;
            }
            synchronized (entry) {
                if (servingPosition >= entry.size) {
                    if (entry.error != null) throw entry.error;
                    return END;
                }
                int count = Math.min(length, entry.size - servingPosition);
                System.arraycopy(entry.data, servingPosition, buffer, offset, count);
                servingPosition += count;
                return count;
            }
        }
        int count = upstream.read(buffer, offset, length);
        if (count > 0 && capture) keep(buffer, offset, count);
        return count;
    }

    // Début de réponse gardé tant qu'il peut s'agir d'une liste de lecture.
    private void keep(byte[] buffer, int offset, int count) {
        if (captured == null) {
            int skip = 0;
            while (skip < count && buffer[offset + skip] <= ' ') skip++;
            if (count - skip >= 7 && !new String(buffer, offset + skip, 7).equals("#EXTM3U")) { capture = false; return; }
            captured = new byte[64 * 1024];
        }
        if (capturedSize + count > PLAYLIST_LIMIT) { capture = false; captured = null; return; }
        if (capturedSize + count > captured.length) {
            byte[] bigger = new byte[Math.max(captured.length * 2, capturedSize + count)];
            System.arraycopy(captured, 0, bigger, 0, capturedSize);
            captured = bigger;
        }
        System.arraycopy(buffer, offset, captured, capturedSize, count);
        capturedSize += count;
    }

    @Override
    public Uri getUri() {
        return serving != null ? uri : upstream.getUri();
    }

    @Override
    public Map<String, List<String>> getResponseHeaders() {
        if (serving != null) return Collections.emptyMap();
        return upstream.getResponseHeaders();
    }

    @Override
    public void close() throws IOException {
        if (serving != null) {
            // Segment lu en entier : plus besoin de le garder.
            if (serving.done && servingPosition >= serving.size) {
                synchronized (LOCK) { if (CACHE.get(servingUrl) == serving) CACHE.remove(servingUrl); }
            }
            serving = null;
            servingUrl = null;
            return;
        }
        if (capture && captured != null && capturedSize > 0) {
            Uri base = upstream.getUri();
            remember(base != null ? base.toString() : openedUrl, new String(captured, 0, capturedSize, "UTF-8"));
        }
        capture = false;
        captured = null;
        if (upstreamOpen) {
            upstreamOpen = false;
            upstream.close();
        }
    }

    // Liste de segments (pas une liste de qualités) : ordre des segments retenu.
    private void remember(String base, String text) {
        // Segments découpés dans un même fichier (plages d'octets) : rien à précharger.
        if (!text.contains("#EXTINF") || text.contains("#EXT-X-BYTERANGE")) return;
        List<String> segments = new ArrayList<String>();
        for (String line : text.split("\r?\n")) {
            String value = line.trim();
            if (value.isEmpty() || value.startsWith("#")) continue;
            try {
                segments.add(URI.create(base).resolve(value).toString());
            } catch (Exception ignored) {
                // Adresse illisible : ignorée.
            }
        }
        if (segments.isEmpty()) return;
        synchronized (LOCK) {
            PLAYLISTS.remove(openedUrl);
            PLAYLISTS.put(openedUrl, segments);
            while (PLAYLISTS.size() > 4) {
                Iterator<String> oldest = PLAYLISTS.keySet().iterator();
                oldest.next();
                oldest.remove();
            }
        }
    }

    // Segment demandé par le lecteur : les suivants sont chargés en parallèle.
    private void schedule(String url) {
        List<String> next = new ArrayList<String>();
        synchronized (LOCK) {
            long now = System.currentTimeMillis();
            long total = 0;
            Iterator<Map.Entry<String, Entry>> entries = CACHE.entrySet().iterator();
            while (entries.hasNext()) {
                Entry entry = entries.next().getValue();
                if (entry.done && now - entry.at > KEEP_MS) entries.remove();
                else total += entry.size;
            }
            for (List<String> segments : PLAYLISTS.values()) {
                int index = segments.indexOf(url);
                if (index < 0) continue;
                for (int step = 1; step <= AHEAD && index + step < segments.size(); step++) {
                    String candidate = segments.get(index + step);
                    if (CACHE.containsKey(candidate) || total > MAX_BYTES) continue;
                    CACHE.put(candidate, new Entry());
                    next.add(candidate);
                }
                break;
            }
        }
        for (final String candidate : next) {
            final Entry entry;
            synchronized (LOCK) { entry = CACHE.get(candidate); }
            if (entry == null) continue;
            POOL.execute(new Runnable() {
                @Override
                public void run() { fetch(candidate, entry, false); }
            });
        }
    }

    private Entry hedge(final String address, Entry stalled) {
        final Entry fresh = new Entry();
        hedges++;
        synchronized (LOCK) {
            if (CACHE.get(address) == stalled) CACHE.put(address, fresh);
        }
        HEDGES.execute(new Runnable() {
            @Override
            public void run() { fetch(address, fresh, true); }
        });
        // Le premier des deux qui avance sert la suite : l'ancien est gardé
        // s'il reprend avant le nouveau.
        final Entry[] winner = new Entry[1];
        synchronized (fresh) {
            long until = System.currentTimeMillis() + HEDGE_MS;
            while (fresh.size <= servingPosition && !fresh.done && System.currentTimeMillis() < until) {
                synchronized (stalled) { if (stalled.size > servingPosition || stalled.done) { winner[0] = stalled; break; } }
                try { fresh.wait(200); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); break; }
            }
        }
        return winner[0] != null && !(stalled.done && stalled.error != null) ? stalled : fresh;
    }

    // Relance : signalée au serveur Noctra, qui ne la rattache pas au
    // téléchargement bloqué et redemande le segment à la source (200.0.158).
    private void fetch(String address, Entry entry, boolean relaunch) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(12000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", agent);
            for (Map.Entry<String, String> header : headers.entrySet()) {
                if (header.getKey().startsWith("x-noctra-doh")) continue;
                connection.setRequestProperty(header.getKey(), header.getValue());
            }
            if (relaunch) connection.setRequestProperty("x-noctra-hedge", "1");
            int status = connection.getResponseCode();
            if (status >= 400) throw new IOException("HTTP " + status);
            InputStream input = connection.getInputStream();
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != END) entry.append(buffer, count);
            input.close();
            entry.finish(null);
        } catch (IOException error) {
            entry.finish(error);
        } catch (Exception error) {
            entry.finish(new IOException(error.getMessage() == null ? "échec" : error.getMessage()));
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
