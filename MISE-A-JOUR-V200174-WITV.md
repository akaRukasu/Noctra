# Noctra serveur 200.0.174

Le résolveur WiTV de Noctra renvoie une option par source affichée par le lecteur officiel de [WiTV](https://witv.eu/). Les clients reçoivent le nom de la source, sa position et le lien vers la page de la chaîne. La PWA affiche ces options dans la fiche de la chaîne et dans le menu des serveurs de Toutes les chaînes.

Les onglets dont le direct ne peut pas être vérifié ouvrent la page officielle après une sélection manuelle. Sur cette page, l’utilisateur sélectionne le numéro de source affiché dans Noctra. Les liens testés séparément ont renvoyé un panneau WiTV. Ils ne sont donc pas annoncés comme flux vidéo. Les résolveurs existants et les secours manuels restent disponibles.

L’API testée localement avec le catalogue réel a renvoyé 183 chaînes, cinq options pour TF1 et six pour beIN Sports 1 France. Elle n’a confirmé aucun flux intégré pour ces deux chaînes. Les tests du catalogue, des variantes, de l’ouverture manuelle en PWA, de la résolution WiTV/OHA, de Movix et du transport MPEG-TS ont réussi.

Mettre à jour le serveur en conservant `.env` et `runtime`, puis redémarrer Noctra. Le client Windows 0.5.9 utilise cette API commune. Le serveur corrigé a été testé sur une instance locale.
