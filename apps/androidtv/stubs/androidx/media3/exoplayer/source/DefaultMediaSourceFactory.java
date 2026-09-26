package androidx.media3.exoplayer.source;

import androidx.media3.datasource.DataSource;
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public final class DefaultMediaSourceFactory implements MediaSourceFactory {
    public DefaultMediaSourceFactory(DataSource.Factory factory) { }
    public DefaultMediaSourceFactory setLoadErrorHandlingPolicy(LoadErrorHandlingPolicy policy) { throw new UnsupportedOperationException(); }
}
