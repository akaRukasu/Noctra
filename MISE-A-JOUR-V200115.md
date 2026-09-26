# Noctra 200.0.115 — « Chroma »

## L'interface prend les couleurs du film
- **Couleurs tirées de l'affiche** : à chaque nouveau titre, Noctra lit l'image déjà affichée à l'accueil (ou l'arrière-plan d'une fiche) et en extrait deux teintes vives.
- **Ce qui se colore** : le fond aurore, l'anneau et le halo de l'affiche, la lueur des boutons principaux et le trait du dock. Le passage d'une couleur à l'autre se fait en fondu sur 1,6 s.
- **Performance** : l'image est réduite à 24 × 24 px et aucune requête supplémentaire n'est envoyée. Si une image ne peut pas être lue, les couleurs Aurora restent.

## Effets
- **Intro animée** à l'ouverture de Noctra, une fois par session : le logo apparaît avec un effet de ressort, puis le nom se resserre. Elle ne bloque jamais l'application, qui se charge derrière.
- **Reflet lumineux** qui balaie l'affiche à chaque changement de titre.
- **Titre d'accueil** qui s'efface en profondeur quand on fait défiler la page. Cet effet suit directement le défilement et n'est actif que dans les navigateurs compatibles.

## Affiche d'accueil sur mobile
- **Paysage** : l'image s'affiche en entier, au format 16:9, en haut de la carte. Elle n'est plus rognée sur les côtés (personnages coupés) et se fond sous le texte.
- **Carte ajustée** : la hauteur de la carte suit son contenu. Il n'y a plus de grand vide.
- **Couleurs** : un fond flouté tiré de l'image remplit le reste de la carte.
- **Affiche verticale** : elle est entière, centrée, et le texte commence en dessous.

## Médiathèques
- **Texte de l'image jamais coupé** : les images de médiathèques générées par Jellyfin (avec le nom écrit dessus, par exemple « Films D'animation ») sont au format 16:9. Les cartes prennent maintenant ce même format, sur ordinateur comme sur mobile.
- **Légende compacte sur mobile** : titre sur une ligne, texte plus petit, flèche réduite.

## Garde-fous
- Les nouvelles animations sont coupées pendant la lecture et avec l'option « réduire les animations ».
- Aucune animation continue n'a été ajoutée.
- Le dock reste statique : seule la couleur de son trait change.
- Aucun effet n'est appliqué sur la vidéo.

## Validation
- Nouveau test `tests/v200115-chroma.mjs` (`npm run test:v200115`, qui inclut les versions 108 à 114).
- Rendu vérifié à 1440 et 390 px de large :
  - intro visible ;
  - couleurs extraites de l'affiche puis appliquées à l'interface ;
  - affiche mobile paysage et verticale ;
  - médiathèques au format 16:9.
- Aucune erreur JavaScript pendant ces vérifications.
