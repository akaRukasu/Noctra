import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { buildOrsay, convertCss, legacyGradients, orsayVersions } from '../apps/scripts/build-orsay.mjs';

/* Noctra pour Samsung Smart TV 2014 (Orsay, UE40H6400) : vérifications
   automatiques, SANS téléviseur ni émulateur Samsung :
     1. paquet : contenu, config.xml / widget.info (CRLF), liste User App Sync ;
     2. scripts en ES5 strict (moteur WebKit 537 de 2013) ;
     3. style converti : plus de variables, de grilles ni de min()/max() ;
     4. Chromium sans les fonctions absentes du téléviseur (Promise, fetch,
        URL, MessageChannel, closest…) et API Samsung simulées (Common.API,
        webapis.avplay, FileSystem) : démarrage, diagnostic et relais local,
        touches Samsung, clavier à l'écran, lecture directe, relais du serveur,
        film avec reprise, mosaïque multiview, réglages enregistrés.
   Ce que ce test ne prouve pas : le comportement réel du téléviseur
   (lecteur AVPlay, codes de touches, rendu CSS, HTTPS). */

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')); }
let acorn;
try { acorn = require('acorn'); } catch { acorn = null; }

// ── 1. Paquet ───────────────────────────────────────────────────────────
const out = await mkdtemp(join(tmpdir(), 'noctra-orsay-'));
const built = await buildOrsay({ outRoot: out, server: 'http://127.0.0.1:1/noctra' });
function unzip(buffer) {
  const files = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extra = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString('utf8');
    const data = buffer.slice(offset + 30 + nameLength + extra, offset + 30 + nameLength + extra + size);
    if (!name.endsWith('/')) files.set(name, method === 8 ? inflateRawSync(data) : data);
    offset += 30 + nameLength + extra + size;
  }
  return files;
}
const files = unzip(await readFile(built.widgetZip));
for (const name of ['config.xml', 'widget.info', 'index.html', 'config.js', 'orsay-compat.js', 'orsay-host.js', 'orsay.css', 'app.css', 'app.js', 'tv-native.js', 'tv-data.js', 'noctra-mark.svg',
  'icon/noctra_106_87.png', 'icon/noctra_115_95.png', 'icon/noctra_85_70.png', 'icon/noctra_95_78.png']) assert.ok(files.has(name), 'fichier du paquet : ' + name);
assert.ok(!files.has('player.html'), 'pas de lecteur web séparé sur ce téléviseur');
const configXml = files.get('config.xml').toString('utf8');
assert.ok(/\r\n/.test(configXml) && !/[^\r]\n/.test(configXml), 'config.xml en CRLF');
assert.ok(!/xmlns/.test(configXml), 'config.xml sans espace de noms');
assert.match(configXml, /<ver itemtype="string">\d+\.\d+<\/ver>/);
assert.match(configXml, /<width itemtype="string">1280<\/width>\s*<height itemtype="string">720<\/height>/);
for (const icon of ['ThumbIcon', 'BigThumbIcon', 'ListIcon', 'BigListIcon']) {
  const path = new RegExp(`<${icon} itemtype="string">([^<]+)</${icon}>`).exec(configXml)[1];
  assert.ok(files.has(path), icon + ' présent');
  const png = files.get(path);
  const [, w, h] = /noctra_(\d+)_(\d+)\.png/.exec(path);
  assert.equal(png.readUInt32BE(16), Number(w));
  assert.equal(png.readUInt32BE(20), Number(h));
}
assert.equal(files.get('widget.info').toString('utf8'), 'Use Alpha Blending? = Yes\r\nScreen Resolution = 1280x720\r\n');
const indexHtml = files.get('index.html').toString('utf8');
for (const api of ['Common/API/Widget.js', 'Common/API/TVKeyValue.js', 'Common/API/Plugin.js', 'Common/webapi/1.0/webapis.js']) assert.ok(indexHtml.includes('$MANAGER_WIDGET/' + api), api);
assert.match(indexHtml, /<header id="top">[\s\S]*<main id="main" class="scroll"><\/main>[\s\S]*<div id="toast" role="status"><\/div>/, 'écran de l’interface repris de l’appli Android TV');
assert.ok(indexHtml.indexOf('orsay-compat.js') < indexHtml.indexOf('orsay-host.js'));
assert.ok(!/tv-native\.js|app\.js/.test(indexHtml), 'interface chargée après le choix du serveur');
assert.equal(orsayVersions('1.1.51', 1).widget, '1.15101');
const list = await readFile(join(built.kitDir, 'widgetlist.xml'), 'utf8');
assert.match(list, new RegExp(`<widget id="Noctra">[\\s\\S]*<compression size="${built.size}" type="zip"/>[\\s\\S]*<download>http://__ADRESSE_IP_DU_PC__/Noctra.zip</download>`));
for (const name of ['serveur/noctra-samsung2014.mjs', 'serveur/Installer-Noctra-Samsung2014.ps1', 'serveur/Installer sur le televiseur.cmd', 'serveur/Relais local (Node.js).cmd', 'serveur/noctra-relais.service',
  'GUIDE-INSTALLATION-UE40H6400.md', 'RAPPORT-COMPATIBILITE-UE40H6400.md']) assert.ok((await readFile(join(built.kitDir, name))).length > 0, 'kit : ' + name);
