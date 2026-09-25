# Noctra Media Client v83

## Objectif

Stabilisation ciblée de la TV à partir de la v82 et évolution du centre de demandes Jellyseerr/Seerr, sans réécrire les chemins TV désormais fonctionnels.

## TV — stabilité de lecture

- **Aucun changement automatique de serveur pendant une lecture active.**
  - LiveWatch Premium n'est plus remplacé en arrière-plan par un HLS découvert plus tard.
  - Une erreur HLS peut relancer une fois **le même flux**, mais Noctra ne choisit plus un autre serveur à la place de l'utilisateur.
- **Qualité HLS sélectionnable** lorsqu'un master HLS expose plusieurs niveaux : `Auto`, puis résolutions/bitrates disponibles.
- **Plein écran natif** conservé via Fullscreen API ; le bouton plein écran est automatiquement masqué une fois le lecteur réellement en fullscreen.
- **WiTV** : `Serveur 2 - HLS` reste prioritaire lorsqu'il existe ; sinon le premier HLS disponible est choisi.

## LiveWatch

- Conservation du chemin **VIP Premium** fonctionnel, sans régression vers le lecteur public.
- Suppression de la bascule tardive automatique du lecteur officiel Premium vers un flux direct découvert par le bridge : cela pouvait interrompre une chaîne déjà en lecture et provoquer un HTTP 502.
- Le média découvert par le bridge peut être mémorisé, mais il ne remplace jamais le lecteur actif sans action utilisateur.
- Le catalogue principal reste celui de LiveWatch (`/api/v1/public/all`) et ne fusionne pas DaddyTV/NorthTV/FrameTV.

## Logos des chaînes

- Le rafraîchissement de logos s'applique à **LiveWatch, WiTV et OHA**.
- Lorsque le rafraîchissement est demandé, un logo IPTV-org fraîchement associé devient prioritaire ; l'URL du fournisseur reste disponible en secours.
- Meilleure normalisation des noms (pays, HD/FHD/UHD, TV/chaîne, beIN, ordinaux, etc.).
- Rafraîchissement asynchrone rapide pour ne pas ralentir l'ouverture du catalogue.

## OHA — oha.cx

- `oha.cx` reste la racine primaire.
- Correction du problème visible en v82 : le deep-link `/watch?live=…` pouvait afficher la page **NOT FOUND / That route doesn't exist**.
- Noctra charge maintenant en premier la route stable `/live`, puis ne teste les variantes de deep-link qu'en complément.
- Le bridge reçoit désormais le **nom et l'identifiant de la chaîne** et sélectionne automatiquement la chaîne dans le vrai client OHA `/live` :
  - correspondance par `data-*` / identifiant lorsque disponible ;
  - correspondance par nom normalisé ;
  - utilisation de la recherche de la page OHA si nécessaire.
- Le vrai client OHA reste responsable de la génération de ses signatures ; Noctra relaie ses appels/cookies/médias.
- En parallèle, un flux public résolu dans un budget court peut toujours être utilisé directement lorsqu'OHA le fournit réellement.

## Dock utilisateur

- Neutralisation complète des transitions, transforms, filtres, pseudo-éléments et micro-animations au survol/focus sur le dock utilisateur.

## Demandes Jellyseerr / Seerr

### Limite de demandes en attente

- Maximum **10 demandes simultanément en attente par utilisateur**.
- Seules les demandes `PENDING` comptent dans la limite.
- Une demande approuvée, refusée ou annulée libère immédiatement une place.
- Exemple : 10 en attente → aucune nouvelle demande ; une passe approuvée → 9 en attente → une nouvelle demande redevient possible.
- Les administrateurs ne sont pas soumis à cette limite Noctra.

### Gestion des demandes

- Vue enrichie des demandes avec état `En attente / Approuvée / Refusée`.
- Administrateur :
  - approuver ;
  - refuser ;
  - supprimer individuellement ;
  - **effacer en un clic toutes les demandes encore en attente**.
- Utilisateur : annulation de ses propres demandes encore en attente.
- L'interface affiche le compteur `X / 10 demandes en attente` et les places restantes.

### Suggestions plus intelligentes

- Enrichissement du score avec plusieurs signaux :
  - tendances du jour ;
  - tendances de la semaine ;
  - prochaines sorties cinéma ;
  - séries actuellement diffusées ;
  - contenu cinéma / séries des plateformes de streaming ;
  - consensus : un titre remontant dans plusieurs signaux reçoit davantage de poids.
- Enrichissement des suggestions avec les **plateformes légales disponibles en France** lorsqu'elles sont connues.
- Conservation de la personnalisation déjà issue des médiathèques / affinités.
- **Vérification Prowlarr / trackers conservée** avant de mettre une suggestion en avant comme récupérable.

## Version / cache

- Version : `83.0.0`
- Cache PWA : `noctra-shell-v83`
- Marqueur TV : `NOCTRA · TV EN DIRECT · v83`
- `/health` et `/api/config` annoncent `83.0.0`.

## Vérifications

- `node --check server.mjs`
- `node --check public/noctra-shell.js`
- `npm run check`
- `npm test`
- tests TV : LiveWatch VIP, OHA, WiTV, qualité HLS, absence de bascule automatique, fullscreen
- tests dock utilisateur
- tests de quota et gestion Jellyseerr
- tests suggestions / tendances / plateformes légales
- extraction du ZIP final dans un dossier vierge et nouvelle exécution de la suite de tests
