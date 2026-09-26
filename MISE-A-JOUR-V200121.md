# Noctra 200.0.121 — applications Android, Android TV, iOS, LG webOS et Samsung Tizen

## Les applications
Le dossier `apps/` contient cinq applications construites sur le modèle des applis Jellyfin. Un écran de connexion commun vérifie l’adresse du serveur Noctra, puis ouvre l’interface du serveur en plein écran.

- **Android et Android TV** : un seul APK (Java, WebView, sans bibliothèque externe). Il se construit sans Android Studio ni SDK avec `npm run apps:android`. Il apparaît dans le lanceur Android TV avec sa bannière. Il gère la touche Retour, la vidéo plein écran, l’envoi de fichiers, les téléchargements et garde l’écran allumé pendant la lecture.
- **iOS** : WKWebView (Swift, XcodeGen). Il permet la lecture en arrière-plan, l’image dans l’image, AirPlay et le geste de retour.
- **LG webOS** : paquet `.ipk`.
- **Samsung Tizen** : paquet `.wgt`, installé avec Apps2Samsung.

Installation, compatibilité et construction : [apps/README.md](apps/README.md). GitHub Actions peut aussi construire les quatre fichiers (workflow « Applications Noctra »). L’IPA iOS n’est possible que sur macOS.

## Côté serveur
- **`public/noctra-app-bridge.js`** est chargé avant le moteur Jellyfin. Il reconnaît l’appli (`?noctraApp=` ou agent utilisateur `NoctraApp/x (plateforme)`) et fait le reste :
  - **Retour** (touches LG 461 et Samsung 10009, touche Retour Android) : ferme d’abord le panneau Noctra ouvert, puis revient en arrière. À l’accueil, il quitte l’appli.
  - **Télécommande** : cadre de focus visible aux flèches, les flèches restent dans le panneau ouvert, OK active les éléments cliquables qui ne sont pas des boutons, touches média déclarées sur Samsung quand c’est possible.
  - **Android TV** : l’écran est affiché en 1920 px au lieu de 960 px, sinon Noctra passait en mise en page mobile.
  - **Téléviseurs** : le flou d’arrière-plan est désactivé.
  - **Compatibilité Chromium 85** (Samsung 2021, LG 2022) : ajout de `Array.prototype.at` et `AbortSignal.timeout`.
  - **Veille** : l’écran reste allumé pendant une lecture.
- **`/health`** répond avec l’en-tête CORS, pour que l’écran de connexion des applis puisse le lire. Aucune donnée sensible n’y figure.
- Navigateurs web, PWA et PC : aucun changement de comportement. Le pont ne s’active que dans une appli ou sur le navigateur d’un téléviseur.

## Retours du premier essai sur Android TV (vidéoprojecteur)
**Icônes remplacées par des carrés.** Les fichiers de la police Material Icons étaient corrompus depuis l’import de la base 200.0.107 : ils avaient été réécrits comme du texte. Par exemple, l’en-tête du `.woff2` annonce 126 911 octets pour un fichier de 226 346. Le navigateur rejetait donc la police partout. Sur PC, Noctra redessine la plupart des icônes en SVG, ce qui masquait le problème. Les quatre fichiers ont été restaurés à partir de `material-design-icons-iconfont` 6.7.0 : le `.woff` est identique octet pour octet. Leurs adresses changent (`?v=200.121`) pour contourner le cache.

**Pas de dock, en-tête réduit, navigation médiocre.** L’agent utilisateur de l’appli contenait « tv », ce qui fait passer Jellyfin dans sa disposition TV, que l’interface Noctra ne gère pas. Désormais :
- L’appli Android TV s’annonce « android-leanback » et retire « tv » du nom du modèle. Sur tous les téléviseurs, le pont impose la mise en page habituelle de Noctra (celle du PC).
- Android TV est affiché en 1280 px : c’est la mise en page PC, agrandie 1,5× sur un écran 1080p.
- La navigation aux flèches est assurée par le pont. Il cherche l’élément le plus proche dans la direction choisie : gauche/droite restent sur la rangée, et les boutons secondaires des affiches sont ignorés. La navigation reste dans le panneau ouvert, dock compris. Le dock et l’en-tête, fixes, ne font pas défiler la page. Si rien n’est atteignable, la page défile.
- L’appli Android embarque une copie du pont et l’injecte quand le serveur n’en a pas encore.

**Moteurs anciens.** Correctifs pour les moteurs Chromium 85 à 88 :
- `:is()` (Chromium 88) et `:focus-visible` (Chromium 86) sont retirés des sélecteurs du script.
- `replaceChildren` (Chromium 86) est complété.
- Dans les applis, une erreur des scripts Noctra s’affiche à l’écran avec la version du moteur. L’écran de connexion affiche aussi cette version.

**Connexion directe.** Au premier lancement, l’appli ouvre directement `https://akarukasu.merlion.usbx.me/noctra` et arrive sur la page de connexion Jellyfin, sans saisie à la télécommande. Les lancements suivants se connectent immédiatement. L’écran de saisie n’apparaît que si le serveur est injoignable.

## Validation
- Nouveau test `tests/v200121-apps.mjs`, lancé par `npm run test:v200121` qui enchaîne aussi les tests 120 à 108. Il couvre la position du pont, la syntaxe compatible avec les anciens téléviseurs, la sonde `/health`, la normalisation des adresses, la structure des paquets `.ipk` et `.wgt`, ainsi que les manifestes Android, Tizen, webOS et iOS.
- Essais dans Chromium avec un serveur Noctra local, en simulant chaque plateforme :
  - écran de connexion LG en 1920 px, puis connexion effective au serveur ;
  - erreurs affichées pour un serveur injoignable ou une adresse qui n’est pas Noctra ;
  - mise en page TV sur webOS, Tizen et Android TV, mise en page mobile sur téléphone Android ;
  - la touche Retour ferme le panneau Noctra sans que le moteur Jellyfin revienne aussi en arrière ;
  - les flèches restent dans le panneau ouvert.
- APK construit hors ligne puis vérifié :
  - signature v2 validée par apksig ;
  - `resources.arsc` non compressé et aligné ;
  - manifeste lu par aapt2 : Android 7+, cible Android 14, entrée Android TV et bannière ;
  - décodage complet par apktool.
- Canal appli ↔ page testé dans Chromium : un port venu d’une iframe est ignoré, et les messages envoyés avant l’arrivée du port sont transmis ensuite.
- Les applis restent à essayer sur de vrais appareils.
