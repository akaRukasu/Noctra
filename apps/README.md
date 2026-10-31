# Applications Noctra

Noctra existe en applications pour :

| Appareil | Fichier | Installation |
|---|---|---|
| Téléphone, tablette, pliable, Chromebook et téléviseur Android | `Noctra-android-native.apk` (appli native Kotlin/Compose, comme l’appli iOS 26) | fichier APK |
| Téléphone et tablette Android | `Noctra-android.apk` (interface web) | fichier APK |
| Android TV, Google TV, Shield, Fire TV, vidéoprojecteurs | `Noctra-androidtv.apk` (**Noctra TV**, appli native) | fichier APK |
| iPhone et iPad (iOS 26) | `Noctra-ios26-unsigned.ipa` (appli native SwiftUI, Liquid Glass) | Sideloadly ou AltStore |
| iPhone et iPad (iOS 15 à 18) | `Noctra-ios-unsigned.ipa` (interface web) | Sideloadly ou AltStore |
| Téléviseurs LG (webOS) | `com.noctra.media_1.1.55_all.ipk` (**Noctra TV**) | mode développeur LG |
| Téléviseurs Samsung (Tizen) | `Noctra.wgt` (**Noctra TV**) | [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) |
| Téléviseurs Samsung 2014 (série H, Orsay : UE40H6400…) | `Noctra-Samsung-2014-<version>.zip` (**Noctra TV**, kit) | User App Sync : [guide](samsung-orsay/GUIDE-INSTALLATION-UE40H6400.md) |

## Android TV : Noctra TV (appli native)

Sur Android TV, utilisez **Noctra TV** (`Noctra-androidtv.apk`). C’est l’appli Jellyfin officielle pour Android TV adaptée pour Noctra : marque Noctra et serveur `akarukasu.merlion.usbx.me/jellyfin` intégré. On arrive directement sur la page d’authentification, puis sur l’accueil Noctra : médiathèques, fiches, TV en direct (avec le multiview jusqu’à 12 chaînes), SyncPlay, Découvrir, Demandes, Roulette et recherche. L’interface est native et fluide ; films et épisodes sont lus avec le lecteur Jellyfin (langue audio et sous-titres au choix), puis on revient sur Noctra. Les détails, la construction et la licence sont dans [androidtv/README.md](androidtv/README.md).

## iPhone et iPad : Noctra pour iOS 26 (appli native)

`Noctra-ios26-unsigned.ipa` est une appli **entièrement native** (SwiftUI, iOS 26 minimum), construite sur les comportements du système plutôt que sur une page web : barre d’onglets **Liquid Glass** qui se rétracte au défilement, onglet de recherche d’iOS 26 en bas de l’écran, transitions **zoom** de l’affiche vers la fiche (et retour en glissant), ressorts et retours haptiques du système, fond des fiches qui s’étire quand on tire vers le bas, carrousel à pages magnétiques avec parallaxe, cartes et boutons Liquid Glass.

