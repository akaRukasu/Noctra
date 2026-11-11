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
- Clic ou appui-glissement : la position suit exactement le pointeur. Avant, un léger mouvement juste après le clic pouvait envoyer la lecture à la fin du titre.
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

**Passer le générique** : bouton à part, visible même quand les commandes sont masquées. Comme la PWA : générique, générique de fin, récap et aperçu (segments du serveur Jellyfin, sinon chapitres nommés « Opening », « Introduction », « Ending », « ED »…), du début du segment jusqu'à 1,5 s avant sa fin ; un segment passé ne revient pas.

**Séries**
- **À suivre** (comme la PWA) : après le générique de fin, sinon 30 s avant la fin, une carte présente l'épisode suivant ; il démarre seul au bout de 10 s de lecture. « Lire maintenant » ou « Plus tard » (la lecture s'arrête alors à la fin).
- En fin d'épisode, l'épisode suivant démarre même sans file de lecture (avant : seulement dans une file).
- Boutons **Épisode précédent / suivant** dans le lecteur (touche N : suivant). L'épisode suivant est demandé à Jellyfin sur toute la série : après le dernier épisode d'une saison vient le premier de la suivante.
- Bouton **Épisodes** : au survol, la liste des épisodes de la saison (durée, vu / commencé, épisode en cours surligné), les autres saisons en un clic ; un clic sur un épisode le lance. La liste se referme quand le pointeur s'en va.

**Chapitres**
- Bouton « Chapitres » dans le lecteur : liste avec l'heure de début, chapitre en cours surligné ; Page préc. / Page suiv. pour passer d'un chapitre à l'autre.
- Les chapitres du fichier sont toujours chargés (avant : seulement quand le serveur n'avait pas de segments de générique).
- Fichier sans chapitres : chapitrage tiré des segments détectés (Récap, Générique, Épisode, Générique de fin, Aperçu).

**Fluidité quand le PC est très sollicité**
- L'image est calée sur le son (réglage par défaut de mpv). Avant, elle suivait la fréquence de l'écran, imposée d'après Windows : avec une fréquence dynamique (60 / 90 / 120 Hz), la vidéo pouvait défiler trop vite (× 1,5) et le son saccader.
- Réserve audio portée à 0,5 s.

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
- **Extrait au survol** : l'aperçu d'un titre en cours (« Continuer à regarder ») ou d'un épisode (« À suivre ») joue un extrait, son coupé : depuis la position de reprise, sinon à 20 % de l'épisode (après le récap et le générique). Un clic sur l'extrait lance la lecture.
- **Écrans 120 / 144 / 240 Hz** : WPF anime l'interface à 60 images/s par défaut. La cadence suit maintenant l'écran le plus rapide (jusqu'à 480 Hz, avec une carte graphique) : fondus, survols, défilement et rangées. Les réglages indiquent « animations N images/s ».
- **Défilement et rangées** : la molette et les flèches des rangées font glisser l'image déjà calculée (animation WPF) au lieu de refaire la mise en page à chaque image (jusqu'à 360 cartes dans une rangée infinie).

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

- **Mêmes regroupements que le serveur** : les chaînes sont réunies par les règles du Web et de la PWA de Noctra 200.0.181 (`noctra-tv-unified.js`, porté en C#) :
  - mêmes noms, pays, numéros TNT et ordre ;
  - les déclinaisons BowdTV (Caraïbes, Réunion, AF, différé) passent sous la chaîne principale, comme serveurs manuels ;
  - les éditions distinctes (France 3 Bretagne) gardent leur carte ;
  - comme sur le Web, la vue réunie charge les bouquets français ou sans pays, sauf si un autre pays est choisi.
- **« en français »** : « Eurosport 1 en français », « … in French », « … version française » et « beIN Sports Francais 1 » / « … French 2 » rejoignent la chaîne française (ajout Windows, à reporter côté serveur).
- **BowdTV : délais de la PWA** : la recherche d'un serveur attend 30 s (55 s pour OHA, WiTV, StreamSports99 et BowdTV) au lieu de 10 s, et la suite après la publicité 60 s. À 10 s, BowdTV (compte partagé, flux puis publicité côté serveur) n'avait pas le temps de répondre : seul le lecteur externe restait.
- **BowdTV dans la fiche d'une chaîne** : le direct HLS (après publicité) est en tête de « Lecture native », comme les serveurs des autres sources (avant : en bas, dans « Autres accès »). Le lecteur officiel BowdTV, qui refuse le lecteur intégré, s'ouvre dans le navigateur, comme dans la PWA. Un message du fournisseur (publicité indisponible…) est affiché.
- **BowdTV comme sur la PWA** : quand BowdTV demande une publicité avant le direct, Noctra la lit dans son lecteur (son coupé, « Publicité BowdTV · direct dans N s »), la signale au serveur au démarrage, attend le délai imposé, puis lance le direct HLS renvoyé par le serveur. Avant, seul le lecteur officiel (externe) était proposé. Le lecteur officiel reste disponible en secours.
- **Vérification** : sur six catalogues de 5 000 entrées aux noms variés, le résultat est identique carte par carte à `noctra-tv-unified.js` 200.0.181 exécuté par Node (même règle « en français » ajoutée des deux côtés). Sur l'un d'eux, l'ancien regroupement Windows donnait 521 cartes françaises dont 91 noms en double ; le nouveau en donne 379, sans doublon.
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
  - série : épisode précédent / suivant, chapitres, « À suivre », épisode suivant lancé seul ;
  - BowdTV : publicité dans le lecteur, délai respecté, puis direct HLS ;
  - TV « Toutes les chaînes » avec un grand catalogue (4 000 chaînes, 80 bouquets) : aucun blocage de l'interface de plus d'une seconde pendant le chargement, en France puis pour tous les pays.

Le résultat du dernier passage est indiqué dans le message de livraison.

## Limites

- Pas vérifié avec ton serveur réel ni sur ton PC (GPU, écran, son).
- La fluidité mesurée ici est celle d'une machine virtuelle sans carte graphique. Le gain sur un vrai PC reste à confirmer de ton côté.
- Les commandes flottantes sont de petites fenêtres au-dessus de la vidéo. Si une autre application passe devant Noctra pendant la lecture, elles se masquent et reviennent au retour sur Noctra.
