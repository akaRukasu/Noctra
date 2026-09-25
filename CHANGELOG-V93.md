# Noctra Media Client v93 — TV playback safety

## Objectif

La v92 avait nettement amélioré la fluidité générale mais son profil HLS expérimental a dégradé la stabilité de certains flux. La v93 garde les gains de performances de la v92 et revient volontairement à une couche de lecture plus simple, proche de la v91 qui était plus stable en conditions réelles.

## TV

- restauration du cœur HLS v91 : `lowLatencyMode: true`, `backBufferLength: 30`, `maxBufferLength: 45` ;
- restauration des timeouts v91 (`manifestLoadingTimeOut: 20 s`, `fragLoadingTimeOut: 25 s`) ;
- une seule reprise réseau du même flux et une seule récupération média avant affichage de l'erreur ;
- suppression du watchdog externe v92 qui pouvait modifier `currentTime` ou relancer le loader pendant un stall ;
- suppression de `liveSyncMode: buffered`, `liveSyncDurationCount: 5`, `liveMaxLatencyDurationCount`, du gros buffer 60/90 s, de `maxBufferHole: .45`, des nudges renforcés et de l'ABR mémorisé par fournisseur ;
- HLS.js retrouve donc la responsabilité de sa propre détection des trous/stalls au lieu d'être piloté en parallèle par Noctra ;
- aucune bascule automatique vers un autre serveur/source n'est réintroduite ;
- LiveWatch VIP, OHA, WiTV, le sélecteur de qualité et le chemin iOS ManagedMediaSource/native fallback restent inchangés.

## Performance

Toutes les optimisations de fluidité v91/v92 sont conservées : virtualisation des gros catalogues TV, refresh sans remontage du lecteur, scroll desktop natif, suppression des flous coûteux, `content-visibility`, isolation des cartes, suspension du rendu Jellyfin derrière les panneaux Noctra et regroupement des recalculs de viewport.

## Tests

- `npm run check`
- suite `npm test`
- nouveau test `v93-tv-playback-safety.mjs` vérifiant que les mécanismes HLS agressifs de v92 ont bien disparu et que le profil v91 est restauré ;
- test d'héritage v92 vérifiant que les optimisations desktop restent actives.
