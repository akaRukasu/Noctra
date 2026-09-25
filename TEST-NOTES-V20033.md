# Verification v200.0.33

## Cause reproduite

La surveillance des icones du lecteur observait les changements de classe.
Sa propre correction reappliquait les classes et attributs deja presents,
declenchant une nouvelle notification sans fin. Le navigateur ne pouvait
plus traiter normalement le rendu et la lecture.

Le test navigateur isole echouait sur la v200.0.32 (41 notifications avant
arret de securite, icone Pause non mise a jour). Apres correction :
5 notifications, stabilisation, remplacement Pause/Lire fonctionnel,
icone ajoutee dynamiquement detectee et aucun glyphe superpose.

## Tests effectues

- `npm run check` : syntaxe serveur et interface valide.
- `npm run test:playback` : controle du lecteur, des ressources versionnees,
  des cibles tactiles et de l'ordre des menus valide.
- `node tests/playback-ui-browser.mjs` : page de regression locale, ouverte
  avec le navigateur de test, resultat PASS.
- Film Rogue One : image decodee 1920 x 800, lecture reelle et progression
  du temps sur ordinateur et dans le format mobile simule.
- Serie Les Griffin, S1E1 : lecture reelle et progression au-dela de 45 s.
- Pause/reprise, ouverture des menus audio, sous-titres et reglages,
  retour a la fiche et masquage/restauration du dock controles.
- Tailles controlees : 320 x 740, 390 x 844, 768 x 1024, 1024 x 768,
  1920 x 1080 et lecteur en paysage 844 x 390.
- Actions des fiches de 44 px, sans debordement, et sous le bas de l'affiche
  sur telephone et tablette. Changement de taille sans rechargement verifie.

## Limites

- Les formats mobiles sont simules dans Chromium. Aucun iPhone/iPad physique
  ni Safari natif n'etait disponible ; leur plein ecran natif reste a confirmer.
- Le plein ecran systeme ne peut pas etre valide de facon fiable avec
  le redimensionnement du navigateur integre de test.
- Les essais ne remplacent pas une lecture complete de chaque media/codec.
- `npm test` est bloque par le test historique v20021 qui exige encore la
  version 200.0.21. Ce blocage est distinct des tests cibles reussis ci-dessus.
- Aucun torrent, fichier de mediatheque ni reglage de telechargement modifie.
