# Noctra 200.0.64 — espace mobile et continuité

Archive complète basée sur 200.0.63. Installation habituelle avec conservation de la configuration : `noctra-update /chemin/vers/noctra-media-client-v200.0.64.zip`. Aucun déploiement effectué.

## Mobile

Dock toujours flottant, élargi jusqu’à 6 px des côtés, hauteur ramenée de 62 à 56 px. La marge inférieure superflue de 10 px est retirée : le dock respecte la zone des gestes système, ou garde 4 px lorsque celle-ci est absente. Les cinq zones tactiles restent supérieures ou égales à 44 px.

L’espace réservé sous les médias est calculé sur la nouvelle hauteur du dock avec 4 px de séparation. Réduction de 24 px sur les téléphones avec zone système, 20 px sans celle-ci. Même logique dans les panneaux, sans accumulation de marge finale. Le clavier conserve son traitement spécifique.

## Lecture

La capture indique 98,26 Mb/s descendants et 19,14 Mb/s montants. Elle ne mesure ni le débit de chaque fournisseur TV, ni celui entre le serveur Jellyfin et tous les appareils. Ces valeurs ne sont donc pas imposées comme plafond universel.

Jellyfin HLS : marge de sécurité renforcée pour la sélection automatique des variantes, avec montée en qualité plus prudente et tolérance de manque de données bornée. Ce réglage agit uniquement lorsqu’il existe plusieurs qualités adaptatives ; il ne crée pas de transcodage sur une source directe et ne modifie pas le débit négocié avec Jellyfin. Les réserves mémoire et les récupérations de la version précédente restent actives.

TV HLS : certaines sources réservaient jusqu’à 224 Mo avec 90 secondes de contenu déjà lu, y compris sur mobile. Android, les appareils Apple tactiles et les machines annonçant au plus 4 Go de RAM utilisent maintenant 64 Mio, 15 secondes de contenu passé et une réserve avant de 45 secondes avec un maximum de 60 secondes. Ce compromis réduit la pression mémoire ; il ne garantit pas que la source fournit une fenêtre de direct aussi longue. Les autres ordinateurs gardent leurs réserves existantes.

Les chemins natifs Safari/iOS restent sous la gestion du navigateur pour la mémoire et les qualités. Le zoom, la pause volontaire, le choix manuel de qualité et les annulations au changement de chaîne sont préservés.

## Contrôles

`npm run check` et `npm run test:v200064` : syntaxe, configuration effective du lecteur Jellyfin, profils mémoire, budgets de récupération, annulations et suite récente VOD/TV/multivue. Le rapport navigateur `tests/v200064-browser-results.json` couvre 160 cas de mise en page. Régénération par `tests/v200064-browser-fixture.mjs`, puis ouverture de `/matrix` sur l’adresse affichée.

Ces vérifications utilisent les fonctions et styles de production avec des données et réseaux simulés. Aucun essai prolongé sur la connexion personnelle ni certification de tous les appareils physiques. Une source défaillante ou un débit insuffisant peut toujours provoquer des interruptions.
