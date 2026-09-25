# Client Windows Noctra v43

## Lancement avec Google Chrome

1. Extraire toute l'archive dans un dossier fixe.
2. Garder `.env`, `server.mjs`, `public` et `Noctra.exe` ensemble.
3. Double-cliquer sur **Noctra.exe**.

Le lanceur démarre le serveur Noctra invisiblement puis ouvre **Google Chrome en priorité**, dans une fenêtre autonome de type application. Le manifeste PWA, le service worker et le cache Noctra sont donc gérés par Chrome.

Noctra utilise le profil dédié suivant :

```text
runtime\chrome-pwa-profile
```

Ce profil garde la connexion Jellyfin, le cache PWA et les réglages de l'application séparés de ta navigation Chrome habituelle. Edge n'est utilisé qu'en solution de secours si Chrome est absent.

Aucun fichier BAT ni aucune console ne sont nécessaires. Lorsque la fenêtre Chrome Noctra est fermée, le serveur démarré par `Noctra.exe` est arrêté.

## Prérequis actuel

Node.js 20 ou plus récent doit être disponible sur le PC. Le lanceur cherche dans cet ordre :

1. `runtime\node.exe` ;
2. `node.exe` à côté de Noctra ;
3. Node.js installé dans le PATH Windows.

`Noctra.exe` est un lanceur Windows x64 non signé. Windows peut afficher un avertissement SmartScreen au premier lancement. Aucun droit administrateur n'est nécessaire.
