# Noctra Media Client v154

## Sport

- Ajout de `streamed.pk` comme source Sport intégrée.
  - Lecture du catalogue public Streamed via `/api/matches/live/popular`, `/api/matches/featured` et les rubriques sportives exposées par `/api/sports`.
  - Les événements s'ouvrent sur le lecteur public `/watch/<id>`.
- Ajout de `volkamax.club` comme source Sport intégrée.
  - Prise en compte du domaine public actuellement publié sous BZH-Sport / `bzh-sport.lat`.
  - Déduplication des liens sportifs et des chaînes sportives publiées sur la page d'accueil.

## FSTV

- Amélioration de la lecture FSTV : Noctra détecte désormais le lecteur `/live.php?id=...` publié sur les pages chaînes.
- Quand ce lecteur est disponible, la chaîne passe en flux HLS direct relayé par Noctra.
- L'ancien pont HTML FSTV est conservé comme secours pour ne pas perdre les correctifs v152/v153.
- FSTV est traité comme fournisseur à flux long dans le proxy, afin d'éviter les coupures par timeout générique.

## StreamSports99

- Mise à jour du catalogue public vers l'API actuellement référencée par le site : `api.cdnlivetv.is`.
- Conservation des anciens endpoints en secours.
- Acceptation des lecteurs publiés sur `cdnlivetv.is` et `cdnlivetv.tv`, en plus de l'ancien domaine.

## Version

- Client, serveur et cache PWA passent en `154.0.0` / `noctra-shell-v154`.
- Ajout du test `tests/v154-sport-sources.mjs`.

## Notes de test

- Vérification publique du 24/08/2026 :
  - `streamed.pk` publie des catégories sportives et des événements live/populaires.
  - `volkamax.club` publie la page BZH-Sport et des liens `bzh-sport.lat`.
  - `fstv.rest` publie les chaînes et des lecteurs `/live.php?id=...`.
  - `streamsports99.su` référence `api.cdnlivetv.is` / `cdnlivetv.is`.
