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
import org.json.JSONArray;
import org.json.JSONObject;
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

    // ── Suivi du lecteur Jellyfin ─────────────────────────────────────────
    // Toutes les 2 s : titre et position lus dans le lecteur (par réflexion).
    // Au retour dans Noctra, l'accueil reçoit la dernière position (reprise
    // gardée même si Jellyfin l'efface sous son seuil de 5 %) et les sauts en
    // avant faits au début d'un épisode (générique passé à la main, appris
    // pour la série).
    private static final long TRACK_MS = 2000;
    private static String trackItem;
    private static String trackSeries;
    private static long trackPosition = -1;
    private static long trackRuntime;
    private static long trackAt;
    private static long[] pendingSkip;
    private static JSONArray learned = new JSONArray();
    private static boolean tracking;
    private static final Runnable tracker = new Runnable() {
        @Override
        public void run() {
            Activity activity = main.get();
            boolean alive = activity != null && !activity.isFinishing();
            if (alive) { sample(); handler.postDelayed(this, TRACK_MS); }
            else { commitSkip(true); tracking = false; }
        }
    };

    private static Object call(Object target, String name) throws Exception {
        return target.getClass().getMethod(name).invoke(target);
    }

    private static void sample() {
        try {
            Object container = KoinJavaComponent.get(Class.forName("org.jellyfin.androidtv.ui.playback.PlaybackControllerContainer"));
            Object controller = call(container, "getPlaybackController");
            if (controller == null) return;
            Object item = call(controller, "getCurrentlyPlayingItem");
            if (item == null) return;
            Object id = call(item, "getId");
            Object series = call(item, "getSeriesId");
            Object runtime = call(item, "getRunTimeTicks");
            long position = ((Number) call(controller, "getCurrentPosition")).longValue();
            long now = System.currentTimeMillis();
            String itemId = id == null ? null : id.toString().replace("-", "");
            if (itemId == null || position < 0) return;
            if (!itemId.equals(trackItem)) {
                commitSkip(true);
                trackItem = itemId;
                trackPosition = -1;
            }
            trackSeries = series == null ? null : series.toString().replace("-", "");
            trackRuntime = runtime instanceof Number ? ((Number) runtime).longValue() / 10000L : 0;
            if (trackPosition >= 0 && trackSeries != null) {
                long jump = position - trackPosition - (now - trackAt);
                // Saut en avant de plus de 20 s au début de l'épisode : générique passé.
                if (jump > 20000 && trackPosition < 10 * 60000L) {
                    if (pendingSkip != null && now - pendingSkip[2] < 8000 && Math.abs(trackPosition - pendingSkip[1]) < 6000) pendingSkip[1] = position;
                    else { commitSkip(true); pendingSkip = new long[] { trackPosition, position, now }; }
                    pendingSkip[2] = now;
                }
            }
            commitSkip(false);
            if (position > 0) trackPosition = position;
            trackAt = now;
        } catch (Throwable ignored) {
            // Lecteur Jellyfin différent : suivi indisponible, lecture inchangée.
        }
    }

    private static void commitSkip(boolean force) {
        if (pendingSkip == null || trackSeries == null) { if (force) pendingSkip = null; return; }
        if (!force && System.currentTimeMillis() - pendingSkip[2] < 8000) return;
        long start = pendingSkip[0], end = pendingSkip[1];
        pendingSkip = null;
        if (end - start < 20000 || end - start > 200000) return;
        try {
            JSONObject skip = new JSONObject();
            skip.put("seriesId", trackSeries);
            skip.put("itemId", trackItem);
            skip.put("startMs", start);
            skip.put("endMs", end);
            learned.put(skip);
        } catch (Exception ignored) {
        }
    }

    /** Dernière lecture du lecteur Jellyfin (une seule fois) : {itemId, positionMs, runtimeMs, skips}. */
    static JSONObject takePlayback() {
        if (trackItem == null) return null;
        // Lecteur encore ouvert (retour à Noctra pas encore fait) : rien à donner.
        Activity activity = main.get();
        if (opened(activity)) return null;
        handler.removeCallbacks(tracker);
        tracking = false;
        commitSkip(true);
        try {
            JSONObject played = new JSONObject();
            played.put("itemId", trackItem);
            played.put("positionMs", trackPosition);
            played.put("runtimeMs", trackRuntime);
            played.put("skips", learned);
            trackItem = null;
            trackPosition = -1;
            learned = new JSONArray();
            return played;
        } catch (Exception error) {
            return null;
        }
    }

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
        sample();
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
        if (!tracking) {
            tracking = true;
            handler.removeCallbacks(tracker);
            handler.postDelayed(tracker, TRACK_MS);
        }
    }

    /**
     * L'accueil Jellyfin revient au premier plan (HomeFragment.onResume) après
     * la lecture : retour à Noctra. Vérifié après un court délai : entre deux
     * épisodes, Jellyfin passe un instant par son accueil en ouvrant l'écran
     * « À suivre » (remplacement du lecteur), qui enchaîne l'épisode suivant.
     */
    public static void home(final Activity activity, final Object fragment) {
        if (activity != null) main = new WeakReference<Activity>(activity);
        if (!opened(activity)) return;
        final boolean started = activity.getIntent().getBooleanExtra(EXTRA_STARTED, false);
        if (!started && pendingItem != null) {
            cover(activity);
            return;
        }
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (opened(activity) && resumed(fragment)) activity.finish();
            }
        }, 900);
    }

    /** Fragment encore affiché ? (androidx Fragment.isResumed, par réflexion). */
    private static boolean resumed(Object fragment) {
        if (fragment == null) return true;
        try {
            return (Boolean) fragment.getClass().getMethod("isResumed").invoke(fragment);
        } catch (Throwable error) {
            return true;
        }
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
