// 200.0.109 — relais des segments TV : délai de préchargement adapté aux longs
// segments et aucun double téléchargement d'un segment en cours de réception.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTvSegmentCache } from '../lib/tv-segment-cache.mjs';

const chunk = Buffer.alloc(188 * 50, 0x47);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const slowBody = (chunks, everyMs) => new ReadableStream({
  async pull(controller) {
    if (!chunks--) return controller.close();
    await delay(everyMs);
    controller.enqueue(new Uint8Array(chunk));
  }
});

// 1. Un segment long qui progresse n'est plus coupé à 6 s fixes : le délai suit la durée.
{
  const cache = createTvSegmentCache();
  let aborted = false;
  const load = async signal => { signal.addEventListener('abort', () => { aborted = true; }, { once: true }); return new Response(slowBody(6, 200), { headers: { 'content-type': 'video/mp2t' } }); };
  const result = await cache.prime('long', load, { deadlineMs: 3_000 });
  assert.ok(result, 'Segment de 1,2 s terminé avant son délai de 3 s');
  assert.equal(result.body.length, chunk.length * 6);
  assert.equal(aborted, false);
  const short = createTvSegmentCache();
  assert.equal(await short.prime('long', async signal => { await delay(10); return new Response(slowBody(6, 250)); }, { deadlineMs: 1_000 }), null, 'Le délai reste borné');
}

// 2. Une demande qui trouve un téléchargement en cours de réception l'attend.
{
  const cache = createTvSegmentCache();
  let loads = 0, aborted = false;
  const load = async signal => { loads++; signal.addEventListener('abort', () => { aborted = true; }, { once: true }); return new Response(slowBody(8, 60)); };
  const pending = cache.prime('live', load, { deadlineMs: 6_000 });
  await delay(150);
  const served = await cache.read('live', 20);
  assert.ok(served, 'Segment servi depuis le préchargement');
  assert.equal(served.body.length, chunk.length * 8);
  assert.equal(loads, 1, 'Un seul téléchargement amont');
  assert.equal(aborted, false);
  await pending;
}

// 3. Un téléchargement bloqué (aucun octet) est toujours abandonné rapidement.
{
  const cache = createTvSegmentCache();
  let aborted = false;
  const pending = cache.prime('stuck', signal => new Promise((_, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancel')); }, { once: true })));
  const started = Date.now();
  assert.equal(await cache.read('stuck', 20), null);
  await pending;
  assert.ok(aborted);
  assert.ok(Date.now() - started < 1_000, 'Pas d’attente sans progression');
}

// 4. Une réception qui dure trop rend la main dans la limite prévue (TTFB client).
{
  const cache = createTvSegmentCache({ maxDemandWaitMs: 300 });
  const pending = cache.prime('slow', async () => new Response(slowBody(100, 40)), { deadlineMs: 10_000 });
  await delay(100);
  const started = Date.now();
  assert.equal(await cache.read('slow', 20), null);
  assert.ok(Date.now() - started < 700);
  await pending;
}

// 5. Le serveur transmet un délai proportionnel à la durée du segment.
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
assert.match(server, /Math\.min\(20_000, Math\.max\(6_000, Math\.round\(Number\(segment\.duration \|\| 0\) \* 1_500\)\)\)/);
assert.match(server, /\), \{ deadlineMs \}\);/);

console.log('v200.0.109 : préchargement TV adapté aux longs segments, sans double téléchargement : OK');
