# Noctra v160

## Correctifs

- Alternative : la source se limite désormais à la section `1.1) Liens direct streaming Live TV de chaines TV Sport 24/24` de Haloule.
- Alternative : les liens d'applications, navigateurs, stores, VPN, cast, téléchargements et pages hors diffusion ne sont plus transformés en chaînes.
- Alternative : les lecteurs directs résolus derrière Clictune/Dlink sont ouverts sans sandbox côté lecteur Noctra afin d'éviter l'erreur `SANDBOX IFRAME NOT ALLOWED` observée sur Cartelive.
- Médiathèque : les cartes `Mes médias` recopient le titre au-dessus de l'image, ce qui remet notamment `Animes` même si l'image personnalisée ne contient pas de texte.
- Interface : ajout d'une déclaration locale Material Icons pour éviter les boutons rendus en carrés quand la police n'est pas chargée par le client.
- Demandes utilisateur : mise à jour des tris Jellyseerr/Overseerr (`created`, `displayname`) pour corriger l'erreur API 400 liée à l'ancien tri `added`.

## Tests

- `npm run check`
- `npm test`
- Contrôle réseau Haloule public : section 1.1 détectée, 62 liens directs trouvés, de Canal+/BeIN/RMC/Eurosport aux chaînes Trace/BBlack.

## Version

- Client/serveur/PWA passent en `160.0.0` / `noctra-shell-v160`.
