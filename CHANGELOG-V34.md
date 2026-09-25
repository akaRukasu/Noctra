# Noctra Media Client v34

## Mobile

- logo de l’en-tête remplacé par une identité horizontale compacte : symbole Noctra unique et mot-symbole lisible ;
- tiroir Jellyfin totalement déplacé hors écran lorsqu’il est fermé, sans bande résiduelle sur le bord gauche ;
- tiroir visible uniquement après ouverture réelle par le bouton hamburger ;
- dock inférieur redistribué sur une grille régulière, sans défilement horizontal ni sélection surdimensionnée ;
- panneaux Demandes et Téléchargements transformés en pages mobiles cohérentes sous la barre d’état ;
- recherche Demandes empilée sur téléphone et cartes tendances ramenées à une largeur sûre ;
- statistiques de téléchargement alignées sur trois colonnes ;
- noms de torrents limités à deux lignes et actions replacées sous le contenu ;
- fiches films et séries réunifiées sur une seule colonne ;
- titres, métadonnées et actions recentrés dans le hero ;
- sélecteurs vidéo, audio et sous-titres contraints à la largeur de l’écran ;
- contenu secondaire débarrassé du panneau flottant desktop et prolongé jusqu’au dock.

## PC ultralarge

- lissage JavaScript désactivé automatiquement sur les écrans 32:9 ;
- molette entièrement rendue à Chrome et Windows sur le profil ultralarge ;
- conteneurs verticaux forcés en défilement natif et débarrassés des contraintes de rendu susceptibles de bloquer la page ;
- affiches, titres et dock encore légèrement réduits pour les écrans très larges et peu hauts.

## PC classique

- inertie de molette raccourcie afin de répondre plus vite ;
- distance d’anticipation réduite pour éviter l’impression de retard ;
- interpolation toujours synchronisée à `requestAnimationFrame` sur les écrans classiques.

## Technique

- serveur `34.0.0` ;
- cache PWA `noctra-shell-v34` ;
- attribut `data-noctra-panel-kind` ajouté aux panneaux intégrés ;
- détection du tiroir renforcée avec classes, attribut ARIA et masque réellement visible ;
- tests statiques, responsive, grille et lancement `/noctra` mis à jour.
