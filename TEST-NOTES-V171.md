# Notes de test Noctra v171

## Automatise

- `npm run check` : syntaxe serveur et client valide.
- `npm test` : suite complete validee, y compris le controle v171.
- HLS.js embarque : version d'execution `1.7.1`.
- Icones PWA : signature et dimensions controlees pour les quatre PNG.

## Serveur reel

- `/health` : version `171.0.0`.
- `/api/libraries` : quatre mediatheques detectees.
- Les quatre proxys image repondent `200 image/png` avec des contenus distincts.

## Navigateur desktop et mobile

- Quatre images chargees avec une largeur naturelle de 960 px et l'etat `data-noctra-library-image-ready=true`.
- Aucun titre CSS ou libelle inferieur duplique lorsque l'image est prete.
- Fleches accueil : position testee `0 -> 228 -> 0`.
- Menu Cast desktop et menu SyncPlay mobile positionnes en `fixed` dans les limites de la fenetre.
- Grille mobile testee a 390 x 844 avec deux colonnes.
- Splash : ecart au centre utile `0 px` sur les deux axes en desktop et mobile.

## Limite

- Le `.env` fournit une cle API Jellyfin mais pas de jeton utilisateur administrateur. Le suivi de tache a donc ete valide par contrat serveur et tests statiques; l'appel admin complet sera exerce apres deploiement par une session Noctra connectee.
