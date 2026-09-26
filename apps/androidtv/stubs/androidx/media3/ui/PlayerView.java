package androidx.media3.ui;

import android.content.Context;
import android.widget.FrameLayout;
import androidx.media3.common.Player;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public class PlayerView extends FrameLayout {
    public static final int SHOW_BUFFERING_ALWAYS = 2;

    public PlayerView(Context context) { super(context); }
    public void setPlayer(Player player) { throw new UnsupportedOperationException(); }
    public void setUseController(boolean useController) { throw new UnsupportedOperationException(); }
    public void setShowBuffering(int showBuffering) { throw new UnsupportedOperationException(); }
}
