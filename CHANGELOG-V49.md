# Noctra v49

## Explorateur

- ajout automatique du dossier `/home/akarukasu/media/Trash` même lorsque `MEDIA_ROOTS` provient d’un ancien `.env` ;
- cache court des dossiers et navigation plus instantanée ;
- invalidation automatique après création, renommage ou déplacement.

## Fluidité

- ouverture des panneaux par animation GPU légère ;
- mise à jour du contenu sans recréer brutalement toute la fenêtre ;
- cache des données stables et chargement progressif des grandes listes.

## Sonarr et Radarr

- centre de gestion personnalisé : vue d’ensemble, collection, manquants, calendrier, file d’attente, historique et ajout ;
- recherche dans les catalogues Sonarr/Radarr ;
- ajout avec choix du dossier racine et du profil qualité ;
- surveillance, rescan, synchronisation RSS et recherche interactive des releases.

## Suggestions intelligentes

- profil de goûts construit depuis les genres de la médiathèque Jellyfin de l’utilisateur ;
- exclusion des titres déjà présents ;
- score personnalisé et explication de la recommandation ;
- vérification Prowlarr paresseuse et mise en cache de la présence de releases sur les trackers ;
- affichage de cette disponibilité avant l’envoi d’une demande Jellyseerr.

## Responsive

- Arr Center, explorateur et suggestions adaptés aux écrans PC, tablette et mobile.
