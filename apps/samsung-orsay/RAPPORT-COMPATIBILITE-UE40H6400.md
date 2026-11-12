# Rapport de compatibilité — Noctra sur Samsung UE40H6400 (2014)

## 1. Le téléviseur

| Point | Constat |
|---|---|
| Modèle | Samsung UE40H6400, série **H** (2014), Full HD 1920 × 1080 |
| Plateforme | **Orsay** (« Samsung Smart TV » 2010-2014, SDK 5.x), pas Tizen. Samsung n'a lancé Tizen qu'avec la série J (2015) ; les applis Tizen `.wgt` ne s'installent pas sur ce modèle. |
| « Version 2910 » | Numéro de version du logiciel du téléviseur (micrologiciel), sans rapport avec un numéro de Tizen. |
| Moteur web | WebKit 537 (navigateur « Maple » des Samsung de 2012 à 2014), soit l'époque de Safari 6 et 7 (2013). |
| Applis tierces | Seulement par l'installation développeur « User App Sync » (session `develop` + serveur web local sur le port 80). Une installation par clé USB n'est pas conservée. |
| Vidéo | Lecteur matériel (webapis.avplay, ou module « Player »), dessiné sous la page. Formats : HLS (MPEG-TS) et MP4, vidéo H.264 jusqu'en 1080p, son AAC/MP3. Un seul décodeur vidéo. Le téléviseur ne décode probablement pas le HEVC (cette série Full HD), d'où la conversion en H.264. |

## 2. Contraintes du moteur et réponse apportée

| Contrainte | Conséquence | Réponse dans la variante |
|---|---|---|
| Pas de `Promise`, `fetch`, `URL`, `URLSearchParams`, `AbortController`, `MessageChannel`, `MessageEvent` utilisable | l'interface Noctra TV ne démarre pas | `orsay-compat.js` : compléments (fetch sur XMLHttpRequest avec lecture progressive, Promise A+…) ; liaison directe interface ↔ hôte (`NoctraAttachHost`) |
| Pas de `closest`, `remove`, `replaceWith`, `Array.find`/`includes`, `String.normalize`… | erreurs à l'exécution | compléments, actifs seulement si la fonction manque |
| Syntaxe ES2015+ refusée | script illisible | tous les scripts du paquet sont vérifiés en **ES5** à la construction et par le test |
| Pas de variables CSS ni de grilles CSS ; flexbox seulement en `-webkit-` ; dégradés à l'ancienne syntaxe ; pas de `min()`/`max()` | mise en page détruite | `app.css` **converti à la construction** : variables remplacées, grilles transformées en flexbox `-webkit-` (colonnes, piles, rangées), dégradés et animations préfixés, `min()`/`max()` évalués pour 1280 × 720 |
| Pas de MSE (Media Source Extensions) | ni hls.js, ni mpegts.js, ni Shaka | lecteur matériel du téléviseur ; relais du serveur pour les formats qu'il ne lit pas |
| Le lecteur ne peut pas envoyer d'en-têtes (jeton, Referer…) | flux Noctra et flux protégés illisibles | droit de lecture temporaire du serveur (`/api/tv/cast`, en-têtes Referer/Origin/User-Agent transmis au relais du serveur) ; jeton Jellyfin dans l'adresse |
| Codes de touches propres à Samsung (13 = « 8 », 8 = « 4 », 27 = Muet…) | navigation impossible ou erronée | traduction des touches Samsung en touches standard ; Retour bloqué pour ne pas quitter l'appli |
| Pas de clavier à l'écran pour une page web | saisie impossible | clavier à l'écran Noctra (lettres, chiffres, accents) ; chiffres de la télécommande saisis directement |
| Stockage web pas toujours conservé | session perdue | réglages et session copiés dans un fichier de l'appli (API FileSystem), relus au démarrage |
| Certificats racine de 2014 | HTTPS vers le serveur probablement refusé (voir 4) | écran de diagnostic, relais local HTTP → HTTPS fourni |

## 3. Fonctions : conservées, adaptées, absentes

