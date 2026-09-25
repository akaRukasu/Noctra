# Vérification v200.0.44

## Défauts reproduits puis corrigés

- Le script JavaScript injecté par OHA en v43 échouait à la compilation avec une expression régulière invalide. Le contrôle `node --check server.mjs` ne pouvait pas détecter ce défaut dans le HTML généré.
- La recherche récursive de routes pouvait interpréter un identifiant EPG/token comme identifiant de chaîne.
- La réponse du résolveur natif attendait des sondes HTML inutiles ; ces sondes pouvaient cumuler plusieurs délais par miroir.
- Le seuil de démarrage de 16 secondes n'était pas atteignable sur certaines playlists courtes. Le lecteur attendait alors son délai de secours.
- Plusieurs notifications d'un même blocage pouvaient être comptées comme plusieurs coupures et déclencher une remise en tampon prolongée.

## Tests locaux

Exécuter depuis la racine du projet :

```sh
node --check server.mjs
node --check public/noctra-shell.js
node tests/v200044-oha-runtime-buffer.mjs
node tests/tv-native-resolvers.mjs
node tests/request-quality.mjs
node tests/library-grid-balance.mjs
```

Le nouveau test compile et exécute le script injecté avec un navigateur simulé : URL blob conservée, proxy non doublé, manifest transmis mais pas les segments, route de chaîne prioritaire sur les IDs parasites. Il vérifie aussi l'annulation des sondes, les seuils de tampon selon la fenêtre disponible et le comptage des épisodes de blocage.

## Limites de validation

- Le test direct du site Kool a atteint la page BEIN SPORTS 1 .c, mais le lecteur du fournisseur affichait lui-même une erreur média. Une page de chaîne valide ne garantit donc pas la disponibilité de son flux.
- Les tests locaux ne sont pas un essai prolongé sur chaque chaîne, ni une mesure des microcoupures sur la connexion du domicile.
- Les anciens tests figés sur des numéros de version/anciennes architectures ne constituent pas une suite globale verte pour cette livraison. Les commandes ciblées ci-dessus sont celles validées.

## Après installation

Conserver la configuration et les données existantes, redémarrer Noctra, puis recharger complètement la page (Ctrl+F5 sur ordinateur). Vérifier que la version affichée est 200.0.44 afin de ne pas mélanger ancien client et nouveau serveur.

Pour un retour utile, noter le fournisseur, le nom exact et le serveur de la chaîne, le délai jusqu'à la première image, puis la fréquence des coupures pendant dix minutes. Les diagnostics Noctra distinguent résolution, première image et remise en tampon.
