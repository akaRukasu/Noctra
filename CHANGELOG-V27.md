# Noctra Media Client v27

## Client Windows Chrome/PWA

- `Noctra.exe` recherche désormais Google Chrome avant Microsoft Edge ;
- lancement de Noctra dans une fenêtre Chrome autonome avec `--app` ;
- chargement direct de l'accueil PWA Noctra ;
- manifeste, service worker, cache et session conservés dans un profil Chrome dédié à Noctra ;
- Edge n'est utilisé qu'en secours si Chrome n'est pas installé ;
- le serveur Node reste invisible et s'arrête à la fermeture de la fenêtre Chrome Noctra ;
- aucun fichier BAT n'est lancé.

## Version

- version serveur et paquet harmonisée en 27.0.0 ;
- cache PWA et paramètres anti-cache passés en v27.
