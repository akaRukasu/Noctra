// Demandes : rangement par catégorie (animés, séries, films d'animation, films), validation avec destination, trackers patients.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const tracker = await readFile(new URL('../lib/tracker-search.mjs', import.meta.url), 'utf8');
assert.match(server, /async function mediaCategoryFor\(mediaType, tmdbId\)/);
assert.match(server, /function folderForMediaCategory\(paths, category, fallback = ''\)/);
assert.match(server, /method: 'PUT',/, 'validation : destination écrite dans la demande Jellyseerr');
assert.match(server, /suggested: \{ category, label: mediaCategoryLabels\[category\], path: folderForMediaCategory/);
assert.match(server, /patient: requestUrl\.searchParams\.get\('patient'\) === '1'/);
assert.match(tracker, /patient \? 60_000 : \(exhaustive \? 18_000 : 9_000\)/);

const start = server.indexOf('const mediaCategoryFolderPatterns');
const end = server.indexOf('const mediaCategoryLabels');
const folderForMediaCategory = new Function(`${server.slice(start, end)}; return folderForMediaCategory;`)();
const radarr = ['/home/u/media/Films', '/home/u/media/Films_D_Animation', '/home/u/media/Trash'];
const sonarr = ['/home/u/media/Séries', '/home/u/media/Animes'];
assert.equal(folderForMediaCategory(radarr, 'animation'), '/home/u/media/Films_D_Animation');
assert.equal(folderForMediaCategory(radarr, 'films'), '/home/u/media/Films');
assert.equal(folderForMediaCategory(sonarr, 'animes'), '/home/u/media/Animes');
assert.equal(folderForMediaCategory(sonarr, 'series'), '/home/u/media/Séries');
assert.equal(folderForMediaCategory(['/home/u/media/Trash', '/home/u/media/Films'], 'unknown'), '/home/u/media/Films', 'jamais Trash par défaut');
console.log('Demandes : destinations par catégorie vérifiées.');

// Déplacements et stockage (administrateurs).
assert.match(server, /async function moveMediaEntry\(rootId, relativePath, targetRootId, targetPath = ''\)/);
assert.match(server, /error\?\.code !== 'EXDEV'/, 'déplacement entre disques : copie puis suppression');
assert.match(server, /path === '\/api\/files\/move'/);
assert.match(server, /path === '\/api\/files\/storage'/);
assert.match(server, /moveFiles=true/, 'Radarr/Sonarr déplacent eux-mêmes les fichiers');
const qStart = server.indexOf('function parseQuotaOutput');
const qEnd = server.indexOf('const mediaRootSizeCache');
const parseQuotaOutput = new Function(`${server.slice(qStart, qEnd)}; return parseQuotaOutput;`)();
const quota = parseQuotaOutput('Disk quotas for user u (uid 1000):\n     Filesystem  blocks   quota   limit   grace   files   quota   limit   grace\n      /dev/md0 1048576* 2097152 2202009       0    12       0       0       0\n');
assert.deepEqual(quota, { used: 1073741824, limit: 2147483648, free: 1073741824, filesystem: '/dev/md0' });
assert.equal(parseQuotaOutput('quota: no limited resources'), null);
console.log('Déplacements et stockage vérifiés.');

// Variantes LiveWatch d'une chaîne, sans vérification (liste des serveurs des applis).
assert.match(server, /path\.startsWith\('\/api\/tv\/livewatch\/variants\/'\)/);
assert.ok(server.indexOf("'/api/tv/livewatch/variants/'") < server.indexOf("path.startsWith('/api/tv/livewatch/resolve/')"), 'route des variantes avant le résolveur');
console.log('Variantes LiveWatch vérifiées.');

// LiveWatch VIP : en-têtes du lecteur dans un navigateur quand l'API refuse (401/403).
assert.match(server, /function switchLiveWatchClientMode\(\)/);
assert.match(server, /if \(attempt === 1\) liveWatchClientMode = \{ browser: !liveWatchClientMode\.browser/);
assert.match(server, /if \(\[401, 403\]\.includes\(status\)\) switchLiveWatchClientMode\(\);/);
assert.match(server, /stream = \{ ok: true, client:/, 'diagnostic : flux VIP direct testé');
console.log('LiveWatch VIP : repli navigateur vérifié.');

// Diagnostic VIP : chaîne choisie et réponse brute de l'API LiveWatch, jetons masqués.
assert.match(server, /async function liveWatchStreamApiProbe\(kindValue, idValue\)/);
assert.match(server, /async function liveWatchChannelDiagnostic\(referenceValue\)/);
assert.match(server, /liveWatchVipDiagnostics\(requestUrl\.searchParams\.get\('ref'\) \|\| ''\)/);
assert.match(server, /'\[jeton\]'/);
console.log('Diagnostic LiveWatch VIP vérifié.');
