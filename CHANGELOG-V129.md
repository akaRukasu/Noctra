# Noctra v129

## Interface globale

- Harmonisation premium de Jellyfin, Médiathèques, Demandes, Discovery, Téléchargements, Automatisation et TV.
- Rayons de 10 px pour les contrôles, 12 px pour les surfaces et 14 px pour les cartes de médiathèque.
- Accents violet, sarcelle, bleu et ambre répartis par espace pour conserver une interface lisible et colorée.
- Suppression des contours permanents des boutons, avec conservation du focus clavier accessible.
- Correction de l'en-tête des panneaux sur ordinateur et de la largeur des cartes de médiathèque aux formats intermédiaires.
- Grille des métriques Sonarr/Radarr équilibrée en cinq colonnes sur ordinateur.

## Téléchargements

- Icône mégaphone dédiée à l'action « Réannoncer ».
- Icône bouclier avec validation dédiée à l'action « Revérifier ».
- Couleurs et libellés accessibles distincts pour éviter toute ambiguïté.

## Automatisation

- Ordre des services modifié en Radarr / Sonarr / Prowlarr.
- Radarr devient la vue ouverte par défaut du centre d'automatisation.

## Fluidité et iOS

- Conservation des animations et du défilement temporels pilotés par `requestAnimationFrame`, sans plafond à 120 Hz et compatibles avec 165, 240 Hz ou davantage.
- Aucun effet animé lourd ajouté par la couche visuelle V129.
- Message PiP corrigé dans la PWA iOS : l'application installée est autonome et iOS y bloque actuellement le PiP.

Version : `129.0.0`
Cache PWA : `noctra-shell-v129`
