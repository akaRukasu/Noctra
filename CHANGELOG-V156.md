# Noctra v156

- OHA : suppression complète de l'ancien domaine `oha.to`. La source et le bridge utilisent uniquement `oha.cx`.
- FSTV : stabilisation du proxy HLS direct avec conservation des en-têtes HLS, CORS valide et chemin média stable pour limiter les erreurs réseau après démarrage.
- StreamSports99 : les lecteurs CDN Live TV ne sont plus intégrés comme iframes noires ; Noctra décode la playlist HLS publiée par le player et la relaie en flux natif.
- Streamed : le catalogue interroge maintenant les lecteurs publics `/api/stream/{source}/{id}` et expose les lecteurs `embed.st` disponibles, avec repli sur la page web si aucun lecteur n'est publié.
- Volkamax : les entrées BZH-Sport sont résolues via un bridge Noctra qui extrait le lecteur `embeds[]` ciblé au clic, au lieu d'afficher toute la page programme.
- Version : client/serveur/PWA passent en `156.0.0` / `noctra-shell-v156`.

Tests :

- `npm run check`
- `npm test`
