# Noctra 200.0.73

## Corrections

- Carrousels : recalcul des limites du moteur Jellyfin avant déplacement après chargement/redimensionnement. Une méthode de défilement présente mais non initialisée ne bloque plus le repli. Avancée par cartes entières sans sauter la carte partiellement visible ; débordement découpé sur le cadre fixe, pas sur le rail mobile.
- Sous-menus : suppression des anciennes coordonnées absolues des titres et de la hauteur minimale héritée. Titre centré, fermeture alignée ; sur les écrans intermédiaires le titre passe sous le dock.
- TV : sélecteur fournisseur contenu dans la navigation, libellé au-dessus, actions adaptables. Les corrections de style ont priorité sur les anciennes règles de présentation. Aucune modification du transport, des sources ni des paramètres de lecture dans cette version.
- Accueil : titre et sous-titre agrandis, proportions du bloc revues, commandes et aperçus mieux espacés. Réglages distincts pour mobile et ordinateur, images et actions existantes conservées.
- Médiathèques sur ordinateur : cartes plus grandes, titre et action dans une zone séparée de l'image pour éviter la superposition avec les libellés déjà présents dans les illustrations.
- Roulette : formulaire à sa hauteur utile. Demandes : largeur disponible augmentée.

## Vérifications

`npm run test:v200073` réussi, avec la chaîne de régression lecture TV/Jellyfin, Multiview et interface. Le nouveau test charge le véritable moteur de défilement livré (module 4113), reproduit sa limite périmée après ajout de cartes et vérifie le correctif. Il teste aussi un élément dont la méthode existe avant initialisation.

Inspection de l'accueil installé dans Chrome : déplacement au clic observé, débordement des cartes constaté. Contrôle local avec toutes les feuilles de style de livraison et des DOM représentatifs, images abstraites de test : accueil à 390 et 1440 px, en-tête, sélecteur TV et cartes de médiathèques à 1440 px. Il ne s'agit pas d'un déploiement sur le serveur ni d'une validation sur un iPhone physique. Aucun nouveau test d'endurance TV réalisé pour cette correction graphique.

## Installation

Archive complète. Conserver configuration et données selon la procédure habituelle, redémarrer le client serveur puis recharger la page. Version 200.0.73 ; références des ressources 200.73 et cache r73. Aucun déploiement effectué pendant cette intervention.
