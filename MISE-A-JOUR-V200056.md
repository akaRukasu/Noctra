# Noctra 200.0.56 — Studio

## Installer

Cette archive met à jour l’application Node.js existante sur votre seedbox. Elle n’a pas été déployée sur votre serveur par Codex.

Avec l’outil de mise à jour Noctra déjà installé, transférez le ZIP sur la seedbox puis lancez `noctra-update /chemin/noctra-media-client-v200.0.56.zip`. L’outil conserve le fichier `.env`, les données `runtime` et une sauvegarde de la version précédente. La copie de `runtime` est désormais vérifiée : une erreur interrompt la mise à jour avant le remplacement.

Pour une installation manuelle, sauvegardez l’application, conservez votre `.env` et votre dossier `runtime`, remplacez les fichiers applicatifs par le contenu du ZIP, puis redémarrez votre service Noctra. Node.js 20 ou supérieur reste requis. Rechargez le navigateur avec Ctrl+F5 et vérifiez que client et serveur affichent 200.0.56.

## Activer Movix VIP

1. Connectez-vous à Noctra avec votre compte administrateur Jellyfin.
2. Ouvrez **TV → Accès TV**.
3. Dans **Movix VIP**, collez votre clé puis choisissez **Vérifier et activer**.
4. Revenez à la TV, choisissez **Movix · IPTV VIP**, puis un bouquet et une chaîne. La recherche permet de trouver rapidement « FRANCE TV » ou « SPORTS ».

La clé est vérifiée auprès de Movix avant enregistrement. Elle reste dans `runtime/tv-provider-keys.json`, côté serveur, avec des permissions de fichier restreintes. Elle n’est pas renvoyée au navigateur ni intégrée aux fichiers publics. Le catalogue est accessible aux membres authentifiés de Noctra ; la disponibilité et les connexions simultanées dépendent de votre accès fournisseur. Les clés de test ne sont pas incluses dans cette archive.

Le même écran comporte **Northlive** pour saisir sa clé API. Il valide l’obtention d’une URL de lecture. Pour une configuration par environnement, `MOVIX_ACCESS_KEY` et `NORTHLIVE_API_KEY` sont également reconnus ; une clé enregistrée dans l’écran est prioritaire.

## Navigation mobile repensée

Le dock affiche exactement cinq accès : Accueil, Médiathèques, Demandes, TV et Plus. Chaque commande possède une icône et un libellé. Les boutons n’exigent plus un défilement horizontal.

Plus ouvre un panneau accessible au clavier et adapté à la hauteur disponible. La roulette et l’installation de Noctra y sont disponibles pour les utilisateurs. Un administrateur dispose également de Téléchargements, Automatisation, Dashboard Jellyfin, Utilisateurs et Actualiser les médiathèques. Le panneau défile verticalement sur les petits écrans ; les commandes de gestion ne sont pas supprimées.

La fermeture par Échap remet le focus sur Plus. Le menu est reconstruit à partir du rôle connecté, et les contrôles d’autorisation existants restent actifs. Sur ordinateur, le dock complet est conservé.

## Refonte Studio

Une palette graphite et bleu pâle relie les surfaces, la navigation et les états sélectionnés. La refonte couvre les titres de pages, les onglets, les champs de recherche, les boutons, les cartes de découvertes et de plateformes, les demandes, les filtres de la roulette, les fiches et les menus contextuels.

Dans Demandes, la recherche devient le premier contrôle, suivie des onglets et plateformes. Sur mobile, son action est compacte. Les indications de quota sont allégées. En TV, la navigation et la liste de chaînes sont plus discrètes ; un sélecteur de fournisseur remplace la grande rangée de boutons sur les écrans d’au moins 1100 px. Le catalogue et les fonctions du lecteur sont conservés.

L’accueil reste centré sur les rangées Jellyfin, sans bloc promotionnel ni boutons répétés. Les correctifs de défilement et plein écran des versions précédentes sont inclus.

## Vérifications

`npm run check` et `npm run test:v200056` passent. La suite inclut les tests de rôle du menu Plus et les régressions récentes de l’interface, du défilement et de la TV.

Contrôles avec des comptes administrateur et utilisateur simulés, à 320 et 390 px : cinq boutons visibles dans le dock, aucun débordement de leurs limites ; toutes les commandes administrateur présentes dans Plus ; utilisateur limité à ses commandes ; fermeture au clavier avec retour du focus ; navigation de Plus vers Roulette vérifiée. Le panneau administrateur défile à 320 px.

Contrôles visuels de la roulette, des demandes et du menu mobile dans le navigateur. Les données Jellyfin/Seerr utilisées sont simulées. Aucun iPhone physique ni test exhaustif des médias de production. Les fournisseurs externes n’ont pas été retestés dans cette version graphique.

Conservez `.env` et `runtime` pendant l’installation. L’archive ne contient aucune clé privée. Cette version est à installer sur votre seedbox ; elle n’y a pas été déployée.
