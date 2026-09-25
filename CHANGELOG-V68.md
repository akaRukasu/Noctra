# Noctra v68

## Dock
- Restauration du dock horizontal complet dans une seule capsule sur PC.
- Neutralisation des anciens styles du dock compact qui laissaient les actions en `position:absolute` hors du cadre.
- Largeur calculée sur le contenu réel, donc compatible avec les boutons supplémentaires administrateur.
- Dock masqué pendant la lecture vidéo ; comportement membre/admin conservé.

## LiveWatch
- L'embed officiel LiveWatch est désormais lancé immédiatement, même avec le VIP actif.
- Le pont VIP direct devient une amélioration asynchrone : s'il fournit un flux valide, Noctra bascule automatiquement vers le lecteur natif ; s'il échoue ou ralentit, l'embed déjà chargé continue de fonctionner.
- Délai de résolution VIP directe réduit et aucune erreur du pont VIP ne bloque la chaîne.
- Catalogue principal affiché en priorité ; DaddyTV, NorthTV et FrameTV enrichissent ensuite le cache en arrière-plan.
- Enrichissement des logos entièrement non bloquant.

## OHA
- Suppression de l'attente `Promise.allSettled` de tous les serveurs.
- Sélection du premier serveur valide avec `Promise.any` sur les six priorités.
- Les autres serveurs restent accessibles et sont résolus seulement lorsqu'ils sont choisis.
- Délai par serveur réduit, en-têtes Referer/Origin ajoutés et lecture des réponses JSON imbriquées renforcée.

## WiTV
- Aucun changement du chemin de lecture natif actuellement fonctionnel.

## Cache / version
- Version serveur, PWA, manifeste et client portée à `68.0.0`.
- Cache `noctra-shell-v68`.
