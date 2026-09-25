# Noctra Media Client v87 — Discovery sans token TMDB + admin mobile compact

## Objectif

Cette version corrige deux régressions visibles de la v86 : le moteur de suggestions demandait un `TMDB_BEARER_TOKEN` alors que Seerr/Jellyseerr est déjà configuré, et les pages Dashboard / Utilisateurs cumulaient plusieurs réserves verticales sur mobile.

La logique TV de la v85/v86 n'est pas refondue dans cette version.

## Discovery / Demandes

- **Aucun token TMDB supplémentaire requis lorsque Seerr/Jellyseerr est configuré.**
- Noctra utilise désormais Seerr comme passerelle métadonnées lorsque `TMDB_BEARER_TOKEN` / `TMDB_API_KEY` ne sont pas présents.
- Utilisation des endpoints Seerr de découverte films/séries, tendances jour/semaine, recommandations, contenus similaires, genres et fournisseurs de streaming.
- Le profil de goûts Jellyfin est calculé même sans clé TMDB directe : les compteurs `titres analysés`, `regardés`, `favoris` et les goûts dominants ne restent plus artificiellement à zéro à cause du mode de compatibilité.
- Les recommandations personnelles continuent à croiser historique/favoris Jellyfin, genres, personnes, studios, recommandations/similarités, tendances Seerr et signaux de fraîcheur.
- La disponibilité légale en France est récupérée via les données exposées par Seerr/TMDB lorsque Noctra n'a pas de token TMDB direct.
- La liste de plateformes du filtre Streaming peut elle aussi venir de Seerr.
- La vérification de présence via Prowlarr / trackers reste indépendante et inchangée.
- L'interface indique maintenant `Seerr/TMDB intégré` et précise qu'aucun token TMDB supplémentaire n'est requis.
- Le token TMDB direct reste accepté s'il existe, mais devient une optimisation facultative et non une dépendance fonctionnelle.

## Dashboard / Utilisateurs — mobile

- Suppression du double `padding-top` entre les pages admin Noctra et le `content-primary` natif Jellyfin.
- Une seule réserve de hauteur est conservée pour le header + safe-area iPhone.
- Réduction de la grande zone vide au-dessus du titre `Utilisateurs` et du Dashboard.
- Liste Utilisateurs plus compacte : avatars 64 px, cartes moins hautes et espacements réduits.
- Sections Dashboard compactées verticalement tout en conservant l'espace nécessaire au dock et aux safe-areas.
- Barre de navigation Discovery mobile réorganisée afin que les catégories restent prioritaires et que `Médiathèques` ne pousse plus la navigation hors écran.

## Version / cache

- Version : `87.0.0`
- Cache PWA / assets : v87
- `/health` et `/api/config` annoncent `87.0.0`.

## Vérifications

- `npm run check`
- suite complète `npm test`
- test v87 dédié Seerr Discovery sans token TMDB
- test profil Jellyfin sans clé TMDB directe
- test responsive Dashboard / Utilisateurs mobile
- tests historiques TV et iOS conservés
- smoke test sous `BASE_URL=/noctra`
- tests relancés depuis le ZIP final réextrait dans un dossier vierge
