# Noctra 200.0.123 — démarrage TV avec réserve garantie

## Ce que montrait le diagnostic 200.0.122 (LiveWatch · BEIN SPORTS 1)
- Malgré le seuil de 15 s posé en 121, la lecture a démarré avec **7,46 s** de réserve, puis s'est coupée deux fois dans les 20 premières secondes (réserve à 0,43 s puis 0,45 s).
- Au moment de la première image, la playlist n'avait pas été rafraîchie depuis **26 s** (`lastManifestAgeMs: 26269`). Shaka croyait donc que le dernier segment connu marquait le bord du direct. Une fois ces 7,5 s téléchargées, il s'estimait « au bout » et démarrait.
- Dans le code de Shaka 5.2.10, sortir de la mise en mémoire parce que le tampon a atteint la fin des segments connus passe **avant** le seuil `rebufferingGoal`.

## Correction
- Shaka télécharge déjà pendant que la vidéo est en pause. Noctra attend donc maintenant **15 s de réserve** entre le chargement du flux et le lancement de la lecture, avec un statut « Préchargement du direct · 15 s… ».
- L'attente est bornée à 20 s : si la source est trop lente, la lecture démarre malgré tout avec ce qui est disponible, et la règle de Shaka reste en place.
- Changer de chaîne pendant l'attente l'abandonne aussitôt.
- Un événement `shaka-startup-reserve` (réserve obtenue, durée d'attente) est ajouté au diagnostic.
- Après la première image, la reprise se fait à partir de 6 s, jusqu'à 12 s si les coupures se répètent (comme en 121). La fenêtre du direct reste à 120 s (comme en 120).

## Validation
- Nouveau test `tests/v200123-shaka-startup-reserve.mjs` (`npm run test:v200123`, qui enchaîne les tests 122 à 108). Il vérifie aussi que la règle de Shaka décrite ci-dessus est bien présente dans la version embarquée.
- `tests/tv-shaka.mjs` couvre les deux cas :
  - réserve absente : aucun `play()` ;
  - réserve de 16 s : lecture lancée.
- Les scénarios Shaka existants (coupures répétées, gel, trous du direct, stabilité 108) reçoivent une réserve de départ dans leur banc d'essai.
- Tous les tests qui réussissaient avant réussissent encore.

## À vérifier dans le prochain diagnostic
- `shaka-startup-reserve` avec `reserve` ≥ 15 (ou `waitedMs` ≈ 20 000 si la source est très lente).
- `first-playing` avec `bufferAhead` ≥ 15, et plus de coupure dans les premières secondes.
