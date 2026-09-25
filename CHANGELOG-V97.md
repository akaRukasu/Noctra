# Noctra v97 — TV Core Restore & Isolated Extras

## Correction principale

La v96 avait restauré les fonctions de lecture de la v94, mais le workspace TV lui-même restait modifié par Cinéma/Multiview : boutons injectés directement dans `.noctra-tv-player-actions`, état Multiview synchronisé pendant le rendu, hooks dans `openTv()`/`closePanel()` et attribut de layout sur le shell TV.

La v97 restaure le workspace TV normal de la v94. Une empreinte SHA-256 normalisée du bloc `renderTvWorkspace()` est testée pour empêcher une nouvelle dérive du rendu de base.

Les quatre blocs critiques suivants restent également strictement ceux de la v94 :

- `playTvDirectStream()` ;
- `playTvEmbedUrl()` ;
- `playTvResolvedOption()` ;
- `resolveAndPlayTvChannel()`.

## Cinéma / Qualité / Multiview

Ces fonctions existent toujours mais ne font plus partie du DOM normal du lecteur.

- un petit bouton `•••` est ajouté en position absolue au-dessus de l'image, sans participer au layout ;
- le menu d'outils est monté directement dans `document.body` uniquement après un clic ;
- le mode Cinéma ne change le layout qu'après activation explicite ;
- les boutons qualité -/+ pilotent le sélecteur de qualité existant ;
- le Multiview est créé uniquement à son ouverture ;
- le Multiview ne fait jamais `stopLoad()` / `startLoad()` sur `tvHls` ;
- il ne change jamais `currentTime` du lecteur principal ;
- le lecteur principal reste intact derrière le Multiview ;
- jusqu'à quatre chaînes HLS/directes ;
- un seul son Multiview actif à la fois.

## Mobile

- menu TV sous forme de panneau fixe compatible safe-area ;
- Multiview 1 colonne pour deux flux en portrait, grille compacte à partir de trois flux ;
- grille 2x2 en paysage ;
- `playsinline` / `webkit-playsinline` ;
- HLS natif prioritaire sur iPhone/iPad pour les lecteurs secondaires.

## Dock utilisateur

Le verrouillage géométrique desktop de la v96 est conservé afin d'empêcher tout déplacement au hover/focus.

## TV existante préservée

- transport LiveWatch/OHA v94 conservé ;
- WiTV inchangé ;
- LiveWatch VIP inchangé ;
- OHA inchangé ;
- fullscreen natif inchangé ;
- virtualisation/performance desktop conservée.

## Tests

- syntaxe Node ;
- suite historique complète ;
- empreinte du workspace TV v94 ;
- empreintes des quatre blocs de lecture v94 ;
- vérification que les outils n'existent pas dans le markup TV normal ;
- vérification que le Multiview n'agit pas sur le HLS principal ;
- responsive portrait/paysage ;
- transport LiveWatch/OHA v94.
