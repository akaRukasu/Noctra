# Noctra Premiere — 200.0.57

## Interface

Accueil cinéma avec une mise en avant de la séance en cours, image large et accès à « Reprendre » et « Voir la fiche ». Ces actions transmettent le clic aux commandes Jellyfin existantes. Les rangées, carrousels, favoris et commandes natives sont conservés.

Nouvelle direction nocturne violet et bleu : dock en pilule, grandes courbes, affiches arrondies, recherche en capsule, quota circulaire et surfaces plus lisibles. Les demandes, découvertes, médiathèques, roulette, téléchargements et espaces TV partagent les nouveaux styles. Les commandes du lecteur Jellyfin sont conservées ; sa stratégie de mise en mémoire et le multiview sont améliorés comme décrit ci-dessous.

Adaptation mobile et tablette, zones tactiles, focus clavier et respect de la réduction des animations. La mise en avant de l’accueil apparaît uniquement lorsqu’une lecture à reprendre existe.

## Plateformes et catalogues

- Fusion des formules équivalentes : Netflix avec/sans publicité, Prime Video avec/sans publicité, Paramount+ et Premium. Les identifiants des formules sont conservés pour rechercher leur catalogue combiné.
- Liste commune films et séries. Les principaux services apparaissent en premier ; les autres restent accessibles dans « Autres services et chaînes ».
- Les chaînes commercialisées via Amazon restent distinctes : elles peuvent nécessiter un abonnement supplémentaire. Apple TV Store reste distinct d’Apple TV.
- Suppression de la limite aux films et séries sortis dans les derniers mois lorsqu’on explore une plateforme.
- Pagination films et séries, avec jusqu’à 40 candidats par page et poursuite via « Afficher plus ». Les doublons de titres sont éliminés.
- Pour une plateforme sélectionnée, contrôle de chaque titre dans ses offres du pays configuré, par identifiant de fournisseur. Seules les offres abonnement, gratuit et publicité sont retenues ; achat, location et offres d’un autre pays sont exclus.
- Aucun ajout de recommandations générales hors de la plateforme choisie. Changer de catégorie quitte le filtre de plateforme, sauf dans la catégorie Streaming.
- Une erreur de vérification ne devient pas une fausse disponibilité. Le catalogue signale l’échec et permet de réessayer.

La disponibilité provient de TMDB / JustWatch, directement ou via Seerr. Elle n’est pas une garantie contractuelle du catalogue de chaque opérateur : les droits évoluent, les offres peuvent différer selon la formule et certaines saisons peuvent ne pas être incluses. Les vérifications de disponibilité sont conservées 30 minutes en cache. Le pays reste celui de `DISCOVERY_REGION` (FR par défaut).

