# Noctra v48

## Explorateur média intégré

- navigation administrateur limitée aux dossiers configurés dans `MEDIA_ROOTS` ;
- accès aux dossiers Films, Séries, Films d'animation et Animes depuis le panneau Médiathèques ;
- création de dossiers, renommage et mise en corbeille sécurisée ;
- protection contre les chemins `..`, les sorties de racine et les liens symboliques externes ;
- interface responsive PC, tablette et mobile.

## Découvertes intelligentes

- catégories À ajouter, Au cinéma, Streaming, Séries et Tendances ;
- classement par récence, popularité et note ;
- filtre par plateforme de streaming en France ;
- intégration directe au flux de demande Jellyseerr / Sonarr / Radarr ;
- fallback vers les tendances Jellyseerr si TMDB n'est pas encore configuré ;
- attribution des disponibilités streaming TMDB / JustWatch.

## Mise à jour automatisée Ultra.cc

- script `ultra/update-noctra.sh` avec sauvegarde, conservation du `.env`, test de santé et retour arrière automatique ;
- installateur `ultra/install-updater.sh` créant la commande `noctra-update` dans `~/bin` ;
- prise en charge d'une archive locale ou d'une URL HTTPS.
