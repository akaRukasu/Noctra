# Noctra v169

## Sous-menus

- Suppression du decalage vertical herite qui poussait le titre contre la ligne coloree.
- Bandeau ordinateur porte a 88 px, avec titre centre dans sa propre zone et dock toujours superpose.
- Implantation mobile conservee, sans replier le dock.

## Accueil et mediatheques

- Les images de `Mes medias` sont maintenant recuperees avec la session Jellyfin active puis affichees sous forme de Blob local authentifie.
- Un observateur restaure automatiquement l'image si Jellyfin reconstruit tardivement une carte.
- Le repli est applique meme lorsqu'une image native temporaire a ete detectee.
- Le titre long `Films D'animations` est adapte aux petites cartes mobiles.

## TV

- FSTV et WiTV utilisent le profil de source publique a tampon profond sur ordinateur.
- Le lecteur reste huit segments derriere le direct et peut conserver jusqu'a 180 s de tampon, avec une limite haute de 300 s.
- Une mise en memoire ordinaire ne force plus FSTV/WiTV a revenir au bord du direct ni a redemarrer le chargeur HLS au temps courant.
- Les blocages rapproches restent memorises pendant 90 s afin que l'adaptation de qualite puisse agir entre deux reprises.

## Version

- Client, serveur et PWA passent en `169.0.0` / `noctra-shell-v169`.
