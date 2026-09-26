package com.noctra.tv;

import android.app.Application;
import android.content.Context;
import android.os.Build;

import java.io.FileInputStream;

/**
 * Processus secondaire (« :webplayer ») : l'initialisation de Jellyfin (Koin,
 * démarrée par androidx.startup dans le processus principal seulement) y est
 * sautée. Appelé par JellyfinApplication.onCreate (patch de build-androidtv.mjs).
 */
public final class NoctraProcess {
    private NoctraProcess() { }

    public static boolean isSecondary(Context context) {
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
