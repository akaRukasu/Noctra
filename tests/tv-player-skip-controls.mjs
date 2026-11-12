// Lecteur LG webOS / Samsung Tizen / Samsung 2014 (tv-native.js) : ±15 s,
// « Passer le générique », « Passer le générique de fin », « Épisode suivant ».
// Vraie vidéo de 120 s (tests/fixtures/player-120s.webm) lue dans Chromium.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('apps/androidtv/web/tv-native.js', root), 'utf8');
const css = await readFile(new URL('apps/androidtv/web/app.css', root), 'utf8');
const video = await readFile(new URL('tests/fixtures/player-120s.webm', root));

// ── Analyse du code ─────────────────────────────────────────────────────
assert.ok(source.includes('var SEEK_STEP_MS = 15000;'), 'pas de 15 s');
assert.ok(!/seekBy\((?:-)?(?:10000|30000)\)|\? 30000 : -30000|\? 10000 : -10000/.test(source), 'plus de pas de 10 s / 30 s');
assert.ok(source.includes("return 'Passer le générique de fin';") && source.includes("return 'Passer le générique';"));
assert.ok(!source.includes('Player.learnSkip(video.currentTime'), 'plus de générique « appris » à partir des avances manuelles');
assert.ok(!/Passer l’intro|setTimeout\([^)]*skip\(\)/.test(source), 'aucun saut automatique');
assert.match(css, /\.nw-pills \{/);
assert.match(css, /\.nw-seek-note \{/);
assert.ok(!/Jellyfin/.test(source.match(/text: 'Épisode suivant'[^\n]*/)[0]));

let playwright;
try { playwright = createRequire(import.meta.url)('playwright'); } catch (error) {
  try { playwright = createRequire('/usr/lib/node_modules/')('playwright'); } catch (error2) { playwright = null; }
}
if (!playwright) { console.log('Lecteur TV : analyse OK (Playwright absent, lecture non testée)'); process.exit(0); }

const origin = 'http://tv.test';
const browser = await playwright.chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route(origin + '/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/tv-app/index.html') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body><script src="tv-native.js"></script></body></html>' });
    if (url.pathname === '/tv-app/tv-native.js') return route.fulfill({ contentType: 'application/javascript', body: source });
    if (url.pathname === '/media/film.webm') return route.fulfill({ contentType: 'video/webm', body: video, headers: { 'accept-ranges': 'bytes' } });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => {
    window.__fromHost = [];
    window.addEventListener('message', event => {
      if (event.data !== 'noctra-host' || !event.ports || !event.ports[0]) return;
      window.__port = event.ports[0];
      window.__port.onmessage = message => { try { window.__fromHost.push(JSON.parse(message.data)); } catch (error) { /* ignoré */ } };
    });
  });
  await page.goto(origin + '/tv-app/index.html?platform=webos');
  await page.waitForFunction(() => Boolean(window.__port));

  const send = message => page.evaluate(value => window.__port.postMessage(JSON.stringify(value)), message);
  const key = code => page.keyboard.press(code);
  const state = () => page.evaluate(() => {
    const v = document.querySelector('#nw-player video');
    const shown = node => Boolean(node && node.style.display !== 'none' && getComputedStyle(node).display !== 'none');
    const skip = document.querySelector('.nw-skip:not(.nw-next-ep)'), next = document.querySelector('.nw-next-ep'), note = document.querySelector('.nw-seek-note');
    return {
      open: Boolean(document.querySelector('#nw-player')),
      at: v ? v.currentTime : -1, paused: v ? v.paused : null,
      skip: shown(skip) ? skip.textContent : '', next: shown(next) ? next.textContent : '',
      focus: document.activeElement === skip ? 'skip' : document.activeElement === next ? 'next' : (document.activeElement && document.activeElement.getAttribute('aria-label')) || '',
      note: shown(note) ? note.textContent : '',
      buttons: Array.prototype.map.call(document.querySelectorAll('.nw-btn'), b => b.getAttribute('aria-label'))
    };
  });
  const seekTo = seconds => page.evaluate(s => { document.querySelector('#nw-player video').currentTime = s; }, seconds);
  const waitAt = (min, max) => page.waitForFunction(([a, b]) => { const v = document.querySelector('#nw-player video'); return v && v.currentTime >= a && v.currentTime <= b && !v.seeking; }, [min, max], { timeout: 8000 });
  const closed = () => page.waitForFunction(() => window.__fromHost.some(m => m.type === 'playerClosed'), null, { timeout: 8000 }).then(() => page.evaluate(() => window.__fromHost.filter(m => m.type === 'playerClosed').pop()));
  const play = async extra => {
    await page.evaluate(() => { window.__fromHost.length = 0; });
    await send(Object.assign({ action: 'play', vod: true, url: origin + '/media/film.webm', mime: 'video/webm', title: 'Épisode 1', playSessionId: 'p' + Date.now() }, extra));
    await page.waitForFunction(() => { const v = document.querySelector('#nw-player video'); return v && v.readyState >= 2 && !v.paused && v.currentTime > 0; }, null, { timeout: 15000 });
  };

  // 1. Épisode avec générique (0–20 s), générique de fin (90–110 s, scène après) et suite.
  await play({ episode: true, segments: [{ type: 'intro', startMs: 0, endMs: 20000 }, { type: 'outro', startMs: 90000, endMs: 110000 }], next: { id: 'e2', title: 'Épisode 2' } });
  await page.waitForFunction(() => /Passer le générique$/.test((document.querySelector('.nw-skip') || {}).textContent || ''), null, { timeout: 5000 });
  let s = await state();
  assert.equal(s.skip, 'Passer le générique');
  assert.equal(s.next, '', '« Épisode suivant » caché pendant le générique de début');
  assert.equal(s.focus, 'skip', 'bouton sélectionné à la télécommande');
  await key('Enter');
  await waitAt(19.5, 22);
  s = await state();
  assert.equal(s.skip, '', 'bouton retiré après le saut');
  assert.ok(s.open);

  // ±15 s aux flèches, appuis répétés cumulés, retour visuel.
  await key('ArrowRight'); await key('ArrowRight'); await key('ArrowRight');
  s = await state();
  assert.match(s.note, /^⟳ \+45 s · 1:0\d$/, 'retour visuel cumulé : ' + s.note);
  await waitAt(63, 68);
  // Pause conservée pendant les sauts.
  await key('Pause');
  await page.waitForFunction(() => document.querySelector('#nw-player video').paused);
  await page.waitForTimeout(1900);
  await key('ArrowLeft');
  s = await state();
  assert.match(s.note, /^⟲ −15 s/);
  await page.waitForTimeout(900);
  s = await state();
  assert.ok(s.paused, 'reste en pause après −15 s');
  assert.ok(s.at > 48 && s.at < 53, 'recul de 15 s : ' + s.at);
  await key('Pause');
  // Bornes : début du titre.
  await seekTo(5); await waitAt(4.5, 7);
  await page.waitForTimeout(1900);
  await key('ArrowLeft');
  await page.waitForTimeout(900);
  s = await state();
  assert.ok(s.at < 1.5, 'arrêt au début : ' + s.at);
  // Bornes : fin du titre (une seconde avant la fin, pas de fermeture).
  await seekTo(112); await waitAt(111.5, 114);
  await page.waitForTimeout(1900);
  await key('ArrowRight');
  await page.waitForTimeout(900);
  s = await state();
  assert.ok(s.at >= 117 && s.at <= 119.5, 'arrêt avant la fin : ' + s.at);
  assert.ok(s.open, 'le lecteur reste ouvert');

  // Générique de fin : deux boutons distincts, ◀ ▶ de l'un à l'autre.
  await seekTo(95); await waitAt(94.5, 97);
  await page.waitForFunction(() => /générique de fin/.test((document.querySelector('.nw-skip') || {}).textContent || ''), null, { timeout: 5000 });
  s = await state();
  assert.equal(s.skip, 'Passer le générique de fin');
  assert.equal(s.next, 'Épisode suivant');
  assert.equal(s.focus, 'skip');
  await key('ArrowRight');
  assert.equal((await state()).focus, 'next');
  await key('ArrowLeft');
  assert.equal((await state()).focus, 'skip');
  // « Passer le générique de fin » : fin du générique, scène après le générique gardée.
  await key('Enter');
  await waitAt(109.5, 112);
  s = await state();
  assert.ok(s.open, 'pas de fermeture : scène après le générique');
  assert.equal(s.skip, '');
  // Commandes : ±15 s et « Épisode suivant » visibles.
  await key('ArrowUp');
  s = await state();
  assert.deepEqual(s.buttons.slice(0, 3), ['Lecture / pause', 'Reculer de 15 secondes', 'Avancer de 15 secondes']);
  assert.equal(s.next, 'Épisode suivant', 'suite proposée commandes ouvertes');
  await page.evaluate(() => document.querySelector('.nw-next-ep').click());
  let result = await closed();
  assert.equal(result.next, true, 'épisode suivant demandé');
  assert.equal(result.ended, true);

  // Boutons ±15 s des commandes (au clic / OK).
  await play({ startMs: 30000 });
  await waitAt(29.5, 33);
  await key('ArrowUp');
  await key('ArrowRight');
  assert.equal((await state()).focus, 'Reculer de 15 secondes');
  await key('Enter'); await key('Enter');
  assert.match((await state()).note, /^⟲ −30 s/);
  await waitAt(0, 5);
  await key('ArrowRight');
  await key('Enter');
  await waitAt(14, 20);

  // 2. Film sans marqueurs ni suite : aucun bouton « Passer… » ni « Épisode suivant ».
  s = await state();
  assert.equal(s.skip, ''); assert.equal(s.next, '');
  await seekTo(100); await page.waitForTimeout(800);
  s = await state();
  assert.equal(s.skip, ''); assert.equal(s.next, '');
  // Retour : ferme d'abord les commandes, puis le lecteur.
  await key('Escape');
  assert.ok((await state()).open);
  await key('Escape');
  result = await closed();
  assert.equal(result.next, false);

  // 3. Générique de fin jusqu'à la fin du fichier : fin du titre, pas de suite automatique.
  await play({ episode: true, segments: [{ type: 'outro', startMs: 100000, endMs: 120000 }], next: { id: 'e3', title: 'Épisode 3' } });
  await seekTo(101);
  await page.waitForFunction(() => /générique de fin/.test((document.querySelector('.nw-skip') || {}).textContent || ''), null, { timeout: 5000 });
  await page.waitForTimeout(3000);
  assert.ok((await state()).open, 'aucun saut automatique');
  await key('Enter');
  result = await closed();
  assert.equal(result.ended, true);
  assert.equal(result.next, false, 'passer le générique ≠ épisode suivant');

  // 4. Direct sans fenêtre de retour : pas de ±15 s.
  await page.evaluate(() => {
    window.__seekable = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'seekable');
    Object.defineProperty(HTMLMediaElement.prototype, 'seekable', { configurable: true, get() { return { length: 0, start() { return 0; }, end() { return 0; } }; } });
  });
  await page.evaluate(() => { window.__fromHost.length = 0; });
  await send({ action: 'play', url: origin + '/media/film.webm', mime: 'video/webm', title: 'France 2', epg: null, playSessionId: 'live1' });
  await page.waitForFunction(() => window.__fromHost.some(m => m.type === 'playerEvent' && m.action === 'playing'), null, { timeout: 15000 });
  await key('Enter');
  s = await state();
  assert.ok(!s.buttons.includes('Reculer de 15 secondes'), 'direct sans fenêtre : ' + s.buttons.join(', '));
  // Touche ⏪ de la télécommande (412) : sans effet sans fenêtre de retour.
  await page.evaluate(() => { const e = new KeyboardEvent('keydown', { bubbles: true }); Object.defineProperty(e, 'keyCode', { get: () => 412 }); window.dispatchEvent(e); });
  assert.equal((await state()).note, '');
  await key('Escape'); await key('Escape');
  await closed();

  // 5. Direct avec fenêtre de retour (120 s) : ±15 s, bornés à la fenêtre.
  await page.evaluate(() => { Object.defineProperty(HTMLMediaElement.prototype, 'seekable', window.__seekable); window.__fromHost.length = 0; });
  await send({ action: 'play', url: origin + '/media/film.webm', mime: 'video/webm', title: 'France 2', epg: null, playSessionId: 'live2' });
  await page.waitForFunction(() => window.__fromHost.some(m => m.type === 'playerEvent' && m.action === 'playing'), null, { timeout: 15000 });
  await seekTo(60); await waitAt(59.5, 63);
  await key('Enter');
  s = await state();
  assert.deepEqual(s.buttons.slice(1, 3), ['Reculer de 15 secondes', 'Avancer de 15 secondes'], 'direct avec fenêtre : ' + s.buttons.join(', '));
  await key('ArrowRight');
  await key('Enter');
  assert.equal((await state()).note, '⟲ −15 s', 'direct : retour visuel sans horloge');
  await waitAt(44, 50);
  // Bord de la fenêtre : jamais repoussé dans l'autre sens.
  await seekTo(1); await waitAt(0.5, 3);
  await page.waitForTimeout(1900);
  await key('Enter');
  assert.match((await state()).note, /^⟲ (Début|−[0-2] s)$/);
  await page.waitForTimeout(900);
  assert.ok((await state()).at < 4, 'reste au début de la fenêtre');
  console.log('Lecteur TV (LG / Samsung) : ±15 s, générique, générique de fin, épisode suivant : OK');
} finally {
  await browser.close();
}
