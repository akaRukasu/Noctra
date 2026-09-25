# Noctra v118

## TV — Daddy TV / NorthTV / FrameTV

- Corrige la cause structurelle de l’écran noir du bridge Premium : les iframes LiveWatch préparées sont sandboxées sans `allow-same-origin`, donc leurs scripts/assets/fetch ne reçoivent pas le cookie `noctra_session`.
- Chaque ouverture Premium reçoit désormais une référence aléatoire et temporaire `livewatch-bridge`. Les routes `embed/site/http` de ce lecteur peuvent fonctionner dans le sandbox opaque sans ouvrir l’accès aux autres API Noctra.
- Le vrai bearer/refresh LiveWatch reste exclusivement côté serveur ; aucun jeton Premium n’est exposé aux utilisateurs Noctra.
- Daddy TV, NorthTV et FrameTV repassent par le lecteur officiel LiveWatch authentifié lorsque le VIP partagé est actif.
- Le lecteur public avec publicités reste un secours manuel explicite.
- NorthTV affiche un diagnostic plus clair pour les chaînes marquées `LIVE DURING EVENTS` qui ne fournissent aucun média après attente.

## Conservé

- LiveWatch principal : direct Premium vérifié prioritaire.
- Ordre des sources : LiveWatch → OHA → NorthTV → WiTV → Daddy TV → FrameTV.
- Correctifs iOS / plein écran / OHA et partie Demandes des versions précédentes.
