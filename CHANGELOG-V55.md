# Noctra v55

## TV : recherche fiable et liste beaucoup plus fluide

- La recherche TV indexe désormais le nom de la chaîne, le groupe, le pays, la catégorie, le fournisseur, la compétition et les informations de programme.
- La liste n'injecte plus plusieurs milliers de chaînes dans le DOM d'un seul coup : 120 entrées sont rendues initialement puis chargées par lots avec `Afficher plus`.
- Le filtrage est temporisé très légèrement (70 ms) pour rester fluide pendant la saisie sur PC, mobile et tablette.
- Les cartes TV utilisent `content-visibility` afin de limiter le coût de rendu hors écran.
- Les catalogues TV et la liste des sources sont mis en cache côté client pour éviter les rechargements inutiles lors des changements de sous-menu.

## OHA Live

- La source intégrée pointe désormais directement vers `https://oha.cx/live`.
- Noctra tente de construire une liste structurée à partir des liens de chaînes publiquement exposés par la page Live TV.
- Lorsque le pays est explicitement présent dans le HTML, les entrées France sont privilégiées et triées A-Z.
- Si OHA construit toute sa liste dynamiquement et qu'aucun lien public de chaîne n'est récupérable côté serveur, Noctra repasse automatiquement sur la page publique `/live` dans le lecteur intégré au lieu d'afficher une source cassée.
- Aucun flux caché, jeton ou mécanisme privé du site n'est extrait.

## LiveWatch FR · US

- Le filtre géographique a été resserré : lorsqu'un pays est fourni par l'API, Noctra n'accepte plus que les pays francophones ciblés et les États-Unis.
- Pour les entrées sans pays, une liste de réseaux français et américains connus sert de repli afin d'éviter de conserver presque tout le catalogue mondial.

## Fluidité générale

- Les panneaux lourds (TV, découvertes, explorateur, téléchargements et automatisation) n'utilisent plus les View Transitions du navigateur lors de chaque remplacement de contenu ; cela évite les snapshots coûteux sur les grandes listes.
- Les animations légères Noctra restent actives.

## Permissions

- La consultation de la TV, des catalogues et la lecture sont accessibles à tous les membres Jellyfin authentifiés.
- Seuls les administrateurs peuvent ajouter ou supprimer des sources TV personnelles.

## Version

- Serveur / PWA : `55.0.0`.
