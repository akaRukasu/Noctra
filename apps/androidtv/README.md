# Noctra TV (Android TV, Google TV, Fire TV)

Noctra TV est l’appli **Jellyfin pour Android TV** (projet officiel [jellyfin-androidtv](https://github.com/jellyfin/jellyfin-androidtv), version 0.19.10), adaptée pour Noctra :

- **Serveur intégré.** Au démarrage, l’appli se connecte seule à `https://akarukasu.merlion.usbx.me/jellyfin` et ouvre directement la page d’authentification. Il n’y a plus d’adresse à saisir à la télécommande.
- **Marque Noctra.** Nom, icône, bannière du lanceur Android TV et logo sont ceux de Noctra.
- **Identifiant `com.noctra.tv`.** L’appli s’installe à côté de l’appli Jellyfin officielle, sans conflit.

- **Accueil Noctra.** Une fois connecté, l’appli s’ouvre sur l’accueil Noctra, avec un menu en haut de l’écran :
  - **Accueil** : reprise de lecture, derniers ajouts de chaque médiathèque ;
  - **Médiathèques** : chaque médiathèque en grille d’affiches, avec des tris (ajouts récents, titre, note, année, aléatoire) et un filtre « Non vus » ;
  - **TV en direct** : les sources et les chaînes du serveur Noctra.
    - Au lancement d’une chaîne, une fenêtre propose ses serveurs, classés dans cet ordre : le dernier serveur qui a fonctionné (mémorisé), puis le lecteur natif, les serveurs automatiques et les lecteurs web. Le premier démarre seul après 5 secondes, sauf si une touche est pressée.
    - Les flux directs passent par le lecteur natif (ExoPlayer). Il utilise un tampon élargi, retente les segments et revient au direct quand le flux prend trop de retard. Il relance aussi un flux bloqué et se reconnecte de plus en plus espacé (1, 2, 4, 8 s…). Après une coupure, l’appli redemande un lien neuf au serveur.
    - Les lecteurs web (sports…) sont des pages externes. Pendant leur affichage, les flèches déplacent un curseur et OK envoie un vrai appui, pour lancer la lecture ou passer en plein écran.
    - En cas d’échec, la fenêtre des serveurs réapparaît avec le serveur en échec marqué, puis le suivant démarre après 4 secondes.
    - **Multiview** : le bouton Multiview d’une source permet de choisir jusqu’à 4 chaînes avec OK, puis de les lancer ensemble. Chaque vignette a son propre lecteur natif. Le son suit la vignette sélectionnée, OK l’agrandit et Retour revient à la grille. Seuls les flux directs peuvent partager l’écran.
  - **Découvrir** et **Demandes** (Jellyseerr) : suggestions, recherche, demande en un clic et suivi de « Mes demandes » ;
  - **Roulette** : réglages (médiathèque, nombre de titres, note, titres déjà vus), rouleau d’affiches qui ralentit sur le titre tiré, puis révélation avec l’image de fond ;
  - **Rechercher** (loupe) : recherche dans les médiathèques ;
  - **Compte** (en haut à droite) : paramètres de l’appli. On y change de compte ou on se déconnecte dans Paramètres › Authentification.

  Les fiches et la lecture des films et des séries utilisent les écrans natifs de l’appli. La touche Retour ramène ensuite à l’accueil Noctra.

L’interface Jellyfin est native, ce qui la rend fluide sur les boîtiers et les vidéoprojecteurs. La lecture passe par le lecteur vidéo d’Android (ExoPlayer) : MKV, HEVC, AC3/DTS et sous-titres sont lus directement quand l’appareil les prend en charge, sinon Jellyfin transcode.

Les téléchargements et l’administration de Noctra ne sont pas proposés sur la TV. Ils restent disponibles sur téléphone, sur PC et dans le navigateur.

### Fonctionnement de l’accueil Noctra

- `web/` contient l’interface de l’accueil (HTML, CSS et JavaScript ES2017 sans dépendance, pensés pour la télécommande). L’appli l’embarque et la sert elle-même à l’adresse `https://akarukasu.merlion.usbx.me/noctra/tv-app/`. Elle partage donc l’origine de l’API Noctra et de Jellyfin, et rien n’est à installer sur le serveur.
- `java/com/noctra/tv/` contient les écrans ajoutés à l’appli :
  - `NoctraHomeActivity` : WebView de l’accueil, avec un canal `MessagePort` réservé à la page principale (les lecteurs web des chaînes n’y ont pas accès) ;
  - `NoctraStream` : lecture d’une chaîne avec ExoPlayer, avec tampon, reprises et reconnexions ;
  - `NoctraPlayerActivity` : lecteur plein écran des chaînes ;
  - `NoctraMultiviewActivity` : de 2 à 4 chaînes à l’écran ;
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
