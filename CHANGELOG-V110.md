# Noctra Media Client — Changelog V110

## Torrents Live
- Les cartes Discovery affichent maintenant toujours un compteur explicite : `Torrents : 0`, `Torrents : 1`, `Torrents : 28`, etc.
- Le libellé générique `Torrents live` ne remplace plus la valeur zéro.
- Pendant la première vérification, le bouton affiche `Torrents : …`, puis la valeur réelle dès que Prowlarr répond.
- La fiche média reprend le même compteur cohérent, zéro compris.

## Fiche film / série
- Refonte complète de la fiche pour mieux l’intégrer à Noctra et éviter le grand espace vide de la v109.
- Nouvelle composition en hero + résumé + panneaux d’informations + distribution + trackers.
- Métadonnées enrichies : date exacte, durée, classification, statut, langue, titre original, pays, production/diffuseur, genres et mots-clés.
- Films : budget, recettes, collection, production, IMDb et bande-annonce lorsqu’ils existent.
- Séries : nombre de saisons et d’épisodes, dernière diffusion, diffuseurs, prochain/dernier épisode et état de production.
- Casting principal avec rôle et portrait quand TMDB le fournit.
- Plateformes de streaming France et état de disponibilité intégrés dans la fiche.
- Responsive desktop/tablette/mobile retravaillé.

## Demandes et choix du torrent
- Quand une destination Jellyseerr manuelle existe, Noctra privilégie maintenant le choix manuel par défaut pour les films et les séries terminées.
- Les séries encore en cours (`Returning Series`, `In Production`, `Planned`, `Pilot`) restent volontairement en automatique afin que Sonarr continue à récupérer les épisodes manquants et futurs.
- Une série terminée ou annulée conserve le choix Automatique / Manuel.
- Le formulaire explique directement pourquoi une série en cours reste en automatique.
- Le serveur réapplique cette règle côté API afin d’éviter qu’un formulaire ancien force accidentellement le mode manuel sur une série non terminée.

## TV
- Aucun changement du pipeline TV de la v109.
