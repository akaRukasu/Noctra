# Noctra v113 — TV LiveWatch / Sports / OHA

Base : **v112**. Cette version ne modifie pas la logique Demandes de la v111/v110 et conserve les correctifs iOS LiveWatch / plein écran de la v112.

## LiveWatch : nouvelles sources Chaînes

- Ajout de **DaddyTV**, **NorthTV** et **FrameTV** comme sources séparées dans `Chaînes`.
- Les trois catalogues sont lus depuis les endpoints publics publiés par LiveWatch et ne sont pas fusionnés dans le catalogue LiveWatch principal.
- Chaque carte garde son nom de fournisseur réel (`DaddyTV`, `NorthTV`, `FrameTV`).
- Lorsqu'un lecteur appartient à une famille LiveWatch connue, il utilise le chemin Premium déjà sécurisé côté serveur.

## Sports : VIP Premium étendu aux lecteurs officiels LiveWatch

- Les événements Sports qui utilisent un wrapper officiel `livewatch.top` mais pas une ancienne route `/embed/<famille>/<id>` passent maintenant eux aussi par le bridge Premium Noctra.
- Une référence opaque courte durée remplace l'URL du wrapper dans l'API Noctra.
- Pour ces wrappers génériques, Noctra **n'invente pas de route HLS Premium** : le lecteur officiel LiveWatch authentifié reste le chemin principal.
- Sur mobile, si le lecteur officiel découvre un média compatible, le handoff vers le lecteur natif Noctra reste disponible.
- Le client reconnaît le bridge Premium même quand le fournisseur visible est DaddyTV, NorthTV ou FrameTV et non littéralement `LiveWatch`.
- Le bearer/refresh Premium reste côté serveur. Il n'est jamais transmis à un hôte tiers ; seules les pages officiellement hébergées par LiveWatch peuvent utiliser le contexte VIP.

## OHA : correction des routes `NOT FOUND`

- Le bridge OHA traite désormais explicitement le site comme une **SPA**.
- Avant le démarrage des scripts OHA, Noctra virtualise le pathname distant (`/live`, `/`, etc.) avec `history.replaceState` afin que le routeur OHA ne voie plus l'URL interne `/api/tv/oha/embed/...`.
- Noctra ne fabrique plus de deep-link public `?live=<id>` à partir de l’identifiant interne du catalogue OHA : le bridge ouvre `/live` puis sélectionne la chaîne par son id/nom.
- `/live` reste la route prioritaire et `/` devient un fallback officiel supplémentaire lorsque le fournisseur déplace ou redirige son espace Live TV.
- La sélection automatique de la chaîne reste active après chargement de la SPA.

## Sécurité / régressions

- Aucun élargissement des credentials LiveWatch vers des domaines tiers.
- Le direct Premium historique reste prioritaire pour les familles LiveWatch connues.
- Le lecteur public reste un secours manuel.
- Les correctifs v112 (reprise iOS du même direct, plein écran WebKit vérifié) sont conservés.
- Nouveau test de régression `v113-tv-livewatch-oha-routes.mjs`.

Version : `113.0.0`  
Cache PWA : `noctra-shell-v113`
