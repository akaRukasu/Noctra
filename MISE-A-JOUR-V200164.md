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

## Vérification

`node tests/tv-player-skip-controls.mjs`, `node tests/web-episode-flow-controls.mjs`, `node tests/v200164-ppv-streamed-sources.mjs`, `node tests/orsay-samsung-2014.mjs`, `npm run test:apps`.
