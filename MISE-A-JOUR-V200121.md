# Noctra 200.0.121 — survol fluide, fiches fiables, réglages en colonne, démarrage TV plus stable

## Survol des films et séries sur PC
**Causes (mesurées).** À chaque mouvement de souris au-dessus d'une affiche :
- la lumière qui suit le curseur était déplacée par deux variables posées sur `<html>` : tout le document recalculait son style à chaque image ;
- le reflet de l'affiche relisait la position de la carte juste après avoir écrit son style (recalcul forcé de la mise en page) ;
- la perspective 3D était posée sur toutes les affiches de la page.

**Corrections.**
- La lumière est déplacée directement (transform sur son propre élément).
- Le reflet s'allume fixe au survol, sans suivi image par image.
- La perspective est limitée à l'affiche survolée, sans `preserve-3d`.

| Souris qui parcourt 360 affiches | 200.0.120 | 200.0.121 |
|---|---|---|
| Temps de recalcul des styles | 10 965 ms | **111 ms** |
| Image (95ᵉ centile) | 66,7 ms | **16,7 ms** |
| Image la plus lente | 100 ms | **16,8 ms** |

## « Voir la fiche » / « Reprendre » depuis l'affiche d'accueil
**Cause.** Pour appeler le lecteur Jellyfin, l'affiche déclarait à webpack un « chunk » d'identifiant fixe. Webpack n'exécute le rappel d'un chunk qu'à sa première déclaration. Dès le deuxième clic, Noctra ne récupérait donc rien et affichait « Le lecteur est encore en cours de chargement. Réessayez dans un instant. »

**Correction.** L'affiche utilise l'accès mémorisé déjà employé par les carrousels (`homeWebpackRequire`). Tous les clics fonctionnent.

## Réglages sur PC
Le menu du profil (Profil, Affichage, Sous-titres, Administration…) s'affiche en une seule colonne centrée, comme sur mobile, au lieu de deux colonnes.

## Lecteur TV Shaka : démarrage avec plus de réserve
- Le diagnostic 200.0.120 montrait un départ avec 7,5 s de réserve, puis deux coupures dans les 20 premières secondes.
- Shaka attend maintenant **15 s** de réserve (2,5 segments) avant la première image, au lieu de 3 s. La première image arrive un peu plus tard, mais la lecture démarre sur une réserve solide.
- Après une coupure, la reprise se fait à partir de 6 s (au lieu de 3 s), et monte jusqu'à 12 s si les coupures se répètent.
- La fenêtre du direct de 120 s (200.0.120) est conservée.

## Écran de démarrage
L'intro dure un peu plus longtemps : au moins 2,2 s à la première ouverture de la session, 1,2 s ensuite. Elle ne reste jamais au-delà de 10 s et n'intercepte jamais un clic.

## Validation
- Nouveau test `tests/v200121-hover-fiche-reserve.mjs` (`npm run test:v200121`, qui enchaîne les tests 120 à 108). Il reproduit fidèlement le comportement de webpack (le deuxième clic échouait avec l'ancien code).
- Tests Shaka mis à jour pour les nouvelles réserves : 15 s au démarrage, 6 s ensuite, 12 s après deux coupures.
- Mesure du survol dans Chromium (tableau ci-dessus).
- Tous les tests qui réussissaient avant réussissent encore.
