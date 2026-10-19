# Noctra 200.0.129 — chaînes françaises uniquement, plus de chaînes manquantes

Cette version contient aussi toutes les nouveautés de la 200.0.128 (voir `MISE-A-JOUR-V200128.md`).

## Chaînes françaises uniquement
« Toutes les chaînes » et « Chaînes sport » n'affichent plus que les chaînes françaises.
- Une chaîne est retenue si son pays est la France : référentiel iptv-org, indication de la source (« FR: », « [FR] », « France »…), guide des programmes, ou chaîne française connue (TF1, Canal+, beIN Sports 1 à 3, beIN Sports MAX, Ligue 1+, RMC Sport…).
- Une chaîne dont le pays n'est pas indiqué est retenue si sa source la range dans une catégorie française (« France », « FR », « TNT »…).
- Les chaînes étrangères restent accessibles dans leur source, depuis le bandeau.
- La liste déroulante ne propose plus que des catégories : Généralistes, Info, Sport, Cinéma…

## Chaînes qui n'apparaissaient pas
- **Catalogues livrés en plusieurs fois.**
  - **Cause** : OHA, ou LiveWatch pendant son rafraîchissement, envoie d'abord une partie de ses chaînes, puis complète. La liste réunie ne gardait que cette première partie, pendant 5 min.
  - **Correction** : ces catalogues sont redemandés jusqu'à être complets (6 fois au plus, sur environ 1 min 30). La liste se met à jour sur place, sans couper la lecture.
- **Chaînes à flux direct sans type déclaré** : certaines listes ne marquent pas leurs flux comme « stream ». Ces chaînes étaient écartées alors que le lecteur sait les lire ; elles sont maintenant gardées.
- **Bouquets** : jusqu'à 120 bouquets par source (au lieu de 60), les bouquets français d'abord.
- **Chaînes sport** : en plus des chaînes reconnues par leur nom, toutes les chaînes (hors matchs) des sources de l'univers Sports et des catégories sportives des sources.
- **Recherche** : une chaîne réunie se trouve aussi par ses noms dans chaque source (ex. « France 2 FHD »).

## Validation
- Nouveau test `tests/v200129-tv-missing-channels.mjs` (`npm run test:v200129`, qui enchaîne les tests 128 à 108).
- Banc d'essai Chromium avec le vrai code de la page TV :
  - une source livrée en deux fois se complète seule (TMC et Paris Première apparaissent) ;
  - une chaîne sans type de flux reste affichée ;
  - les chaînes étrangères disparaissent ;
  - Ligue 1+ et beIN Sports restent dans « Chaînes sport ».
- Tous les tests qui réussissaient avant réussissent encore.
- Non testé sur le vrai serveur (sources TV injoignables d'ici).
