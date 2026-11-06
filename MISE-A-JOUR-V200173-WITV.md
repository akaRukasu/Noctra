# Noctra serveur 200.0.173

La source intégrée WiTV utilise désormais [witv.eu](https://witv.eu/). Lors du contrôle, l’ancienne adresse répondait HTTP 410. L’identifiant de source `witv-public` reste le même pour les clients. Le serveur lit les cartes des neuf catégories, associe le titre et le logo à leur propre chaîne, écarte les liens hors du site et signale les catégories sans chaîne exploitable.

Les liens de résolution et d’ouverture pointent vers le nouveau domaine. Lorsque WiTV ne publie aucun flux intégré que le serveur peut vérifier, l’API indique l’indisponibilité de la lecture native. Elle renvoie la page officielle ainsi que les secours manuels déjà proposés. Le site WiTV interdit l’affichage de ses pages de chaîne dans une fenêtre intégrée d’un autre site. La version web propose alors le bouton **Ouvrir le lecteur**.

## Vérifications

- Le serveur a été lancé localement avec une authentification Jellyfin simulée. Les routes de production ont exposé la nouvelle adresse et 183 chaînes WiTV réelles, réparties dans les neuf catégories, sans doublon de lien ni avertissement de catalogue.
- La fiche de TF1 a renvoyé son URL officielle et les options de secours. L’API a indiqué qu’aucun flux intégré n’avait pu être vérifié lors de cet essai.
- Tests WiTV ciblés, contrôle statique, démarrage WiTV/OHA, migration Movix, MPEG-TS et roulette réussis.
- Trois tests historiques échouent au même point sur l’archive 200.0.172 d’origine. `tv-native-resolvers` attend une ancienne liste de miroirs OHA, `tv-playback-regressions` attend une ancienne forme du choix WiTV et `v200047-provider-boundaries` n’injecte pas `OHA_MIRRORS` dans sa simulation.

## Installation

Mettre à jour l’installation Noctra serveur avec l’archive 200.0.173, préserver `.env` et le dossier `runtime`, puis redémarrer Noctra et recharger la version web. Pour vérifier la version du processus, consulter `/health`. Le correctif a été vérifié sur une instance locale.