- **Contenu** : connexion Jellyfin du serveur Noctra (adresse `akarukasu.merlion.usbx.me` proposée) ; accueil comme Noctra TV (« À l’affiche chez vous », carrousel « Continuer à regarder », médiathèques en 2 × 2, À suivre, derniers ajouts) ; médiathèques (tri, chargement progressif) ; fiches (lecture ou reprise, depuis le début, langue audio et sous-titres, saisons et épisodes, distribution, favori, vu) ; recherche.
- **TV en direct** (règles de Noctra TV) : chaînes de toutes les sources réunies par nom et par pays, **France par défaut** (numéros de la TNT) et les autres pays au choix, catégories claires, favoris, récentes, sources et bouquets. Accès VIP du serveur (LiveWatch Premium, Movix, Northlive) détectés et proposés en premier. Au lancement : serveurs de toutes les sources classés par fiabilité (réussites, échecs et coupures mémorisés sur l’iPhone), flux testés (liste, segment, débit), meilleur serveur lancé tout seul après un compte à rebours, les suivants en relais ; chaque flux lu par le moteur qui lui convient : lecteur d’Apple (HLS, image dans l’image, AirPlay) ou moteur web (hls.js, et mpegts.js pour les flux MPEG-TS continus comme Northlive), avec passage automatique de l’un à l’autre quand un flux est refusé, retenu par fournisseur. Les tests lisent le début de chaque flux et reconnaissent sa nature (HLS, MPEG-TS continu, fichier), même derrière une fausse image ; ils relisent la liste HLS pour vérifier que le direct avance (direct figé repéré), écartent les flux chiffrés FairPlay, mesurent la marge de débit d’un segment et le débit reçu d’un flux MPEG-TS, et testent aussi les pages des lecteurs (erreur, protection anti-robot, lecteur présent). La raison de chaque résultat est affichée dans la liste. La confiance dans les tests est apprise par fournisseur (un serveur annoncé en ligne qui ne lit pas compte moins), les résultats restent valables 4 min (chaîne rouverte ou zappée classée tout de suite) et les autres serveurs sont retestés toutes les 3 min pendant la lecture ; « lent à répondre » n’écarte pas un serveur. VIP LiveWatch : vérification des flux laissée jusqu’à une minute, pont officiel ouvert dans un cadre isolé comme sur PC, relais officiel NorthTV ; nouveau lien du même serveur après une coupure. Lecteurs des sites : lecture, flux repéré et erreurs remontés à l’appli (serveur suivant), fenêtres surgissantes et redirections publicitaires bloquées. **Lecteur TV** : changer de chaîne (boutons ou glissement vertical, liste des chaînes) et de serveur (liste classée, débit testé) sans quitter le lecteur, serveur suivant lancé tout seul en cas de coupure, image dans l’image et AirPlay. Liste des serveurs du lecteur : toutes les entrées de chaque source (flux, serveurs automatiques et VIP demandés en arrière-plan, page du site en secours), groupées par source, état du test, nouveau test, choix du moteur par appui long. Onglet **Sport** (matchs en direct d’abord, scores, compétitions) et toutes les sources (chaînes, sport, alternatives, personnelles) regroupées par section ; bouquets des fournisseurs (Northlive, Movix…) en cartes, avec recherche.
- **Découvrir** : sélections (Pour toi, Tendances, Au cinéma…), Demandes Jellyseerr (recherche, demande, suivi de « Mes demandes », **recherche interactive** des trackers pour les administrateurs, envoyée à qBittorrent), Roulette (médiathèque, genre, note, non vus ; rouleau qui ralentit, révélation).
- **SyncPlay** : rejoindre ou créer un groupe (bouton en haut de l’accueil ; groupe actuel avec ses participants, groupes ouverts en cartes), lecture lancée pour tout le groupe, pause, lecture et avance partagées, ordres appliqués à l’heure du serveur. **Cast** (« Lire sur… ») : Chromecast, Google TV, Android TV et téléviseurs « Chromecast intégré » du Wi-Fi (protocole Cast natif, sans SDK : flux adapté au Chromecast, sous-titres, télécommande avec capsule au-dessus des onglets, reprise envoyée à Jellyfin) ; AirPlay (Apple TV, téléviseurs AirPlay) ; Noctra TV, un navigateur ou un autre appareil du compte. Bouton de diffusion en haut de chaque onglet (titre à reprendre, ou télécommande du Chromecast en cours). L’iPhone reçoit aussi « Lire sur » et les commandes à distance.
- **Lecteur** : celui d’iOS (image dans l’image, AirPlay, commandes du système). Jellyfin choisit selon les formats de l’iPhone : fichier lu tel quel (MP4/MOV en H.264 ou HEVC), sinon flux HLS en fMP4 qui recopie la vidéo et le son quand c’est possible. Reprise et « vu » envoyés à Jellyfin.
- **Sous-titres** : sous-titres texte (SRT, ASS, WebVTT…) téléchargés en WebVTT et affichés par l’appli au-dessus de la vidéo, en lecture directe comme en flux adapté (taille réglable dans le compte) ; sous-titres image (PGS, VobSub) incrustés par le serveur.
- **Hors ligne** : bouton ↓ des fiches (film, épisode) et « Télécharger la saison » ; qualité Originale (fichier d’origine, ou copie sans perte préparée par le serveur), Haute, Moyenne ou Économie. Fichiers lisibles par l’iPhone téléchargés tels quels, autres formats en flux HLS enregistré par iOS ; transferts en arrière-plan (appli fermée), deux à la fois, Wi-Fi uniquement au choix. « Sur cet iPhone » (Médiathèques, compte, accueil hors connexion) : avancement, pause, reprise, sous-titres texte téléchargés, reprise de lecture locale envoyée au serveur dès qu’il est joignable.
- **Performances** : images décodées hors du fil principal et gardées en mémoire, ombres des cartes calculées sur des formes fixes, fond Aurora aplati en une seule image, lueur du carrousel limitée à la page visible (coupée en mode économie d’énergie), réponses du serveur et catalogues TV préparés en tâche de fond.
- **Administration** (comptes administrateurs, menu du compte), entièrement native : vue d’ensemble (lectures en cours, appareils, tâches, activité, redémarrage), paramètres généraux, lecture et transcodage, réseau, personnalisation, médiathèques (création, dossiers, analyse, options, suppression), utilisateurs, appareils, clés d’API, extensions (activer, désinstaller, catalogue, dépôts), tâches planifiées, activité, journaux ; côté Noctra : téléchargements qBittorrent, TV en direct (compte LiveWatch VIP, clés Movix et Northlive, sources), **Radarr et Sonarr** (vue d’ensemble, bibliothèque, manquants, calendrier, file d’attente, historique, ajout avec profil et dossier, surveillance, recherches, actualisation) avec **recherche interactive** des versions (film, épisode, saison, série entière ; tri par score, taille ou sources ; envoi au client).
- **Construction** : GitHub Actions (`.github/workflows/noctra-ios-native.yml`, Mac avec Xcode 26), à chaque modification de `apps/ios-native`. L’IPA se télécharge dans *Actions › Noctra iOS 26 › Artifacts* (`noctra-ios26`). Sur un Mac : `cd apps/ios-native && xcodegen generate && open Noctra.xcodeproj`.
- **Installation** : comme ci-dessous (Sideloadly ou AltStore). Même identifiant d’appli que l’ancienne version (`com.noctra.app`) : elle la remplace.

