# Noctra 200.0.59 — accueil fonctionnel et écrans mobiles

Archive complète intégrant les corrections de la 200.0.58 et les retours sur les captures mobiles. Cette livraison n’a pas été déployée sur votre serveur.

## Accueil, sur PC comme sur mobile

Le bandeau précédent sélectionnait seulement la première carte de reprise et cherchait son image dans un style directement attaché à la carte. Il ignorait les images imbriquées ou chargées plus tard : cela expliquait le titre identique et le fond vide.

Le bandeau collecte désormais jusqu’à douze titres présents dans les sections natives, sans doublons. Il récupère aussi les images différées, change de titre toutes les huit secondes et propose Précédent / Suivant / Pause. « Reprendre » et « Voir la fiche » déclenchent l’action native du titre actuellement affiché. La reprise est masquée lorsqu’elle n’est pas disponible. Avec un seul titre disponible, les flèches sont désactivées.

Le défilement s’arrête au survol de la souris, pendant l’utilisation au clavier, hors écran, avec un menu ouvert ou dans un onglet masqué. La préférence de réduction des mouvements désactive le défilement automatique ; les flèches restent utilisables.

Les sections natives ne sont plus déplacées pour fabriquer un ordre différent sur mobile. Les anciens marqueurs de masquage sont retirés et les cartes arrivant après l’affichage initial déclenchent une mise à jour. Le bouton Retour est masqué sur l’accueil.

## Mobile et tablette

- Une même hauteur visible pilote le dock et les panneaux. L’ouverture d’un menu ne change plus leur référence de positionnement.
- Cinq emplacements égaux dans le dock mobile, avec le libellé complet « Médiathèques », pouvant passer sur deux lignes sur les plus petits écrans.
- Marges réservées aux encoches et aux zones système ; contenu des panneaux défilable jusqu’en bas.
- Champs de formulaire à 16 px sur les écrans compacts, largeur des champs et listes corrigée, sans interdire le zoom manuel.
- Dock masqué pendant la saisie lorsque le clavier réduit fortement la hauteur visible.
- Menu Plus plus compact, avec ses sept actions administrateur accessibles par défilement.
- Présentations Médiathèques, Demandes et administration allégées sur téléphone. La nouvelle composition de Roulette et le centrage des flèches de la 200.0.58 sont conservés.
- TV : largeur des blocs bornée, fournisseur et commandes d’administration correctement répartis, recherche souple et onglets défilables dans leur propre rangée.

Le dimensionnement utilise la zone visible du navigateur avec un repli sur sa hauteur classique. Le zoom manuel n’entraîne pas de recalcul artificiel des proportions. Références : [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport), [échelle du viewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport/scale) et [zones de sécurité WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).

## Icônes des trois points sur PC

La correction de la 200.0.58 est incluse : les menus natifs ajoutés directement sous `body` sont maintenant détectés et leurs icônes remplacées par des SVG. Le précédent observateur limité à `#reactRoot` pouvait les manquer. Une police d’icônes absente ou mal chargée affichait alors des carrés. Le cache et les versions des ressources sont renouvelés en 200.0.59.

## Vérifications

- Syntaxe serveur et clients : `npm run check`.
- Régressions récentes et nouvelle validation : `npm run test:v200059`.
- 112 cas navigateur : sept vues, deux rôles et huit formats, de 320 × 568 à 1440 × 900, incluant paysage, tablette et marges d’encoche simulées.
- Aucun débordement horizontal général ou du panneau mesuré ; cinq boutons de largeur égale sur téléphone, libellés complets, fermeture sous la zone système, dernière action du menu Plus accessible.
- Accueil testé avec images imbriquées, cartes ajoutées en retard, conservation des trois sections natives, navigation entre les titres et transmission des bonnes actions.
- Défilement testé avec son délai réel de huit secondes : changement automatique, pause, reprise, suspension avec un panneau et destruction du contrôleur.
- Hauteur visible, clavier, zoom manuel et repli pour navigateur sans VisualViewport vérifiés séparément.

Les fichiers `tests/v200059-browser-results.json` et `tests/v200059-behavior-results.json` contiennent les mesures. Pour les régénérer, lancer `node tests/v200059-browser-fixture.mjs`, ouvrir `/matrix`, puis `/home?motion=1&behavior=1` sur l’adresse locale affichée. Le second essai prend environ 34 secondes. Le contrôle Node valide aussi les rapports enregistrés ; il ne lance pas lui-même un navigateur.

Le banc utilise les fonctions et styles de production, avec des données fictives et certains services remplacés. Il ne reproduit pas toute l’application Jellyfin connectée. Les essais ne constituent pas une certification sur chaque téléphone ni un passage sur iPhone, iPad ou Android physique. Le correctif cible des dimensions et capacités de navigateur plutôt qu’une liste de modèles.

## Lecture TV et installation

La suite récente de lecture réussit : reprise réseau bornée, annulation, isolation des fournisseurs, mémoire tampon et multiview. Le moteur et les politiques de lecture restent ceux de la version fournie. Aucun nouvel essai prolongé des chaînes privées n’a été réalisé dans cette révision ; leur disponibilité dépend aussi du fournisseur.

Installer l’archive complète avec la procédure habituelle, en conservant la configuration existante :

```sh
noctra-update /chemin/vers/noctra-media-client-v200.0.59.zip
```

Aucune dépendance ni aucun secret supplémentaire. La commande historique `npm test` conserve son ancien prétest qui exige littéralement 200.0.21 ; utiliser la suite récente indiquée ci-dessus pour cette livraison. Les anciennes notes et tests sont conservés à titre d’historique.
