# Applications Noctra

Noctra existe en applications pour :

| Appareil | Fichier | Installation |
|---|---|---|
| Téléphone et tablette Android | `Noctra-android.apk` | fichier APK |
| Android TV, Google TV, Shield, Fire TV, vidéoprojecteurs | `Noctra-androidtv.apk` (**Noctra TV**, appli native) | fichier APK |
| iPhone et iPad | `Noctra-ios-unsigned.ipa` | Sideloadly ou AltStore |
| Téléviseurs LG (webOS) | `com.noctra.media_1.1.27_all.ipk` (**Noctra TV**) | mode développeur LG |
| Téléviseurs Samsung (Tizen) | `Noctra.wgt` (**Noctra TV**) | [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) |

## Android TV : Noctra TV (appli native)

Sur Android TV, utilisez **Noctra TV** (`Noctra-androidtv.apk`). C’est l’appli Jellyfin officielle pour Android TV adaptée pour Noctra : marque Noctra et serveur `akarukasu.merlion.usbx.me/jellyfin` intégré. On arrive directement sur la page d’authentification, puis sur l’accueil Noctra : médiathèques, fiches, TV en direct (avec le multiview jusqu’à 12 chaînes), SyncPlay, Découvrir, Demandes, Roulette et recherche. L’interface est native et fluide ; films et épisodes sont lus avec le lecteur Jellyfin (langue audio et sous-titres au choix), puis on revient sur Noctra. Les détails, la construction et la licence sont dans [androidtv/README.md](androidtv/README.md).

## LG webOS et Samsung Tizen : Noctra TV

Les applis LG et Samsung ouvrent la **même interface Noctra TV** que l’appli Android TV : accueil (carrousel « Continuer à regarder », médiathèques 2 × 2), fiches films et séries, TV en direct (« Toutes les chaînes » : les sources réunies, la plus stable proposée d’abord ; favoris et chaînes récentes, filtres par catégorie, guide des programmes, zapping ▲ ▼, panneaux des chaînes et des serveurs, bascule automatique de serveur), multiview, SyncPlay, Découvrir, Demandes, Roulette et recherche.

Il n’y a pas d’appli Jellyfin native sur ces téléviseurs : le fichier `androidtv/web/tv-native.js` remplace l’appli Android en JavaScript, avec le même protocole.
- **Connexion** : par **Quick Connect** (un code s’affiche à l’écran ; sur le téléphone ou le PC, Jellyfin › Paramètres › Quick Connect, saisir le code) ou par nom d’utilisateur et mot de passe. La session est mémorisée ; Compte › Paramètres permet de se déconnecter.
- **Lecture** : lecteur vidéo du téléviseur (HLS et MPEG-TS natifs), avec hls.js et mpegts.js du serveur en secours. Films et épisodes : reprise, avance ◀ ▶ (10 s) et ⏪ ⏩ (30 s), langue audio et sous-titres modifiables pendant la lecture (OK › Audio / Sous-titres), suivi de lecture Jellyfin (reprises, « Vu »). À la fin d’un épisode (y compris repris depuis « Continuer à regarder »), l’épisode suivant démarre seul après 10 secondes ; la fin est détectée même quand le téléviseur ne la signale pas.
- **Chaînes** : bandeau du programme, ▲ ▼ ou CH+ / CH− pour zapper, touches chiffrées pour aller à une chaîne par son numéro, ◀ pour la liste des chaînes, ▶ pour les serveurs, OK pour la barre de commandes. Serveurs classés selon leur fiabilité passée (« Fiable », « Instable », « Échec récent »). En multiview, un flux coupé demande un lien neuf puis réessaie seul.
- **Touches** : Retour (LG 461, Samsung 10009) ferme la fenêtre ou le lecteur, puis quitte à l’accueil ; lecture/pause, stop, avance et retour rapides ; les touches Samsung sont déclarées par l’appli avant l’ouverture de l’interface.

L’interface Noctra TV (la même que l’appli Android TV : accueil, médiathèques, TV en direct, lecteur, multiview…) est **intégrée au paquet** (`tv/`). Au lancement : si le serveur la propose lui aussi (`/health` : `tvApp`), celle du serveur est ouverte (`…/noctra/tv-app/`, toujours la plus récente) ; sinon celle de l’appli, qui dialogue avec l’API Noctra et Jellyfin du serveur choisi. Le lanceur vérifie d’abord que le téléviseur peut joindre l’API Noctra depuis l’appli (requête avec l’en-tête de jeton) : un serveur à jour l’autorise (en-têtes CORS sur `/api`, authentification par jeton, sans cookie) ; avec un serveur plus ancien, cela dépend du téléviseur, et à défaut l’appli ouvre l’interface web complète comme avant.

Sur LG et Samsung, l’affichage est allégé pour les processeurs de téléviseur : pas de fond en dégradés plein écran ni de flou, sélection marquée par un contour, carrousel de l’accueil arrêté pendant la navigation (travail de dessin divisé par 2 à 3 lors de la navigation). Les animations légères restent : agrandissement de l’élément sélectionné, glissement des rangées et fondu du carrousel (déplacements et fondus seulement, pris en charge par le processeur graphique) ; le défilement doux est coupé quand une touche est maintenue. Au lancement d’une chaîne, la sélection automatique attend le test du premier serveur (4 s au plus) et écarte les serveurs hors ligne et les flux qui exigent des en-têtes (Referer, Origin, cookies) que le téléviseur ne peut pas envoyer sans le relais du serveur Noctra. Si un flux échoue sur une coupure réseau, il n’est pas relancé avec l’autre bibliothèque : on passe directement au serveur suivant ; sinon le second essai est limité à 10 s.

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

### Compatibilité

- **Samsung** : Noctra TV sur les téléviseurs 2019 et plus récents (Tizen 5+) ; l’interface web complète demande 2021+ (Tizen 6.5+).
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
   - **Sans ligne de commande (conseillé)** : sur le PC, installez [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop/releases) ; *Add device* › saisissez l’IP de la TV et la *passphrase* ; puis onglet **Apps** › **Install** › choisissez `com.noctra.media_1.1.27_all.ipk`.
   - **En ligne de commande** :
     ```bash
     npm install -g @webos-tools/cli
     ares-setup-device        # « add » : nom « tv », IP de la TV, port 9922, utilisateur prisoner
     ares-novacom --device tv --getkey   # saisir la passphrase affichée sur la TV
     ares-install --device tv com.noctra.media_1.1.27_all.ipk
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
- Il n’y a pas de lecture hors ligne ni de téléchargement de films dans l’appli iOS.
- Les touches média des télécommandes Samsung dépendent du modèle (voir plus haut).
