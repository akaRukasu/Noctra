package okhttp3;

import java.io.Closeable;
import java.util.List;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public class Response implements Closeable {
    public final int code() { throw new UnsupportedOperationException(); }
    public final String message() { throw new UnsupportedOperationException(); }
    public final String header(String name) { throw new UnsupportedOperationException(); }
    public final List<String> headers(String name) { throw new UnsupportedOperationException(); }
    public final Headers headers() { throw new UnsupportedOperationException(); }
    public final ResponseBody body() { throw new UnsupportedOperationException(); }
    public void close() { throw new UnsupportedOperationException(); }
}
