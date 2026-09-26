# Noctra 200.0.122 — page « Contrôle à distance » débloquée

Cette version contient aussi toutes les corrections de la 200.0.121 (voir `MISE-A-JOUR-V200121.md`).

## Symptôme
Depuis le menu de diffusion Jellyfin (appareil connecté → « Contrôle à distance »), la page de télécommande s'ouvrait avec un grand bloc sombre sous l'en-tête. Seul le haut de l'affiche restait visible : aucun bouton, aucun titre, aucune progression.

## Cause
- Sur mobile, une ancienne règle Noctra forçait l'affichage de toutes les listes (`.itemsContainer`) des pages de type médiathèque, avec `display:flex !important`. C'était un garde-fou contre les grilles vides.
- Cette règle est plus précise que le `.hide { display:none !important }` de Jellyfin, donc elle l'emportait sur lui.
- La page de télécommande est aussi une « page médiathèque ». Sa file d'attente, masquée tant qu'on ne l'ouvre pas, se retrouvait affichée par-dessus toute la télécommande. Or cette file est positionnée en absolu, avec un z-index de 1000 et un fond #101010 opaque : c'est le bloc sombre.

## Correction
- La grille mobile des médiathèques exclut la page de télécommande (`.nowPlayingPage`) et respecte toujours les conteneurs masqués (`.itemsContainer:not(.hide)`).
- Les grilles desktop des médiathèques respectent aussi `.hide`.

## Validation
- Nouveau test `tests/v200122-remote-control-page.mjs` (`npm run test:v200122`, qui enchaîne les tests 121 à 108).
- La page de télécommande a été rendue avec les styles Jellyfin et Noctra, en taille iPhone :
  - thème 121 : la file masquée est affichée (`flex`) et recouvre le centre de l'écran, comme sur la capture reçue ;
  - thème 122 : la file est masquée (`none`) et les commandes de la télécommande sont visibles.
- Tous les tests qui réussissaient avant réussissent encore.
