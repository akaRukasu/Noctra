# Noctra Windows 0.8.0 — bilan

La 0.8 refait le lecteur et rend l'accueil plus fluide. Elle adapte aussi les médiathèques et Découvrir à toute la largeur de l'écran.

## Lecteur (films, séries, musique, TV)

**Image et commandes**
- L'image occupe toute la fenêtre.
- En haut, le titre :
  - série et épisode ;
  - mode de lecture et qualité ;
  - « Regarder ensemble » et « Diffuser ».
- En bas, les commandes, en surimpression sur un dégradé.
- Tout s'efface après trois secondes sans mouvement et revient au moindre mouvement de la souris. En pause, les commandes restent affichées.
- Musique et messages d'ouverture : les commandes restent posées dans le lecteur.

**Barre de progression**
- Partie déjà chargée (mémoire tampon).
- Repères de chapitres.
- Vignettes au survol.
- Heure de fin (« Fin à 22:41 »).

**Gestes**
- Clic sur l'image : pause.
- Double-clic : plein écran.
- Molette : volume.

**Raccourcis**
- ↑ ↓ volume, M son.
- F plein écran.
- C sous-titres, A audio.
- S passer le générique.
- 0 à 9 : se placer de 0 à 90 %.
- J / L ±15 s.

**Messages sur l'image** : volume, piste choisie, vitesse, décalage, serveur TV.

**Panneau « Audio et sous-titres »**
- Les deux listes côte à côte : langue, codec, 5.1 / stéréo, « forcés », « externe ».
- La recherche de sous-titres en ligne, dont les résultats s'affichent dans le panneau.

**Panneau « Réglages »**
- Vitesse et format de l'image.
- Décalages des sous-titres et de l'audio (au dixième de seconde).
- Chapitres.
- Statistiques et mini-lecteur.

**Passer le générique** : bouton à part, visible même quand les commandes sont masquées.

**TV**
- Pastille rouge « EN DIRECT ».
- Serveur en cours (« Serveur 2 sur 4 ») et bouton « Serveur suivant » pour changer de flux sans quitter la lecture.
- Choix de la qualité inchangé.

## Accueil plus fluide

- **Effets de flou retirés** : ils étaient recalculés à chaque image, d'où les ralentissements au défilement. Le fond d'ambiance et le halo du grand visuel sont désormais de petites images floutées une fois pour toutes.
- **Grand visuel** : mis en cache par la carte graphique, sans zoom continu.
- **Images** :
  - cache sur le disque (300 Mo au plus, dans le dossier local de Noctra) ;
  - cache mémoire plus large ;
  - décodage à la taille réellement affichée.
- **Affichage progressif** :
  - l'accueil apparaît dès que « Continuer à regarder » est prêt ;
  - chaque rangée de médiathèque se remplit à son arrivée.
- Les menus du clic droit sont préparés seulement quand on les ouvre.

## Rangées infinies et SyncPlay discret

**Rangées de l'accueil infinies**
- En approchant de la fin d'une rangée « Ajouts récents », la suite de la médiathèque se charge seule.
- Une fois tout chargé, la rangée repart du début, sans fin.
- La flèche « précédent » au début d'une rangée mène à sa fin.
- Le grand visuel tournait déjà en boucle.

**SyncPlay discret**
- Le grand bandeau « Regarder ensemble » de l'accueil est remplacé par une icône dans le bandeau du haut, comme dans Jellyfin et la PWA.
- Au clic, un menu :
  - créer une séance ;
  - rejoindre une séance ouverte ;
  - ou, pendant une séance, son nom et ses participants, « Ouvrir le groupe » et « Quitter la séance ».
- Un point d'accent sur l'icône signale qu'une séance est en cours.

**Supprimer et fermer les séances**
- Chaque séance ouverte a un bouton « Supprimer », dans la page « Regarder ensemble » et dans le menu de l'icône.
- Jellyfin n'a pas de commande de suppression : une séance disparaît quand plus personne n'y est. Noctra la rejoint donc sans rien lire, puis la quitte aussitôt.
  - Séance oubliée (personne d'autre dedans) : elle est supprimée.
  - Séance où d'autres personnes sont encore : Noctra demande confirmation et prévient qu'elle restera ouverte pour eux.
- Fermeture automatique quand il n'y a plus de lecture et plus d'autre participant :
  - une minute après le départ du dernier participant ;
  - dix minutes si personne n'a rejoint la séance (le temps d'inviter ses proches).

## Médiathèques et Découvrir

- **Vos médiathèques** : les tuiles se partagent la hauteur de la fenêtre. Plus de grand vide sous la grille, et un visuel plus grand.
- **Grilles d'affiches sur toute la largeur** (colonnes égales, affiches proportionnelles) :
  - médiathèques ;
  - musique ;
  - listes ;
  - personnes ;
  - Découvrir.
- **Découvrir** :
  - champ « Rechercher un film ou une série à ajouter » en tête de page ;
  - depuis Découvrir, la recherche du bandeau cherche aussi dans les titres à demander.

## Vérifications

L'action **Noctra Windows** les fait sur une machine Windows de GitHub, avec un serveur Noctra/Jellyfin simulé. Aucun serveur réel n'est utilisé.

- **Test principal** :
  - reprise sur deux profils ;
  - passer le générique ;
  - pause ;
  - flux adapté ;
  - TV en fenêtre et plein écran, commandes qui s'effacent ;
  - qualités HLS ;
  - multivue ;
  - administration.
- **Test des nouveautés** :
  - commandes et panneaux du nouveau lecteur ;
  - SyncPlay ;
  - télécommande ;
  - sous-titres en ligne ;
  - mini-lecteur ;
  - musique ;
  - page « Vos médiathèques » ;
  - grille d'affiches ;
  - recherche dans Découvrir ;
  - rangée infinie de l'accueil (fenêtre étroite, boucle) ;
  - menu SyncPlay du bandeau ;
  - suppression d'une séance oubliée, fermeture automatique d'une séance vide.

Le résultat du dernier passage est indiqué dans le message de livraison.

## Limites

- Pas vérifié avec ton serveur réel ni sur ton PC (GPU, écran, son).
- La fluidité mesurée ici est celle d'une machine virtuelle sans carte graphique. Le gain sur un vrai PC reste à confirmer de ton côté.
- Les commandes flottantes sont de petites fenêtres au-dessus de la vidéo. Si une autre application passe devant Noctra pendant la lecture, elles se masquent et reviennent au retour sur Noctra.
