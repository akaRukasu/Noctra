# Noctra Media Client — Changelog V109

## Demandes / Discovery
- Les compteurs torrent à zéro sont remplacés par un libellé sans chiffre inutile.
- Nouvelle fiche média Noctra accessible en cliquant les cartes de suggestions, résultats de recherche et lignes de demandes.
- La fiche combine métadonnées film/série, plateformes légales, état de la demande et jusqu’à 24 releases Prowlarr en temps réel.
- Une demande peut être lancée directement depuis la fiche.
- Si le média existe déjà dans Radarr/Sonarr, l’administrateur peut ouvrir la recherche interactive depuis la fiche.
- Le panneau « À découvrir » retrouve un panneau desktop large intégré comme les autres menus, au lieu du workspace immersif.

## Choix manuel du torrent
- Les destinations Jellyseerr exposent maintenant leur réglage `preventSearch`.
- Le formulaire administrateur propose « Automatique » ou « Manuel · je choisis la release ».
- Le mode manuel exige une destination Jellyseerr Radarr/Sonarr configurée avec Automatic Search désactivé.
- Après une demande manuelle approuvée, Noctra ouvre la recherche interactive Radarr/Sonarr au lieu de laisser l’Arr choisir automatiquement.

## TV
- Aucun changement du pipeline TV de la v108.

## Fluidité
- Les listes de releases dans les fiches utilisent `content-visibility` afin de préserver la fluidité.
- Les vérifications trackers restent déclenchées à la demande et ne bloquent pas le chargement initial des suggestions.
