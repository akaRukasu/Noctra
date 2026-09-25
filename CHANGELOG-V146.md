# Noctra v146

## TV desktop

- Remplacement des contrôles Chromium et de leur chronomètre par une barre Noctra dédiée au direct.
- Indicateur rouge `EN DIRECT`, lecture/pause, volume, Picture in Picture et plein écran réunis au bas du lecteur.
- Lecteur natif iOS conservé sans modification sur mobile.
- Profil HLS desktop aligné sur le profil mobile stable pour LiveWatch, NorthTV, FrameTV et OHA.
- Démarrage sur la qualité la plus légère sans attendre le remplissage du tampon maximal.
- Réessai du même segment avant tout renouvellement de l'URL résolue.
- Renouvellement immédiat réservé aux réponses `401`, `403` et `410` indiquant un lien signé expiré.
- Lecture maintenue à vitesse réelle, sans rattrapage accéléré du direct.

## Interface desktop

- Suppression du fond noir du bandeau supérieur hors lecture média.
- Dock et commandes du bandeau directement intégrés au fond de l'interface, sans cadre ni halo.
- Animations de translation superflues retirées des carrousels Jellyfin sur PC.

## Accueil

- Chargement progressif des films récemment ajoutés à l'approche de la fin du carrousel.
- Pagination Jellyfin dédupliquée et limitée au desktop performant.
- Navigation mobile et section « Continuer à regarder » préservées.

## Validation

- Vérification responsive à 390 px et sur viewport desktop.
- Suite complète de tests Noctra, TV, iOS, LiveWatch, NorthTV, FrameTV, WiTV et OHA validée.
