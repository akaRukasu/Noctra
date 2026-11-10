# Noctra Windows 0.7.0 — bilan

La 0.7 ajoute tout ce qui manquait par rapport à la version web, et quelques fonctions que la PWA n'a pas. Détail fonction par fonction : `AUDIT-PWA-0.7.0.md`.

## Nouveautés

**Regarder ensemble (SyncPlay)**
- Connexion temps réel au serveur Jellyfin (WebSocket, jeton dans l'en-tête, reconnexion automatique).
- Groupes : créer, rejoindre, quitter, voir les participants (page « Regarder ensemble », bouton dans le lecteur, bouton sur les fiches).
- Bandeau « Regarder ensemble » sur l'accueil : créer une séance ou rejoindre une séance ouverte en un clic ; pendant une séance, nom du groupe et participants.
- Un film ou un épisode lancé pendant une séance démarre chez tout le monde au même instant.
- Lecture, pause et déplacements passent par le serveur et s'appliquent chez tous.
- Écart rattrapé seul : légère accélération ou ralentissement, ou saut au-delà de 2,5 s.
- Compatible avec les autres clients Jellyfin (PWA, Android, autre PC).

**Télécommande** : ce PC apparaît dans Jellyfin comme un lecteur pilotable. Lecture, pause, déplacement, volume et messages sont envoyés depuis le téléphone ou la PWA.

**Lecteur**
- Vignettes au survol de la barre de progression (trickplay, Jellyfin 10.9+).
- Sous-titres externes (.srt, .ass) servis à part, jamais incrustés dans l'image.
- Recherche de sous-titres en ligne en 6 langues, téléchargés par le serveur puis activés sans relancer la vidéo.
- Apparence des sous-titres : taille, couleur, contour ou bandeau, position.
- Vitesse, décalage audio et sous-titres, format d'image, chapitres.
- Statistiques de lecture (touche I) : résolution, codec, décodage, débit, mémoire tampon, images perdues, écart SyncPlay.
- Mini-lecteur au premier plan (touche P), déplaçable à la souris.

**Musique**
- Albums, artistes et titres.
- Pochette en grand pendant l'écoute.
- File de lecture (titre suivant / précédent).
- Paroles synchronisées.

**Catalogue**
- Aperçu agrandi au survol des affiches : visuel, note, durée, synopsis, lecture, fiche, favori.
- Filtres par genre, année et note ; nouveaux tris (mieux notés, durée, au hasard…).
- Fiches enrichies :
  - badges 4K, HDR, Dolby Vision, Dolby Atmos, 5.1 / 7.1, codec ;
  - heure de fin, slogan, fiche technique ;
  - bande-annonce, liens IMDb / TMDb ;
  - épisodes non vus sur les séries.
- Pages des personnes (filmographie dans vos médiathèques).
- Listes de lecture : créer, ajouter (clic droit), retirer, tout lire, supprimer.
- Photos : visionneuse avec flèches.

**Hors connexion**
- « Télécharger sur ce PC » sur la fiche d'un film ou d'un épisode.
- Lecture du fichier local, même sans réseau (bouton sur l'écran de connexion).
- Position de reprise reportée au serveur au retour.

**Compte**
- Quick Connect : se connecter avec un code, ou autoriser un autre appareil.
- Changement de mot de passe.

**Administration**
- Extensions, journal d'activité, appareils, dossiers des médiathèques, redémarrage de Jellyfin.
- Stockage de la seedbox.
- Correction de l'identification d'un film ou d'un épisode.

**Interface** : menus sombres arrondis, en-têtes illustrés, portraits ronds cliquables, champ de recherche et lien « Adresse du serveur » corrigés.

## Vérifications

Elles sont faites par l'action **Noctra Windows** sur une machine Windows de GitHub, avec un serveur Noctra/Jellyfin simulé : aucun serveur réel.

**Test principal (inchangé depuis la 0.6)** :
- deux profils, reprise de Teen Wolf ;
- vu / non vu, favoris, recherche ;
- demandes, TV, qualités HLS, multivue, administration.

**Nouveau test des nouveautés** (`--features-only`). Le serveur simulé fournit aussi un WebSocket et un SyncPlay. Le test vérifie :
- la connexion temps réel ;
- l'aperçu au survol, les filtres, la fiche enrichie ;
- le hors connexion : téléchargement, lecture locale, position reportée ;
- SyncPlay : groupe, départ synchronisé, pause et déplacement par le serveur, participants ;
- la télécommande ;
- les vignettes de progression, les statistiques ;
- la recherche et l'ajout de sous-titres ;
- le mini-lecteur ;
- la musique, avec file et paroles ;
- les listes de lecture ;
- Quick Connect dans les deux sens ;
- les extensions et le stockage.

**Résultat** : le run 42744603786 (sources 17d6f0c) est vert de bout en bout. Les tests de protocole, le test principal et les 15 contrôles du test des nouveautés sont tous « OK ».
Pendant la mise au point, le client a été rendu plus robuste :
- nouvel essai automatique sur coupure réseau passagère ;
- sortie audio muette quand aucun périphérique n'est disponible.

## Limites

- **Pas vérifié avec ton serveur réel** :
  - SyncPlay entre deux vrais appareils ;
  - vignettes générées par ton Jellyfin ;
  - extension de sous-titres de ton serveur ;
  - droit de téléchargement de ton compte.

  **Pas vérifié sur ton PC** : GPU, HDR, audio, Chromecast.
- **Dépend du serveur** :
  - vignettes de progression : génération activée dans Jellyfin ;
  - recherche de sous-titres : extension OpenSubtitles (ou équivalent) ;
  - hors connexion : droit « Autoriser le téléchargement » sur le compte ;
  - SyncPlay : droit SyncPlay sur le compte.
- **Toujours absent** :
  - lecture des livres (renvoi vers la PWA) ;
  - réglages rares du serveur : transcodage, réseau, catalogue d'extensions ;
  - épisode suivant automatique, volontairement absent.
- **Instabilité connue** : les machines de GitHub font parfois échouer une étape TV ou du lecteur externe sans lien avec le code. La 0.5.9 d'origine échouait déjà de la même façon ; un nouveau passage la fait réussir.
