# Noctra 200.0.70 — diagnostic TV sur PC

## Essais réels du 7 septembre 2026

Tests dans Chrome sur PC, sur la version déjà installée du site, un flux à la fois. Les résultats ci-dessous ne sont pas une validation en production du correctif 200.0.70.

- **13 EME RUE, LiveWatch SAT**, vers 02:36 : résolution en 1,7 seconde, manifeste en 3,3 secondes depuis la sélection. Premier segment de 14,01 secondes disponible après 28,7 secondes, avec seulement 7,01 secondes devant la position de lecture. Le délai de démarrage a ensuite déclenché un changement de source.
- **6TER, LiveWatch BASIC**, à partir de 02:38 : premier segment après 14,9 secondes. Le lecteur a changé de source vers 50 secondes alors que 18,78 secondes étaient chargées. Sur la source suivante, la lecture a commencé avec environ 20 secondes de réserve, puis la réserve s'est vidée. Une remise en réserve a pris environ 15 secondes. Plus tard, une autre a duré environ 70 secondes avant un nouvel échec. Le lecteur de secours affichait finalement « Chaîne introuvable ».
- Un relevé pendant la lecture indiquait 0 image perdue sur 727. Ce relevé ne prouve pas l'absence de problèmes de décodage sur tous les PC, mais les interruptions observées coïncidaient avec l'épuisement des données disponibles.

Le test de connexion à 98,26 Mbit/s ne mesure pas le débit effectif du parcours fournisseur → relais → navigateur. Ces observations ne permettent pas d'attribuer précisément les lenteurs au fournisseur, au relais ou au réseau. La variante testée sur 13 EME RUE ne proposait qu'une qualité : une baisse automatique de qualité ne peut pas créer une variante absente.

## Correctifs

- HLS sur PC : recul initial cible porté à 30 secondes, ajusté à la longueur réelle de la playlist pour ne pas demander une réserve impossible. Cela privilégie la continuité au prix d'un peu plus de retard sur le direct.
- Position de lecture du PC replacée dans les données déjà reçues dès le préchargement, avant que la réserve complète soit disponible. La lecture reste suspendue jusqu'au seuil de démarrage.
- Le délai de secours de démarrage accorde des prolongations de 10 secondes si des fragments ont réellement été ajoutés depuis moins de 25 secondes et qu'une réserve existe. La limite de progression est de 90 secondes par tentative, contrôlée au prochain délai. Un chargement figé n'obtient pas de prolongation indéfinie.
- Les réglages de recul HLS mobile restent à 12 secondes en réseau normal et 18 secondes en réseau faible. Le lecteur HLS mobile bénéficie également du garde-fou contre les basculements prématurés ; le moteur natif iOS n'est pas modifié.

## Vérifications

Tests automatisés réussis : délai réel de secours et annulation, préchargement PC, réserves courtes, moteur HLS, reprise après interruption, relais et cache, limites mémoire, lecture Jellyfin, carrousels et restauration du viewport. Vérification de syntaxe des fichiers de lecture réussie.

Les tests réels ont été arrêtés et l'onglet remis à l'accueil. Aucun correctif n'a été déployé sur le serveur pendant ces essais. Après installation, comparer les mêmes chaînes pendant plusieurs minutes. Une source qui livre durablement moins de vidéo qu'elle n'en consomme continuera à provoquer des interruptions malgré une réserve plus importante.

## Installation

Installer cette archive complète avec la même procédure que les versions précédentes, conserver la configuration et les données du serveur, puis redémarrer Noctra et recharger le client. Le numéro de version et les références de cache passent à 200.0.70. Les modifications graphiques et mobiles des versions précédentes sont conservées.
