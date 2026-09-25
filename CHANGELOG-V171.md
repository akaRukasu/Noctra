# Noctra v171

## Mediatheques

- Le bouton d'actualisation affiche maintenant l'etape et le pourcentage Jellyfin en temps reel dans le message visible.
- Les quatre visuels `Films`, `Series`, `Films D'animations` et `Animes` sont charges par le proxy Noctra avec un repli persistant apres les reconstructions Jellyfin.
- Les titres integres aux images ne sont plus dupliques par un second libelle quand le visuel est pret.

## Accueil et menus

- Les fleches des carrousels pilotent directement le defilement reel et detectent correctement les directions precedent/suivant.
- Les menus ouverts par Cast et SyncPlay sont ancres sous leur bouton et bornes dans la fenetre sur desktop et mobile.
- Les boutons Cast et SyncPlay eux-memes conservent le rendu de la v170.
- Le logo de lancement est centre dans la zone utile, y compris sur mobile avec barre de defilement et safe areas.

## TV en direct

- HLS.js embarque passe en version 1.7.1.
- Le lecteur utilise une synchronisation live basee sur la plage tamponnee, des tampons cibles bornes et une reprise progressive des blocages.
- Les profils FSTV/WiTV gardent une marge supplementaire sans accumuler plusieurs minutes de retard sur le direct.

## PWA

- Les icones PNG 180, 192, 512 et maskable ont ete regenerees avec une signature PNG valide et un logo centre.
