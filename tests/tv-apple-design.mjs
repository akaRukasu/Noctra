import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, extname } from 'node:path';

// Noctra TV 1.1.53 (Android TV, LG webOS, Samsung Tizen et 2014) : allure Apple TV.
// Menu en pastille centré qui s'efface en descendant, bannière de l'accueil sur toute la
// largeur sous le menu avec points de pagination, affiche choisie agrandie et soulevée,
// fiche en plein écran avec le logo du titre ; affichage léger sans flou ni ombres.
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const css = await read('apps/androidtv/web/app.css');
const app = await read('apps/androidtv/web/app.js');
assert.ok(!/aspect-ratio|\binset:/.test(css), 'CSS compatible Chromium < 88');
assert.match(css, /body\.scrolled #top \{ transform: translateY\(-110%\); opacity: 0; \}\s*body\.scrolled #top:focus-within \{ transform: none; opacity: 1; \}/);
assert.match(css, /html\.web-host #nav, html\.lite #nav, html\.web-host \.multibar, html\.lite \.multibar, html\.web-host \.modal, html\.lite \.modal \{ -webkit-backdrop-filter: none; backdrop-filter: none; \}/, 'pas de flou en affichage léger');
assert.match(css, /html\.web-host \.card:focus \.art::after, html\.lite \.card:focus \.art::after/, 'pas de reflet en affichage léger');
assert.ok(!/home-heading' \}/.test(app), 'accueil sans titre de page');
assert.match(app, /var top = scroller === main \? \(scrolledDown \? 24 : headerHeight\(\) \+ 8\) : s\.top \+ 20;/);

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')); }
const web = new URL('apps/androidtv/web/', root).pathname;
const picture = (w, h, fill) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`;
const item = (i, extra = {}) => ({ Id: 'it' + i, Name: 'Titre ' + i, Type: 'Movie', ProductionYear: 2020, Overview: 'Résumé.', Genres: ['Drame', 'Aventure'],
  ImageTags: { Primary: 'p', Logo: 'l', Thumb: 't' }, BackdropImageTags: ['b'], UserData: { PlayedPercentage: 30, PlaybackPositionTicks: 1 }, RunTimeTicks: 6e10, ...extra });
const resume = [item(0), item(1), item(2)];
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };
const json = (res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path.startsWith('/noctra/tv-app/')) {
    const file = path.slice('/noctra/tv-app/'.length) || 'index.html';
    try { const body = await readFile(join(web, file)); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
    return;
  }
  const image = path.match(/\/Images\/(\w+)/);
  if (image) { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(image[1] === 'Logo' ? picture(600, 150, '#fff') : picture(1920, 1080, '#345')); return; }
  if (path === '/noctra/api/home/resume') return json(res, { items: resume });
  if (path === '/noctra/api/session') return json(res, { user: { name: 'Lucas' } });
  if (path.startsWith('/noctra/')) return json(res, {});
  if (path === '/jellyfin/Users/Me') return json(res, { Name: 'Lucas', Id: 'user1' });
  if (/\/Views$/.test(path)) return json(res, { Items: [{ Id: 'lib1', Name: 'Films', CollectionType: 'movies', ImageTags: {} }] });
  if (/\/Latest$/.test(path)) return json(res, Array.from({ length: 12 }, (_, i) => item(i + 10)));
  const one = path.match(/\/Users\/user1\/Items\/it(\d+)$/);
  if (one) return json(res, item(Number(one[1])));
  json(res, { Items: [], TotalRecordCount: 0 });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await playwright.chromium.launch();
const errors = [];
try {
  for (const lite of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('noctra-tv-web-session-v1', JSON.stringify({ token: 'jf', userId: 'user1', userName: 'Lucas' })));
    await page.goto(origin + '/noctra/tv-app/index.html?platform=web');
    await page.waitForFunction(() => document.querySelectorAll('#main .card').length > 3 && document.querySelector('.premiere-count'), null, { timeout: 20000 });
    // Android TV (affichage complet) : mêmes fichiers, sans les classes de l'hôte web.
    if (!lite) await page.evaluate(() => document.documentElement.classList.remove('web-host', 'lite', 'host-web'));
    const layout = await page.evaluate(() => {
      const box = node => node.getBoundingClientRect();
      const nav = box(document.getElementById('nav'));
      const hero = box(document.querySelector('.premiere'));
      return {
        navCenter: Math.round(nav.left + nav.width / 2), hero: [Math.round(hero.top), Math.round(hero.width)], heroBottom: hero.bottom,
        dots: document.querySelectorAll('.premiere-count i').length, current: document.querySelectorAll('.premiere-count i.on').length,
        icons: Array.prototype.filter.call(document.querySelectorAll('#nav .nav svg'), svg => getComputedStyle(svg).display !== 'none').length,
        heading: Boolean(document.querySelector('.home-heading')), blur: getComputedStyle(document.getElementById('nav')).backdropFilter
      };
    });
    assert.ok(Math.abs(layout.navCenter - 640) <= 2, 'menu centré : ' + layout.navCenter);
    assert.deepEqual(layout.hero, [0, 1280], 'bannière sur toute la largeur, sous le menu');
    assert.equal(layout.dots, 3, 'un point par titre');
    assert.equal(layout.current, 1);
    assert.equal(layout.icons, 1, 'onglets en texte, seule la recherche garde son icône');
    assert.equal(layout.heading, false);
    assert.equal(layout.blur, lite ? 'none' : 'blur(24px) saturate(1.6)', lite ? 'pas de flou (LG, Samsung)' : 'menu translucide flouté');
    // Descendre dans les rangées : le menu s'efface ; l'affiche choisie grandit.
    const card = await page.evaluate(() => { const node = document.querySelector('.row .card'); node.focus(); return true; });
    assert.ok(card);
    await page.evaluate(() => { document.getElementById('main').scrollTop = 400; });
    await page.waitForFunction(() => document.body.classList.contains('scrolled'));
    await page.waitForTimeout(450);
    const scrolled = await page.evaluate(() => ({ top: document.getElementById('top').getBoundingClientRect().bottom, scale: getComputedStyle(document.activeElement).transform }));
    assert.ok(scrolled.top <= 0, 'menu effacé en descendant');
    assert.equal(scrolled.scale, 'matrix(1.1, 0, 0, 1.1, 0, 0)', 'affiche choisie agrandie');
    await page.evaluate(() => document.querySelector('#nav .nav').focus());
    await page.waitForTimeout(450);
    assert.ok(await page.evaluate(() => document.getElementById('top').getBoundingClientRect().top >= 0), 'menu revenu quand il reprend la main');
    // Fiche : plein écran, logo du titre.
    await page.evaluate(() => { document.getElementById('main').scrollTop = 0; document.querySelector('.row .card').click(); });
    await page.waitForFunction(() => document.querySelector('.detail h1.has-logo .detail-logo'), null, { timeout: 10000 });
    const detail = await page.evaluate(() => { const r = document.querySelector('.detail').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.width), getComputedStyle(document.querySelector('.detail-poster')).display]; });
    assert.deepEqual(detail, [0, 1280, 'none'], 'fiche en plein écran, sans affiche à gauche');
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
console.log('Noctra TV 1.1.53 : allure Apple TV (menu centré, bannière plein écran, affiche soulevée, fiche avec logo, affichage léger) : OK');
