# Noctra 200.0.86

- Accueil : remplacement des épisodes des ajouts récents par leurs séries, par requêtes groupées ; doublons retirés du document au lieu de masquer les cartes. Les autres rubriques ne sont pas filtrées. En cas de panne Jellyfin, les cartes existantes restent accessibles.
- Outils TV : retour du mode cinéma et retrait des deux boutons qualité +/−. Le sélecteur de qualité reste disponible.
- Multiview : languette Outils Multiview intégrée au bord supérieur ; double-clic conservé pour ne pas intercepter les interactions avec les lecteurs.
- FCTV33 : Canal FR est sélectionné avant sa résolution lorsqu’il est proposé. Un échec ne sélectionne plus silencieusement un autre serveur. Tous les autres serveurs restent accessibles manuellement.
- iPhone/iPad : reconnaissance des iPad en mode bureau pour le lien de secours ; libellé Ouvrir le lecteur sans prétendre forcer Safari.

## Vérification et limites

Tests v80 à v86 passés ; remplacement/dédoublonnage de plusieurs épisodes et conservation en cas de panne testés. Double-clic du bandeau vérifié dans un navigateur sur une page de contrôle locale.
BowdTV : API des chaînes renvoie 401 sans session fournisseur ; le guide officiel reste en chargement dans le navigateur de contrôle. Pas de lecture intégrée validée. Le bouton Ouvrir permet de rejoindre le fournisseur, avec France dans le lien.
FCTV33 : priorité de sélection vérifiée, disponibilité vidéo de Canal FR non garantie. Le lecteur officiel reste dépendant du fournisseur.
Aucun test sur un iPhone physique ; lecture universelle et suppression des publicités des lecteurs tiers non obtenues. Le lien externe est un secours, pas une réparation du lecteur intégré.
Pas de déploiement sur le serveur utilisateur.
