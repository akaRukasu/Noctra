# Noctra 200.0.176 — qualité des flux TV sur la version web mobile

Serveur et version web uniquement. Les applis ne changent pas.

## Ce qui manquait

- **iPhone / iPad (Safari, application web installée)** : quand le direct passait par le lecteur HLS d'iOS (moteur « HLS.js » choisi dans Outils TV, ou secours quand Shaka ne démarre pas), aucune qualité n'était proposée. iOS ne donne pas la liste des qualités au site.
- **Téléphone (moins de 760 px de large)** : le mot « Qualité » était masqué, il ne restait qu'une liste « Auto ».
- **Partout, PC compris** : la définition réellement lue n'était jamais affichée. Une source à une seule qualité n'affichait rien.

## Correction

- La liste affiche « Qualité · Auto · 1080p » : la définition en cours de lecture. Elle suit les changements, qu'ils soient automatiques ou choisis.
- **iPhone / iPad, lecteur HLS d'iOS** : Noctra lit lui-même la liste principale du flux et propose les mêmes qualités qu'ailleurs (« 1080p · 5.0 Mb/s », etc.). Choisir une qualité charge cette qualité. « Auto » rend le choix à iOS.
- Une source à une seule qualité affiche sa définition (« Qualité · 720p »), sans choix possible.
- Sur téléphone, « Qualité » reste écrit et la qualité occupe sa propre ligne : le texte n'est jamais coupé, même sur iPhone. Le zapping et Caster passent dessous.

## Vérification

`tests/v200176-tv-quality-mobile.mjs` lance un vrai navigateur sur les styles et scripts de la version web, sur trois appareils : PC, Pixel 7 et iPhone 14 (lecteur HLS natif de Safari simulé). Les flux de test sont de faux directs à 3 qualités (1080p, 720p, 480p) et à une seule qualité. Le test vérifie :
- l'affichage de la liste et de « Qualité » ;
- la définition lue ;
- le passage en 480p, puis le retour à « Auto » sur iPhone ;
- la source à une seule qualité.

Il échoue avec la 200.0.175 et réussit avec la 200.0.176.

Limites :
- Le lecteur natif de Safari est simulé dans Chromium. Ce n'est pas un iPhone réel.
- Avec le lecteur d'iOS, un changement de qualité recharge le direct, avec une courte coupure.
- Un flux qui ne publie qu'une qualité ne peut pas en proposer d'autres.

## Mise à jour

Mettez `noctra-media-client-v200.0.176.zip` dans Téléchargements, puis lancez `LANCER-MISE-A-JOUR-NOCTRA-V8.cmd`. `.env`, `runtime`, les comptes, les favoris et l'historique sont conservés. Rechargez ensuite la version web : l'adresse `/health` doit annoncer `200.0.176`.
