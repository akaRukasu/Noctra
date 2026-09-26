# Noctra 200.0.120 — défilement natif sur PC, un seul écran de démarrage, TV Shaka stabilisée

## Défilement sur PC
**Cause.** Depuis la V92, le PC devait utiliser le défilement natif du navigateur (classe `noctra-native-wheel`). Une version ultérieure avait forcé ce réglage à `false`. Chaque cran de molette passait donc par un script qui bloquait le défilement du navigateur (`preventDefault`) et faisait défiler la page lui-même, image par image, avec des mesures de la page à chaque cran. Le défilement tournait alors sur le fil principal, et la moindre charge le faisait saccader.

**Correction.** Le défilement natif est rétabli sur ordinateur (et en ultra-large). Le script de lissage ne s'installe plus du tout. Le navigateur fait défiler la page hors du fil principal, avec son propre lissage.

## Démarrage : une seule animation
Le logo de chargement de Jellyfin s'affichait d'abord, puis l'intro Noctra quand les scripts étaient chargés. L'intro Noctra devient le seul écran de démarrage :
- elle est placée dans la page et s'affiche dès la première image, par-dessus le logo Jellyfin, désormais masqué ;
- elle s'efface quand l'application est prête : au plus tôt 1,1 s à la première ouverture de la session, aussitôt aux suivantes, au plus tard 10 s, et immédiatement vers la lecture ;
- si le script venait à manquer, elle s'efface d'elle-même après 12 s. Elle n'intercepte jamais un clic.

## Lecteur TV Shaka
**Diagnostic 200.0.119 (LiveWatch · BEIN SPORTS 2).** Après la première image, la lecture était au bord du direct, sans réserve. Toutes les 6 s environ, un saut (`shaka-seeking`) annulait les deux téléchargements en cours (`7001`). Aucun segment n'a été reçu pendant 90 s (`lastSegmentAgeMs` jusqu'à 92 888).

**Cause.** La playlist du fournisseur est courte (~36 s), et Noctra demande 30 s de retard. La fenêtre dans laquelle Shaka accepte la position de lecture ne faisait donc que ~6 s. Dès qu'un segment mettait plus de 6 s à arriver (débit estimé : 1,36 Mbit/s), le début de la fenêtre dépassait la position de lecture. Shaka la ramenait alors dans la fenêtre en annulant les téléchargements, puis recommençait, en boucle.

**Correction.** La fenêtre du direct passe à 120 s (`availabilityWindowOverride`), sur le lecteur comme en multivue. Mesuré avec le vrai Shaka 5.2.10 : la tolérance à un blocage passe de **7 s à 91 s**. Le segment en cours peut donc finir d'arriver, sans saut ni annulation. Le démarrage, le retard visé et l'ABR ne changent pas.

## Validation
- Nouveau test `tests/v200120-native-scroll-intro-shaka.mjs` (`npm run test:v200120`, qui enchaîne les tests 119 à 108). Il contient notamment la mesure de tolérance avec le vrai Shaka.
- Démarrage observé dans Chromium sur le vrai `index.html` : un seul écran visible, retiré dès que l'application s'affiche.
- Tous les tests qui réussissaient avant réussissent encore.

## À vérifier dans le prochain diagnostic TV
- Plus de série de `shaka-seeking` + `shaka-download-cancelled` toutes les 6 s.
- `lastSegmentAgeMs` qui ne dépasse plus quelques secondes.
