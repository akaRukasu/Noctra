# Noctra 200.0.113 — « Aurora Motion »

Motion design pour une interface plus vivante, qui répond à chaque geste.

## Ce qui bouge
- **Ouverture des panneaux** : le panneau se révèle en cercle depuis le bouton touché dans le dock ou dans le menu « Plus ».
- **Apparition au défilement** : les rangées de l'accueil et les cartes des médiathèques glissent en place quand elles entrent à l'écran. Dans une rangée, les cartes arrivent l'une après l'autre. Ce qui est déjà visible au chargement n'est jamais masqué.
- **Affiche de l'accueil** : à chaque changement de titre, le sur-titre, le titre, le sous-titre et les boutons réapparaissent en cascade. Le titre se dévoile comme au générique.
- **Relief 3D** (ordinateur) : les cartes et les médiathèques s'inclinent légèrement vers le pointeur.
- **Boutons magnétiques** (ordinateur) : les boutons de l'affiche et des panneaux suivent légèrement le pointeur.
- **Retour tactile** : légère pression visuelle sur les boutons au clic ou au toucher (le dock n'est pas concerné).
- **Notifications** : entrée à ressort.
- **Parallaxe** (ordinateur performant) : l'image de l'affiche glisse plus lentement que la page pendant le défilement.
- **Lumière de fond** (ordinateur performant) : un halo doux suit le pointeur derrière l'interface.
- **Chargements** : anneau aux couleurs Aurora.

## Garde-fous
- **Accessibilité** : avec « réduire les animations » activé sur l'appareil, aucune de ces animations n'est jouée.
- **Lecture** : tout est coupé pendant la lecture et sur les pages vidéo. Rien n'est appliqué à la vidéo elle-même.
- **Dock** : il reste statique.
- **Ressources** : aucune nouvelle animation continue. Les effets qui suivent le pointeur ou le défilement se calculent au plus une fois par image, avec des écouteurs passifs.
- **Mobile et tablette** : entrées, apparitions au défilement et retours tactiles uniquement. Parallaxe et lumière de fond restent réservées à l'ordinateur.

## Validation
- Nouveau test `tests/v200113-motion.mjs` (`npm run test:v200113`, qui inclut les versions 108 à 112).
- Vérifié dans Chromium :
  - la révélation circulaire se joue ;
  - l'apparition au défilement laisse les rangées visibles de l'écran intactes et fait apparaître les autres ;
  - l'entrée en cascade se rejoue à chaque changement de titre ;
  - aucune erreur JavaScript.
