# Noctra v168

## Sous-menus

- Le bandeau superieur passe a 84 px afin que le titre et sa ligne de separation ne se chevauchent plus.
- Le dock reste entier, superpose et aligne en haut sur ordinateur ; son implantation mobile reste en bas de l'ecran.
- Le menu Mediatheques conserve sa grille compacte sans defilement vertical inutile.

## Accueil et mediatheques

- Diagnostic corrige : l'image de secours etait chargee depuis `/api/libraries`, mais le placeholder gris natif de Jellyfin restait au-dessus.
- Noctra injecte maintenant une vraie image dans chaque carte `Mes medias` et la replace apres le placeholder Jellyfin pour garantir son affichage.
- Le fond CSS est conserve en second secours si le DOM Jellyfin change de nouveau.

## TV

- Le bouton favori des chaines passe a 28 px sur mobile, avec une icone de 15 px et un espacement lateral reduit.
- En plein ecran, la barre de lecture se masque automatiquement apres l'inactivite, meme lorsque le pointeur ou le focus reste sur le bouton plein ecran.
- Le petit lecteur et le mode cinema conservent leur barre visible.
- Le profil HLS PC demarre avec 22 secondes de tampon, reste six segments derriere le direct et peut conserver jusqu'a 150 secondes de tampon.
- Apres plusieurs blocages rapproches, le lecteur augmente sa marge live et reduit prudemment le niveau HLS disponible au lieu de classer un poste RJ45 en connexion faible.

## Tests

- `npm run check`
- `npm test`
- Controle visuel ordinateur du bandeau et de la superposition des images.
- Controle visuel mobile du bandeau, de la grille Mediatheques et du dock.

## Version

- Client, serveur et PWA passent en `168.0.0` / `noctra-shell-v168`.
