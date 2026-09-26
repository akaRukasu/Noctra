# Noctra 200.0.119 — fluidité PC rétablie, plus de lecture involontaire depuis l'accueil

## Fluidité sur PC
**Cause (mesurée).** En 118, les rangées et chaque affiche de l'accueil étaient animées au fil du défilement (effet de profondeur des carrousels). Une telle animation reste active en permanence. Le navigateur crée alors une couche graphique par affiche. Sur un accueil de 12 rangées × 30 affiches :

| Version | Couches graphiques | Image la plus lente pendant le défilement |
|---|---|---|
| 117 | 7 | 17 ms |
| 118 | **379** | **200 ms** |
| 119 | 7 | 17 ms |

**Correction.**
- Retrait de l'animation des rangées au défilement, de la profondeur par affiche et de l'effet « projecteur » au survol, qui recalculait des rangées entières à chaque mouvement de souris.
- L'apparition des rangées revient au script : elle est jouée une fois, sans couche permanente.
- Conservés, car légers : la courbe « ressort », la pression à ressort des boutons et la parallaxe de l'affiche calculée par le navigateur (un seul élément).

## Lecture qui se lançait seule depuis l'affiche « Continuer à regarder »
Deux causes possibles, toutes deux corrigées :
1. **Clic fantôme après une flèche ◀ ▶.** La flèche change de titre dès que le doigt se lève. Si le nouveau titre prend une ligne de plus, les boutons se décalent, et le clic que le téléphone envoie ensuite tombe sur « Reprendre ». Ce clic est maintenant absorbé pendant 0,7 s s'il ne vise pas la flèche.
2. **Changement automatique de titre sous le doigt** (toutes les 8 s). Toucher l'affiche suspend désormais le défilement automatique pendant 6 s. « Reprendre » et « Voir la fiche » agissent sur le titre affiché au moment où le doigt s'est posé.

## Validation
- Nouveau test `tests/v200119-fluidity-premiere.mjs` (`npm run test:v200119`, qui enchaîne les tests 118 à 108). Le test 118 est ajusté aux effets retirés.
- Mesure des couches et du temps par image dans Chromium, avant et après (tableau ci-dessus).
- Simulation tactile dans Chromium :
  - flèche touchée avec « Reprendre » glissant sous le doigt : aucune lecture ;
  - appui volontaire sur « Reprendre » : la lecture démarre bien ;
  - titre changé pendant l'appui : c'est le titre touché qui démarre.
- Chromium ne reproduit pas le reciblage du clic propre à Safari/iOS : la correction du point 1 est à confirmer sur iPhone.
- Tous les tests qui réussissaient avant réussissent encore.
