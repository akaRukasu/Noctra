# Noctra 200.0.164 — commandes de lecture (±15 s, génériques, épisode suivant)

Versions : serveur **200.0.164**, Noctra TV **1.1.61** (Android TV **noctra.86**, LG webOS, Samsung Tizen, Samsung 2014), Android **1.9.14** (versionCode 37), iOS **2.18.9** (build 52).

## Ce qui change

### Commandes de lecture, sur tous les lecteurs

- **−15 s / +15 s** : boutons visibles et touches de la télécommande. Les appuis répétés s'additionnent et un retour visuel s'affiche (« ⟲ −45 s · 12:30 »). Les sauts s'arrêtent au début et une seconde avant la fin du titre. Lecture ou pause est conservée. Fonctionne en lecture directe comme en transcodage.
- **Direct** : les ±15 s n'apparaissent que si le flux a une vraie fenêtre de retour (au moins 30 s). Sans fenêtre, aucun bouton.
- **« Passer le générique »** pendant le générique de début, **« Passer le générique de fin »** pendant le générique de fin. Les boutons « Passer le récap » et « Passer l'aperçu » existent aussi.
  - Seuls les marqueurs réels sont utilisés : segments du serveur Jellyfin (`/MediaSegments`), sinon chapitres nommés du fichier (« Intro », « Opening », « Ending », « Générique de fin »…).
  - Sans marqueur, il n'y a pas de bouton. Aucune durée fixe, et le générique « appris » d'après les avances manuelles a été retiré (il était approximatif).
  - Jamais de saut automatique.
  - Passer le générique de fin amène à la fin du générique : une scène après le générique reste visible. Si le générique dure jusqu'au bout du fichier, c'est la fin du titre.
- **« Épisode suivant »** : bouton distinct, présent quand la série a un épisode suivant. Il apparaît avec les commandes et pendant le générique de fin. « Passer le générique de fin », « Épisode suivant » et la lecture automatique (« À suivre », 10 s) restent trois choses séparées.

| Lecteur | ±15 s | Générique / générique de fin | Épisode suivant |
|---|---|---|---|
| Android TV (lecteur Noctra) | ◀ ▶ (commandes masquées), ⏪ ⏩, boutons des commandes | boutons sélectionnables, OK | bouton distinct, ◀ ▶ entre les deux |
| LG webOS, Samsung Tizen, Samsung 2014 | ◀ ▶, ⏪ ⏩, boutons « −15 s / +15 s » | idem | idem |
| Android téléphone / tablette | boutons du lecteur (15 s), bornés | boutons sur la vidéo | bouton distinct |
| iPhone / iPad | barre « ⟲15 / ⟳15 » | boutons contextuels du lecteur d'Apple | bouton distinct, même lecteur |
| Web / PWA (lecteur Jellyfin) | sauts du lecteur réglés à 15 s s'ils n'ont jamais été changés | boutons Noctra | bouton distinct et carte « À suivre » |
| TV en direct web | « −15 s / +15 s » avec fenêtre de retour | — | — |

Si vous aviez réglé vous-même la durée des sauts dans Jellyfin web, votre réglage est conservé.

### Sources TV

- **Streamed** : `streamed.pk` ne publie plus rien. Adresse actuelle **strmfree.st**. Les anciennes adresses (streamed.pk, streamed.st) sont essayées ensuite.
- Nouvelle source **PPV** (**ppv.st**, puis ppv.to) : programme public `/api/streams`. Les événements terminés depuis plus d'une heure sont retirés, et les chaînes 24/7 sont gardées.

### Autres corrections

- PWA : le cache hors ligne (r164) gardait l'ancienne version du lecteur HLS, parce qu'il ignorait le numéro de version des fichiers. Il compare maintenant l'adresse exacte.
- Service Ultra.cc : `NODE_OPTIONS=--disable-wasm-trap-handler`. Sans ce réglage, Noctra affichait « fetch failed ».
- Version web : `servers` de `client/config.json` sur `https://akarukasu.astra.usbx.me/jellyfin`.

## Mise à jour en gardant les données

Rien n'est effacé : comptes, historique de lecture, reprises, favoris, « vu », réglages et fichiers médias sont conservés.

1. **Serveur (seedbox)** : `noctra-update ~/noctra-media-client-v200.0.164.zip`. Vous pouvez aussi utiliser l'updater PC V8 (`LANCER-MISE-A-JOUR-NOCTRA-V8.cmd`). Le script :
   - garde `.env` et le dossier `runtime/` (sessions, clés des sources, journaux) ;
   - fait une sauvegarde complète `~/apps/noctra-backup-<date>-v<ancienne version>` avant de remplacer quoi que ce soit ;
   - refuse de continuer si l'ancien serveur répond encore sur le port.

   Jellyfin, Radarr, Sonarr, Prowlarr, Seerr et qBittorrent ne sont pas touchés : leurs chemins et réglages restent tels quels.
