# Noctra v119

- Alignement de toutes les intégrations LiveWatch sur la documentation publique `livewatch.top/docs`.
- Daddy TV, NorthTV et FrameTV utilisent désormais directement leur `embed_url` officiel LiveWatch : aucun faux HLS direct et aucun bridge VIP expérimental imposé à ces trois familles.
- FrameTV reste entièrement piloté par son embed officiel, qui effectue lui-même la résolution HLS côté LiveWatch.
- Football Live, BossTV et les autres wrappers Sports opaques restent des embeds LiveWatch directs ; Noctra ne tente plus de convertir une page sportive générique en flux direct.
- Le VIP partagé Noctra est limité au lecteur LiveWatch principal `/embed/<id>`, déjà validé et stable.
- L'interface mobile indique clairement l'étape intégrée à valider pour Daddy TV / NorthTV / FrameTV, et signale les chaînes NorthTV `LIVE DURING EVENTS` comme potentiellement hors diffusion.
- Endpoints intégrés conservés : `/all`, `/daddy/channels`, `/north/channels`, `/frame/channels`, `/sports`, `/football`, `/bosstv`, `/jacktv/matches`, `/sports/daily`.
- Ordre Chaînes conservé : LiveWatch, OHA, NorthTV, WiTV, Daddy TV, FrameTV.
