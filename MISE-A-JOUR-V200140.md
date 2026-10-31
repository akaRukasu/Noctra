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

## 200.0.149
Relais Samsung 2014 : il reçoit le journal de diagnostic envoyé par l'appli du téléviseur (`POST /__noctra-diag`) et l'écrit dans `logs/tv-diagnostic.log` de la seedbox. Le journal contient le moteur web, les fonctions CSS et JavaScript disponibles, les touches reçues, les clics, les erreurs, les blocages de l'interface et les requêtes lentes. Après la mise à jour : `systemctl --user restart noctra-relais-tv`.

## 200.0.150
« Continuer à regarder » : `/api/home/resume` renvoyait 12 titres au plus, et aucune appli n'affichait les suivants. Il renvoie maintenant tous les titres commencés, 60 au plus (`?limit=`, entre 1 et 60). Le carrousel garde ses 10 à 12 titres ; la rangée « Autres titres à reprendre » montre le reste sur Noctra TV (Android TV, LG, Samsung), iOS 2.17.9 et Android 1.9.4. Sur le site, la rangée « Continuer à regarder » de Jellyfin n'est plus réduite à 12 titres.

## 200.0.152
Réponses JSON compressées sans bloquer le serveur, nettoyage des caches toutes les 5 minutes, adresses privées (IPv6, `::ffff:`) et redirections des trackers mieux filtrées, fichiers statiques vérifiés par chemin résolu, pages relayées protégées (`frame-ancestors 'self'`). LiveWatch VIP : segments préchargés, réponses `HEAD` (Shaka), adresse des variantes gardée 45 s. BrigitteTV devient Streamonsport (choc2foot.biz), Volkamax passe sur bzh.lat. Applis : recherche Chromecast arrêtée en quittant l'écran. Validation : `npm run test:v200152`.

## 200.0.153
Logos des chaînes : un second référentiel, [tv-logo/tv-logos](https://github.com/tv-logo/tv-logos) (plus de 10 000 logos PNG pour fonds sombres), complète iptv-org pour les chaînes qu'il ne connaît pas (RMC Sport Live, Ligue 1+, Multisports, DAZN…). La liste des fichiers est demandée à l'API GitHub une fois par semaine et gardée dans `runtime/tv-logos-repo-index.json`. Les chaînes numérotées sans logo prennent celui de leur famille (« C+Live 11 » : Canal+, « RMC Sport 7 » : RMC Sport). Ces logos s'ajoutent en secours à celui de la source sans le remplacer, sauf pour LiveWatch, WiTV et OHA. Le serveur essaie aussi lui-même le logo de secours quand le premier ne répond plus : les applis iPhone et Android, qui n'ont qu'une adresse par chaîne, n'affichent plus de case vide. Les chaînes qu'aucun référentiel ne connaît (« A LA CARTE », « AMAZON PRIME ») gardent leur remplacement à initiales.

Ordre des chaînes réunies (« Toutes les chaînes ») sur le site et dans Noctra TV : les nombres sont comparés comme des nombres (« A LA CARTE 2 » avant « A LA CARTE 10 », « C+Live 2 » avant « C+Live 11 », « 7A Limoges » avant « 750G »). Noctra TV (LG, Samsung, Android TV) charge son interface depuis le serveur : la correction arrive avec cette mise à jour, sans nouveau paquet. Même correction dans les applis iOS 2.18.7 et Android 1.9.12 (avec l’arrêt de la recherche Chromecast de 200.0.152). Comprend 200.0.152. Validation : `npm run test:v200153`.

## 200.0.154
Noctra TV 1.1.53 (Android TV, LG webOS, Samsung Tizen, Samsung 2014) à la manière de l'Apple TV : menu en pastille translucide centré, onglets en texte, qui s'efface quand on descend dans la page et revient dès qu'il reprend la main ; bannière de l'accueil sur toute la largeur sous le menu, logo du titre, points de pagination ; affiches à coins arrondis, agrandies et soulevées (ombre, reflet) quand elles sont choisies ; fiche en plein écran avec le logo du film ou de la série ; noir profond, matières grises, sélection blanche. Affichage léger (LG, Samsung, petits boîtiers) : sans flou, ombres ni reflet. L'interface est servie par le serveur : LG et Samsung récents la reçoivent avec cette mise à jour ; Android TV (APK) et Samsung 2014 (kit) l'embarquent. Validation : `npm run test:v200154`.

## 200.0.155
Noctra TV 1.1.54 (Android TV noctra.74, LG webOS) : en remontant vers la bannière de l'accueil, l'en-tête d'une fiche ou le menu, la page remonte tout en haut (bannière entière, plus coupée sous le menu). Défilement plus fluide : menu sans flou (il se recalculait à chaque image), affiches sans ombre au repos (l'affiche choisie garde la sienne). Android TV noctra.73 : l'ajout du serveur après une réinstallation attend 20 s au lieu de 3,5 s (« Délais de connexion dépassé » avec la seedbox).

## 200.0.156
Noctra TV 1.1.55 (Android TV noctra.75, LG webOS) : les chaînes réunies ne proposent plus de serveur « automatique » (« LiveWatch · automatique ») à découvrir au lancement. Chaque source a 9 s (au lieu de 2,5 s) pour donner ses vrais serveurs, affichés tels quels (« LiveWatch · Basic »…) et vérifiés avant le lancement (16 serveurs au lieu de 12) ; l'avancement est affiché source par source. Une source qui ne répond pas, renvoie une liste vide ou une erreur est retirée ; les entrées automatiques ne restent qu'en dernier recours, quand aucune source n'a répondu. Validation : `npm run test:v200156`.
