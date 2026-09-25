import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { searchTrackerReleases, trackerSearchIdentity } from '../lib/tracker-search.mjs';

const root = new URL('../', import.meta.url);
const [pkg, shell, theme, server, index, sw] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('public/noctra-shell.js', root), 'utf8'),
  readFile(new URL('public/noctra-theme.css', root), 'utf8'),
  readFile(new URL('server.mjs', root), 'utf8'),
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('public/noctra-sw.js', root), 'utf8')
]);

const assetVersion = pkg.version.replace(/^(\d+)\.0\.(\d+)$/, '$1.$2');
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.ok(shell.includes(`NOCTRA_BUILD_VERSION = '${pkg.version}'`));
assert.ok(server.includes(`version: '${pkg.version}'`));
assert.ok(index.includes(`noctra-shell.js?v=${assetVersion}`));
assert.ok(index.includes(`noctra-theme.css?v=${assetVersion}`));
assert.ok(sw.includes(`noctra-shell-v200-r${pkg.version.split('.').at(-1)}`));

assert.ok(shell.includes("const videoRoute = /^#\\/video(?:[?&]|$)/.test(route)"));
assert.ok(shell.includes('function observePlayerVisibility(player)'));
assert.ok(shell.includes("attributeFilter: ['class', 'hidden', 'style']"));
assert.ok(shell.includes('mountedPlayer.getClientRects().length'));
assert.ok(shell.includes("document.body.classList.toggle('noctra-video-route', videoRoute || playerVisible)"));
assert.ok(shell.includes("replay: '<svg"));
assert.ok(shell.indexOf("['replay',") < shell.indexOf("['play',"));
assert.ok((theme + shell).includes('noctra-video-route') && (theme + shell).includes('videoPlayerContainer'));

assert.ok((theme + shell).includes('noctra-loading') && (theme + shell).includes('mainDetailButtons'));

const identity = trackerSearchIdentity('Titre local', '2026', { originalTitle: 'Original title' });
let calls = 0;
let result = await searchTrackerReleases({
  mediaType: 'movie', identity, indexerIds: [1], preferredIndexerIds: [1], exhaustive: false,
  request: async () => {
    calls += 1;
    if (calls === 1) return [];
    throw new Error('tracker lent');
  }
});
assert.equal(result.error, null, 'A later timeout does not erase a completed tracker response');

result = await searchTrackerReleases({
  mediaType: 'movie', identity, indexerIds: [1], preferredIndexerIds: [1], exhaustive: false,
  request: async () => { throw new Error('tracker indisponible'); }
});
assert.ok(result.error, 'Every attempt failing is still reported');

const start = server.indexOf('async function enabledProwlarrIndexers()');
const end = server.indexOf('\nfunction prowlarrRows(', start);
const staleItems = [{ id: 7, name: 'Cache' }];
const context = vm.createContext({
  prowlarrIndexerCache: { expiresAt: 0, items: staleItems, fastIds: [7], base: 'http://cache' },
  prowlarrRequest: async () => { throw new Error('refresh timeout'); },
  Date,
  Number
});
vm.runInContext(server.slice(start, end), context);
const cachedItems = await context.enabledProwlarrIndexers();
assert.equal(cachedItems.length, 1);
assert.equal(cachedItems[0].id, 7);
assert.ok(context.prowlarrIndexerCache.expiresAt > Date.now());
assert.ok(server.includes("status: 'deferred'"));
assert.ok(server.includes('.slice(0, 2)'));

console.log(`Noctra v${pkg.version} - lecteur mobile, actions, chargement et trackers tolérants : OK`);
