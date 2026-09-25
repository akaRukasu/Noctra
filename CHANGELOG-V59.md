# Noctra v59

## Hotfix TV en direct

- Correction d’une régression JavaScript introduite dans la v58 : `playTvChannel()` utilisait `score` et `logo` sans les déclarer. Le clic sur une chaîne levait donc une `ReferenceError` avant le lancement du lecteur, ce qui bloquait LiveWatch, WiTV et OHA en même temps.
- Les références du score et du logo sont de nouveau récupérées avant leur utilisation ; le moteur de lecture v58 (embed LiveWatch, résolveur WiTV/OHA, HLS direct) reste inchangé.
- Le bouton d’administration des sources affiche de nouveau un libellé **Ajouter** sur PC, avec l’icône `+` explicitement stylée ; sur mobile il reste volontairement compact en icône seule.
- Les améliorations v58 sont conservées : logos enrichis/proxy, guide EPG à la demande, mise en page TV aérée et plein écran mobile/tablette.

## Cache / version

- Version serveur/PWA : `59.0.0`.
- Cache service worker : `noctra-shell-v59`.
