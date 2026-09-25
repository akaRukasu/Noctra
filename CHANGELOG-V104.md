# Noctra v104 — LiveWatch segments stables + compatibilité vidéo OHA desktop

## TV — LiveWatch

- Les variantes HLS stables de la v103 sont conservées.
- Les segments, parts LL-HLS, clés et init maps d’une media-playlist LiveWatch reçoivent désormais eux aussi une URL Noctra stable liée à la chaîne, à la variante et au `EXT-X-MEDIA-SEQUENCE`.
- À chaque rafraîchissement de playlist, Noctra met à jour en mémoire l’URL CDN/signée réellement associée au même segment stable.
- Si une ressource LiveWatch renvoie une erreur typique d’expiration (`401/403/404/410/429/502/503/504`), Noctra rafraîchit la media-playlist de la même chaîne et retente une seule fois la même ressource.
- Aucun changement automatique de chaîne, de serveur ou de fournisseur n’est introduit.
- Le lecteur HLS principal côté navigateur reste bit pour bit identique à celui de la v103 afin de ne pas réintroduire les régressions des anciens profils de buffer/watchdog.

## TV — OHA desktop

- Le symptôme « son présent mais image noire » est traité comme un problème de codec probable sur desktop : certains serveurs OHA peuvent annoncer du HEVC/H.265 que Safari/iOS décode alors que Chrome/HLS.js/MSE ne fournit pas toujours l’image.
- Sur desktop uniquement, Noctra sonde le master HLS des candidats OHA et préfère un serveur annonçant AVC/H.264 lorsqu’il en existe un.
- Un serveur HEVC-only n’est pas supprimé : si aucun candidat AVC n’est disponible, le client officiel OHA est placé devant ce flux risqué et le serveur HEVC reste accessible en secours.
- Le comportement mobile/iPhone/iPad reste inchangé.
- WiTV n’est pas modifié.

## Préservation

- Multiview, Cinéma, fullscreen, Torrents live, Discovery, Prowlarr, Jellyseerr et les optimisations de fluidité restent présents.
- Archive Server Safe : aucun composant Windows exécutable/script de lancement.
