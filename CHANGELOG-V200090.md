# Noctra 200.0.90 — BowdTV avec compte

Le serveur BowdTV refusait la validation des sessions invitées sur l'hébergement avec `GUEST_NOT_ALLOWED` (403). Noctra peut désormais utiliser une session de compte BowdTV autorisée, conservée dans `runtime/bowd-account-session.json` avec des permissions 0600. Le mot de passe n'est pas enregistré et les jetons ne sont pas renvoyés à l'interface.

La session est restaurée après redémarrage et rafraîchie lors de l'obtention des jetons de catalogue. Si elle expire ou est révoquée, Noctra demande une reconnexion au lieu de revenir au mode invité refusé. La connexion initiale a été effectuée sur le serveur avec le compte fourni par son propriétaire.

L'archive ne contient aucune session, aucun mot de passe ni fichier .env. L'updater V7 conserve le dossier runtime existant. Sur une nouvelle installation, le compte doit être connecté séparément.

Validation : tests de connexion, restauration, expiration, protection des messages d'erreur et régressions v200.0.89. Les vérifications en production sont rapportées séparément après déploiement.
