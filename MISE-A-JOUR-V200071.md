# Noctra 200.0.71

## Multiview

- Les cases de flux directs conservent le résolveur de leur source sélectionnée et demandent une adresse fraîche à l'ouverture et lors d'un nouvel essai, lorsqu'un résolveur est disponible. Une réponse arrivée après fermeture ne recrée pas de lecteur.
- Le démarrage commence sur le niveau HLS le plus bas et attend des données disponibles, même après le délai de préchargement. La position initiale est replacée dans la plage téléchargée si nécessaire.
- Une tentative sans démarrage s'arrête après 90 secondes de phase HLS et propose un nouvel essai. Un fragment tardif ne relance pas cette tentative.
- Les cases sont présentées au format 16:9. Commandes, statuts et informations de chaîne sont plus lisibles ; sur téléphone les cases s'empilent.
- Pour les lecteurs web, un lien permet d'ouvrir le lecteur externe. Le message « NOT ALLOWED / domain protected » de la capture indique un refus du fournisseur : cette version ne contourne pas sa restriction. Un chargement d'iframe ne peut pas certifier que la vidéo joue réellement.

## Présentation TV et médiathèques

- Espace TV centré, navigation regroupée, lecteur et liste de chaînes dans des panneaux cohérents, sources présentées dans des boutons qui se répartissent sur plusieurs lignes.
- Sur PC, menu Médiathèques limité à une largeur confortable, grandes cartes en deux colonnes, titres et marges agrandis.
- Les grilles de portraits sur PC répartissent les éléments de chaque page en rangées équilibrées et complètes. Les contenus, leur ordre, les filtres et la pagination sont conservés. Pour 54 affiches et 1845 px utiles : six rangées de neuf, au lieu d'une dernière rangée de deux.
- L'équilibrage est réservé aux grilles de médiathèques à partir de 1000 px. Les carrousels de l'accueil et les fiches ne sont pas ciblés. La présentation native est restaurée en dessous de ce seuil.

## Validation et limites

Tests automatisés : résolution fraîche, fermeture pendant résolution, absence de démarrage à vide, délai maximal, fragments tardifs, son exclusif, suppression/reprise indépendante des cases ; régressions TV, Jellyfin, mobile et carrousels. Répartition vérifiée de 1 à 520 éléments sur six largeurs PC.

Structure de la médiathèque installée inspectée dans Chrome. Vérifications locales de présentation avec les feuilles de style réelles et des éléments représentatifs : blocs de médiathèques d'environ 802 × 402 px à 1920 px, 54 affiches en six rangées complètes ; cases Multiview de 933 × 525 px sur PC et 370 × 208 px dans un cadre mobile de 390 px, sans débordement horizontal. Ces essais utilisent des éléments de démonstration, pas les chaînes de production. Pas de validation physique sur iPhone ni de garantie de disponibilité des fournisseurs externes.

Installer l'archive complète selon la procédure habituelle, conserver la configuration et les données, redémarrer le serveur puis recharger le client. Version et cache : 200.0.71. Aucun déploiement effectué pendant cette intervention. La lecture simultanée reste dépendante du débit des sources et du nombre de connexions autorisées par le fournisseur.
