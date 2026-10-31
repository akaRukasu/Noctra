import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTvSegmentCache } from '../lib/tv-segment-cache.mjs';

// 200.0.158 (Android TV noctra.78) : diagnostic « dernier segment 23,5 s (146 Ko),
// 3 segments relancés, retard 38 s sur une fenêtre de 38 s ». Les relances de
// l'appli rejoignaient le même téléchargement bloqué du serveur : elles ne
// servaient à rien. Un préchargement muet depuis 3 s n'est plus rejoint, une
// relance de l'appli (x-noctra-hedge) l'abandonne et redemande la source.

let now = 1_000;
const clock = () => now;
const flush = () => new Promise(resolve => setImmediate(resolve));

// Source qui envoie un premier morceau puis se tait (connexion bloquée).
function stuckResponse(signal) {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(188).fill(0x47));
      signal.addEventListener('abort', () => { try { controller.error(new Error('aborted')); } catch {} });
    }
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'video/mp2t' } });
}

{
  const cache = createTvSegmentCache({ clock });
  let aborted = false;
  const primed = cache.prime('seg', async signal => { signal.addEventListener('abort', () => { aborted = true; }); return stuckResponse(signal); }, { deadlineMs: 20_000 });
  for (let i = 0; i < 5; i++) await flush();
  // Octets reçus il y a moins de 3 s : la demande rejoint le téléchargement.
  now += 1_000;
  const joined = await cache.attach('seg');
  assert.ok(joined, 'téléchargement actif rejoint');
  joined.stream.destroy();
  // Plus aucun octet depuis plus de 3 s : pas rejoint, téléchargement abandonné.
  now += 3_500;
  assert.equal(await cache.attach('seg'), null, 'téléchargement bloqué non rejoint');
  assert.equal(aborted, true, 'téléchargement bloqué abandonné');
  assert.equal(await primed, null);
}

{
  const cache = createTvSegmentCache({ clock });
  let aborted = false;
  const primed = cache.prime('seg2', async signal => { signal.addEventListener('abort', () => { aborted = true; }); return stuckResponse(signal); }, { deadlineMs: 20_000 });
  for (let i = 0; i < 5; i++) await flush();
  cache.abort('seg2');
  assert.equal(aborted, true, 'relance : préchargement abandonné');
  assert.equal(await primed, null);
  cache.abort('inconnu');
}

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
assert.equal((server.match(/req\??\.headers(\?\.)?\['x-noctra-hedge'\]/g) || []).length, 2, 'relais direct et LiveWatch');
assert.match(server, /if \(relaunch\) tvSegmentCache\.abort\?\.\(String\(token\)\);\s*if \(reference\.meta\?\.finiteSegment && !req\.headers\.range && !relaunch\)/);
assert.match(server, /if \(!req\?\.headers\?\.range && typeof tvSegmentCache !== 'undefined' && !relaunch\) \{\s*const shared = await tvSegmentCache\.attach\?\.\(cacheKey\);/);

const prefetch = await readFile(new URL('../apps/androidtv/java/com/noctra/tv/NoctraPrefetchDataSource.java', import.meta.url), 'utf8');
assert.match(prefetch, /fetch\(address, fresh, true\)/);
assert.match(prefetch, /fetch\(candidate, entry, false\)/);
assert.match(prefetch, /if \(relaunch\) connection\.setRequestProperty\("x-noctra-hedge", "1"\);/);
const stream = await readFile(new URL('../apps/androidtv/java/com/noctra/tv/NoctraStream.java', import.meta.url), 'utf8');
assert.match(stream, /long margin = Math\.max\(WINDOW_SAFETY_MS, window \/ 4\);\s*long target = Math\.max\(margin, position - extraOffsetMs\);/);
assert.match(await readFile(new URL('../apps/scripts/build-androidtv.mjs', import.meta.url), 'utf8'), /const noctraRevision = (7[89]|[89]\d|\d{3});/);
for (const [file, pattern] of [['../package.json', /"version": "200\.0\.(15[89]|1[6-9]\d|[2-9]\d\d)"/], ['../public/noctra-shell.js', /NOCTRA_BUILD_VERSION = '200\.0\.(15[89]|1[6-9]\d|[2-9]\d\d)'/]]) {
  assert.match(await readFile(new URL(file, import.meta.url), 'utf8'), pattern);
}

console.log('v200.0.158 : segment bloqué jamais rejoint, relance de l’appli redemandée à la source, marge d’un quart de fenêtre : OK');
