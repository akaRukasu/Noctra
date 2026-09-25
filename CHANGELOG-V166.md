# Noctra v166

## Television et multiview

- Multiview disponible depuis toutes les sources TV compatibles, pour les flux directs HLS et les lecteurs web integres.
- La chaine principale est suspendue pendant le multiview puis restauree a la fermeture, afin d'eviter une lecture invisible en arriere-plan.
- Les lecteurs web sont isoles sans autoriser les fenetres publicitaires. Un lecteur tiers qui refuse l'integration ne bloque plus les autres vignettes.
- Grille plein ecran 2 x 2 sur ordinateur et liste 16:9 defilante sur mobile, avec nom, source, etat, qualite et actions pour chaque chaine.
- Une seule sortie audio directe peut etre active a la fois pour eviter les doublons sonores.
- Les controles du petit lecteur restent visibles en mode normal et cinema. Ils se masquent rapidement uniquement en plein ecran.
- Les chaines de chaque source sont triees par ordre alphabetique.
- Ajout de favoris TV globaux, conserves localement et accessibles quelle que soit la source.

## Interface

- Les sous-pages utilisent maintenant toute la fenetre sur ordinateur et mobile.
- Le dock reste affiche au-dessus des sous-pages et du multiview, sans se replier.
- Correction des images de mediatheque, des icones Material, du portail de connexion residuel et des commandes SyncPlay/Cast.

## Stabilite TV

- Le profil reseau desktop ne classe plus une connexion RJ45 stable en faible debit a partir d'une estimation navigateur imprecise.
- Tampon HLS initial renforce et reprise plus prudente pour reduire les micro-coupures sur les sources publiques irregulieres.
- Conservation des correctifs WiTV, OHA (`oha.cx`), FSTV, StreamSports99, Streamed, Volkamax et Alternative.

## Tests

- `npm run check`
- `npm test`
- Controle visuel du dock, des favoris et du multiview sur ordinateur et mobile.

## Version

- Client/serveur/PWA passent en `166.0.0` / `noctra-shell-v166`.
