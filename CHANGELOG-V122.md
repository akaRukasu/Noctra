# Noctra V122

- TV iOS : LiveWatch principal privilégie de nouveau le HLS natif Apple afin de restaurer le plein écran système et rendre le Picture in Picture possible ; HLS.js reste un secours sur le même flux.
- TV mobile : ajout d’un bouton Picture in Picture pour les flux directs Noctra et tentative automatique lors du passage de Noctra en arrière-plan.
- Plein écran : le mode de présentation vidéo WebKit natif est tenté avant le fullscreen d’élément/pseudo-fullscreen.
- OHA : la vraie page publique `/watch?live=<hash>` fournie par le catalogue est désormais prioritaire ; `ids.id` n’est utilisé que s’il ressemble réellement à un hash public. `/live` et `/` restent des fallbacks. Cela vise le `NOT FOUND` observé notamment sur DAZN 1.
- LiveWatch alternatives : les embeds officiels documentés utilisent `no-referrer` pour réduire les blocages de hotlink sans modifier les étapes imposées par le fournisseur.
- Téléchargements : la suppression torrent est fiabilisée sur iOS avec un gestionnaire local au dialogue, un message d’erreur visible et support des info-hash BitTorrent v2 (64 hex) en plus des v1 (40 hex).
- Cache PWA / version client-serveur alignés en V122.
