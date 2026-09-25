# Noctra 200.0.112 — image de l'accueil adaptée à chaque écran

## Constat
L'image du grand bloc de l'accueil posait deux problèmes :
- **Même cadrage pour tous les formats.** Elle peut être une image paysage (arrière-plan Jellyfin) ou une affiche verticale (poster, quand l'élément n'a pas d'arrière-plan), mais elle était toujours recadrée « plein cadre ». Un poster était donc zoomé et coupé. Sur mobile, où la carte est haute et étroite, une image paysage perdait jusqu'aux deux tiers de sa largeur.
- **Résolution fixe.** L'image était toujours demandée en 1280 px, ce qui la rendait floue sur les grands écrans et les écrans haute densité.

## Corrections
- **Format mesuré.** Le format réel de l'image est mesuré à son chargement : paysage, carré ou vertical.
  - **Paysage** : plein cadre, cadré sur le haut de l'image.
  - **Vertical ou carré** : l'image est affichée **entière, sans recadrage**, avec des coins arrondis. Elle est à droite sur ordinateur et tablette, en haut au centre sur mobile.
- **Fond coloré.** Un fond flouté tiré de l'image elle-même remplit toujours la carte : jamais de bande vide ni de bord noir.
- **Mobile.** L'image occupe le haut de la carte et se fond progressivement sous le texte. Les boutons restent lisibles.
- **Résolution selon l'écran.** L'image est demandée à la taille de l'écran, densité comprise, entre 1280 et 2560 px, par paliers de 160 px pour profiter du cache Jellyfin.

## Validation
- Nouveau test `tests/v200112-premiere-image.mjs` (`npm run test:v200112`, qui inclut les tests 111, 110, 109 et 108) : résolution demandée, détection du format et règles d'affichage par format et par appareil.
- Rendu vérifié en paysage et en vertical, à 1440 × 900, 1024 × 768 et 390 × 844.
- Tous les tests qui réussissaient auparavant réussissent encore.
