# Noctra 200.0.126 — intro de démarrage plus longue

Contient aussi les 200.0.124 et 200.0.125 (lecteur TV).

- **Durée minimale** de l'intro Noctra au lancement :
  - 3,5 s à la première ouverture de la session (au lieu de 2,2 s) ;
  - 2,5 s ensuite (au lieu de 1,2 s).
- **Animation plus posée** :
  - logo : 1,3 s au lieu de 0,8 s ;
  - nom : 1,2 s au lieu de 0,7 s ;
  - fondu de sortie : 0,7 s au lieu de 0,45 s.
- **Inchangé** :
  - l'intro reste le seul écran de démarrage ;
  - elle n'intercepte aucun clic et s'efface tout de suite en mouvement réduit ;
  - elle ne dure jamais plus de 10 s, avec un filet CSS à 12 s si le script venait à manquer.

## Validation
- Nouveau test `tests/v200126-intro-duration.mjs` (`npm run test:v200126`, qui enchaîne les tests 125 à 108). Le test 121 accepte la nouvelle durée.
- Mesure sur la vraie page de démarrage dans Chromium : intro visible environ 3,5 s.
- Tous les tests qui réussissaient avant réussissent encore.
