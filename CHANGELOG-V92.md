# Noctra Media Client v92 — Stabilité TV & fluidité globale

## Objectif

Cette version part directement de la v91 fonctionnelle. Elle ne change ni les fournisseurs TV, ni l'ordre des serveurs, ni la profondeur du contenu. Elle cible deux points : limiter les micro-coupures HLS sans bascule automatique et appliquer les optimisations de rendu de la v91 à l'ensemble de Noctra sur desktop.

## TV — profil stabilité

- `lowLatencyMode` désactivé pour les flux HLS lus par HLS.js : priorité à la continuité plutôt qu'à la latence minimale.
- Point de synchronisation live plus prudent (`liveSyncDurationCount: 5`) et plafond de retard (`liveMaxLatencyDurationCount: 12`).
- Tampon avant porté à 60 s, plafond à 90 s et back-buffer à 45 s.
- Tolérance accrue aux micro-trous (`maxBufferHole: .45`) et davantage de tentatives de nudge.
- ABR plus conservateur lors des montées en qualité afin de limiter les oscillations qui peuvent vider le buffer.
- Estimation de bande passante mémorisée par fournisseur pendant la session, puis réutilisée avec une marge prudente lors du zapping.
- Jusqu'à trois reprises sur une erreur réseau fatale, toujours sur exactement le même flux.
- Watchdog léger : si la tête de lecture reste bloquée sur un petit trou déjà bufferisé, Noctra effectue un micro-nudge ; si le tampon est vide, il demande à HLS.js de reprendre le chargement du même flux.
- Aucun retour de la bascule automatique vers un autre serveur/fournisseur.
- Le sélecteur manuel de qualité existant reste disponible.

## Fluidité globale desktop

- Le moteur de molette JavaScript est désactivé sur desktop : retour au scroll natif du navigateur, comme sur mobile.
- Les View Transitions internes Noctra ne sont plus utilisées sur desktop.
- Les animations de page entière Jellyfin sont neutralisées sur PC.
- Les `backdrop-filter` internes des panneaux Noctra sont neutralisés sur desktop afin de réduire les recompositions GPU.
- Quand n'importe quel panneau Noctra est ouvert, le rendu de `#reactRoot` Jellyfin situé derrière est suspendu avec `content-visibility:hidden`; le DOM et son état restent conservés.
- Les longues listes Noctra (demandes, fichiers, Arr, téléchargements, résultats d'identification) utilisent `contain` et `content-visibility:auto` hors écran.
- Les cartes Jellyfin conservent tout leur contenu mais isolent layout/paint afin qu'une mise à jour locale n'invalide pas toute la grille.
- Les mutations de Jellyfin en arrière-plan n'entraînent plus de rescans de route tant qu'un panneau Noctra est ouvert.
- Les recalculs lors d'un resize sont regroupés dans une seule frame.
- Les animations de translation/zoom au survol des cartes sont remplacées sur PC par des retours couleur/bordure plus légers.

## Contenu conservé

- Aucun catalogue TV réduit.
- Aucune recommandation Discovery retirée.
- Aucun changement de fournisseur TV.
- LiveWatch Premium, OHA, WiTV, qualité HLS, fullscreen, Jellyseerr/Seerr, TMDB, Prowlarr et les outils admin restent présents.

## Vérifications

- `npm run check`
- suite complète `npm test`
- test spécifique v92 sur le profil HLS stabilité
- validation des options contre la version HLS.js embarquée
- test de conservation de la profondeur Discovery
- tests TV historiques LiveWatch/OHA/WiTV/iOS
- tests responsive / Dashboard / Utilisateurs
