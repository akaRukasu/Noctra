# Noctra 200.0.121 — applications Android, Android TV, iOS, LG webOS et Samsung Tizen

## Les applications
Le dossier `apps/` contient cinq applications construites sur le modèle des applis Jellyfin. Un écran de connexion commun vérifie l’adresse du serveur Noctra, puis ouvre l’interface du serveur en plein écran.

- **Android et Android TV** : un seul APK (Kotlin, WebView). Il apparaît dans le lanceur Android TV avec sa bannière. Il gère la touche Retour, la vidéo plein écran, l’envoi de fichiers, les téléchargements et garde l’écran allumé pendant la lecture.
- **iOS** : WKWebView (Swift, XcodeGen). Il permet la lecture en arrière-plan, l’image dans l’image, AirPlay et le geste de retour.
- **LG webOS** : paquet `.ipk`.
- **Samsung Tizen** : paquet `.wgt`, installé avec Apps2Samsung.

Installation, compatibilité et construction : [apps/README.md](apps/README.md). GitHub Actions construit les quatre fichiers (workflow « Applications Noctra »).

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

## Validation
- Nouveau test `tests/v200121-apps.mjs`, lancé par `npm run test:v200121` qui enchaîne aussi les tests 120 à 108. Il couvre la position du pont, la syntaxe compatible avec les anciens téléviseurs, la sonde `/health`, la normalisation des adresses, la structure des paquets `.ipk` et `.wgt`, ainsi que les manifestes Android, Tizen, webOS et iOS.
- Essais dans Chromium avec un serveur Noctra local, en simulant chaque plateforme :
  - écran de connexion LG en 1920 px, puis connexion effective au serveur ;
  - erreurs affichées pour un serveur injoignable ou une adresse qui n’est pas Noctra ;
  - mise en page TV sur webOS, Tizen et Android TV, mise en page mobile sur téléphone Android ;
  - la touche Retour ferme le panneau Noctra sans que le moteur Jellyfin revienne aussi en arrière ;
  - les flèches restent dans le panneau ouvert.
- Les applis restent à essayer sur de vrais appareils.