## Android : Noctra natif (Kotlin, Jetpack Compose)

`Noctra-android-native.apk` reproduit l’appli iOS 26 en natif Android : mêmes écrans, mêmes règles et même identité visuelle (fond Aurora, police Sora, dégradés lilas → rose → ciel). Un seul APK universel pour **Android 6 et plus** et tous les appareils : téléphones (barre d’onglets en bas), tablettes, pliables dépliés et Chromebooks (rail latéral), **Android TV / Google TV / Fire TV** (rail latéral, icône et bannière dans la rangée des applications, sélection à la télécommande avec anneau lumineux, touches Chaîne + / −). Aucune bibliothèque native : toutes les architectures sont prises en charge.

- **Contenu** : connexion, accueil (« À l’affiche chez vous », carrousel, reprises, derniers ajouts, À suivre, médiathèques), médiathèques avec tri et chargement progressif, fiches (reprise, pistes audio et sous-titres, saisons, distribution, favori, vu), recherche.
- **Lecteur** : ExoPlayer (Media3) avec profil des décodeurs de l’appareil (lecture directe quand c’est possible, sinon flux adapté par le serveur), sous-titres texte affichés par l’appli (taille réglable), image dans l’image, plein écran ; reprise et « vu » envoyés au serveur.
- **TV en direct** : mêmes règles que sur iOS (France d’abord, catégories, favoris par appui long, récentes, Sport, sources et bouquets en cartes, accès VIP). Serveurs classés par fiabilité et testés (nature du flux, direct figé, débit, pages des lecteurs, confiance apprise par fournisseur, tests gardés 4 min, nouveau test toutes les 3 min), meilleur serveur lancé tout seul. Chaque flux est lu par ExoPlayer (HLS et **MPEG-TS continu comme Northlive**) ou par le moteur web (hls.js, mpegts.js), avec passage automatique de l’un à l’autre ; VIP LiveWatch (jusqu’à une minute, pont officiel dans un cadre isolé comme sur PC), relais NorthTV, nouveau lien après une coupure. Lecteur TV : chaînes et serveurs sans quitter le lecteur, glissement vertical ou touches de la télécommande pour zapper, image dans l’image, fenêtres publicitaires bloquées.
- **Découvrir, Demandes, Roulette**, **SyncPlay** (groupes, ordres à l’heure du serveur), **Cast** : Chromecast et Google TV du Wi-Fi (protocole Cast natif, télécommande, capsule au-dessus des onglets), diffusion d’écran d’Android, et « Lire sur » vers Noctra TV ou un autre appareil du compte. L’appareil reçoit aussi « Lire sur » et les commandes à distance.
- **Hors ligne** : téléchargements par le gestionnaire de téléchargements d’Android (qualité au choix, Wi-Fi uniquement au choix, saisons entières), lecture sans connexion, sous-titres téléchargés.
- **Administration** (comptes administrateurs) : la même que sur iOS, en natif (tableau de bord, réglages du serveur, médiathèques, utilisateurs, appareils, clés, extensions, tâches, activité, journaux, téléchargements qBittorrent, TV et VIP, **Radarr / Sonarr** avec recherche interactive, recherche des trackers depuis Découvrir et Demandes).
- **Construction** : GitHub Actions (`.github/workflows/noctra-android-native.yml`) à chaque modification de `apps/android-native` ; l’APK se télécharge dans *Actions › Noctra Android › Artifacts* (`noctra-android-native`). Il est signé avec la clé `NOCTRA_KEYSTORE_*` des secrets si elle existe, sinon avec une clé créée une fois par GitHub Actions et gardée dans son cache : les versions suivantes s’installent par-dessus. Identifiant `com.noctra.mobile` : il s’installe à côté de l’ancienne appli web (`com.noctra.app`) sans la remplacer.

## LG webOS et Samsung Tizen : Noctra TV

