# Noctra v164

## Correctifs

- Demandes utilisateur : remplacement du tri Jellyseerr `created` par `added`, compatible avec l'API qui refusait l'envoi avec une erreur 400.
- Interface : renouvellement des URLs de cache `noctra-shell`, `noctra-theme` et manifeste en `v164`.
- Interface : ajout d'un repli SVG pour les boutons d'en-tête Jellyfin lorsque la police Material Icons ne se charge pas correctement.
- Accueil : les vignettes de `Mes médias` sont forcées visibles et reutilisées en fond de carte lorsqu'elles arrivent en chargement différé.
- TV : profil HLS stable pour les connexions rapides mais sujettes aux micro-coupures.
- TV : le lecteur n'affiche plus `Connexion faible` sur un bon débit ; le statut devient `Mise en mémoire tampon` ou `Mode réseau prudent`.

## Profil TV stable

- Mode faible latence désactivé pour privilégier la stabilité.
- Tampon desktop porté à 90 s, avec plafond à 150 s.
- Tampon réseau prudent porté à 120 s, avec plafond à 180 s.
- Reprises HLS et tolérance aux trous de buffer augmentées.
- Estimation ABR desktop initiale réglée à 4 Mbps pour éviter les sauts de qualité trop agressifs.

## Tests

- `npm run check`
- `npm test`

## Version

- Client/serveur/PWA passent en `164.0.0` / `noctra-shell-v164`.
