# Noctra 200.0.109 — relais TV plus stable

## Constat
Dans le diagnostic LiveWatch · VIP · CABLE, les segments durent environ 11 s en FHD. Le client ne recevait souvent un segment que 8 à 16 s après le précédent, avec une estimation de débit d'environ 2,6 Mbit/s.

Côté seedbox, le préchargement des segments (`lib/tv-segment-cache.mjs`) avait deux limites :
- **Délai trop court** : un préchargement était coupé après 6 s fixes, ce qui ne suffit pas pour un segment FHD de 11 s venant d'un fournisseur lent. Le segment n'était alors jamais disponible en mémoire.
- **Double téléchargement** : quand le lecteur demandait un segment encore en cours de préchargement, Noctra attendait 120 ms, abandonnait le téléchargement puis recommençait le même segment de zéro. Deux téléchargements pour un segment, et le lecteur attendait plus longtemps.

## Corrections
- **Délai proportionnel** : le délai de préchargement vaut 1,5 × la durée annoncée du segment, entre 6 et 20 s. Un segment de 11 s dispose donc de 16,5 s.
- **Attente utile** : si un préchargement reçoit encore des données quand le lecteur demande le segment, Noctra le laisse finir, 5 s au maximum. Cette limite reste sous les délais du lecteur (10 s sans octet pour Shaka et HLS.js). Un téléchargement bloqué, qui ne reçoit plus rien, est toujours abandonné tout de suite, comme avant.
- **Limites mémoire** : jusqu'à 20 Mo par segment (12 Mo auparavant) et 96 Mo au total (64 Mo auparavant), toujours avec expiration après 30 s.

Rien ne change côté lecteur : réserve, moteurs, choix du serveur et corrections Shaka de la 200.0.108 restent les mêmes.

## Validation
- Nouveau test `tests/v200109-segment-relay.mjs`. Il vérifie qu'un segment long n'est plus coupé et que le délai reste borné. Il vérifie aussi qu'un segment en cours de réception n'est téléchargé qu'une fois, qu'un téléchargement bloqué est abandonné vite et que l'attente reste limitée.
- Le test historique du cache (`v200050-seedbox-cache`) et l'ensemble de `npm run test:v200109` (qui inclut `test:v200108`) réussissent.

## À vérifier sur le serveur
Dans un nouveau diagnostic, les segments devraient arriver plus régulièrement (`lastSegmentAgeMs` plus bas lors des `shaka-buffering`) et l'estimation de débit devrait augmenter, grâce aux segments servis depuis la mémoire de la seedbox.
