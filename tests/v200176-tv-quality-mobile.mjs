// 200.0.176 : qualité des flux TV affichée sur la version web mobile.
// Avant : sur iPhone/iPad (lecteur HLS natif) le choix de qualité n'apparaissait
// jamais ; sur téléphone, seul « Auto » restait visible (ni « Qualité », ni la
// définition lue). Maintenant : « Qualité · Auto · 1080p » partout, les qualités du
// flux sur iPhone (liste principale lue par Noctra), une source à une seule
// qualité affiche sa définition.
// Navigateur réel (Playwright), styles et scripts de public/client/index.html,
// faux flux HLS (3 qualités et 1 qualité) produits par ffmpeg.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const repo = new URL('../', import.meta.url).pathname;
const shell = await readFile(join(repo, 'public/noctra-shell.js'), 'utf8');
const theme = await readFile(join(repo, 'public/noctra-theme.css'), 'utf8');
assert.ok(shell.includes('void loadTvNativeQualities(streamUrl, playbackSequence);'), 'HLS natif : qualités lues dans la liste principale');
assert.ok(shell.includes('if (!tvHls && setTvNativeQuality(event.target.value)) return;'), 'HLS natif : choix de qualité appliqué');
assert.ok(!/\.noctra-tv-quality > span \{ display: none; \}/.test(theme), '« Qualité » visible sur téléphone');
assert.ok(theme.includes('.noctra-tv-quality { flex: 1 1 100%; order: -1;'), 'téléphone : qualité sur sa propre ligne');

try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch {
  console.log('200.0.176 : qualité TV mobile : contrôles du code OK (ffmpeg absent : essai navigateur non lancé)');
  process.exit(0);
}
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')); }

