package com.noctra.tv;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Journal du lecteur web (processus « :webplayer ») : ce qui s'est passé avant
 * un échec (réponses du serveur, erreurs de la page, arrêt du moteur web…).
 * Fichier privé de l'appli, partagé entre ses processus : l'accueil le relit
 * quand le lecteur s'est arrêté brutalement et en affiche la fin.
 */
final class NoctraWebLog {
    private static final String FILE = "noctra-webplayer.log";
    private static final int MAX_LINES = 60;
    private static int lines;

    private NoctraWebLog() { }

    static synchronized void start(Context context, String title) {
        lines = 0;
        write(context, "▶ " + title + "\n", false);
    }

    static synchronized void add(Context context, String line) {
        if (line == null || lines >= MAX_LINES) return;
        lines++;
        String clean = line.replace('\n', ' ');
        write(context, (clean.length() > 220 ? clean.substring(0, 220) + "…" : clean) + "\n", true);
    }

    /** Dernières lignes utiles (hors en-tête), pour la fenêtre des serveurs. */
    static String tail(Context context, int count) {
        List<String> all = new ArrayList<String>();
        try {
            File file = new File(context.getFilesDir(), FILE);
            if (!file.exists()) return "";
            FileInputStream input = new FileInputStream(file);
            byte[] data = new byte[(int) Math.min(file.length(), 64 * 1024)];
            int read = input.read(data);
            input.close();
            for (String line : new String(data, 0, Math.max(0, read), "UTF-8").split("\n")) {
                if (!line.trim().isEmpty() && !line.startsWith("▶ ")) all.add(line.trim());
            }
        } catch (Throwable ignored) {
            return "";
        }
        StringBuilder text = new StringBuilder();
        for (int i = Math.max(0, all.size() - count); i < all.size(); i++) {
            if (text.length() > 0) text.append('\n');
            text.append("· ").append(all.get(i));
        }
        return text.toString();
    }

    private static void write(Context context, String text, boolean append) {
        try {
            FileOutputStream output = new FileOutputStream(new File(context.getFilesDir(), FILE), append);
            output.write(text.getBytes("UTF-8"));
            output.close();
        } catch (Throwable ignored) {
        }
    }
}
