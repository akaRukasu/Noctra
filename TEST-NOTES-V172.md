# Tests Noctra v172

## Automatises

- `npm run check`
- `npm test`
- Test de regression v172 pour les images persistantes, les carrousels natifs et le profil HLS commun.

## Visuels

- Chargement des quatre images reelles `Films`, `Series`, `Films D'animations` et `Animes` via `/api/libraries`.
- Verification de quatre sources distinctes, toutes chargees en 960 px.
- Suppression volontaire des quatre couvertures pour simuler un rerendu Jellyfin, puis verification de leur recreation complete.
- Verification de l'absence de titres en double quand les images sont chargees.
- Verification du mouvement droite puis gauche d'un carrousel avec le gestionnaire Jellyfin laisse prioritaire.

## TV

- Inspection de la playlist FSTV : fenetre de six segments de quatre secondes.
- Profil principal applique a tous les fournisseurs de la vue `Chaines`.
- Les tests historiques des resolvers, reprises reseau, controles desktop, iOS et Multiview restent actifs.