const dir = await mkdtemp(join(tmpdir(), 'noctra-hls-'));
for (const height of [1080, 720, 480]) {
  const width = Math.round(height * 16 / 9 / 2) * 2;
  const common = ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=25`, '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '40', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '38', '-g', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k'];
  execFileSync('ffmpeg', [...common, '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', '-hls_segment_filename', join(dir, `v${height}_%03d.ts`), join(dir, `v${height}.m3u8`)]);
  // Lecteur HLS natif simulé (Safari) : même vidéo en MP4.
  execFileSync('ffmpeg', [...common, '-movflags', '+faststart', join(dir, `v${height}.mp4`)]);
}
await writeFile(join(dir, 'master.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nv1080.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720\nv720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480\nv480.m3u8\n');

const types = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.mp4': 'video/mp4', '.png': 'image/png' };
const index = await readFile(join(repo, 'public/client/index.html'), 'utf8');
const assets = [...index.matchAll(/<(?:script[^>]*src|link[^>]*rel="stylesheet"[^>]*href)="(\.\.\/noctra-[^"]+)"/g)].map(match => match[1]);
assert.ok(assets.some(asset => asset.includes('noctra-shell.js')) && assets.some(asset => asset.includes('noctra-theme.css')));
const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>window.ApiClient={accessToken(){return 'jeton-test'},getCurrentUserId(){return 'u1'},_serverInfo:{AccessToken:'jeton-test',UserId:'u1'},serverAddress(){return location.origin+'/jellyfin'},getUrl(p){return location.origin+'/jellyfin/'+p}};</script>
${assets.map(asset => asset.includes('.css') ? `<link rel="stylesheet" href="${asset}">` : `<script defer src="${asset}"></script>`).join('\n')}
</head><body class="noctra-ready"><div class="skinHeader"></div><div id="reactRoot"><div class="mainAnimatedPages"></div></div></body></html>`;
const json = (res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
let channelUrl = '/hls/master.m3u8';
let liveStart = Date.now();
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/client/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page); }
  // Direct simulé : fenêtre glissante de 4 segments de 2 s, qui avance depuis
  // l'ouverture de la chaîne (20 segments en tout, sans boucle).
  const live = /^\/hls\/v(\d+)\.m3u8$/.exec(path);
  if (live) {
    const sequence = Math.min(16, Math.floor((Date.now() - liveStart) / 2000));
    const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:2', `#EXT-X-MEDIA-SEQUENCE:${sequence}`];
    for (let index = sequence; index < sequence + 4; index += 1) lines.push('#EXTINF:2.000000,', `v${live[1]}_${String(index).padStart(3, '0')}.ts`);
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' });
    return res.end(lines.join('\n') + '\n');
  }
  if (path.startsWith('/hls/')) {
    try { const file = path.slice(5); const body = await readFile(join(dir, file)); res.writeHead(200, { 'content-type': types[extname(file)], 'accept-ranges': 'bytes' }); return res.end(body); } catch { res.writeHead(404); return res.end(); }
  }
  if (path === '/api/tv/sources') return json(res, { sources: [{ id: 'm3u-test', name: 'Test', type: 'm3u', section: 'channels' }] });
  if (path === '/api/tv/catalog') return json(res, { source: { id: 'm3u-test', name: 'Test' }, channels: [{ id: 'tf1', name: 'TF1', group: 'France', provider: 'Test', playbackType: 'stream', streamUrl: channelUrl }], groups: ['France'] });
  if (path === '/health') return json(res, { ok: true });
  if (path.startsWith('/jellyfin/Users/')) return json(res, { Id: 'u1', Name: 'Test', Policy: {} });
  if (/\.(?:js|css|svg|png)$/.test(path)) {
    try { const body = await readFile(join(repo, 'public', path)); res.writeHead(200, { 'content-type': types[extname(path)] || 'text/plain' }); return res.end(body); } catch { res.writeHead(404); return res.end(); }
  }
  json(res, path.startsWith('/jellyfin') ? { Items: [], TotalRecordCount: 0 } : {});
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// Safari (iPhone/iPad) : HLS natif. Chromium ne lit pas le M3U8 lui-même : la
// liste principale (choix automatique) donne la 720p, une sous-liste sa qualité.
// Moteur « HLS.js » choisi dans Outils TV : sur iPhone, ce choix passe par le
// lecteur HLS natif (même chemin que le secours de Shaka sur iOS).
const safariNativeHls = () => {
  try { localStorage.setItem('noctra-tv-engine', 'hls'); } catch {}
  const canPlayType = HTMLMediaElement.prototype.canPlayType;
  HTMLMediaElement.prototype.canPlayType = function (type) { return /mpegurl/i.test(type) ? 'maybe' : canPlayType.call(this, type); };
  const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  window.__nativeSources = [];
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    configurable: true,
    get() { return this.__nativeSource || descriptor.get.call(this); },
    set(value) {
      const text = String(value || '');
      if (/\.m3u8(?:$|\?)/.test(text)) {
        window.__nativeSources.push(text);
        this.__nativeSource = new URL(text, location.href).href;
        const variant = /v(\d+)\.m3u8/.exec(text);
        return descriptor.set.call(this, `/hls/v${variant ? variant[1] : 720}.mp4`);
      }
      this.__nativeSource = '';
      return descriptor.set.call(this, value);
    }
  });
};

async function open(context) {
  liveStart = Date.now();
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', error => errors.push(error.message));
  await tab.goto(origin + '/client/');
  await tab.waitForFunction(() => document.querySelector('[data-noctra="tv"]'));
  await tab.click('[data-noctra="tv"]').catch(() => tab.evaluate(() => document.querySelector('[data-noctra="tv"]').click()));
  await tab.waitForSelector('[data-tv-channel-index]', { state: 'attached' });
  await tab.evaluate(() => document.querySelector('[data-tv-channel-index]').click());
  await tab.waitForFunction(() => document.querySelector('#noctra-tv-video')?.videoHeight > 0, null, { timeout: 20_000 }).catch(async error => {
    const why = await tab.evaluate(() => ({ status: document.querySelector('[data-tv-player-status]')?.textContent, src: document.querySelector('#noctra-tv-video')?.src, sources: window.__nativeSources, error: document.querySelector('#noctra-tv-video')?.error?.message }));
    throw new Error(`lecture non démarrée : ${JSON.stringify(why)} ${errors.join(' | ')}`, { cause: error });
  });
  return { tab, errors };
}
const readout = tab => tab.evaluate(() => {
  const wrap = document.querySelector('[data-tv-quality-wrap]');
  const label = wrap?.querySelector('span');
  const shown = node => Boolean(node) && !node.closest('[hidden]') && getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0;
  const select = wrap?.querySelector('select');
  const bar = document.querySelector('.noctra-tv-player-actions').getBoundingClientRect();
  return { fullRow: wrap.getBoundingClientRect().width >= bar.width * 0.9, visible: shown(wrap), label: shown(label) ? label.textContent : '', options: [...(select?.options || [])].map(option => option.textContent), value: select?.value, disabled: Boolean(select?.disabled), height: document.querySelector('#noctra-tv-video').videoHeight };
});

