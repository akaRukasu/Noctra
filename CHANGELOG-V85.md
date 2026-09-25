# Noctra Media Client v85 — compatibilité TV iOS

## Objectif

Corriger le blocage des flux directs LiveWatch Premium et OHA sur iPhone/iPad sans changer automatiquement de serveur ni réécrire la logique WiTV.

## Lecture HLS sur iOS

- Sur iPhone/iPad, **LiveWatch** et **OHA** privilégient désormais HLS.js lorsqu'il est pris en charge par WebKit/ManagedMediaSource, au lieu de confier immédiatement le flux au moteur HLS natif Safari.
- Le bundle local HLS.js reste en version 1.6.16.
- Le flux/serveur sélectionné ne change jamais automatiquement : en cas d'échec HLS.js sur iOS, Noctra essaie uniquement **la même URL** avec le moteur HLS natif WebKit.
- Les réglages HLS.js spécifiques à iOS utilisent `preferManagedMediaSource` et `liveDurationInfinity`.
- WiTV conserve son ordre de lecture existant : le chemin iOS HLS.js forcé ne s'applique qu'à LiveWatch et OHA.

## Plein écran iPhone/iPad

- Le bouton plein écran reprend la vidéo dans le même geste utilisateur puis appelle immédiatement les API vidéo WebKit natives (`webkitEnterFullscreen`, variantes historiques, puis Presentation Mode).
- `playsinline` et `webkit-playsinline` restent explicitement présents sur le lecteur vidéo.
- Aucun changement de source ou de serveur n'est déclenché par le plein écran.

## Stabilité

- Une erreur réseau peut retenter une fois le même flux, mais ne change pas de lecteur/serveur.
- Une erreur HLS.js sur iOS peut seulement changer de **moteur de lecture** (HLS.js → WebKit natif) sur la même source.
- Les lecteurs desktop et le comportement WiTV conservent la logique précédente.

## Version / cache

- Version : `85.0.0`
- Cache PWA : `noctra-shell-v85`
- Marqueur TV : `NOCTRA · TV EN DIRECT · v85`

## Vérifications

- `npm run check`
- `npm test`
- test spécifique compatibilité TV iOS / ManagedMediaSource
- vérification du plein écran vidéo WebKit
- vérification de l'absence de bascule automatique de serveur
