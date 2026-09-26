# Noctra 200.0.118 — « Aurora Flow », sous-titres dans le lecteur iOS, diffusion AirPlay

## Sous-titres dans le lecteur iOS (plein écran natif) et en image dans l'image
**Cause.** Sur Safari, avec le réglage « Auto », Jellyfin affiche les sous-titres dans un calque HTML posé sur la vidéo. Pour les sous-titres ASS et PGS, il utilise un canvas. Le lecteur plein écran natif d'iOS et le PiP n'affichent que la vidéo, sans ce calque : les sous-titres disparaissaient.

**Correction** (nouveau script `public/noctra-remote-media.js`) :
- À l'entrée dans le lecteur natif, en PiP ou en diffusion AirPlay, Noctra demande à Jellyfin la piste de sous-titres en cours (état de la session). Il l'ajoute à la vidéo en **piste native WebVTT**, convertie par Jellyfin, y compris depuis un fichier ASS ou SRT.
- La piste est retirée au retour dans la page. Il n'y a donc jamais de double affichage.
- **Secours** : si Jellyfin ne répond pas, la réplique affichée par Jellyfin est recopiée en direct dans une piste native.
- Si Jellyfin utilise déjà une piste native, rien n'est modifié.
- Les sous-titres image (PGS, DVD) ne peuvent pas être convertis en texte ; ils restent visibles dans le lecteur Noctra.

## Diffuser sans application : AirPlay et Remote Playback
- Le bouton AirPlay d'origine de Jellyfin repose sur des fonctions que Safari n'a jamais fournies : il restait toujours masqué.
- Un bouton **Diffuser** apparaît maintenant dans la barre du lecteur films et séries, à côté du plein écran, **seulement quand un appareil est disponible**. Il fonctionne aussi depuis la web-app installée sur l'écran d'accueil.
  - iPhone, iPad, Mac (Safari) : il ouvre le sélecteur AirPlay du système (Apple TV, téléviseurs compatibles AirPlay).
  - Chrome Android : il ouvre le sélecteur Remote Playback (Chromecast).
- Pendant une diffusion, le bouton s'allume et les sous-titres passent aussi par la piste native.
- L'appareil de destination lit le flux directement depuis le serveur Jellyfin : il doit pouvoir l'atteindre (c'est le cas avec l'adresse publique de la seedbox).
- La TV en direct gardait déjà son propre bouton de diffusion pour les flux directs.

## « Aurora Flow » : mouvement physique, animé par le navigateur
- **Courbe « ressort »** pour toutes les transitions Aurora : départ vif, arrivée amortie avec un léger rebond. Elle n'est utilisée que si le navigateur la connaît.
- **Défilement natif** (Chrome/Edge récents, Safari 26+) : les rangées de l'accueil se lèvent au fil du défilement. La parallaxe de l'affiche est calculée par le navigateur. Le script d'effets ne mesure et ne masque plus rien : plus de travail pendant le défilement, et plus aucun risque de rangée restée invisible. Sur les autres navigateurs, le comportement 116 est conservé.
- **Carrousels en profondeur** (ordinateur) : les affiches rétrécissent et s'estompent en approchant des bords du carrousel.
- **Projecteur** (souris) : au survol d'une affiche, ses voisines passent dans l'ombre.
- **Pression à ressort** : les boutons s'enfoncent puis rebondissent.
- Tout est coupé en lecture vidéo et quand le mouvement réduit est activé. Seules l'opacité, l'échelle et la position sont animées, sans animation continue. Le dock et la vidéo ne sont pas touchés.

## Revue de code 117
- Le correctif de la section « Apparence » des sous-titres est limité au WebKit d'Apple. Sur les autres moteurs (certaines TV), une réponse vide peut être réelle, et la section ne doit pas y être forcée.

## Validation
- Nouveau test `tests/v200118-flow-remote-media.mjs` (`npm run test:v200118`, qui enchaîne les tests 117 à 108).
- Vérifications dans Chromium :
  - **Piste VTT** : ajoutée et affichée en PiP, puis retirée à la sortie.
  - **Copie de secours** : suit la réplique de Jellyfin.
  - **Sous-titres image** : ignorés.
  - **Bouton Diffuser** : visible seulement si un appareil AirPlay est annoncé, et ouvre le sélecteur.
  - **Rangées** : toutes visibles au chargement comme en bas de page.
  - **Profondeur** : les affiches pleinement visibles restent à 100 %.
- Tous les tests qui réussissaient avant réussissent encore.
- Non testé sur un vrai iPhone ni avec une vraie Apple TV (inaccessibles depuis l'environnement de développement).
