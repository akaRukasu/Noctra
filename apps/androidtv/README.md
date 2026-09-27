# Noctra TV (Android TV, Google TV, Fire TV)

Noctra TV est l’appli **Jellyfin pour Android TV** (projet officiel [jellyfin-androidtv](https://github.com/jellyfin/jellyfin-androidtv), version 0.19.10), adaptée pour Noctra :

- **Serveur intégré.** Au démarrage, l’appli se connecte seule à `https://akarukasu.merlion.usbx.me/jellyfin` et ouvre directement la page d’authentification. Il n’y a plus d’adresse à saisir à la télécommande.
- **Marque Noctra.** Nom, icône, bannière du lanceur Android TV et logo sont ceux de Noctra.
- **Identifiant `com.noctra.tv`.** L’appli s’installe à côté de l’appli Jellyfin officielle, sans conflit.

- **Accueil Noctra.** Une fois connecté, l’appli s’ouvre sur l’accueil Noctra, avec un menu en haut de l’écran :
  - **Accueil** : comme sur PC, « À l’affiche chez vous » et le carrousel « Continuer à regarder ». Il passe au titre suivant toutes les 8 secondes et offre deux boutons : « Reprendre » lance la lecture, « Voir la fiche » ouvre la fiche. L’image et le logo sont téléchargés et décodés ensemble, puis affichés en même temps que le texte (le titre suivant est préparé à l’avance). L’image est demandée à la définition de l’écran (jusqu’à 1920 px), nette à droite et fondue vers le texte sur un fond flouté de ses couleurs ; une affiche verticale est montrée entière plutôt que recadrée, et le logo du titre remplace son nom quand Jellyfin en a un. Viennent ensuite les derniers ajouts, puis « À suivre » et les médiathèques en 2 × 2 en bas ;
  - **Fiches films et séries** (sans écran Jellyfin) : image de fond, affiche, infos, Lecture / Reprendre / Depuis le début, Vu, Favori, casting et titres similaires. Une série affiche aussi ses saisons et ses épisodes, et l’épisode suivant est proposé à la fin d’un épisode ;
  - **Lecture** : le lecteur de Jellyfin, ouvert directement (sans ses écrans) : langue audio, sous-titres, qualité et chapitres se changent pendant la lecture. Quand il se ferme (Retour, fin du film, écran « À suivre »), on revient sur l’accueil ou la fiche Noctra, mise à jour. « Lire sur… » depuis un téléphone ou un PC ouvre aussi ce lecteur. En groupe SyncPlay, la lecture passe par le lecteur Noctra (flux HLS de Jellyfin), piloté par le groupe ;
  - **SyncPlay** (regarder ensemble, absent de l’appli Jellyfin pour Android TV) : Compte › SyncPlay pour créer un groupe ou rejoindre celui lancé depuis le PC ou un téléphone. Une lecture lancée depuis la TV démarre pour tout le groupe. Les ordres du groupe (lecture, pause, avance) sont appliqués au moment fixé par le serveur, en tenant compte de l’écart d’horloge. Sur la TV, OK et ◀ ▶ deviennent des demandes au groupe. Quitter le lecteur quitte le groupe. « Lire sur Noctra TV » et la pause à distance passent aussi par cette connexion ;
  - **Médiathèques** : les 4 médiathèques Noctra en 2 × 2, puis les autres. Chaque médiathèque s’ouvre en grille d’affiches, avec des tris (ajouts récents, titre, note, année, aléatoire) et un filtre « Non vus » ;
  - **TV en direct** : les sources et les chaînes du serveur Noctra.
    - Au lancement d’une chaîne, une fenêtre propose ses serveurs, classés dans cet ordre : le dernier serveur qui a fonctionné (mémorisé), puis le lecteur natif, les serveurs automatiques et les lecteurs web. Le premier démarre seul après 5 secondes, sauf si une touche est pressée.
    - Les flux directs passent par le lecteur natif (ExoPlayer). Il utilise un tampon élargi, retente les segments et revient au direct quand le flux prend trop de retard. Il relance aussi un flux bloqué et se reconnecte de plus en plus espacé (1, 2, 4, 8 s…). Après une coupure, l’appli redemande un lien neuf au serveur.
    - Les lecteurs web (sports…) sont des pages externes. Ils s’ouvrent dans un écran séparé, dans son propre processus : si la page ou le moteur web plante, seul ce lecteur se ferme et l’accueil propose un autre serveur. Les flèches déplacent un curseur et OK envoie un vrai appui, pour lancer la lecture ou passer en plein écran. Pour se comporter comme sur PC, le lecteur se présente comme un navigateur de bureau et son cadre est réglé comme sur PC : bac à sable et référent propres à chaque fournisseur (aucun référent pour les embeds officiels LiveWatch, qui sont ouverts directement comme sur PC pour Sports, Football Live, BossTV, JackTV et Matchs du jour). La navigation sécurisée de la WebView, qui bloquait ces sites, est désactivée pour ce lecteur. Une page ouverte par le lecteur (souvent l’étape publicitaire qui débloque la chaîne) s’affiche comme un nouvel onglet, le lecteur passant en arrière-plan comme sur PC, puis on revient seul au lecteur après 8 secondes (ou avec Retour). Si le moteur web s’arrête, un second essai allégé (page seule, régies publicitaires bloquées) est lancé. Un journal (réponses du serveur, erreurs de la page, arrêt du moteur web…) est affiché dans la fenêtre des serveurs en cas d’échec. Une page qui refuse d’être intégrée s’ouvre en entier, automatiquement ; « OK maintenu » force aussi ce mode. Une erreur du serveur du lecteur (403, 404, injoignable…) s’affiche à l’écran puis dans la fenêtre des serveurs. Quand le serveur trouve le flux vidéo, ou dès que la page du lecteur (ou l’un de ses cadres) demande une liste de lecture HLS (`.m3u8`), le lecteur natif prend le relais avec les en-têtes de la page (Referer, Origin, cookies, identité) : la vidéo ne dépend plus du moteur web du téléviseur. S’il échoue, le lecteur web est reproposé, cette fois sans ce relais.
    - Les sources présentées en bouquets (Northlive, Movix…) affichent leurs bouquets, puis les chaînes du bouquet choisi.
    - **Guide des programmes** : chaque chaîne affiche son programme en cours (heure et barre d’avancement). Le bouton « Guide des programmes » d’une source passe en liste façon guide TV : chaîne, programme en cours (horaires, avancement) et suivant ; ce choix est mémorisé. Le guide vient du catalogue du serveur Noctra (XMLTV) ou, à défaut, est demandé chaîne par chaîne (`/api/tv/programme`). La fenêtre des serveurs l’affiche aussi.
    - **Zapping** : pendant la lecture d’une chaîne, ▲ ▼ (ou CH+ / CH−) passent à la chaîne précédente ou suivante de la liste affichée, sans quitter le lecteur ; plusieurs appuis rapprochés sautent plusieurs chaînes. Le bandeau montre la chaîne, sa position dans la liste, le programme en cours et le suivant ; OK ou Info le réaffichent. Une chaîne sans flux direct ouvre le lecteur web.
    - **Panneau des chaînes** : le bouton « ☰ Chaînes » de la barre de commandes du lecteur (OK pour l’afficher), ou ◀, Menu ou Guide, ouvre sur le côté la liste des chaînes de la source avec leur programme en cours et son avancement. La lecture continue derrière ; OK sur une chaîne la lance, Retour ou ◀ referme le panneau.
    - En cas d’échec, la fenêtre des serveurs réapparaît avec le serveur en échec marqué, puis le suivant démarre après 4 secondes.
    - **Multiview** : le bouton Multiview d’une source permet de choisir jusqu’à 12 chaînes. Chaque OK ouvre une fenêtre (lancer, ajouter une chaîne, vider), sans devoir faire défiler toute la liste. Chaque vignette a son propre lecteur natif ; sa définition est limitée à sa taille et, au-delà des décodeurs du téléviseur, un décodeur de secours prend le relais. Grille 2 × 2, 3 × 2, 3 × 3 puis 4 × 3. OK sur une vignette ouvre son menu : écouter cette chaîne (le son reste dessus), la mettre en avant (grande vignette et les autres sur le côté), plein écran, changer de serveur, **retirer la chaîne** ou **ajouter une chaîne** (par groupe, parmi les sources ouvertes dans l’accueil). Un flux qui tombe passe seul au serveur suivant. Seuls les flux directs peuvent partager l’écran.
  - **Découvrir** et **Demandes** (Jellyseerr) : suggestions, recherche, demande en un clic et suivi de « Mes demandes » ;
  - **Roulette** : réglages (médiathèque, genre, de 1 à 10 titres, note, titres déjà vus), rouleau d’affiches qui ralentit sur le titre tiré, puis révélation avec l’image de fond ;
  - **Rechercher** (loupe) : recherche dans les médiathèques ;
  - **Compte** (en haut à droite) : paramètres de l’appli. On y change de compte ou on se déconnecte dans Paramètres › Authentification.

L’interface Jellyfin est native, ce qui la rend fluide sur les boîtiers et les vidéoprojecteurs. La lecture passe par le lecteur vidéo d’Android (ExoPlayer) : MKV, HEVC, AC3/DTS et sous-titres sont lus directement quand l’appareil les prend en charge, sinon Jellyfin transcode. Pour les chaînes, les décodeurs audio FFmpeg inclus dans l’appli (AC3, E-AC3, DTS…) prennent le relais quand le téléviseur n’en a pas.

Les téléchargements et l’administration de Noctra ne sont pas proposés sur la TV. Ils restent disponibles sur téléphone, sur PC et dans le navigateur.

### Fonctionnement de l’accueil Noctra

- `web/` contient l’interface de l’accueil (HTML, CSS et JavaScript ES2017 sans dépendance, pensés pour la télécommande). Pour la fluidité, la navigation cherche d’abord les voisins directs. Elle fait au plus un déplacement par image affichée, défile instantanément quand une touche reste enfoncée et ajoute les longues listes par petits paquets. L’appli l’embarque et la sert elle-même à l’adresse `https://akarukasu.merlion.usbx.me/noctra/tv-app/`. Elle partage donc l’origine de l’API Noctra et de Jellyfin, et rien n’est à installer sur le serveur.
- `java/com/noctra/tv/` contient les écrans ajoutés à l’appli :
  - `NoctraHomeActivity` : WebView de l’accueil, avec un canal `MessagePort` réservé à la page principale (les lecteurs web des chaînes n’y ont pas accès) ;
  - `NoctraStream` : lecture d’une chaîne avec ExoPlayer, avec tampon, reprises et reconnexions ;
  - `NoctraPlayerActivity` : lecteur plein écran des chaînes ;
  - `NoctraMultiviewActivity` : jusqu’à 12 chaînes à l’écran, ajout et retrait depuis le multiview ;
  - `NoctraPlayback` : ouvre le lecteur Jellyfin sans ses écrans et revient à Noctra à sa fermeture ;
  - `NoctraWebPlayerActivity` (processus `:webplayer`) : lecteurs web des chaînes ;
  - `NoctraPlaybackReport` : suivi de lecture envoyé à Jellyfin ;
  - `NoctraRemote` : commandes « Lire sur… » et « Afficher » reçues d’un autre appareil ;
  - `NoctraPlayerBus` : liaison entre la page (SyncPlay, commandes à distance) et le lecteur ;
  - `NoctraProcess` : saute l’initialisation de Jellyfin dans le processus du lecteur web ;
  - `NoctraRouting` : choix de l’écran ouvert après la connexion ;
  - `NoctraSession` : lecture de la session Jellyfin (le jeton sert aussi à l’API Noctra).
- `stubs/` contient les signatures Media3 nécessaires à la compilation. Elles ne sont jamais incluses dans l’APK : l’appli utilise les classes Media3 déjà présentes dans Jellyfin.

## Construire

```bash
node apps/scripts/build-androidtv.mjs            # télécharge l’APK officiel v0.19.10 depuis GitHub
node apps/scripts/build-androidtv.mjs chemin/jellyfin-androidtv-v0.19.10-release.apk
```

Le script produit `dist/apps/Noctra-androidtv.apk`. Il ne demande que Java 17+ et Node.js, et pas le SDK Android. Voici ce qu’il fait :
1. il vérifie l’empreinte SHA-256 de l’APK Jellyfin ;
2. il le décode avec apktool ;
3. il applique les modifications ci-dessus, chacune vérifiée : une autre version de Jellyfin fait échouer la construction au lieu de produire une appli cassée ;
4. il compile les écrans Noctra (`javac` puis `dx`) en un fichier dex supplémentaire et ajoute l’interface `web/` aux ressources de l’APK ;
5. il reconstruit l’APK, l’aligne et le signe avec la clé Noctra (voir `apps/scripts/android-tools.mjs`).

Pour un autre serveur, définissez `NOCTRA_JELLYFIN_URL` (Jellyfin) et `NOCTRA_URL` (Noctra).

Les images de la marque se trouvent dans `overlay/res`. Elles sont générées par `node apps/scripts/render-icons.mjs`.

## Licence

jellyfin-androidtv est distribué sous licence GNU GPL v2. Noctra TV en est une version modifiée, soumise à la même licence. Le code source d’origine est disponible sur https://github.com/jellyfin/jellyfin-androidtv (étiquette `v0.19.10`), et l’intégralité des modifications se trouve dans `apps/scripts/build-androidtv.mjs` et dans le dossier `apps/androidtv`.
