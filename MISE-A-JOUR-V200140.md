# Noctra 200.0.140 — serveur des applications

Cette version réunit la branche `production` (jusqu'à 200.0.137 : LiveWatch sur livewatch.icu, comptes et relais LiveWatch, chaînes réunies) et les fonctions serveur utilisées par les applications iPhone, Android et Noctra TV.

## Ajouté côté serveur
- **Stockage de la seedbox** (`/api/files/storage`, administrateurs) : quota du compte, disque, taille des médiathèques.
- **Déplacement de dossiers** (`/api/files/move`) et changement du dossier d'un film ou d'une série (`/api/servarr/move`, `/api/servarr/rootfolders`).
- **Destinations des demandes** : dossier proposé selon la catégorie (films, séries, animés, films d'animation), validation d'une demande avec son dossier.
- **Recherche sur les trackers** plus patiente (`patient=1`, jusqu'à 1 minute).
- **Variantes LiveWatch d'une chaîne** (`/api/tv/livewatch/variants/…`) listées dans les applis.
- **LiveWatch VIP** : nouvel essai en se présentant comme le lecteur officiel dans un navigateur quand LiveWatch refuse (401/403).
- **Diagnostic LiveWatch VIP** : chaîne choisie (`?ref=`), réponse exacte de l'API LiveWatch (code, en-têtes, jetons masqués) et adresses d'API du lecteur officiel.
- **Diffusion TV** (`/api/tv/cast`) et interface Noctra TV (`/tv-app/`) avec le multiview piloté depuis le téléphone.

## Installation
Comme d'habitude : `noctra-update noctra-media-client-v200.0.140.zip` (le `.env` et `runtime/` sont conservés, retour arrière automatique en cas d'échec). Vérification : `/health` répond `"version": "200.0.140"`.

Attention : le déploiement automatique installe chaque nouveau commit de la branche `production`. Tant que cette version n'est pas publiée sur `production`, un prochain commit sur `production` la remplacerait.
