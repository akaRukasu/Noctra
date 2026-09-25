# Noctra 200.0.83

- Multiview : suppression des labels superposés (statut, WEB, qualité). Les boutons de reprise restent disponibles en cas d’erreur.
- PC : bandeaux masqués et placés au-dessus de la vidéo sans réserver de hauteur. Survol de 550 ms du bord inférieur pour les commandes ; bord supérieur limité à 10 px pour le bandeau collectif. Navigation clavier conservée. Commandes visibles sur appareil tactile, sans exiger de souris.
- Son : bouton externe réactivé pour essayer le contrôle des médias accessibles, y compris dans des iframes imbriquées. Aucun succès n’est annoncé si le fournisseur bloque l’accès. Dans ce cas, un message invite à utiliser le haut-parleur du lecteur. Le contrôle universel du son des lecteurs externes, notamment ceux chargés depuis un autre domaine sans API dédiée, n’est pas disponible.
- Accueil : épisodes isolés masqués dans les ajouts récents. Le chargement supplémentaire des carrousels séries/animes demande des séries plutôt que des épisodes. Aucun épisode supprimé de la bibliothèque ; reprise de lecture inchangée.

## Vérifications

`npm run test:v200083` réussi : délai et annulation du survol, contrôle audio réel et refus interdomaines, portée du filtre des épisodes et suites de régression v80–v82.

Prévisualisation locale avec styles et fonctions de production en 1440 × 900 : opacité des bandeaux à zéro, labels masqués et trois lecteurs occupant la grille. Les essais ne démontrent pas le contrôle sonore de tous les fournisseurs externes.

Installation : remplacer les fichiers en conservant configuration et données, puis redémarrer Noctra. Cache navigateur versionné. Aucun déploiement effectué.
