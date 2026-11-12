package com.noctra.tv;

import org.json.JSONObject;

/**
 * Liaison entre l'accueil Noctra (page web : SyncPlay, commandes à distance)
 * et le lecteur ouvert par-dessus. Les deux écrans vivent dans le processus
 * principal, sur le fil d'interface : pas de verrou nécessaire.
 */
final class NoctraPlayerBus {
    interface Listener {
        void onPlayerEvent(JSONObject event);
    }

    interface Player {
        void onCommand(JSONObject command);
    }

    static Listener listener;
    static Player player;

    private NoctraPlayerBus() { }

    static void toPlayer(JSONObject command) {
        if (player != null) player.onCommand(command);
    }

    static void fromPlayer(JSONObject event) {
        if (listener != null) listener.onPlayerEvent(event);
    }
}
