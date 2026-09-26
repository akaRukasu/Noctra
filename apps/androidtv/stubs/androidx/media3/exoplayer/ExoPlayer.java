package androidx.media3.exoplayer;

import android.content.Context;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.source.MediaSource;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public interface ExoPlayer extends Player {
    final class Builder {
        public Builder(Context context) { }
        public Builder setMediaSourceFactory(MediaSource.Factory factory) { throw new UnsupportedOperationException(); }
        public ExoPlayer build() { throw new UnsupportedOperationException(); }
    }
}
