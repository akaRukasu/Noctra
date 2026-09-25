# Noctra v173

## Lecture films et series

- Le fond Noctra ne passe plus devant la video Jellyfin pendant la lecture.
- L'image decodee reste visible avec les controles, les sous-titres et l'audio.

## Accueil

- Les quatre images de Mes medias remplissent maintenant leur carte au lieu de rester dans un conteneur de hauteur nulle.
- Les titres natifs restent masques uniquement quand la couverture est chargee, sans doublon.
- Les fleches pilotent aussi les carrousels Jellyfin rendus par transformation lorsque le composant natif est incomplet.
- Les boutons precedent et suivant sont resynchronises apres chaque mouvement.

## TV - Chaines

- Le lecteur attend 8 secondes de tampon sur une connexion normale et 12 secondes sur une connexion faible.
- Le demarrage se replace dans la plage chargee la plus recente au lieu de partir dans un trou du direct.
- Une petite rupture entre deux plages deja chargees est franchie automatiquement.
- Les doublons FSTV issus de plusieurs pages du catalogue sont fusionnes par leur URL publique stable.

## Interface

- Les menus Cast et SyncPlay restent sous leur bouton et defilent dans la hauteur disponible.
- Le logo de lancement utilise un centrage absolu explicite sur desktop et mobile.
