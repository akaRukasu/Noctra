# Noctra serveur 200.0.175

Le résolveur WiTV reconnaît maintenant le chargement dynamique des lecteurs de [witv.eu](https://witv.eu/). Les versions précédentes identifiaient les onglets, mais ne retrouvaient pas les flux utilisés par ces lecteurs.

Le serveur lit la correspondance publique entre les onglets et les lecteurs, puis l’adresse média déclarée par le lecteur. Il conserve le numéro de source lors du renouvellement et des changements de serveur. La validation et le relais des playlists et segments utilisent le contexte HTTP attendu par WiTV et son serveur de médias. Une vidéo de remplacement terminée est rejetée.

Les options HLS vérifiées passent en premier dans l’API commune. Les autres lecteurs et les secours restent sélectionnables. Le client Windows 0.5.9 peut utiliser cette mise à jour du serveur.

## Vérifications

- Catalogue réel de 183 chaînes.
- beIN Sports 1 France, Source 2, décodé dans le navigateur en 720p. Passage à Source 3, décodée en 504p.
- TF1, Source 3, décodée dans le navigateur en 1080p.
- Dernier contrôle navigateur avec au moins quatre secondes de progression vidéo pour chaque lecture, sans erreur fatale. TF1 a également été lu depuis sa Source 2 en 1080p.
- Décodage de plusieurs images de beIN et TF1 par FFmpeg via les routes authentifiées du relais Noctra. Les images ont été inspectées.
- Tests WiTV ciblés, démarrage WiTV/OHA, serveurs de Toutes les chaînes, intégrité statique, Movix, MPEG-TS et roulette réussis.

Les essais utilisent une instance locale des routes serveur avec une authentification de test. La disponibilité de chaque lecteur dépend de l’amont. Les lecteurs qui renvoient uniquement une iframe tierce n’ont pas tous fourni de flux natif lors du contrôle.

## Installation

Mettre à jour le serveur avec cette archive en conservant `.env` et `runtime`, puis redémarrer Noctra. Recharger la version web pour récupérer le numéro de version courant. Le point `/health` doit annoncer `200.0.175`.
