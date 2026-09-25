# Noctra Media Client v89 — Safe-area iPhone Dashboard / Utilisateurs

## Objectif

Correction ciblée du haut des pages administrateur Jellyfin sur iPhone. La v88 avait amélioré la largeur et la densité, mais le header Jellyfin pouvait encore se placer dans la même zone que l'heure, le réseau et la Dynamic Island.

## Dashboard / Utilisateurs mobile

- Le viewport est forcé en `viewport-fit=cover` lorsque Jellyfin l'a perdu.
- Mesure réelle de `env(safe-area-inset-top)` et de `visualViewport.offsetTop`.
- Fallback iPhone limité au cas où WebKit renvoie momentanément 0 pour les deux mesures.
- Le header Jellyfin legacy (`skinHeader`) et l'AppBar React/MUI reçoivent une seule réserve safe-area.
- Le `headerTop` legacy n'ajoute plus une seconde réserve verticale.
- Les pages admin React actives sont remises à `top: 0` afin de supprimer l'ancien décalage desktop résiduel.
- Le contenu Dashboard / Utilisateurs commence à 10 px sous le bord inférieur réellement mesuré du header.
- Aucun changement apporté à la TV, aux Demandes/Discovery ou à leur logique.

## Version

- Noctra : `89.0.0`
- Cache PWA : `noctra-shell-v89`
