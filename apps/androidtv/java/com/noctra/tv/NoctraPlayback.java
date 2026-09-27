package com.noctra.tv;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.jellyfin.androidtv.util.PlaybackHelper;
import org.koin.java.KoinJavaComponent;

import java.lang.ref.WeakReference;
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
 *
 * L'accueil Jellyfin n'est jamais montré : tant que le lecteur n'est pas
 * affiché, un écran « Préparation de la lecture… » le couvre. Si le lecteur
 * ne s'ouvre pas dans les 15 s (élément introuvable, session Jellyfin pas
 * encore prête…), MainActivity se ferme et l'accueil Noctra lance la lecture
 * avec son propre lecteur (takeFailure).
 */
public final class NoctraPlayback {
    static final String EXTRA_NOCTRA = "noctra_jellyfin_player";
    static final String EXTRA_STARTED = "noctra_jellyfin_started";
    private static final String COVER = "noctra-playback-cover";
    private static final long START_TIMEOUT_MS = 15000;

    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static WeakReference<Activity> main = new WeakReference<Activity>(null);
    private static String pendingItem;
    private static Long pendingTicks;
    private static String failedItem;
    private static Long failedTicks;
    private static final Runnable watchdog = new Runnable() {
        @Override
        public void run() {
            if (pendingItem == null) return;
            failedItem = pendingItem;
            failedTicks = pendingTicks;
            pendingItem = null;
            Activity activity = main.get();
            if (opened(activity)) activity.finish();
        }
    };

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
        pendingItem = itemId.toString().replace("-", "");
        pendingTicks = positionTicks;
        failedItem = null;
        handler.removeCallbacks(watchdog);
        handler.postDelayed(watchdog, START_TIMEOUT_MS);
        // MainActivity est « singleTask » : une instance encore ouverte reçoit
        // la demande sans changer d'Intent ; on lui donne la nouvelle.
        Activity existing = main.get();
        if (existing != null && !existing.isFinishing()) existing.setIntent(intent);
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
        if (activity != null) main = new WeakReference<Activity>(activity);
        if (!opened(activity)) return;
        activity.getIntent().putExtra(EXTRA_STARTED, true);
        pendingItem = null;
        handler.removeCallbacks(watchdog);
        uncover(activity);
    }

    /**
     * L'accueil Jellyfin revient au premier plan (HomeFragment.onResume) après
     * la lecture, par exemple depuis l'écran « À suivre » : retour à Noctra.
     */
    public static void home(Activity activity) {
        if (activity != null) main = new WeakReference<Activity>(activity);
        if (!opened(activity)) return;
        if (activity.getIntent().getBooleanExtra(EXTRA_STARTED, false)) activity.finish();
        else if (pendingItem != null) cover(activity);
        else activity.finish();
    }

    /** Lecture Jellyfin qui n'a pas démarré : {itemId, positionTicks} pour le lecteur Noctra, une seule fois. */
    static String[] takeFailure() {
        if (failedItem == null) return null;
        String[] failure = { failedItem, failedTicks == null ? null : String.valueOf(failedTicks) };
        failedItem = null;
        failedTicks = null;
        return failure;
    }

    private static void cover(Activity activity) {
        try {
            ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
            if (decor.findViewWithTag(COVER) != null) return;
            FrameLayout cover = new FrameLayout(activity);
            cover.setTag(COVER);
            cover.setBackgroundColor(Color.rgb(9, 10, 15));
            cover.setClickable(true);
            TextView text = new TextView(activity);
            text.setText("Préparation de la lecture…");
            text.setTextColor(Color.rgb(207, 214, 226));
            text.setTextSize(20);
            cover.addView(text, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
            decor.addView(cover, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        } catch (Throwable ignored) {
        }
    }

    private static void uncover(Activity activity) {
        try {
            ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
            View cover = decor.findViewWithTag(COVER);
            if (cover != null) decor.removeView(cover);
        } catch (Throwable ignored) {
        }
    }

    private static boolean opened(Activity activity) {
        return activity != null && !activity.isFinishing() && activity.getIntent() != null
            && activity.getIntent().getBooleanExtra(EXTRA_NOCTRA, false);
    }
}
