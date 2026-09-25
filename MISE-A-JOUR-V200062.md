# Noctra 200.0.62 — refonte générale et en-tête de lecture

Archive complète incluant toutes les évolutions 200.0.61 détaillées dans `MISE-A-JOUR-V200061.md` : nouvelles compositions des médiathèques, demandes, raccourcis Plus, administration et téléchargements ; harmonisation de l’accueil, de la roulette et des fiches ; dock mobile sans libellés, cinq boutons égaux et ancrage en bas de l’écran.

## Dernière correction du lecteur

Le bouton Retour disposait de règles contradictoires : l’ancien bouton Noctra pouvait se superposer à celui du lecteur, tandis que certaines règles de mise en page attendaient un état de lecture différent. La nouvelle feuille traite l’en-tête dès l’ouverture du lecteur.

- Retour centré dans une cible de 44 px, éloigné du bord ; un seul retour visible.
- Titre aligné, espacement réservé même lorsque le lecteur utilise le retour Noctra de secours.
- Actions à droite de taille cohérente ; titre tronqué proprement sur petit écran.
- Dégradé discret, sans trait de séparation ni réduction de la surface vidéo.
- Respect des zones système et de la disparition des commandes natives.

Cette correction porte uniquement sur les styles de lecture. Les moteurs vidéo, les flux, les commandes et leurs actions restent inchangés.

## Vérifications

`npm run check` et `npm run test:v200062` passent. La suite couvre les régressions récentes de navigation, lecture VOD/TV et multivue. Les 160 cas navigateur et le cycle réel du carrousel validés en 200.0.61 sont conservés. Pour 200.0.62, 32 cas supplémentaires couvrent huit formats de 320 × 568 à 1913 × 1076, avec/sans retour natif et avec/sans état de média actif : absence de chevauchement, bouton unique, centrage, cible tactile, zones système, plein écran vidéo et masquage de l’en-tête.

Rapport : `tests/v200062-player-results.json`. Pour le régénérer : lancer `node tests/v200062-player-fixture.mjs` et ouvrir l’adresse `/matrix` indiquée. Le test Node vérifie les mesures enregistrées ; il ne lance pas de navigateur. Le banc reprend la structure de l’en-tête natif et les feuilles de production sur des données fictives. Ces contrôles ne remplacent pas des essais sur chaque téléphone physique ou une lecture prolongée de chaque fournisseur TV.

## Installation

Installer cette archive complète avec la procédure habituelle en conservant la configuration existante :

```sh
noctra-update /chemin/vers/noctra-media-client-v200.0.62.zip
```

Les versions du cache et des ressources sont renouvelées. Aucun déploiement effectué. Pour occuper l’écran sans la barre du navigateur sur téléphone, utiliser Installer Noctra / Ajouter à l’écran d’accueil ; les barres du navigateur restent sous son contrôle dans un onglet classique. Le zoom manuel reste accessible.
