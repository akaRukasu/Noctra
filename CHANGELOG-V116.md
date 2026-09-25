# Noctra v116

Base : **v115 Server Safe**.

## TV — Daddy TV / NorthTV / FrameTV

- Les trois catalogues alternatifs sont désormais traités comme **embed-only** : le resolver VIP ne tente plus d'inventer ou de sonder un chemin HLS direct pour `daddy`, `north` ou `frame`.
- Le direct Premium vérifié reste réservé à **LiveWatch principal** (`kind=main`).
- Le chemin primaire des alternatives est le **lecteur officiel LiveWatch authentifié par le bridge Noctra**.
- Le routeur SPA du lecteur voit maintenant son vrai pathname distant pour les familles alternatives (`/embed/daddy/...`, `/embed/north/...`, `/embed/frame/...`).
- Les `<video>`, `<audio>` et `<source>` déjà présents dans le HTML initial sont relayés côté serveur avant le boot de l'application LiveWatch ; le bridge les revérifie également au binding JavaScript.
- Protection contre le double-proxy d'une URL Noctra déjà réécrite.
- Le chargement de l'iframe n'est plus assimilé à tort à un état `playing` : le HUD reste en chargement jusqu'à un vrai signal média/lecture.

## Conservé

- Ordre Chaînes : LiveWatch, OHA, NorthTV, WiTV, Daddy TV, FrameTV.
- Reprise iOS et plein écran v112.
- Correctifs OHA et Sports v113.
- Responsive Demandes v110/v111.

## Validation

- `npm run check` : OK.
- Suite complète `npm test` : OK, avec le nouveau test `v116-tv-alt-iframe-bridge.mjs`.
