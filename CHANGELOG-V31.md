# Noctra Media Client v31

## Responsive mobile

- retour à la base responsive de la v27, qui conservait le comportement mobile natif de Jellyfin ;
- suppression des profils téléphone/tablette expérimentaux ajoutés en v28-v30 ;
- aucune translation ni largeur artificielle appliquée à la page lors de l’ouverture du menu ;
- tiroir Jellyfin borné à `84vw`, opaque et défilable indépendamment ;
- carrousels d’accueil horizontaux restaurés avec environ deux affiches et demie visibles ;
- largeur des pages strictement limitée au viewport pour supprimer les bandes et débordements latéraux ;
- fiche média remise en une colonne sans panneau rejeté à droite ;
- dock inférieur conservé, borné au viewport et défilable si toutes les actions ne tiennent pas ;
- zones sûres iPhone/Android conservées.

## Défilement PC

- remplacement du lissage v30 par un moteur ciblant directement le conteneur Jellyfin réellement scrollable ;
- interpolation basée sur le temps écoulé, et non sur un pourcentage fixe par frame ;
- durée identique à 60, 165 ou 240 Hz, avec davantage d’étapes sur les écrans rapides ;
- interception réservée aux molettes sur ordinateur ;
- pavés tactiles, dialogues, menu latéral, lecteur et panneaux Noctra laissés en défilement natif ;
- annulation immédiate lors d’une interaction clavier, d’un clic-glissé ou d’un changement de fenêtre.

## PWA et serveur

- version serveur `31.0.0` ;
- cache PWA renouvelé en `noctra-shell-v31` ;
- ressources CSS, JavaScript et manifeste chargés avec le paramètre anti-cache `v=31`.
