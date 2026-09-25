# Noctra Media Client v26

## Client Windows

- ajout de `Noctra.exe`, un lanceur Windows x64 à interface graphique avec l’icône Noctra intégrée ;
- aucun fichier BAT et aucune fenêtre de terminal ne sont nécessaires ;
- démarrage invisible du serveur Node ;
- ouverture dans une fenêtre Edge/Chrome en mode application ;
- profil navigateur Noctra isolé ;
- arrêt automatique du serveur à la fermeture de la fenêtre ;
- aucun droit administrateur, service, registre ou tâche planifiée.

## Médiathèque

- calcul dynamique du nombre de colonnes selon la largeur réelle de la grille ;
- retrait d'une colonne uniquement quand la disposition la plus dense laisserait une affiche seule ;
- recalcul après chargement progressif, changement de page, navigation et redimensionnement ;
- pour les 23 affiches de la capture, la grille passe de 11 colonnes à 10, soit 10 + 10 + 3 au lieu de 11 + 11 + 1.

## PWA et version

- cache du service worker et ressources PWA passés en v26 ;
- version serveur et clients harmonisée en 26.0.0.
