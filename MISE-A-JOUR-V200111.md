# Noctra 200.0.111 — rafraîchissement des playlists TV fiabilisé

## Ce que montrait le diagnostic (200.0.110, LiveWatch · BEIN SPORTS 1)
- **Démarrage nettement plus rapide.** Après un choix de serveur, la première image arrive en 9 à 10 s, contre environ 40 s avant. Le correctif `HEAD` de la 110 est donc confirmé.
- **Nouveau point faible : les playlists.** Les erreurs portent désormais sur le **manifeste** (`requestType 0`, `7001 timedOut`, puis `1003`/`1010`). La dernière playlist reçue avait jusqu'à 48 s : le lecteur ne découvrait plus de nouveaux segments et la réserve se vidait.
- **Cause.** Le relais attendait la playlist complète du fournisseur avant de répondre. Au-delà de 10 s, Shaka abandonnait la requête, et cet abandon coupait aussi la requête en cours chez le fournisseur. La tentative suivante repartait de zéro et échouait de la même façon.

## Correction
Dès qu'une playlist a été servie une première fois, ses rafraîchissements passent par un chargement **détaché du lecteur** :
- **Un seul chargement.** Les nouvelles tentatives du lecteur rejoignent le chargement déjà en cours au lieu d'en lancer un autre. Le départ du lecteur ne l'annule plus.
- **Réponse en 7 s au plus**, sous les 10 s au-delà desquelles Shaka abandonne. Si le fournisseur est plus lent, Noctra renvoie la **dernière playlist connue**, à condition qu'elle date de moins de 30 s. Shaka reçoit une réponse valide sans erreur, et la version récente est disponible dès la tentative suivante.
- **Lien expiré ou refusé** (401, 403, 404, 410) : l'erreur remonte immédiatement, pour que l'URL signée soit renouvelée comme avant.
- **Mémoire limitée** aux 64 dernières playlists. Le premier chargement d'une chaîne ne change pas.

## Validation
- Nouveau test `tests/v200111-playlist-relay.mjs` (`npm run test:v200111`, qui inclut les tests 110, 109 et 108). Il vérifie : première playlist, rafraîchissement normal, fournisseur lent (dernière playlist renvoyée, un seul chargement, jamais annulé, version récente à la tentative suivante), fournisseur en erreur, lien expiré et limite de 30 s.
- Tous les tests qui réussissaient auparavant réussissent encore.

## À surveiller dans le prochain diagnostic
- Beaucoup moins de `shaka-download-failed` avec `requestType 0`.
- `lastManifestAgeMs` qui reste sous 15 s environ.
- Moins de `shaka-buffering` en cours de lecture.
