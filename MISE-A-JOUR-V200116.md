# Noctra 200.0.116 — fluidité et centre d'automatisation repensé

## Fluidité
- **Couleurs Chroma sans ralentissement.** En 115, chaque changement d'affiche faisait recalculer le style de toute la page à chaque image pendant 1,6 s. Seul le fond d'aurore change maintenant de teinte en douceur, et seulement sur un ordinateur performant. Ailleurs, la teinte change d'un coup.
- **Ouverture des panneaux plus légère.** La révélation circulaire, recalculée à chaque image, est remplacée par un zoom depuis le bouton touché, entièrement pris en charge par la carte graphique.
- **Animations moins coûteuses.** La pastille « à l'affiche » pulse en opacité au lieu de redessiner une ombre. Le reflet de l'affiche se déplace en `transform`. L'aurore du fond se met en pause (sans saut) quand un panneau la recouvre.
- **Mobile et tablette : plus aucun flou d'arrière-plan.** Le dock, l'en-tête, l'en-tête des panneaux et les boutons de l'affiche avaient un flou recalculé à chaque image de défilement. Ils ont maintenant des fonds opaques équivalents.
- **Script d'effets plus sobre.** Trois minuteurs sont regroupés en un seul. Aucune lecture de la page n'a lieu pendant un défilement ni pendant la lecture. Les positions utilisées par le relief des cartes et les boutons magnétiques sont mémorisées au lieu d'être relues à chaque image.
- **Intro d'ouverture plus courte** (1,4 s au lieu de 2 s, une fois par session).

## Automatisation (Radarr, Sonarr, Prowlarr)
- **En-tête corrigé.** Une ancienne règle bloquait sa hauteur à 66 px, et le titre, le texte et les boutons débordaient sur les compteurs. L'en-tête s'adapte maintenant à son contenu, avec le texte à gauche et les actions à droite (empilés sur mobile).
- **Navigation.** Radarr, Sonarr et Prowlarr sont présentés dans un commutateur segmenté. Les vues (Vue d'ensemble, Séries/Films, Manquants…) tiennent sur une seule ligne défilante au lieu de quatre lignes sur mobile.
- **Compteurs** en tuiles égales : 5 colonnes sur ordinateur et tablette, 3 + 2 sur mobile.
- **Cartes séries et films.** L'affiche est au format 2:3. La progression prend le dégradé Aurora. Les boutons Releases, Surveiller et Analyser sont alignés sur une grille ; dans une carte étroite, Releases passe sur toute la largeur.
- **Calendrier et file d'attente** en panneaux de verre Aurora, à la place de l'ancienne teinte verte. Les dates sont affichées en pastilles.
- **Alertes de santé** en encart ambré lisible.
- Une section vide n'affiche plus de titre orphelin.
- Les cartes entrent en cascade à chaque changement de vue, sauf si le mouvement réduit est activé.

## Validation
- Nouveau test `tests/v200116-fluidity-automation.mjs` (`npm run test:v200116`, qui enchaîne les tests 115 à 108). Il vérifie :
  - l'absence de transition sur tout le document ;
  - des animations sans `clip-path` ni `left`, une seule animation continue (en opacité) ;
  - l'absence de flou d'arrière-plan sur écran tactile ;
  - le minuteur unique et la pause pendant le défilement ;
  - l'en-tête libre, les onglets sur une ligne, la grille d'actions ;
  - que les règles ne s'appliquent qu'au panneau Automatisation.
- Captures et audit de mise en page en 1440 × 900, 1024 × 768, 820 × 1180, 390 × 844 et 360 × 800 : aucun débordement ni mot coupé dans le panneau Automatisation.
- Tous les tests qui réussissaient avant réussissent encore. `v200107` échoue comme prévu, car il fige le numéro 200.0.107.