assert.equal((await readFile(join(built.kitDir, 'serveur/Installer-Noctra-Samsung2014.ps1'))).slice(0, 3).toString('hex'), 'efbbbf', 'PowerShell : UTF-8 avec BOM');

// ── 2. ES5 ──────────────────────────────────────────────────────────────
if (acorn) {
  for (const [name, content] of files) if (name.endsWith('.js')) acorn.parse(content.toString('utf8'), { ecmaVersion: 5, sourceType: 'script' });
} else {
  for (const [name, content] of files) if (name.endsWith('.js')) assert.ok(!/=>|\bconst\s|\blet\s|`|\bclass\s+\w/.test(content.toString('utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')), 'ES5 : ' + name);
}

// ── 3. Style ────────────────────────────────────────────────────────────
const css = files.get('app.css').toString('utf8');
assert.ok(!/var\(--/.test(css), 'variables CSS remplacées');
assert.ok(!/display:\s*(inline-)?grid/.test(css), 'plus de grilles CSS');
assert.ok(!/grid-(template|gap|auto|column|row)/.test(css), 'propriétés de grille retirées');
assert.ok(!/\b(min|max|clamp)\(/.test(css), 'min()/max() évalués');
assert.ok(!/flex-flex/.test(css));
assert.match(css, /display: -webkit-flex; display: flex/);
assert.match(css, /@-webkit-keyframes spin/);
assert.match(css, /-webkit-transition/);
assert.equal(legacyGradients('linear-gradient(180deg, #000 78%, transparent)'), '-webkit-linear-gradient(-90deg, #000 78%, transparent)');
assert.equal(legacyGradients('radial-gradient(60rem 26rem at 12% -8%, red, transparent 70%)'), '-webkit-radial-gradient(12% -8%, 60rem 26rem, red, transparent 70%)');
assert.match(convertCss(':root { --a: 2rem; } .x { display: grid; grid-gap: var(--a); }'), /\.x > :nth-child\(n\+2\) \{ margin-top: 2rem; \}/);
assert.match(convertCss('.g { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.4rem, 1fr)); grid-gap: 1rem; }'), /\.g > :nth-child\(n\) \{ width: -webkit-calc\(\(100% - 6 \* 1rem\) \/ 7\)/);
assert.match(convertCss('.a:focus-within, .b { color: red; }'), /^\.b \{ color: red; \}$/m, 'sélecteur inconnu isolé');

// ── 4. Navigateur sans les fonctions modernes ───────────────────────────
const widget = new Map([...files].map(([name, content]) => ['/' + name, content]));
const requests = [];
const poster = files.get('icon/noctra_115_95.png');
const items = Array.from({ length: 9 }, (_, i) => ({ Id: 'item' + i, Name: 'Film ' + (i + 1), Type: 'Movie', ProductionYear: 2020, ImageTags: { Primary: 't' + i }, UserData: { PlaybackPositionTicks: 0 }, RunTimeTicks: 72000000000 }));
let healthOk = true;
const types = { js: 'application/javascript', css: 'text/css', html: 'text/html; charset=utf-8', xml: 'text/xml', svg: 'image/svg+xml', png: 'image/png', info: 'text/plain' };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS' };
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(body)); }
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const path = url.pathname;
    if (widget.has(path)) { res.writeHead(200, { 'content-type': types[path.split('.').pop()] || 'application/octet-stream' }); res.end(widget.get(path)); return; }
    if (path === '/' || path === '/index.html') { res.writeHead(200, { 'content-type': types.html }); res.end(widget.get('/index.html')); return; }
    requests.push({ method: req.method, path, search: url.search, body: body ? JSON.parse(body) : null, token: req.headers['x-noctra-token'] || '' });
    if (path === '/noctra/health') { if (!healthOk) { req.socket.destroy(); return; } json(res, 200, { client: 'Noctra', version: '200.0.147', tvApp: true }); return; }
    if (path === '/noctra/api/session') { json(res, 200, { user: { name: 'Lucas' }, isAdmin: false }); return; }
    if (path === '/noctra/api/config') { json(res, 200, { configured: {} }); return; }
    if (path === '/noctra/api/tv/cast') { json(res, 200, { url: '/noctra/api/tv/stream/ref1?cast=grant1', expiresAt: Date.now() + 3600e3 }); return; }
    if (path === '/noctra/api/tv/mosaic' && req.method === 'POST') {
      const relay = JSON.parse(body).relay === true;
      const id = relay ? 'aaaaaaaaaaaaaaaaaaaaaaaa' : 'bbbbbbbbbbbbbbbbbbbbbbbb';
      json(res, 200, { id, relay, ready: true, playlist: `/noctra/api/tv/mosaic/${id}/index.m3u8`, cast: `/noctra/api/tv/mosaic/${id}/index.m3u8?cast=g`, expiresAt: Date.now() + 3600e3 });
      return;
    }
    if (/^\/noctra\/api\/tv\/mosaic\/\w+$/.test(path) && req.method === 'DELETE') { json(res, 200, { stopped: true }); return; }
    if (path === '/noctra/api/tv/stream/ref1') { res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl', ...cors }); res.end('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg1.ts\n'); return; }
    if (path.startsWith('/noctra/api/')) { json(res, 200, {}); return; }
    if (path.startsWith('/jellyfin/')) {
      if (/\/Images\//.test(path)) { res.writeHead(200, { 'content-type': 'image/png', ...cors }); res.end(poster); return; }
      if (path === '/jellyfin/Users/Me') { json(res, 200, { Name: 'Lucas', Id: 'user1' }); return; }
      if (/\/Views$/.test(path)) { json(res, 200, { Items: [{ Id: 'lib1', Name: 'Films', CollectionType: 'movies', ImageTags: {} }, { Id: 'lib2', Name: 'Séries', CollectionType: 'tvshows', ImageTags: {} }], TotalRecordCount: 2 }); return; }
      if (/\/Latest$/.test(path)) { json(res, 200, items); return; }
      if (/\/Sessions|\/ActiveEncodings/.test(path)) { res.writeHead(204, cors); res.end(); return; }
      json(res, 200, { Items: items, TotalRecordCount: items.length });
      return;
    }
    res.writeHead(404, cors);
    res.end('introuvable');
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// Moteur du téléviseur : fonctions absentes retirées, API Samsung simulées.
const tvInit = ({ origin }) => {
  for (const name of ['Promise', 'fetch', 'URL', 'URLSearchParams', 'AbortController', 'AbortSignal', 'MessageChannel', 'MessageEvent', 'IntersectionObserver', 'Headers']) {
    try { delete window[name]; } catch (error) { /* non configurable */ }
    try { Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true }); } catch (error) { /* non configurable */ }
  }
  for (const [target, names] of [[Element.prototype, ['closest', 'remove', 'replaceWith', 'before', 'after', 'append', 'prepend']], [CharacterData.prototype, ['remove', 'replaceWith', 'before', 'after']],
    [Document.prototype, ['append', 'prepend']], [DocumentFragment.prototype, ['append', 'prepend']], [Array.prototype, ['includes', 'find', 'findIndex', 'fill']], [Array, ['from', 'of']],
    [String.prototype, ['includes', 'startsWith', 'endsWith', 'padStart', 'padEnd', 'repeat', 'normalize', 'trimStart', 'trimEnd']], [Object, ['assign', 'values', 'entries']], [Number, ['isFinite', 'isNaN', 'isInteger']], [Math, ['trunc', 'sign']]]) {
    for (const name of names) { try { delete target[name]; } catch (error) { /* non configurable */ } }
  }
  window.__calls = [];
  const call = (name, args) => window.__calls.push([name].concat(Array.prototype.slice.call(args || [])));
  window.Common = { API: {
    Widget: function () { this.sendReadyEvent = function () { call('ready'); }; this.sendReturnEvent = function () { call('return'); }; this.sendExitEvent = function () { call('exit'); }; this.blockNavigation = function (event) { call('block'); event.preventDefault(); }; },
    TVKeyValue: function () { var keys = { KEY_LEFT: 4, KEY_RIGHT: 5, KEY_UP: 29460, KEY_DOWN: 29461, KEY_ENTER: 29443, KEY_RETURN: 88, KEY_EXIT: 45, KEY_PLAY: 71, KEY_PAUSE: 74, KEY_STOP: 70, KEY_FF: 72, KEY_RW: 69, KEY_CH_UP: 68, KEY_CH_DOWN: 65, KEY_INFO: 31, KEY_TOOLS: 75, KEY_VOL_UP: 7, KEY_VOL_DOWN: 11, KEY_MUTE: 27, KEY_0: 17, KEY_1: 101, KEY_2: 98, KEY_3: 6, KEY_4: 8, KEY_5: 9, KEY_6: 10, KEY_7: 12, KEY_8: 13, KEY_9: 14 }; for (var key in keys) this[key] = keys[key]; },
    Plugin: function () { this.unregistKey = function (code) { call('unregist', [code]); }; this.setOffScreenSaver = function () { call('saverOff'); }; this.setOnScreenSaver = function () { call('saverOn'); }; }
  } };
  window.curWidget = { id: 'Noctra' };
  window.__files = {};
  window.FileSystem = function () {
    this.isValidCommonPath = function () { return true; };
    this.createCommonDir = function () { return true; };
    this.openCommonFile = function (path, mode) {
      if (mode === 'r') return window.__files[path] === undefined ? null : { readAll: function () { return window.__files[path]; } };
      return { writeAll: function (text) { window.__files[path] = text; } };
    };
    this.closeCommonFile = function () { return true; };
  };
  // Lecteur AVPlay simulé : démarre 300 ms après play() ; une adresse contenant « refus » échoue.
  window.__av = { calls: [], callbacks: null };
  const player = {
    init: function (options) { window.__av.callbacks = options; window.__av.calls.push(['init', options.containerID]); },
    open: function (url) { window.__av.url = url; window.__av.calls.push(['open', url]); },
    play: function (success, error, start) {
      window.__av.calls.push(['play', start || 0]);
      success();
      const url = window.__av.url;
      const cb = window.__av.callbacks;
      setTimeout(function () {
        if (window.__av.url !== url) return;
        if (/refus/.test(url)) { cb.playCallback.onerror({ code: 0, name: 'PLAYER_ERROR_INVALID_STREAM' }); return; }
        cb.bufferingCallback.onbufferingstart();
        cb.bufferingCallback.onbufferingcomplete();
        let ms = (start || 0) * 1000;
        window.__av.timer = setInterval(function () { if (window.__av.url !== url) return; ms += 500; cb.playCallback.oncurrentplaytime({ millisecond: ms }); }, 100);
      }, 300);
    },
    stop: function () { window.__av.calls.push(['stop']); window.__av.url = ''; clearInterval(window.__av.timer); },
    pause: function () { window.__av.calls.push(['pause']); },
    resume: function () { window.__av.calls.push(['resume']); },
    jumpForward: function (s) { window.__av.calls.push(['forward', s]); },
    jumpBackward: function (s) { window.__av.calls.push(['backward', s]); },
    getDuration: function () { return 5400000; },
    setDisplayRect: function (rect) { window.__av.calls.push(['rect', rect.width, rect.height]); },
    show: function () {}, hide: function () {}
  };
  window.webapis = { avplay: { getAVPlay: function (success) { setTimeout(function () { success(player); }, 10); } } };
  // Session Jellyfin déjà ouverte (connexion testée par les tests du pont web).
  localStorage.setItem('noctra-tv-web-session-v1', JSON.stringify({ token: 'jf-token', userId: 'user1', userName: 'Lucas' }));
  localStorage.setItem('noctra-orsay-server-v1', JSON.stringify({ url: origin + '/noctra', relay: '' }));
  // Canal de l'interface : capté pour envoyer les ordres « play », « multiview »…
  window.__fromHost = [];
  let attach;
  Object.defineProperty(window, 'NoctraAttachHost', {
    configurable: true,
    get: function () { return attach && function (port) { window.__port = port; attach(port); const app = port.onmessage; port.onmessage = function (message) { window.__fromHost.push(JSON.parse(message.data)); app(message); }; }; },
    set: function (value) { attach = value; }
  });
};

const browser = await playwright.chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(tvInit, { origin });
  await page.goto(origin + '/index.html');
  // Démarrage : test du serveur puis interface Noctra TV avec la session mémorisée.
  await page.waitForFunction(() => document.querySelectorAll('#nav .nav').length > 0, null, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#main .card').length > 0, null, { timeout: 20000 });
  const state = await page.evaluate(() => ({
    polyfills: typeof Promise === 'function' && typeof fetch === 'function' && typeof URL === 'function' && typeof MessageChannel === 'function' && typeof Element.prototype.closest === 'function' && typeof ''.normalize === 'function',
    classes: document.documentElement.className, ready: window.__calls.some(c => c[0] === 'ready'),
    session: window.__fromHost.filter(m => m.type === 'session').pop()
  }));
  assert.ok(state.polyfills, 'compléments installés');
  assert.ok(state.ready, 'widgetAPI.sendReadyEvent appelé');
  assert.match(state.classes, /web-host/);
  assert.match(state.classes, /host-orsay/);
  assert.match(state.classes, /lite/, 'affichage léger');
  assert.equal(state.session.platform, 'orsay');
  assert.deepEqual(state.session.codecs, { hevc: false, vp9: false, ac3: false, eac3: false, dts: false });
  assert.equal(state.session.caps.webPlayer, false);
  assert.equal(state.session.caps.mosaic, true);
  assert.equal(state.session.noctraUrl, origin + '/noctra');
  assert.ok(requests.some(r => r.path === '/noctra/api/session' && r.token === 'jf-token'), 'API Noctra jointe avec le jeton (fetch sur XMLHttpRequest)');
  await page.screenshot({ path: join(out, 'accueil.png') });

  // Grilles converties : 7 affiches par ligne, une 8e à la ligne suivante.
  const layout = await page.evaluate(() => {
    const grid = document.createElement('div');
    grid.className = 'grid posters';
    for (let i = 0; i < 8; i++) { const card = document.createElement('button'); card.className = 'card f'; card.innerHTML = '<div class="art"></div>'; grid.appendChild(card); }
    document.getElementById('main').appendChild(grid);
    const tops = Array.prototype.map.call(grid.children, node => Math.round(node.getBoundingClientRect().top));
    const widths = Array.prototype.map.call(grid.children, node => Math.round(node.getBoundingClientRect().width));
    grid.parentNode.removeChild(grid);
    return { tops, widths };
  });
  assert.equal(new Set(layout.tops.slice(0, 7)).size, 1, 'première ligne : 7 affiches');
  assert.ok(layout.tops[7] > layout.tops[0], '8e affiche à la ligne suivante');
  assert.ok(layout.widths[0] > 100 && layout.widths[0] < 200, 'largeur des affiches : ' + layout.widths[0]);

  // Touches Samsung traduites : ▼ (29461) déplace le focus, Retour (88) bloqué.
  const key = code => page.evaluate(value => {
    const target = document.activeElement || document.body;
    const event = document.createEvent('Event');
    event.initEvent('keydown', true, true);
    Object.defineProperty(event, 'keyCode', { value });
    target.dispatchEvent(event);
  }, code);
  await page.evaluate(() => { window.__before = document.activeElement; });
  await key(29461);
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => document.activeElement !== window.__before && document.activeElement !== document.body), 'touche ▼ Samsung : focus déplacé');
  await key(13);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#nw-player').length), 0, '13 = touche « 8 » sur ce téléviseur, pas OK');

  // Chaîne : droit de lecture du serveur, type détecté, lecteur AVPlay en HLS.
  const send = message => page.evaluate(value => window.__port.postMessage(JSON.stringify(value)), message);
  await send({ action: 'play', url: origin + '/noctra/api/tv/stream/ref1', title: 'TF1', subtitle: 'Serveur 1', mime: '', headers: { Referer: 'https://site.example/' }, epg: null, playSessionId: 'p1' });
  await page.waitForFunction(() => window.__fromHost.some(m => m.type === 'playerEvent' && m.action === 'playing'), null, { timeout: 15000 });
  const cast = requests.filter(r => r.path === '/noctra/api/tv/cast').pop();
  assert.equal(cast.body.url, origin + '/noctra/api/tv/stream/ref1');
  assert.deepEqual(cast.body.headers, { Referer: 'https://site.example/' }, 'en-têtes de la page transmis au relais');
  let av = await page.evaluate(() => ({ calls: window.__av.calls, url: window.__av.url, classes: document.documentElement.className, saver: window.__calls.filter(c => /^saver/.test(c[0])).map(c => c[0]) }));
  assert.equal(av.url, origin + '/noctra/api/tv/stream/ref1?cast=grant1|COMPONENT=HLS');
  assert.deepEqual(av.calls[0], ['init', 'orsay-av']);
  assert.match(av.classes, /orsay-video/, 'page transparente pendant la lecture');
  assert.ok(av.saver.includes('saverOff'), 'écran de veille suspendu');
  assert.ok(requests.some(r => r.path === '/noctra/api/tv/stream/ref1' && r.search === '?cast=grant1'), 'type du flux détecté (liste HLS)');
  await page.screenshot({ path: join(out, 'lecture.png') });
  await key(88);
  await page.waitForFunction(() => window.__fromHost.some(m => m.type === 'playerClosed'), null, { timeout: 5000 });
  av = await page.evaluate(() => ({ calls: window.__av.calls, classes: document.documentElement.className, block: window.__calls.filter(c => c[0] === 'block').length, ret: window.__calls.filter(c => c[0] === 'return').length }));
  assert.deepEqual(av.calls[av.calls.length - 1], ['stop']);
  assert.doesNotMatch(av.classes, /orsay-video/);
  assert.ok(av.block >= 1, 'Retour bloqué (le téléviseur ne quitte pas l’appli)');
  assert.equal(av.ret, 0, 'Retour dans le lecteur : retour à l’interface, pas au Smart Hub');

  // Flux refusé par le lecteur du téléviseur : relais du serveur (ffmpeg, HLS MPEG-TS).
  await page.evaluate(() => { window.__fromHost.length = 0; });
  await send({ action: 'play', url: 'http://flux.example/refus.m3u8', title: 'France 2', mime: 'application/vnd.apple.mpegurl', epg: null, playSessionId: 'p2' });
  await page.waitForFunction(() => window.__fromHost.some(m => m.type === 'playerEvent' && m.action === 'playing'), null, { timeout: 15000 });
  const relay = requests.filter(r => r.path === '/noctra/api/tv/mosaic' && r.method === 'POST').pop();
  assert.equal(relay.body.relay, true);
  assert.equal(relay.body.tiles[0].url, 'http://flux.example/refus.m3u8');
  av = await page.evaluate(() => window.__av.url);
  assert.equal(av, origin + '/noctra/api/tv/mosaic/aaaaaaaaaaaaaaaaaaaaaaaa/index.m3u8?cast=g|COMPONENT=HLS');
  await key(70);
  await page.waitForFunction(() => window.__fromHost.some(m => m.type === 'playerClosed'), null, { timeout: 5000 });
  await page.waitForTimeout(100);
  assert.ok(requests.some(r => r.method === 'DELETE' && r.path === '/noctra/api/tv/mosaic/aaaaaaaaaaaaaaaaaaaaaaaa'), 'relais arrêté à la fermeture');

  // Film : reprise à 1 min (départ du lecteur), avance de 10 s (▶), jeton Jellyfin dans l'adresse.
  await page.evaluate(() => { window.__fromHost.length = 0; window.__av.calls.length = 0; });
  await send({ action: 'play', vod: true, url: origin + '/jellyfin/Videos/item1/master.m3u8?MediaSourceId=s1', title: 'Film 1', startMs: 60000, itemId: 'item1', mediaSourceId: 's1', playSessionId: 'v1', jellyfin: true });
  await page.waitForFunction(() => window.__av.calls.some(c => c[0] === 'play'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  av = await page.evaluate(() => ({ calls: window.__av.calls, url: window.__av.url }));
  assert.match(av.url, /\/jellyfin\/Videos\/item1\/master\.m3u8\?MediaSourceId=s1&ApiKey=jf-token\|COMPONENT=HLS$/);
  assert.deepEqual(av.calls.find(c => c[0] === 'play'), ['play', 60], 'reprise à 60 s');
  await key(5);
  await page.waitForTimeout(1000);
  av = await page.evaluate(() => window.__av.calls.filter(c => c[0] === 'forward'));
  // Position visée = position au moment de l'appui + 10 s (le lecteur simulé avance 5 fois plus vite).
  assert.ok(av[0] && av[0][1] >= 5 && av[0][1] <= 10, 'avance vers +10 s : ' + JSON.stringify(av));
  await key(74);
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => window.__av.calls.some(c => c[0] === 'pause')), 'Pause');
  await key(88);
  await page.waitForFunction(() => window.__fromHost.some(m => m.type === 'playerClosed' && m.vod), null, { timeout: 5000 });

  // Multiview : mosaïque du serveur, cases à la télécommande, son changé, fermeture.
  await page.evaluate(() => { window.__fromHost.length = 0; });
  await send({ action: 'multiview', items: [
    { title: 'TF1', options: [{ label: 'S1', url: 'http://flux.example/tf1.m3u8' }] },
    { title: 'M6', options: [{ label: 'S1', resolve: origin + '/noctra/api/tv/resolve/m6' }, { label: 'S2', url: 'http://flux.example/m6.m3u8' }] }
  ], catalog: [] });
  await page.waitForFunction(() => document.querySelectorAll('.om-box').length === 2 && /mosaic\/bbbb/.test(window.__av.url || ''), null, { timeout: 15000 });
  let mosaic = requests.filter(r => r.path === '/noctra/api/tv/mosaic' && r.method === 'POST').pop();
  assert.deepEqual(mosaic.body.tiles.map(t => t.url), ['http://flux.example/tf1.m3u8', 'http://flux.example/m6.m3u8'], 'serveur automatique vide : serveur suivant');
  assert.equal(mosaic.body.audio, 0);
  await page.screenshot({ path: join(out, 'multiview.png') });
  await key(5);
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => Array.prototype.indexOf.call(document.querySelectorAll('.om-box'), document.querySelector('.om-box.on'))), 1, '▶ : case suivante');
  await key(29443);
  await page.waitForFunction(() => document.querySelector('.nw-sheet .nw-f'), null, { timeout: 5000 });
  assert.match(await page.evaluate(() => document.activeElement.textContent), /Écouter cette chaîne/);
  await key(29443);
  await page.waitForFunction(() => window.__fromHost.some(m => m.type === 'multiviewState' && m.state.audio === 1), null, { timeout: 5000 });
  await page.waitForTimeout(1200);
  mosaic = requests.filter(r => r.path === '/noctra/api/tv/mosaic' && r.method === 'POST').pop();
  assert.equal(mosaic.body.audio, 1, 'son de la 2e chaîne');
  assert.equal(mosaic.body.id, 'bbbbbbbbbbbbbbbbbbbbbbbb', 'même mosaïque, recomposée');
  await key(88);
  await page.waitForTimeout(200);
  assert.ok(requests.some(r => r.method === 'DELETE' && r.path === '/noctra/api/tv/mosaic/bbbbbbbbbbbbbbbbbbbbbbbb'), 'mosaïque arrêtée');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.orsay-mosaic').length), 0);

  // Réglages copiés dans le fichier de l'appli (stockage web pas toujours conservé).
  await page.waitForTimeout(1700);
  const saved = await page.evaluate(() => JSON.parse(window.__files['Noctra/noctra-reglages.json'] || '{}'));
  assert.ok(saved['noctra-tv-web-session-v1'] && saved['noctra-orsay-server-v1'], 'session et serveur enregistrés dans le fichier');
  assert.deepEqual(errors, [], 'aucune erreur JavaScript');

  // Démarrage sans connexion (HTTPS refusé) : diagnostic, relais local saisi à la télécommande.
  const second = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  second.on('pageerror', error => errors.push(error.message));
  await second.addInitScript(tvInit, { origin });
  await second.addInitScript(() => { localStorage.setItem('noctra-orsay-server-v1', JSON.stringify({ url: 'http://127.0.0.1:9/noctra', relay: '' })); });
  await second.goto(origin + '/index.html');
  await second.waitForFunction(() => /Connexion impossible/.test(document.body.textContent), null, { timeout: 20000 });
  assert.match(await second.evaluate(() => document.getElementById('orsay-boot').textContent), /relais/);
  await second.screenshot({ path: join(out, 'diagnostic.png') });
  const press = code => second.evaluate(value => {
    const event = document.createEvent('Event');
    event.initEvent('keydown', true, true);
    Object.defineProperty(event, 'keyCode', { value });
    (document.activeElement || document.body).dispatchEvent(event);
  }, code);
  await press(5);
  assert.equal(await second.evaluate(() => document.activeElement.textContent), 'Utiliser un relais local');
  await press(29443);
  await second.waitForFunction(() => document.querySelector('.ob-input'), null, { timeout: 3000 });
  await press(29443);
  assert.ok(await second.evaluate(() => Boolean(document.querySelector('.ok-keyboard'))), 'clavier à l’écran ouvert par OK');
  // Adresse du relais : celle du faux serveur, tapée avec les chiffres et le clavier.
  const relayHost = origin.replace('http://', '');
  const digits = { 0: 17, 1: 101, 2: 98, 3: 6, 4: 8, 5: 9, 6: 10, 7: 12, 8: 13, 9: 14 };
  for (const char of relayHost) {
    if (digits[char] !== undefined) { await press(digits[char]); continue; }
    // « . » et « : » : touches du clavier à l'écran (4e et 5e rangées).
    const target = char === '.' ? [3, 7] : [4, 1];
    await second.evaluate(([row, col]) => { const k = window.NoctraOrsay.debug.keyboard; k.row = row; k.col = col; }, target);
    await press(29443);
  }
  assert.equal(await second.evaluate(() => document.querySelector('.ok-preview').textContent.replace('▏', '')), relayHost);
  await second.evaluate(() => { const k = window.NoctraOrsay.debug.keyboard; k.row = k.keys.length - 1; k.col = k.keys[k.row].length - 1; });
  await press(29443);
  await second.waitForFunction(() => document.querySelectorAll('#nav .nav').length > 0, null, { timeout: 20000 });
  const relayState = await second.evaluate(() => ({ stored: JSON.parse(localStorage.getItem('noctra-orsay-server-v1')), query: window.NOCTRA_HOST_QUERY }));
  assert.equal(relayState.stored.relay, origin);
  assert.equal(relayState.query, '?platform=orsay&server=' + encodeURIComponent(origin + '/noctra'), 'relais + chemin du serveur');
  assert.deepEqual(errors, [], 'aucune erreur JavaScript');
} finally {
  await browser.close();
  server.close();
}
// ── 5. Serveur d'installation et relais local (kit, Node.js) ────────────
{
  const { spawn } = await import('node:child_process');
  const { request } = await import('node:http');
  const upstreamHits = [];
  const upstream = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      upstreamHits.push({ method: req.method, url: req.url, host: req.headers.host, body, token: req.headers['x-noctra-token'] });
      const self = `http://${req.headers.host}`;
      if (req.url === '/noctra/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ client: 'Noctra', version: 'test' })); return; }
      if (req.url.startsWith('/noctra/api/tv/stream/')) { res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' }); res.end(`#EXTM3U\n#EXTINF:4,\n${self}/noctra/api/tv/stream/seg1.ts?cast=a\n`); return; }
      if (req.url === '/noctra/api/tv/cast') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ seen: JSON.parse(body).url, url: `${self}/noctra/api/tv/stream/r?cast=1` })); return; }
      if (req.url === '/video.ts') { res.writeHead(200, { 'content-type': 'video/mp2t' }); res.end(Buffer.alloc(188 * 4, 0x47)); return; }
      res.writeHead(404); res.end();
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`;
  const free = () => new Promise(resolve => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); }); });
  const relayPort = await free();
  const installPort = await free();
  const script = join(built.kitDir, 'serveur', 'noctra-samsung2014.mjs');
  const children = [
    spawn(process.execPath, [script, 'relais', '--serveur', upstreamOrigin + '/noctra', '--port', String(relayPort)], { stdio: 'pipe' }),
    spawn(process.execPath, [script, 'installer', '--port', String(installPort)], { stdio: 'pipe' })
  ];
  const logs = children.map(child => { const text = []; child.stdout.on('data', d => text.push(String(d))); child.stderr.on('data', d => text.push(String(d))); return text; });
  const fetchText = (port, path, options = {}) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: options.method || 'GET', headers: { host: `127.0.0.1:${port}`, ...(options.headers || {}) } }, res => {
      const parts = [];
      res.on('data', d => parts.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
    });
    req.on('error', reject);
    req.end(options.body);
  });
  try {
    for (let i = 0; i < 50 && !logs.every(text => /prêt/.test(text.join(''))); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.match(logs[0].join(''), /Relais local Noctra prêt/);
    assert.match(logs[1].join(''), /Serveur d'installation Noctra prêt/);
    const relayOrigin = `http://127.0.0.1:${relayPort}`;
    const playlist = await fetchText(relayPort, '/noctra/api/tv/stream/abc?cast=1', { headers: { 'x-noctra-token': 'tok' } });
    assert.equal(playlist.status, 200);
    assert.equal(playlist.body.toString(), `#EXTM3U\n#EXTINF:4,\n${relayOrigin}/noctra/api/tv/stream/seg1.ts?cast=a\n`, 'liste HLS : adresses du relais');
    const hit = upstreamHits.find(h => h.url === '/noctra/api/tv/stream/abc?cast=1');
    assert.equal(hit.host, upstream.address().address + ':' + upstream.address().port, 'Host du serveur transmis');
    assert.equal(hit.token, 'tok', 'jeton transmis');
    const grant = await fetchText(relayPort, '/noctra/api/tv/cast', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: relayOrigin + '/noctra/api/tv/stream/x' }) });
    const grantBody = JSON.parse(grant.body.toString());
    const received = JSON.parse(upstreamHits.find(h => h.url === '/noctra/api/tv/cast').body);
    assert.equal(received.url, upstreamOrigin + '/noctra/api/tv/stream/x', 'requête : adresse du serveur, pas du relais');
    assert.equal(grantBody.url, relayOrigin + '/noctra/api/tv/stream/r?cast=1');
    const video = await fetchText(relayPort, '/video.ts');
    assert.equal(video.body.length, 188 * 4, 'segment vidéo relayé tel quel');
    const xml = (await fetchText(installPort, '/widgetlist.xml', { headers: { host: '192.168.1.20' } })).body.toString();
    assert.match(xml, /<download>http:\/\/192\.168\.1\.20\/Noctra\.zip<\/download>/, 'liste : adresse saisie sur le téléviseur');
    assert.match(xml, new RegExp(`<compression size="${built.size}" type="zip"/>`));
    const archive = await fetchText(installPort, '/Noctra.zip');
    assert.equal(archive.body.length, built.size, 'appli servie');
  } finally {
    children.forEach(child => child.kill());
    upstream.close();
  }
}

if (!process.env.KEEP_ORSAY_TEST) await rm(out, { recursive: true, force: true });
else console.log('Captures : ' + out);
console.log(`Noctra Samsung 2014 ${built.label} : paquet, ES5, style converti, émulation navigateur (compléments, touches, lecteur AVPlay simulé, relais, mosaïque, diagnostic), serveur d'installation et relais local : OK`);
