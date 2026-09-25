import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(server.includes("Date.now() + 6_000"), 'Le cache de resolver LiveWatch doit être court.');
assert.ok(server.includes("streamUrl: publicPath(`/api/tv/livewatch/stream/${kind}/${encodeURIComponent(id)}`)"), 'Le direct LiveWatch doit utiliser une route stable par chaîne.');
assert.ok(server.includes("liveWatchVipDirectCache.delete(cacheKey)"), 'Une URL LiveWatch refusée doit pouvoir être renouvelée une fois.');
assert.ok(server.includes("const refreshable = [401, 403, 404, 410, 429, 502, 503, 504].includes(status)"));
assert.ok(server.includes("liveWatchKind: kind, liveWatchId: id"));
assert.ok(!server.includes("streamUrl: tvPublicStreamUrl(token),\n      vip: true,\n      direct: true"), 'Le client ne doit plus recevoir le token CDN figé comme URL LiveWatch principale.');
console.log('Route LiveWatch stable Noctra v101 : OK');
