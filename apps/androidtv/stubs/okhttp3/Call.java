package okhttp3;

import java.io.IOException;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public interface Call {
    Response execute() throws IOException;

    interface Factory {
        Call newCall(Request request);
    }
}
