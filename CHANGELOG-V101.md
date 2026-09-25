# Noctra v101 — LiveWatch Stable Route

## Correctif ciblé LiveWatch

- WiTV et OHA ne sont pas modifiés : leur lecture reste sur le chemin validé en v100.
- Le lecteur Premium direct LiveWatch n'utilise plus comme URL principale un token Noctra figé vers une URL CDN potentiellement éphémère.
- Nouvelle URL stable par chaîne : `/api/tv/livewatch/stream/<kind>/<id>`.
- Le resolver Premium est renouvelable pendant les rafraîchissements HLS sans changer de chaîne, de fournisseur ou de serveur.
- Cache de l'URL Premium réduit de 45 s à 6 s afin de ne pas conserver trop longtemps une URL signée courte durée.
- En cas de 401/403/404/410/429/502/503/504 avant l'envoi de la réponse, Noctra invalide une fois le resolver de cette chaîne et retente la même source.
- Les références LiveWatch gardent maintenant l'identité de la chaîne (`liveWatchKind` / `liveWatchId`) pour les diagnostics et évolutions futures.
- Aucun changement automatique vers le lecteur public ou un autre fournisseur n'est ajouté.

## Préservé

- Multiview, mode cinéma, workspaces, torrents live, Discovery et optimisations de fluidité v100.
- Archive Server Safe sans lanceurs Windows.

Version : `101.0.0` / cache PWA `noctra-shell-v101`.
