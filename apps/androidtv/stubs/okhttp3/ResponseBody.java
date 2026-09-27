package okhttp3;

import java.io.Closeable;
import java.io.InputStream;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public abstract class ResponseBody implements Closeable {
    public final InputStream byteStream() { throw new UnsupportedOperationException(); }
    public abstract MediaType contentType();
    public void close() { throw new UnsupportedOperationException(); }
}
