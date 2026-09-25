# Noctra v115

## TV — Daddy TV / NorthTV / FrameTV

- Corrige la boucle de lecture observée sur iPhone/iPad avec les alternatives LiveWatch.
- Daddy TV, NorthTV et FrameTV utilisent désormais **le lecteur VIP officiel LiveWatch en priorité**.
- Le chemin HLS direct alternatif n’est plus affiché simplement parce que l’API renvoie une URL : Noctra vérifie maintenant qu’il atteint réellement une ressource média avant de l’exposer.
- Lorsqu’un direct alternatif passe cette validation, il reste disponible comme second choix (`VIP Premium · direct vérifié`).
- Sur mobile, Noctra ne remplace plus immédiatement l’iframe officielle Daddy/North/Frame par le premier média détecté ; cela évite la boucle `Reconnexion au même flux…` / flux incompatible.
- LiveWatch principal conserve son comportement direct vérifié en priorité.
- Les statuts de lecture utilisent désormais le vrai nom du fournisseur (`Daddy TV`, `NorthTV`, `FrameTV`) au lieu du libellé générique LiveWatch.

## Conservé

- Ordre Chaînes : LiveWatch → OHA → NorthTV → WiTV → Daddy TV → FrameTV.
- Correctifs iOS plein écran / reprise LiveWatch v112.
- Routes OHA et intégration Sports v113.
- Responsive Demandes et fiches média v110-v111.