const browser = await playwright.chromium.launch();
try {
  const devices = { pc: { viewport: { width: 1440, height: 900 } }, android: playwright.devices['Pixel 7'], iphone: playwright.devices['iPhone 14'] };
  for (const [name, options] of Object.entries(devices)) {
    channelUrl = '/hls/master.m3u8';
    const context = await browser.newContext(options);
    if (name === 'iphone') await context.addInitScript(safariNativeHls);
    const { tab, errors } = await open(context);
    await tab.waitForFunction(() => /\d+p/.test(document.querySelector('[data-tv-quality] option[value="-1"]')?.textContent || ''), null, { timeout: 15_000 });
    const state = await readout(tab);
    assert.ok(state.visible, `${name} : choix de qualité visible`);
    assert.equal(state.label, 'Qualité', `${name} : « Qualité » écrit`);
    assert.deepEqual(state.options.slice(1), ['1080p · 5.0 Mb/s', '720p · 2.5 Mb/s', '480p · 1.0 Mb/s'], `${name} : qualités du flux`);
    assert.equal(state.options[0], `Auto · ${state.height}p`, `${name} : définition lue affichée`);
    assert.equal(state.fullRow, name !== 'pc', `${name} : ligne entière sur téléphone seulement`);
    if (name === 'iphone') {
      assert.equal(state.height, 720, 'iPhone : lecteur natif sur la liste principale');
      assert.ok(await tab.evaluate(() => !document.querySelector('#noctra-tv-video').src.startsWith('blob:')), 'iPhone : HLS natif, pas HLS.js');
    }
    // Choix de la 480p.
    await tab.selectOption('[data-tv-quality]', { label: '480p · 1.0 Mb/s' });
    if (name === 'iphone') {
      await tab.waitForFunction(() => document.querySelector('#noctra-tv-video').videoHeight === 480, null, { timeout: 15_000 });
      assert.match(await tab.evaluate(() => window.__nativeSources.at(-1)), /\/hls\/v480\.m3u8$/, 'iPhone : sous-liste 480p chargée');
      await tab.selectOption('[data-tv-quality]', '-1');
      await tab.waitForFunction(() => document.querySelector('#noctra-tv-video').videoHeight === 720, null, { timeout: 15_000 });
      assert.match(await tab.evaluate(() => window.__nativeSources.at(-1)), /\/hls\/master\.m3u8$/, 'iPhone : Auto revient à la liste principale');
      assert.equal((await readout(tab)).options[0], 'Auto · 720p');
    } else {
      assert.equal(await tab.evaluate(() => document.querySelector('[data-tv-quality]').value), '2', `${name} : 480p choisie`);
    }
    assert.deepEqual(errors, [], `${name} : aucune erreur`);
    await context.close();

    // Source à une seule qualité : sa définition reste affichée.
    channelUrl = '/hls/v720.m3u8';
    const single = await browser.newContext(options);
    if (name === 'iphone') await single.addInitScript(safariNativeHls);
    const one = await open(single);
    await one.tab.waitForFunction(() => document.querySelector('[data-tv-quality] option[value="-1"]')?.textContent === '720p', null, { timeout: 15_000 });
    const solo = await readout(one.tab);
    assert.ok(solo.visible && solo.disabled, `${name} : une seule qualité, affichée sans choix`);
    assert.equal(solo.label, 'Qualité');
    assert.deepEqual(one.errors, []);
    await single.close();
  }
  console.log('200.0.176 : qualité des flux TV affichée sur PC, téléphone Android et iPhone (HLS natif) ; choix et source à une qualité : OK');
} finally {
  await browser.close();
  server.close();
  await rm(dir, { recursive: true, force: true });
}
