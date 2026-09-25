# Noctra v167

## Dock

- Le dock conserve maintenant sa largeur reelle dans tous les sous-menus au lieu d'etre force a une largeur plus petite.
- Il reste explicitement developpe et superpose, y compris pendant la lecture.
- Le dock et le titre du sous-menu partagent un bandeau de 68 px mieux aligne en haut de l'ecran.

## Mediatheques

- La section `Mes medias` recupere desormais les images de `/api/libraries` lorsque les images natives Jellyfin restent en attente ou absentes.
- Les images de Films, Series, Films D'animations et Animes utilisent donc la meme source fiable que le menu Mediatheques.
- Les cartes du menu Mediatheques sont moins hautes et les quatre univers tiennent sans barre verticale parasite sur un ecran ordinateur standard.
- Sur mobile, les quatre univers utilisent une grille compacte 2 x 2 avec des titres et actions adaptes au tactile.

## Tests

- `npm run check`
- `npm test`
- Controle visuel du dock et du menu Mediatheques en 1280 x 720 et en largeur mobile de 390 px.

## Version

- Client/serveur/PWA passent en `167.0.0` / `noctra-shell-v167`.
