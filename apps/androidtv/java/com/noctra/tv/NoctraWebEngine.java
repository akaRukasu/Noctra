package com.noctra.tv;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.webkit.WebSettings;
import android.webkit.WebView;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Moteur web du téléviseur (« Android System WebView » ou Chrome), utilisé
 * par l'accueil et par les lecteurs web des chaînes.
 *
 * Il se met à jour à part, par le Play Store. Sur beaucoup de téléviseurs et
 * de vidéoprojecteurs, il a plusieurs années de retard : les lecteurs web
 * récents n'y fonctionnent plus (« SyntaxError: Unexpected token » dans le
 * journal, puis des erreurs en chaîne comme « aclib is not defined »). Sa
 * version est donc relevée, affichée dans le journal et, si besoin, l'accueil
 * propose de le mettre à jour.
 */
final class NoctraWebEngine {
    /** En dessous, les lecteurs web récents échouent souvent. */
    static final int RECOMMENDED_MAJOR = 110;

    private NoctraWebEngine() { }

    /** Paquet du moteur web (com.google.android.webview, com.android.chrome…). */
    static String packageName(Context context) {
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                PackageInfo info = WebView.getCurrentWebViewPackage();
                if (info != null && info.packageName != null) return info.packageName;
            } catch (Throwable ignored) {
            }
        }
        return "com.google.android.webview";
    }

    /** Version complète (ex. « 83.0.4103.106 »), ou chaîne vide. */
    static String version(Context context) {
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                PackageInfo info = WebView.getCurrentWebViewPackage();
                if (info != null && info.versionName != null) return info.versionName;
            } catch (Throwable ignored) {
            }
        }
        try {
            Matcher chrome = Pattern.compile("Chrome/([\\d.]+)").matcher(WebSettings.getDefaultUserAgent(context));
            if (chrome.find()) return chrome.group(1);
        } catch (Throwable ignored) {
        }
        return "";
    }

    static int major(String version) {
        Matcher number = Pattern.compile("^(\\d+)").matcher(version == null ? "" : version);
        try {
            return number.find() ? Integer.parseInt(number.group(1)) : 0;
        } catch (NumberFormatException error) {
            return 0;
        }
    }

    static String describe(Context context) {
        String version = version(context);
        return "Chrome " + (version.isEmpty() ? "?" : version) + " (" + packageName(context) + ")";
    }

    /** Page du moteur web dans le Play Store (ou le site du Play Store à défaut). */
    static boolean openUpdate(Context context) {
        String name = packageName(context);
        String[] targets = { "market://details?id=" + name, "https://play.google.com/store/apps/details?id=" + name };
        for (String target : targets) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                return true;
            } catch (ActivityNotFoundException ignored) {
            } catch (Throwable ignored) {
            }
        }
        return false;
    }
}
