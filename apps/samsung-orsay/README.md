# Noctra TV pour Samsung Smart TV 2014 (Orsay)

Variante de l'interface Noctra TV (`apps/androidtv/web`) pour les Samsung de 2010-2014 (série H 2014 : UE40H6400…), qui utilisent la plateforme « Orsay » et non Tizen.

| Fichier | Rôle |
|---|---|
| `config.xml`, `widget.info` | description de l'appli pour le Smart Hub (1280 × 720, transparence pour la vidéo) |
| `index.html` | page de l'appli : API Samsung, puis l'écran de Noctra TV (repris de `apps/androidtv/web/index.html` à la construction) |
| `orsay-compat.js` | compléments du moteur WebKit 537 (Promise, fetch, URL, MessageChannel, DOM…) |
| `orsay-host.js` | hôte propre à ce téléviseur : touches, clavier à l'écran, lecteur AVPlay, flux (droit de lecture, relais), multiview en mosaïque, réglages, écran de démarrage |
| `orsay.css` | style propre (lecture sous la page, clavier, démarrage, mosaïque) |
| `icon/` | vignettes du Smart Hub (générées par `apps/scripts/render-icons.mjs samsung-orsay`) |
| `serveur/` | serveur d'installation (User App Sync) et relais local, copiés dans le kit |

Commun avec les autres téléviseurs : `tv-native.js`, `tv-data.js`, `app.js` et `app.css` (converti par `apps/scripts/build-orsay.mjs`). Les branchements de cette plateforme dans `tv-native.js` passent tous par `ORSAY` (actif seulement avec `platform=orsay`).

- Construction : `npm run apps:samsung2014` → `dist/apps/samsung-2014/` et `dist/apps/Noctra-Samsung-2014-<version>.zip`.
- Vérification : `npm run test:orsay`.
- Installation : [GUIDE-INSTALLATION-UE40H6400.md](GUIDE-INSTALLATION-UE40H6400.md) ; limites : [RAPPORT-COMPATIBILITE-UE40H6400.md](RAPPORT-COMPATIBILITE-UE40H6400.md).
