# Noctra 200.0.53 — Projection privée

## Installer

Cette archive met à jour l’application Node.js existante sur votre seedbox. Elle n’a pas été déployée sur votre serveur par Codex.

Avec l’outil de mise à jour Noctra déjà installé, transférez le ZIP sur la seedbox puis lancez `noctra-update /chemin/noctra-media-client-v200.0.53.zip`. L’outil conserve le fichier `.env`, les données `runtime` et une sauvegarde de la version précédente. La copie de `runtime` est désormais vérifiée : une erreur interrompt la mise à jour avant le remplacement.

Pour une installation manuelle, sauvegardez l’application, conservez votre `.env` et votre dossier `runtime`, remplacez les fichiers applicatifs par le contenu du ZIP, puis redémarrez votre service Noctra. Node.js 20 ou supérieur reste requis. Rechargez le navigateur avec Ctrl+F5 et vérifiez que client et serveur affichent 200.0.53.

## Activer Movix VIP

1. Connectez-vous à Noctra avec votre compte administrateur Jellyfin.
2. Ouvrez **TV → Accès TV**.
3. Dans **Movix VIP**, collez votre clé puis choisissez **Vérifier et activer**.
4. Revenez à la TV, choisissez **Movix · IPTV VIP**, puis un bouquet et une chaîne. La recherche permet de trouver rapidement « FRANCE TV » ou « SPORTS ».

La clé est vérifiée auprès de Movix avant enregistrement. Elle reste dans `runtime/tv-provider-keys.json`, côté serveur, avec des permissions de fichier restreintes. Elle n’est pas renvoyée au navigateur ni intégrée aux fichiers publics. Le catalogue est accessible aux membres authentifiés de Noctra ; la disponibilité et les connexions simultanées dépendent de votre accès fournisseur. Les clés de test ne sont pas incluses dans cette archive.

Le même écran comporte **Northlive** pour saisir sa clé API. Il valide l’obtention d’une URL de lecture. Pour une configuration par environnement, `MOVIX_ACCESS_KEY` et `NORTHLIVE_API_KEY` sont également reconnus ; une clé enregistrée dans l’écran est prioritaire.

## Une nouvelle identité visuelle

Noir encré, accents cuivre, titres de cinéma à empattements, cartes asymétriques, raccourcis plus légers et contours discrets. La présentation s’applique à l’accueil, au dock, aux en-têtes des sous-menus, aux commandes principales, aux demandes, à la roulette et à la TV. Les commandes et parcours existants sont conservés. Les interactions au survol respectent la préférence de réduction des animations.

## Plein écran mobile

Le bouton Noctra demande directement le plein écran de la vidéo sur iPhone/iPad et sur les navigateurs tactiles compatibles. L’appel reste attaché au geste utilisateur. L’ancien délai de 650 ms qui pouvait ouvrir un agrandissement de la page à la place du lecteur natif est supprimé.

Si la vidéo charge encore, attendez l’apparition de l’image puis appuyez à nouveau. Si la demande est refusée, les commandes natives de la vidéo sont proposées. Noctra ne recharge pas le flux pour passer en plein écran.

Sur iPhone, lorsqu’une chaîne utilise un lecteur web externe, utilisez le bouton plein écran à l’intérieur de ce lecteur : Noctra ne peut pas commander la vidéo d’un autre domaine. L’agrandissement artificiel de la page n’est plus utilisé comme remplacement automatique. Le multiview reste un mode séparé, puisqu’il regroupe plusieurs vidéos.

Cette implémentation suit les APIs [Apple](https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari) et [Fullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen). Le comportement iOS réel reste à confirmer sur votre téléphone : un navigateur de bureau redimensionné ne reproduit pas le lecteur système d’un iPhone.

## Contrôle Movix effectué le 5 septembre 2026

| Fournisseur | Résultat observé |
| --- | --- |
| Movix IPTV VIP | 354 bouquets ; 125 chaînes dans FRANCE TV. TF1 HD FR et France 2 FR : playlists HLS et premiers octets vidéo MPEG-TS reçus en HTTP 200. |
| Movix Vavoo | 17 catégories ; 899 entrées France. 13EME RUE .b : playlist et données MPEG-TS reçues. 13 EME RUE HD .s : certificat fournisseur expiré. |
| Northlive via Movix | 11 catégories ; 125 entrées Sport. beIN Sports 1 FHD : 6 variantes résolues ; playlist et données MPEG-TS reçues. Deux chaînes Auto Moto ont dépassé le délai de réponse. |

Ces essais vérifient le catalogue, la résolution et l’arrivée de données vidéo sur un échantillon. Ils ne constituent pas un contrôle de chaque chaîne ni une preuve de lecture sans coupure sur la durée. Les certificats expirés et les sources muettes doivent être corrigés par les fournisseurs. Aucune désactivation des contrôles TLS n’a été ajoutée.

## Vérifications

`npm run check` et `npm run test:v200053` passent, avec les suites récentes du relais TV, des fournisseurs et de l’interface. Les nouveaux tests vérifient la priorité du lecteur vidéo mobile, l’attente des métadonnées, le refus du plein écran, les lecteurs externes et le maintien du fonctionnement sur ordinateur. Contrôles visuels de l’accueil et de la roulette dans le navigateur, dont un aperçu à 390 px ; aucune validation sur iPhone physique.

Aucune clé VIP ni donnée runtime n’est incluse. Cette archive est à installer ; le serveur de production n’a pas été modifié.
