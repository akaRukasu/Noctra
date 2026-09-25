# Noctra 200.0.52

## Installer

Cette archive met à jour l’application Node.js existante sur votre seedbox. Elle n’a pas été déployée sur votre serveur par Codex.

Avec l’outil de mise à jour Noctra déjà installé, transférez le ZIP sur la seedbox puis lancez `noctra-update /chemin/noctra-media-client-v200.0.52.zip`. L’outil conserve le fichier `.env`, les données `runtime` et une sauvegarde de la version précédente. La copie de `runtime` est désormais vérifiée : une erreur interrompt la mise à jour avant le remplacement.

Pour une installation manuelle, sauvegardez l’application, conservez votre `.env` et votre dossier `runtime`, remplacez les fichiers applicatifs par le contenu du ZIP, puis redémarrez votre service Noctra. Node.js 20 ou supérieur reste requis. Rechargez le navigateur avec Ctrl+F5 et vérifiez que client et serveur affichent 200.0.52.

## Activer Movix VIP

1. Connectez-vous à Noctra avec votre compte administrateur Jellyfin.
2. Ouvrez **TV → Accès TV**.
3. Dans **Movix VIP**, collez votre clé puis choisissez **Vérifier et activer**.
4. Revenez à la TV, choisissez **Movix · IPTV VIP**, puis un bouquet et une chaîne. La recherche permet de trouver rapidement « FRANCE TV » ou « SPORTS ».

La clé est vérifiée auprès de Movix avant enregistrement. Elle reste dans `runtime/tv-provider-keys.json`, côté serveur, avec des permissions de fichier restreintes. Elle n’est pas renvoyée au navigateur ni intégrée aux fichiers publics. Le catalogue est accessible aux membres authentifiés de Noctra ; la disponibilité et les connexions simultanées dépendent de votre accès fournisseur. Les clés de test ne sont pas incluses dans cette archive.

Le même écran comporte **Northlive** pour saisir sa clé API. Il valide l’obtention d’une URL de lecture. Pour une configuration par environnement, `MOVIX_ACCESS_KEY` et `NORTHLIVE_API_KEY` sont également reconnus ; une clé enregistrée dans l’écran est prioritaire.

## Corrections de cette version

- Mobile : espace inférieur de l’accueil réduit, marge au-dessus du contenu augmentée, dock défilant sans barre visible.
- TV mobile : fournisseur dans un sélecteur compact, onglets horizontaux, commandes tactiles et titre moins encombrants.
- Roulette : contenu mieux aligné, largeur adaptée et filtres repliés au départ ; bibliothèques et filtres Jellyfin conservés.
- StreamSports99 retiré de Sports et conservé dans Chaînes. FCTV33 retiré de Sports.
- Accueil : animation des flèches des carrousels et défilement vertical progressif à la molette sur ordinateur, avec changement de direction immédiat et respect de la réduction des animations.
- Retour réservé à la lecture Jellyfin ; fermeture des sous-menus par leur bouton Fermer. Dock décalé seulement lorsque Retour est présent.
- Demandes : boutons des plateformes de streaming avec filtrage des découvertes ; recherche et demandes conservées.
- Menus « … » : remplacement des glyphes manquants par des icônes SVG pour les actions françaises.
- RénéVéo : sélection d’une source HLS disponible parmi les liens publiés ; rejet des clips terminés présentés comme un direct.
- DLStreams : lecteur intégré avec blocage des nouvelles fenêtres et des redirections de la page principale.

## Validation et limites

`npm run check` et `npm run test:v200052` passent. La suite couvre aussi les corrections récentes du relais TV, les autorisations Jellyfin, les filtres de la roulette et la confidentialité des clés. Des contrôles de l’interface ont été réalisés dans le navigateur à une largeur mobile de 390 pixels, notamment le changement de fournisseur. Les données Jellyfin/Seerr de ces essais sont simulées ; aucun test sur iPhone physique n’a été effectué. L’ancienne commande globale `npm test` conserve des assertions historiques incompatibles avec le numéro de version actuel.

RénéVéo publie encore des sources indisponibles : lors des essais, TF1 comportait des liens dont le certificat était invalide et un clip terminé de dix secondes. Noctra les signale ; il ne peut pas réparer ces serveurs. La présence d’une chaîne au catalogue ne garantit donc pas sa lecture.

DLStreams peut refuser l’intégration depuis un domaine non autorisé. Le blocage des fenêtres publicitaires ne supprime pas nécessairement les publicités à l’intérieur du lecteur. Aucun contournement des restrictions d’accès du fournisseur n’est inclus.

La stabilité du lecteur a été renforcée, mais zéro microcoupure ne peut pas être garanti lorsque le flux distant est défaillant. Conservez la qualité Auto pour bénéficier de l’adaptation. Cette archive n’est pas encore installée sur votre seedbox.
