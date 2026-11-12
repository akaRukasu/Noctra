import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')); }

// Android TV noctra.82 : bloqueur de pubs, nettoyage dans la
// page du lecteur (adblock.js, placé en tête de page par l'appli) : fausse
// notification « in-page push » dans un coin, voile transparent qui ouvre une
// publicité, racine d'ombre fermée, petit cadre publicitaire retirés ; la vidéo,
// le grand cadre du lecteur et le menu du site restent.
const script = await readFile(new URL('../apps/androidtv/web/adblock.js', import.meta.url), 'utf8');
assert.ok(!/[^\x00-\x7F]/.test(script), 'script ASCII (page modifiée octet par octet)');
const page = `<!doctype html><html><head><script>${script}</script><title>embed</title></head><body style="margin:0">
<div id="player" style="position:fixed;inset:0;background:#000"><video muted></video><a href="https://brand.example/">logo</a></div>
<div id="bigframe" style="position:fixed;left:0;top:0;width:100vw;height:80vh"><iframe src="https://player.example/embed" style="width:100%;height:100%;border:0"></iframe></div>
<div id="menu" style="position:fixed;top:0;left:0"><a href="/autre">Accueil</a></div>
<div id="push" style="position:fixed;right:10px;top:10px;width:300px;height:80px;z-index:99999"><img alt=""><a href="https://ads.example/click">Dark Lust Strategy Game</a><span>x</span></div>
<a id="veil" href="https://ads.example/veil" style="position:fixed;inset:0;z-index:2147483647;opacity:0"></a>
<div id="shadow" style="position:fixed;right:0;bottom:0;width:200px;height:60px"></div>
<iframe id="adframe" src="https://ads.example/frame" style="position:fixed;left:0;bottom:0;width:300px;height:100px"></iframe>
<script>
  var root = document.getElementById('shadow').attachShadow({ mode: 'closed' });
  root.innerHTML = '<a href="https://ads.example/shadow">pub</a>';
  window.aclib = { runInPagePush: function () { document.title = 'pub'; } };
  window.aclib.runInPagePush();
  setTimeout(function () {
    var late = document.createElement('div');
    late.id = 'late';
    late.style.cssText = 'position:fixed;right:0;top:120px;width:280px;height:70px';
    late.innerHTML = '<a href="https://ads2.example/x">Claim rewards</a>';
    document.body.appendChild(late);
  }, 400);
</script></body></html>`;
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await playwright.chromium.launch();
try {
  const tab = await browser.newPage();
  await tab.route(url => !url.hostname.startsWith('127.0.0.1'), route => route.abort());
  await tab.goto(`http://127.0.0.1:${server.address().port}/embed.html`);
  await tab.waitForTimeout(1200);
  const present = await tab.evaluate(() => ['player', 'bigframe', 'menu', 'push', 'veil', 'shadow', 'adframe', 'late'].filter(id => document.getElementById(id)));
  assert.deepEqual(present, ['player', 'bigframe', 'menu'], 'pubs retirées, lecteur et menu gardés');
  assert.equal(await tab.title(), 'embed', 'bibliothèque aclib neutralisée');
  assert.equal(await tab.evaluate(() => document.querySelector('#player video') !== null), true);
} finally {
  await browser.close();
  server.close();
}

const web = await readFile(new URL('../apps/androidtv/java/com/noctra/tv/NoctraWebPlayerActivity.java', import.meta.url), 'utf8');
assert.match(web, /WebResourceResponse cleaned = adBlock && !lite && !compat \? adblockFetch\(request\) : null;/);
assert.match(web, /getAssets\(\)\.open\("noctra-tv\/adblock\.js"\)/);
assert.match(web, /if \(!request\.isForMainFrame\(\) && !accept\.contains\("text\/html"\)\) return null;/, 'pages seulement');
assert.match(web, /\(mode == MODE_COMPAT \|\| mode == MODE_ADBLOCK\) && \(code == 403 \|\| code == 429 \|\| code == 503 \|\| response\.header\("cf-mitigated"\) != null\)/, 'défi anti-robots : la WebView refait la requête');
assert.match(web, /dropScriptPolicy\(headers\);/);
console.log('Android TV noctra.82 : bloqueur de pubs, fausses notifications et voiles publicitaires retirés de la page du lecteur : OK');
