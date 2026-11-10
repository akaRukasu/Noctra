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

## Multivue (comme la PWA)

- **Jusqu'à 16 chaînes**, directs et **lecteurs web externes** mélangés. Bouton « Multivue + » sur les lecteurs web d'une chaîne et dans le lecteur TV (chaîne en cours).
- **Grille adaptée** : 2, 3 ou 4 colonnes selon le nombre de chaînes.
- **Mettre en avant** : grande case à gauche, les autres en colonne. Bouton étoile ou double-clic sur l'image ; la chaîne mise en avant prend le son.
- **Par case** :
  - plein écran de la chaîne (Échap pour revenir) ;
  - son (une seule sortie audio) et volume ;
  - réessayer, avec un nouvel essai automatique après une coupure ;
  - retirer ;
  - état (connexion, en direct, image reçue) et qualité réelle.
- **Qualité commune** : « Auto stable » (720p jusqu'à 4 chaînes, 540p jusqu'à 9, 480p au-delà ; la chaîne en avant ou en plein écran garde la meilleure), sans limite, ou plafond 1080p / 720p / 480p / 360p.
- **Plein écran épuré** : uniquement les images, cases bord à bord, sans en-tête ni bandeaux. L'en-tête réapparaît par-dessus quand le pointeur touche le haut de l'écran ; Échap pour revenir.
- **Clic sur une image** : cette chaîne prend le son (message sur l'image) ; double-clic : mettre en avant.
- Menu de qualité au thème sombre de Noctra.
- **Ajout à chaud** : une chaîne ajoutée pendant que la multivue est ouverte y entre tout de suite.
- Les lecteurs web gardent les protections du lecteur externe : publicités bloquées, navigation limitée, ni fenêtre ni téléchargement.

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
- **Séance fantôme corrigée** : si Noctra était fermé sans quitter sa séance, Jellyfin gardait ce PC comme participant (même identifiant d'appareil au lancement suivant). La séance restait alors ouverte avec « 1 participant ». Désormais, à chaque connexion, Noctra quitte côté serveur toute séance qu'il n'affiche pas, et elle disparaît.
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

## TV : « Toutes les chaînes »

- Par défaut, uniquement les chaînes françaises. Le menu « Pays » permet d'en choisir un autre (ou « Tous les pays »).
- Plus de grille « Choisir un bouquet » avec les bouquets de tous les pays dans cette vue, comme dans la PWA. Les bouquets sont ouverts et leurs chaînes rejoignent la liste, filtrée par pays.
- Une chaîne de bouquet sans pays indiqué prend celui de son bouquet (« France · … » → France).
- La grille des bouquets reste dans la page d'une source (Movix, Northlive…).
- **Ralentissements corrigés** :
  - la liste réunie est calculée en arrière-plan, au plus une fois toutes les 1,2 s pendant le chargement (avant : sur l'interface, à chaque catalogue ou bouquet reçu) ;
  - les cartes ne sont refaites que si la page affichée change ;
  - la recherche s'applique 250 ms après la dernière frappe ;
  - le cache des noms de chaînes garde jusqu'à 150 000 entrées : avec un gros catalogue, il se vidait sans cesse et tout était recalculé.
- Un bouquet qui ne répond pas est redemandé une fois, comme dans la PWA. Un serveur TV dont la connexion est perdue avant toute réponse est réinterrogé une fois.

## Vérifications

L'action **Noctra Windows** les fait sur une machine Windows de GitHub, avec un serveur Noctra/Jellyfin simulé. Aucun serveur réel n'est utilisé.

- **Test principal** :
  - reprise sur deux profils ;
  - passer le générique ;
  - pause ;
  - flux adapté ;
  - TV en fenêtre et plein écran, commandes qui s'effacent ;
  - qualités HLS ;
  - « Toutes les chaînes » sans grille de bouquets, chaînes des bouquets français incluses ;
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
  - suppression d'une séance oubliée, fermeture automatique d'une séance vide ;
  - TV « Toutes les chaînes » avec un grand catalogue (4 000 chaînes, 80 bouquets) : aucun blocage de l'interface de plus d'une seconde pendant le chargement, en France puis pour tous les pays.

Le résultat du dernier passage est indiqué dans le message de livraison.

## Limites

- Pas vérifié avec ton serveur réel ni sur ton PC (GPU, écran, son).
- La fluidité mesurée ici est celle d'une machine virtuelle sans carte graphique. Le gain sur un vrai PC reste à confirmer de ton côté.
- Les commandes flottantes sont de petites fenêtres au-dessus de la vidéo. Si une autre application passe devant Noctra pendant la lecture, elles se masquent et reviennent au retour sur Noctra.
