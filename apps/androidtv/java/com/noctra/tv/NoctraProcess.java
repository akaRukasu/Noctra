package com.noctra.tv;

import android.app.Application;
import android.content.Context;
import android.os.Build;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

/**
 * Processus secondaire (« :webplayer ») : l'initialisation de Jellyfin (Koin,
 * démarrée par androidx.startup dans le processus principal seulement) y est
 * sautée. Appelé par JellyfinApplication.onCreate (patch de build-androidtv.mjs).
 */
public final class NoctraProcess {
    private NoctraProcess() { }

    public static boolean isSecondary(Context context) {
        boolean secondary = secondaryProcess();
        if (!secondary) moveServer(context);
        return secondary;
    }

    /**
     * Seedbox déplacée (merlion.usbx.me → astra.usbx.me) : l'adresse du serveur
     * gardée par Jellyfin (files/authentication_store.json) est corrigée avant
     * que l'appli ne la lise ; la session (jeton) est conservée.
     */
    private static void moveServer(Context context) {
        try {
            File file = new File(context.getFilesDir(), "authentication_store.json");
            if (!file.isFile() || file.length() > 4 * 1024 * 1024) return;
            byte[] data = new byte[(int) file.length()];
            FileInputStream input = new FileInputStream(file);
            try {
                int offset = 0;
                while (offset < data.length) {
                    int read = input.read(data, offset, data.length - offset);
                    if (read < 0) break;
                    offset += read;
                }
            } finally {
                input.close();
            }
            String text = new String(data, "UTF-8");
            String moved = text.replace(".merlion.usbx.me", ".astra.usbx.me");
            if (moved.equals(text)) return;
            File temporary = new File(file.getPath() + ".noctra");
            FileOutputStream output = new FileOutputStream(temporary);
            try {
                output.write(moved.getBytes("UTF-8"));
                output.getFD().sync();
            } finally {
                output.close();
            }
            if (!temporary.renameTo(file)) temporary.delete();
        } catch (Throwable ignored) {
        }
    }

    private static boolean secondaryProcess() {
        String name = null;
        try {
            if (Build.VERSION.SDK_INT >= 28) name = Application.getProcessName();
        } catch (Throwable ignored) {
            name = null;
        }
        if (name == null) {
            try {
                FileInputStream stream = new FileInputStream("/proc/self/cmdline");
                try {
                    byte[] buffer = new byte[256];
                    int length = stream.read(buffer);
                    int end = 0;
                    while (end < Math.max(0, length) && buffer[end] != 0) end++;
                    name = new String(buffer, 0, end, "UTF-8");
                } finally {
                    stream.close();
                }
            } catch (Throwable ignored) {
                return false;
            }
        }
        return name != null && name.indexOf(':') >= 0;
    }
}
