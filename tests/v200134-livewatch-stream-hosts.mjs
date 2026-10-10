// 200.0.134 — flux directs LiveWatch (« VIP · CABLE », « VIP · SAT »…) en
// échec sur livewatch.icu : un flux servi par un sous-domaine LiveWatch, ou
// atteint par redirection vers un sous-domaine, ne recevait plus la session
// VIP. Diagnostic : hôte et réponse d'un flux direct.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [server, shell, html, pkg] = await Promise.all([read('server.mjs'), read('public/noctra-shell.js'), read('public/client/index.html'), read('package.json')]);

assert.match(server, /const trustedLiveWatchRedirect = isLiveWatchFamilyHost\(url\.hostname\) && isLiveWatchFamilyHost\(nextUrl\.hostname\);/, 'Redirection vers un sous-domaine : session gardée');
assert.match(server, /const liveWatchHost = isLiveWatchFamilyHost\(streamUrl\.hostname\.toLowerCase\(\)\);/, 'Flux d’un sous-domaine : session jointe');
assert.match(server, /\.\.\.\(liveWatchHost \? \{ authorization: `Bearer \$\{session\.accessToken\}` \} : \{\}\),/);
// La redirection ne garde jamais la session vers un autre site.
const redirect = server.slice(server.indexOf('const trustedOhaRedirect'), server.indexOf('const trustedProviderRedirect'));
assert.ok(!/livewatch\.(?:icu|top)/.test(redirect.replace(/\/\/.*$/gm, '')), 'Pas de domaine en dur');
assert.match(server, /\.\.\.\(trustedLiveWatchRedirect \? \[\] : \['authorization', 'apikey'\]\),/);
// Diagnostic.
assert.match(server, /async function liveWatchDiagnosticStream\(ref\)/);
assert.match(server, /const stream = await liveWatchDiagnosticStream\(ref\)\.catch/);
assert.match(server, /sessionSent: Boolean\(reference\.headers\?\.authorization\)/);
assert.match(server, /path: target\.pathname\.replace\(\/\[A-Za-z0-9_-\]\{24,\}\/g, '…'\)/, 'Jetons masqués dans le chemin');

assert.match(pkg, /"version": "200\.0\.134"/);
assert.match(shell, /const NOCTRA_BUILD_VERSION = '200\.0\.134';/);
assert.equal((server.match(/'200\.0\.134'/g) || []).length, 2);
assert.ok(!html.includes('v=200.133') && html.includes('noctra-shell.js?v=200.134'));
console.log('v200.0.134 : session VIP jointe aux flux des sous-domaines LiveWatch, diagnostic du flux : OK');
