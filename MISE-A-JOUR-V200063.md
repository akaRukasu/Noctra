# Noctra 200.0.63

Archive complète, sans déploiement automatique. Conserver la configuration existante avec la procédure habituelle : `noctra-update /chemin/vers/noctra-media-client-v200.0.63.zip`.

## Accueil et interface

Le bandeau demande directement les douze lectures vidéo en cours du compte connecté via Jellyfin. Il fonctionne même si la section Continuer à regarder est désactivée dans l’accueil. Reprendre utilise l’action du lecteur Jellyfin et la position enregistrée ; Voir la fiche conserve la navigation native. Les requêtes sont annulées en quittant l’accueil et les données ne sont pas mises en cache entre utilisateurs. En l’absence de lectures, un état vide explicite est affiché. En cas d’erreur réseau, les cartes de reprise disponibles servent de secours.

Le menu Médiathèques retrouve une présentation pleine largeur, des actions regroupées et de grandes cartes illustrées : deux colonnes sur grand écran, une sur téléphone. Suppression de la colonne latérale et des numéros décoratifs.

Le dock mobile redevient flottant, translucide et arrondi, avec une marge latérale et une marge inférieure tenant compte de la zone système. Ses cinq boutons restent égaux et sans texte visible. L’ancrage est identique dans les sous-menus.

Dans le lecteur, centrage du menu et préservation de l’image de profil : les fonds des boutons ne remplacent plus leur image. Les actions masquées par le lecteur restent masquées.

## Continuité de lecture

- Jellyfin avec HLS : le budget de récupération réseau est renouvelé après 60 secondes de progression effective. Un saut dans la vidéo ou une interruption ne compte pas comme lecture stable. Les reprises restent limitées par incident, ne forcent pas la lecture après une pause et sont annulées à la destruction du lecteur.
- TV : lors d’un gel sans nouvelles données, le premier essai relance le chargement du même flux HLS avant de renouveler son adresse. Les récupérations suivantes et les changements de variante restent bornés. Le budget se réarme après 60 secondes de progression sans interruption, ce qui évite son épuisement pour toute une longue séance.
- Les réserves mémoire adaptées au mobile, l’adaptation automatique de qualité, la récupération des petits trous de buffer et les chemins de lecture native iOS/Android sont conservés. Aucun débit de transcodage forcé, aucun changement de serveur ou de réglage administrateur.

## Vérifications et limites

`npm run check` et `npm run test:v200063` passent. La suite récente vérifie notamment la lecture VOD, les reprises réseau, la TV, les séquences de changement de chaîne, les annulations, le multivue et les chemins de plein écran natifs.

160 cas navigateur couvrent dix vues, deux rôles et huit formats. 32 autres vérifient l’en-tête de lecture, le menu et l’image de profil. Les états d’accueil sans section Continuer à regarder, avec et sans résultat serveur, ont été inspectés dans le navigateur. Les rapports enregistrés sont dans `tests/v200063-*-results.json` ; les fixtures associées permettent leur régénération. Les tests Node vérifient ces mesures enregistrées, ils ne lancent pas de navigateur.

Les essais utilisent les styles et fonctions de production, des données fictives et des simulations de lecteurs/réseau. Il n’y a pas eu de lecture prolongée sur le serveur personnel ni de certification sur chaque appareil physique. La récupération HLS concerne les navigateurs utilisant HLS.js ; Safari en lecture native garde la gestion du tampon du système. Une source indisponible ou un débit inférieur à celui du contenu peut toujours provoquer des coupures.
