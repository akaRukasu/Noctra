# Noctra 200.0.79 — Démarrage TV

Base : archive v200.0.78 fournie. Le lien de conversation partagé n'a pas pu être lu dans cet environnement ; les notes incluses dans l'archive ont servi de contexte.

## Corrections

- LiveWatch / NorthTV / FrameTV : le premier direct vérifié est renvoyé sans attendre les autres sondes. Les requêtes de sondage perdantes reçoivent un signal d'annulation. Le budget de chaque groupe de sondes est partagé (18 secondes), au lieu de renouveler un délai de 18 secondes à chaque playlist et segment. L'authentification et la recherche préalable du catalogue restent des étapes distinctes.
- FrameTV : la recherche des catalogues de secours ne bloque plus un flux déjà vérifié. Les variantes de la famille restent proposées sous le lecteur. Les secours d'autres familles apparaissent s'ils sont déjà disponibles ; si aucun serveur de la famille ne répond, leur recherche reste attendue.
- Vérification LiveWatch : choix d'une variante HLS peu coûteuse pour la sonde et d'un segment récent, en évitant les segments signalés manquants. Vérification de données reçues pour rejeter les segments vides et les pages d'erreur. Le lecteur conserve le master original et son choix de qualité.
- Démarrage HLS partagé : objectif initial de 2–3 secondes de média (3–4 sur réseau faible), adapté aux playlists courtes. Après 3 secondes de préchargement (6 en profil faible), un tampon lisible d'au moins 0,5 seconde permet la tentative de lecture. Il ne s'agit pas d'une promesse de délai de première image. La réserve de continuité reste constituée pendant la lecture.
- Changement de chaîne : annulation côté navigateur des requêtes de résolution précédentes ; les réponses anciennes restent protégées par le numéro de lecture. Cette annulation ne garantit pas l'arrêt du traitement distant déjà commencé.
- Numéro de version, URL du script client et cache mis à jour.

## Sports et Alternative sur mobile

- Alternative et BZH/Volkamax : sur mobile, la route Noctra redirige l'iframe extérieure vers le lecteur publié, sans créer une deuxième iframe intermédiaire Noctra. Le lecteur reste intégré dans Noctra ; les contrôles généraux et le lien externe restent disponibles autour du lecteur. Le wrapper de bureau est conservé.
- Permissions média explicitement transmises aux iframes, y compris après une redirection de leur origine. Cela ne supprime pas les exigences de geste utilisateur du navigateur.
- Les pages web complètes d'Alternative et les pages de compatibilité disposent d'une hauteur mobile suffisante pour leurs commandes, au lieu d'être toutes tassées dans un cadre 16:9. Retour au format vidéo lors d'un passage au lecteur natif.
- Le chargement HTML d'un lecteur Sport/Alternative ne suffit plus à annoncer « lecture en cours » : l'interface invite à lancer le lecteur.
- Alternative : budget partagé de 8 secondes pour les redirections courtes. En cas d'échec de cette résolution, le lien publié reste ouvert dans l'iframe au lieu de laisser une requête sans échéance. Aucune garantie de lecture si ce lien ou sa destination refuse les iframes, utilise du HTTP bloqué dans une page HTTPS ou reste indisponible.

## Haloule 1.1

Le catalogue Alternative importe les 63 liens nommés observés dans la section 1.1 le 8 septembre 2026, dont ESPN FR by DISNEY+, les variantes LIGUE 1+, les bouquets Canal+, beIN et les chaînes musicales. Les variantes sont conservées séparément, y compris deux libellés publiés avec la même URL. Les noms abrégés MAX sont complétés en BeinSport MAX.

La délimitation accepte les balises HTML insérées dans les titres mais n'importe pas les sections suivantes. Toutes les entrées sont regroupées sous « Haloule · section 1.1 ». Les astérisques signalant les événements seuls sont pris en compte quand ils sont présents dans le HTML. L'import de liens ne certifie pas leur lecture.

Source : https://www.haloule.com/2024/01/meilleurs-sites-applications-android-PC-regarder-live-tv-gratuitement.html

## Validation locale

Huit suites ciblées : v200079-tv-startup, v200079-sports-mobile, v200079-source-contracts, v200047-provider-boundaries, v200048-tv-recovery, v200051-roulette-providers, v200074-quality, v200076-jellyfin12. Contrôles de syntaxe du serveur et du client modifiés.

Les tests couvrent le premier serveur prêt face à un serveur suspendu, l'annulation du perdant, le résolveur FrameTV face à un catalogue suspendu, le rejet de données vides/HTML, le démarrage avec une seule seconde en mémoire, les 63 liens Haloule et les réponses mobiles sans wrapper imbriqué.

Les suites historiques v200070 et v200078 conservent leurs anciennes attentes de démarrage ; elles ne constituent pas le contrôle de cette version. Leurs scénarios de sources sont repris dans v200079-source-contracts avec le nouvel état d'expiration et les nouveaux objectifs de tampon. Utiliser `npm run test:v200079`.

Le navigateur de test n'a pas pu accéder à la page locale (ERR_BLOCKED_BY_CLIENT) : ni le rendu mobile dans ce navigateur, ni Safari/iOS réel, ni la lecture des fournisseurs distants ne sont certifiés. La page Haloule a été consultée et son bloc 1.1 contrôlé.

## Installation et essai réel

Installer le ZIP avec l'updater habituel, redémarrer Noctra et recharger la page (Ctrl+F5 sur PC). L'archive ne remplace pas le fichier `.env` de déploiement.

Tester une chaîne LiveWatch et une autre source HLS : première image, lecture de plusieurs minutes, changement rapide de chaîne et sélection d'un autre serveur. Si une source bloque encore, copier le diagnostic depuis le menu du lecteur, avec le nom du fournisseur et de la chaîne.

Aucun accès au serveur Ultra.cc ni visionnage de flux distants n'a été effectué ici. Ces tests prouvent les corrections locales décrites, pas la disponibilité actuelle de chaque fournisseur. Un fournisseur indisponible peut toujours échouer et un démarrage avec moins de réserve peut nécessiter une reprise si la connexion ne suit pas.
