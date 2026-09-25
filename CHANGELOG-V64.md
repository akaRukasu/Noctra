# Noctra v64

## Demandes Jellyseerr

- Affichage du serveur et des profils qualité disponibles pour les administrateurs comme pour les membres.
- Dossier racine complet visible uniquement par l’administrateur ; les membres voient un libellé de rangement sans obtenir le chemin du serveur.
- Relecture systématique de la configuration Radarr/Sonarr avant l’envoi.
- Détection des profils ou dossiers supprimés et remplacement par une valeur réellement disponible.
- Validation côté serveur de `serverId`, `profileId` et `rootFolder`, même si le navigateur envoie une valeur obsolète.
- Association de la demande au compte Jellyseerr importé correspondant au compte Jellyfin.

## WiTV

- Correction du parseur qui produisait l’erreur `g is not defined` sur les lecteurs contenant une URL échappée.
- Résolution des lecteurs publics WiTV et extraction de leur playlist HLS.
- Lecture HLS directe dans le lecteur natif Noctra afin de conserver la redirection HTTP/2 exigée par le CDN WiTV.
- Conservation des serveurs alternatifs et du repli web nettoyé lorsqu’aucun flux HLS n’est publié.

## OHA

- Remplacement du portail intégré par l’utilisation native des catalogues publics France et France Sport.
- Regroupement des variantes d’une même chaîne et présentation des serveurs HD/FHD/UHD.
- Résolution du flux au moment de la lecture et proxy HLS Noctra.
- Affichage du programme en cours et du suivant lorsque le guide OHA le fournit.

## Centre TV

- Nouvelle composition responsive pour ordinateur, tablette et téléphone.
- Sur mobile, bascule explicite entre la liste des chaînes et le lecteur, sans forcer la version mobile d’un portail tiers.
- Recherche avec effacement rapide, compte de résultats et cartes de chaînes plus lisibles.
- Zapping précédent/suivant, état du direct, sélection de serveur et plein écran regroupés autour du lecteur.
- Grille tablette et panneau latéral desktop redimensionnés pour limiter les espaces vides.

## Compatibilité et version

- LiveWatch VIP partagé de la v63 conservé.
- Version serveur et desktop : `64.0.0`.
- Cache PWA : `noctra-shell-v64`.
- Ressources client rechargées avec le marqueur `v=64`.
