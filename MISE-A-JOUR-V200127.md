# Noctra 200.0.127 — logo de l'œuvre sur l'affiche d'accueil

Cette version contient aussi toutes les corrections de la 200.0.126 (voir `MISE-A-JOUR-V200126.md`).

## Nouveauté
Comme sur la version TV, l'affiche « Continuer à regarder » de l'accueil affiche le **logo** du film ou de la série à la place de son nom.
- Film : logo du film. Épisode : logo de la série.
- Logo aligné en bas à gauche, avec une ombre douce pour rester lisible sur l'image de fond. Taille adaptée au PC et au mobile.
- Sans logo dans Jellyfin, le titre texte s'affiche comme avant.
- Le nom reste lu par les lecteurs d'écran (texte alternatif du logo).

## Sans délai d'apparition
- Les logos de tous les titres de l'affiche sont téléchargés **et décodés** dès l'arrivée de la liste, avant d'être montrés. Au changement de titre (flèches ou rotation automatique), le logo est déjà prêt et apparaît en même temps que l'image.
- Si un logo n'est pas encore prêt, le titre reste masqué au plus 0,7 s pour éviter l'enchaînement « texte puis logo ». Passé ce délai, le texte s'affiche, puis le logo le remplace dès qu'il arrive.
- Un logo arrivé en retard n'est jamais affiché sur un autre titre.
- Cache limité à 60 logos.

## Validation
- Nouveau test `tests/v200127-premiere-logo.mjs` (`npm run test:v200127`, qui enchaîne les tests 126 à 108).
- Accueil simulé dans Chromium (PC et iPhone) : logo affiché dès l'ouverture, logo de la série affiché immédiatement après « suivant », titre texte conservé pour un titre sans logo.
- Tous les tests qui réussissaient avant réussissent encore.
- Non testé sur le vrai serveur Jellyfin.
