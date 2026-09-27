package androidx.media3.datasource.okhttp;

import androidx.media3.datasource.HttpDataSource;
import java.util.Map;
import okhttp3.Call;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public class OkHttpDataSource {
    public static final class Factory implements HttpDataSource.Factory {
        public Factory(Call.Factory callFactory) { }
        public Factory setUserAgent(String userAgent) { throw new UnsupportedOperationException(); }
        public final Factory setDefaultRequestProperties(Map<String, String> properties) { throw new UnsupportedOperationException(); }
        public HttpDataSource createDataSource() { throw new UnsupportedOperationException(); }
    }
}
