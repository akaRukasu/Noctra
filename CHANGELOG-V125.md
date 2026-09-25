# Noctra v125

## TV — Daddy TV / NorthTV / FrameTV

- Corrige le blocage « Reconnexion au même flux… » introduit par le resolver Premium alternatif.
- Seul le catalogue LiveWatch principal utilise désormais le resolver HLS/VIP direct.
- Daddy TV, NorthTV et FrameTV utilisent systématiquement leur `embed_url` officiel exact renvoyé par l’API LiveWatch.
- Le client écrase aussi les anciens champs `vipPlayback` / `resolverUrl` qui pourraient rester dans un catalogue Safari/PWA mis en cache.
- Les univers Sports/Football Live/BossTV/JackTV/Matchs du jour conservent eux aussi leurs embeds officiels.
- Le VIP principal LiveWatch, OHA, WiTV, le profil réseau faible v124 et les autres correctifs récents restent inchangés.

## Important

La documentation publique LiveWatch présente DaddyTV/NorthTV/FrameTV comme des lecteurs `embed_url` avec leur propre étape intégrée. Noctra ne fabrique plus de route HLS privée non documentée pour ces trois catalogues.