Les applis LG et Samsung ouvrent la **même interface Noctra TV** que l’appli Android TV : accueil (carrousel « Continuer à regarder », médiathèques 2 × 2), fiches films et séries, TV en direct (« Toutes les chaînes » : les sources réunies, la plus stable proposée d’abord ; favoris et chaînes récentes, filtres par catégorie, guide des programmes, zapping ▲ ▼, panneaux des chaînes et des serveurs, bascule automatique de serveur), multiview, SyncPlay, Découvrir, Demandes, Roulette et recherche.

Il n’y a pas d’appli Jellyfin native sur ces téléviseurs : le fichier `androidtv/web/tv-native.js` remplace l’appli Android en JavaScript, avec le même protocole.
- **Connexion** : par **Quick Connect** (un code s’affiche à l’écran ; sur le téléphone ou le PC, Jellyfin › Paramètres › Quick Connect, saisir le code) ou par nom d’utilisateur et mot de passe. La session est mémorisée ; Compte › Paramètres permet de se déconnecter.
- **Lecture** : lecteur vidéo du téléviseur (HLS et MPEG-TS natifs), avec hls.js et mpegts.js du serveur en secours. Films et épisodes : reprise, avance ◀ ▶ (10 s) et ⏪ ⏩ (30 s), langue audio et sous-titres modifiables pendant la lecture (OK › Audio / Sous-titres), suivi de lecture Jellyfin (reprises, « Vu »). À la fin d’un épisode (y compris repris depuis « Continuer à regarder »), l’épisode suivant démarre seul après 10 secondes ; la fin est détectée même quand le téléviseur ne la signale pas.
- **Chaînes** : bandeau du programme, ▲ ▼ ou CH+ / CH− pour zapper, touches chiffrées pour aller à une chaîne par son numéro, ◀ pour la liste des chaînes, ▶ pour les serveurs, OK pour la barre de commandes. Serveurs classés selon leur fiabilité passée (« Fiable », « Instable », « Échec récent »). En multiview, un flux coupé demande un lien neuf puis réessaie seul.
- **Touches** : Retour (LG 461, Samsung 10009) ferme la fenêtre ou le lecteur, puis quitte à l’accueil ; lecture/pause, stop, avance et retour rapides ; les touches Samsung sont déclarées par l’appli avant l’ouverture de l’interface.

L’interface Noctra TV (la même que l’appli Android TV : accueil, médiathèques, TV en direct, lecteur, multiview…) est **intégrée au paquet** (`tv/`). Au lancement : si le serveur la propose lui aussi (`/health` : `tvApp`), celle du serveur est ouverte (`…/noctra/tv-app/`, toujours la plus récente) ; sinon celle de l’appli, qui dialogue avec l’API Noctra et Jellyfin du serveur choisi. Le lanceur vérifie d’abord que le téléviseur peut joindre l’API Noctra depuis l’appli (requête avec l’en-tête de jeton) : un serveur à jour l’autorise (en-têtes CORS sur `/api`, authentification par jeton, sans cookie) ; avec un serveur plus ancien, cela dépend du téléviseur, et à défaut l’appli ouvre l’interface web complète comme avant.

