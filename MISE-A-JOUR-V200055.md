# Noctra 200.0.55 — Les contenus au premier plan

## Installer

Cette archive met à jour l’application Node.js existante sur votre seedbox. Elle n’a pas été déployée sur votre serveur par Codex.

Avec l’outil de mise à jour Noctra déjà installé, transférez le ZIP sur la seedbox puis lancez `noctra-update /chemin/noctra-media-client-v200.0.55.zip`. L’outil conserve le fichier `.env`, les données `runtime` et une sauvegarde de la version précédente. La copie de `runtime` est désormais vérifiée : une erreur interrompt la mise à jour avant le remplacement.

Pour une installation manuelle, sauvegardez l’application, conservez votre `.env` et votre dossier `runtime`, remplacez les fichiers applicatifs par le contenu du ZIP, puis redémarrez votre service Noctra. Node.js 20 ou supérieur reste requis. Rechargez le navigateur avec Ctrl+F5 et vérifiez que client et serveur affichent 200.0.55.

## Activer Movix VIP

1. Connectez-vous à Noctra avec votre compte administrateur Jellyfin.
2. Ouvrez **TV → Accès TV**.
3. Dans **Movix VIP**, collez votre clé puis choisissez **Vérifier et activer**.
4. Revenez à la TV, choisissez **Movix · IPTV VIP**, puis un bouquet et une chaîne. La recherche permet de trouver rapidement « FRANCE TV » ou « SPORTS ».

La clé est vérifiée auprès de Movix avant enregistrement. Elle reste dans `runtime/tv-provider-keys.json`, côté serveur, avec des permissions de fichier restreintes. Elle n’est pas renvoyée au navigateur ni intégrée aux fichiers publics. Le catalogue est accessible aux membres authentifiés de Noctra ; la disponibilité et les connexions simultanées dépendent de votre accès fournisseur. Les clés de test ne sont pas incluses dans cette archive.

Le même écran comporte **Northlive** pour saisir sa clé API. Il valide l’obtention d’une URL de lecture. Pour une configuration par environnement, `MOVIX_ACCESS_KEY` et `NORTHLIVE_API_KEY` sont également reconnus ; une clé enregistrée dans l’écran est prioritaire.

## Accueil

Le bloc de présentation ajouté dans les versions précédentes est supprimé. L’accueil commence directement par les rangées Jellyfin, avec la reprise de lecture en tête lorsqu’elle contient des titres. Aucun bouton de navigation supplémentaire n’est ajouté.

Titres de sections simplifiés, affiches aux contours discrets, libellés alignés, progression de lecture fine et flèches compactes. Les visuels proviennent toujours de votre bibliothèque. Les commandes de lecture et menus contextuels Jellyfin restent en place. Le dock utilisateur corrigé dans la version précédente est conservé.

## Défilement

- Le carrousel utilise sa position visuelle réelle, même lorsque le moteur Jellyfin conserve une ancienne position interne. L’inversion du sens repart de l’endroit visible, sans continuer vers une cible dépassée.
- Transition des flèches de 440 ms, avec maintien de la cible lors de clics répétés dans le même sens.
- La molette verticale utilise une inertie amortie qui conserve la vitesse entre les impulsions. Le calcul donne le même déplacement à 60 et 120 Hz et ne dépasse pas la cible.
- Un seul traitement consomme le mouvement vertical. Le lissage CSS concurrent est désactivé uniquement pendant ce mouvement, puis restauré. Les champs, menus et lecteurs ne sont pas capturés.
- Les barres horizontales des carrousels sont masquées ; le défilement tactile reste disponible.

Si la réduction des animations est activée dans votre système ou navigateur, Noctra respecte cette préférence et conserve le déplacement immédiat. Pour obtenir le lissage, les animations doivent être autorisées. Le navigateur de test indiquait cette préférence comme active ; un scénario local dédié a permis de vérifier le mode animé sans modifier le réglage du système.

## Vérifications

`npm run check` et `npm run test:v200055` passent. Nouveaux contrôles : suppression du bloc d’accueil, position réelle du carrousel, inertie à 60/120 Hz, inversion de direction, absence de dépassement.

Dans le navigateur, les tests sur une page reproduisant les rangées Jellyfin ont confirmé le déplacement animé des cartes et une succession de positions verticales dans les deux sens. Contrôle visuel sur ordinateur et à 390 px. Les médias de cette page sont simulés ; les essais ne constituent pas une validation exhaustive de votre bibliothèque réelle ni d’un téléphone physique.

Cette archive conserve les corrections TV précédentes. Aucun nouveau contrôle des fournisseurs n’a été effectué pour cette modification. Elle ne contient aucune clé privée et n’a pas été déployée sur votre serveur.
