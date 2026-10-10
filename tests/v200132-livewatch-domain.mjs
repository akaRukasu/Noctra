// 200.0.132 — LiveWatch a quitté livewatch.top pour livewatch.icu.
// Domaine unique (LIVEWATCH_ORIGIN), ancien domaine reconnu et réécrit vers
// le nouveau (liens en cache, catalogue gardé sur disque ignoré).
// Alternative : L'Equipe TV, TF1 et « ESPN FR by DISNEY » sans « + » acceptés.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [server, shell, html, pkg, audit] = await Promise.all([
  read('server.mjs'), read('public/noctra-shell.js'), read('public/client/index.html'), read('package.json'), read('scripts/audit-tv-sources.mjs')
]);

// Plus aucun lien en dur vers l'ancien domaine (hors commentaires et liste des hôtes reconnus).
const code = server.split('\n').filter(line => !/^\s*\/\//.test(line));
const hardcoded = code.filter(line => /livewatch\.top/.test(line) && !/new Set\(\['livewatch\.icu', 'livewatch\.top'\]/.test(line));
assert.deepEqual(hardcoded, [], 'Aucune adresse livewatch.top en dur dans le serveur');
assert.match(server, /const liveWatchOrigin = withoutSlash\(process\.env\.LIVEWATCH_ORIGIN \|\| 'https:\/\/livewatch\.icu'\);/);
assert.match(server, /\['LiveWatch', `\$\{liveWatchOrigin\}\/api\/v1\/public\/all`\]/);
assert.ok((server.match(/`\$\{liveWatchOrigin\}\/api\/v1\/public\//g) || []).length >= 14, 'Toutes les API LiveWatch sur le domaine actuel');
assert.ok(server.indexOf('const liveWatchOrigin =') < server.indexOf('const liveWatchChannelCatalogUrls'), 'Domaine défini avant les catalogues');

// Fonctions du domaine, exécutées.
const start = server.indexOf('const liveWatchOrigin =');
const end = server.indexOf('const liveWatchChannelCatalogUrls');
const helpers = Function('withoutSlash', 'process', `${server.slice(start, end)}; return { isLiveWatchHost, currentLiveWatchUrl, liveWatchOrigin };`)(
  value => String(value || '').replace(/\/+$/, ''), { env: {} }
);
assert.equal(helpers.liveWatchOrigin, 'https://livewatch.icu');
for (const host of ['livewatch.icu', 'www.livewatch.icu', 'livewatch.top', 'WWW.LIVEWATCH.TOP']) assert.ok(helpers.isLiveWatchHost(host), host);
assert.ok(!helpers.isLiveWatchHost('evil-livewatch.icu') && !helpers.isLiveWatchHost('livewatch.icu.evil.com'));
assert.equal(helpers.currentLiveWatchUrl('https://livewatch.top/embed/north/tf1?x=1'), 'https://livewatch.icu/embed/north/tf1?x=1');
assert.equal(helpers.currentLiveWatchUrl('https://www.livewatch.top/api/v1/public/all'), 'https://livewatch.icu/api/v1/public/all');
assert.equal(helpers.currentLiveWatchUrl('https://livewatch.icu/embed/1'), 'https://livewatch.icu/embed/1');
assert.equal(helpers.currentLiveWatchUrl('https://oha.cx/x'), 'https://oha.cx/x', 'Autres sites inchangés');
const other = Function('withoutSlash', 'process', `${server.slice(start, end)}; return { currentLiveWatchUrl, isLiveWatchHost };`)(
  value => String(value || '').replace(/\/+$/, ''), { env: { LIVEWATCH_ORIGIN: 'https://livewatch.example' } }
);
assert.equal(other.currentLiveWatchUrl('https://livewatch.icu/embed/1'), 'https://livewatch.example/embed/1', 'Prochain domaine réglable par LIVEWATCH_ORIGIN');
assert.ok(other.isLiveWatchHost('www.livewatch.example'));

// Requêtes, catalogues, cache disque.
assert.match(server, /let url = await assertPublicTvUrl\(currentLiveWatchUrl\(/, 'Ancien lien réécrit avant toute requête');
assert.match(server, /function parseLiveWatchCatalog\(payload, baseUrl\) \{\s*const catalog = parseLiveWatchCatalogLinks\(payload, currentLiveWatchUrl\(baseUrl\)\);/);
assert.match(server, /if \(payload\?\.origin !== liveWatchOrigin\) return null;/, 'Catalogue disque de l’ancien domaine ignoré');
assert.match(server, /JSON\.stringify\(\{ savedAt: Date\.now\(\), origin: liveWatchOrigin, value \}\)/);
assert.match(server, /output = output\.replace\(\/https:\\\/\\\/\(\?:www\\\.\)\?livewatch\\\.\(\?:icu\|top\)/);
// Client web.
assert.match(shell, /new Set\(\['livewatch\.icu', 'www\.livewatch\.icu', 'livewatch\.top', 'www\.livewatch\.top',/);
assert.match(shell, /if \(!\/\^\(\?:www\\\.\)\?livewatch\\\.\(\?:icu\|top\)\$\/i\.test\(url\.hostname\)\) return null;/);
assert.match(shell, /return currentLiveWatchEmbedUrl\(/);
assert.match(audit, /\['LiveWatch','https:\/\/livewatch\.icu\/'\]/);

// Alternative (Haloule, page mise à jour le 10/10/26) : nouveaux noms acceptés.
const halouleStart = server.indexOf('function normalizeHalouleDirectSportLabel');
const halouleEnd = server.indexOf('function halouleLinkAllowed');
const halouleAllowed = Function('decodeTvHtml', `${server.slice(halouleStart, halouleEnd)}; return halouleDirectSportLabelAllowed;`)(value => value);
for (const label of ['Canal+ Sport 360', 'C+ Live 10*', 'LIGUE 1+ 5 (v2)', 'BeinSport FR 3', 'MAX 10', 'RMC Sport 1', 'EuroSport 2', 'ESPN FR by DISNEY', 'ESPN FR by DISNEY+', "L'Equipe TV", 'L’Equipe TV', 'TF1', 'AutoMoto', 'SPORTenFRANCE', 'Trace Toca', 'Bblack Caribbean', 'Clubbing TV']) {
  assert.ok(halouleAllowed(label), label);
}
for (const label of ['Android TV', 'Télécharger', 'VPN']) assert.ok(!halouleAllowed(label), label);

assert.match(pkg, /"version": "200\.0\.132"/);
assert.match(shell, /const NOCTRA_BUILD_VERSION = '200\.0\.132';/);
assert.equal((server.match(/'200\.0\.132'/g) || []).length, 2);
assert.ok(!html.includes('v=200.131') && html.includes('noctra-shell.js?v=200.132'));
console.log('v200.0.132 : LiveWatch sur livewatch.icu (ancien domaine reconnu et redirigé) : OK');
