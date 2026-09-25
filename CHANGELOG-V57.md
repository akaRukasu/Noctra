# Noctra v57

## TV — finition PC, tablette et mobile

### Dock membre
- Dock utilisateur ramené à quatre cellules fixes : Accueil, Médiathèques, Demandes et TV.
- La plaque active reste centrée derrière l’icône et ne pousse plus les autres raccourcis.
- Les commandes administrateur restent séparées du dock membre.

### Sports repliable
- La section Sports est masquée par défaut dans TV.
- Un bouton compact `Afficher Sports` permet de l’afficher à la demande.
- L’état est mémorisé localement sur l’appareil.

### Sources TV et esthétique
- Bouton `Ajouter une source` compact et réservé aux administrateurs.
- Navigation TV, cartes de sources, lecteur, filtres et liste des chaînes resserrés.
- Mise en page responsive revue pour desktop, tablette, portrait et paysage mobile.
- Les avertissements de fournisseur utilisent désormais une carte informative neutre au lieu d’un bloc d’erreur agressif.

### Logos LiveWatch / TV
- Les logos distants continuent de passer par le proxy Noctra.
- Le proxy réessaie les hôtes refusant le Referer, accepte les MIME génériques et détecte PNG/JPEG/GIF/WebP/SVG depuis le contenu.
- Lorsqu’un fournisseur ne fournit réellement aucun logo ou que l’image reste inaccessible, Noctra affiche un monogramme propre construit à partir du nom de la chaîne au lieu d’une image cassée.
- Lors de la fusion LiveWatch/DaddyTV/NorthTV/FrameTV, une source secondaire peut désormais compléter le logo manquant de la source prioritaire.

### OHA
- Noctra continue d’indexer les liens de chaînes publics trouvables sur `oha.cx/live`, ses scripts publics et ses endpoints publics de même origine.
- Une chaîne OHA découverte utilise désormais le même résolveur de lecteur public que WiTV : Noctra ouvre la page publique de la chaîne côté serveur et cherche les iframe/URLs de lecteur explicitement exposées.
- Le résolveur comprend aussi les URLs publiques sérialisées (`embed_url`, `player_url`, `iframe_url`, etc.) et les sources `<video>`/`<source>`.
- Si OHA ne rend pas son catalogue/lecteur accessible au serveur autrement que par son application JavaScript, le portail reste le repli. Aucun jeton privé, flux caché ou contournement d’accès n’est extrait.

## Technique
- Version serveur/PWA : `57.0.0`.
- Cache service worker renouvelé : `noctra-shell-v57`.
- Tests statiques, grilles, responsive et syntaxe Node validés.
