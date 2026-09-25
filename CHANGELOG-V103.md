# Noctra v103 — LiveWatch HLS Desktop Refresh

- Corrige l’arrêt LiveWatch après ~15–20 s principalement observé sur PC/HLS.js.
- La route LiveWatch stable ne stabilise plus uniquement le master : chaque media-playlist/variante du master reçoit désormais une route stable liée à la chaîne (`/api/tv/livewatch/hls/...`).
- À chaque rafraîchissement de media-playlist, Noctra reprend le resolver Premium courant et retrouve la même variante dans le master fraîchement obtenu. Une URL CDN signée expirée n’est donc plus conservée pendant toute la session HLS.js.
- Les segments/keys sont toujours relayés par Noctra et bénéficient du transport streaming v94.
- Une réponse 401/403/404/410/429/502/503/504 avant envoi au navigateur invalide le resolver LiveWatch et retente une seule fois la même chaîne.
- Aucun fallback automatique vers un autre serveur/fournisseur.
- WiTV et OHA ne sont pas modifiés.
- Le lecteur client (buffers, HLS.js, iOS) n’est pas modifié : le correctif est côté serveur afin de préserver le comportement actuellement fonctionnel.
- Cache PWA et HLS local renouvelés en v103.
