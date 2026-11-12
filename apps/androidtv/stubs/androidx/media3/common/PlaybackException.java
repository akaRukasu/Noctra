package androidx.media3.common;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public class PlaybackException extends Exception {
    public final int errorCode;

    protected PlaybackException(int errorCode) { this.errorCode = errorCode; }

    public static String getErrorCodeName(int errorCode) { throw new UnsupportedOperationException(); }
}
