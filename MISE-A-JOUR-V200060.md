# Noctra 200.0.60 — Studio

Une refonte des composants partagés de l’interface, conservant l’identité sombre, lavande, bleu et menthe de Noctra. Archive complète basée sur la 200.0.59, non déployée sur votre serveur.

## Direction graphique

- **Accueil** : cadre cinématographique plus compact, fond davantage visible, hiérarchie du texte revue, commandes regroupées et trois aperçus de sélection cliquables sur grand écran. Les petits écrans gardent les flèches pour préserver la place disponible. Cartes et titres de sections harmonisés, espaces verticaux réduits.
- **Dock mobile** : format moins haut (66 px), surface translucide, sélection intégrée dans la même palette, cinq emplacements réguliers et libellés complets. Il s’ancre directement au bas du viewport avec la marge système, au lieu d’utiliser une position verticale calculée à partir de la hauteur visible. Un verrouillage du défilement lors de l’ouverture d’un panneau ne doit plus changer cette référence.
- **Bandeau supérieur** : correction d’une ancienne règle plus prioritaire qui écrasait la marge de l’accueil. L’en-tête ne recouvre plus le début du bloc à la une dans les essais mobiles avec encoche.
- **Bas des pages** : suppression de la réserve supplémentaire du corps de l’accueil ; un seul espace est réservé au dock à la fin du contenu, avec une marge de confort réduite.
- **Médiathèques, recherche et fiches** : contours, profondeur des cartes, lisibilité des informations, boutons, champs natifs et badges harmonisés.
- **Demandes, roulette et TV** : surfaces cohérentes, angles moins systématiquement arrondis en pilules, boutons et icônes unifiés, onglets principaux répartis sur la largeur. Les contrôles et le moteur de lecture restent ceux de la version précédente.
- **Menus et fenêtres** : marges latérales des actions, contraste des surfaces, contours et états de focus harmonisés, y compris les menus contextuels natifs et fenêtres de confirmation.
- **Administration** : styles communs des cartes, tableaux et boutons natifs ; présentation des métriques, onglets et actions Noctra retravaillée. Les onglets d’automatisation défilent sans se comprimer les uns sur les autres. Les statistiques retrouvent une taille lisible.
- **Téléchargements** : réception et émission côte à côte sur téléphone, actions réparties en deux colonnes, recherche débarrassée du double encadrement et icônes corrigées.

Les actions importantes conservent leur distinction, notamment les boutons de danger. Les effets de survol sont limités aux appareils disposant d’une souris et les mouvements respectent la préférence de réduction des animations.

## Périmètre fonctionnel

La seule addition interactive concerne les aperçus du carrousel, qui sélectionnent un titre existant. La reprise et l’ouverture des fiches restent reliées aux cartes natives. Aucun changement de protocole TV, de moteur vidéo, d’API métier, d’autorisation ou de comportement de téléchargement. Aucun nouveau service ni aucune dépendance.

## Vérifications

- `npm run check` : syntaxe serveur et clients.
- `npm run test:v200060` : contrôles de cette version et suite récente de régression, incluant lecture, TV, multiview, navigation, demandes et roulette.
- **160 cas navigateur** : 10 vues × 2 rôles × 8 tailles (320 × 568, 360 × 800, 390 × 844, 430 × 932, 768 × 1024, 1024 × 768, 844 × 390, 1440 × 900).
- Contrôles : débordements de page/panneau, taille des champs, largeur et texte du dock, marges système, défilement des panneaux, accès aux dernières actions, conservation des sections natives, images différées, sélection et actions du bon titre.
- Le dock est également mesuré avant/après ajout de l’état « panneau ouvert » sur l’accueil. Le dégagement du bandeau par rapport à l’en-tête est mesuré.
- Défilement automatique testé avec son délai réel de huit secondes : pause, reprise, suspension pendant un panneau, reprise après fermeture et suppression du contrôleur.

Le banc utilise les fonctions et styles de production, avec des données de démonstration et certains services remplacés. Les vues natives de fiches/recherche/fenêtres sont des échantillons de composants, pas une session Jellyfin complète. Il ne s’agit pas d’un contrôle physique de chaque téléphone ni de chaque état de toutes les pages connectées.

Les rapports sont dans `tests/v200060-browser-results.json` et `tests/v200060-behavior-results.json`. Pour les régénérer, lancer `node tests/v200060-browser-fixture.mjs`, puis ouvrir `/matrix` et `/home?motion=1&behavior=1` à l’adresse locale affichée. Le test Node valide les rapports enregistrés ; il ne lance pas lui-même de navigateur. La commande historique `npm test` conserve son ancien prétest exigeant 200.0.21 ; la suite récente indiquée plus haut est celle de cette livraison.

## Installation

Utiliser l’archive complète avec la procédure habituelle, en conservant la configuration existante :

```sh
noctra-update /chemin/vers/noctra-media-client-v200.0.60.zip
```

La version des ressources et du cache est renouvelée. La feuille `public/noctra-studio.css` porte la nouvelle direction graphique et est chargée après les styles de compatibilité. Les notes et tests des versions précédentes restent présents comme historique.
