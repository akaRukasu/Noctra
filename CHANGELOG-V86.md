# Noctra Media Client v86 — Discovery Engine v2 / Demandes / Admin mobile

## Objectif

Cette version ne refond pas la TV. Elle part de la v85 et se concentre sur le moteur de suggestions de l’onglet Demandes, la gestion des demandes Jellyseerr/Seerr et l’adaptation mobile du Dashboard Jellyfin / Gestion des utilisateurs.

## Suggestions intelligentes — Discovery Engine v2

- Croisement supplémentaire des tendances Seerr quotidiennes et hebdomadaires avec les signaux TMDB déjà utilisés.
- Chaque seed issue de la médiathèque Jellyfin utilise désormais à la fois les recommandations TMDB et les contenus similaires.
- Profil enrichi : genres, personnes, studios, équilibre cinéma/séries, favoris, contenus vus et récence.
- Nouvelles familles visibles : affinité forte, tendances croisées, nouveautés cinéma, streaming légal FR, séries, pépites bien notées et exploration.
- Les raisons de recommandation sont davantage explicitées et la confiance tient compte de plusieurs signaux indépendants.
- Le contrôle de présence Prowlarr/tracker reste conservé et chargé à la demande.
- Les plateformes légales FR continuent d’être affichées lorsque TMDB/JustWatch fournit l’information.

## Apprentissage utilisateur

- Ajout de `Plus comme ça` et `Pas pour moi` sur les suggestions.
- Les retours sont conservés par utilisateur Jellyfin dans `runtime/discovery-feedback.json`.
- `Pas pour moi` retire le titre des sélections et diminue le poids des genres associés.
- `Plus comme ça` renforce progressivement les genres associés.
- Conservation limitée aux 250 retours les plus récents par utilisateur.

## Onglet Demandes

- Nouvelle page d’accueil : moteur de découverte + compteur de places/demandes en attente.
- Navigation `Pour toi / Explorer / Gestion` (ou `Mes demandes` pour un utilisateur normal).
- Centre de demandes avec compteurs Total / En attente / Approuvées / Refusées.
- Filtres instantanés par statut, type Film/Série et recherche par titre/utilisateur.
- Enrichissement des demandes avec titre, affiche et résumé quand Jellyseerr ne les renvoie pas directement.
- Conservation des actions existantes : approuver, refuser, supprimer, annuler et nettoyer toutes les demandes pending.
- La limite Noctra de 10 demandes simultanément en attente reste inchangée : une place revient dès qu’une demande sort du statut pending.

## Dashboard et Utilisateurs sur mobile

- Layout monocolonne forcé pour les principales pages d’administration Jellyfin.
- Formulaires, champs, cartes, listes et boutons bornés à la largeur de l’écran.
- Onglets/actions horizontaux scrollables au lieu de déborder hors écran.
- Liste des utilisateurs compactée en cartes adaptées au téléphone.
- Prise en compte des safe areas iPhone et de l’espace du dock.
- Pages ciblées : Dashboard, paramètres généraux, activité, appareils, plugins, tâches planifiées, lecture, médiathèques, utilisateurs, profil utilisateur, mot de passe, accès bibliothèques et contrôle parental.

## TV

- Aucun changement fonctionnel volontaire des lecteurs TV de la v85 dans cette version.

## Version

- Noctra : `86.0.0`
- Cache PWA : `noctra-shell-v86`
