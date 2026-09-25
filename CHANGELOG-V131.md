# Noctra v131

## Interface et responsive

- Cartes, panneaux et outils plus arrondis, avec des accents violet, bleu, cyan et ambre mieux répartis.
- Retour au dock classique : état actif violet discret sur ordinateur et boutons transparents sur mobile.
- Actions qBittorrent maintenues sur une seule ligne sur téléphone, y compris Pause, Détails, Réannoncer, Revérifier et Supprimer.
- Compteurs de téléchargement adaptés à la largeur disponible sans défilement horizontal.

## TV et NorthTV

- Préchargement du dernier catalogue TV sur mobile hors mode économie de données.
- Affichage immédiat d'un catalogue déjà présent en cache, sans écran de chargement intermédiaire.
- NorthTV passe d'abord par le resolver officiel `/api/north/stream` et son flux HLS ; un bridge à jeton éphémère reste disponible en secours sans exposer l'authentification Jellyfin.
- Suppression du renouvellement forcé de la session LiveWatch à chaque ouverture de chaîne.

Version : `131.0.0`
Cache PWA : `noctra-shell-v131`
