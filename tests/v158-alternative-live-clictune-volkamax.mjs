import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));
assert.ok(server.includes("version: '200.0.21'"));

assert.ok(server.includes('function extractDlinkFinalUrl'), 'Alternative doit extraire le vrai lien Dlink.');
assert.ok(server.includes('async function resolveAlternativePublicTarget'), 'Alternative doit résoudre les raccourcisseurs publics côté serveur.');
assert.ok(server.includes('alternativeShortenerHost(current)'), 'Le résolveur doit se limiter aux raccourcisseurs connus.');
assert.ok(server.includes("redirectUrl.searchParams.get('url')"), 'Dlink doit être décodé depuis le paramètre url public.');
assert.ok(server.includes('const target = await resolveAlternativePublicTarget(originalTarget)'), 'Le navigateur intégré doit ouvrir la destination résolue.');

assert.ok(server.includes('const liveStart = html.search'), 'Haloule doit repérer la section live.');
assert.ok(server.includes('const rawArticleEnd = liveStart >= 0 ? html.slice(liveStart).search'), 'Haloule doit arrêter la collecte avant les sections applications/outils.');
assert.ok(server.includes('browser|navigateur|apk|android|ios|iphone|ipad|windows|macos|linux|vpn|adblock'), 'Les liens logiciels et navigateurs doivent être filtrés.');

const volkamaxStart = server.indexOf('async function proxyVolkamaxEmbed');
const volkamaxEnd = server.indexOf('function parseVolkamaxSports', volkamaxStart);
const volkamaxSource = server.slice(volkamaxStart, volkamaxEnd);
assert.equal(volkamaxSource.includes('sandbox='), false, 'Volkamax refuse désormais les iframes qui portent un attribut sandbox.');
assert.ok(volkamaxSource.includes('referrerpolicy="origin-when-cross-origin"'), 'Le lecteur Volkamax doit conserver un referer compatible.');

console.log('v158 Alternative live/Clictune/Volkamax checks: OK');
