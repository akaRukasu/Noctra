# Notes de test Noctra v170

## Valide

- `npm run check` : syntaxe serveur et client valide.
- `npm test` : suite complete validee.
- Test reel avec le `.env` fourni : `/api/libraries` repond sans jeton utilisateur explicite et expose les 4 images `Mes medias`.
- Test reel des images proxy : `Films`, `Series`, `Films D'animations` et `Animes` repondent `200 image/png`.

## Diagnostic

- Les vues Jellyfin possedent bien une image primaire.
- Le blocage venait du chemin d'authentification et du manque de secours lorsque la session navigateur n'etait pas encore disponible au moment de reconstruire l'accueil.
