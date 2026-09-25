# Noctra v114 — Lecture des familles LiveWatch + ordre des sources TV

Base : **v113**. Cette version conserve les correctifs v112/v113 (LiveWatch VIP, Sports, OHA SPA, plein écran iOS) ainsi que toute la partie Demandes v110/v111.

## Lecture Daddy TV / NorthTV / FrameTV sur iPhone/iPad

- Correction du problème visible sur iOS où le bouton **VIP Premium · direct** pouvait afficher `The operation is not supported` puis laisser le lecteur sur `Flux indisponible`.
- La cause était côté client : le chemin HLS.js / ManagedMediaSource utilisé avec succès par LiveWatch n'était activé que lorsque le nom visible du fournisseur était littéralement `LiveWatch` ou `OHA`.
- Les familles **Daddy TV**, **NorthTV** et **FrameTV** sont pourtant déjà marquées `vipPlayback` et utilisent le même tunnel Premium côté Noctra.
- En v114, `vipPlayback` devient donc le signal de référence : toute famille Premium LiveWatch tente **HLS.js / ManagedMediaSource en premier sur iOS**, puis WebKit natif uniquement en secours.
- La reprise automatique du **même direct Premium** après une erreur fatale est également étendue à Daddy TV / NorthTV / FrameTV, avec au maximum un renouvellement et sans changer de chaîne, de source ou de serveur.
- Les messages d'état et diagnostics indiquent maintenant le fournisseur réellement sélectionné.

## Ordre des sources dans « Chaînes »

L'ordre est désormais fixé explicitement à :

1. **LiveWatch**
2. **OHA**
3. **NorthTV**
4. **WiTV**
5. **Daddy TV**
6. **FrameTV**

Le libellé de la source `DaddyTV` devient **Daddy TV** dans la navigation, sans changer sa famille technique `daddy` ni son endpoint.

## Régressions / cache

- Cache PWA passé à `noctra-shell-v114`.
- Cache-busters du shell, du thème et du manifeste passés en v114.
- Les correctifs plein écran iOS v112 et OHA v113 sont conservés.
- Nouveau test de régression : `v114-tv-family-ios-order.mjs`.
- Toute la suite de tests Noctra et les vérifications syntaxiques Node passent.

Version : `114.0.0`  
Cache PWA : `noctra-shell-v114`
