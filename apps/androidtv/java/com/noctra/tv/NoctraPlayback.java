package com.noctra.tv;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import org.jellyfin.androidtv.util.PlaybackHelper;
import org.koin.java.KoinJavaComponent;

import java.util.UUID;

/**
 * Films et épisodes lus avec le lecteur de Jellyfin (changement de piste
 * audio, sous-titres, qualité…), sans passer par ses écrans.
 *
 * PlaybackHelper prépare la file de lecture puis demande l'écran du lecteur ;
 * cette demande est rejouée à l'ouverture de MainActivity (flux partagé à
 * mémoire d'un élément). MainActivity est ouverte avec EXTRA_NOCTRA : à la
 * fermeture du lecteur, elle se ferme (patch de build-androidtv.mjs) et
 * l'accueil Noctra réapparaît, au lieu de l'accueil Jellyfin.
 */
public final class NoctraPlayback {
    static final String EXTRA_NOCTRA = "noctra_jellyfin_player";
    static final String EXTRA_STARTED = "noctra_jellyfin_started";

    private NoctraPlayback() { }

    /** @param positionTicks position de départ, ou null pour la reprise enregistrée par Jellyfin. */
    public static boolean play(Context context, UUID itemId, Long positionTicks) {
        try {
            PlaybackHelper helper = (PlaybackHelper) KoinJavaComponent.get(PlaybackHelper.class);
            helper.retrieveAndPlay(itemId, false, positionTicks, context);
        } catch (Throwable error) {
            return false;
        }
        Intent intent = new Intent();
        intent.setComponent(new ComponentName(context, "org.jellyfin.androidtv.ui.browsing.MainActivity"));
        intent.putExtra(EXTRA_NOCTRA, true);
        if (!(context instanceof Activity)) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
            return true;
        } catch (Throwable error) {
            return false;
        }
    }

    static UUID uuid(String id) {
        String hex = id.replace("-", "");
        if (!hex.matches("[0-9a-fA-F]{32}")) return null;
        return UUID.fromString(hex.substring(0, 8) + "-" + hex.substring(8, 12) + "-" + hex.substring(12, 16) + "-" + hex.substring(16, 20) + "-" + hex.substring(20));
    }

    /** Appelé par le lecteur Jellyfin à sa fermeture : retour à l'accueil Noctra. */
    public static boolean close(Activity activity) {
        if (!opened(activity)) return false;
        activity.finish();
        return true;
    }

    /** Le lecteur Jellyfin s'est affiché (CustomPlaybackOverlayFragment.onCreate). */
    public static void started(Activity activity) {
        if (opened(activity)) activity.getIntent().putExtra(EXTRA_STARTED, true);
    }

    /**
     * L'accueil Jellyfin revient au premier plan (HomeFragment.onResume) après
     * la lecture, par exemple depuis l'écran « À suivre » : retour à Noctra.
     */
    public static void home(Activity activity) {
        if (opened(activity) && activity.getIntent().getBooleanExtra(EXTRA_STARTED, false)) activity.finish();
    }

    private static boolean opened(Activity activity) {
        return activity != null && !activity.isFinishing() && activity.getIntent() != null
            && activity.getIntent().getBooleanExtra(EXTRA_NOCTRA, false);
    }
}
