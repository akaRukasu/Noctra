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

## 200.0.141
LiveWatch répond `403 {"code":"grant_required"}` : une autorisation de lecture est demandée avant le flux VIP. Le diagnostic (`/api/tv/livewatch/diagnostics?ref=…`) suit les morceaux du lecteur officiel chargés à la demande et rapporte les appels `rpc`, `functions.invoke`, tables, adresses d'API et extraits de code autour de « grant » et « stream ».

## 200.0.142
Autorisation de lecture LiveWatch : `POST https://livewatch.icu/api/play/grant` avec la session VIP (réponse `grant`, `tier`, `expires_in`), gardée en mémoire jusqu'à 2 minutes avant son expiration, puis en-tête `X-Play-Grant` sur les demandes de flux et sur la liste HLS. `425` : nouvel essai après `retry_after`. `403 grant_required` : nouvelle autorisation puis un seul nouvel essai. Le lecteur officiel relayé transmet aussi son en-tête `X-Play-Grant`. Le diagnostic affiche l'autorisation (palier, durée).

## 200.0.143
Le diagnostic 200.0.142 l'a montré : l'autorisation (`palier vip`) fonctionne et le flux est rendu en mode navigateur, mais la même demande avec l'identité « Noctra » reste refusée (`403 grant_required`). L'autorisation est obtenue avec l'identité du navigateur (agent, origine, langue) : les demandes de flux qui la portent utilisent maintenant toujours cette identité, et le mode navigateur est celui par défaut. Le contrôle de playlist du diagnostic ajoute le type et le début (300 caractères, jetons masqués) d'une réponse qui n'est pas une playlist (« autre contenu »).

## 200.0.144
Multiview diffusé sur n'importe quel appareil : `POST /api/tv/mosaic` (`tiles` : adresse et en-têtes de chaque chaîne, `audio`, `featured`, `id` pour mettre à jour) lance ffmpeg, qui lit chaque chaîne à travers le relais Noctra local (droit de lecture TV temporaire) et publie une image 1280 × 720 en HLS (`/api/tv/mosaic/<id>/index.m3u8`). Grille 1 à 9 chaînes ou une chaîne mise en avant (3/4 de l'image) ; son de la chaîne écoutée ; dernière image gardée si une chaîne coupe. Chaque changement relance ffmpeg sur la même liste (discontinuité) : le Chromecast ou l'Apple TV continue sans nouvelle diffusion. La réponse donne `cast`, l'adresse lisible sans le jeton du compte. Une mosaïque par compte, arrêtée après 90 s sans lecture, relancée au plus 3 fois en 2 minutes si ffmpeg s'arrête ; `DELETE /api/tv/mosaic/<id>` l'arrête. Réglages : `NOCTRA_FFMPEG` (chemin de ffmpeg), `NOCTRA_MOSAIC_PRESET` (`veryfast` par défaut, `ultrafast` pour moins de calcul), `NOCTRA_MOSAIC_BITRATE` (3500 kbit/s). `GET /api/tv/mosaic` indique si ffmpeg est disponible.

## 200.0.145
Listes HLS servies avec un droit de diffusion (Chromecast, AirPlay, multiview composé) : `#EXT-X-START:TIME-OFFSET=-18,PRECISE=NO` ajouté aux listes de direct assez longues (ni VOD, ni liste principale, ni liste déjà réglée). Les récepteurs démarraient sur le dernier segment, sans réserve : saccades d'image et de son dès qu'un segment arrivait en retard.

## 200.0.146
`POST /api/tv/mosaic` avec `relay: true` et une seule chaîne : relais pour un téléviseur. ffmpeg lit la chaîne à travers le relais Noctra local (route stable LiveWatch qui renouvelle ses liens) et la copie sans réencodage (`-c copy`) en HLS local de 10 segments ; la réponse n'arrive qu'avec 3 segments prêts (réserve). Relancé jusqu'à 20 fois en 10 minutes tant que le téléviseur lit, à part du multiview diffusé du même compte. L'appli iOS 2.17.6 l'utilise pour AirPlay (sinon droit de lecture TV comme avant).


## 200.0.148
Samsung Smart TV 2014 (UE40H6400, plateforme Orsay) : ces téléviseurs refusent le certificat HTTPS de la seedbox. Nouveau script `ultra/install-relais-samsung2014.sh` : un relais HTTP sur un port libre du slot (`app-ports free`), en service utilisateur `noctra-relais-tv`, qui transmet tout en HTTPS au serveur Noctra et à Jellyfin de la seedbox. Aucun appareil à laisser allumé chez soi. Il ne relaie que vers ce serveur ; `--autoriser <IP de la box>` limite l'accès. Les échanges téléviseur ↔ seedbox ne sont pas chiffrés. Désinstallation : `bash ultra/install-relais-samsung2014.sh --desinstaller`. Aucun autre changement du serveur.
