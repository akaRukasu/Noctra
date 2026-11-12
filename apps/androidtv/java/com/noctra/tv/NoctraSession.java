package com.noctra.tv;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Iterator;

/**
 * Session Jellyfin ouverte dans l'appli : lue dans le magasin d'authentification
 * de Jellyfin Android TV (files/authentication_store.json et préférences
 * « authentication »). Le jeton sert aussi à l'API Noctra (en-tête x-noctra-token).
 */
final class NoctraSession {
    final String serverAddress;
    final String userId;
    final String userName;
    final String accessToken;

    private NoctraSession(String serverAddress, String userId, String userName, String accessToken) {
        this.serverAddress = serverAddress;
        this.userId = userId;
        this.userName = userName;
        this.accessToken = accessToken;
    }

    static NoctraSession read(Context context) {
        try {
            JSONObject store = new JSONObject(readFile(new File(context.getFilesDir(), "authentication_store.json")));
            JSONObject servers = store.optJSONObject("servers");
            if (servers == null) return null;
            SharedPreferences preferences = context.getSharedPreferences("authentication", Context.MODE_PRIVATE);
            String lastServer = preferences.getString("last_server_id", "");
            String lastUser = preferences.getString("last_user_id", "");

            NoctraSession best = null;
            long bestUsed = Long.MIN_VALUE;
            for (Iterator<String> serverIds = servers.keys(); serverIds.hasNext(); ) {
                String serverId = serverIds.next();
                JSONObject server = servers.optJSONObject(serverId);
                if (server == null) continue;
                JSONObject users = server.optJSONObject("users");
                if (users == null) continue;
                for (Iterator<String> userIds = users.keys(); userIds.hasNext(); ) {
                    String userId = userIds.next();
                    JSONObject user = users.optJSONObject(userId);
                    String token = user == null ? "" : user.optString("access_token", "");
                    if (token.isEmpty()) continue;
                    boolean last = sameId(serverId, lastServer) && sameId(userId, lastUser);
                    long used = last ? Long.MAX_VALUE : user.optLong("last_used", 0);
                    if (used > bestUsed) {
                        bestUsed = used;
                        best = new NoctraSession(server.optString("address", ""), userId, user.optString("name", ""), token);
                    }
                }
            }
            return best;
        } catch (Exception error) {
            return null;
        }
    }

    private static boolean sameId(String a, String b) {
        return !b.isEmpty() && a.replace("-", "").equalsIgnoreCase(b.replace("-", ""));
    }

    private static String readFile(File file) throws IOException {
        FileInputStream stream = new FileInputStream(file);
        try {
            byte[] buffer = new byte[(int) file.length()];
            int offset = 0;
            while (offset < buffer.length) {
                int read = stream.read(buffer, offset, buffer.length - offset);
                if (read < 0) break;
                offset += read;
            }
            return new String(buffer, 0, offset, "UTF-8");
        } finally {
            stream.close();
        }
    }
}
