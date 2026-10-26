import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Multiview (iOS 2.18.0, Android 1.9.5) : vignettes des lecteurs des sites en « vidéo seule ».
// La vidéo qui joue (page ou cadre) remplit la vignette ; publicités, bulles, contrôles et
// logos du site sont masqués ; « Afficher toute la page du site » rétablit la page.
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const swift = await read('apps/ios-native/Noctra/Sources/LiveTVViews.swift');
const kotlin = await read('apps/android-native/app/src/main/java/com/noctra/mobile/live/LivePlayerScreen.kt');
const iosScript = /static let focusScript = """\n([\s\S]*?)\n    """/.exec(swift)[1].split('\n').map(line => line.replace(/^    /, '')).join('\n');
const androidScript = /internal val focusScript = """\n([\s\S]*?)\n"""/.exec(kotlin)[1];
assert.equal(iosScript, androidScript, 'même script sur iPhone et Android');
assert.ok(!/[\\$]/.test(iosScript), 'script sans échappement (Swift, Kotlin)');
assert.match(swift, /if let muted \{[\s\S]*?WKUserScript\(source: Self\.focusScript, injectionTime: \.atDocumentStart, forMainFrameOnly: false\)/, 'iOS : vignettes seulement, tous les cadres');
assert.match(kotlin, /if \(muted != null\) runCatching \{ WebViewCompat\.addDocumentStartJavaScript\(view, focusScript, setOf\("\*"\)\) \}/, 'Android : vignettes seulement, tous les cadres');
const iosTile = await read('apps/ios-native/Noctra/Sources/Multiview.swift');
assert.match(iosTile, /Button\(tile\.fullPage \? "Vidéo seule \(masquer le site\)" : "Afficher toute la page du site"\) \{ tile\.setFullPage\(!tile\.fullPage\) \}/);
assert.match(iosTile, /window\.__noctraFocus&&window\.__noctraFocus\(\\\(!value\)\)/);
const androidTile = await read('apps/android-native/app/src/main/java/com/noctra/mobile/live/Multiview.kt');
assert.match(androidTile, /SettingRow\(if \(tile\.fullPage\) "Vidéo seule \(masquer le site\)" else "Afficher toute la page du site"/);

// Comportement dans un navigateur : page avec bulle, cadre du lecteur avec publicité et contrôles.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')); }
const fake = `Object.defineProperty(HTMLMediaElement.prototype,'paused',{get(){return !this.hasAttribute('data-playing')}});Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get(){return this.hasAttribute('data-playing')?4:0}});`;
const player = `<!doctype html><body style="margin:0"><div style="transform:translateZ(0);padding:40px"><div id="ad" style="position:absolute;top:0;right:0;width:200px;height:60px;background:#29f">Offre</div><video id="v" width="320" height="180"></video><div id="ctl" style="position:absolute;left:0;bottom:0;width:100%;height:40px;background:#f00">Contrôles</div></div></body>`;
const page = `<!doctype html><body style="margin:0"><header style="height:120px">Site</header><button id="play">Lecture</button><div id="bubble" style="position:fixed;left:10px;bottom:10px;width:80px;height:80px;z-index:99">IA</div><iframe id="f" src="/player" style="width:480px;height:300px;border:0"></iframe></body>`;
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(req.url === '/player' ? player : page); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await playwright.chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  tab.on('pageerror', error => errors.push(error.message));
  await tab.addInitScript(fake + iosScript);
  await tab.goto(`http://127.0.0.1:${server.address().port}/`);
  await tab.waitForTimeout(400);
  assert.equal(await tab.evaluate(() => getComputedStyle(document.getElementById('play')).visibility), 'visible', 'avant la lecture : page entière (bouton Lecture du site)');
  const frame = tab.frames().find(f => f.url().endsWith('/player'));
  await frame.evaluate(() => { const v = document.getElementById('v'); v.setAttribute('data-playing', ''); v.dispatchEvent(new Event('playing', { bubbles: true })); });
  await tab.waitForTimeout(700);
  const top = await tab.evaluate(() => ({ bubble: getComputedStyle(document.getElementById('bubble')).visibility, frame: document.getElementById('f').getBoundingClientRect().toJSON() }));
  const inner = await frame.evaluate(() => ({ ad: getComputedStyle(document.getElementById('ad')).visibility, ctl: getComputedStyle(document.getElementById('ctl')).visibility, video: document.getElementById('v').getBoundingClientRect().toJSON() }));
  assert.equal(top.bubble, 'hidden', 'bulle du site masquée');
  assert.deepEqual([top.frame.x, top.frame.y, top.frame.width, top.frame.height], [0, 0, 640, 360], 'cadre du lecteur sur toute la vignette');
  assert.equal(inner.ad, 'hidden', 'publicité masquée');
  assert.equal(inner.ctl, 'hidden', 'contrôles du site masqués');
  assert.deepEqual([inner.video.x, inner.video.y, inner.video.width, inner.video.height], [0, 0, 640, 360], 'vidéo sur tout le cadre (malgré un parent transformé)');
  await tab.evaluate(() => window.__noctraFocus(false));
  await tab.waitForTimeout(300);
  assert.equal(await tab.evaluate(() => document.documentElement.className), '', 'page entière à la demande');
  assert.equal(await frame.evaluate(() => document.documentElement.className), '', 'page entière dans le cadre aussi');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
console.log('Multiview iOS 2.18.0 / Android 1.9.5 : lecteurs des sites en vidéo seule (publicités et contrôles masqués) : OK');
