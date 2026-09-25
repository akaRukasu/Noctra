import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));

// La famille doit venir de la source API choisie, jamais seulement de la forme
// de l'embed. C'est ce qui évite de reclasser Sports/Daddy/North en /embed main.
assert.ok(server.includes('async function decorateLiveWatchVipPlayback(catalog, source = {})'));
assert.ok(server.includes("const vipFamilySource = sourceId === 'livewatch-curated';"));
assert.ok(server.includes("if (status.active && vipFamilySource && reference"));
assert.ok(server.includes("catalog = await decorateLiveWatchVipPlayback(catalog, source);"));
assert.ok(server.includes("vipPlayback: false"));
assert.ok(server.includes("liveWatchMandatoryAd: ['daddy', 'north', 'frame'].includes(sourceFamily)"));

// Le direct principal reprend le comportement stable v112 : ne pas effectuer
// un pré-probe réseau plus strict que le lecteur HLS réel.
const resolverStart = server.indexOf('async function resolveLiveWatchVipPlayback');
const resolverEnd = server.indexOf('async function liveWatchVipDiagnosticCheck', resolverStart);
const resolver = server.slice(resolverStart, resolverEnd);
assert.ok(resolver.includes("label: 'VIP Premium · direct'"));
assert.equal(resolver.includes('await validateLiveWatchStreamReference(token'), false);
assert.ok(resolver.includes("[...(direct ? [direct] : []), official, publicFallback]"));
assert.equal(resolver.includes('[publicFallback, official]'), false, 'Le public ne doit jamais précéder le VIP.');

// iOS doit réellement recevoir le nouveau client après déploiement.
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(index.includes('noctra-theme.css?v=200.21'));
assert.ok(index.includes('noctra.webmanifest?v=182'));
assert.ok(shell.includes("noctra-sw.js?v=182"));
assert.ok(sw.includes('noctra-shell-v200-r15'));

console.log('v120 LiveWatch source routing/cache checks passed');
