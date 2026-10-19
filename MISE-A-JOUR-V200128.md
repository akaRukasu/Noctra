# Noctra 200.0.128 — chaînes réunies, serveurs testés, génériques et épisodes comme sur Noctra TV

Cette version contient aussi toutes les corrections de la 200.0.127 (voir `MISE-A-JOUR-V200127.md`).

## TV en direct : les chaînes d'abord
Comme sur Noctra TV (applis Android TV, LG et Samsung), la TV s'ouvre directement sur les chaînes, et non plus sur une source.
- **Toutes les chaînes** (univers « Chaînes ») : les chaînes de toutes les sources sont réunies, une seule carte par chaîne. « TF1 HD » de LiveWatch, « FR: TF1 » d'une liste M3U et « TF1 » de Movix ne font plus qu'une chaîne.
  - Numéros de la TNT pour les chaînes françaises (1 TF1, 2 France 2…), puis 30, 31… ; chaînes des autres pays ensuite, par pays.
  - Catégories claires : Généralistes, Info, Sport, Cinéma, Séries, Jeunesse, Découverte, Musique ; « International · Royaume-Uni »… pour les autres pays.
  - Logos officiels des chaînes françaises (collection tv-logos), sinon ceux des sources.
- **Chaînes sport** (univers « Sports ») : les chaînes sportives de toutes les sources (beIN Sports, Canal+ Sport, RMC Sport, Eurosport…), avec les mêmes numéros. Les matchs du jour restent disponibles dans leurs sources (Sports, Football Live, DLStreams…), dans le bandeau.
- Les règles de noms, de pays, de catégories et de regroupement sont celles de la version TV (même code).
- La liste s'affiche dès que les sources ont répondu, ou au bout de 12 s avec celles déjà reçues ; elle se complète ensuite toute seule, sans couper la lecture.
- Chaque source reste accessible séparément dans le bandeau.

## Détection des serveurs (même système que Noctra TV)
Une chaîne réunie a un serveur par source. Au lancement :
1. Les 12 premiers serveurs sont testés, 6 à la fois, comme le ferait le lecteur : liste de lecture, liste de qualité, puis dernier segment. Un serveur « automatique » est d'abord résolu, puis son premier flux est testé ; ce résultat sert au lancement, sans seconde résolution.
2. Chaque serveur affiche son état : « Test… », « En ligne », « En ligne · lent » (au-delà de 3,5 s), « Hors ligne » ou « Sans réponse ». S'y ajoutent sa fiabilité passée dans ce navigateur (« Fiable », « Instable », « Échec récent ») et « Dernier utilisé ».
3. Le serveur lancé est le mieux classé parmi ceux vérifiés en ligne : dernier serveur qui a fonctionné, fiabilité passée, type de lecteur (flux direct d'abord), rapidité. Les serveurs mieux classés encore en test sont attendus 6 s au plus.
4. En cas d'échec (erreur persistante, ou aucune image après 35 s), le serveur suivant prend le relais automatiquement : d'abord ceux vérifiés en ligne, puis ceux qui ne sont pas hors ligne. Chaque serveur garde ses propres secours (reconnexion, autre qualité…) avant ce relais.
5. Un clic sur un serveur le lance à la main.

Aucun lien de flux n'est mémorisé : seuls les noms des serveurs et leurs compteurs de réussite restent dans le navigateur.

## Séries et animés : passer l'intro et le générique
- Un bouton **« Passer l'intro »** (ou « Passer le récap », « Passer l'aperçu », « Passer le générique ») apparaît pendant le segment.
- Les temps viennent, dans l'ordre :
  1. des segments du serveur Jellyfin (extension de détection comme *Intro Skipper*, recommandée : elle repère seule les génériques de toutes les séries) ;
  2. des chapitres du fichier (« Opening », « Générique », « Credits », « OP », « ED »…) ;
  3. du générique appris pour la série : si vous avancez de 20 s à 3 min 20 dans les 10 premières minutes d'un épisode, ce passage est retenu, et le bouton est proposé aux épisodes suivants.
- Ce bouton remplace celui de Jellyfin (un seul bouton à l'écran).

## Entre deux épisodes
- **À suivre** : au début du générique de fin (ou 30 s avant la fin, 15 s pour un épisode court), une carte présente l'épisode suivant : image, logo de la série, « S1 · É2 — Titre », résumé. Il démarre seul après 10 s (compte à rebours, en pause si la vidéo est en pause).
  - « Lire maintenant » le lance tout de suite.
  - « Plus tard » : pas d'enchaînement, la lecture s'arrête à la fin de l'épisode.
- **Transition** : l'image de la série, son logo et le titre de l'épisode couvrent l'écran pendant le chargement, puis s'effacent dès la première image.
- Cette carte remplace « Épisode suivant » de Jellyfin.

## Serveur
Repris de la branche Noctra TV, utiles au regroupement :
- nom et pays officiels iptv-org ajoutés aux chaînes (`iptvOrgName`, `iptvOrgCountry`) ;
- guide des programmes trouvé aussi par nom approchant (« Canal Émotion » ↔ « Canal+ Émotion ») ;
- logos et identité iptv-org aussi pour les chaînes des bouquets (Movix…).

## Validation
- Nouveau test `tests/v200128-tv-channels-episodes.mjs` (`npm run test:v200128`, qui enchaîne les tests 127 à 108) : regroupement, numéros, matchs écartés, classement des serveurs, chapitres, générique appris.
- Banc d'essai dans Chromium avec le vrai code de la page TV et des flux simulés (en ligne, hors ligne, lent, illisible) :
  - TF1 réunie de 3 sources ; le serveur hors ligne est écarté, un serveur vérifié démarre ;
  - un flux illisible bascule seul sur le serveur suivant.
- Banc d'essai du lecteur avec le gestionnaire de lecture simulé :
  - bouton « Passer l'intro » par chapitres, puis saut à la fin de l'intro ;
  - générique appris ;
  - carte « À suivre » et compte à rebours, puis épisode suivant et transition ;
  - « Plus tard » arrête la lecture à la fin.
- Tous les tests qui réussissaient avant réussissent encore.
- Non testé sur le vrai serveur : les vraies sources TV (dont LiveWatch) et le lecteur Jellyfin réel n'étaient pas joignables d'ici.
