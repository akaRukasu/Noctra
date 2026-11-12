package com.noctra.tv;

import android.content.Context;
import android.content.Intent;

import java.util.UUID;

/**
 * Contrôle à distance (« Lire sur… » depuis un téléphone ou un PC) : la
 * commande reçue par Jellyfin (SocketHandler, patch de build-androidtv.mjs)
 * ouvre le lecteur Jellyfin directement (NoctraPlayback), ou la fiche Noctra,
 * et non l'accueil Jellyfin qui n'est plus affiché.
 */
public final class NoctraRemote {
    static final String EXTRA_PLAY_ITEM = "noctra_remote_play";
    static final String EXTRA_SHOW_ITEM = "noctra_remote_show";
    static final String EXTRA_START_TICKS = "noctra_remote_start";

    private NoctraRemote() { }

    /** « Lire sur… » : lecteur Jellyfin, ouvert directement, retour à Noctra à la fin. */
    public static void play(Context context, UUID itemId, Long startTicks) {
        if (context == null || itemId == null) return;
        NoctraPlayback.play(context, itemId, startTicks);
    }

    public static void show(Context context, UUID itemId) {
        if (context == null || itemId == null) return;
        Intent intent = intent(context);
        intent.putExtra(EXTRA_SHOW_ITEM, itemId.toString().replace("-", ""));
        context.startActivity(intent);
    }

    private static Intent intent(Context context) {
        Intent intent = new Intent(context, NoctraHomeActivity.class);
        // L'accueil Noctra existant reçoit la commande (onNewIntent) ; un
        // lecteur ouvert par-dessus se ferme et enregistre sa position.
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }
}
