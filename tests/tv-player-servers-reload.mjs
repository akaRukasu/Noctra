import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')); }

// Noctra TV 1.1.56 (Android TV noctra.76) : menu « Serveurs » du lecteur et
// changement de serveur, y compris après un rechargement de l'accueil pendant la
// lecture (projecteur à court de mémoire : page recréée, chaîne oubliée, menu vide).
const web = new URL('../apps/androidtv/web/', import.meta.url).pathname;
// Android TV noctra.77 : plus d'avance sur le direct (marge de fenêtre 4 s), reprise
// après une erreur passagère à la même position (avance gardée), fenêtre et retard
// affichés dans le diagnostic.
const streamJava = await readFile(new URL('../apps/androidtv/java/com/noctra/tv/NoctraStream.java', import.meta.url), 'utf8');
assert.match(streamJava, /private static final long WINDOW_SAFETY_MS = 4000;/);
assert.match(streamJava, /softRetries\+\+;\s*callback\.onStatus\(this, "Reprise du flux…"\);\s*try \{\s*player\.prepare\(\);/, 'reprise sans retour au bord du direct');
assert.match(streamJava, /\.append\(" · fenêtre "\)\.append\(window \/ 1000\)\.append\(" s · retard "\)/);
assert.match(await readFile(new URL('../apps/scripts/build-androidtv.mjs', import.meta.url), 'utf8'), /const noctraRevision = (7[7-9]|[89]\d|\d{3});/);
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };
const json = (res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  if (p.startsWith('/noctra/tv-app/')) { try { const f = p.slice(15) || 'index.html'; res.writeHead(200, { 'content-type': types[extname(f)] || 'text/plain' }); res.end(await readFile(join(web, f))); } catch { res.writeHead(404); res.end(); } return; }
  if (p === '/noctra/api/tv/sources') return json(res, { sources: [{ id: 's1', name: 'Direct', section: 'channels' }, { id: 's2', name: 'LiveWatch', section: 'channels' }] });
  if (p === '/noctra/api/tv/catalog') {
    const s = url.searchParams.get('source');
    return json(res, { channels: s === 's1' ? [{ name: 'TF1', country: 'fr', playbackType: 'stream', streamUrl: '/noctra/api/tv/stream/a' }] : [{ name: 'TF1', country: 'fr', playbackType: 'resolver', resolverUrl: '/api/tv/resolve/lw' }] });
  }
  if (p === '/noctra/api/tv/resolve/lw') return json(res, { options: [{ playbackType: 'stream', streamUrl: '/noctra/api/tv/stream/b', label: 'Basic' }, { playbackType: 'stream', streamUrl: '/noctra/api/tv/stream/c', label: 'VIP' }] });
  if (p.endsWith('.ts')) { const ts = Buffer.alloc(188 * 40); for (let i = 0; i < ts.length; i += 188) ts[i] = 0x47; res.writeHead(200, { 'content-type': 'video/mp2t' }); res.end(ts); return; }
  if (p.startsWith('/noctra/api/tv/stream/')) { res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' }); res.end(`#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:${Math.floor(Date.now() / 2000)}\n#EXTINF:4,\nseg${Math.floor(Date.now() / 2000)}.ts\n`); return; }
  if (p.startsWith('/noctra/')) return json(res, {});
  if (p === '/jellyfin/Users/Me') return json(res, { Name: 'Lucas', Id: 'user1' });
  json(res, { Items: [], TotalRecordCount: 0 });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await playwright.chromium.launch();
const errors = [];
const attach = page => page.evaluate((o) => {
  const channel = new MessageChannel();
  window.__native = [];
  channel.port2.onmessage = m => { const d = JSON.parse(m.data); window.__native.push(d); if (d.action === 'hello') channel.port2.postMessage(JSON.stringify({ type: 'session', token: 't', userId: 'user1', userName: 'Lucas', noctraUrl: o + '/noctra', jellyfinUrl: o + '/jellyfin', caps: { webPlayer: true } })); };
  window.__host = channel.port2;
  window.NoctraAttachHost(channel.port1);
}, origin);
const ask = page => page.evaluate(() => { window.__host.postMessage(JSON.stringify({ type: 'playerEvent', event: 'servers' })); });
const replies = page => page.evaluate(() => window.__native.filter(d => d.command === 'servers').map(d => ({ current: d.current, names: d.items.map(i => i.name) })));
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(e.message));
  const url = origin + '/noctra/tv-app/index.html#token=t&user=user1&name=Lucas&jellyfin=' + encodeURIComponent(origin + '/jellyfin');
  await page.goto(url);
  await attach(page);
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#nav .nav[data-section="live"]').click());
  await page.waitForFunction(() => [...document.querySelectorAll('#main .card')].some(c => /TF1/.test(c.textContent)), null, { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('#main .card')].find(c => /TF1/.test(c.textContent)).click());
  await page.waitForFunction(() => document.querySelectorAll('.server').length === 3, null, { timeout: 20000 });
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.server .name')].map(n => n.textContent)), ['Direct · Flux direct', 'LiveWatch · Basic', 'LiveWatch · VIP'], 'vrais serveurs des sources');
  await page.evaluate(() => document.querySelectorAll('.server')[1].click());
  await page.waitForTimeout(400);
  const play = await page.evaluate(() => window.__native.filter(d => d.action === 'play').pop());
  assert.ok(play && /\/stream\/b/.test(play.url), 'lecture de « LiveWatch · Basic »');
  await ask(page);
  await page.waitForTimeout(300);
  assert.deepEqual((await replies(page)).pop(), { current: 1, names: ['Direct · Flux direct', 'LiveWatch · Basic', 'LiveWatch · VIP'] }, 'menu « Serveurs » rempli');

  // Accueil rechargé pendant la lecture : la chaîne et ses serveurs sont repris.
  await page.reload();
  await attach(page);
  await page.waitForTimeout(1200);
  await ask(page);
  await page.waitForTimeout(400);
  assert.deepEqual((await replies(page)).pop(), { current: 1, names: ['Direct · Flux direct', 'LiveWatch · Basic', 'LiveWatch · VIP'] }, 'menu « Serveurs » après rechargement');
  // Coupures répétées après le rechargement : les autres serveurs (jamais testés
  // ici) sont vérifiés, puis le lecteur passe sur l'un d'eux.
  const current = await page.evaluate(() => JSON.parse(localStorage.getItem('noctra-tv-playback-v1')).playId);
  await page.evaluate(id => window.__host.postMessage(JSON.stringify({ type: 'playerEvent', event: 'struggling', playSessionId: id })), current);
  await page.waitForFunction(() => window.__native.some(d => d.command === 'load'), null, { timeout: 15000 });
  const switched = await page.evaluate(() => window.__native.filter(d => d.command === 'load').pop().url);
  assert.ok(/\/stream\/[ac]$/.test(switched), 'coupures répétées : passage sur un autre serveur vérifié (' + switched + ')');
  assert.ok(await page.evaluate(() => window.__native.some(d => d.command === 'zapping' && /Coupures répétées/.test(d.message))));
  // 1.1.58 : coupures répétées juste après ce changement : on reste (5 min) ;
  // source figée (« liste figée ») 1 min plus tard : autre serveur aussitôt.
  const loads = () => page.evaluate(() => window.__native.filter(d => d.command === 'load').length);
  const before = await loads();
  const id2 = await page.evaluate(() => JSON.parse(localStorage.getItem('noctra-tv-playback-v1')).playId);
  await page.evaluate(id => window.__host.postMessage(JSON.stringify({ type: 'playerEvent', event: 'struggling', playSessionId: id })), id2);
  await page.waitForTimeout(1500);
  assert.equal(await loads(), before, 'pas de nouveau changement 5 min durant');
  await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 60000; });
  await page.evaluate(id => window.__host.postMessage(JSON.stringify({ type: 'playerEvent', event: 'struggling', frozen: true, playSessionId: id })), id2);
  await page.waitForFunction(n => window.__native.filter(d => d.command === 'load').length > n, before, { timeout: 15000 });
  // Serveur choisi dans le lecteur : chargé sans repasser par l'accueil.
  await page.evaluate(() => window.__host.postMessage(JSON.stringify({ type: 'playerEvent', event: 'server', index: 2 })));
  await page.waitForTimeout(500);
  const load = await page.evaluate(() => window.__native.filter(d => d.command === 'load').pop());
  assert.ok(load && /\/stream\/c$/.test(load.url), 'changement de serveur après rechargement (« LiveWatch · VIP »)');
  // Lecteur fermé : plus rien à reprendre.
  const playId = await page.evaluate(() => JSON.parse(localStorage.getItem('noctra-tv-playback-v1')).playId);
  await page.evaluate(id => window.__host.postMessage(JSON.stringify({ type: 'playerClosed', ok: true, played: true, playSessionId: id })), playId);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => localStorage.getItem('noctra-tv-playback-v1')), null, 'chaîne oubliée à la fermeture du lecteur');
  assert.deepEqual(errors, []);
} finally { await browser.close(); server.close(); }
console.log('Noctra TV 1.1.56 : menu « Serveurs » et changement de serveur, même après un rechargement de l’accueil pendant la lecture : OK');
