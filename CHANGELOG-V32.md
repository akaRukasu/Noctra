# Noctra Media Client v32

## Responsive mobile

- conservation de la base mobile v31, sans nouvelle interface parallèle ;
- correction de l'espace supérieur du tiroir sur iPhone afin que « Accueil » ne chevauche plus l'heure ni l'encoche ;
- disparition automatique du dock et du bouton retour Noctra lorsque le tiroir Jellyfin est ouvert ;
- retrait du bouton retour Noctra hors lecteur sur mobile, le retour Jellyfin natif restant prioritaire ;
- séparation nette entre l'en-tête fixe et le premier titre de l'accueil ;
- dimensions des affiches d'accueil affinées pour conserver environ deux affiches et demie visibles ;
- espace inférieur réellement réservé au dock afin qu'il ne masque plus les dernières cartes ;
- suppression de l'index alphabétique vertical sur téléphone, qui réduisait inutilement la largeur de la médiathèque ;
- médiathèques et cartes paysage contraintes à la largeur utile du téléphone ;
- panneaux Noctra protégés par les zones sûres iOS/Android.

## Défilement PC

- remplacement du sélecteur de conteneur v31 par un classement des conteneurs verticaux visibles de la page Jellyfin active ;
- prise en charge des molettes haute résolution qui renvoient de petits deltas et étaient auparavant ignorées ;
- interception placée au niveau de la fenêtre en capture afin de passer avant les gestionnaires internes ;
- inertie courte et temporelle, sans oscillation, avec la même durée à 60, 165 ou 240 Hz ;
- accumulation des crans successifs sans saut brutal ;
- exclusion des tiroirs, dialogues, panneaux Noctra, champs de saisie et lecteur ;
- maintien des gros calques fixes sur le compositeur GPU pour réduire les repeints pendant le déplacement.

## PWA et serveur

- version serveur `32.0.0` ;
- cache PWA `noctra-shell-v32` ;
- ressources Noctra chargées avec le paramètre anti-cache `v=32`.
