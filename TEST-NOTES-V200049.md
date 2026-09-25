# Noctra 200.0.49 — continuité TV et interface

Cette version inclut les corrections de récupération de flux de la version 200.0.48, basées sur l'archive 200.0.47 fournie. Elle vise les microcoupures de la partie **Chaînes** et les défauts d'icônes visibles dans les captures.

## Lecture TV

- Le préchargement des chaînes HLS vise 18 secondes de réserve en profil normal, 24 secondes en profil faible. La cible diminue automatiquement lorsque la fenêtre publiée par le fournisseur est trop courte. Le démarrage forcé conserve un minimum de réserve au lieu de partir systématiquement avec quelques secondes.
- La position cible du direct est exprimée en secondes : 22 secondes en profil normal, 28 secondes en profil faible, ajustées à la durée des segments et à la fenêtre disponible. La lecture reste à vitesse normale. Ce choix privilégie la continuité et augmente le décalage par rapport au direct.
- Le mode Auto observe le rapport entre temps de téléchargement et durée des segments vidéo. Lorsque la réserve diminue et que les segments arrivent trop lentement, il limite temporairement la qualité. La protection dure au moins 45 secondes, ou 90 secondes après une nouvelle interruption. La remontée exige plusieurs segments sains et se fait progressivement.
- Le plafond de qualité n'est pas supprimé par un ancien minuteur ni écrasé par le contrôleur de taille du lecteur. Les fragments audio ne déclenchent pas une baisse de qualité vidéo. Le choix manuel de qualité reste prioritaire.
- La reprise après reconstitution du tampon compte seulement les secondes devant la position courante. Elle ne rejoue plus une portion déjà regardée pour fabriquer une réserve. Un petit trou de tampon peut être franchi vers l'avant.
- Un événement réseau `stalled` sans interruption effective de la vidéo n'est plus compté comme une coupure.
- Le diagnostic exporté inclut l'estimation de bande passante HLS, le mode de qualité, le plafond temporaire et la cible de réserve du direct.

Le test de connexion fourni indique 101,70 Mb/s en réception, 19,27 Mb/s en émission et 11 ms de ping au repos. Aucun plafond fixe de « connexion lente » n'est imposé à partir de cette capture : le lecteur continue à se baser sur son profil et sur l'arrivée effective des segments. Le débit mesuré par Speedtest ne mesure pas celui de chaque fournisseur TV.

## Interface

- Remplacement SVG des glyphes `phonelink_lock`, `keyboard`, `content_copy`, `playlist_add`, `library_add` et sélection ; reconnaissance des libellés lorsque le glyphe est un caractère privé inconnu.
- Les classes structurelles des menus ne sont plus interprétées comme un nom d'icône. Les menus d'action conservent leurs icônes propres ; une action de lecture n'est plus assimilée au Cast sur la seule présence du mot « lecture ».
- Réparation d'une icône montée seule dans le DOM, remplacement sans doublon, conservation des emplacements de sélection volontairement invisibles.
- Menus plus lisibles, lignes d'au moins 44 px et libellés longs pouvant revenir à la ligne. Préférences regroupées dans des panneaux avec espacements homogènes, contrastes plus nets et adaptation mobile.
- Surfaces, filtres, sélection de chaîne et onglets TV harmonisés. Indicateur actif du dock affiné et focus clavier visible.
- Dock, liens et attributs de routage conservés. La hauteur des lignes TV virtualisées et la géométrie du lecteur ne sont pas modifiées par la nouvelle couche de styles.
- Transitions courtes sur les couleurs, respect de la réduction des animations pour les éléments retouchés, suppression du flou du dock pendant la lecture.
- Versions client, serveur, cache PWA et URL de chargement des styles/scripts synchronisées en 200.0.49.

## Vérifications exécutées

```sh
node --check server.mjs
node --check public/noctra-shell.js
node --check public/noctra-sw.js
node tests/v200049-tv-continuity.mjs
node tests/v200049-ui-icons.mjs
node tests/v200047-provider-boundaries.mjs
node tests/v200046-witv-oha-startup.mjs
node tests/v200045-media-resilience.mjs
node tests/tv-native-resolvers.mjs
```

Résultats : tests ciblés réussis. Le test de continuité exécute aussi les régressions 200.0.48, dont le relais HTTP local et l'annulation des requêtes. Il exerce la reprise avec 99 secondes déjà regardées et une seule seconde devant la lecture, les trous de tampon, le maintien et la remontée du plafond de qualité, le respect du choix manuel, l'isolation audio, une playlist live de six secondes et le démarrage du lecteur avec réserves normales/faibles. Les configurations sont instanciées avec le moteur HLS 1.7.1 livré.

Les tests d'icônes exécutent les fonctions de production avec des éléments simulés : noms réellement présents dans les fichiers Jellyfin livrés, repli sur libellé, remplacement lecture/pause, absence de doublons et maintien des cases invisibles. Les fichiers des polices locales sont présents. Le balisage du dock est identique à celui de la 200.0.48.

### Limites de validation

L'aperçu navigateur a été bloqué par la politique de sécurité de l'environnement, sur le serveur local et sur les fichiers locaux. Aucune validation visuelle ni interaction réelle dans Jellyfin n'est annoncée. Le fichier `tests/v200049-ui-fixture.mjs` permet de préparer une vérification locale des préférences, menus, dock et du balisage TV avec les styles et fonctions de production, sans compte ni chaîne externe : `node tests/v200049-ui-fixture.mjs`, puis http://localhost:8765/settings, /menu, /tv ou /mobile. Cette fixture n'est pas l'application authentifiée et ses clics ne valident pas les API Jellyfin.

La suite historique globale comporte déjà des tests figés sur d'anciennes versions/libellés ; elle n'est pas annoncée intégralement verte. Voir les notes 200.0.48 pour l'échec du test historique WiTV reproduit sur l'archive d'origine.

Aucun essai prolongé des fournisseurs externes ni de la connexion utilisateur n'a été effectué. Les réglages HLS s'appliquent aux flux gérés par le lecteur Noctra ; les lecteurs externes intégrés et le HLS natif du navigateur conservent leurs propres limites. Un flux à qualité unique ne peut pas être transformé en plusieurs qualités sans transcodage. Une source interrompue ou durablement trop lente peut encore couper.

## Installation

1. Conserver le `.env` et les données persistantes de l'installation.
2. Appliquer les fichiers applicatifs du ZIP selon la procédure habituelle, puis redémarrer Noctra.
3. Recharger le client avec Ctrl+F5 et vérifier la version **200.0.49**.
4. Tester les chaînes avec **Qualité : Auto**. Le démarrage peut attendre davantage de réserve et le direct est légèrement différé.
5. Si une chaîne coupe encore, relever son nom, le fournisseur, le serveur choisi et copier le diagnostic TV depuis les outils du lecteur. Les événements `quality-reserve-held` et `adaptive-rebuffer-ready` aident à distinguer ralentissement réseau et reprise du tampon.

Le ZIP ne contient pas de configuration personnelle ni de données d'exécution.
