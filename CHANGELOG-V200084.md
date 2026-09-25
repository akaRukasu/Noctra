# Noctra 200.0.84

- Les bandeaux du multiview ne s’ouvrent plus au survol ni au clic simple. Double-cliquer le petit bouton « ⋯ » pour afficher ou masquer les commandes. Le bouton collectif est en haut au centre ; chaque case a son bouton dans le coin. Activation au clavier conservée.
- Les bandeaux masqués sont invisibles et ne captent plus les clics du lecteur, y compris sur mobile. Un double-clic sur la vidéo native peut également basculer ses commandes. Les clics à l’intérieur d’une iframe externe ne remontent pas à Noctra : utiliser son bouton « ⋯ ».
- Curseur de volume ajouté à chaque bandeau. Il règle les vidéos natives et les médias externes accessibles. Si le fournisseur bloque le contrôle interdomaines, le curseur revient à sa valeur précédente et invite à utiliser le volume interne. Aucun contrôle universel des lecteurs externes n’est annoncé.

Vérifications : tests du double-clic, du clic simple, de l’accès clavier, du volume natif/externe accessible et des refus ; suites de régression précédentes. Dans le navigateur local, clic simple sans ouverture, double-clic avec ouverture et fermeture, iframe conservée et curseur visible.

Installer les fichiers en conservant configuration et données puis redémarrer Noctra. Cache navigateur renouvelé. Aucun déploiement effectué.
