# Noctra v162

## Correctifs

- Alternative : le lecteur intégré n'affiche plus de barre haute ni de bande basse permanente au-dessus de la vidéo.
- Alternative : ajout de contrôles flottants discrets pour `Ouvrir dehors` et le verrouillage des clics.
- Alternative : les clics dans le lecteur sont bloqués par défaut pour limiter les popups publicitaires ; le bouton `Clics bloqués` permet de les réactiver temporairement si les contrôles du lecteur sont nécessaires.
- Alternative : les chaînes sont triées par ordre alphabétique dans le catalogue.
- Interface : correction du chemin de la police Material Icons pour les installations servies sous `/noctra`, afin d'éviter le pop-up d'authentification navigateur et les icônes rendues en carrés.

## Tests

- `npm run check`
- `npm test`

## Version

- Client/serveur/PWA passent en `162.0.0` / `noctra-shell-v162`.
