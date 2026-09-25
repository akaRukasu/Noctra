# Noctra v159

## Alternative

- Le navigateur intégré Alternative n'utilise plus `sandbox` pour les lecteurs live résolus.
- Cela corrige les lecteurs qui affichent `SANDBOX IFRAME NOT ALLOWED` après résolution Clictune/Dlink.
- Le bouton `Ouvrir dehors` reste disponible si un site refuse quand même l'intégration.

## WiTV

- Le HLS validé redevient le choix par défaut.
- Le lecteur web WiTV reste disponible en secours manuel.
- Vérification publique : le lecteur PlayerJS WiTV actuel expose un `.m3u8` répondant `200` en `application/x-mpegurl`.

## Accueil / Mes médias

- Les images des cartes de médiathèques remplissent maintenant toute la carte.
- Corrige la carte `Animes` dont la bannière pouvait rester partiellement noire en bas.

## Version

- Client/serveur/PWA passent en `159.0.0` / `noctra-shell-v159`.

## Tests

- `npm run check`
- `npm test`
