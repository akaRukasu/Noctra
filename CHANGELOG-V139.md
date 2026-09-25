# Noctra Media Client V139

## Bandeau

- Hauteur mobile réduite de 72 à 68 px, avec zones tactiles de 42 px conservées.
- Menus Cast et SyncPlay repositionnés sous la nouvelle hauteur.
- Dimensions desktop figées à 44 px au repos, au survol et au focus pour supprimer le décalage du groupe droit.
- Transitions et animations désactivées sur ces commandes de bandeau.

## TV

- Tous les corps de réponse média distants passent désormais par `pipeline` avec gestion d'erreur.
- Une fermeture amont prématurée coupe uniquement la réponse du lecteur au lieu de provoquer une erreur `Readable` non gérée et un redémarrage de Noctra.
- Suppression du préchauffage serveur de 64 logos lancé avec le catalogue.
- Priorité immédiate limitée aux 8 premiers logos, puis anticipation de 12 lignes supplémentaires ; les autres restent paresseux.

## Version

- Client, serveur et API : `139.0.0`
- Cache PWA : `noctra-shell-v139`
