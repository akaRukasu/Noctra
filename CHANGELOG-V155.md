# Noctra Media Client v155

## Interface

- Ajout d'un fond léger sur le dock pour qu'il reste lisible sur les pages et lecteurs clairs, sans revenir aux halos décoratifs.

## TV / Sport

- FSTV : prise en charge des lecteurs `/live.php?dl=...` en plus de `/live.php?id=...`.
- Streamed : le lecteur public n'est plus sandboxé par Noctra, ce qui corrige l'erreur "Remove sandbox attributes".
- Volkamax / BZH-Sport : le lecteur public n'est plus sandboxé par Noctra.
- OHA : conservation des correctifs v153, avec test de régression relancé.

## Alternative

- Ajout d'un onglet `Alternative` dans l'univers TV.
- Ajout d'une source intégrée alimentée depuis la page Haloule :
  `https://www.haloule.com/2024/01/meilleurs-sites-applications-android-PC-regarder-live-tv-gratuitement.html`
- Les liens sont regroupés en chaînes sport 24/24, sites Live TV, guides programmes, applications/logiciels et alternatives Live TV.
- Le catalogue est rafraîchi avec un cache court de 5 minutes.

## Version

- Client, serveur et cache PWA passent en `155.0.0` / `noctra-shell-v155`.
- Ajout du test `tests/v155-alternative-dock-sports.mjs`.