| Fonction | Statut sur ce téléviseur |
|---|---|
| Accueil, carrousel, médiathèques, fiches films et séries, recherche, Découvrir, Demandes, Roulette | **Conservées**, même interface que Noctra TV (Android TV, LG, Tizen), en affichage allégé |
| Connexion Jellyfin (Quick Connect, identifiants), session mémorisée, paramètres du compte | **Conservées** ; saisie par le clavier à l'écran |
| Films et épisodes : reprise, « Continuer à regarder », suivi Jellyfin, pistes audio, passer l'intro / le générique, épisode suivant | **Conservés**. **Adapté** : flux HLS préparé par Jellyfin en H.264 (niveau 4.1, 1080p au plus), son stéréo AAC, 20 Mb/s au plus (réglable) ; changement de piste = nouveau flux à la même position |
| Sous-titres | **Adaptés** : incrustés dans l'image par Jellyfin (ce lecteur n'affiche pas les pistes WebVTT). Cela demande une conversion vidéo sur le serveur. |
| TV en direct : sources, chaînes, favoris, guide, zapping (▲ ▼, CH, numéros), panneaux chaînes et serveurs, bascule automatique de serveur | **Conservés**. **Adapté** : lecture par le lecteur du téléviseur avec un droit de lecture du serveur ; si le téléviseur refuse le flux, **relais du serveur** (ffmpeg, copie sans conversion vers une liste HLS lisible) ; flux à en-têtes passés par le relais (ils étaient écartés sur LG/Tizen) |
| Multiview | **Adapté** : un seul décodeur, donc **mosaïque composée par le serveur** (ffmpeg, 9 chaînes au plus au lieu de 12). Conservés : son au choix, mise en avant, changement de serveur, ajout et retrait de chaînes, pilotage depuis le téléphone. **Retiré : le plein écran d'une case**, impossible sans second décodeur ; « Mettre en avant » donne 3/4 de l'écran. |
| Lecteurs des sites (DLStreams et pages comparables) | **Absents** : ces pages demandent un navigateur récent (MSE, JavaScript moderne) que le téléviseur n'a pas. Les chaînes qui n'ont que ce type de lecteur sont signalées comme indisponibles. |
| « Ouvrir l'interface web complète » (réglages) | **Retiré** de ce téléviseur : cette interface demande un navigateur récent. Remplacé par « Serveur et relais local (Samsung 2014) ». |
| SyncPlay | Le protocole est conservé (même code que LG/Tizen). **Non essayé** avec ce lecteur. |
| Diffusion vers ce téléviseur depuis le téléphone (« Lire sur Noctra TV ») | Conservée, par le même canal Jellyfin. **Non essayée** sur ce modèle. |

## 4. Réseau et serveur

- **HTTPS — risque principal.** Le serveur Noctra est en HTTPS, sur l'hébergement Ultra.cc. Je n'ai pas pu vérifier la chaîne de son certificat ni sa compatibilité avec un téléviseur de 2014 (accès réseau bloqué depuis l'environnement de développement). Les certificats actuels, par exemple Let's Encrypt (racine ISRG Root X1, de 2015), sont souvent inconnus des appareils de cette époque. Si le téléviseur les refuse, l'appli le détecte au démarrage et propose le **relais local**. Ce relais est un programme Node.js du kit, à faire tourner sur un PC, un NAS ou un Raspberry Pi toujours allumé. Le HTTP ne circule alors qu'à l'intérieur de la maison.
- **Serveur Noctra.** Version 200.0.146 ou plus récente (relais des chaînes), avec **ffmpeg**, déjà utilisé pour la diffusion Chromecast/AirPlay. Sans ffmpeg, la lecture directe et les films marchent, mais pas le relais des chaînes ni le multiview.
- **Charge du serveur.** Chaque mosaïque est réencodée par ffmpeg (1280 × 720). Le relais d'une chaîne copie le flux sans le convertir. Les films sont convertis par Jellyfin quand le fichier dépasse ce que le téléviseur décode : 4K, HEVC, son 5.1 ou sous-titres incrustés.

## 5. Performances (matériel de 2014)

- Appli en **1280 × 720**, mise à l'échelle par le téléviseur : moins de pixels à dessiner et moins de mémoire qu'en 1920 × 1080.
- Affichage **allégé** forcé : pas de flou, ni de fond dégradé plein écran, ni de transitions de couleur. Seuls restent les déplacements et les fondus.
- Un seul chargement des scripts (≈ 0,5 Mo non compressé, paquet de 185 Ko). Aucune bibliothèque vidéo n'est téléchargée.
- Le travail lourd est fait par le serveur : conversion des films, relais des chaînes, composition du multiview. Le téléviseur ne décode qu'un flux.
- Réseau : délais d'attente et reprises (reconnexion espacée du direct, serveur suivant, 45 s pour le premier démarrage d'un relais, 6 nouveaux essais pour la mosaïque).

