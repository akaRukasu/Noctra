# Noctra 200.0.54

## Installer

Cette archive met à jour l’application Node.js existante sur votre seedbox. Elle n’a pas été déployée sur votre serveur par Codex.

Avec l’outil de mise à jour Noctra déjà installé, transférez le ZIP sur la seedbox puis lancez `noctra-update /chemin/noctra-media-client-v200.0.54.zip`. L’outil conserve le fichier `.env`, les données `runtime` et une sauvegarde de la version précédente. La copie de `runtime` est désormais vérifiée : une erreur interrompt la mise à jour avant le remplacement.

Pour une installation manuelle, sauvegardez l’application, conservez votre `.env` et votre dossier `runtime`, remplacez les fichiers applicatifs par le contenu du ZIP, puis redémarrez votre service Noctra. Node.js 20 ou supérieur reste requis. Rechargez le navigateur avec Ctrl+F5 et vérifiez que client et serveur affichent 200.0.54.

## Activer Movix VIP

1. Connectez-vous à Noctra avec votre compte administrateur Jellyfin.
2. Ouvrez **TV → Accès TV**.
3. Dans **Movix VIP**, collez votre clé puis choisissez **Vérifier et activer**.
4. Revenez à la TV, choisissez **Movix · IPTV VIP**, puis un bouquet et une chaîne. La recherche permet de trouver rapidement « FRANCE TV » ou « SPORTS ».

La clé est vérifiée auprès de Movix avant enregistrement. Elle reste dans `runtime/tv-provider-keys.json`, côté serveur, avec des permissions de fichier restreintes. Elle n’est pas renvoyée au navigateur ni intégrée aux fichiers publics. Le catalogue est accessible aux membres authentifiés de Noctra ; la disponibilité et les connexions simultanées dépendent de votre accès fournisseur. Les clés de test ne sont pas incluses dans cette archive.

Le même écran comporte **Northlive** pour saisir sa clé API. Il valide l’obtention d’une URL de lecture. Pour une configuration par environnement, `MOVIX_ACCESS_KEY` et `NORTHLIVE_API_KEY` sont également reconnus ; une clé enregistrée dans l’écran est prioritaire.

## Changements

- Accueil recentré sur un seul titre de votre collection : suppression des cartes de navigation et raccourcis répétés. Carrousels Jellyfin conservés.
- Présentation plus sobre : gris anthracite, commandes claires, typographie sans empattements, bordures et arrondis discrets.
- Dock utilisateur : largeur adaptée aux cinq commandes. TV et Roulette restent sur la même ligne ; répartition mobile corrigée. Les boutons administrateur restent réservés aux administrateurs.
- Carrousels : transition prolongée à 440 ms et conservation de la cible pendant l’animation.
- Molette : progression interpolée à chaque image, inertie adoucie, suppression de l’amplification des petits mouvements, changement de direction immédiat. Fonctionne aussi dans une fenêtre de bureau étroite. Les champs, panneaux, lecteurs et la préférence de réduction des animations gardent leur comportement dédié.

## Validation

La suite `npm run test:v200053` passe, y compris les tests de l’accueil adaptés à la suppression des boutons répétés et ceux des carrousels. La syntaxe a été contrôlée. Dock mesuré avec un compte utilisateur sur ordinateur et à 390 px : cinq boutons dans les limites du dock ; ouverture de la TV vérifiée. Aperçu du nouvel accueil vérifié dans le navigateur. Le ressenti à la molette reste à apprécier avec votre souris : les crans physiques sont lissés à l’écran, pas supprimés matériellement.

Les corrections TV et plein écran de la version précédente sont conservées. Aucun nouveau contrôle des fournisseurs n’a été effectué pour cette modification visuelle. Conservez `.env` et `runtime` pendant l’installation. Cette archive ne contient aucune clé et n’est pas déployée sur votre serveur.
