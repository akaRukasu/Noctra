// 200.0.110 — relais TV partagé en direct, réponse HEAD aux sondes de type
// Shaka, et bouton Accueil du dock synchronisé avec la page affichée.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createTvSegmentCache } from '../lib/tv-segment-cache.mjs';

const chunk = Buffer.alloc(188 * 40, 0x47);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const slowBody = (count, everyMs) => new ReadableStream({
  async pull(controller) { if (!count--) return controller.close(); await delay(everyMs); controller.enqueue(new Uint8Array(chunk)); }
});
const collect = async stream => { const parts = []; for await (const part of stream) parts.push(Buffer.from(part)); return Buffer.concat(parts); };

// 1. Une demande rejoint le préchargement en cours : un seul téléchargement amont,
//    octets déjà reçus puis suivants, segment complet.
{
  const cache = createTvSegmentCache();
  let loads = 0;
  const pending = cache.prime('seg', async () => { loads++; return new Response(slowBody(10, 40), { headers: { 'content-type': 'video/mp2t' } }); }, { deadlineMs: 20_000 });
  await delay(130);
  const shared = await cache.attach('seg');
  assert.ok(shared, 'Préchargement partagé');
  assert.equal(shared.type, 'video/mp2t');
  const body = await collect(shared.stream);
  assert.equal(body.length, chunk.length * 10, 'Segment complet transmis');
  assert.equal(loads, 1, 'Un seul téléchargement chez le fournisseur');
  assert.ok(await pending, 'Le segment reste aussi en mémoire');
}

// 2. Le délai spéculatif ne coupe plus un préchargement qui sert un lecteur.
{
  const cache = createTvSegmentCache();
  void cache.prime('long', async () => new Response(slowBody(12, 100)), { deadlineMs: 1_000 });
  await delay(150);
  const shared = await cache.attach('long');
  assert.ok(shared);
  assert.equal((await collect(shared.stream)).length, chunk.length * 12, 'Transfert mené à terme au-delà du délai spéculatif');
}

// 3. Pas de préchargement, ou fournisseur muet : rien à partager, repli normal.
{
  const cache = createTvSegmentCache();
  assert.equal(await cache.attach('none'), null);
  void cache.prime('mute', signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('x')), { once: true })));
  const started = Date.now();
  assert.equal(await cache.attach('mute', { waitMs: 200 }), null);
  assert.ok(Date.now() - started < 600);
  cache.clear();
}

// 4. Une page d'erreur HTML n'est jamais transmise au lecteur.
{
  const cache = createTvSegmentCache();
  void cache.prime('html', async () => new Response('<html>erreur</html>', { headers: { 'content-type': 'video/mp2t' } }));
  assert.equal(await cache.attach('html', { waitMs: 300 }), null);
}

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const slice = (start, end) => server.slice(server.indexOf(start), server.indexOf(end, server.indexOf(start)));

// 5. HEAD : type annoncé localement, sans appel au fournisseur ; inconnu → 405 (repli GET Shaka).
{
  const helpers = slice('function tvMediaTypeFromUrl(', '\nasync function proxyTvStream');
  const references = new Map([
    ['ts', { url: 'https://cdn.test/live/seg-1.ts?sig=1', expiresAt: Date.now() + 60_000 }],
    ['m4s', { url: 'https://cdn.test/live/seg-1.m4s', expiresAt: Date.now() + 60_000 }],
    ['odd', { url: 'https://cdn.test/live/seg-1.png', expiresAt: Date.now() + 60_000 }],
    ['old', { url: 'https://cdn.test/live/seg-1.ts', expiresAt: Date.now() - 1 }]
  ]);
  const head = new Function('tvReferences', 'tvSegmentCache', `${helpers};return headTvStream;`)(references, { get: () => null });
  const response = () => { const res = {}; res.writeHead = (status, headers) => { res.status = status; res.headers = headers; }; res.end = body => { res.body = body; }; return res; };
  const check = (token, status, type) => { const res = response(); head(token, res); assert.equal(res.status, status, token); if (type) assert.equal(res.headers['content-type'], type); assert.equal(res.body, undefined, 'HEAD sans corps'); };
  check('ts', 200, 'video/mp2t');
  check('m4s', 200, 'video/mp4');
  check('odd', 405);
  check('old', 410);
  check('missing', 410);
  assert.match(server, /path\.startsWith\('\/api\/tv\/stream\/'\) && req\.method === 'HEAD'/);
}

// 6. Le relais sert un segment prêt, rejoint un préchargement, sinon passe par le fournisseur.
{
  const proxySource = slice('async function proxyTvStream(', '\nasync function readJsonBody');
  const cache = createTvSegmentCache();
  const refs = new Map(['live', 'miss'].map(key => [key, { url: 'https://cdn.test/media.ts', headers: {}, expiresAt: Date.now() + 60_000, meta: { finiteSegment: true } }]));
  let upstream = 0;
  const proxy = new Function('tvReferences', 'HttpError', 'tvSegmentCache', 'safeTvRemoteUrl', 'fetchTvRemoteUntilHeaders', 'pipeRemoteResponseBody', `${proxySource};return proxyTvStream;`)(
    refs, Error, cache, v => new URL(v), async () => { upstream++; return new Response(chunk); }, async (response, res) => res.end(Buffer.from(await response.arrayBuffer())));
  const res = () => {
    const out = new EventEmitter(); const parts = [];
    out.writeHead = (status, headers) => { out.status = status; out.headers = headers; };
    out.write = part => { parts.push(Buffer.from(part)); return true; };
    out.end = part => { if (part) parts.push(Buffer.from(part)); out.body = Buffer.concat(parts); out.emit('finish'); };
    out.on('unpipe', () => {}); out.once = out.once.bind(out);
    return out;
  };
  void cache.prime('live', async () => new Response(slowBody(6, 40), { headers: { 'content-type': 'video/mp2t' } }), { deadlineMs: 10_000 });
  await delay(100);
  const shared = res();
  const finished = new Promise(resolve => shared.once('finish', resolve));
  await proxy('live', { headers: {} }, shared);
  await finished;
  assert.equal(shared.headers['x-noctra-relay'], 'memory-stream');
  assert.equal(shared.body.length, chunk.length * 6);
  assert.equal(upstream, 0, 'Aucun second téléchargement');
  const again = res(); await proxy('live', { headers: {} }, again);
  assert.equal(again.headers['x-noctra-relay'], 'memory-hit');
  const miss = res(); await proxy('miss', { headers: {} }, miss);
  assert.equal(upstream, 1, 'Sans préchargement : chemin fournisseur habituel');
}

// 7. Dock : Accueil suit la page affichée et s'éteint à l'ouverture d'un panneau.
{
  const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
  assert.match(shell, /homeDockButton\.dataset\.active = String\(home\);/);
  const panelSource = shell.slice(shell.indexOf('  function panel(title'), shell.indexOf('\n  }', shell.indexOf('  function panel(title')));
  assert.match(panelSource, /data-noctra="home"\]'\)\?\.setAttribute\('data-active', 'false'\)/);
}

console.log('v200.0.110 : relais partagé, HEAD Shaka sans retéléchargement et Accueil synchronisé : OK');
