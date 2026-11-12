package com.noctra.tv;

import android.net.Uri;

import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Segments de direct « déguisés » : certains sites servent leurs segments
 * vidéo (MPEG-TS, fMP4) derrière un faux en-tête d'image (PNG, JPEG, GIF…)
 * que le lecteur de leur page retire avant la lecture. Le lecteur natif, lui,
 * ne reconnaissait rien (« lecteur web · direct » en échec). Ici, le début de
 * chaque segment est examiné : s'il ne commence pas par une vidéo mais en
 * contient une plus loin (paquets TS alignés tous les 188 octets, ou boîte
 * fMP4), les octets du faux en-tête sont ignorés.
 *
 * Les listes de lecture (.m3u8), les lectures partielles (plage d'octets) et
 * les segments normaux passent sans changement.
 */
final class NoctraCleanDataSource implements DataSource {
    private static final int HEAD = 16384;
    private static final int TS_PACKET = 188;
    private static final int END = -1;

    static final class Factory implements DataSource.Factory {
        private final DataSource.Factory upstream;

        Factory(DataSource.Factory upstream) {
            this.upstream = upstream;
        }

        @Override
        public DataSource createDataSource() {
            return new NoctraCleanDataSource(upstream.createDataSource());
        }
    }

    // ── Mesure de la réception (diagnostic affiché par le lecteur) ──
    // Pour chaque segment vidéo : octets reçus et temps de chargement
    // (demande comprise). Moyenne glissante du débit reçu.
    private static final Object STATS = new Object();
    private static double averageKbps;
    private static long lastSegmentMs;
    private static long lastSegmentBytes;
    private static int segments;
    private static int failures;
    // Dernière réception d'octets (tous segments) : un blocage pendant lequel
    // des données arrivent encore est une réception lente, pas un flux coupé.
    private static volatile long lastDataAt;

    static long lastDataAt() {
        return lastDataAt;
    }

    /** « Réception 8,4 Mb/s · segment chargé en 1,2 s », ou vide. */
    static String receptionSummary() {
        synchronized (STATS) {
            if (segments == 0) return failures > 0 ? "Segments en échec : " + failures : "";
            String text = String.format(java.util.Locale.FRANCE, "Réception %.1f Mb/s · dernier segment %.1f s (%d Ko)",
                averageKbps / 1000.0, lastSegmentMs / 1000.0, lastSegmentBytes / 1024);
            return failures > 0 ? text + " · " + failures + " échec" + (failures > 1 ? "s" : "") : text;
        }
    }

    static void resetStats() {
        synchronized (STATS) {
            averageKbps = 0;
            lastSegmentMs = 0;
            lastSegmentBytes = 0;
            segments = 0;
            failures = 0;
        }
    }

    private boolean measured;
    private long openedAt;
    private long bytes;

    private final DataSource upstream;
    private boolean inspect;
    private byte[] head;
    private int headPosition;
    private int headLength;

    NoctraCleanDataSource(DataSource upstream) {
        this.upstream = upstream;
    }

    @Override
    public void addTransferListener(TransferListener transferListener) {
        upstream.addTransferListener(transferListener);
    }

    @Override
    public long open(DataSpec dataSpec) throws IOException {
        head = null;
        headPosition = 0;
        headLength = 0;
        String path = dataSpec.uri == null || dataSpec.uri.getPath() == null ? "" : dataSpec.uri.getPath().toLowerCase();
        measured = dataSpec.position == 0 && !path.endsWith(".m3u8") && !path.endsWith(".m3u") && !path.endsWith(".key");
        openedAt = System.currentTimeMillis();
        bytes = 0;
        long length;
        try {
            length = upstream.open(dataSpec);
        } catch (IOException error) {
            if (measured) synchronized (STATS) { failures++; }
            measured = false;
            throw error;
        }
        inspect = dataSpec.position == 0 && !path.endsWith(".m3u8") && !path.endsWith(".m3u") && !path.endsWith(".key");
        // Longueur inconnue si des octets risquent d'être retirés.
        return inspect ? -1 : length;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
        int count = readInner(buffer, offset, length);
        if (count > 0) {
            bytes += count;
            lastDataAt = System.currentTimeMillis();
        }
        return count;
    }

    private int readInner(byte[] buffer, int offset, int length) throws IOException {
        if (length == 0) return 0;
        if (inspect) {
            inspect = false;
            fillHead();
        }
        if (head != null && headPosition < headLength) {
            int count = Math.min(length, headLength - headPosition);
            System.arraycopy(head, headPosition, buffer, offset, count);
            headPosition += count;
            return count;
        }
        return upstream.read(buffer, offset, length);
    }

    private void fillHead() throws IOException {
        byte[] data = new byte[HEAD];
        int read = 0;
        while (read < data.length) {
            int count = upstream.read(data, read, data.length - read);
            if (count == END) break;
            read += count;
        }
        head = data;
        headLength = read;
        headPosition = skip(data, read);
    }

    /** Octets à ignorer au début (0 : segment normal). */
    static int skip(byte[] data, int length) {
        if (length < 8) return 0;
        // Déjà une vidéo, une liste ou des métadonnées : rien à retirer.
        if ((data[0] & 0xff) == 0x47) return 0;
        if (data[0] == '#' || (data[0] == 'I' && data[1] == 'D' && data[2] == '3')) return 0;
        // Audio AAC (ADTS) et sous-titres WebVTT : jamais déguisés.
        if ((data[0] & 0xff) == 0xff && (data[1] & 0xf0) == 0xf0) return 0;
        if (data[0] == 'W' && data[1] == 'E' && data[2] == 'B' && data[3] == 'V') return 0;
        if (data[0] == (byte) 0xEF && data[1] == (byte) 0xBB && data[2] == (byte) 0xBF) return 0;
        if (box(data, 4)) return 0;
        // Paquets MPEG-TS alignés (0x47 tous les 188 octets, trois fois de suite).
        for (int k = 1; k + TS_PACKET * 2 < length; k++) {
            if ((data[k] & 0xff) == 0x47 && (data[k + TS_PACKET] & 0xff) == 0x47 && (data[k + TS_PACKET * 2] & 0xff) == 0x47) return k;
        }
        // Segment fMP4 (styp, moof, ftyp) après le faux en-tête.
        for (int k = 1; k + 8 < length; k++) {
            if (box(data, k + 4)) return k;
        }
        return 0;
    }

    private static boolean box(byte[] data, int at) {
        if (at + 4 > data.length) return false;
        String type = new String(new char[] { (char) data[at], (char) data[at + 1], (char) data[at + 2], (char) data[at + 3] });
        return type.equals("ftyp") || type.equals("styp") || type.equals("moof") || type.equals("sidx");
    }

    @Override
    public Uri getUri() {
        return upstream.getUri();
    }

    @Override
    public Map<String, List<String>> getResponseHeaders() {
        return upstream.getResponseHeaders();
    }

    @Override
    public void close() throws IOException {
        // Segment entièrement reçu : débit de ce segment dans la moyenne.
        if (measured && bytes > 16384) {
            long elapsed = Math.max(1, System.currentTimeMillis() - openedAt);
            double kbps = bytes * 8.0 / elapsed;
            synchronized (STATS) {
                averageKbps = segments == 0 ? kbps : averageKbps * 0.7 + kbps * 0.3;
                lastSegmentMs = elapsed;
                lastSegmentBytes = bytes;
                segments++;
            }
        }
        measured = false;
        head = null;
        upstream.close();
    }
}
