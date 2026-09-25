# Notes de test Noctra v169

## Valide

- `npm run check` : syntaxe serveur et client valide.
- `npm test` : suite complete validee.
- Ordinateur 1920 x 1050 : dock superpose, titre degage et ligne coloree separee.
- Mobile 390 x 844 : grille `Mes medias` en deux colonnes et titres sans debordement.
- Regressions statiques ajoutees pour l'image authentifiee, la reconstruction DOM Jellyfin et le profil FSTV/WiTV.

## A confirmer apres installation

- L'affichage des quatre images reelles `Mes medias` doit etre confirme avec la session Jellyfin de l'installation, qui n'est pas disponible dans l'environnement de test local.
- Un match FSTV/WiTV doit etre laisse en lecture prolongee. Le tampon reduit les variations du fournisseur mais ne peut pas compenser une interruption complete du serveur source.
