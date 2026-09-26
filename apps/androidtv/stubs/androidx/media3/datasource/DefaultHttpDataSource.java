package androidx.media3.datasource;

import java.util.Map;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public class DefaultHttpDataSource implements HttpDataSource {
    public static final class Factory implements HttpDataSource.Factory {
        public Factory() { }
        public Factory setDefaultRequestProperties(Map<String, String> properties) { throw new UnsupportedOperationException(); }
        public Factory setUserAgent(String userAgent) { throw new UnsupportedOperationException(); }
        public Factory setAllowCrossProtocolRedirects(boolean allow) { throw new UnsupportedOperationException(); }
        public Factory setConnectTimeoutMs(int timeoutMs) { throw new UnsupportedOperationException(); }
        public Factory setReadTimeoutMs(int timeoutMs) { throw new UnsupportedOperationException(); }
    }
}
