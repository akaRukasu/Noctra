import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes('function liveWatchStableHlsUrl'));
assert.ok(server.includes('function liveWatchMasterPlaylistPointers'));
assert.ok(server.includes('function rewriteLiveWatchStableMasterPlaylist'));
assert.ok(server.includes('async function liveWatchFreshHlsResource'));
assert.ok(server.includes('async function proxyLiveWatchVipHls'));
assert.ok(server.includes("path.startsWith('/api/tv/livewatch/hls/')"));
assert.ok(server.includes("return proxyLiveWatchVipHls(kind, id, '', req, res);"));
assert.ok(server.includes("x-noctra-livewatch-hls"));
assert.ok(server.includes("liveWatchVipDirectCache.delete(cacheKey)"));
assert.ok(server.includes('rewriteLiveWatchStableMediaPlaylist(resource.text, resource.finalUrl, safe.kind, safe.id, resource.selector, resource.headers)'));
assert.ok(server.includes('async function proxyLiveWatchVipHlsMediaResource'));
assert.ok(server.includes("requestUrl.searchParams.get('res')"));
assert.ok(server.includes("rewriteLiveWatchStableMasterPlaylist(resource.text, resource.finalUrl, safe.kind, safe.id"));
// Le relais stable reste compatible avec le profil live adaptatif du lecteur.
assert.ok(shell.includes('lowLatencyMode: false'));
assert.ok(shell.includes('maxBufferLength: 30'));
assert.ok(shell.includes('maxMaxBufferLength: 45'));
console.log('Rafraîchissement HLS LiveWatch desktop Noctra v104 : OK');
