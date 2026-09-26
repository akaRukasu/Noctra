# Applications Noctra

Noctra existe en applications pour :

| Appareil | Fichier | Installation |
|---|---|---|
| Téléphone et tablette Android | `Noctra-android.apk` | fichier APK |
| Android TV, Google TV, Shield, Fire TV, vidéoprojecteurs | `Noctra-androidtv.apk` (**Noctra TV**, appli native) | fichier APK |
| iPhone et iPad | `Noctra-ios-unsigned.ipa` | Sideloadly ou AltStore |
| Téléviseurs LG (webOS) | `com.noctra.media_1.0.0_all.ipk` | mode développeur LG |
| Téléviseurs Samsung (Tizen) | `Noctra.wgt` | [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) |

## Android TV : Noctra TV (appli native)

Sur Android TV, utilisez **Noctra TV** (`Noctra-androidtv.apk`). C’est l’appli Jellyfin officielle pour Android TV adaptée pour Noctra : marque Noctra et serveur `akarukasu.merlion.usbx.me/jellyfin` intégré. On arrive directement sur la page d’authentification. L’interface est native et fluide, et la lecture passe par le lecteur vidéo d’Android. Les détails, la construction et la licence sont dans [androidtv/README.md](androidtv/README.md).

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

- **Samsung** : téléviseurs 2021 et plus récents (Tizen 6.5+).
- **LG** : téléviseurs webOS 22 et plus récents (2022+).
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
1. Créez un compte gratuit sur [webostv.developer.lge.com](https://webostv.developer.lge.com).
2. Sur la TV, installez l’appli **Developer Mode** depuis le LG Content Store, connectez-vous avec ce compte, puis activez *Dev Mode Status* et *Key Server*. La TV redémarre.
3. Sur le PC, installez l’outil LG et déclarez la TV. La phrase de passe s’affiche dans l’appli Developer Mode.
   ```bash
   npm install -g @webos-tools/cli
   ares-setup-device        # ajouter la TV : adresse IP affichée dans Developer Mode, port 9922
   ares-novacom --device tv --getkey
   ares-install --device tv com.noctra.media_1.0.0_all.ipk
   ```
   Sans ligne de commande, [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) installe l’IPK en quelques clics.

La session développeur LG expire au bout de 50 heures si elle n’est pas prolongée. Le bouton *Extend* de l’appli Developer Mode la prolonge, et webOS Dev Manager peut le faire automatiquement. Une TV rootée avec Homebrew Channel n’a pas cette limite.

### Téléviseurs Samsung (Tizen), avec Apps2Samsung
1. Sur la TV, ouvrez **Applications**, puis tapez `1` `2` `3` `4` `5` avec la télécommande. Activez **Developer mode** et saisissez l’adresse IP du PC. Éteignez puis rallumez la TV.
2. Sur le PC (ou avec l’appli Android d’Apps2Samsung), lancez [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) et choisissez la TV.
3. Choisissez **fichier .wgt personnalisé**, sélectionnez `Noctra.wgt`, puis lancez l’installation. Apps2Samsung signe le paquet avec votre compte Samsung (une seule connexion) et l’installe.

Le PC et la TV doivent être sur le même réseau. Apps2Samsung explique la marche à suivre si le mode développeur n’est pas prêt.

## Personnaliser

- **Serveur proposé par défaut** : `apps/shared/launcher/config.js` (`defaultServerUrl`).
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
  scripts/           build-tv.mjs (IPK + WGT sans SDK), build-android.mjs (APK sans SDK), render-icons.mjs
public/noctra-app-bridge.js   pont côté serveur, chargé avant le moteur Jellyfin
```

## Limites connues

- Ces applis ont été testées dans Chromium en simulant chaque plateforme (agent utilisateur, touches Retour 461 et 10009, 1920 px, mise en page TV). L’APK a été construit et vérifié (signature v2, alignement, manifeste, lecture par apktool), mais pas lancé sur un appareil. L’IPA ne se compile que sur macOS. Les applis restent à essayer sur de vrais téléviseurs et téléphones.
- Il n’y a pas de lecture hors ligne ni de téléchargement de films dans l’appli iOS.
- Les touches média des télécommandes Samsung dépendent du modèle (voir plus haut).
