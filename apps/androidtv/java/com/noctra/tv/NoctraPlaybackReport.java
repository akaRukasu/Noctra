package com.noctra.tv;

import org.json.JSONObject;

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

    private String body(long positionMs, boolean paused, String event) {
        try {
            JSONObject json = new JSONObject();
            json.put("ItemId", itemId);
            json.put("MediaSourceId", mediaSourceId);
            json.put("PlaySessionId", playSessionId);
            json.put("PositionTicks", positionMs * 10000L);
            json.put("CanSeek", true);
            json.put("IsPaused", paused);
            json.put("PlayMethod", "Transcode");
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