## 6. Vérifications effectuées — et non effectuées

**Effectuées (automatiques, `npm run test:orsay`) :**
1. Paquet : fichiers présents, `config.xml` et `widget.info` en CRLF sans espace de noms, icônes aux tailles déclarées, liste User App Sync conforme.
2. Syntaxe **ES5** de tous les scripts du paquet.
3. Style converti : plus aucune variable CSS, grille CSS ou fonction `min()`/`max()` ; calcul des colonnes vérifié (7 affiches par ligne).
4. Émulation dans Chromium, avec **retrait** de Promise, fetch, URL, URLSearchParams, AbortController, MessageChannel, MessageEvent, IntersectionObserver, closest, remove, find, includes, normalize… et API Samsung **simulées** (Common.API, webapis.avplay, FileSystem). Points vérifiés :
   - démarrage et accueil complet ;
   - traduction des touches Samsung (y compris « 13 = touche 8 ») et Retour bloqué ;
   - chaîne lue avec droit de lecture et en-têtes transmis ;
   - flux refusé basculé vers le relais du serveur, puis relais arrêté à la fermeture ;
   - film repris à la bonne position, avance et pause ;
   - mosaïque multiview (serveur automatique vide, case suivante, son changé, fermeture) ;
   - réglages enregistrés dans le fichier de l'appli ;
   - écran de diagnostic, puis relais local saisi au clavier à l'écran ;
   - aucune erreur JavaScript.
5. Serveur d'installation (liste construite avec l'adresse saisie sur le téléviseur, appli servie) et relais local : listes HLS et JSON réécrites dans les deux sens, jeton et vidéo transmis.
6. Tests existants de l'interface TV (LG, Tizen, Android TV) toujours passés.

**Non effectuées :**
- **Aucun essai sur un téléviseur réel.**
- **Aucun essai sur l'émulateur Samsung** : le SDK 5.1 (2014) est un émulateur Windows qui n'est plus distribué et ne pouvait pas être lancé ici.
- Points donc **non confirmés** :
  - le comportement exact d'AVPlay sur ce logiciel 2910 (signature de `play()` avec position de départ, `jumpForward`, codes d'erreur, rectangle d'affichage) ;
  - le repli sur le module « Player » ;
  - les codes de touches réels ;
  - le rendu CSS réel (flexbox `-webkit-`, `calc`, dégradés) ;
  - la conservation du stockage web et l'API FileSystem ;
  - l'acceptation du certificat HTTPS ;
  - la tenue en mémoire sur de longues séances.

## 7. Premier essai conseillé (recette)

1. Installation User App Sync (le guide, chapitre 5). L'icône Noctra apparaît.
2. Premier lancement : écran de connexion Jellyfin, ou « Connexion impossible » qui conduit au relais local.
3. Navigation à la télécommande dans l'accueil, les médiathèques et une fiche. Les cartes sont alignées en lignes.
4. Un film : démarrage, pause, avance, reprise, sous-titres.
5. Une chaîne de la TV en direct : démarrage, zapping CH ▲ ▼, liste des serveurs (▶).
6. Le multiview avec 2 puis 4 chaînes : son, mise en avant.
7. Éteindre puis rallumer le téléviseur : Noctra se rouvre sans redemander la connexion.

Pour chaque point qui échoue, notez le message à l'écran ou le journal du lecteur (en bas à gauche pendant une lecture). La correction peut alors être ciblée.
