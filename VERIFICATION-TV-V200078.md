# Vérification des sources TV — 8 septembre 2026

Les modifications partent de la v200.0.77. Cette version précédente modifiait le menu Médiathèques, pas les paramètres des lecteurs TV. Les difficultés signalées ont conduit à examiner également les réglages TV hérités des versions antérieures.

## Résultats et limites

Les sept suites de `npm run test:v200078` et les contrôles de syntaxe passent. Les scénarios couvrent notamment les playlists courtes, les expirations et annulations, la conservation du serveur sélectionné, les reprises réseau et la séparation des accès fournisseurs. Ce sont des essais locaux et simulés ; ils ne remplacent pas un visionnage continu sur l'installation utilisateur.

Un contrôle HTTP a interrogé 18 adresses depuis cet environnement, avec un plafond de 8 secondes par adresse. BZH-Sport, Volkamax et DaddyLive ont répondu HTTP 200 ; le lien court Xtemus a répondu HTTP 403 ; les autres requêtes ont dépassé le délai. Ces résultats décrivent uniquement cet environnement de test, pas une indisponibilité générale des fournisseurs.

Un second contrôle ciblé de DaddyLive a récupéré la page complète et obtenu **388 entrées** avec le parseur intégré. Aucun de ces flux n'a été certifié par un visionnage prolongé.

| Source | Intervention / vérification | Lecture réelle |
| --- | --- | --- |
| LiveWatch et dérivés | Réglages de démarrage partagés revus ; tests de reprise, authentification et séparation des fournisseurs | Non confirmée ici, notamment pour les accès VIP |
| French Stream TV | Catalogue web consultable via la recherche ; moteur HLS partagé et contrôles de transport | Non confirmée |
| OHA / Kool | Adresses fournies ajoutées ; course de miroirs, annulation et reprise testées avec réponses simulées | Réponses distantes non confirmées |
| WiTV | Catalogue web consultable ; tests du lecteur natif, des expirations et des secours | Non confirmée |
| Movix | Tous les bouquets du manifeste exposés ; accès IPTV protégé conservé et testé | Manifeste distant et flux non confirmés |
| Streamed | Catalogues sans préchargement des lecteurs ; résolution au clic, variantes et miroir testés | Non confirmée |
| StreamSports99 TV | Bénéficie du réglage HLS partagé ; scénarios de reprise testés | Non confirmée |
| BZH-Sport / Volkamax | Les deux accueils répondent HTTP 200 ; secours entre domaines ajouté | Non confirmée |
| DaddyLive | HTTP 200 ; 388 entrées extraites de la page réelle ; intégration des pages de lecture documentées | Lecteur ajouté, lecture prolongée non confirmée |
| BrigitteTV | Parseur des liens d'événements ; repli explicite vers le programme en cas d'échec | Programme demandé non récupéré ici |
| Xtemus | Ajout dans Mes sources comme portail avec ouverture externe | Erreur 502 dans le navigateur de test ; intégration vidéo non confirmée |

L'interface du sélecteur a été contrôlée dans le code, mais son rendu visuel n'a pas pu être vérifié dans le navigateur de cet environnement.

## Vérifier sur ton installation

1. Installer cette version puis redémarrer Noctra. Les ressources modifiées possèdent un nouveau numéro de cache.
2. Tester une chaîne par fournisseur : apparition de la première image, visionnage de plusieurs minutes, changement de serveur puis changement de chaîne.
3. En cas de problème, utiliser le menu du lecteur → Diagnostic → Copier le diagnostic. Il indique les étapes et les délais sans inclure les URL, cookies ou jetons.
4. Pour distinguer un problème d'accès réseau, lancer `npm run audit:tv` dans le dossier du projet, sur la machine qui héberge Noctra. Le test mesure les réponses HTTP et ne valide pas les flux.

## Références consultées

- [DaddyLive — pages de lecture et formats publiés](https://dlive.sx/api.php)
- [DaddyLive — programme](https://dlive.sx/)
- [French Stream TV](https://fstv.rest/)
- [WiTV](https://witv.football/)
- [Streamed](https://streamed.pk/)
- [BZH-Sport](https://bzh-sport.lat/)
- [Volkamax](https://volkamax.club/)

Aucun contournement d'accès ni nouvelle clé n'a été ajouté. Les comptes configurés restent nécessaires pour les sources qui les demandent.
