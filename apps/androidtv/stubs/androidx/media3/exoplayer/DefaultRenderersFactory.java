package androidx.media3.exoplayer;

import android.content.Context;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public class DefaultRenderersFactory implements RenderersFactory {
    public static final int EXTENSION_RENDERER_MODE_ON = 1;

    public DefaultRenderersFactory(Context context) { }

    public final DefaultRenderersFactory setExtensionRendererMode(int mode) { return this; }
}
