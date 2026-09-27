package androidx.media3.common;

import java.io.IOException;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public interface DataReader {
    int read(byte[] buffer, int offset, int length) throws IOException;
}