Sur LG et Samsung, l’affichage est allégé pour les processeurs de téléviseur : pas de fond en dégradés plein écran ni de flou, sélection marquée par un contour, carrousel de l’accueil arrêté pendant la navigation (travail de dessin divisé par 2 à 3 lors de la navigation). Les animations légères restent : agrandissement de l’élément sélectionné, glissement des rangées et fondu du carrousel (déplacements et fondus seulement, pris en charge par le processeur graphique) ; le défilement doux est coupé quand une touche est maintenue. Au lancement d’une chaîne, les 12 premiers serveurs sont testés dès l’ouverture de la fenêtre (4 à la fois), comme le ferait le lecteur : liste de lecture, sous-liste de qualité, puis dernier segment ; les serveurs « automatiques » sont résolus puis testés (le flux obtenu sert ensuite au lancement, sans seconde résolution). Le dernier segment de la liste est téléchargé en entier (4 Mo et 7 s au plus) : sa durée divisée par son temps de chargement donne la marge du serveur sur la connexion de l’appareil (« En ligne » à partir de 2, « En ligne · juste » entre 1,2 et 2, « En ligne · trop lent ici » en dessous) ; les serveurs qui ont de la marge passent devant, ce qui garde le direct stable sur une connexion modeste (ADSL, 4G, Wi-Fi faible). Le segment testé doit contenir de la vidéo (MPEG-TS, MP4 fragmenté ou audio) : une page HTML, un message d’erreur ou une réponse vide servis avec un code 200 donnent « Pas de vidéo ». Un direct dont la liste ne bouge pas après une durée de segment (même numéro, même dernier segment) donne « Direct figé ». Chaque serveur affiche « Test… », « En ligne » (« En ligne · lent » au-delà de 3,5 s), « Hors ligne », « Pas de vidéo », « Direct figé » ou « Sans réponse » (trop lent : ni compté comme un échec, ni écarté). La lecture automatique lance le meilleur serveur vérifié en ligne — fiabilité passée, type de lecteur et rapidité de réponse (un serveur lent, signe d’un relais chargé qui coupe plus souvent, passe après les rapides) ; les serveurs mieux classés encore en test sont attendus, 6 s au plus. 6 serveurs sont testés à la fois, et la fenêtre s’ouvre sans attendre plus de 2,5 s les serveurs « automatiques » (résolus ensuite pendant le test) ; sans serveur vérifié, d’abord un serveur qu’on ne peut pas tester ici (lecteur web), puis ceux restés sans réponse. Un serveur annoncé « En ligne » qui ne démarre pas rend le test de son fournisseur moins décisif les fois suivantes (confiance apprise sur le téléviseur). Un serveur lancé qui ne démarre pas est abandonné plus vite : sur Android TV, 15 s au premier essai puis 10 s avec l’autre format (au lieu de 30 s chacun) et 3 nouvelles tentatives par requête avant la première image ; sur LG et Samsung, 12 s, et un refus net du serveur (403, 404…) avant le démarrage fait passer tout de suite au serveur suivant. Les serveurs sont alors reclassés (vérifiés d’abord, hors ligne à la fin), et en cas d’échec le suivant est pris dans cet ordre. Les flux qui exigent des en-têtes (Referer, Origin, cookies) que le téléviseur ne peut pas envoyer sans le relais du serveur Noctra sont écartés. Si un flux échoue sur une coupure réseau, il n’est pas relancé avec l’autre bibliothèque : on passe directement au serveur suivant ; sinon le second essai est limité à 10 s. Les flux MPEG-TS continus (Northlive, Movix, RénéVéo, marqués « mpegts » par le serveur) sont lus directement avec mpegts.js : avant, ils étaient pris pour des listes HLS que hls.js attendait sans fin, d’où leurs échecs systématiques sur LG. Un flux relayé dont le type n’est pas indiqué est reconnu à ses premiers octets (« #EXTM3U » pour HLS, octet de synchronisation 0x47 pour MPEG-TS). L’historique de fiabilité des serveurs a été remis à zéro, pour effacer ces échecs.

**Différences avec l’appli Android TV** (limites des téléviseurs, pas de code natif possible) :
- Les **lecteurs web externes** (certaines sources sport) s’ouvrent dans une fenêtre intégrée. Leur moteur web est celui du micrologiciel du téléviseur (souvent ancien : webOS 5 ≈ Chrome 68, Tizen 5 ≈ Chrome 69) et ne se met pas à jour à part : beaucoup de lecteurs récents n’y fonctionnent pas, d’où la mention « Moteur web ancien ». Sur LG, le pointeur de la Magic Remote permet de cliquer dedans ; sur Samsung, sans pointeur, ils sont souvent inutilisables : préférez les serveurs « Lecteur natif ». Le contournement du blocage DNS des fournisseurs d’accès n’existe pas ici : réglez au besoin le DNS du téléviseur sur `1.1.1.1` (paramètres réseau).
- Le **multiview** dépend du nombre de décodeurs vidéo du téléviseur (souvent 2 à 4 flux simultanés) : au-delà, la vignette l’indique.
- Films et épisodes passent par le lecteur Noctra (flux HLS de Jellyfin) et non par le lecteur Jellyfin.

L’interface web complète de Noctra dans une WebView (appli `Noctra-android.apk`) est trop lourde pour les boîtiers et vidéoprojecteurs Android. Elle reste l’appli recommandée sur téléphone et tablette.

## Fonctionnement

On reprend le principe des applications Jellyfin pour webOS et pour mobile :

1. Au lancement, l’appli ouvre directement le serveur prévu dans `apps/shared/launcher/config.js` (`https://akarukasu.merlion.usbx.me/noctra`) : on arrive sur la page de connexion Jellyfin, sans rien saisir à la télécommande.
2. L’interface Noctra s’affiche en plein écran. La connexion Jellyfin, les demandes, la TV et le lecteur sont ceux que vous connaissez déjà.
3. Si le serveur est injoignable, l’écran de saisie apparaît pour corriger l’adresse ou réessayer.

Comme l’interface vient du serveur, chaque mise à jour de Noctra (branche `production`, déployée automatiquement) arrive tout de suite dans toutes les applis. Il n’y a rien à réinstaller. Il faut réinstaller une appli uniquement quand son dossier `apps/` change.

Le serveur doit être en **200.0.121 ou plus récent**. Cette version ajoute le pont `public/noctra-app-bridge.js`, qui gère la télécommande, la touche Retour et la veille, et autorise l’écran de connexion à interroger `/health`. Avec un serveur plus ancien, les applis se connectent quand même, mais sans ces adaptations.

### Sur les téléviseurs

- Noctra garde sa mise en page habituelle, celle du PC. La disposition « TV » de Jellyfin n’est pas utilisée, car l’interface Noctra ne la gère pas. Android TV est affiché en 1280 px : c’est la mise en page PC, agrandie 1,5× pour être lisible depuis le canapé.
- **Flèches et OK** : navigation. L’élément sélectionné est entouré d’un cadre bleu. Le pointeur de la Magic Remote LG fonctionne aussi.
- **Retour** : ferme d’abord le panneau Noctra ouvert (demandes, TV, confirmation…), puis revient en arrière. À l’accueil, il quitte l’appli.
- Les touches lecture, pause, avance et retour rapides pilotent le lecteur. Sur Samsung, elles peuvent rester sans effet, car le système ne les transmet pas toujours à une page web distante. Les commandes à l’écran restent disponibles.
- Le flou d’arrière-plan est désactivé sur téléviseur : c’est l’effet le plus coûteux pour leur processeur graphique.
- Sur Android, l’écran reste allumé pendant la lecture.
- **Passer l’intro, le récap ou le générique** (Android TV, LG, Samsung) : un bouton « Passer l’intro · OK » apparaît pendant le segment ; OK le passe. Au générique de fin d’un épisode, « Épisode suivant ». Les temps viennent, dans l’ordre : des segments du serveur Jellyfin (extension de détection comme *Intro Skipper*, recommandée : elle repère seule les génériques de toutes les séries), des chapitres du fichier (« Opening », « Générique », « Credits »…), puis du générique appris pour la série : un saut en avant de plus de 20 s dans les 10 premières minutes d’un épisode (générique passé à la main) est retenu sur le téléviseur et propose le bouton aux épisodes suivants. Sur Android TV, le lecteur Jellyfin reçoit ces temps et affiche son propre bouton « Passer ».
- **Continuer à regarder** : Jellyfin efface la position d’un titre arrêté avant 5 % de sa durée (réglage par défaut du serveur). Après une minute de lecture, Noctra remet cette position, pour que le titre apparaisse dans « Continuer à regarder » ; l’accueil est relu 2,5 s et 8 s après la fin de la lecture, le temps que Jellyfin enregistre. Sur LG et Samsung, la position est aussi envoyée dès que l’appli passe en arrière-plan (touche Accueil, mise en veille).

### Compatibilité

- **Samsung** : Noctra TV sur les téléviseurs 2019 et plus récents (Tizen 5+) ; l’interface web complète demande 2021+ (Tizen 6.5+).
- **Samsung 2014 (série H, plateforme Orsay, pas Tizen)** : variante dédiée `apps/samsung-orsay`, construite par `npm run apps:samsung2014` et vérifiée par `npm run test:orsay` (émulation navigateur, pas encore essayée sur un téléviseur). Installation, relais local, mise à jour et limites : [guide](samsung-orsay/GUIDE-INSTALLATION-UE40H6400.md) et [rapport de compatibilité](samsung-orsay/RAPPORT-COMPATIBILITE-UE40H6400.md).
- **LG** : Noctra TV sur les téléviseurs 2020 et plus récents (webOS 5+) ; l’interface web complète demande webOS 22 (2022+).
- **Android et Android TV** : Android 7 ou plus récent, avec « Android System WebView » (ou Chrome) à jour.
- **iPhone et iPad** : iOS 15 ou plus récent.

L’interface Noctra utilise des fonctions JavaScript récentes (Chromium 85). Sur un téléviseur plus ancien, l’écran de connexion l’indique au lieu d’afficher une page vide.

## Récupérer les fichiers

Toutes les applis sont construites automatiquement par GitHub Actions (workflow **Applications Noctra**), à chaque modification du dossier `apps/` :

1. Sur GitHub, ouvrez l’onglet **Actions**, puis **Applications Noctra**.
2. Ouvrez la dernière exécution réussie et téléchargez les **Artifacts** en bas de la page : `noctra-android`, `noctra-ios` et `noctra-tv`.

Pour publier une version dans l’onglet **Releases**, poussez une étiquette. Par exemple : `git tag apps-v1.0.0 && git push origin apps-v1.0.0`.

Sans GitHub, sur n’importe quel PC :
- **Paquets TV** (Node.js seul, sans SDK) : `npm run apps:build` crée `dist/apps/*.ipk` et `dist/apps/Noctra.wgt`.
- **APK Android** (Node.js + Java 17 ou plus récent, sans Android Studio ni SDK) : `npm run apps:android` crée `dist/apps/Noctra-android.apk`.
- **Noctra TV** (même prérequis) : `npm run apps:androidtv` crée `dist/apps/Noctra-androidtv.apk` à partir de l’APK officiel de Jellyfin Android TV, téléchargé depuis GitHub et vérifié par son empreinte SHA-256. Au premier lancement, le script télécharge ses outils depuis Maven Central, soit environ 160 Mo, et vérifie leur empreinte.
- **iOS** : il faut un Mac avec Xcode (`cd apps/ios && xcodegen generate`) ou GitHub Actions.

## Installer

### Android (téléphone, tablette)
1. Copiez `Noctra-android.apk` sur le téléphone, ou téléchargez-le depuis GitHub.
2. Ouvrez-le. Android demande d’autoriser l’installation d’applications inconnues pour le navigateur ou le gestionnaire de fichiers utilisé.

### Android TV / Google TV / Fire TV (Noctra TV)
Sur GitHub, l’APK se télécharge dans le workflow **Noctra Android** › Artifacts › `noctra-androidtv` : toujours signé avec la même clé, il s’installe par-dessus la version précédente (un APK signé avec une autre clé est refusé : « Application non installée »).

Installez `Noctra-androidtv.apk` avec l’une de ces méthodes :
- Installez l’appli **Downloader** (AFTVnews) sur la TV, puis ouvrez le lien de `Noctra-androidtv.apk`.
- Utilisez **Send Files to TV** depuis votre téléphone.
- Avec un PC : activez les *Options pour les développeurs* puis le *Débogage USB/réseau* sur la TV, et lancez `adb connect IP_DE_LA_TV` puis `adb install Noctra-androidtv.apk`.

Noctra apparaît ensuite dans la rangée des applications, avec sa bannière.

**Signature et mises à jour.** Android n’installe une nouvelle version par-dessus l’ancienne que si les deux sont signées avec la même clé. Sinon, il faut désinstaller l’ancienne version, ce qui efface la connexion.
- Lors d’une construction locale sans clé fournie, `npm run apps:android` crée une clé dans `dist/android-tools/noctra-release.p12`, avec son mot de passe dans `noctra-release.password`. Il la réutilise ensuite. Conservez ces deux fichiers.
- Pour utiliser votre propre clé, définissez `NOCTRA_KEYSTORE_FILE` (fichier `.p12` ou `.jks`), `NOCTRA_KEYSTORE_PASSWORD`, `NOCTRA_KEY_ALIAS` et, si besoin, `NOCTRA_KEY_PASSWORD`.
- Pour que GitHub Actions signe avec la même clé, ajoutez dans GitHub → *Settings* → *Secrets and variables* → *Actions* :
  - `NOCTRA_KEYSTORE_BASE64` : le fichier de clé encodé (`base64 -w0 noctra-release.p12`) ;
  - `NOCTRA_KEYSTORE_PASSWORD` : son mot de passe ;
  - `NOCTRA_KEY_ALIAS` : `noctra`.

Ne mettez jamais la clé dans le dépôt.

### iPhone et iPad
Sans compte développeur payant, Apple n’autorise l’installation que par *sideloading*. L’IPA n’est pas signée : l’outil la signe avec votre identifiant Apple.
1. Installez [Sideloadly](https://sideloadly.io) (Windows/macOS) ou [AltStore](https://altstore.io).
2. Branchez l’iPhone, glissez `Noctra-ios-unsigned.ipa` dans l’outil et saisissez votre identifiant Apple.
3. Sur l’iPhone, ouvrez *Réglages → Général → VPN et gestion de l’appareil* et faites confiance au profil. Sur iOS 16 et plus, activez aussi *Réglages → Confidentialité et sécurité → Mode développeur*.

Avec un identifiant Apple gratuit, la signature expire au bout de 7 jours. AltStore la renouvelle automatiquement. Avec un compte développeur, ouvrez le projet dans Xcode (`cd apps/ios && xcodegen generate && open Noctra.xcodeproj`), choisissez votre équipe et installez directement.

La PWA (Safari → Partager → Sur l’écran d’accueil) reste une alternative sans installation.

### Téléviseurs LG (webOS)
Il faut un PC (Windows, macOS ou Linux) sur le même réseau que la TV, et un compte développeur LG gratuit.

1. **Compte LG développeur** : créez-le sur [webostv.developer.lge.com](https://webostv.developer.lge.com) (*Sign in* › *Create account*). C’est gratuit.
2. **Mode développeur sur la TV** : dans le LG Content Store, installez l’appli **Developer Mode**. Ouvrez-la, connectez-vous avec le compte LG, activez **Dev Mode Status** (la TV redémarre), rouvrez l’appli et activez **Key Server**. Notez l’adresse IP et la *passphrase* affichées.
3. **Installation**, au choix :
   - **Sans ligne de commande (conseillé)** : sur le PC, installez [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop/releases) ; *Add device* › saisissez l’IP de la TV et la *passphrase* ; puis onglet **Apps** › **Install** › choisissez `com.noctra.media_1.1.49_all.ipk`.
   - **En ligne de commande** :
     ```bash
     npm install -g @webos-tools/cli
     ares-setup-device        # « add » : nom « tv », IP de la TV, port 9922, utilisateur prisoner
     ares-novacom --device tv --getkey   # saisir la passphrase affichée sur la TV
     ares-install --device tv com.noctra.media_1.1.49_all.ipk
     ```
4. Noctra apparaît dans la liste des applis de la TV (bouton Accueil › *Applications*). Au premier lancement : Quick Connect ou identifiants Jellyfin.

**Mise à jour** : installez simplement le nouvel IPK par-dessus (même méthode). **Attention** : la session développeur LG expire au bout de 50 heures, et les applis installées sont alors retirées. Ouvrez de temps en temps l’appli Developer Mode et appuyez sur **Extend** (webOS Dev Manager peut le faire pour vous). Une TV rootée avec Homebrew Channel n’a pas cette limite.

### Téléviseurs Samsung (Tizen)
Il faut un PC Windows (ou un téléphone Android) sur le même réseau que la TV, et un compte Samsung.

1. **Mode développeur sur la TV** : ouvrez **Applications** (Apps), puis tapez `1` `2` `3` `4` `5` avec la télécommande (pavé numérique à l’écran si besoin). Activez **Developer mode**, saisissez l’**adresse IP du PC** (Windows : `ipconfig`), validez, puis **éteignez et rallumez la TV** (pas seulement la veille : débranchez-la 30 s si nécessaire).
2. **Installation avec Apps2Samsung (conseillé)** : sur le PC, téléchargez [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung/releases) et lancez-le. Il détecte la TV ; choisissez **fichier .wgt personnalisé** (*custom .wgt*), sélectionnez `Noctra.wgt` et lancez l’installation. À la première utilisation, il vous connecte à votre compte Samsung pour créer le certificat de signature lié à votre TV : c’est normal, un .wgt doit être signé pour votre téléviseur.
3. **Autre méthode (Tizen Studio)** : installez [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html) avec l’extension *Samsung TV* ; *Device Manager* › *Remote Device Manager* › ajoutez l’IP de la TV ; *Certificate Manager* › créez un certificat **Samsung** (profil TV, avec le DUID de la TV) ; puis signez et installez :
   ```bash
   tizen package -t wgt -s MonProfil -- Noctra.wgt
   tizen install -n Noctra.wgt -t <nom-de-la-TV>
   ```
4. Noctra apparaît dans **Applications**. Au premier lancement : Quick Connect ou identifiants Jellyfin.

**Mise à jour** : réinstallez le nouveau `Noctra.wgt` de la même façon (même compte Samsung, sinon désinstallez d’abord l’ancienne version). Le mode développeur n’a pas besoin de rester actif après l’installation.

## Personnaliser

- **Serveur proposé par défaut** : `apps/shared/launcher/config.js` (`defaultServerUrl`). `tvInterface: false` y fait ouvrir l’interface web complète au lieu de Noctra TV sur LG et Samsung.
- **Versions** : `apps/android/app/build.gradle.kts` (`versionCode`, `versionName`), `apps/ios/project.yml` (`MARKETING_VERSION`), `apps/webos/appinfo.json`, `apps/tizen/config.xml` et `appVersion` dans `config.js`.
- **Icônes et bannières** : `node apps/scripts/render-icons.mjs`, à partir de `public/noctra-mark.svg` (nécessite Playwright).

## Organisation du dossier

```text
apps/
  shared/launcher/   écran de connexion commun (HTML/CSS/JS ES5)
  webos/             appinfo.json, icônes et écran de démarrage LG
  tizen/             config.xml et icône Samsung
  android/           projet Android (Java, classes du système uniquement) : un APK téléphone + Android TV,
                     construit par scripts/build-android.mjs ou par Android Studio (Gradle)
  ios/               projet XcodeGen (Swift, WKWebView)
  androidtv/web/     interface Noctra TV (Android TV ; intégrée aux paquets LG et Samsung dans tv/, servie aussi par le serveur à /tv-app/),
                     tv-native.js : remplace l’appli Android sur LG et Samsung (connexion, lecteur, multiview)
  scripts/           build-tv.mjs (IPK + WGT sans SDK), build-android.mjs (APK sans SDK), render-icons.mjs
public/noctra-app-bridge.js   pont côté serveur, chargé avant le moteur Jellyfin
```

## Limites connues

- Ces applis ont été testées dans Chromium en simulant chaque plateforme (agent utilisateur, touches Retour 461 et 10009, 1920 px, mise en page TV). L’APK a été construit et vérifié (signature v2, alignement, manifeste, lecture par apktool), mais pas lancé sur un appareil. L’IPA ne se compile que sur macOS. Les applis restent à essayer sur de vrais téléviseurs et téléphones.
- L’ancienne appli iOS (interface web, iOS 15 à 18) n’a pas de lecture hors ligne ; l’appli native pour iOS 26 télécharge les films et épisodes.
- Les touches média des télécommandes Samsung dépendent du modèle (voir plus haut).
