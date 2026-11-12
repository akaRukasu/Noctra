package com.noctra.tv;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;

/**
 * Appelé par StartupActivity de Jellyfin (patch de build-androidtv.mjs) au
 * moment d'ouvrir l'écran suivant, une fois la session ouverte.
 *
 * - Démarrage normal : l'accueil Noctra (NoctraHomeActivity) remplace
 *   l'accueil Jellyfin.
 * - Fiche, médiathèque, recherche, lien des chaînes Android TV, ou demande
 *   venue de l'accueil Noctra (EXTRA_OPEN) : l'écran Jellyfin natif.
 */
public final class NoctraRouting {
    /** Posé par l'accueil Noctra : l'écran Jellyfin s'ouvre par-dessus, Retour y revient. */
    public static final String EXTRA_OPEN = "noctra_open";

    private static final int NEW_TASK_CLEAR_TASK = 0x10004000;

    private NoctraRouting() { }

    private static Intent intentOf(Context context) {
        return context instanceof Activity ? ((Activity) context).getIntent() : null;
    }

    public static Class<?> nextActivity(Context context) {
        Intent intent = intentOf(context);
        boolean jellyfinScreen = intent != null && (intent.getBooleanExtra(EXTRA_OPEN, false)
            || intent.hasExtra("ItemId")
            || Intent.ACTION_SEARCH.equals(intent.getAction())
            || Intent.ACTION_VIEW.equals(intent.getAction()));
        if (!jellyfinScreen) return NoctraHomeActivity.class;
        try {
            return Class.forName("org.jellyfin.androidtv.ui.browsing.MainActivity");
        } catch (ClassNotFoundException error) {
            return NoctraHomeActivity.class;
        }
    }

    public static int nextActivityFlags(Context context) {
        Intent intent = intentOf(context);
        if (intent != null && intent.getBooleanExtra(EXTRA_OPEN, false)) return Intent.FLAG_ACTIVITY_NEW_TASK;
        return NEW_TASK_CLEAR_TASK;
    }
}
