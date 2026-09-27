package okhttp3;

import java.util.concurrent.TimeUnit;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public class OkHttpClient implements Call.Factory {
    public Call newCall(Request request) { throw new UnsupportedOperationException(); }

    public static final class Builder {
        public Builder() { }
        public Builder dns(Dns dns) { throw new UnsupportedOperationException(); }
        public Builder followRedirects(boolean follow) { throw new UnsupportedOperationException(); }
        public Builder followSslRedirects(boolean follow) { throw new UnsupportedOperationException(); }
        public Builder connectTimeout(long timeout, TimeUnit unit) { throw new UnsupportedOperationException(); }
        public Builder readTimeout(long timeout, TimeUnit unit) { throw new UnsupportedOperationException(); }
        public OkHttpClient build() { throw new UnsupportedOperationException(); }
    }
}
