# Noctra 200.0.58 — accueil vivant et finitions

Cette archive complète est basée sur la version 200.0.57 fournie. Elle n’a pas été déployée sur votre serveur.

## Ce qui change

- **Accueil** : mouvement lent de l’image de fond, lumière animée en surimpression, apparition du contenu et bouton pour mettre le décor en pause. L’animation respecte la préférence système de réduction des mouvements et se suspend quand l’onglet est masqué. Les actions Reprendre et Voir la fiche restent reliées à la carte Jellyfin d’origine.
- **Roulette** : une composition en deux colonnes sur PC, avec une invitation visuelle et un espace de sélection distinct. Les univers, filtres, résultats et états vides ont été harmonisés. Sur tablette la composition passe sur une colonne ; sur téléphone le décor devient une miniature pour laisser de la place aux commandes.
- **Proportions** : champs et onglets moins arrondis, badges plus lisibles, plateformes plus compactes, quota de demandes présenté dans un encadré adapté au contenu.
- **Hauteurs et menus** : en-têtes ajustés au contenu, titre de panneau rétabli dans l’en-tête sur tablette, suppression du double défilement de la page derrière les panneaux mobiles. Le contenu du panneau conserve son propre défilement et l’espace réservé au dock.
- **Flèches et retour** : centrage des SVG dans les boutons, suppression des marges et décalages hérités. Les tracés des deux chevrons sont également centrés dans leur propre cadre.

## Pourquoi les petits carrés sur PC ?

Le menu natif utilise une police d’icônes. Quand son glyphe n’est pas disponible, le navigateur peut afficher un carré. Le client possède déjà un remplacement par SVG, mais son observateur surveillait uniquement `#reactRoot`. Or des menus de bureau sont montés directement sous `body`, à côté de cette zone : leur ajout pouvait échapper à la réparation.

L’observateur couvre maintenant leur parent commun. Il continue de filtrer les espaces Noctra et de ne réparer que les éléments ajoutés, sans rescanner le document à chaque mutation. Les sept actions de la capture ont été reproduites dans un menu ajouté tardivement hors de `#reactRoot`, avec une police volontairement indisponible : les sept SVG apparaissent.

La capture seule ne permet pas de distinguer un fichier de police mal chargé d’un ancien cache ou d’un blocage propre au navigateur. Le correctif retire cette dépendance pour les actions concernées. La version des ressources et du cache a été renouvelée.

## Vérifications

- `npm run check` : syntaxe serveur et clients valide.
- `npm run test:v200058` : suite récente complète réussie (catalogues, lecture, multiview, navigation, roulette, menus, isolation des fournisseurs TV, réserves mémoire, reprises réseau et annulation).
- Banc navigateur utilisant les fonctions de rendu et les feuilles de style de production, avec des données fictives : accueil, roulette, demandes, médiathèques, menu Plus et menu contextuel. Formats 1440 × 1000, 820 × 1180, 390 × 844, 320 × 568 et 844 × 390.
- Aucun débordement horizontal mesuré dans ces 30 cas. Les titres restent contenus dans leur en-tête ; les panneaux n’entraînent plus le défilement de la page sous-jacente. Filtres ouverts et résultats de roulette contrôlés. Transmission des actions natives de l’accueil et absence de doublon du bandeau contrôlées.
- Centrage des boutons Retour / Précédent / Suivant mesuré, y compris le tracé du chevron.
- Animation contrôlée en mouvement normal : progression du décor, arrêt effectif et reprise. Le banc simule cette branche CSS sans changer les préférences du navigateur. Le mode de réduction des mouvements est également contrôlé.

Les mesures du navigateur sont enregistrées dans `tests/v200058-browser-results.json`. Pour reproduire les contrôles : lancer `node tests/v200058-browser-fixture.mjs`, puis ouvrir les chemins `/matrix` et `/motion` sur l’adresse locale affichée. Le banc est indépendant du compte et du serveur de production.

## Lecture TV

Les tests existants de stabilité ont réussi : mémoire tampon, reprises bornées, annulation lors d’une fermeture, changement de qualité, isolation des sources et maintien de la lecture lors du retrait d’une case multiview. Aucun changement de moteur ou de réglage TV n’était justifié par ces essais ; les politiques de lecture de la 200.0.57 sont conservées.

Essai réel dans le navigateur : quatre lectures du flux public Mux / Big Buck Bunny, puis trois après retrait d’une case. Les vidéos ont progressé jusqu’à environ 233 secondes sans remise à zéro des autres écrans. Une seule sortie audio active, puis fermeture avec zéro vidéo et zéro grille résiduelle. La réserve observée était de 50 à 56 secondes ; la qualité automatique observée était 288p. Cet essai ne valide donc pas quatre flux 1080p simultanés, ni la disponibilité des chaînes de vos fournisseurs.

## Installation et limites

Utilisez l’archive complète avec votre procédure habituelle, par exemple :

```sh
noctra-update /chemin/vers/noctra-media-client-v200.0.58.zip
```

Conservez votre configuration existante. Aucun secret, fichier `.env`, dossier runtime ou dépendance supplémentaire n’est ajouté à cette livraison.

La commande historique `npm test` reste bloquée dès son prétest : celui-ci exige littéralement la version 200.0.21. Cette incohérence était déjà présente dans l’archive reçue. Elle n’a pas été contournée en supprimant les anciens tests ; la suite récente ci-dessus a été utilisée et réussit.

Les contrôles visuels portent sur les pages indiquées et leurs rendus de production avec des données de démonstration. Il ne s’agit pas d’un audit exhaustif de toutes les pages d’administration en situation connectée, d’un essai sur iPhone/iPad physique ou d’un test prolongé de vos chaînes réelles. Les actions de téléchargement, les demandes de médias et les données du serveur n’ont pas été modifiées.
