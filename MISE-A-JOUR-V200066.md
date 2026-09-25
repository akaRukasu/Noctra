# Noctra 200.0.66 — lecteur tactile, dock et continuité TV

Archive complète. Installation habituelle en conservant la configuration : `noctra-update /chemin/vers/noctra-media-client-v200.0.66.zip`. Cette livraison n’a pas été déployée sur le serveur personnel.

## Interface

- Sur téléphone et tablette tactile, l’en-tête vidéo conserve Retour, le titre et la diffusion. Les raccourcis Accueil, recherche, profil et SyncPlay sont retirés de cet en-tête uniquement.
- Les commandes de lecture sont réparties en un groupe de transport et un groupe d’options, avec des cibles de 44 px. Les raccourcis de chapitres redondants et le volume logiciel sont masqués sur mobile. Le format de l’image est conservé : une vidéo horizontale garde des bandes noires en portrait.
- Le dock flottant s’ancre sur la hauteur et le décalage du viewport visible, communs à l’accueil et aux menus. L’icône Accueil reste identifiée comme active.
- Carrousels mobiles en boucle dans les deux sens : réorganisation des cartes existantes aux extrémités, sans dupliquer les identifiants ni leurs gestionnaires d’actions. La boucle concerne les rangées assez longues pour déborder réellement ; les petites rangées restent naturelles. Le focus clavier n’est pas déplacé.

## Ce que l’essai TV réel a montré

Essai réalisé dans Chrome sur la version 200.0.65 du serveur personnel, le 6 septembre 2026 : LiveWatch, 13 EME RUE SAT. Le problème a été reproduit. Le lecteur démarrait après environ 31 secondes avec seulement 7 secondes effectivement disponibles devant la position de lecture, alors que les segments faisaient environ 14 secondes. Des mises en mémoire répétées ont suivi. Le rapport transmis par l’utilisateur montre le même scénario, avec une seule qualité disponible et une estimation de transfert d’environ 2,93 Mb/s. Cette estimation concerne le flux et n’est pas une mesure du débit maximum de la connexion.

La variante officielle n’a pas fourni de solution stable lors de cet essai ; une autre entrée BASIC présentait aussi un démarrage irrégulier. Ces observations ne permettent pas d’attribuer avec certitude le problème au fournisseur, au relais ou au réseau. Elles ne constituent pas un test réussi de la version corrigée en production.

## Corrections TV

- Le préchargement tient compte de deux durées de segment, jusqu’à 30 secondes, avec limitation à la fenêtre réellement disponible. Un segment long ne démarre plus sur le seul objectif fixe de 6 secondes.
- Le lancement vérifie la réserve devant la position réelle ; le diagnostic distingue cette réserve de la longueur totale des plages déjà chargées.
- Les protections de continuité des mêmes fournisseurs s’appliquent aussi depuis Favoris et les autres rubriques.
- Après des interruptions répétées malgré une réserve reconstruite, les familles LiveWatch/NorthTV/OHA/WiTV peuvent essayer une variante disponible, avec protection contre les boucles. Les options marquées comme secours manuel restent manuelles.

## Vérifications

Syntaxe et suite récente VOD/TV/multivue réussies. Banc de mise en page : 160 cas pour les vues et le dock, 32 pour le lecteur. Test de 100 passages aux extrémités des carrousels conservant exactement les cartes d’origine. Cas de segments longs et de playlists courtes vérifiés.

Les fixtures utilisent les fonctions et styles de production avec des données simulées ; celle du lecteur reprend sa structure native avec des symboles de test. Les rapports enregistrés sont dans `tests/v200066-*-results.json`. `tests/v200066-browser-fixture.mjs` et `tests/v200066-player-fixture.mjs` servent à les régénérer en ouvrant `/matrix`. Les tests Node valident les rapports enregistrés, ils ne lancent pas un navigateur.

Le test en direct a porté sur la version installée 200.0.65. Les corrections 200.0.66 sont testées localement. Une validation prolongée après installation et sur iPhone physique reste nécessaire ; aucune promesse de zéro coupure ni de compatibilité parfaite avec chaque appareil.
