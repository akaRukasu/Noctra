# Noctra 200.0.46 — OHA/Kool et WiTV

## Portée

Cette version cible les attentes de résolution OHA/WiTV et la conservation du lecteur WiTV choisi. Les réglages de tampon, la qualité de lecture et les parcours des autres fournisseurs sont conservés.

WiTV peut encore utiliser FSTV ou LiveWatch lorsque ses propres HLS échouent. Ces secours sont maintenant recherchés à la demande, avec leur provenance explicite. Les lecteurs web WiTV restent disponibles manuellement dans les options ; leur page HTML ne constitue pas une preuve que le média fonctionne.

## Vérifications locales

```sh
node --check server.mjs
node --check public/noctra-shell.js
node tests/v200046-witv-oha-startup.mjs
node tests/v200045-media-resilience.mjs
node tests/tv-native-resolvers.mjs
node tests/request-quality.mjs
node tests/library-grid-balance.mjs
```

Les fonctions de production sont testées avec réponses réseau simulées : premier lecteur prêt sans attente du lecteur bloqué ; annulation des sondes perdantes ; renouvellement de l'URL exacte du lecteur ; absence de recherche FSTV/LiveWatch tant que WiTV répond ; ordre des secours ; miroir OHA utilisable malgré une racine bloquée ; segment ancien expiré et segment récent disponible ; master sans extension et conservation du master original pour l'ABR.

Les vérifications v45 restent actives pour les playlists invalides, corps bloqués, sous-playlists sans extension, reprise limitée des erreurs HTTP, premier serveur StreamSports prêt et politiques de qualité/tampon. Deux assertions historiques d'identité/structure ont été adaptées à la nouvelle version et au parcours WiTV différé ; les assertions de comportement sont conservées ou remplacées par des tests exécutables ciblés.

## Limites

Aucun test prolongé des chaînes distantes ni test de la connexion du domicile n'a été effectué pour cette version. Les cas simulés prouvent le comportement du code testé, pas la disponibilité des fournisseurs, le décodage de chaque chaîne ou un gain chronométré sur Internet. Zéro coupure n'est pas garanti. La suite historique complète reste composée de tests parfois figés sur d'anciennes versions ; seuls les tests listés ci-dessus sont annoncés comme validés.

## Installation et essai

1. Sauvegarder l'installation actuelle, conserver la configuration et les données, puis appliquer l'archive via la procédure habituelle de mise à jour.
2. Redémarrer Noctra, recharger complètement la page (Ctrl+F5) et vérifier la version 200.0.46.
3. Tester plusieurs chaînes OHA et WiTV en Auto : noter le serveur affiché et le délai jusqu'à la première image, puis observer dix minutes de lecture.
4. Si un échec persiste, fournir la chaîne exacte, le serveur choisi, l'heure et le message d'erreur, sans partager d'identifiants ni d'URL contenant des jetons.

L'archive ne contient pas de configuration privée ni de données d'exécution. Le client est livré, mais aucun déploiement sur l'installation du domicile n'a été effectué.
