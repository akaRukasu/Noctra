package org.jellyfin.androidtv.util;

import android.content.Context;
import java.util.UUID;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public interface PlaybackHelper {
    void retrieveAndPlay(UUID id, boolean shuffle, Long position, Context context);
}
