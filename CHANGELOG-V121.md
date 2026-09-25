# Noctra v121

Base : **v120**.

## TV — alternatives LiveWatch

- Ajout d’un garde-fou côté client basé sur la **source réellement sélectionnée**.
- `NorthTV`, `Daddy TV`, `FrameTV`, `Sports`, `Football Live`, `BossTV`, `JackTV` et `Matchs du jour` passent désormais directement par leur `embed_url` officiel.
- Même si Safari/PWA conserve temporairement un ancien catalogue contenant `resolverUrl` / `vipPlayback`, ces champs sont neutralisés pour les alternatives avant toute tentative de lecture.
- Le resolver VIP principal reste réservé à la source **LiveWatch** principale.
- OHA et WiTV ne sont pas modifiés.
- Les libellés du lecteur et du bloc LiveWatch ne prétendent plus qu’une alternative utilise le bridge VIP principal lorsqu’elle suit son embed officiel.

## Radarr / Sonarr — sélection manuelle mobile

- La recherche interactive de releases et le sélecteur d’épisode sont maintenant ouverts dans un panneau de type `automation`, afin d’activer le responsive prévu pour ces vues.
- Sur mobile :
  - cartes de release en une colonne ;
  - titres très longs réellement cassables sur plusieurs lignes ;
  - métadonnées compactées ;
  - badge qualité contenu dans la largeur ;
  - bouton **Télécharger** en pleine largeur ;
  - suppression du débordement horizontal visible sur iPhone.

## Téléchargements qBittorrent — temps réel

- Correction de la course entre `setPanelBody()` et l’activation du polling : le timer était lancé avant l’insertion de `#noctra-downloads-view`, donc Noctra considérait le panneau comme fermé et annulait le rafraîchissement.
- Le polling démarre désormais **après insertion réelle du DOM**.
- Intervalle ramené à environ **1,1 s** lorsque le panneau Téléchargements est ouvert.
- Requêtes `/api/downloads` forcées en `no-store` avec cache-buster pour éviter les réponses intermédiaires mises en cache.
- Reprise immédiate du polling lors du retour au premier plan sur iOS/Safari/PWA.
- Les barres de progression, débit, ETA, sources et états peuvent donc évoluer sans actualisation manuelle.

## Cache / PWA

- Build client : `121.0.0`.
- Cache shell / thème / manifeste / service worker basculé sur **v121**.

## Validation

- `node --check public/noctra-shell.js` : OK.
- `node --check server.mjs` : OK.
- Suite complète `npm test` : OK, avec un test de non-régression dédié v121.
