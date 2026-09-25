# Noctra 200.0.80

Base : archive v200.0.79 fournie. Comparaison effectuée avec l’archive v200.0.77.

## Chaînes

- Sur l’installation ouverte dans Chrome, 6TER / LiveWatch a été observée avec environ 48 secondes de résolution, puis des échecs HTTP 415 (manifestLoadError) sur BASIC, CABLE et SAT, sans tampon vidéo. Il s’agit du diagnostic de la version précédente, pas d’une validation de la nouvelle version en production.
- Une playlist invalide issue d’une référence en cache déclenche désormais un renouvellement unique de cette référence. Si la nouvelle réponse reste invalide, l’erreur est conservée : aucune page HTML n’est transmise au moteur HLS.
- Les serveurs dont la sonde a échoué restent accessibles manuellement mais ne défilent plus automatiquement. Sans direct vérifié, le lecteur officiel est proposé en premier.
- Le premier serveur vérifié peut être retourné sans attendre les autres sondes ni un catalogue de secours lent. Les sondes gardent leurs délais propres ; pas d’annulation partagée susceptible d’interrompre leur traitement.
- Réserve initiale inspirée de la v77 : 8 secondes en profil normal, 10 en réseau faible, bornée par la fenêtre HLS. Une tentative anticipée après 6 secondes (12 en réseau faible) exige au moins 4 secondes de vidéo disponible (6 en réseau faible), également bornées par la fenêtre. Ce ne sont pas des délais garantis de première image.
- Les événements de l’ancien lecteur sont désactivés avant sa destruction ; les réponses de sélections précédentes ne remplacent plus le serveur choisi ensuite.

## Sports / BrigitteTV

- La page de match est analysée au clic pour extraire tous les boutons `change-video` publiés. Les noms et langues sont conservés. La page observée Club Brugge KV / Aston Villa en publiait 36 ; le nombre dépend du match.
- Le serveur choisi est résolu à travers les deux wrappers iframe du fournisseur pour ouvrir son lecteur externe dans Noctra. Aucune URL de serveur n’est inventée et aucun script tiers n’est exécuté sur l’origine Noctra.
- Les lecteurs BrigitteTV externes ne reçoivent plus l’attribut sandbox qui provoquait « Sandbox not allowed ». Les pages locales restent isolées.
- Le lien « Ouvrir le lecteur » vise désormais le lecteur sélectionné, avec un véritable lien utilisable sur mobile. Les pages complètes de certains fournisseurs disposent d’une hauteur mobile adaptée.

## Interface

- Médiathèques PC : quatre colonnes occupant la hauteur disponible.
- Médiathèques mobile : grille de deux colonnes, contenu compact, espace inférieur réservé au dock et à la zone sûre.
- Découverte : onglets non comprimés, défilement horizontal, libellés sans chevauchement.
- Plateformes : flèches de navigation pour les deux listes et barre de défilement visible sur PC.

## Vérifications et limites

`npm run test:v200080` passe : réserve de démarrage, réponses tardives, extraction des 36 serveurs réels, résolution des wrappers, isolation des iframes locales, renouvellement HTTP 415 borné et arrêt du défilement automatique des flux non vérifiés. Les suites de transport, reprise, séparation des fournisseurs, qualité et authentification Jellyfin passent également, ainsi que les contrôles de syntaxe.

Rendu vérifié dans un navigateur à 1440 × 900 et 390 × 844 avec les fichiers CSS réels et le balisage de l’application sur des données de démonstration. Le clic sur la flèche a effectivement déplacé la liste des plateformes. Ces essais ne remplacent pas une vérification Safari sur téléphone.

Le contenu exact de la réponse distante provoquant 415 n’a pas pu être récupéré. Le renouvellement corrige la gestion du rejet ; une source qui renvoie toujours une réponse invalide reste indisponible. La nouvelle version n’a pas été déployée sur Ultra.cc et la lecture continue des fournisseurs distants n’est pas certifiée. Un lecteur intégré peut nécessiter un appui sur Lecture.

## Installation

Installer le ZIP avec l’updater habituel, redémarrer Noctra et recharger complètement la page. Vérifier l’affichage de la version 200.0.80. L’archive ne contient ni `.env` ni données de session. Tester ensuite une chaîne habituelle et un match BrigitteTV sur PC et mobile. Le retour à l’archive précédente reste possible avec l’updater.
