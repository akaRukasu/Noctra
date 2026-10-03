package com.noctra.tv;

import org.jellyfin.sdk.model.api.MediaSegmentDto;
import org.jellyfin.sdk.model.api.MediaSegmentType;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Génériques (intro, récap, générique de fin) pour le lecteur Jellyfin, quand
 * le serveur Jellyfin n'en fournit pas (pas d'extension de détection) :
 * chapitres du titre ou générique appris pour la série, envoyés par l'accueil
 * Noctra avant la lecture. Le lecteur Jellyfin affiche alors son bouton
 * « Passer » (patch de MediaSegmentRepositoryImpl dans build-androidtv.mjs).
 */
public final class NoctraSegments {
    private static final Map<String, JSONArray> items = new HashMap<String, JSONArray>();
    private static final Map<String, JSONObject> series = new HashMap<String, JSONObject>();

    private NoctraSegments() { }

    /** Message « jellyfinPlay » : segments du titre et intros apprises par série. */
    static synchronized void put(JSONObject message) {
        String item = hex(message.optString("itemId"));
        JSONArray segments = message.optJSONArray("segments");
        if (!item.isEmpty() && segments != null) items.put(item, segments);
        JSONObject intros = message.optJSONObject("seriesIntros");
        if (intros == null) return;
        JSONArray names = intros.names();
        if (names == null) return;
        for (int i = 0; i < names.length(); i++) {
            String id = names.optString(i);
            JSONObject intro = intros.optJSONObject(id);
            if (intro != null) series.put(hex(id), intro);
        }
    }

    /** Appelé par le lecteur Jellyfin : segments du serveur, sinon ceux de Noctra. */
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public static synchronized List merge(UUID itemId, UUID seriesId, List found) {
        try {
            if (found != null && !found.isEmpty()) return found;
            List out = new ArrayList();
            JSONArray list = itemId == null ? null : items.get(hex(itemId.toString()));
            if (list != null) {
                for (int i = 0; i < list.length(); i++) {
                    JSONObject segment = list.optJSONObject(i);
                    if (segment == null) continue;
                    MediaSegmentType type = type(segment.optString("type"));
                    long start = segment.optLong("startMs", -1), end = segment.optLong("endMs", -1);
                    if (type == null || start < 0 || end <= start) continue;
                    out.add(new MediaSegmentDto(UUID.randomUUID(), itemId, type, start * 10000L, end * 10000L));
                }
            }
            JSONObject intro = seriesId == null ? null : series.get(hex(seriesId.toString()));
            if (out.isEmpty() && intro != null) {
                long start = intro.optLong("startMs", -1), end = intro.optLong("endMs", -1);
                if (start >= 0 && end > start) out.add(new MediaSegmentDto(UUID.randomUUID(), itemId, MediaSegmentType.INTRO, start * 10000L, end * 10000L));
            }
            return out.isEmpty() ? found : out;
        } catch (Throwable error) {
            return found;
        }
    }

    private static MediaSegmentType type(String name) {
        if ("intro".equals(name)) return MediaSegmentType.INTRO;
        if ("outro".equals(name)) return MediaSegmentType.OUTRO;
        if ("recap".equals(name)) return MediaSegmentType.RECAP;
        if ("preview".equals(name)) return MediaSegmentType.PREVIEW;
        return null;
    }

    private static String hex(String id) {
        return id == null ? "" : id.replace("-", "").toLowerCase();
    }
}
