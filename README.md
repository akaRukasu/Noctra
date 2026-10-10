# Version actuelle : 200.0.134 — flux directs LiveWatch (livewatch.icu)

La session VIP est jointe aux flux servis par un sous-domaine LiveWatch et conservée lors des redirections entre hôtes LiveWatch ; le diagnostic décrit le flux direct d'une chaîne test. Détails : [MISE-A-JOUR-V200134.md](MISE-A-JOUR-V200134.md). Validation : `npm run test:v200134`.

# Historique : 200.0.133 — lecteur LiveWatch : relais des sous-domaines et diagnostic

Le relais VIP du lecteur LiveWatch accepte les sous-domaines LiveWatch (API, médias) ; le diagnostic LiveWatch liste les hôtes utilisés par le site. Détails : [MISE-A-JOUR-V200133.md](MISE-A-JOUR-V200133.md). Validation : `npm run test:v200133`.

# Historique : 200.0.132 — LiveWatch sur livewatch.icu, Alternative mise à jour

LiveWatch et ses dérivés passent sur `livewatch.icu` (domaine réglable par `LIVEWATCH_ORIGIN`, anciens liens redirigés) ; Alternative accepte les chaînes ajoutées à la page Haloule (L'Equipe TV, TF1). Détails : [MISE-A-JOUR-V200132.md](MISE-A-JOUR-V200132.md). Validation : `npm run test:v200132`.

# Historique : 200.0.131 — serveurs de toutes les sources sous chaque chaîne

Le pays deviné par iptv-org ne sépare plus une même chaîne entre sources (beIN Sport 1 retrouve ses serveurs LiveWatch, OHA…) ; l'apport de chaque source est affiché sous « Toutes les chaînes ». Détails : [MISE-A-JOUR-V200131.md](MISE-A-JOUR-V200131.md). Validation : `npm run test:v200131`.

# Historique : 200.0.130 — tous les serveurs de chaque source au clic sur une chaîne

Comme sur Noctra TV, chaque source « automatique » (LiveWatch VIP, OHA, WiTV…) est dépliée en tous ses serveurs, testés et classés ensemble ; les sources lentes sont ajoutées à leur arrivée, le secours manuel n'est jamais lancé seul. Détails : [MISE-A-JOUR-V200130.md](MISE-A-JOUR-V200130.md). Validation : `npm run test:v200130`.

# Historique : 200.0.129 — chaînes françaises uniquement, plus de chaînes manquantes

« Toutes les chaînes » et « Chaînes sport » n'affichent que les chaînes françaises ; les catalogues livrés en plusieurs fois (OHA, LiveWatch) sont complétés, les flux sans type gardés, 120 bouquets par source. Détails : [MISE-A-JOUR-V200129.md](MISE-A-JOUR-V200129.md). Validation : `npm run test:v200129`.

# Historique : 200.0.128 — chaînes réunies, serveurs testés, génériques et épisodes comme sur Noctra TV

La TV s'ouvre sur les chaînes de toutes les sources réunies (« Toutes les chaînes », « Chaînes sport »), avec la détection de serveurs de Noctra TV : serveurs testés, le meilleur vérifié lancé, relais automatique. Séries et animés : bouton « Passer l'intro / le générique », carte « À suivre » et transition entre épisodes. Détails : [MISE-A-JOUR-V200128.md](MISE-A-JOUR-V200128.md). Validation : `npm run test:v200128`.

# Historique : 200.0.127 — logo de l'œuvre sur l'affiche d'accueil

Comme sur la version TV, l'affiche « Continuer à regarder » montre le logo du film ou de la série à la place du titre. Logos préchargés et décodés d'avance : aucun délai à la rotation. Sans logo, le titre texte reste. Détails : [MISE-A-JOUR-V200127.md](MISE-A-JOUR-V200127.md). Validation : `npm run test:v200127`.

# Historique : 200.0.126 — intro de démarrage plus longue

Intro Noctra de 3,5 s à la première ouverture (2,5 s ensuite), animation plus posée. Inclut les 200.0.124 et 200.0.125. Détails : [MISE-A-JOUR-V200126.md](MISE-A-JOUR-V200126.md). Validation : `npm run test:v200126`.

# Historique : 200.0.125 — direct TV sans boucle hors fenêtre, lien renouvelé à temps

Hors de la fenêtre du direct, retour 20 s avant le bord ; lien LiveWatch expiré renouvelé dès trois 404 de playlist. Inclut la 200.0.124. Détails : [MISE-A-JOUR-V200125.md](MISE-A-JOUR-V200125.md). Validation : `npm run test:v200125`.

# Historique : 200.0.124 — départ TV en retrait du direct

Shaka démarre 30 s en retrait du direct, là où les segments sont déjà publiés : la réserve de 15 s devient atteignable. Détails : [MISE-A-JOUR-V200124.md](MISE-A-JOUR-V200124.md). Validation : `npm run test:v200124`.

# Historique : 200.0.123 — démarrage TV avec réserve garantie

La première image Shaka n’arrive qu’avec 15 s de réserve (20 s d’attente au plus). Détails : [MISE-A-JOUR-V200123.md](MISE-A-JOUR-V200123.md). Validation : `npm run test:v200123`.

# Historique : 200.0.122 — télécommande Jellyfin débloquée

La page « Contrôle à distance » n’est plus recouverte par sa file d’attente masquée ; inclut toutes les corrections 200.0.121. Détails : [MISE-A-JOUR-V200122.md](MISE-A-JOUR-V200122.md). Validation : `npm run test:v200122`.

# Historique : 200.0.121 — survol fluide, fiches fiables, réglages en colonne

Survol des affiches 100× moins coûteux, « Voir la fiche » / « Reprendre » fiables à chaque clic, réglages PC en une colonne, 15 s de réserve au démarrage TV, intro allongée. Détails : [MISE-A-JOUR-V200121.md](MISE-A-JOUR-V200121.md). Validation : `npm run test:v200121`.

# Historique : 200.0.120 — défilement natif PC, démarrage unique, TV Shaka stabilisée

Molette native rétablie sur PC, intro Noctra seul écran de démarrage, fenêtre du direct Shaka élargie à 120 s (tolérance 7 s → 91 s). Détails : [MISE-A-JOUR-V200120.md](MISE-A-JOUR-V200120.md). Validation : `npm run test:v200120`.

# Historique : 200.0.119 — fluidité PC rétablie, affiche d’accueil fiabilisée

Retrait des animations liées au défilement par affiche (379 → 7 couches graphiques), plus de lecture involontaire depuis l’affiche « Continuer à regarder ». Détails : [MISE-A-JOUR-V200119.md](MISE-A-JOUR-V200119.md). Validation : `npm run test:v200119`.

# Historique : 200.0.118 — « Aurora Flow », sous-titres iOS et AirPlay

Mouvement physique et animations pilotées par le défilement, sous-titres dans le lecteur natif iOS / PiP, bouton Diffuser (AirPlay, Remote Playback). Détails : [MISE-A-JOUR-V200118.md](MISE-A-JOUR-V200118.md). Validation : `npm run test:v200118`.

# Historique : 200.0.117 — apparence des sous-titres sur iOS

La partie « Apparence » des réglages de sous-titres est de nouveau disponible sur iPhone/iPad (iOS 27). Détails : [MISE-A-JOUR-V200117.md](MISE-A-JOUR-V200117.md). Validation : `npm run test:v200117`.

# Historique : 200.0.116 — fluidité et centre d’automatisation

Animations prises en charge par la carte graphique, plus aucun flou d’arrière-plan sur mobile, minuteur d’effets unique, et centre Radarr/Sonarr/Prowlarr intégré au design Aurora. Détails : [MISE-A-JOUR-V200116.md](MISE-A-JOUR-V200116.md). Validation : `npm run test:v200116` (versions 109 à 115 : fichiers `MISE-A-JOUR-V2001xx.md`).

# Historique : 200.0.108 — « Aurora 2 » et stabilité Shaka

Refonte graphique (police Sora, lumière ambiante, anneau lumineux, halos), corrections ergonomiques PC/mobile et stabilisation du lecteur TV Shaka (mode séquence HLS, délais de relance, relance bornée après erreur). Détails : [MISE-A-JOUR-V200108.md](MISE-A-JOUR-V200108.md). Validation : `npm run test:v200108`.

# Historique : révision interface 200.107h « Aurora »

Voir [VERIFICATION-200107h.md](VERIFICATION-200107h.md).

# Historique : 200.0.104

Cette archive fournit le client média Noctra 200.0.104, son serveur Node.js, les bundles Jellyfin Web, le centre TV et les scripts de mise à jour Ultra.cc.

La vérification syntaxique se lance avec `npm run check`. La suite complète se lance avec `npm test` ; les tests historiques sont conservés pour couvrir les régressions des versions précédentes.

Correctifs d’authentification Jellyfin 12 : [installation, corrections et validation](MISE-A-JOUR-V200076.md).

# Historique : 200.0.72

Consultez [les corrections et l’installation](MISE-A-JOUR-V200061.md).

# Noctra Media Client 200.0.104

## Mise à jour 200.0.51

Refonte commune des sous-menus, fiches et demandes, roulette Jellyfin, RénéVéo et Movix (Vavoo, Northlive, FCTV33, IPTV VIP), configuration des clés côté serveur et améliorations de reprise TV.

Voir **MISE-A-JOUR-V200051.md** pour installer et activer Movix via **TV → Accès TV → Movix VIP → Vérifier et activer**. Les clés ne sont pas incluses. Validation : `npm run check` et `npm run test:v200051`.

## Historique — mise à jour 200.0.50

Nouvel accueil Cinéma, mise à l'affiche issue de la médiathèque, univers TV/découverte et dock conservé. Démarrage HLS progressif et préchargement borné de segments côté serveur. Voir **TEST-NOTES-V200050.md** et **APERCU-V200050.html**.

Conserver le `.env` et les données, appliquer les fichiers de l'archive, redémarrer Noctra et recharger avec Ctrl+F5. Qualité Auto recommandée pour activer la protection adaptative. Les tests locaux passent ; les essais authentifiés sur l'installation réelle restent à effectuer.

## Historique — mise à jour 200.0.49

La partie **Chaînes** privilégie la continuité : réserve avant démarrage, qualité Auto temporairement limitée quand les segments ralentissent et reprise sans rejouer les secondes déjà regardées. Les menus et préférences reçoivent des icônes SVG, des surfaces plus lisibles et des transitions courtes ; le dock est conservé.

Voir **TEST-NOTES-V200049.md** pour les changements, validations et limites. Conserver le `.env` et les données, remplacer les fichiers applicatifs, redémarrer le service puis recharger avec Ctrl+F5. Vérifier la version 200.0.49 et garder la qualité Auto pour bénéficier de la protection adaptative.

Les paragraphes suivants documentent les versions historiques.

Noctra v149 affine l’intégration TV : FSTV devient un lecteur intégré Noctra, les sources Sports vides bénéficient de secours officiels et la navigation fournisseurs tient sans défilement horizontal, y compris sur mobile.

## Historique v149

- **Direct desktop** : profil HLS adaptatif proche du lecteur LiveWatch, tampon raisonnable et reprise sur le direct sans préchargement bloquant.
- **Rendu vidéo** : mises à jour des commandes limitées à une image, aucune reconstruction DOM à chaque progression et aucun flou GPU au-dessus du direct.
- **Plein écran** : commandes masquées après inactivité et défilement du document verrouillé, y compris avec le repli plein écran.
- **Variantes globales** : variantes LiveWatch conservées par source/qualité et tous les serveurs OHA publiés dans le catalogue sont accessibles.

- **Démarrage desktop** : premier segment au niveau le plus léger, moteur HLS préchargé en parallèle du résolveur et lecture immédiate sans attendre le remplissage du tampon maximal.
- **Direct continu** : profil LiveWatch/NorthTV/FrameTV aligné sur le profil mobile stable, lecture strictement à `1×` et tampon de réserve renforcé.
- **Reprise stable** : le même segment est réessayé avant toute reconstruction du direct ; les URL signées ne sont renouvelées immédiatement que sur `401`, `403` ou `410`.
- **Lecteur live PC** : commandes Noctra lecture/pause, volume, PiP et plein écran, avec indicateur rouge `EN DIRECT` et sans chronomètre de fichier.
- **Navigation desktop** : bandeau noir supprimé, dock et actions du haut directement intégrés au fond de l'interface.
- **Accueil progressif** : la rangée des films récemment ajoutés récupère de nouvelles pages Jellyfin à l'approche de la fin du défilement.
- **Fluidité PC** : animations de translation superflues retirées des carrousels et chargement progressif limité au desktop performant.
- **Mesures TV** : temps du résolveur, du manifeste, du premier segment et de la première image visibles dans le diagnostic local, sans donnée sensible.
- **Chargement parallèle** : HLS.js se précharge pendant la résolution distante au premier direct de la session.
- **Retour au direct** : une commande compacte permet de rejoindre immédiatement le live après une pause ou un ralentissement.
- **Mobile préservé** : aucun changement du moteur et des priorités déjà stables sur iPhone, iPad et téléphone.
- **Retrait v142** : l’univers `TV officielle`, ses 21 destinations externes et sa présentation dédiée sont supprimés.
- **TV préservée** : LiveWatch, NorthTV, FrameTV, WiTV, OHA, Sports et les sources M3U personnelles ne changent pas.
- **Commandes TV** : Outils TV et plein écran réunis dans une capsule translucide, avec des teintes distinctes plus lisibles et sans contour ni halo.
- **NorthTV mobile** : WebKit HLS natif prioritaire sur iPhone/iPad pour amorcer plus tôt les gros segments, avec HLS.js conservé en secours.
- **NorthTV stable** : playlists et segments exposés sous une URL locale liée à la chaîne, renouvelable sans casser la lecture en cours.
- **WiTV HLS** : flux relayé par Noctra avec les en-têtes du lecteur officiel afin que les segments ne soient plus refusés par le CDN.
- **WiTV plein écran** : le chemin HLS restauré utilise la balise vidéo iOS et son plein écran système ; le lecteur web reste disponible en secours.
- **Lecture TV** : profil tampon renforcé pour les gros segments LiveWatch, NorthTV, FrameTV et OHA, avec HLS.js prioritaire sur desktop et moteur natif conservé en secours.
- **Reprise des directs** : renouvellement du même flux résolu après une coupure, aussi bien avec HLS.js qu'avec le moteur HLS natif, sans changement automatique de chaîne.
- **WiTV** : bascule automatique vers le lecteur web officiel lorsque le manifeste direct ne fournit aucun média dans les 12 secondes ou termine en erreur.
- **Stabilité serveur** : une fermeture de segment après envoi des en-têtes ne peut plus provoquer `ERR_HTTP_HEADERS_SENT` ni arrêter Noctra.
- **Accueil** : « Continuer à regarder » réapparaît dès que Jellyfin injecte tardivement la section ou ses cartes, sans devoir ouvrir Cast ou SyncPlay.
- **Bandeau mobile** : hauteur ramenée à 64 px tout en conservant des zones tactiles de 42 px et le bon ancrage des menus.
- **Diagnostic TV** : événements vidéo/HLS enrichis sans URL, cookie ni jeton pour distinguer moteur, reprise et repli fournisseur.
- **Seed qBittorrent** : prévisualisation puis traitement en arrière-plan de tous les torrents terminés liés à `Trash` ou marqués comme manquants.
- **Sans doublon média** : Noctra reconstruit l'arborescence qBittorrent dans `.noctra-seed` avec des liens physiques vers les fichiers des médiathèques, puis relance une vérification et le partage.
- **Sécurité des fichiers** : aucune copie Radarr/Sonarr n'est déplacée ou supprimée ; les correspondances ambiguës sont ignorées et signalées.
- **TV** : boutons Outils TV et plein écran regroupés dans une barre stable au-dessus du lecteur.
- **LiveWatch VIP** : une session active est désormais indiquée par un statut compact, sans encart de test.
- **Sources TV** : la playlist France d'IPTV-org n'est plus proposée ; les sources personnelles M3U/M3U8 restent disponibles.
- **Logos TV** : index officiel mondial mis en cache sur disque, variantes FrameTV `.b`/`.c`/`.s` regroupées et badge local conservé lorsqu'aucun visuel n'existe.
- **Logos visibles** : téléchargements identiques mutualisés, 8 premières lignes prioritaires puis 12 lignes anticipées ; le préchargement serveur concurrent a été retiré et la seconde source n'est tentée qu'en cas d'échec.
- **Bandeau** : avatar Jellyfin restauré, commandes sans cadre et menus Cast/SyncPlay compacts.
- **Bandeau mobile** : groupe Cast/SyncPlay/recherche/profil ancré au bord droit sûr, avec commandes tactiles de 42 px.
- **Bandeau desktop** : les boutons restent à 44 px au survol, sans animation ni décalage du groupe d'actions.
- **Relais TV** : une fermeture distante de LiveWatch, NorthTV, FrameTV ou OHA interrompt seulement le flux concerné et ne redémarre plus le serveur Noctra.
- **Desktop** : fond non fixé, flou plein bandeau retiré, mutations ordinaires ignorées par les scans de route et ancien écouteur de molette non passif désactivé.
- **Navigation** : aucun cadre, remplissage coloré ou halo sur les boutons du dock ; les couleurs restent réservées aux fonds et espaces de contenu.

- **FrameTV** : catalogue complet jusqu'à 12 000 entrées, pays France sélectionné par défaut et lecture HLS officielle conservée.
- **LiveWatch** : DaddyTV est retiré des sources proposées ; NorthTV, FrameTV et les univers Sports restent distincts.
- **Sports** : Sports, Football Live, BossTV, JackTV et Matchs du jour utilisent les routes publiques et embeds officiels disponibles.
- **Mes sources** : l'univers personnel ne rebondit plus vers la dernière source TV et accepte de nouveau les playlists M3U/M3U8.
- **Téléchargements** : affichage progressif de 30 cartes sur mobile et 60 sur bureau, mise à jour en place et détail stable pendant le polling qBittorrent.
- **Demandes** : préchauffage sur tous les appareils et premier rendu progressif depuis les tendances pendant le calcul des recommandations personnalisées.
- **Mobile** : en-tête restauré après fermeture d'un sous-menu, hamburger masqué, marque Noctra alignée à gauche et commandes Cast/SyncPlay intégrées.
- **Design** : accents turquoise, bleu, violet, ambre et corail, cartes à 14 px et boutons sans contour permanent.
- **Dock** : fonds mats et solides, sans halo, ombre, filtre ou pseudo-élément lumineux sur mobile et bureau.
- **Notifications** : marge basse augmentée sur téléphone pour ne plus coller les messages d'action au dock.
- **Fluidité** : rendu et défilement restent synchronisés avec `requestAnimationFrame`, sans plafond artificiel de fréquence d'écran.
- **Automatisation** : ordre Radarr / Sonarr / Prowlarr conservé.
- **iOS** : correctifs de zoom de saisie, plein écran et détection PiP Safari/PWA conservés.

## Sécurité LiveWatch

Le compte VIP reste géré côté serveur. Les vrais jetons de session ne sont pas sérialisés dans l'iframe et ne sont pas transmis aux hôtes média tiers. Les ressources média externes sont relayées par Noctra avec validation du type de ressource.

## Version

Client, serveur et API : `200.0.104`  
Cache PWA : `noctra-shell-v200-r104`

## Installation

Déploie le contenu de cette archive à la place de la version précédente en conservant ton `.env` et les fichiers de données persistantes de ton installation Noctra.

Le dossier de seed peut être personnalisé avec `NOCTRA_SEED_ROOT`. Sans cette variable, Noctra utilise `.noctra-seed` à côté de `Trash`.

Le paquet reste « Server Safe » : il ne contient pas les secrets de ton installation.