2. **Android TV** : installer `Noctra-androidtv.apk` par-dessus l'appli actuelle. C'est la même clé de signature, donc la session et les réglages restent.
3. **Android** : installer l'APK `noctra-android-native` par-dessus (même clé).
4. **iPhone / iPad** : réinstaller l'IPA dans E-Sign. Les réglages de l'appli restent si le même identifiant est utilisé.
5. **LG** : `com.noctra.media_1.1.61_all.ipk`.
6. **Samsung 2014** : relancer « Installer sur le televiseur.cmd » du kit.
7. **Samsung Tizen** et **web** : aucune action, l'interface est servie par le serveur.

## Matrice des résultats (niveau de vérification réel)

Légende : **N** = navigateur Chromium automatisé avec une vraie vidéo et un lecteur ou serveur simulé ; **C** = compilation (CI GitHub ou locale) ; **A** = analyse du code ou test statique ; **—** = sans objet. Rien n'a été vérifié sur un appareil réel ni sur un émulateur : cet environnement n'en a pas.

| Fonction | Android TV | LG / Tizen | Samsung 2014 | Android | iOS | Web / PWA |
|---|---|---|---|---|---|---|
| ±15 s titres (boutons, touches, appuis répétés, bornes, pause gardée) | C (APK construit) + A | **N** | **N** (moteur commun) + A | C + A | C + A | **N** (retour visuel, réglage gardé) |
| ±15 s en direct seulement avec une fenêtre de retour | A (Media3) | **N** (avec et sans fenêtre) | A | C + A | C + A | A |
| « Passer le générique » / « … de fin » (segments, chapitres, sans marqueur) | C + A | **N** | A | C + A | C + A | **N** (segments, chapitres, sans marqueur) |
| Scène après le générique gardée, aucun saut automatique | C + A | **N** | A | C + A | C + A | **N** |
| « Épisode suivant » distinct (≠ passer le générique ≠ lecture auto) | C + A | **N** | A | C + A | C + A | **N** |
| Lecture directe / transcodage | A (même lecteur) | A | A | A | A | A |
| Reprise de position | A | **N** (départ à 30 s) | **N** (AVPlay simulé, 60 s) | A | A | — |
| Sources Streamed (strmfree.st) et PPV (ppv.st) | — | — | — | — | — | réponses simulées ; sites réels injoignables ici |
| Autres fonctions (accueil, médiathèques, demandes, TV, multiview, cast, Arr…) | tests existants inchangés | idem | **N** (test Samsung 2014 complet) | idem | idem | idem |

Suite complète (289 tests), lancée avant et après les modifications :
- **Nouveaux tests** : `tv-player-skip-controls`, `web-episode-flow-controls` et `v200164-ppv-streamed-sources` réussissent.
- **Une seule régression** : `v200137` vérifiait un numéro anti-cache figé. Le test a été corrigé.
- **Tests corrigés en passant** : `static-integrity` (HLS 1.7.3, cache PWA) et le faux positif ES5 du test Samsung 2014.
- **157 anciens tests échouent comme avant** : 97 vérifient le numéro d'une ancienne version, 14 dépassent le délai (réseau externe) et 46 visent du code remplacé depuis. Aucun ne vient de cette version.

## Limites et points à valider sur appareil

- **Appareils** : aucun appareil réel ni émulateur n'était disponible, et le serveur n'était pas joignable depuis cet environnement. À vérifier à la main :
  - les télécommandes LG, Samsung et Android TV ;
  - le lecteur Media3 (Android) et AVPlayer (iOS) ;
  - le transcodage réel par Jellyfin.
- **Marqueurs** : les boutons « Passer le générique » n'apparaissent que si Jellyfin fournit des segments ou si le fichier a des chapitres nommés. Pour en obtenir sur toute la médiathèque, installez dans Jellyfin le greffon de détection des génériques (« Intro Skipper », il crée des MediaSegments), puis lancez son analyse. Sans marqueur, aucun bouton ne s'affiche, et c'est voulu.
- **iOS** : les boutons ±10 s d'Apple restent dans le lecteur système (leur durée ne peut pas être changée sur iPhone). Les boutons Noctra ±15 s sont ajoutés en haut à gauche.
- **Streamed / PPV** : `strmfree.st` et `ppv.st` étaient bloqués par le réseau de cet environnement. Le format attendu (API Streamed `/api/matches/…`, PPV `/api/streams`) est lu de façon tolérante, mais il n'a pas pu être confirmé sur les vrais sites. Si une source affiche « ne répond pas », le message donne la cause.
- **Archive 200.0.163** : elle n'a pas pu être lue (fichier sur votre PC). Les corrections connues sont reportées : `NODE_OPTIONS`, adresses du client web, nouveau domaine. Les réglages de Radarr, Sonarr et qBittorrent sont sur le serveur et cette version n'y touche pas.

## Vérification

`node tests/tv-player-skip-controls.mjs`, `node tests/web-episode-flow-controls.mjs`, `node tests/v200164-ppv-streamed-sources.mjs`, `node tests/orsay-samsung-2014.mjs`, `npm run test:apps`.
