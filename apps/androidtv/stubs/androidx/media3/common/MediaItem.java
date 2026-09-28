package androidx.media3.common;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public final class MediaItem {
    private MediaItem() { }

    public static MediaItem fromUri(String uri) { throw new UnsupportedOperationException(); }

    public static final class Builder {
        public Builder() { }
        public Builder setUri(String uri) { throw new UnsupportedOperationException(); }
        public Builder setMimeType(String mimeType) { throw new UnsupportedOperationException(); }
        public Builder setLiveConfiguration(LiveConfiguration liveConfiguration) { throw new UnsupportedOperationException(); }
        public MediaItem build() { throw new UnsupportedOperationException(); }
    }

    public static final class LiveConfiguration {
        private LiveConfiguration() { }

        public static final class Builder {
            public Builder() { }
            public Builder setMinPlaybackSpeed(float minPlaybackSpeed) { throw new UnsupportedOperationException(); }
            public Builder setMaxPlaybackSpeed(float maxPlaybackSpeed) { throw new UnsupportedOperationException(); }
            public LiveConfiguration build() { throw new UnsupportedOperationException(); }
        }
    }
}
