// 200.0.151 — Optimisations de performance, stabilité mémoire et durcissement sécurité issus de l'audit.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [pkgText, server, shell, unified, mosaic, segCache, castKt, multiviewKt, castSwift, multiviewSwift, mainJava, iosWorkflow] = await Promise.all([
  read('package.json'),
  read('server.mjs'),
  read('public/noctra-shell.js'),
  read('public/noctra-tv-unified.js'),
  read('lib/tv-mosaic.mjs'),
  read('lib/tv-segment-cache.mjs'),
  read('apps/android-native/app/src/main/java/com/noctra/mobile/cast/Cast.kt'),
  read('apps/android-native/app/src/main/java/com/noctra/mobile/live/Multiview.kt'),
  read('apps/ios-native/Noctra/Sources/Cast.swift'),
  read('apps/ios-native/Noctra/Sources/Multiview.swift'),
  read('apps/android/app/src/main/java/com/noctra/app/MainActivity.java'),
  read('.github/workflows/noctra-ios-native.yml')
]);

const pkg = JSON.parse(pkgText);
// 200.0.152 ou suivante (200.0.153 la reprend).
const release = /^200\.0\.(?:15[2-9]|1[6-9]\d)$/;
assert.match(pkg.version, release);
assert.match(server.match(/version: '([^']+)'/)?.[1] || '', release);
assert.match(shell.match(/const NOCTRA_BUILD_VERSION = '([^']+)';/)?.[1] || '', release);

// 0. 200.0.152 : support HEAD sur les segments HLS LiveWatch, cache de variante 1-saut, préchargement mémoire, anti-blocage Shaka, Streamonsport & Volkamax bzh.lat
assert.match(server, /function headLiveWatchVipHls\(/, 'Réponse HEAD instantanée sur les ressources HLS LiveWatch pour Shaka');
assert.match(server, /if \(path\.startsWith\('\/api\/tv\/livewatch\/hls\/'\) && \['GET', 'HEAD'\]\.includes\(req\.method\)\)/, 'Route /api/tv/livewatch/hls/ ouverte aux requêtes HEAD de Shaka');
assert.match(server, /const liveWatchVariantUrlCache = new Map\(\);/, 'Cache d’URL de variante HLS LiveWatch évitant de recharger le master à chaque refresh');
assert.match(shell, /if \(currentBuffered >= 5 && now - startupLastGrowthAt >= 2_200\) return resolve\(\);/, 'Démarrage sans attente de 20 s lorsque la fenêtre du direct plafonne à un segment');
assert.match(shell, /!options\[initialOptionIndex\]\?\.verified/, 'Pas de re-sonde client de 4 s quand le serveur principal vient d’être vérifié par le backend');
assert.ok(server.includes("id: 'volkamax-sports', name: 'Volkamax', section: 'sports', description: 'BZH / Volkamax · catégories et chaînes sportives', url: 'https://bzh.lat/'"), 'Volkamax mis à jour vers https://bzh.lat/');
assert.ok(server.includes("id: 'brigitte-sports', name: 'Streamonsport', section: 'sports', description: 'Programme Streamonsport · lecteur du fournisseur', url: 'https://choc2foot.biz/'"), 'BrigitteTV remplacé par Streamonsport (https://choc2foot.biz/)');
assert.ok(shell.includes("'bzh.lat'") && shell.includes("'choc2foot.biz'") && shell.includes("'Streamonsport'"), 'Client autorisant bzh.lat, choc2foot.biz et Streamonsport');

// 1. Compression JSON asynchrone non bloquante + faucheur de caches mémoire bornés
assert.match(server, /gzip\(raw, \{ level: 4 \}, \(error, compressed\) =>/, 'Compression gzip asynchrone non bloquante pour les gros catalogues JSON');
assert.match(server, /function pruneBoundedMap\(map, maxEntries, now = Date\.now\(\)\)/, 'Éviction périodique bornée des caches en mémoire');
assert.match(server, /const runtimeCacheReaper = setInterval\(/, 'Faucheur périodique des caches serveur');

// 2. Durcissement sécurité (SSRF IPv6/redirections, Path Traversal sep, bypass /api/libraries, CSP bridges)
assert.match(server, /if \(url\.origin !== original\.origin\) await assertPublicTvUrl\(url\.toString\(\)\);/, 'Validation SSRF sur les redirections Prowlarr externes');
assert.match(server, /filePath !== publicRoot && !filePath\.startsWith\(`\$\{publicRoot\}\$\{sep\}`\)/, 'Protection Path Traversal stricte avec séparateur dans serveStatic');
assert.ok(!server.includes("path === '/api/libraries' || path.startsWith('/api/jellyfin/image/')"), 'Suppression du contournement sans jeton sur /api/libraries');
assert.match(server, /'content-security-policy': "frame-ancestors 'self'"/, 'CSP frame-ancestors self sur les ponts TV');

// 3. Mosaïque FFmpeg (SIGKILL de secours) & cache de segments TV (plafond maxAttachMs)
assert.match(mosaic, /function terminateProcess\(proc\)/, 'Arrêt propre SIGTERM + filet SIGKILL des processus FFmpeg');
assert.match(mosaic, /proc\.kill\('SIGKILL'\)/, 'Filet SIGKILL contre les processus FFmpeg zombies');
assert.match(segCache, /async attach\(key, \{ waitMs = 4_500, maxAttachMs = 45_000(, stalledMs = 3_000)? \} = \{\}\)/, 'Plafond maximal de durée sur attach()');

// 4. Sonde TV unifiée (Range bytes=0-65535 + annulation du flux) & Multiview Shaka
assert.match(unified, /Range: 'bytes=0-65535'/, 'Sonde des segments TS limitée aux premiers 64 Ko');
assert.match(unified, /function cancelBody\(response\)/, 'Fermeture immédiate du flux de sonde après lecture des en-têtes');
assert.match(shell, /mainShakaSuspended: false/, 'Suivi de la suspension du lecteur Shaka principal pendant le Multiview');
assert.match(shell, /tvShaka\.unload\?\.\(\)/, 'Suspension réseau de Shaka en arrière-plan lors de l’ouverture du Multiview');

// 5. Applications mobiles/TV (arrêt mDNS/Bonjour Chromecast, sécurisation Intent, strip IPA)
assert.match(castKt, /onDispose \{ ChromecastBrowser\.stop\(\) \}/, 'Arrêt mDNS et libération du MulticastLock sur Android');
assert.match(multiviewKt, /onDispose \{ ChromecastBrowser\.stop\(\) \}/, 'Arrêt mDNS à la fermeture de la feuille Multiview Android');
assert.match(castSwift, /\.onDisappear \{ browser\.stop\(\) \}/, 'Arrêt NWBrowser Bonjour sur iOS');
assert.match(multiviewSwift, /\.onDisappear \{ browser\.stop\(\) \}/, 'Arrêt NWBrowser Bonjour à la fermeture du Multiview iOS');
assert.match(mainJava, /intent\.setComponent\(null\);\s*intent\.setSelector\(null\);/, 'Neutralisation Component/Selector sur Intent.parseUri Android TV');
assert.match(iosWorkflow, /xcrun strip -S -x Payload\/Noctra\.app\/Noctra\s+zip -qryX \.\.\/\.\.\/dist\/apps\/Noctra-ios26-unsigned\.ipa/, 'Strip des symboles sur l’IPA non signée iOS');

console.log('200.0.151 : optimisations de performance, mémoire, sécurité et applications vérifiées : OK');
