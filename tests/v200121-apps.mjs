// 200.0.121 — Applications Noctra : Android / Android TV, iOS, LG webOS et
// Samsung Tizen. Pont web chargé avant le moteur Jellyfin, sonde /health
// lisible par l'écran de connexion, paquets TV construits sans SDK.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const index = await read('public/client/index.html');
const bridge = await read('public/noctra-app-bridge.js');
const server = await read('server.mjs');

assert.equal(pkg.version, '200.0.121');

// 1. Le pont est synchrone, placé après la balise viewport et avant tout le
//    moteur Jellyfin (window.NoctraApp et la mise en page TV existent dès le départ).
const bridgeTag = index.indexOf('<script src="../noctra-app-bridge.js?v=200.121"></script>');
assert.ok(bridgeTag > index.indexOf('name="viewport"'), 'Pont après la balise viewport');
assert.ok(bridgeTag < index.indexOf('<script defer'), 'Pont avant les scripts du moteur');
execFileSync(process.execPath, ['--check', new URL('public/noctra-app-bridge.js', root).pathname]);
assert.ok(!/\?\.|\?\?/.test(bridge.replace(/\/\*[\s\S]*?\*\//g, '')), 'Pas de ?. ni ?? : lisible par les anciens moteurs TV');

assert.match(bridge, /var backKeyCodes = \{ 461: true, 10009: true \};/, 'Retour LG (461) et Samsung (10009)');
// Téléviseurs : mise en page Noctra (PC), jamais la disposition « TV » de
// Jellyfin (sans dock ni en-tête Noctra) ; navigation aux flèches assurée ici.
assert.match(bridge, /if \(tv && readStorage\('layout'\) !== 'desktop'\) writeStorage\('layout', 'desktop'\);/);
assert.match(bridge, /if \(named === 'android-leanback'\) return 'androidtv';/);
assert.ok(bridge.includes('var agent = /NoctraApp\\/[\\d.]+ \\(([a-z-]+)\\)/i.exec(ua);'), 'Agent utilisateur « NoctraApp/x (plateforme) »');
assert.match(bridge, /function nearest\(from, direction, list\) \{/);
assert.match(bridge, /if \(\(direction === 'left' \|\| direction === 'right'\) && lateral > Math\.max\(a\.height, b\.height\)\) continue;/);
assert.match(bridge, /var skipped = '\.cardOverlayContainer,\.cardText,\.cardFooter/);
assert.match(bridge, /Erreur Noctra : /, 'Erreurs affichées à l’écran dans les applis');
assert.match(bridge, /proto\.replaceChildren = function \(\) \{/, 'replaceChildren pour Chromium 85');
assert.match(bridge, /if \(closeOverlay\(\)\) return 'handled';\s*if \(atRoot\(\)\) return 'exit';/);
// Canal Android : port transmis par l'appli au seul cadre principal ; un port
// venu d'une iframe (source non nulle) est ignoré ; messages en attente.
assert.match(bridge, /if \(hostPort \|\| event\.data !== 'noctra-host' \|\| event\.source \|\| !event\.ports \|\| !event\.ports\[0\]\) return;/);
assert.match(bridge, /else if \(hostQueue\.length < 20\) hostQueue\.push\(text\);/);
assert.match(bridge, /postNative\('keepScreenOn', playing\)/);
assert.match(bridge, /viewport\.setAttribute\('content', 'width=1280,viewport-fit=cover'\)/);
assert.match(bridge, /defineAt\(Array\.prototype\);/, 'Array.prototype.at pour Chromium 85');
assert.match(bridge, /AbortSignal\.timeout = function/, 'AbortSignal.timeout pour Chromium 85');

// 2. /health : version et en-tête CORS pour l'écran de connexion des applis.
const health = server.slice(server.indexOf("if (path === '/health') {"), server.indexOf("if (path === '/api/config') {"));
assert.match(health, /'access-control-allow-origin': '\*'/);
assert.match(health, /if \(req\.method === 'OPTIONS'\) \{ res\.writeHead\(204, appProbe\); return res\.end\(\); \}/);
assert.match(health, /client: 'Noctra', version: '200\.0\.121'/);
assert.match(server, /version: '200\.0\.121',\n\s+jellyfinUrl,/);

// 3. Écran de connexion : normalisation des adresses saisies.
const launcher = await read('apps/shared/launcher/launcher.js');
const normalizeSource = launcher.slice(launcher.indexOf('  function normalize(value) {'), launcher.indexOf('  function describe(url)'));
const context = {};
vm.runInNewContext(`${normalizeSource}\nthis.normalize = normalize; this.valid = valid;`, context);
assert.deepEqual({ ...context.normalize('akarukasu.merlion.usbx.me/noctra/client/index.html') },
  { url: 'https://akarukasu.merlion.usbx.me/noctra', explicitScheme: false });
assert.equal(context.normalize(' HTTP://192.168.1.20:3000//noctra/ ').url, 'http://192.168.1.20:3000/noctra');
assert.equal(context.normalize('https://serveur.fr/noctra/health?x=1').url, 'https://serveur.fr/noctra');
assert.ok(context.valid('https://serveur.fr/noctra'));
assert.ok(!context.valid('https://'));
const launcherCode = launcher.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/new Function\('[^']*'\)/, '');
assert.ok(!/\?\.|\?\?|=>|\blet\b|\bconst\b/.test(launcherCode), 'Lanceur en ES5');
assert.match(launcher, /base \+ '\/client\/index\.html' \+ \(platform \? '\?noctraApp=' \+ encodeURIComponent\(platform\) : ''\)/);

// 4. Paquets TV : .ipk au format ares-package, .wgt avec config.xml en tête.
execFileSync(process.execPath, [new URL('apps/scripts/build-tv.mjs', root).pathname], { stdio: 'pipe' });
const appinfo = JSON.parse(await read('apps/webos/appinfo.json'));
assert.equal(appinfo.disableBackHistoryAPI, true, 'webOS : la touche Retour arrive à la page');
const ipk = await readFile(new URL(`dist/apps/${appinfo.id}_${appinfo.version}_all.ipk`, root));
assert.equal(ipk.subarray(0, 8).toString(), '!<arch>\n');
const members = [];
for (let offset = 8; offset < ipk.length;) {
  const name = ipk.subarray(offset, offset + 16).toString().trim().replace(/\/$/, '');
  const size = Number(ipk.subarray(offset + 48, offset + 58).toString().trim());
  members.push({ name, body: ipk.subarray(offset + 60, offset + 60 + size) });
  offset += 60 + size + (size % 2);
}
assert.deepEqual(members.map(member => member.name), ['debian-binary', 'control.tar.gz', 'data.tar.gz']);
const dataTar = gunzipSync(members[2].body).toString('latin1');
for (const file of ['index.html', 'launcher.js', 'config.js', 'platform.js', 'appinfo.json', 'icon-80.png', 'icon-130.png', 'splash.png']) {
  assert.ok(dataTar.includes(`usr/palm/applications/${appinfo.id}/${file}`), `webOS : ${file}`);
}
assert.ok(dataTar.includes("window.NOCTRA_PLATFORM = 'webos';"), 'webOS : plateforme déclarée');
const wgt = await readFile(new URL('dist/apps/Noctra.wgt', root));
assert.equal(wgt.readUInt32LE(0), 0x04034b50);
assert.equal(wgt.subarray(30, 30 + wgt.readUInt16LE(26)).toString(), 'config.xml');
const wgtText = wgt.toString('latin1');
for (const file of ['index.html', 'launcher.js', 'platform.js', 'icon.png']) assert.ok(wgtText.includes(file), `Tizen : ${file}`);
const tizen = await read('apps/tizen/config.xml');
assert.match(tizen, /<tizen:allow-navigation>\*<\/tizen:allow-navigation>/);
assert.match(tizen, /<tizen:application id="NoctraTV01\.Noctra" package="NoctraTV01"/);
assert.match(tizen, /privilege\/tv\.inputdevice/);

// 5. Android : un APK téléphone + Android TV, classes du système uniquement
//    (construit sans les dépôts Google par apps/scripts/build-android.mjs).
const manifest = await read('apps/android/app/src/main/AndroidManifest.xml');
assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
assert.match(manifest, /android\.software\.leanback" android:required="false"/);
assert.match(manifest, /android\.hardware\.touchscreen" android:required="false"/);
assert.match(manifest, /android:banner="@drawable\/banner"/);
const activity = await read('apps/android/app/src/main/java/com/noctra/app/MainActivity.java');
assert.ok(!/^import androidx\./m.test(activity), 'Aucune bibliothèque androidx');
assert.ok(!/->/.test(activity), 'Pas de lambda (dx sans désucrage)');
assert.match(activity, /webView\.postWebMessage\(new WebMessage\("noctra-host", new WebMessagePort\[\] \{ channel\[1\] \}\), target\);/);
assert.match(activity, /if \(!fromLauncher && !fromServer\) return;/);
assert.match(activity, /replaceAll\("\(\?i\)\(smart-\?\)\?tv", ""\)/, 'Pas de « tv » dans l’agent utilisateur');
assert.match(activity, /\(tv \? "android-leanback" : "android"\)/);
assert.match(activity, /webView\.evaluateJavascript\("if\(!window\.NoctraApp\)\{" \+ bridgeSource/, 'Pont embarqué pour les serveurs anciens');
assert.match(activity, /FLAG_KEEP_SCREEN_ON/);
const gradleApp = await read('apps/android/app/build.gradle.kts');
assert.match(gradleApp, /assets\.srcDir\("\.\.\/\.\.\/shared"\)/);
assert.ok(!/dependencies \{/.test(gradleApp), 'Aucune dépendance Gradle');
const androidBuild = await read('apps/scripts/android-tools.mjs');
assert.match(androidBuild, /if \(actual !== sha1\.trim\(\)\.split\(\/\\s\+\/\)\[0\]\) throw new Error/, 'Outils vérifiés par SHA-1');
assert.match(androidBuild, /resources\.arsc doit rester non compressé/);

// 5 bis. Noctra TV : Jellyfin Android TV adapté (serveur intégré, marque, identifiant).
const androidtv = await read('apps/scripts/build-androidtv.mjs');
assert.match(androidtv, /sha256: '8510a517c99927076082917f41bf306dd7a2546c59d492dd11bde18d6e2e4628'/, 'APK Jellyfin vérifié');
assert.match(androidtv, /const-string v5, "server_address"/, 'Adresse du serveur transmise à l’écran « Ajouter un serveur »');
assert.match(androidtv, /const-class v2, Lorg\/jellyfin\/androidtv\/ui\/startup\/fragment\/ServerAddFragment;/);
assert.match(androidtv, /'https:\/\/akarukasu\.merlion\.usbx\.me\/jellyfin'/);
assert.match(androidtv, /\['package="org\.jellyfin\.androidtv"', `package="\$\{packageName\}"`\]/);
assert.match(androidtv, /android:authorities="org\.jellyfin\.androidtv\.\$\{name\}"/);
assert.match(androidtv, /if \(count !== expected\) throw new Error/, 'Chaque modification est vérifiée');
for (const density of ['ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  for (const name of ['app_logo', 'app_icon_foreground', 'app_banner_foreground']) {
    const png = await readFile(new URL(`apps/androidtv/overlay/res/drawable-${density}/${name}.png`, root));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', `${density}/${name}`);
  }
}
assert.match(await read('apps/androidtv/README.md'), /GNU GPL v2/);

// 5 bis. Accueil Noctra dans Noctra TV : StartupActivity ouvre NoctraHomeActivity
//    (NoctraRouting), les écrans Jellyfin restent accessibles depuis l'accueil.
assert.match(androidtv, /invoke-static \{v0\}, Lcom\/noctra\/tv\/NoctraRouting;->nextActivity\(Landroid\/content\/Context;\)Ljava\/lang\/Class;/);
assert.match(androidtv, /invoke-static \{v0\}, Lcom\/noctra\/tv\/NoctraRouting;->nextActivityFlags\(Landroid\/content\/Context;\)I/);
assert.match(androidtv, /activity\('NoctraHomeActivity'\) \+ activity\('NoctraPlayerActivity'\) \+ activity\('NoctraMultiviewActivity'\)/);
assert.match(androidtv, /android:exported="false"/, 'Écrans Noctra non exportés');
assert.match(androidtv, /'assets', 'noctra-tv'/);
assert.match(androidtv, /'https:\/\/akarukasu\.merlion\.usbx\.me\/noctra'/);
const routing = await read('apps/androidtv/java/com/noctra/tv/NoctraRouting.java');
assert.match(routing, /intent\.hasExtra\("ItemId"\)/);
assert.match(routing, /return NoctraHomeActivity\.class;/);
const home = await read('apps/androidtv/java/com/noctra/tv/NoctraHomeActivity.java');
assert.match(home, /postWebMessage\(new WebMessage\("noctra-host"/, 'Canal natif par MessagePort');
assert.ok(!home.includes('addJavascriptInterface'), 'Pas d’objet Java exposé aux lecteurs web');
assert.match(home, /if \(sameOrigin\(target, server\)\) intent\.putExtra\(NoctraPlayerActivity\.EXTRA_TOKEN/, 'Jeton limité au serveur Noctra');
assert.match(home, /return !request\.getUrl\(\)\.toString\(\)\.startsWith\(appBase\);/, 'Le cadre principal reste sur l’accueil');
// Lecture des chaînes : tampon élargi, tentatives, retour au direct, reconnexions.
const stream = await read('apps/androidtv/java/com/noctra/tv/NoctraStream.java');
assert.match(stream, /new DefaultMediaSourceFactory\(data\)[\s\S]{0,200}\.setLoadErrorHandlingPolicy\(new DefaultLoadErrorHandlingPolicy\(live && !played \? 3 : 6\)\)/);
assert.match(stream, /\.setLoadControl\(buffer\)/);
assert.match(stream, /error\.errorCode == BEHIND_LIVE_WINDOW && played/);
assert.match(stream, /private static final int BEHIND_LIVE_WINDOW = 1002;/);
assert.match(stream, /STALL_TIMEOUT_MS/);
for (const file of ['NoctraStream', 'NoctraPlayerActivity', 'NoctraMultiviewActivity']) {
  assert.ok(!/implements[^{]*Player\.Listener/.test(await read(`apps/androidtv/java/com/noctra/tv/${file}.java`)), 'Aucune interface d’écoute Media3 (réduites par R8)');
}
// Lecteurs web : curseur et vrais appuis tactiles, signature sans « wv ».
assert.match(home, /root\.dispatchTouchEvent\(event\)/);
assert.match(home, /replace\("; wv\)", "\)"\)/);
assert.ok(!home.includes('"openJellyfin"'), 'Plus de bouton Jellyfin');
const tvApp = await read('apps/androidtv/web/app.js');
assert.ok(!/\?\.[\w([]|\?\?/.test(tvApp), 'Accueil TV en ES2017 (WebView anciennes)');
assert.match(tvApp, /event\.source !== null/, 'Canal refusé aux iframes');
assert.match(tvApp, /window\.NoctraTV = \{ back:/);
assert.match(tvApp, /Authorization: 'MediaBrowser Client="Noctra TV"/, 'Jellyfin 10.11+ : en-tête Authorization');
assert.ok(!/['"]X-Emby-Token['"]\s*:/.test(tvApp), 'Ancien en-tête refusé par Jellyfin (401)');
assert.ok(!/Jellyfin'\)|'Jellyfin'|dans Jellyfin/.test(tvApp), 'Interface sans bouton ni libellé Jellyfin');
assert.match(tvApp, /native\('multiview', \{ items: items, catalog: multiCatalog\(\) \}\)/);
assert.match(tvApp, /var MULTI_MAX = 12;/, 'Multiview : 12 chaînes');
assert.match(tvApp, /native\('cursor', \{ data: true \}\)/);
assert.match(tvApp, /noctra-tv-server:/, 'Dernier serveur fonctionnel mémorisé');
// Accueil comme sur PC : carrousel « Continuer à regarder », pas de rangée Reprendre, médiathèques 2 × 2.
assert.match(tvApp, /'CONTINUER À REGARDER'/);
assert.ok(!/row\('Reprendre'/.test(tvApp), 'Reprises dans le carrousel seulement');
assert.match(tvApp, /class: 'libs2'/);
assert.match(await read('apps/androidtv/web/app.css'), /\.libs2 \{ display: grid; grid-template-columns: 1fr 1fr;/);
// Fluidité : voisins directs, un déplacement par image, ajout par paquets.
assert.match(tvApp, /function gridNeighbour\(from, direction\)/);
assert.match(tvApp, /if \(event\.repeat && \(moveFrame \|\| now - lastMove < 85\)\) return;/);
assert.match(tvApp, /function appendChunked\(container, items, make, done\)/);
assert.ok(!/scroll-behavior: smooth/.test(await read('apps/androidtv/web/app.css')), 'Défilement piloté par le script');
// Roulette : genre et jusqu'à 10 titres.
assert.match(tvApp, /'&genre=' \+ encodeURIComponent\(roulette\.genre\)/);
assert.match(tvApp, /\[10, '10'\]/);
// Lecteurs web : un arrêt du moteur web ne ferme plus l'appli.
assert.match(home, /public boolean onRenderProcessGone\(WebView view, RenderProcessGoneDetail detail\)/);
assert.match(home, /createWebView\("index\.html#recovered"\)/);
// Lecteur web isolé dans son processus ; Jellyfin n'y initialise rien.
assert.match(androidtv, /activity\('NoctraWebPlayerActivity', ' android:process=":webplayer"'\)/);
assert.match(androidtv, /Lcom\/noctra\/tv\/NoctraProcess;->isSecondary\(Landroid\/content\/Context;\)Z/);
const webPlayer = await read('apps/androidtv/java/com/noctra/tv/NoctraWebPlayerActivity.java');
assert.match(webPlayer, /WebView\.setDataDirectorySuffix\("webplayer"\)/);
assert.match(webPlayer, /public boolean onRenderProcessGone/);
assert.match(tvApp, /native\('webPlayer', \{/);
// Contrôle à distance : « Lire sur… » ouvre le lecteur ou la fiche Noctra.
assert.match(androidtv, /Lcom\/noctra\/tv\/NoctraRemote;->play\(Landroid\/content\/Context;Ljava\/util\/UUID;Ljava\/lang\/Long;\)V/);
assert.match(androidtv, /Lcom\/noctra\/tv\/NoctraRemote;->show\(Landroid\/content\/Context;Ljava\/util\/UUID;\)V/);
assert.match(tvApp, /function remoteCommand\(data\)/);
// Fiches Noctra ; lecteur Noctra (HLS Jellyfin, suivi de lecture) pour SyncPlay.
assert.match(tvApp, /views\.item = function/);
assert.match(tvApp, /'\/Videos\/' \+ item\.Id \+ '\/master\.m3u8\?'/);
assert.ok(!tvApp.includes("native('openItem'"), 'Fiches affichées par Noctra');
const report = await read('apps/androidtv/java/com/noctra/tv/NoctraPlaybackReport.java');
for (const path of ['/Sessions/Playing"', '/Sessions/Playing/Progress"', '/Sessions/Playing/Stopped"', '/Videos/ActiveEncodings?deviceId=']) assert.ok(report.includes(path), path);
assert.match(home, /private Uri jellyfinOrigin\(Uri target\)/, 'Jeton Jellyfin limité au serveur Jellyfin');
// TV : bouquets et multiview (serveurs, son, mise en avant).
assert.match(tvApp, /'\/api\/tv\/catalog\?ref=' \+ encodeURIComponent\(ref\)/);
assert.match(tvApp, /function multiSheet\(\)/);
const multiview = await read('apps/androidtv/java/com/noctra/tv/NoctraMultiviewActivity.java');
for (const label of ['Écouter cette chaîne', 'Mettre en avant', 'Changer de serveur', 'Ajouter une chaîne', 'Retirer cette chaîne']) assert.ok(multiview.includes(label), label);
assert.match(multiview, /static final int MAX_TILES = 12;/);
assert.match(multiview, /tile\.stream\.setMaxVideoSize\(tile\.maxWidth, tile\.maxHeight\)/, 'Définition limitée à la vignette');
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraHomeActivity.java'), /NoctraMultiviewActivity\.catalog = /);
assert.match(stream, /fallback\.setBoolean\(factory, true\)/, 'Décodeur de secours');
assert.match(stream, /setExtensionRendererMode\(DefaultRenderersFactory\.EXTENSION_RENDERER_MODE_ON\)/, 'Décodeurs audio FFmpeg');
// Lecteur web : identité de bureau, fenêtres surgissantes, page entière, erreurs affichées.
assert.match(webPlayer, /Windows NT 10\.0; Win64; x64/);
assert.match(webPlayer, /public boolean onCreateWindow\(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg\)/);
assert.match(webPlayer, /text\.contains\("X-Frame-Options"\) \|\| text\.contains\("frame-ancestors"\)/);
assert.match(webPlayer, /public void onReceivedHttpError/);
// Contenu du serveur : lecteur Jellyfin (pistes audio, sous-titres), retour à Noctra à sa fermeture.
assert.match(tvApp, /native\('jellyfinPlay', \{ itemId: item\.Id, positionTicks: positionTicks, segments: segments, seriesIntros: intros \}\)/);
assert.match(androidtv, /\.method public closePlayer\(\)V/);
assert.match(androidtv, /:cond_0\n\$\{fragmentActivity\(overlay\)\}\$\{closeCheck\('noctra_jellyfin_screens'\)\}/, 'Retour à Noctra après le contrôle « navigating » (épisode suivant)');
assert.match(androidtv, /Lcom\/noctra\/tv\/NoctraPlayback;->close\(Landroid\/app\/Activity;\)Z/);
assert.match(androidtv, /Lcom\/noctra\/tv\/NoctraPlayback;->home\(Landroid\/app\/Activity;Ljava\/lang\/Object;\)V/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraPlayback.java'), /if \(opened\(activity\) && resumed\(fragment\)\) activity\.finish\(\);/, 'Épisode suivant : pas de fermeture pendant la transition vers « À suivre »');
const playbackJava = await read('apps/androidtv/java/com/noctra/tv/NoctraPlayback.java');
assert.match(playbackJava, /helper\.retrieveAndPlay\(itemId, false, positionTicks, context\)/);
// Carrousel d'accueil : image à la définition de l'écran, décodée avant le fondu, affiche verticale entière.
assert.match(tvApp, /function premiereWidth\(\)/);
assert.match(tvApp, /Promise\.all\(\[loadImage\(backdropUrl\(item, premiereWidth\(\)\), 8000\), loadImage\(logoUrl\(item\), 2500\)\]\)/, 'Image et logo affichés ensemble');
// Lecteur web : cadre comme sur PC, embed officiel LiveWatch sans référent, journal et navigation sécurisée.
assert.match(tvApp, /function frameConfig\(channel, option, url\)/);
assert.match(tvApp, /referrer: 'no-referrer'/);
assert.match(tvApp, /sandbox: frame\.sandbox, referrer: frame\.referrer/);
assert.match(await read('apps/androidtv/web/player.js'), /frame\.referrerPolicy = params\.get\('referrer'\)/);
assert.match(webPlayer, /settings\.setSafeBrowsingEnabled\(false\)/);
// Flux HLS demandé par la page : transmis au lecteur natif avec les en-têtes de la page.
assert.match(webPlayer, /if \(sniff && !handedOff && isStream\(request\.getUrl\(\)\)\) handOff\(request\);/);
assert.match(webPlayer, /headers\.put\("Referer", entry\.getValue\(\)\)/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraPlayerActivity.java'), /liveStream\(url, intent\.getStringExtra\(EXTRA_MIME\), intent\.getStringExtra\(EXTRA_HEADERS\)/);
assert.match(tvApp, /failedOption\.sniffedFrom\.noSniff = true;/);
// Guide des programmes (en cours, suivant, avancement) et zapping depuis le lecteur.
assert.match(tvApp, /'\/api\/tv\/programme\?id=' \+ encodeURIComponent\(keys\[index\]\)/);
assert.match(tvApp, /function epgKeys\(channel\)/, 'Guide aussi retrouvé par le nom de la chaîne');
assert.match(tvApp, /function needsEpg\(channel\)/, 'Guide périmé redemandé');
// Guide : rapprochement approximatif des noms côté serveur (« Canal Émotion » ↔ « Ciné+ Émotion »).
const serverCode = await read('server.mjs');
assert.match(serverCode, /function fuzzyTvGuideProgrammes\(guide, name\)/);
assert.match(serverCode, /if \(!programmes\.length\) programmes = fuzzyTvGuideProgrammes\(guide, cleanedName \|\| channel\.name\);/);
// « Reprendre » : l'accueil Jellyfin est couvert, repli sur le lecteur Noctra si le lecteur Jellyfin ne s'ouvre pas.
const playbackCode = await read('apps/androidtv/java/com/noctra/tv/NoctraPlayback.java');
assert.match(playbackCode, /private static void cover\(Activity activity\)/);
assert.match(playbackCode, /handler\.postDelayed\(watchdog, START_TIMEOUT_MS\);/);
assert.match(tvApp, /data\.jellyfinFailed/);
// Lecteur web : sites bloqués par le DNS du fournisseur d'accès → DNS sécurisé (WebView et lecteur natif).
const dnsCode = await read('apps/androidtv/java/com/noctra/tv/NoctraDns.java');
assert.match(dnsCode, /https:\/\/1\.1\.1\.1\/dns-query/);
assert.match(webPlayer, /return viaSecureDns\(request\);/);
assert.match(stream, /new OkHttpDataSource\.Factory\(NoctraDns\.client\(\)\)/);
// LG webOS et Samsung Tizen : interface Noctra TV servie par le serveur, pont web (tv-native.js).
assert.match(serverCode, /async function serveTvApp\(pathname, res\)/);
assert.match(serverCode, /tvApp: true \}, appProbe\);/, '/health annonce l’interface TV');
const tvLauncherCode = await read('apps/shared/launcher/launcher.js');
assert.match(tvLauncherCode, /base \+ '\/tv-app\/index\.html\?platform=' \+ encodeURIComponent\(platform\)/);
assert.match(tvLauncherCode, /serverTvApp === true/, 'Serveur ancien : interface complète');
assert.match(await read('apps/tizen/platform.js'), /tizen\.tvinputdevice\.registerKey\(name\)/);
const webHost = await read('apps/androidtv/web/tv-native.js');
assert.match(webHost, /if \(\['webos', 'tizen', 'web'\]\.indexOf\(platform\) < 0\) return;/, 'Inactif dans l’appli Android TV');
assert.ok(!/\basync\s+(?:function|\()|\bawait\s+[\w(]|\?\.[\w([]|\?\?/.test(webHost), 'Pont web en ES2015 (webOS 5, Tizen 5)');
for (const needle of ["'/Users/AuthenticateByName'", "'/QuickConnect/Initiate'", "'/Sessions/Playing'", "'ApiKey='", "event: 'zap'", "event: 'failed'", 'MULTI_MAX = 12']) assert.ok(webHost.includes(needle), needle);
assert.match(await read('apps/androidtv/web/index.html'), /<script src="tv-native\.js"><\/script>\s*<script src="tv-data\.js"><\/script>\s*<script src="app\.js"><\/script>/);
assert.match(tvApp, /S\.caps\.jellyfinPlayer !== false/);
assert.match(tvApp, /S\.caps\.webPlayer !== false && native\('webPlayer'/);
// Défilement : pas d'animations qui se chevauchent.
assert.match(tvApp, /var smooth = !repeating && now - \(scroller\._movedAt \|\| 0\) > \(LITE_UI \? 600 : 450\);/);
assert.match(tvApp, /function guideRow\(channel, onSelect\)/);
assert.match(tvApp, /if \(event\.event === 'zap'\) \{ zap\(Number\(event\.delta\) \|\| 0\); return; \}/);
assert.match(tvApp, /if \(result\.playSessionId && state\.playId && result\.playSessionId !== state\.playId\) return;/);
// TV en direct : favoris et chaînes récentes (retrouvées dans le catalogue du moment), filtres avec nombres.
assert.match(tvApp, /var FAVORITES_KEY = 'noctra-tv-favorites-v1';/);
assert.match(tvApp, /if \(source && source\.id\) rememberRecent\(channel, source, ctx\);/);
assert.match(tvApp, /function openStoredChannel\(entry\) \{/);
assert.match(tvApp, /if \(favoriteMode\) \{ toggleFavorite\(channel, source, ctx\); refreshFavoriteMarks\(channel, source\); \}/);
assert.match(tvApp, /favorite = h\('button', \{ class: 'btn f picker-fav'/);
// Santé des serveurs, vérification pendant le compte à rebours, moteur web ancien.
assert.match(tvApp, /var HEALTH_KEY = 'noctra-tv-health-v2';/);
assert.match(tvApp, /function probeOption\(option\) \{/);
assert.match(tvApp, /if \(event\.event === 'live'\)/);
assert.match(tvApp, /native\('updateWebEngine'\)/);
const webPlayerJava = await read('apps/androidtv/java/com/noctra/tv/NoctraWebPlayerActivity.java');
assert.match(webPlayerJava, /text\.contains\("SyntaxError"\)/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraHomeActivity.java'), /action\.equals\("updateWebEngine"\)/);
// Directs : reprise en douceur ; multiview : lien neuf, nouveaux essais, démarrages échelonnés.
const streamJava = await read('apps/androidtv/java/com/noctra/tv/NoctraStream.java');
assert.match(streamJava, /if \(live && played && softRetries < MAX_SOFT_RETRIES\)/);
assert.match(streamJava, /if \(live && played && !edgeSought && now - bufferingSince > SOFT_STALL_MS\)/);
const multiJava = await read('apps/androidtv/java/com/noctra/tv/NoctraMultiviewActivity.java');
assert.match(multiJava, /private void scheduleRetry\(final Tile tile\)/);
assert.match(multiJava, /\}, i \* 400L\);/);
assert.match(webHost, /Tous les serveurs en échec : nouvel essai/);
// Toutes les chaînes : sources réunies, serveurs de toutes les sources classés par fiabilité.
assert.match(tvApp, /var ALL_SOURCE = \{ id: 'all'/);
assert.match(tvApp, /if \(channel\._entries\) return unifiedOptions\(channel\);/);
assert.match(tvApp, /function expandOptions\(options\) \{/);
assert.match(tvApp, /function serverList\(channel, source, key\) \{/);
assert.match(tvApp, /function channelCountry\(channel\) \{/);
assert.ok(!tvApp.includes('_frenchGuess') && !tvApp.includes('source._french'), 'Pays déduit de la chaîne, jamais de la source entière');
assert.match(tvApp, /if \(word === 'sports'\) return 'sport';/);
assert.match(tvApp, /var NAME_ALIASES = \{/);
assert.match(webPlayerJava, /private WebResourceResponse probePlaylist\(WebResourceRequest request\)/);
assert.match(webPlayerJava, /start\.startsWith\("#EXTM3U"\)/);
assert.match(webPlayerJava, /handler\.postDelayed\(closePopups, 45000\);/);
assert.match(webPlayerJava, /private void scrollPage\(boolean down\)/);
assert.ok(!webPlayerJava.includes('swipe('), 'Plus de glissement tactile au bord (changement de chaîne)');
assert.match(webPlayerJava, /private static boolean isAdVideo\(Uri url\)/);
assert.match(streamJava, /new NoctraCleanDataSource\.Factory\(http\)/);
assert.match(tvApp, /class: 'picker scroll'/);
assert.match(tvApp, /raw = raw\.normalize\('NFKC'\)/);
assert.ok(tvApp.includes("« BEIN SPORTS 1 .b »"), 'Variantes « .b », « .c » réunies');
assert.match(tvApp, /sourceLabel \+= ' · variante '/);
// Moteur web ancien (Chrome 83…) : scripts et pages des lecteurs adaptés par l'appli.
const jsCompat = await read('apps/androidtv/java/com/noctra/tv/NoctraJsCompat.java');
assert.match(jsCompat, /out\.append\("static __noctra_static"\)/);
assert.match(jsCompat, /closers\.add\(new Closer\(depth\)\)/);
assert.match(jsCompat, /d\(Object,'hasOwn'/);
assert.match(webPlayerJava, /WebResourceResponse adaptedResponse = compat \? compatFetch\(request\) : null;/);
assert.match(webPlayerJava, /NoctraJsCompat\.base\(result, finalUrl\)/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraDns.java'), /"jsdelivr\.net"/);
// Arrêt du lecteur web (Android 7 : moteur web dans le processus) : nouvel essai allégé automatique.
assert.match(tvApp, /if \(result\.crashed && !entry\.option\._lite\) \{/);
assert.match(webPlayerJava, /static final String EXTRA_LITE = "noctra_lite";/);
assert.match(webPlayerJava, /private static final String ACLIB_STUB = /);
assert.match(webPlayerJava, /\|\| \(htmlMime && !document\);/, 'Scripts PHP servis en text/html adaptés comme scripts');
assert.match(webPlayerJava, /code == 403 \|\| code == 429 \|\| code == 503/);
assert.match(webPlayerJava, /Onglet publicitaire ignoré/);
assert.match(webPlayerJava, /private static final long CURSOR_IDLE_MS = 3000;/, 'Curseur caché après 3 s sans mouvement');
assert.match(tvApp, /var WEB_MODE_KEY = 'noctra-tv-webmode-v1';/);
// Identité iptv-org (nom officiel, pays), serveurs des autres sources, lancement immédiat.
assert.match(tvApp, /if \(!idCountry \|\| idCountry === \(country \|\| 'fr'\)\) union\(idKey, nameKey\);/);
assert.match(tvApp, /function unifiedTwin\(channel\) \{/);
assert.match(tvApp, /merged\.source = ALL_SOURCE;/, 'TV en direct s’ouvre sur les chaînes réunies');
assert.match(tvApp, /function sourcesSheet\(\) \{/);
assert.match(tvApp, /function logoSlugs\(name\) \{/);
assert.match(tvApp, /var groupOf = unifiedView \? function \(channel\) \{ return channel\.category \|\| 'Autres'; \}/, 'Catégories claires pour les chaînes réunies');
assert.match(tvApp, /var toolbar = h\('div', \{ class: 'live-toolbar' \}, field\.node\);/, 'Barre d’outils compacte de TV en direct');
assert.match(tvApp, /icon\('globe'\), 'Pays : ' \+ countryLabel\(country\)/);
// Logos : liste tv-logos embarquée, monogramme du serveur en dernier recours.
const tvData = await read('apps/androidtv/web/tv-data.js');
assert.match(tvData, /^\/\* Généré par apps\/scripts\/tv-data\.mjs/);
assert.match(tvData, /"logos":"[^"]*\bbein-sports-1-french\b[^"]*\btf1\b/);
assert.match(tvData, /"afrique":"[^"]*\baplusivoire\b/);
assert.match(tvApp, /function serverMonogram\(url\) \{/);
assert.match(tvApp, /img\.naturalWidth === 320 && img\.naturalHeight === 180/);
// Chaînes étrangères hors de « France » (Al Jazeera, Africa 24, A+ Ivoire…).
assert.match(tvApp, /var found = foreignCountry\(name\);/);
assert.match(tvApp, /\[\/\^\(\?:africa \?24\|/);
// Doublons : fautes d'une lettre, « + » détaché, lettre de variante.
assert.match(tvApp, /function oneEdit\(a, b\) \{/);
assert.match(tvApp, /function absorb\(twin, unified\) \{/);
// Fluidité et chargement de « TV en direct ».
assert.match(tvApp, /var unifiedName = remembered\(function \(name\) \{/, 'Règles de noms mises en cache');
assert.match(tvApp, /list\.sort\(function \(a, b\) \{ return a\._sort < b\._sort \? -1 : a\._sort > b\._sort \? 1 : 0; \}\);/, 'Pas de localeCompare sur des milliers de chaînes');
assert.match(tvApp, /if \(side && focusable\(side\) && side\.offsetTop === from\.offsetTop\) best = side;/, 'Grille : voisin direct sans tout mesurer');
assert.match(tvApp, /if \(!document\.body\.contains\(container\) \|\| container\._generation !== generation\) return;/, 'Ancien rendu interrompu');
assert.match(tvApp, /var open = indexedDB\.open\('noctra-tv', 1\);/, 'Catalogues gardés sur le téléviseur');
assert.match(tvApp, /function freshChannel\(entry\) \{/, 'Liens renouvelés au lancement');
assert.match(tvApp, /if \(!job\.retry\) \{ queue\.push\(/, 'Catalogue en échec redemandé');
assert.match(tvApp, /var UNIFIED_WAIT_MS = 12000;/);
assert.match(tvApp, /whenVisible\(node, function \(\) \{\s*loadEpg\(channel\)/, 'Guide demandé pour les chaînes visibles');
assert.match(tvApp, /if \(Date\.now\(\) - lastMove < 700\) \{/, 'Guide en pause pendant la navigation');
assert.match(tvApp, /function proxyImage\(url\) \{/, 'Logos par le serveur Noctra');
// Numéros TNT, LiveWatch dans les chaînes réunies, réserve du direct.
assert.match(tvApp, /var TNT_NUMBERS = \{ tf1: 1, france2: 2, france3: 3, canalplus: 4,/);
assert.match(tvApp, /channels = numberChannels\(channels, country === 'fr'\);/);
assert.match(tvApp, /if \(all\[i\]\._lcn === wanted\) found = all\[i\];/, 'Touches chiffrées : numéro de la chaîne');
assert.match(tvApp, /if \(source && source\.section && source\.section !== 'sports'\) return match;/, 'Chaînes LiveWatch gardées');
assert.match(tvApp, /Variantes LiveWatch : « TF1 · BASIC »/);
assert.match(tvApp, /function groupingDetails\(channels\) \{/);
assert.match(tvApp, /else focusChannelCard\(state\);/);
assert.match(streamJava, /long target = Math\.max\(WINDOW_SAFETY_MS, position - extraOffsetMs\);/, 'Réserve du direct prise après un blocage, sans quitter la fenêtre');
assert.doesNotMatch(streamJava, /setTargetOffsetMs/, 'Démarrage au point prévu par le flux');
assert.match(streamJava, /\.setMinPlaybackSpeed\(1f\)\s*\.setMaxPlaybackSpeed\(1f\)/, 'Direct à vitesse fixe : la réserve reste acquise');
assert.match(streamJava, /private static long extraOffsetMs = 8000;/, 'Réserve agrandie dès le démarrage');
assert.doesNotMatch(streamJava, /NoctraDns\.plainClient\(\)/, 'Direct : connexion HTTP d’origine');
assert.match(streamJava, /String diagnostics\(\) \{/, 'Diagnostic du direct');
assert.match(streamJava, /callback\.onStatus\(this, "Mise en mémoire… " \+ diagnostics\(\)\);/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraCleanDataSource.java'), /static String receptionSummary\(\) \{/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraPlayerActivity.java'), /statsView\.setText\(stream\.diagnostics\(\)\);/);
assert.match(streamJava, /private static final int\[\]\[\] CAPS = \{ \{ 1280, 720 \}, \{ 960, 540 \} \};/);
const compatJava = await read('apps/androidtv/java/com/noctra/tv/NoctraJsCompat.java');
assert.match(compatJava, /String tag = "<script>" \+ POLYFILL \+ HLS_TUNING \+ "<\/script>";/, 'Lecteurs hls.js : réserve plus grande');
assert.match(tvApp, /fillPicker\(sheet, playback, trusted \? 2 : 3\);/, 'Fiabilité des serveurs affichée avant le lancement');
assert.match(tvApp, /function healthText\(option, key, index, provider\) \{/);
// LG webOS et Samsung Tizen : interface Android TV intégrée au paquet (tv/).
const buildTv = await read('apps/scripts/build-tv.mjs');
assert.match(buildTv, /files\.set\('tv\/' \+ relative\(tvRoot, file\)/);
const launcherJs = await read('apps/shared/launcher/launcher.js');
assert.match(launcherJs, /location\.replace\('tv\/index\.html\?platform=' \+ encodeURIComponent\(platform\) \+ '&server=' \+ encodeURIComponent\(base\)\);/);
assert.match(launcherJs, /function apiReachable\(base, done\) \{/);
assert.match(webHost, /var SERVER = String\(params\.get\('server'\) \|\| ''\)/);
assert.match(webHost, /function needsToken\(url\) \{/, 'Flux du serveur Noctra : jeton joint depuis l’appli');
assert.match(webHost, /Player\.diag = el\('div', \{ class: 'nw-diag' \}\);/, 'Journal visible du lecteur LG / Samsung');
assert.match(webHost, /Pas une liste HLS : essai en flux MPEG-TS/);
assert.match(tvApp, /function unavailableHere\(option\) \{/, 'LG / Samsung : lecteurs web du serveur signalés « Indisponible ici »');
assert.match(tvApp, /if \(pass === 1 && candidate && \(candidate\._probeState === 'down' \|\| unavailableHere\(candidate\)\)\) continue;/, 'Bascule : serveurs hors ligne sautés');
assert.match(tvApp, /if \(pass === 0 && !\(candidate && candidate\._probeState === 'up'/, 'Bascule : serveurs vérifiés en ligne d’abord');
assert.match(webHost, /maxBufferSize: 40 \* 1000 \* 1000, backBufferLength: 10,/, 'hls.js : mémoire des téléviseurs');
assert.match(webHost, /capLevelToPlayerSize: true, abrEwmaDefaultEstimate: 6000000/);
assert.match(webHost, /Player\.watch\(limit \|\| \(Player\.m && !Player\.m\.vod \? 12000 : 30000\)\);/);
// Flux MPEG-TS continus (Northlive, Movix, RénéVéo : transport « mpegts ») lus comme tels.
assert.match(tvApp, /function tsTransport\(item\)/);
assert.match(tvApp, /tsTransport\(option\) \|\| tsTransport\(state\.channel\) \? 'video\/mp2t'/);
assert.doesNotMatch(tvApp, /transport === 'ts'/);
// Flux relayé de type inconnu : premiers octets lus (HLS ou MPEG-TS continu).
assert.match(webHost, /function sniffStream\(url, token\)/);
assert.match(webHost, /if \(hls && !hint && url\.indexOf\('\/api\/tv\/stream\/'\) >= 0\)/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraMultiviewActivity.java'), /matches\("\(\?i\)ts\|mpegts\|mpeg-ts"\)/);
// Coupure réseau : pas de second essai long avec l'autre bibliothèque.
assert.match(webHost, /var networkError = Player\.video && Player\.video\.error && Player\.video\.error\.code === 2;/);
assert.match(webHost, /Player\.start\(Player\.currentUrl, Player\.currentMime, 10000\)/);
// LG / Samsung : affichage léger (pas de dégradés plein écran, flou, transitions ; défilement immédiat).
assert.match(await read('apps/androidtv/web/app.css'), /html\.web-host \.aurora \{ display: none; \}/);
// Allègement LG : seules les animations légères (transform/opacity) restent.
assert.match(await read('apps/androidtv/web/app.css'), /html\.web-host \*, html\.web-host \*::before, html\.web-host \*::after \{ transition-property: transform, opacity !important; \}/);
// Sources à en-têtes non relayées par le serveur : indisponibles sur LG/Samsung.
assert.match(tvApp, /referr\?er\|origin\|user-agent\|cookie/);
// Lancement automatique : attend le test du premier serveur.
assert.match(tvApp, /Vérification des serveurs…/);
// Tests : liste, sous-liste et segment ; serveurs automatiques résolus et testés ; résultat dans le classement.
assert.match(tvApp, /function probeResolve\(option\)/);
assert.match(tvApp, /#EXT-X-STREAM-INF/);
assert.match(tvApp, /option\._probeState === 'up' \? -6 \* probeTrust\(option\) \+ probePenalty\(option\) : option\._probeState === 'down' \? 8 : 0/);
// Test des serveurs : vraie vidéo dans le segment, direct qui avance, confiance apprise par fournisseur.
assert.match(tvApp, /function looksLikeMedia\(bytes\)/);
assert.match(tvApp, /'Pas de vidéo' : detail === 'stale' \? 'Direct figé'/);
assert.match(tvApp, /if \(!event\.played\) recordProbe\(option, false\);/);
assert.match(tvApp, /recordProbe\(option, true\);/);
assert.match(tvApp, /function launchBest\(state, index\)/);
assert.match(tvApp, /state\.options\.slice\(0, 12\)/);
assert.match(tvApp, /var probes = probeServers\(sheet, state\);/);
assert.match(tvApp, /if \(LITE_UI && \(Date\.now\(\) - lastMove < 4000/);
assert.match(webHost, /xhrSetup: token \? function \(xhr, address\) \{/);
assert.match(webHost, /headers: token \? \{ 'x-noctra-token': token \} : undefined/);
assert.doesNotMatch(webHost, /label: '[⏯☰⇄💬]/, 'Icônes dessinées dans le lecteur LG / Samsung');
assert.match(tvApp, /function serverOrigin\(\) \{/);
assert.match(serverCode, /if \(path\.startsWith\('\/api\/'\) && req\.headers\.origin\) \{\n\s*res\.setHeader\('access-control-allow-origin', '\*'\);/);
assert.doesNotMatch(serverCode, /access-control-allow-credentials/, 'Pas de cookie lisible depuis une autre origine');
assert.match(tvData, /"iptvLogos":"[^"]*\b13rue i:/);
assert.match(tvApp, /var LOGO_BASE = 'https:\/\/cdn\.jsdelivr\.net\/gh\/tv-logo\/tv-logos@main\/countries\/france\/';/);
assert.match(tvApp, /var sniff = Boolean\(option\.sniff\) && !option\.noSniff && !mode\.noSniff;/);
assert.match(tvApp, /var inPage = root === document && !isMenu\(from\) && main\.contains\(from\);/, '▲ reste dans la page avant la barre d’onglets');
assert.match(tvApp, /if \(playback\.options\.length === 1 && !unavailableHere\(top\)\) \{/);
assert.match(serverCode, /iptvOrgName: match\.name \|\| channel\.iptvOrgName \|\| ''/);
assert.match(serverCode, /Chaînes des bouquets \(Movix, Vavoo…\) : logos et identité iptv-org/);
assert.match(tvApp, /rememberWebMode\(failedOption\.sniffedFrom\.url, 'noSniff'\);/);
assert.match(tvApp, /var country = typeof params\.country === 'string' \? params\.country : 'fr';/);
assert.match(tvApp, /function isEvent\(channel, source\) \{/);
assert.ok(!tvApp.includes('UNIFIED_SECTIONS'), 'Toutes les sources réunies (bouquets et sources sport compris)');
// Numéros de chaîne (0-9) pendant la lecture.
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraPlayerActivity.java'), /KeyEvent\.KEYCODE_0/);
assert.match(webHost, /sendNumber: function \(\) \{/);
// Pont web : fin d'épisode détectée même sans « ended » (épisode suivant automatique).
assert.match(webHost, /Player\.endTimer = setTimeout\(function \(\) \{/);
assert.match(tvApp, /if \(entry && result\.ended && entry\.item\.Type === 'Episode'\) \{ nextEpisode\(entry\.item\); return; \}/);
const livePlayer = await read('apps/androidtv/java/com/noctra/tv/NoctraPlayerActivity.java');
assert.match(livePlayer, /KeyEvent\.KEYCODE_CHANNEL_UP/);
assert.match(livePlayer, /action\.equals\("load"\) && !vod/);
assert.match(livePlayer, /private void renderGuide\(\)/);
// Panneau des chaînes dans le lecteur (bouton « Chaînes », ◀, Menu, Guide).
assert.match(livePlayer, /getIdentifier\("exo_basic_controls", "id", getPackageName\(\)\)/);
assert.match(livePlayer, /private void openPanel\(String mode\)/);
// Serveurs pendant la lecture : panneau, choix manuel, bascule automatique sans quitter le lecteur.
assert.match(livePlayer, /controlButton\("⇄  Serveurs", "servers"\)/);
assert.match(livePlayer, /event\.put\("event", "failed"\)/);
assert.match(tvApp, /if \(event\.event === 'failed'\) \{ playerFailed\(event\); return; \}/);
assert.match(tvApp, /if \(event\.event === 'server'\) \{ pickServer\(Number\(event\.index\) \|\| 0\); return; \}/);
assert.match(livePlayer, /\(action\.equals\("channels"\) \|\| action\.equals\("servers"\)\) && !vod/);
assert.match(tvApp, /if \(event\.event === 'channels'\) \{ sendChannels\(false\); return; \}/);
assert.match(tvApp, /if \(event\.event === 'zapTo'\) \{\n[\s\S]{0,1500}?zapTo\(Number\(event\.index\) \|\| 0\);/);
assert.match(webPlayer, /callback\.proceed\(false\)/);
assert.match(webPlayer, /if \(\+\+crashes == 1 && !finished\) restart\(\);/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraHomeActivity.java'), /message\.put\("log", NoctraWebLog\.tail\(this, 4\)\)/);
assert.match(tvApp, /showPicker\(state, message \|\| '', 0\)/, 'Raison de l’échec affichée même sans autre serveur');
assert.match(await read('apps/androidtv/web/app.css'), /\.premiere-slide\.portrait \.premiere-picture/);
// SyncPlay (absent de Jellyfin Android TV) : protocole Jellyfin, horloge du serveur, lecteur piloté par le groupe.
for (const call of ["syncPost('Join'", "syncPost('New'", "syncPost('Leave')", "syncPost('SetNewQueue'", "syncPost('Ready'", "syncPost('Buffering'", "syncPost('Pause')", "syncPost('Unpause')", "syncPost('Seek'"]) {
  assert.ok(tvApp.includes(call), call);
}
assert.match(tvApp, /'\/GetUtcTime'/);
assert.match(tvApp, /case 'SyncPlayCommand': groupCommand/);
assert.match(tvApp, /function atServerTime\(when, action\)/);
assert.match(tvApp, /'\/socket\?ApiKey='/);
const playerActivity = await read('apps/androidtv/java/com/noctra/tv/NoctraPlayerActivity.java');
assert.match(playerActivity, /if \(sync\) stream\.setAutoplay\(false\);/, 'Départ en pause : le groupe lance la lecture');
assert.match(playerActivity, /event\("user", resume \? "unpause" : "pause", position\)/);
for (const route of ['/api/home/resume', '/api/tv/sources', '/api/tv/catalog?source=', '/api/jellyseerr/search?q=', '/api/jellyseerr/request', '/api/discovery?category=', '/api/roulette?']) {
  assert.ok(tvApp.includes(route), `Accueil TV : ${route}`);
}
const tvCss = await read('apps/androidtv/web/app.css');
assert.ok(!/aspect-ratio|\binset:/.test(tvCss), 'CSS compatible Chromium < 88');

// 6. iOS : WKWebView, messages limités au cadre principal et aux bonnes origines.
const controller = await read('apps/ios/Noctra/WebViewController.swift');
assert.match(controller, /guard message\.frameInfo\.isMainFrame/);
assert.match(controller, /guard fromLauncher \|\| fromServer else \{ return \}/);
assert.match(controller, /NoctraApp\/\\\(version\) \(ios\)/);
assert.match(controller, /isIdleTimerDisabled/);
const plist = await read('apps/ios/Noctra/Info.plist');
assert.match(plist, /<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/);
assert.match(plist, /<key>UIBackgroundModes<\/key>\s*<array>\s*<string>audio<\/string>/);
assert.match(await read('apps/ios/project.yml'), /path: \.\.\/shared\/launcher\n\s+type: folder/);

// 7. Police d'icônes Material Icons restaurée (fichiers corrompus à l'import :
//    en-tête WOFF2 incohérent, d'où les carrés à la place des icônes).
const woff2 = await readFile(new URL('public/client/MaterialIcons-Regular.2d8017489da689caedc1.woff2', root));
assert.equal(woff2.subarray(0, 4).toString('latin1'), 'wOF2');
assert.equal(woff2.readUInt32BE(8), woff2.length, 'Taille WOFF2 cohérente');
const woff = await readFile(new URL('public/client/MaterialIcons-Regular.08cefa1bc6566a650da7.woff', root));
assert.equal(woff.readUInt32BE(8), woff.length, 'Taille WOFF cohérente');
assert.match(await read('public/noctra-theme.css'), /MaterialIcons-Regular\.2d8017489da689caedc1\.woff2\?v=200\.121/);
// Sélecteurs récents rendus sûrs pour les moteurs Chromium 85.
const shell = await read('public/noctra-shell.js');
assert.ok(!shell.includes('.card:is('), 'Pas de :is() (Chromium 88)');
assert.match(shell, /function focusVisible\(element\) \{/);

// Génériques : segments Jellyfin, chapitres, intro apprise ; bouton « Passer » sur tous les lecteurs.
assert.match(tvApp, /jf\('\/MediaSegments\/' \+ item\.Id\)/);
assert.match(tvApp, /function chapterSegments\(item\)/);
assert.match(tvApp, /function learnIntro\(seriesId, startMs, endMs\)/);
assert.match(tvApp, /event\.event === 'introSkip'/);
assert.match(webHost, /skip: function \(\)/);
assert.match(webHost, /'Épisode suivant' : 'Passer le générique'/);
assert.match(webHost, /event: 'introSkip'/);
const playerJava = await read('apps/androidtv/java/com/noctra/tv/NoctraPlayerActivity.java');
assert.match(playerJava, /private void skipSegment\(\)/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraSegments.java'), /public static synchronized List merge\(UUID itemId, UUID seriesId, List found\)/);
assert.match(await read('apps/scripts/build-androidtv.mjs'), /Lcom\/noctra\/tv\/NoctraSegments;->merge/);
// Reprise : position remise sous le seuil de Jellyfin, pages relues après la lecture.
assert.match(tvApp, /function ensureResume\(itemId, positionMs, runtimeMs\)/);
assert.match(tvApp, /'\/UserItems\/' \+ hexId\(itemId\) \+ '\/UserData\?userId='/);
assert.match(tvApp, /refreshTimers = \[2500, 8000\]/);
assert.match(tvApp, /var played = data && data\.jellyfinPlayed;/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraPlayback.java'), /static JSONObject takePlayback\(\)/);
assert.match(webHost, /document\.addEventListener\('visibilitychange'/);
assert.match(webHost, /if \(keepalive\) init\.keepalive = true;/);
// Serveurs TV : rapidité prise en compte, 6 tests à la fois.
assert.match(tvApp, /function probePenalty\(option\)/);
assert.match(tvApp, /for \(var worker = 0; worker < 6; worker\+\+\) next\(\);/);
// Échec après lancement constaté plus vite : refus net (4xx) avant démarrage, délais de démarrage du direct réduits.
assert.match(webHost, /code >= 400 && code < 500 && video\.readyState < 2 && Player\.m && !Player\.m\.vod/);
const streamJavaFast = await read('apps/androidtv/java/com/noctra/tv/NoctraStream.java');
assert.match(streamJavaFast, /LIVE_START_MS = 15000/);
assert.match(streamJavaFast, /attempt == 0 \? LIVE_START_MS : LIVE_RETRY_START_MS/);
assert.match(streamJavaFast, /new DefaultLoadErrorHandlingPolicy\(live && !played \? 3 : 6\)/);
// Doublons : abréviations et anciens noms rapprochés (TF1SF, TCM, Canal+ Family, Nat Geo, France 3 National, OCS Ciné+…).
assert.match(tvApp, /tf1sf: 'tf1seriesfilms', tcm: 'tcmcinema', canalplusfamily: 'canalpluskids'/);
assert.match(tvApp, /key = key\.replace\(\/\^ocs\(\?=cineplus\)\/, ''\);/);
// Pays : marque française (beIN Sports 1-3, Canal+…) avant le pays fourni par la source ou iptv-org (beIN → Qatar).
assert.match(tvApp, /var FRENCH_BRANDS = \/\^\(\?:bein \?sports\? \(\?:max \?\)\?\(\?:\[1-9\]\|10\)\$\|ligue \?1\|tf1\|/);
assert.ok(tvApp.indexOf("if (FRENCH_BRANDS.test(brandName(name))) return 'fr';") < tvApp.indexOf('found = countryOfCode(channel.iptvOrgCountry) || countryOfCode(channel.country)'), 'Marque française avant le pays de la source');
// Coupures régulières sur petits appareils : accueil en sommeil derrière les lecteurs.
const homeJava = await read('apps/androidtv/java/com/noctra/tv/NoctraHomeActivity.java');
// Scripts jamais suspendus (pauseTimers figeait toute l'appli si l'accueil était recréé) ; relancés à chaque retour.
assert.ok(!/\.pauseTimers\(\)/.test(homeJava), 'pauseTimers interdit');
assert.match(homeJava, /if \(webView != null\) webView\.resumeTimers\(\);/);
assert.match(tvApp, /else if \(data\.type === 'hidden'\) \{ if \(data\.hidden\) sleepHome\(Boolean\(data\.deep\)\); else wakeHome\(\); \}/);
assert.match(tvApp, /if \(appHidden \|\| document\.hidden\) \{ sync\(\); return; \}/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraStream.java'), /setBufferDurationsMs\(30000, 60000, 3000, 8000\)/);
// Films : accueil vidé pendant la lecture (mémoire), lecteur des films au choix, diagnostic des coupures.
assert.match(tvApp, /function sleepHome\(deep\)/);
assert.match(tvApp, /function wakeHome\(\)/);
assert.ok(!/function sleepHome[\s\S]{0,300}clear\(main\)/.test(tvApp), 'Accueil jamais vidé pendant un film');
assert.match(tvApp, /'Lecteur des films : ' \+ \(vodPlayer\(\) === 'noctra' \? 'Noctra' : 'standard'\)/);
assert.match(homeJava, /message\.put\("deep", jellyfinPlaying \|\| vodPlaying\);/);
const streamVod = await read('apps/androidtv/java/com/noctra/tv/NoctraStream.java');
assert.match(streamVod, /DataSource\.Factory data = new NoctraCleanDataSource\.Factory\(http\);/);
assert.match(streamVod, /if \(played && now - bufferingSince > 1500 && !edgeSought\) callback\.onStatus\(this, "Mise en mémoire… " \+ diagnostics\(\)\);/);
// Test de connexion depuis l'appareil (Internet, serveur des films).
assert.match(tvApp, /native\('speedTest', \{ targets: targets \}\)/);
assert.match(homeJava, /private JSONObject measure\(String label, String address, long rangeFrom, long rangeTo\)/);
assert.match(homeJava, /private JSONObject measureParallel\(/);
assert.match(tvApp, /parallel: 4, size:/);
assert.match(homeJava, /"speed\.cloudflare\.com"\.equals\(target\.getHost\(\)\) \|\| jellyfin != null \|\| sameOrigin\(target, server\)/);
// Réception lente : pas de reconnexion tant que des données arrivent (1 min au plus).
const streamSlow = await read('apps/androidtv/java/com/noctra/tv/NoctraStream.java');
assert.match(streamSlow, /if \(quiet < SLOW_QUIET_MS && now - bufferingSince < SLOW_WAIT_MS\)/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraCleanDataSource.java'), /lastDataAt = System\.currentTimeMillis\(\);/);
// Segments chargés plusieurs à la fois (films, épisodes, chaînes) ; lecteur Noctra par défaut pour les films.
const prefetchJava = await read('apps/androidtv/java/com/noctra/tv/NoctraPrefetchDataSource.java');
assert.match(prefetchJava, /private static final int AHEAD = 3;/);
assert.match(prefetchJava, /private void schedule\(String url\)/);
assert.match(await read('apps/androidtv/java/com/noctra/tv/NoctraStream.java'), /if \(!compact && !headers\.containsKey\("x-noctra-doh"\)\) http = new NoctraPrefetchDataSource\.Factory\(http, headers, agent\);/);
assert.match(tvApp, /localStorage\.getItem\('noctra-tv-vod-player'\) === 'jellyfin' \? 'jellyfin' : 'noctra'/);
// Films : demandes toujours avec plage d'octets (seedbox lente sans plage) ; test « 1 connexion avec plage ».
assert.ok(!/headers\.put\("Range"/.test(await read('apps/androidtv/java/com/noctra/tv/NoctraStream.java')), 'Plage d’octets forcée retirée (hypothèse démentie)');
assert.match(tvApp, /Le serveur des films envoie de façon irrégulière/);
assert.match(tvApp, /label: 'Serveur des films \(1 connexion avec plage\)', url: address, range: true/);
// Direct : marge mesurée sur un segment entier (durée / temps de chargement) pour classer les serveurs selon la connexion.
assert.match(tvApp, /function timedSegment\(address, duration\)/);
assert.match(tvApp, /option\._probeMargin = body\.complete \? margin : Math\.min\(margin, 0\.9\);/);
assert.match(tvApp, /'En ligne · trop lent ici'/);
console.log('v200.0.121 : applications Android, Android TV, iOS, LG webOS et Samsung Tizen : OK');
