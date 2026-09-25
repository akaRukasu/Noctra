# Noctra 200.0.61 — nouvelles compositions et navigation mobile

Archive complète basée sur la 200.0.60. Cette version recompose plusieurs vues au-delà des finitions de couleur et de bordure. L’identité sombre, lavande, bleu et menthe est conservée. Aucun déploiement sur le serveur n’a été effectué.

## Ce qui change

- **Médiathèques** : colonne de présentation et d’actions sur grand écran, mosaïque de quatre univers ; sur téléphone, cartes en deux colonnes et commandes regroupées au-dessus. La présentation n’est plus une succession de larges bandeaux.
- **Demandes** : recherche intégrée à l’en-tête de la page, quota compact, onglets souples. Le grand encadré décoratif disparaît pour laisser davantage de place au contenu. Sur mobile, le bouton de recherche devient une icône conservant son nom accessible.
- **Plus** : grille de raccourcis avec une icône et une description par destination. Les actions administrateur restent soumises aux mêmes droits et accessibles en faisant défiler la fenêtre.
- **Administration et téléchargements** : en-têtes ouverts, actions réparties en fonction de la largeur et retour à la ligne ; statistiques et contenus davantage mis en avant. Les groupes d’actions TV et les barres de transfert suivent les mêmes règles.
- **Accueil, roulette, fiches et fenêtres** : poursuite de l’harmonisation, image de l’accueil davantage mise en valeur, cadres moins omniprésents, contraste et hiérarchie conservés.

## Téléphone

Les noms sous les boutons du dock sont masqués. Les noms accessibles restent présents pour les lecteurs d’écran. Les cinq zones tactiles ont des largeurs égales et une hauteur d’au moins 44 px.

Le dock forme une barre bord à bord, ancrée en bas de l’écran, avec 60 px de navigation plus la zone système inférieure. Le contenu réserve cet espace une seule fois. Les panneaux occupent la surface disponible ; les marges d’encoche et de gestes sont respectées. Le dock est masqué pendant la saisie quand le clavier réduit la hauteur visible.

Noctra dispose déjà du mode installé `standalone`. Pour l’expérience sans barre d’adresse, utiliser **Installer Noctra / Ajouter à l’écran d’accueil**. Dans un onglet classique, la barre du navigateur reste contrôlée par le navigateur. Cette livraison ne bloque pas le zoom manuel et ne prétend pas transformer le site en application native compilée.

## Fonctionnement et vérifications

Les cartes conservent leurs identifiants et actions, les formulaires leurs champs et gestionnaires. Aucun changement de moteur vidéo, de protocole TV, de droits ou d’API métier. Les modifications JavaScript concernent la structure visuelle des médiathèques et du formulaire de recherche.

- Syntaxe : `npm run check`.
- Régressions : `npm run test:v200061`, comprenant la suite récente de lecture, navigation, roulette, demandes et TV.
- Banc navigateur : **160 cas**, dix vues, deux rôles et huit formats de 320 × 568 à 1440 × 900, incluant paysage, tablette et marges système simulées.
- Mesures : débordements, défilement complet, position du dock, zones tactiles, libellés visuellement masqués et noms accessibles, champs, en-têtes, sections natives et actions de l’accueil.
- Défilement automatique, pause, reprise et suspension du carrousel également vérifiés avec son délai réel de huit secondes.

Les rapports sont dans `tests/v200061-browser-results.json` et `tests/v200061-behavior-results.json`. Pour les régénérer, lancer `node tests/v200061-browser-fixture.mjs`, puis ouvrir `/matrix` et `/home?motion=1&behavior=1` sur l’adresse locale affichée. Le test Node valide les rapports enregistrés et ne lance pas lui-même un navigateur.

Le banc utilise les rendus et styles de production avec des données fictives ; certaines vues natives sont des échantillons de composants. Ce n’est pas une certification de tous les modèles physiques ni un contrôle de chaque état du serveur connecté. La commande historique `npm test` conserve son ancien prétest exigeant 200.0.21 ; la suite récente indiquée ci-dessus est utilisée pour cette livraison.

## Installation

Installer l’archive complète en conservant la configuration existante :

```sh
noctra-update /chemin/vers/noctra-media-client-v200.0.61.zip
```

Les versions des ressources et du cache sont renouvelées. La nouvelle composition est portée par `public/noctra-atlas.css`, chargé après les feuilles précédentes. Aucune dépendance ni aucun secret ajouté.