Références : [fournisseurs TMDB](https://developer.themoviedb.org/reference/watch-providers-movie-list), [JustWatch](https://www.justwatch.com/).

## Lecture Jellyfin 1080p

- Suppression d’une réserve HLS réduite à six secondes sur certains navigateurs. La réserve visée dépend maintenant du débit et de l’appareil, généralement 40 à 75 secondes pour les débits 1080p testés. Le démarrage n’attend pas que cette réserve soit pleine.
- Mémoire tampon ajustée aux appareils mobiles et moins puissants ; historique vidéo conservé limité à 15 ou 30 secondes, au lieu d’une durée infinie.
- Le débit demandé par le lecteur est conservé. Une qualité réduite ne remonte plus automatiquement à 12 Mbit/s.
- Deux reprises supplémentaires, espacées, après épuisement des tentatives HLS sur les erreurs réseau temporaires. Les erreurs d’authentification, de fichier absent, de manifeste initial et de codec restent traitées par le lecteur natif. Les reprises sont annulées quand le lecteur est détruit ; elles ne forcent ni lecture ni déplacement dans la vidéo.
- Nouveau nom de ressource pour le module vidéo modifié afin d’éviter qu’un ancien module reste en cache.

Le serveur Jellyfin a été interrogé en lecture seule : il répondait et une session transcodait. Aucun réglage serveur n’a été changé. Ces corrections traitent des causes côté client ; elles ne garantissent pas l’absence de coupures dues au réseau, à un fichier ou au transcodage. Aucun essai prolongé de vos films en production n’a été effectué.

Références techniques : [API HLS.js](https://github.com/video-dev/hls.js/blob/master/docs/API.md), [transcodage Jellyfin](https://jellyfin.org/docs/general/post-install/transcoding/).

## Multiview

- Correction d’une variable réseau non définie qui empêchait le démarrage HLS.
- Les événements du lecteur sont installés avant le chargement, y compris pour les manifestes déjà en cache.
- Le retrait d’une case ne redémarre plus les autres. Quand il ne reste qu’une case, le multiview se ferme et restitue le lecteur principal selon son état précédent.
- Son exclusif pour les flux directs, avec possibilité de tout couper ; état audio visible et accessible au clavier. Le son d’un lecteur web externe reste géré dans ce lecteur.
- Boutons « Lire » si le navigateur bloque le démarrage et « Réessayer » en cas d’erreur, pour relancer uniquement la case concernée.
- Annulation des démarrages et reconnexions en attente lors d’une fermeture, d’un retrait ou d’un nouvel essai. Le lecteur principal HLS suspend son chargement pendant le multiview.
- Mémoire et qualité adaptées au nombre de cases. Le plafond de 25 reste disponible ; les performances réelles dépendent des flux, de la connexion et des capacités de décodage de l’appareil.
- Commandes tactiles de 44 px, cartes arrondies, deux colonnes sur tablette et téléphone en paysage, une colonne défilante sur petit téléphone en portrait. Les grilles denses restent défilables avec des cases utilisables.

## Installation sur le serveur

Utilisez votre outil habituel avec l’archive complète :

```sh
noctra-update /chemin/vers/noctra-media-client-v200.0.57.zip
```

L’installateur existant sauvegarde la version précédente et conserve `.env`, `runtime` et les journaux. Ne remplacez pas votre configuration par les exemples fournis. Aucun secret du `.env` transmis n’est ajouté à cette archive. Les versions des ressources ont été mises à jour pour renouveler le cache du navigateur.

Cette livraison n’a pas été déployée sur votre serveur. Aucune migration de base de données ni dépendance supplémentaire n’est requise.

## Vérifications effectuées

- Syntaxe du serveur et du client : `npm run check`.
- Nouveaux tests de lecture et multiview : réserves mémoire, débit conservé, reprises bornées, annulation, démarrage HLS, son exclusif et retrait sans redémarrer les autres.
- Nouveau test de catalogue : `node tests/v200057-legal-catalog.mjs` (fusion, séparation des revendeurs, pays, offres exclues, erreurs, concurrence limitée, pagination et contrats de requêtes TMDB/Seerr).
- Suite récente : `npm run test:v200057`, incluant les régressions 200.0.56 et antérieures de navigation, défilement, menus mobiles, plein écran et TV.
- Flux de découverte : `node tests/v200-discovery-feed.mjs` (pagination, doublons, erreurs, réponses obsolètes et filtres).
- Requêtes réelles TMDB : deux pages de Netflix, Prime Video et Disney+ en France. Les 240 candidats examinés avaient une offre correspondante ; les pages comprennent de nombreux titres antérieurs à 2025. Ce contrôle échantillonné ne certifie pas l’ensemble des catalogues.
- Navigateur : inspection de l’accueil hébergé existant ; validation locale de l’accueil et des demandes avec les fonctions de rendu et styles de production, sur données publiques de démonstration. Ordinateur 1440 px, tablette 820 px, téléphones 390 et 320 px. Pas de débordement horizontal dans les demandes aux trois petites largeurs ; cinq commandes dans le dock mobile ; sélection de plateforme et transmission du clic « Reprendre » vérifiées.

- Multiview en navigateur : lectures réelles de deux puis quatre flux publics [Mux / Big Buck Bunny](https://test-streams.mux.dev/). Progression vidéo et mémoire tampon vérifiées, changement de son, retrait sans remise à zéro des autres vidéos, fermeture sans lecteur résiduel. Présentation contrôlée à 1440, 820 et 320 px ainsi qu’en paysage 844 × 390. Aucun débordement horizontal dans la grille après correction ; commandes de 44 px. Ces essais utilisent les fonctions multiview et HLS.js de production dans un banc local, pas les chaînes de votre serveur.

Limites : la suite historique `npm test` s’arrête dès son ancien prétest, qui exige encore la version 200.0.21 et un ancien identifiant de cache. Cette incohérence existe déjà dans l’archive 200.0.56. Elle n’a pas été masquée en supprimant des tests. Utilisez les vérifications ciblées ci-dessus pour cette livraison. Pas de lecture exhaustive des médias de production, de validation Seerr sur le serveur, ni de test sur iPhone/iPad physique ; les demandes, téléchargements et modifications de données de production n’ont pas été déclenchés.
