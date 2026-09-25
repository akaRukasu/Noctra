import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchTrackerReleases, trackerSearchIdentity } from '../lib/tracker-search.mjs';

const root = new URL('../', import.meta.url);
const [pkg, tracker, server, shell, theme, index, sw] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('lib/tracker-search.mjs', root), 'utf8'),
  readFile(new URL('server.mjs', root), 'utf8'),
  readFile(new URL('public/noctra-shell.js', root), 'utf8'),
  readFile(new URL('public/noctra-theme.css', root), 'utf8'),
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('public/noctra-sw.js', root), 'utf8')
]);

const assetVersion = pkg.version.replace(/^(\d+)\.0\.(\d+)$/, '$1.$2');
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.ok(shell.includes(`NOCTRA_BUILD_VERSION = '${pkg.version}'`));
assert.ok(server.includes(`version: '${pkg.version}'`));
assert.ok(index.includes(`noctra-shell.js?v=${assetVersion}`) && index.includes(`noctra-theme.css?v=${assetVersion}`));
assert.ok(sw.includes(`noctra-shell-v200-r${pkg.version.split('.').at(-1)}`));

assert.ok(tracker.includes('exhaustive ? 18_000 : 9_000'));
assert.ok(tracker.includes('Math.min(6_500'));
assert.ok(tracker.includes('preferredIndexerIds = []'));
assert.ok(server.includes("prowlarrRequest('/api/v1/indexerstats', { timeoutMs: 6_000 })"));
assert.ok(server.includes('fastIds, base'));
assert.ok(server.includes('preferredIndexerIds, exhaustive: force'));
assert.ok(server.includes("? `${mediaType}:tmdb:${id}`"));
assert.ok(server.includes('Date.now() + 15_000, value'));
assert.ok(server.includes('const deadline = Date.now() + 15_000'));
assert.ok(server.includes('timeoutMs: 15_000'));
assert.ok(shell.includes('timeoutMs: 22_000'));
assert.ok(shell.includes('trackerWorkers < 3'));
assert.ok(shell.includes('timeoutMs: 35000'));

const identity = trackerSearchIdentity("Lawrence d'Arabie", '1962', { originalTitle: 'Lawrence of Arabia' });
const calls = [];
const matching = { title: 'Lawrence.D.Arabie.1962.MULTI.VFF.1080p', protocol: 'torrent', size: 4_000_000_000, indexerId: 2 };
const fast = await searchTrackerReleases({
  mediaType: 'movie',
  identity,
  indexerIds: [1, 2, 4, 5, 6],
  preferredIndexerIds: [2, 4, 6],
  request: async path => { calls.push(path); return [matching]; }
});
assert.equal(fast.rows.length, 1);
assert.deepEqual(fast.checkedIndexerIds, [2, 4, 6]);
assert.equal(calls.length, 1);
assert.match(calls[0], /indexerIds=2/);
assert.match(calls[0], /indexerIds=4/);
assert.match(calls[0], /indexerIds=6/);
assert.doesNotMatch(calls[0], /indexerIds=1/);
assert.doesNotMatch(calls[0], /indexerIds=5/);

const fastMissCalls = [];
await searchTrackerReleases({
  mediaType: 'movie', identity, indexerIds: [1, 2, 4, 5, 6], preferredIndexerIds: [2, 4, 6], exhaustive: false,
  request: async path => { fastMissCalls.push(path); return []; }
});
assert.ok(fastMissCalls.length >= 2);
assert.ok(fastMissCalls.every(path => !path.includes('indexerIds=1') && !path.includes('indexerIds=5')));

const pageDistanceStart = shell.indexOf('function homeCarouselPageDistance(');
const pageDistanceEnd = shell.indexOf('\n  function syncHomeCarouselButtons', pageDistanceStart);
const pageDistance = shell.slice(pageDistanceStart, pageDistanceEnd);
assert.ok(pageDistance.includes('viewport') && pageDistance.includes('cardStep'));
assert.equal((shell.match(/homeCarouselPageDistance\(scroller, slider,/g) || []).length, 3);

assert.match(theme, /data-noctra-panel-kind="automation"\] \.noctra-arr-hero \{[\s\S]*?height:\s*66px !important/);
assert.match(theme, /\.noctra-arr-metrics \.noctra-metric \{[\s\S]*?height:\s*52px !important/);
assert.match(theme, /@media \(max-width: 760px\) \{[\s\S]*?\.noctra-arr-metrics \.noctra-metric \{[\s\S]*?height:\s*48px !important/);

assert.ok(shell.includes("const selector = '.material-icons, .material-icons-round"));
assert.ok(shell.includes('function observeNativePlayerIcons(player = null)'));
assert.ok(shell.includes("attributeFilter: ['class']"));
assert.ok(shell.includes('data-noctra-material-icon="${iconName}"'));
assert.match(theme, /body\.noctra-playing \.videoPlayerContainer \.noctra-material-icon-fixed > svg/);

console.log(`Noctra v${pkg.version} - trackers rapides, carrousels pleine page, automatisation compacte et icônes mobiles SVG : OK`);
