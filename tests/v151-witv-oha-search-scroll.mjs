import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));

// Recherche TV : l'ancien listener de virtualisation ne doit plus vider les
// résultats lorsqu'une recherche repasse sous le seuil virtuel puis qu'on scroll.
assert.ok(shell.includes("if (list.dataset.virtual !== 'true') return;"));
assert.ok(shell.includes('function unbindTvVirtualList(list)'));
assert.match(shell, /list\.removeAttribute\('data-virtual'\);[\s\S]{0,180}unbindTvVirtualList\(list\);/);
assert.match(shell, /if \(resetLimit\) \{[\s\S]{0,120}list\.scrollTop = 0;/);

// OHA : depuis v153, seules les routes /watch réellement publiées/confirmées
// passent avant /live. Le fallback /live reste obligatoire et le bridge détecte
// toujours les écrans NOT FOUND de la SPA.
const ohaCandidates = server.slice(server.indexOf('function ohaOfficialPageCandidates'), server.indexOf('async function selectOhaOfficialPage'));
assert.ok(ohaCandidates.includes("for (const candidate of Array.isArray(routeCandidates) ? routeCandidates : []) add(candidate);"));
assert.ok(ohaCandidates.includes("add(new URL('/live', root).toString())"));
assert.ok(server.includes('unknown\\s+route')); 

// WiTV : le HLS est détecté plus largement, vérifié comme vraie playlist et le
// cookie du player est conservé dans le relais des segments.
assert.ok(server.includes('function wiTvStreamCandidatesFromPlayerHtml'));
assert.ok(server.includes('async function validateWiTvHlsStream'));
assert.ok(server.includes('const playerCookie = tvResponseCookieHeader(response)'));
assert.ok(server.includes("if (!/#EXTM3U/i.test(text.slice(0, 128 * 1024)))"));
assert.ok(server.includes("...(playerCookie ? { cookie: playerCookie } : {})"));

console.log('v153 WiTV/OHA/search-scroll regression checks: OK');
