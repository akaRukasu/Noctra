import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')); }

// Noctra TV 1.1.59 : la fenêtre des serveurs montre les vrais serveurs de chaque
// source, même d'une source lente (ajoutés à la fenêtre ouverte, jamais
// « Source · automatique ») ; un test raté une fois est refait et n'est jamais
// compté comme un échec de lecture (« 0 réussite » pour un serveur qui lit).
const web = new URL('../apps/androidtv/web/', import.meta.url).pathname;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };
const json = (res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const hits = { b: 0 };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  if (p.startsWith('/noctra/tv-app/')) { try { const f = p.slice(15) || 'index.html'; res.writeHead(200, { 'content-type': types[extname(f)] || 'text/plain' }); res.end(await readFile(join(web, f))); } catch { res.writeHead(404); res.end(); } return; }
  if (p === '/noctra/api/tv/sources') return json(res, { sources: [{ id: 's1', name: 'Direct', section: 'channels' }, { id: 's2', name: 'LiveWatch', section: 'channels' }, { id: 's3', name: 'Lente', section: 'channels' }] });
  if (p === '/noctra/api/tv/catalog') {
    const s = url.searchParams.get('source');
    return json(res, { channels: s === 's1' ? [{ name: 'TF1', country: 'fr', playbackType: 'stream', streamUrl: '/noctra/api/tv/stream/a' }]
      : s === 's2' ? [{ name: 'TF1', country: 'fr', playbackType: 'resolver', resolverUrl: '/api/tv/resolve/lw' }]
      : [{ name: 'TF1', country: 'fr', playbackType: 'resolver', resolverUrl: '/api/tv/resolve/slow' }] });
  }
  if (p === '/noctra/api/tv/resolve/lw') return json(res, { options: [{ playbackType: 'stream', streamUrl: '/noctra/api/tv/stream/b', label: 'Basic' }, { playbackType: 'stream', streamUrl: '/noctra/api/tv/stream/c', label: 'VIP' }] });
  // Source lente : ses serveurs arrivent après le délai de grâce (1,5 s).
  if (p === '/noctra/api/tv/resolve/slow') { await new Promise(r => setTimeout(r, 3500)); return json(res, { options: [{ playbackType: 'stream', streamUrl: '/noctra/api/tv/stream/d', label: 'HD' }, { playbackType: 'stream', streamUrl: '/noctra/api/tv/stream/e', label: 'SD' }] }); }
  // Serveur « Basic » : refus passager au premier test seulement.
  if (p === '/noctra/api/tv/stream/b' && !hits.b++) { res.writeHead(502); res.end(); return; }
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
  // Ancien historique faussé par les tests (v2) présent avant le chargement.
  await page.addInitScript(() => { try { localStorage.setItem('noctra-tv-health-v2', '{"x":{"ok":0,"fail":9}}'); } catch (e) {} });
  const url = origin + '/noctra/tv-app/index.html#token=t&user=user1&name=Lucas&jellyfin=' + encodeURIComponent(origin + '/jellyfin');
  await page.goto(url);
  await attach(page);
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#nav .nav[data-section="live"]').click());
  await page.waitForFunction(() => [...document.querySelectorAll('#main .card')].some(c => /TF1/.test(c.textContent)), null, { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('#main .card')].find(c => /TF1/.test(c.textContent)).click());
  await page.waitForFunction(() => document.querySelectorAll('.server').length >= 3, null, { timeout: 20000 });
  // Compte à rebours arrêté : la fenêtre reste ouverte pour voir arriver la source lente.
  await page.keyboard.press('ArrowDown');
  const names = () => page.evaluate(() => [...document.querySelectorAll('.server .name')].map(n => n.textContent));
  assert.deepEqual(await names(), ['Direct · Flux direct', 'LiveWatch · Basic', 'LiveWatch · VIP'], 'fenêtre ouverte sans attendre la source lente');
  await page.waitForFunction(() => document.querySelectorAll('.server').length === 5, null, { timeout: 15000 });
  const all = await names();
  assert.deepEqual(all.slice(3).sort(), ['Lente · HD', 'Lente · SD'], 'serveurs de la source lente ajoutés à la fenêtre ouverte');
  assert.ok(!all.some(name => /automatique/i.test(name)), 'aucun serveur « automatique »');
  // Tests terminés : « Basic » (refus passager puis réponse) est en ligne.
  await page.waitForFunction(() => document.querySelectorAll('.server .tag.probe, .server .tag.good, .server .tag.bad, .server .tag.warn').length && ![...document.querySelectorAll('.server')].some(b => /Test…/.test(b.textContent)), null, { timeout: 20000 });
  const basic = await page.evaluate(() => [...document.querySelectorAll('.server')].find(b => /LiveWatch · Basic/.test(b.textContent)).textContent);
  assert.match(basic, /En ligne/, 'test raté une fois puis refait : en ligne');
  assert.ok(hits.b >= 2, 'test refait');
  const health = await page.evaluate(() => ({ v2: localStorage.getItem('noctra-tv-health-v2'), v3: JSON.parse(localStorage.getItem('noctra-tv-health-v3') || '{}') }));
  assert.equal(health.v2, null, 'ancien historique (faussé par les tests) effacé');
  assert.ok(Object.values(health.v3).every(entry => !entry.fail), 'aucun échec compté sans lecture');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.server .tag.stat')].every(t => /Jamais essayé|Même fournisseur/.test(t.textContent))));
  assert.deepEqual(errors, []);
} finally { await browser.close(); server.close(); }
console.log('Noctra TV 1.1.59 : tous les serveurs des sources affichés (même lentes), tests refaits et hors de l’historique de lecture : OK');
