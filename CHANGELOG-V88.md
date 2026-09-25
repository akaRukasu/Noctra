# Noctra Media Client v88 — Dashboard / Utilisateurs mobile

## Objectif

Cette version ne modifie pas le moteur TV ni le moteur de suggestions de la v87. Elle cible uniquement l'adaptation mobile des pages administrateur **Dashboard** et **Utilisateurs**, encore trop proches de leur mise en page desktop.

## Responsive admin mobile

- Mesure dynamique du vrai header Jellyfin (AppBar React/MUI ou ancien `skinHeader`) au lieu d'un `padding-top` fixe.
- Prise en compte de `VisualViewport` sur iPhone : rotation, barre Safari/PWA et variation de hauteur ne décalent plus le contenu.
- Dashboard et Utilisateurs utilisent la hauteur visuelle réelle (`100dvh` / variable mesurée), avec leur propre défilement vertical fluide.
- Suppression de l'ancienne réserve basse correspondant au dock Noctra alors que le dock est masqué dans le Dashboard.
- Le raccourci flottant `Utilisateurs` est masqué sur les pages admin mobile pour ne plus recouvrir les cartes.

## Dashboard

- Une seule colonne réellement fluide.
- Actions serveur adaptées au téléphone : l'action principale occupe une ligne entière, puis les deux actions secondaires se partagent la ligne suivante.
- Boutons autorisés à revenir à la ligne sans dépasser du viewport.
- Sections, listes et sessions actives bornées à la largeur disponible.
- Espacements et paddings des sessions réduits sur téléphone.

## Utilisateurs

- Suppression du grand espace vertical au-dessus de `Utilisateurs` grâce à la hauteur réelle du header.
- Titre + bouton Ajouter restent sur une ligne responsive.
- Conversion de la grille carrée Jellyfin en véritable liste mobile.
- Chaque utilisateur devient une ligne compacte : avatar 62 px, nom, dernière activité et menu à droite.
- Variante encore plus compacte sous 390 px.

## Version / cache

- Version : `88.0.0`
- Cache PWA : `noctra-shell-v88`
- `/health` et `/api/config` annoncent `88.0.0`.

## Vérifications

- `node --check public/noctra-shell.js`
- `npm run check`
- suite complète `npm test`
- test dédié `v88-admin-mobile-responsive.mjs`
- smoke test sous `BASE_URL=/noctra`
- tests relancés depuis le ZIP final réextrait dans un dossier neuf
