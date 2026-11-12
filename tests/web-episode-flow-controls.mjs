// Lecteur web (Jellyfin web + noctra-episode-flow.js) : « Passer le générique »,
// « Passer le générique de fin », ±15 s à 15 s par
// défaut sans écraser un réglage, retour visuel. Lecteur Jellyfin simulé
// autour d'une vraie vidéo de 120 s (tests/fixtures/player-120s.webm).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const flowJs = await readFile(new URL('public/noctra-episode-flow.js', root), 'utf8');
const flowCss = await readFile(new URL('public/noctra-episode-flow.css', root), 'utf8');
const video = await readFile(new URL('tests/fixtures/player-120s.webm', root));

let playwright;
try { playwright = createRequire(import.meta.url)('playwright'); } catch {
  try { playwright = createRequire('/usr/lib/node_modules/')('playwright'); } catch { playwright = null; }
}
if (!playwright) { console.log('Lecteur web : Playwright absent, non testé'); process.exit(0); }

const origin = 'http://web.test';
const browser = await playwright.chromium.launch({ executablePath: process.env.NOCTRA_TEST_CHROMIUM || undefined });
try {
  const run = async ({ segments, chapters, next, settings, embeddedChapters = chapters, nextDelay = 0 }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.route(origin + '/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/web/index.html') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><style>${flowCss}</style></head><body><div class="videoPlayerContainer"><video class="htmlvideoplayer" src="/media/e1.webm" muted></video></div><div class="videoOsdBottom videoOsdBottom-hidden"></div><script src="flow.js"></script></body></html>` });
      if (url.pathname === '/web/flow.js') return route.fulfill({ contentType: 'application/javascript', body: flowJs });
      if (url.pathname === '/media/e1.webm') return route.fulfill({ contentType: 'video/webm', body: video, headers: { 'accept-ranges': 'bytes' } });
      return route.fulfill({ status: 404, body: '' });
    });
    await page.addInitScript(({ segments, chapters, next, settings, embeddedChapters, nextDelay }) => {
      const item = { Id: 'e1', Type: 'Episode', SeriesId: 's1', Name: 'Pilote', ParentIndexNumber: 1, IndexNumber: 1, RunTimeTicks: 120 * 1e7, Chapters: embeddedChapters };
      window.__calls = [];
      window.__prefs = Object.assign({}, settings);
      const video = () => document.querySelector('video');
      const manager = {
        getCurrentPlayer: () => ({ id: 'html' }),
        currentItem: () => item,
        currentTime: () => (video()?.currentTime || 0) * 1000,
        duration: () => 120 * 1e7,
        seek: ticks => { window.__calls.push(['seek', ticks / 1e7]); video().currentTime = ticks / 1e7; },
        stop: () => window.__calls.push(['stop']),
        play: options => { window.__calls.push(['play', options.items[0].Id]); return Promise.resolve(); },
        nextTrack: () => window.__calls.push(['nextTrack']),
        getNextItem: () => null
      };
      const userSettings = {
        get: name => window.__prefs[name],
        skipForwardLength: value => { window.__prefs.skipForwardLength = String(value); },
        skipBackLength: value => { window.__prefs.skipBackLength = String(value); }
      };
      const modules = { 39738: { f: manager }, 82885: userSettings };
      window.webpackChunk = { push: chunk => chunk[2](id => modules[id]) };
      window.ApiClient = {
        getCurrentUserId: () => 'u1',
        getUrl: (path, query) => path + (query ? '?' + new URLSearchParams(query) : ''),
        getJSON: async url => {
          if (url.startsWith('MediaSegments/')) return { Items: segments };
          if (url.startsWith('Users/u1/Items/')) return { ...item, Chapters: chapters };
          if (url.startsWith('Shows/s1/Episodes')) {
            await new Promise(resolve => setTimeout(resolve, nextDelay));
            window.__nextLoaded = true;
            return { Items: next ? [item, next] : [item] };
          }
          throw new Error('404 ' + url);
        },
        getImageUrl: () => ''
      };
    }, { segments, chapters, next, settings, embeddedChapters, nextDelay });
    await page.goto(origin + '/web/index.html');
    await page.evaluate(() => document.querySelector('video').play());
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0.2);
    return page;
  };
  const visible = (page, selector) => page.evaluate(sel => { const n = document.querySelector(sel); return n && n.dataset.visible === 'true' ? n.textContent.trim() : ''; }, selector);
  const seekTo = (page, s) => page.evaluate(v => { document.querySelector('video').currentTime = v; }, s);
  const at = page => page.evaluate(() => document.querySelector('video').currentTime);

  // 1. Segments du serveur : générique 0–20 s, générique de fin 90–110 s (scène après), épisode suivant.
  const next = { Id: 'e2', Type: 'Episode', SeriesId: 's1', Name: 'Suite', ParentIndexNumber: 1, IndexNumber: 2, Overview: 'Résumé.' };
  let page = await run({ segments: [{ Type: 'Intro', StartTicks: 0, EndTicks: 20e7 }], chapters: [
    { Name: 'Ending', StartPositionTicks: 90e7 },
    { Name: 'Scène finale', StartPositionTicks: 110e7 }
  ], embeddedChapters: [], next, nextDelay: 3_000, settings: {} });
  await page.waitForFunction(() => document.querySelector('.noctra-skip-segment')?.dataset.visible === 'true', null, { timeout: 8000 });
  assert.match(await visible(page, '.noctra-skip-segment'), /^Passer le générique⏭$/);
  assert.equal(await page.evaluate(() => Boolean(window.__nextLoaded)), false, 'le générique est utilisable avant le chargement du prochain épisode');
  // ±15 s réglés à 15 s (jamais réglés par l'utilisateur).
  assert.deepEqual(await page.evaluate(() => window.__prefs), { skipForwardLength: '15000', skipBackLength: '15000' });
  await page.click('.noctra-skip-segment');
  await page.waitForFunction(() => document.querySelector('video').currentTime >= 19.5);
  assert.equal(await visible(page, '.noctra-skip-segment'), '');
  await page.evaluate(() => document.querySelector('.videoOsdBottom').classList.remove('videoOsdBottom-hidden'));
  await page.waitForFunction(() => window.__nextLoaded);
  assert.equal(await page.locator('.noctra-next-episode').count(), 0);
  // Retour visuel cumulé de sauts de 15 s répétés.
  await page.evaluate(async () => {
    const v = document.querySelector('video');
    window.__log = []; for (let i = 0; i < 3; i++) { const from = v.currentTime; v.currentTime += 15; await new Promise(r => v.addEventListener("seeked", r, { once: true })); window.__log.push([from, v.currentTime]); }
  });
  assert.match(await visible(page, '.noctra-seek-note'), /^⟳ \+45 s$/, JSON.stringify(await page.evaluate(() => window.__log)));
  // Générique de fin issu du chapitre quand Jellyfin ne fournit que l'intro.
  await seekTo(page, 92);
  await page.waitForFunction(() => /générique de fin/.test(document.querySelector('.noctra-skip-segment')?.textContent || '') && document.querySelector('.noctra-skip-segment').dataset.visible === 'true', null, { timeout: 5000 });
  assert.equal(await visible(page, '.noctra-up-next'), '');
  await page.click('.noctra-skip-segment');
  await page.waitForFunction(() => document.querySelector('video').currentTime >= 109.5);
  const calls = await page.evaluate(() => window.__calls);
  assert.ok(!calls.some(c => c[0] === 'play' || c[0] === 'stop'), 'passer le générique de fin ne lance pas l’épisode suivant : ' + JSON.stringify(calls));
  assert.ok((await at(page)) < 115, 'scène après le générique visible');
  // La carte de fin reste disponible après le saut, sans bouton permanent.
  await page.waitForFunction(() => document.querySelector('.noctra-up-next')?.dataset.visible === 'true');
  await page.click('.noctra-up-next-play');
  await page.waitForFunction(() => window.__calls.some(c => c[0] === 'play' && c[1] === 'e2'));
  await page.close();

  // 2. Sans segments ni chapitres nommés, réglage ±10/30 de l'utilisateur : rien d'inventé, réglage gardé.
  page = await run({ segments: [], chapters: [{ Name: 'Chapitre 1', StartPositionTicks: 0 }, { Name: 'Chapitre 2', StartPositionTicks: 60e7 }], next: null, settings: { skipForwardLength: '30000', skipBackLength: '10000' } });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const v = document.querySelector('video');
    v.currentTime = 2; await new Promise(r => v.addEventListener('seeked', r, { once: true }));
    v.currentTime = 40; await new Promise(r => v.addEventListener('seeked', r, { once: true }));
  });
  await page.waitForTimeout(1200);
  assert.equal(await visible(page, '.noctra-skip-segment'), '', 'pas de bouton sans marqueur (ni générique appris)');
  assert.deepEqual(await page.evaluate(() => window.__prefs), { skipForwardLength: '30000', skipBackLength: '10000' }, 'réglage de l’utilisateur conservé');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => /intro/i.test(k)).length), 0, 'aucun générique mémorisé');
  await page.close();

  // 3. Chapitres nommés « Opening » / « Ending » : boutons proposés.
  page = await run({ segments: [], chapters: [{ Name: 'Prologue', StartPositionTicks: 0 }, { Name: 'Opening', StartPositionTicks: 0.5e7 }, { Name: 'Partie A', StartPositionTicks: 15e7 }, { Name: 'Ending', StartPositionTicks: 100e7 }], next: null, settings: {} });
  await page.waitForFunction(() => document.querySelector('.noctra-skip-segment')?.dataset.visible === 'true', null, { timeout: 8000 });
  assert.match(await visible(page, '.noctra-skip-segment'), /^Passer le générique⏭$/);
  await seekTo(page, 101);
  await page.waitForFunction(() => /générique de fin/.test(document.querySelector('.noctra-skip-segment')?.textContent || ''), null, { timeout: 5000 });
  await page.waitForTimeout(2500);
  assert.ok((await at(page)) < 106, 'aucun saut automatique');
  await page.close();
  console.log('Lecteur web : génériques et scène post-générique, enchaînement de fin et ±15 s : OK');
} finally {
  await browser.close();
}
