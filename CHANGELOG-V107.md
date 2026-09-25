# Noctra Media Client — Changelog V107

## Continuer à regarder — isolation et nettoyage par utilisateur
- La reprise est maintenant filtrée côté serveur à partir de la session Jellyfin authentifiée.
- Les éléments déjà marqués comme vus (`UserData.Played = true`) sont exclus, ainsi que les lectures sans position réelle ou pratiquement terminées.
- La réponse `/api/home/resume` renvoie l’identifiant de l’utilisateur propriétaire et interdit toute mise en cache intermédiaire.
- Le client vérifie que la réponse correspond toujours à l’utilisateur Jellyfin courant avant de l’afficher.
- La rangée native « Continuer à regarder » est réconciliée avec cette liste : les anciennes cartes vues/stales sont masquées et un changement de compte invalide le cache de reprise.

## Dock utilisateur
- Le dock desktop des comptes membres reprend exactement la même géométrie de base que celui de l’administrateur : même position, même hauteur et mêmes offsets.
- Le nombre réduit d’actions d’un membre ne décale plus le conteneur ni les icônes.
- Le comportement mobile existant reste inchangé.

## Version
- Passage de `200.0.106` à `200.0.107`.
