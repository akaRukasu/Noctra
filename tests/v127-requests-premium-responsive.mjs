import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));

const requestsStart = shell.indexOf('async function openRequests()');
const requestsEnd = shell.indexOf('\n\n  function ensureHlsLibrary', requestsStart);
const requestsBlock = shell.slice(requestsStart, requestsEnd);
assert.ok(requestsBlock.indexOf('setPanelBody(requestHomeShellMarkup') < requestsBlock.indexOf('const quick = await api(quickPath'),
  'Le cadre Demandes doit être peint avant la réponse Discovery.');
assert.ok(shell.includes('requestDiscoverySkeletonMarkup') && shell.includes('data-request-results-loading="true"'),
  'Le chargement initial doit conserver la structure visuelle de la page.');
assert.ok(shell.includes('srcset=') && shell.includes('fetchpriority='),
  'Les images TMDB des suggestions doivent être responsives et priorisées.');

const detailStart = server.indexOf('async function noctraMediaDetail');
const detailEnd = server.indexOf('\n\nconst tasteProfileCache', detailStart);
const detailBlock = server.slice(detailStart, detailEnd);
assert.ok(detailBlock.indexOf('const earlyAvailability') < detailBlock.indexOf('const [seerrDetail, tmdbDetail, legalPlatforms]'),
  'Prowlarr doit démarrer en parallèle des métadonnées.');
assert.ok(detailBlock.includes('await (earlyAvailability || prowlarrAvailability'),
  'Le résultat de disponibilité doit rester intégré à la même réponse.');
assert.ok(shell.includes('<nav class="noctra-media-detail-actions"'),
  'Les actions média doivent disposer de leur propre zone responsive.');
assert.ok(shell.includes('mediaDetailLoadingMarkup') && shell.includes("cachedApi(path, 5 * 60_000"),
  'La fiche doit afficher une structure immédiate et réutiliser les détails récents.');

assert.ok(css.includes('Noctra V127 — Demandes premium'));
assert.match(css, /\.noctra-smart-rail\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?max-width:\s*100% !important;/);
assert.match(css, /grid-template-areas:\s*\n\s*"poster main"\s*\n\s*"actions actions"\s*\n\s*"side side"/);
assert.match(css, /@media \(max-width: 360px\)[\s\S]*?\.noctra-media-detail-actions,[\s\S]*?grid-template-columns:\s*minmax\(0,1fr\) !important;/);
assert.match(css, /\.noctra-media-detail-actions \.noctra-button span[\s\S]*?text-overflow:\s*ellipsis !important;/);

console.log('v127 premium requests and responsive media detail checks passed');
