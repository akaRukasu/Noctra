# Noctra 200.0.108 — « Aurora 2 » et stabilité Shaka

## Lecteur TV Shaka : stabilité

Analyse du diagnostic réel LiveWatch · VIP · CABLE · CANAL+ FOOT (200.0.107) :

- **Sauts réguliers** : toutes les ~52 s, un recalage automatique (`shaka-seeking`) avançait la lecture de ~2,2 s. Les horodatages internes des segments (~11 s chacun) présentent un trou de ~2,2 s tous les 5 segments, que Shaka franchissait en sautant.
- **Réserve grignotée** : chaque saut rapprochait la lecture du direct. L'écart au direct est passé de 26,6 s à 11 s en 6 minutes, puis la réserve s'est vidée (arrêt à 1241 s), avant qu'un nouveau cycle ne recommence.
- **Démarrage à 41,5 s** : environ 14 s étaient perdues parce que le premier segment téléchargé était abandonné lors du recalage sur les horodatages réels.

Corrections :

- **Mode séquence HLS** (`manifest.hls.sequenceMode`) : les segments sont enchaînés bout à bout sans suivre leurs horodatages irréguliers. Il n'y a plus de trou à franchir, donc plus de saut, et l'écart au direct reste constant.
- **PROGRAM-DATE-TIME ignoré** (`ignoreManifestProgramDateTime`) : l'alignement se fait par numéro de séquence. Cela évite aussi la mise à jour PDT fragile de Shaka 5.2.
- **Requêtes figées relancées plus tôt** : sans octet reçu, un segment est relancé après 10 s (15 s auparavant) et un manifeste après 8 s. Les gros segments qui progressent gardent jusqu'à 45 s. Les nouvelles tentatives sont espacées progressivement (5 essais pour un segment, 4 pour un manifeste).
- **ABR plus prudent** : un seul changement de qualité toutes les 12 s au maximum, et une montée seulement avec 30 % de marge de débit.
- **Relance automatique bornée** : après une erreur fatale en cours de lecture (décodeur, MSE, manifeste), le même flux est relancé au plus 2 fois en 5 minutes, sans changer de moteur ni de serveur. Après une erreur décodeur, la relance repasse en mode « par segments » par sécurité.
- **Diagnostic enrichi** : `shaka-seeking` indique désormais `liveDistance` (écart au direct) et `sequenceMode`, ce qui permet de vérifier que la réserve ne s'érode plus.
- Le multiview Shaka reçoit les mêmes délais et l'alignement sans PDT. Il reste en mode par segments.
- Réserve (45 s), seuil de reprise (3 s), préchargement et choix manuel du moteur ou du serveur : **inchangés**.

## Interface « Aurora 2 »

- **Police de titre Sora** (OFL 1.1, fichiers locaux dans `public/fonts`, sans CDN) pour tous les grands titres.
- **Lumière ambiante** : l'affiche de l'accueil se diffuse en halo coloré flouté derrière toute la page, avec un fondu enchaîné à chaque changement de titre. L'image est déjà chargée, il n'y a aucune requête supplémentaire.
- **Effet Ken Burns** très lent sur l'affiche et **anneau lumineux animé** autour d'elle (ordinateur uniquement).
- **Cartes qui s'élèvent au survol**, avec halo et reflet qui suit la souris.
- **Dock** : trait lumineux sous l'entrée active. Il reste statique.
- **Fiches** : titre en dégradé et boutons arrondis.

## Ergonomie

- **En-têtes de panneaux sur mobile** : le titre utilise toute la largeur, ce qui supprime les « Téléchargem… » et « Automatisat… » tronqués. Un titre long passe sur deux lignes au lieu d'être coupé.
- **Menu « Plus »** : plus de mot coupé en deux (« Téléchargement-s ») sur les petits écrans.
- **Téléchargements** : « Relocaliser pour le seed » et « Ajouter un .torrent » restent sur une ligne sur ordinateur, et la barre passe à la ligne plutôt que de déborder.
- **TV sur mobile** : en-tête plus compact, pour que la liste des chaînes arrive plus vite.

## Installation

Placer `noctra-media-client-v200.0.108.zip` dans le dossier de téléchargement puis lancer l'updater PC V7. Il conserve le `.env`, sauvegarde la version actuelle et vérifie `/health` (version attendue : 200.0.108). Recharger ensuite avec **Ctrl+F5**.

## Validation

- `npm run check` réussi.
- `npm run test:v200108` réussi : stabilité Shaka et refonte Aurora 2.
- Suites TV (tv-shaka, tv-shaka-multiview, tv-shaka-microstalls, tv-shaka-empty-index, v200048, v200049) réussies.
- Configuration vérifiée sur le vrai Shaka 5.2.10 embarqué : toutes les clés sont reconnues.
- Rendu contrôlé dans Chromium (1440 × 900, 1024 × 768, 390 × 844, 360 × 800) avec un audit automatique : pas de débordement horizontal, pas de titre tronqué, pas de cible tactile trop petite.

## Limites

- Le serveur https://akarukasu.merlion.usbx.me n'était pas joignable depuis l'environnement de développement (réseau restreint). Le mode séquence est donc validé par analyse du diagnostic et par tests, mais pas encore sur le vrai flux. Après installation, un nouveau diagnostic doit montrer des `shaka-seeking` rares, avec un `liveDistance` stable.
- Si un flux se comportait moins bien, le choix de HLS.js dans Outils TV reste disponible.
- Le test historique `v200107-resume-user-dock` vérifie la version exacte 200.0.107. Comme les tests des versions précédentes, il échoue désormais par conception.
