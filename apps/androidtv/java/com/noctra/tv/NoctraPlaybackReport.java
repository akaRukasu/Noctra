package com.noctra.tv;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Suivi de lecture envoyé à Jellyfin (début, progression, arrêt) : reprises,
 * « Continuer à regarder » et titres vus restent à jour comme avec les autres
 * clients. Envois en arrière-plan, dans l'ordre, sans jamais bloquer l'image.
 */
final class NoctraPlaybackReport {
    private final ExecutorService queue = Executors.newSingleThreadExecutor();
    private final String base;
    private final String authorization;
    private final String itemId;
    private final String mediaSourceId;
    private final String playSessionId;
    private final String deviceId;

    NoctraPlaybackReport(String base, String authorization, String itemId, String mediaSourceId, String playSessionId, String deviceId) {
        this.base = base.replaceAll("/+$", "");
        this.authorization = authorization;
        this.itemId = itemId;
        this.mediaSourceId = mediaSourceId;
        this.playSessionId = playSessionId;
        this.deviceId = deviceId;
    }

    static String authorization(String token, String deviceId) {
        return "MediaBrowser Client=\"Noctra TV\", Device=\"Android TV\", DeviceId=\"" + deviceId
            + "\", Version=\"" + NoctraConfig.VERSION + "\", Token=\"" + token + "\"";
    }

    void started(long positionMs) {
        post("/Sessions/Playing", body(positionMs, false, null));
    }

    // « DirectPlay » quand le fichier d'origine est lu directement.
    private volatile String playMethod = "Transcode";

    void setDirect(boolean direct) {
        playMethod = direct ? "DirectPlay" : "Transcode";
    }

    void progress(long positionMs, boolean paused) {
        post("/Sessions/Playing/Progress", body(positionMs, paused, "timeupdate"));
    }

    /** Arrêt : position finale, puis fin de la conversion côté serveur. */
    void stopped(long positionMs) {
        post("/Sessions/Playing/Stopped", body(positionMs, false, null));
        try {
            send("DELETE", "/Videos/ActiveEncodings?deviceId=" + URLEncoder.encode(deviceId, "UTF-8")
                + "&playSessionId=" + URLEncoder.encode(playSessionId, "UTF-8"), null);
        } catch (Exception ignored) {
        }
        queue.shutdown();
    }

    // ── Ce que fait le serveur (diagnostic) ─────────────────────────────
    private volatile String transcoding;
    private long checkedAt;

    /** « Vidéo d'origine… » ou « Vidéo convertie par le serveur… », ou null (pas encore connu). */
    String transcoding() {
        return transcoding;
    }

