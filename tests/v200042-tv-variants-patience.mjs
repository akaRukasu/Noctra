import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [pkg, server, shell, sw, index, theme, changelog] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('server.mjs', root), 'utf8'),
  readFile(new URL('public/noctra-shell.js', root), 'utf8'),
  readFile(new URL('public/noctra-sw.js', root), 'utf8'),
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('public/noctra-theme.css', root), 'utf8'),
  readFile(new URL('CHANGELOG-V200.md', root), 'utf8')
]);

assert.equal(pkg.version, '200.0.42');
assert.ok(server.includes("version: '200.0.42'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.42'"));
assert.ok(sw.includes("CACHE_NAME = 'noctra-shell-v200-r42'"));
assert.match(index, /noctra-shell\.js\?v=200\.42/);
assert.match(theme, /woff2\?v=200\.42/);
assert.match(changelog, /## 200\.0\.42/);

assert.match(server, /function collapseLiveWatchLogicalChannels\(/);
assert.match(server, /liveWatchVariants: variants/);
assert.match(server, /serveurs disponibles sous le lecteur/);
assert.match(server, /groupedChannels = collapseLiveWatchLogicalChannels\(catalog\.channels\)/);
assert.match(server, /variants: variantPages\.slice\(0, 12\)/);
assert.match(server, /label: `VIP · \$\{String\(variant\?\.label/);
assert.match(server, /Toutes les versions officielles restent visibles sous le lecteur/);

const wiTvSanitizer = server.slice(server.indexOf('function sanitizeWiTvPlayerHtml'), server.indexOf('async function resolveTvPageReference'));
assert.doesNotMatch(wiTvSanitizer, /remoteRoute|routeSeed/);
assert.match(wiTvSanitizer, /state:'stalled'[^\n]+38000/);
assert.match(server, /fetchTvRemote\(item\.url, \{\s*signal: AbortSignal\.timeout\(24_000\),\s*cache: 'no-store'/);
assert.match(server, /validateWiTvHlsStream\(candidateUrl, relayHeaders, 18_000\)/);

const ohaSanitizer = server.slice(server.indexOf('function sanitizeOhaPlayerHtml'), server.indexOf('async function proxyOhaEmbed'));
assert.match(ohaSanitizer, /routeSeed = '<script>try\{history\.replaceState\(\{\},\\'\\',\\'\/live\\'\)\}/);
assert.match(ohaSanitizer, /if\(routeRecoveryDone\|\|!routeLooksMissing\(\)\)return false/);
assert.match(ohaSanitizer, /dispatchEvent\(new PopStateEvent\('popstate'\)\)/);
assert.match(ohaSanitizer, /state:'stalled'[^\n]+30000/);

assert.match(shell, /\? 45_000 : 55_000/);
assert.match(shell, /oha-sustained-stall-fallback[\s\S]{0,500}35_000/);
assert.match(shell, /StreamSports99\$\/i\.test\(playbackProvider\) \? 20_000/);
assert.match(shell, /profile\.weak \? 20 : 16/);
assert.match(shell, /Math\.min\(28, base/);
assert.match(shell, /embedSoftTimeout: veryWeak \? 55_000 : weak \? 42_000 : 30_000/);
assert.match(shell, /embedHardTimeout: veryWeak \? 150_000 : weak \? 120_000 : 90_000/);

console.log('Noctra v200.0.42 · variantes LiveWatch et stabilité patiente : OK');
