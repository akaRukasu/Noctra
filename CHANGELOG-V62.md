# Noctra v62

## Dock membre

- Correction de la règle historique qui imposait `display:flex` au seul bouton TV.
- Accueil, Médiathèques, Demandes et TV utilisent désormais la même cellule de 42 px, le même centrage, le même rayon et les mêmes états actifs.
- Géométrie identique sur ordinateur, tablette et mobile.

## Demandes et suggestions intelligentes

- Remplacement de la grille fixe de 18 suggestions par une expérience éditoriale : choix mis en avant, inspirations liées à l’historique, films, séries et exploration.
- Utilisation de la sélection intelligente complète disponible, sans doublons entre les rubans.
- Suppression du score technique en haut à droite des vignettes.
- Conservation d’explications compréhensibles : proximité avec des titres vus, genres, qualité et affinité.
- Diversification gloutonne du classement côté serveur pour réduire les répétitions de genres, formats et franchises tout en gardant les meilleurs candidats.
- Rubans tactiles à défilement horizontal, cartes compactes sur mobile et mise en avant adaptative sur les grands écrans.

## WiTV

- Le résolveur détecte le lecteur public officiel WiTV et le sert dans une iframe préparée par Noctra.
- Les scripts publicitaires et Cloudflare défaillants à l’origine de l’erreur `g is not defined` sont retirés du document du lecteur.
- Le script PlayerJS et le flux publiquement exposé restent chargés depuis leur source officielle.
- Le lecteur préparé est placé dans une sandbox sans accès au contexte Noctra.
- Le mode compatibilité et l’ouverture externe restent disponibles en secours.

## OHA et centre TV

- OHA dispose d’un viewport interne desktop d’au moins 1080 px sur les écrans de plus de 760 px, même lorsque le panneau Noctra est plus étroit.
- Hauteur OHA desktop bornée entre 520 et 720 px pour supprimer le grand espace vide inférieur.
- Le comportement mobile OHA et le pseudo-plein-écran restent conservés.
- Surface TV rééquilibrée : lecteur prioritaire, liste de chaînes stable, source active plus lisible et note d’utilisation compacte.
- Mise en page adaptée aux grands écrans, tablettes et téléphones.

## Version et cache

- Version serveur et desktop : `62.0.0`.
- Cache PWA : `noctra-shell-v62`.
- Ressources client rechargées avec le marqueur `v=62`.