    /** Session Jellyfin de cet appareil relue (10 s au plus souvent). */
    void checkTranscoding() {
        long now = System.currentTimeMillis();
        if (now - checkedAt < 10000 || queue.isShutdown()) return;
        checkedAt = now;
        queue.execute(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(base + "/Sessions?deviceId=" + URLEncoder.encode(deviceId, "UTF-8")).openConnection();
                    connection.setConnectTimeout(10000);
                    connection.setReadTimeout(15000);
                    connection.setRequestProperty("Authorization", authorization);
                    if (connection.getResponseCode() != 200) return;
                    InputStream input = connection.getInputStream();
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    byte[] buffer = new byte[16 * 1024];
                    int count;
                    while ((count = input.read(buffer)) > 0 && bytes.size() < 2 * 1024 * 1024) bytes.write(buffer, 0, count);
                    input.close();
                    JSONArray sessions = new JSONArray(bytes.toString("UTF-8"));
                    for (int index = 0; index < sessions.length(); index++) {
                        JSONObject session = sessions.optJSONObject(index);
                        if (session == null || !deviceId.equals(session.optString("DeviceId"))) continue;
                        String summary = describe(session.optJSONObject("TranscodingInfo"));
                        if (summary != null) transcoding = summary;
                        return;
                    }
                } catch (Exception ignored) {
                    // Diagnostic facultatif.
                } finally {
                    if (connection != null) connection.disconnect();
                }
            }
        });
    }

    static String describe(JSONObject info) {
        if (info == null) return null;
        StringBuilder text = new StringBuilder();
        if (info.optBoolean("IsVideoDirect", false)) {
            text.append("Vidéo d'origine (copiée par le serveur)");
        } else {
            text.append("Vidéo convertie par le serveur");
            String codec = info.optString("VideoCodec", "");
            if (!codec.isEmpty()) text.append(" : ").append(codec.toUpperCase(java.util.Locale.ROOT));
            int width = info.optInt("Width", 0), height = info.optInt("Height", 0);
            if (width > 0 && height > 0) text.append(" ").append(width).append("×").append(height);
            long bitrate = info.optLong("Bitrate", 0);
            if (bitrate > 0) text.append(" · ").append(Math.round(bitrate / 1e6)).append(" Mb/s");
            double fps = info.optDouble("Framerate", 0);
            if (fps > 0) text.append(" · ").append(Math.round(fps)).append(" images/s").append(fps < 20 ? " (serveur trop lent)" : "");
        }
        if (!info.optBoolean("IsAudioDirect", true)) {
            String audio = info.optString("AudioCodec", "");
            text.append(" · son converti").append(audio.isEmpty() ? "" : " (" + audio.toUpperCase(java.util.Locale.ROOT) + ")");
        }
        String reasons = reasons(info.opt("TranscodeReasons"));
        if (!reasons.isEmpty()) text.append("\nRaison : ").append(reasons);
        return text.toString();
    }

    // Raisons de conversion données par Jellyfin, en clair.
    private static String reasons(Object value) {
        java.util.List<String> names = new java.util.ArrayList<String>();
        if (value instanceof JSONArray) {
            for (int index = 0; index < ((JSONArray) value).length(); index++) names.add(((JSONArray) value).optString(index));
        } else if (value instanceof String) {
            for (String name : ((String) value).split(",")) names.add(name.trim());
        }
        StringBuilder text = new StringBuilder();
        for (String name : names) {
            if (name.isEmpty()) continue;
            String label = name.equals("VideoCodecNotSupported") ? "format vidéo non lu par l'appareil"
                : name.equals("AudioCodecNotSupported") ? "format audio non lu par l'appareil"
                : name.equals("SubtitleCodecNotSupported") ? "sous-titres incrustés dans l'image"
                : name.equals("ContainerNotSupported") ? "conteneur"
                : name.equals("ContainerBitrateExceedsLimit") || name.equals("VideoBitrateNotSupported") ? "débit limité (Qualité des films)"
                : name.equals("VideoRangeTypeNotSupported") ? "HDR non pris en charge"
                : name.equals("VideoBitDepthNotSupported") ? "vidéo 10 bits"
                : name.equals("VideoLevelNotSupported") ? "niveau vidéo"
                : name.equals("VideoProfileNotSupported") ? "profil vidéo"
                : name.equals("InterlacedVideoNotSupported") ? "vidéo entrelacée"
                : name.equals("AudioChannelsNotSupported") ? "nombre de canaux audio"
                : name;
            if (text.indexOf(label) >= 0) continue;
            text.append(text.length() > 0 ? ", " : "").append(label);
        }
        return text.toString();
    }

    private String body(long positionMs, boolean paused, String event) {
        try {
            JSONObject json = new JSONObject();
            json.put("ItemId", itemId);
            json.put("MediaSourceId", mediaSourceId);
            json.put("PlaySessionId", playSessionId);
            json.put("PositionTicks", positionMs * 10000L);
            json.put("CanSeek", true);
            json.put("IsPaused", paused);
            json.put("PlayMethod", playMethod);
            if (event != null) json.put("EventName", event);
            return json.toString();
        } catch (Exception error) {
            return "{}";
        }
    }

    private void post(String path, String json) {
        send("POST", path, json);
    }

    private void send(final String method, final String path, final String json) {
        if (queue.isShutdown()) return;
        queue.execute(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(base + path).openConnection();
                    connection.setRequestMethod(method);
                    connection.setConnectTimeout(10000);
                    connection.setReadTimeout(15000);
                    connection.setRequestProperty("Authorization", authorization);
                    if (json != null) {
                        connection.setDoOutput(true);
                        connection.setRequestProperty("Content-Type", "application/json");
                        OutputStream output = connection.getOutputStream();
                        output.write(json.getBytes("UTF-8"));
                        output.close();
                    }
                    connection.getResponseCode();
                } catch (Exception ignored) {
                    // Suivi facultatif : la lecture continue même sans réseau.
                } finally {
                    if (connection != null) connection.disconnect();
                }
            }
        });
    }
}
