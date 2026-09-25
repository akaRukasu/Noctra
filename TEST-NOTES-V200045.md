# Noctra 200.0.45 — validation et limites

## Tests exécutés

```sh
node --check server.mjs
node --check public/noctra-shell.js
node tests/v200045-media-resilience.mjs
node tests/tv-native-resolvers.mjs
node tests/request-quality.mjs
node tests/library-grid-balance.mjs
```

Le test v45 utilise les fonctions réelles extraites du serveur et du lecteur, avec des réponses HTTP et des flux simulés :

- playlist correcte, réponse HTML/JSON incorrecte, corps bloqué et taille excessive ;
- 503 transitoire suivi d'un succès, refus 401/403 et limitation 429 non réessayés ;
- master et sous-playlist sans extension, MIME générique, puis segment vidéo ;
- distinction entre playlists, segments, clés et segments d'initialisation ;
- transmission d'Origin et retrait des cookies/bearers vers un autre hôte ;
- StreamSports : un serveur rapide n'attend pas le serveur bloqué, les essais perdants sont annulés, les autres choix restent accessibles ;
- renouvellement du serveur sélectionné et adaptation Auto sans modifier une qualité manuelle ;
- compilation du script OHA/Kool réellement injecté dans le HTML.

## Ce que cette livraison ne prouve pas

Les tests ne constituent pas une validation de chaque chaîne en direct, ni un essai prolongé de la connexion du domicile. Aucun temps de démarrage réel ou taux de microcoupure n'a été mesuré sur cette livraison. Les fournisseurs peuvent renvoyer des flux absents, expirés ou irréguliers ; zéro coupure n'est pas garanti. Les anciens tests historiques figés sur leur version ne forment pas une suite globale verte.

## Installation et retour de test

Conserver la configuration et les données actuelles, appliquer la mise à jour selon la procédure habituelle, redémarrer Noctra puis recharger complètement la page (Ctrl+F5). Vérifier la version 200.0.45.

Pour isoler un échec persistant, relever le fournisseur, le nom exact de la chaîne/diffusion, le serveur choisi et le temps jusqu'à la première image. Comparer ensuite dix minutes de lecture en qualité Auto. Une capture de « Reconnexion au même flux » ne suffit pas à conclure à une mauvaise route : les diagnostics réseau/lecteur permettent de distinguer le problème.
