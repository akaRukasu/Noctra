# Noctra v120 — restauration globale des lecteurs LiveWatch

Base : **v119 Server Safe**.

## Cause de la régression

Les dernières versions déterminaient encore trop souvent la famille d’un lecteur à partir de la forme de son `embed_url`. Or plusieurs endpoints LiveWatch peuvent renvoyer des wrappers qui ressemblent à `/embed/<id>` sans être le catalogue LiveWatch principal. Daddy TV, NorthTV, Sports, Football Live et BossTV pouvaient ainsi être reclassés à tort en lecteur Premium principal et envoyés vers le bridge VIP, d’où l’état permanent `initialisation VIP…`.

## Routage par source API

- La source sélectionnée devient la vérité pour le mode de lecture.
- **Seul `livewatch-curated`** (catalogue LiveWatch principal) peut utiliser le resolver VIP principal.
- **Daddy TV / NorthTV / FrameTV** utilisent leur `embed_url` officiel directement.
- **Sports / Football Live / BossTV / JackTV / Matchs du jour** restent des embeds/pages officiels et ne sont plus reclassés en `/embed` principal à cause de la forme de leur URL.
- OHA et WiTV ne sont pas modifiés.

## LiveWatch principal

- Retour au comportement stable de v112 : lorsqu’un direct Premium est résolu par `liveWatchStreamReference`, il est proposé immédiatement au lecteur HLS réel.
- Suppression du pré-test réseau `validateLiveWatchStreamReference` dans le chemin de décision principal : ce test pouvait rejeter une URL HLS que Safari/HLS.js savait pourtant lire, puis forcer le bridge iframe bloqué.
- Si aucun direct Premium n’est résolu, l’embed officiel public devient le premier secours automatique au lieu de rester indéfiniment sur `initialisation VIP…`.
- Le bridge VIP officiel reste disponible comme choix secondaire manuel.

## Cache / iOS

- Version client/serveur : `120.0.0`.
- `noctra-shell.js`, `noctra-theme.css`, manifeste et service worker passent tous au cache-buster **v120**.
- Cache PWA : `noctra-shell-v120`.
- Cela évite qu’un iPhone/iPad conserve un shell plus ancien alors que le serveur a déjà été mis à jour.

## Validation

- `node --check server.mjs` : OK.
- `node --check public/noctra-shell.js` : OK.
- Suite complète `npm test` : OK.
- Nouveau test : `v120-livewatch-source-routing.mjs`.
