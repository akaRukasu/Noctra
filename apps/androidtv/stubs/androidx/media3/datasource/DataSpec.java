package androidx.media3.datasource;

import android.net.Uri;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public final class DataSpec {
    public final Uri uri = null;
    public final long position = 0;
    public final long length = -1;
    public DataSpec subrange(long offset, long length) { throw new UnsupportedOperationException(); }
}
