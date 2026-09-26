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

console.log('v200.0.121 : applications Android, Android TV, iOS, LG webOS et Samsung Tizen : OK');
