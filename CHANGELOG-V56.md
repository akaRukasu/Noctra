# Noctra v56

## TV pour tous les membres

- Le dock des comptes Jellyfin standards est recalculé pour quatre raccourcis : Accueil, Médiathèques, Demandes et TV.
- Le backend autorisait déjà les routes TV en lecture ; la largeur historique du dock utilisateur pouvait néanmoins masquer le quatrième bouton. Cette contrainte est supprimée sur PC et adaptée en grille 4 colonnes sur mobile.
- L’ajout et la suppression de sources TV restent réservés aux administrateurs.

## Logos de chaînes

- Les logos distants passent maintenant par `/api/tv/image/:token` sur le serveur Noctra.
- Le proxy vérifie qu’une ressource est bien une image, limite sa taille et la met en cache côté navigateur.
- Une icône TV de secours remplace automatiquement une image qui reste inaccessible.

## OHA France · A–Z

- Noctra conserve l’indexation des liens publics présents directement dans `https://oha.cx/live`.
- Si la page est une SPA et ne contient pas assez de chaînes dans son HTML initial, Noctra inspecte les scripts publics de la même origine afin de repérer d’éventuels endpoints JSON publics liés aux chaînes/Live TV.
- Seules les URLs publiques OHA de même origine sont utilisées. Aucun jeton privé, flux caché ou mécanisme d’authentification n’est extrait.
- Si aucun catalogue public exploitable n’est disponible, le repli portail reste utilisé.

## Cast

- Le plugin Chromecast officiel du Jellyfin Web embarqué reste activé dans `public/client/config.json` pour les médias Jellyfin.
- Dans le lecteur TV Noctra, un bouton **Caster** apparaît pour un flux direct/HLS lorsque le navigateur expose AirPlay (`webkitShowPlaybackTargetPicker`) ou l’API Remote Playback.
- Les lecteurs web encapsulés en iframe (LiveWatch, WiTV, OHA) ne sont pas présentés comme castables : le navigateur ne donne pas à Noctra le flux vidéo de ces iframes.

## Validation

- `npm test` : OK.
- `node --check server.mjs` : OK.
- `node --check public/noctra-shell.js` : OK.
- `/noctra/health` retourne `56.0.0`.
