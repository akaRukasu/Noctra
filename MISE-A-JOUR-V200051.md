# Noctra 200.0.51

## Installer

Cette archive met à jour l’application Node.js existante sur votre seedbox. Elle n’a pas été déployée sur votre serveur par Codex.

Avec l’outil de mise à jour Noctra déjà installé, transférez le ZIP sur la seedbox puis lancez `noctra-update /chemin/noctra-media-client-v200.0.51.zip`. L’outil conserve le fichier `.env`, les données `runtime` et une sauvegarde de la version précédente. La copie de `runtime` est désormais vérifiée : une erreur interrompt la mise à jour avant le remplacement.

Pour une installation manuelle, sauvegardez l’application, conservez votre `.env` et votre dossier `runtime`, remplacez les fichiers applicatifs par le contenu du ZIP, puis redémarrez votre service Noctra. Node.js 20 ou supérieur reste requis. Rechargez le navigateur avec Ctrl+F5 et vérifiez que client et serveur affichent 200.0.51.

## Activer Movix VIP

1. Connectez-vous à Noctra avec votre compte administrateur Jellyfin.
2. Ouvrez **TV → Accès TV**.
3. Dans **Movix VIP**, collez votre clé puis choisissez **Vérifier et activer**.
4. Revenez à la TV, choisissez **Movix · IPTV VIP**, puis un bouquet et une chaîne. La recherche permet de trouver rapidement « FRANCE TV » ou « SPORTS ».

La clé est vérifiée auprès de Movix avant enregistrement. Elle reste dans `runtime/tv-provider-keys.json`, côté serveur, avec des permissions de fichier restreintes. Elle n’est pas renvoyée au navigateur ni intégrée aux fichiers publics. Le catalogue est accessible aux membres authentifiés de Noctra ; la disponibilité et les connexions simultanées dépendent de votre accès fournisseur. Les clés de test ne sont pas incluses dans cette archive.

Le même écran comporte **Northlive** pour saisir sa clé API. Il valide l’obtention d’une URL de lecture. Pour une configuration par environnement, `MOVIX_ACCESS_KEY` et `NORTHLIVE_API_KEY` sont également reconnus ; une clé enregistrée dans l’écran est prioritaire.

## Changements

- Nouvelle présentation partagée par les sous-menus : titres de pages, navigation, champs, cartes, tableaux, boîtes de dialogue et réglages. Ajustements tactiles et clavier.
- Logo centré en haut des fiches Films/Séries sur ordinateur ; dock séparé du bouton Retour.
- Demandes : nouvelle hiérarchie visuelle et textes plus simples ; recherche, suggestions, gestion et choix de qualité conservés.
- Roulette Jellyfin : Films, Séries, Films Animation, Animes, filtres par genre/note/année/non-vu, et 1, 3, 5 ou 10 propositions. Les résultats respectent les médiathèques accessibles au compte connecté.
- RénéVéo : catalogue français et sources publiées ; lecture HLS intégrée sans charger la page publicitaire autour. Les lecteurs web éventuels restent des choix manuels et peuvent conserver leurs publicités.
- Movix : Vavoo, Northlive, FCTV33 et IPTV VIP. Tous les bouquets publiés sont accessibles, avec les catégories françaises prioritaires et une recherche de bouquet.
- Northlive : résolution côté serveur, choix des variantes disponibles et liens de lecture opaques.
- TV : protection de la réserve pendant les téléchargements lents, qualité automatique adaptative, renouvellement des nouveaux fournisseurs, conservation des sessions de redirection et références de segments stables.

## Vérifications et limites

Les tests de cette version se lancent avec `npm run check` puis `npm run test:v200051`. Ils couvrent les filtres et droits de la roulette, le protocole VIP, les 353 bouquets sans troncature, les réponses sans secrets, la protection adaptative et les régressions récentes du lecteur/accueil/relais. La commande historique `npm test` conserve des assertions liées à la version 200.0.21 et n’est pas la suite de validation de cette version.

Les contrôles locaux ont utilisé le vrai serveur Noctra, des médiathèques Jellyfin simulées et les fournisseurs TV réels. Les catalogues Movix VIP (353 bouquets), Vavoo, Northlive et RénéVéo ont été interrogés. L’accès VIP et l’enregistrement ont été validés ; les playlists et segments IPTV et une playlist beIN Sports 1 Northlive ont répondu. Des essais de lecture ont été réalisés sur ordinateur et la présentation a été contrôlée à 390 px. Cela ne constitue pas une validation de chaque chaîne, de toutes les fonctions de votre Jellyfin/Seerr réel, ni d’un appareil iOS physique.

Gardez la qualité **Auto** pour profiter de la protection adaptative. La qualité manuelle reste respectée. Un flux amont défectueux, un bouquet vide ou une restriction de connexions ne peut pas être réparé par le tampon de Noctra. Des interruptions ont été observées pendant les essais IPTV ; le renouvellement peut relancer le direct, sans garantie de zéro microcoupure. Le diagnostic du lecteur indique les erreurs et la réserve sans afficher les clés.
