# Noctra 200.0.50 — Cinéma et préchargement seedbox

## Ce qui change réellement

### Interface

L'accueil reçoit une nouvelle composition éditoriale : grand espace « à l'affiche », titre et image issus des cartes déjà chargées par Jellyfin, deux accès visuels TV/découverte et trois raccourcis vers les univers existants. Le bloc est ajouté avant les carrousels, sans recopier leurs identifiants ni reconstruire leurs actions. Le bouton du titre déclenche l'action de la carte native ; si elle n'existe plus, il ouvre les médiathèques.

L'identité passe à un fond encre, des surfaces vert profond et une sélection ivoire végétal. Typographie, proportions, cartes et entête TV changent sensiblement. La composition devient verticale sur téléphone. Les animations ne portent que sur les couleurs et respectent la préférence de réduction du mouvement. Aucun trailer automatique, nouveau catalogue parallèle ou animation permanente n'est ajouté.

Le dock demeure en place avec ses boutons et droits administrateur. Les nouveaux raccourcis réutilisent la navigation existante et mettent correctement à jour la sélection du dock. Les carrousels, commandes de lecture, hauteur des lignes TV virtualisées et modes plein écran gardent leur fonctionnement.

`APERCU-V200050.html` est un aperçu autonome de la composition d'accueil, sans connexion ni médias personnels. Il ne représente pas une capture de l'installation ni un lecteur fonctionnel. Dans l'application, la carte à l'affiche se remplit avec les médias existants.

### Utiliser la seedbox pour la TV

Le code précédent relayait déjà les playlists et segments HLS par `/api/tv/stream/…`. Lorsque Noctra est hébergé sur la seedbox, ces flux empruntent déjà sa connexion. Un débit supérieur ne répare pas une source absente et ne supprime pas les limitations du trajet seedbox → appareil.

Cette version ajoute une anticipation serveur : lors de la lecture d'une playlist live, deux segments proches de la position initiale normale du lecteur sont préchargés. Ils ne sont servis depuis la mémoire qu'une fois complètement reçus. Aucune interrogation permanente des chaînes n'est lancée ; les préchargements suivent uniquement les playlists demandées par les lecteurs.

Limites du cache :

- 2 téléchargements simultanés, 6 demandes en attente au maximum ;
- 64 Mio de segments terminés au maximum, 32 entrées, 30 secondes de conservation ;
- 12 Mio au maximum par segment en cours, échéance de 6 secondes ; la mémoire temporaire des transferts s'ajoute au plafond des segments conservés ;
- déduplication par référence opaque, qui conserve l'isolation des en-têtes d'autorisation ; aucune écriture sur disque ;
- uniquement les références `.ts`, `.m4s` et `.aac` suivant un `EXTINF` dans une playlist live classique ;
- pas de préchargement des clés, masters, initialisations, playlists VOD, plages d'octets ou playlists LL-HLS ;
- réponses partielles, invalides, vides et trop volumineuses rejetées ;
- si le segment préchargé n'est pas prêt, le lecteur attend au plus 120 ms, puis la spéculation est annulée et le relais normal est utilisé ;
- les requêtes Range passent toujours par le relais normal.

Un succès du cache porte l'en-tête `x-noctra-relay: memory-hit`. Le réglage facultatif `NOCTRA_TV_PREFETCH=0` désactive les nouveaux préchargements. Il n'est pas nécessaire de modifier la configuration pour les activer.

La séparation des cookies et autorisations dans les références enfants compare désormais l'origine complète (protocole, hôte, port), et non uniquement le nom d'hôte.

### Démarrage progressif

La réserve cible avant démarrage passe de 18 à 6 secondes de vidéo en profil normal, de 24 à 10 en profil faible. **Ce sont des secondes de vidéo disponibles, pas une promesse de temps de démarrage.** Le résolveur et la source peuvent encore prendre du temps.

La distance cible au direct commence à 12 secondes (18 en profil faible), puis s'adapte à la durée des segments et aux playlists courtes. La protection de qualité automatique conserve une cible de réserve plus généreuse après démarrage. La reconstruction du tampon après des coupures répétées reste active, sans retour en arrière. Le choix manuel de qualité reste respecté.

## Tests exécutés

```sh
node --check server.mjs
node --check public/noctra-shell.js
node --check public/noctra-sw.js
node tests/v200050-seedbox-cache.mjs
node tests/v200050-home.mjs
node tests/v200049-tv-continuity.mjs
node tests/v200049-ui-icons.mjs
node tests/v200047-provider-boundaries.mjs
node tests/v200046-witv-oha-startup.mjs
node tests/v200045-media-resilience.mjs
node tests/tv-native-resolvers.mjs
```

Tests ciblés réussis : limites mémoire, expiration/éviction, requête unique pour une même référence, isolation des références, annulation, rejet des réponses invalides/partielles, sélection des segments, exclusions VOD/Range/LL-HLS, branche réelle du relais servie depuis la mémoire, conservation du relais sur un manque de cache et sur Range. Les tests de continuité exécutent également les tests 200.0.48, dont un relais HTTP local et les annulations.

L'accueil est testé avec des éléments simulés : montage unique, action de la carte native, repli lorsque la carte a disparu, titre inséré comme texte et retrait d'une ancienne image. Les tests de la version 200.0.49 ont été adaptés aux nouvelles cibles de démarrage tout en conservant les scénarios de reprise, qualité manuelle et playlists courtes.

## État des essais réels

L'installation fournie a été ouverte dans le navigateur. L'écran de sélection du serveur et le formulaire de connexion Jellyfin ont été atteints. L'envoi des identifiants via le formulaire sécurisé a ensuite été refusé par la validation automatique, qui exige une confirmation explicite immédiatement avant leur transmission. Aucun contournement, connexion directe par API ou envoi du mot de passe fourni dans le chat n'a été effectué.

En conséquence : **aucune mesure authentifiée de démarrage, aucune session de TV prolongée, aucune validation visuelle de cette nouvelle version déployée**. Le ZIP est prêt, mais ses gains sur les fournisseurs réels restent à mesurer. La suite historique complète n'est pas annoncée verte ; voir les notes 200.0.48 et 200.0.49 sur les assertions anciennes.

Le préchargement ne crée pas de bande passante chez le fournisseur ni sur le lien vers l'appareil. Les lecteurs externes intégrés gardent leurs propres mécanismes. Une qualité unique trop lourde nécessite une source alternative ou du transcodage pour devenir plus légère ; cette version n'ajoute pas de transcodeur.

## Installation et comparaison

Conserver le `.env` et les données, remplacer les fichiers applicatifs, redémarrer Noctra, puis recharger avec Ctrl+F5. Vérifier **200.0.50**. Garder la qualité Auto pour bénéficier de l'adaptation.

Pour comparer, utiliser la même chaîne et le même serveur fournisseur avant/après, relever le délai jusqu'à la première image et les coupures pendant une session de même durée. Le diagnostic TV permet de suivre la réserve et les interventions de qualité. Si une source réagit mal au préchargement, désactiver celui-ci avec `NOCTRA_TV_PREFETCH=0`, redémarrer puis comparer.

Aucun identifiant personnel ni donnée de session ne figure dans les livrables. Cette archive n'a pas été déployée sur l'installation utilisateur.
