import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pkg, server, shell, css, index, sw] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/client/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8')
]);

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21') && index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(shell.includes('data-tv-safe-tools-launcher'));
assert.ok(shell.includes('data-tv-screen-fullscreen'));
const v141Css = css.slice(css.lastIndexOf('/* Noctra V141 - commandes du lecteur TV'));
assert.ok(v141Css.length > 1800);
assert.match(v141Css, /background: rgba\(105, 224, 196, \.19\) !important;/);
assert.match(v141Css, /background: rgba\(145, 166, 240, \.21\) !important;/);
assert.match(v141Css, /border: 0 !important;/);
assert.match(v141Css, /box-shadow: none !important;/);
assert.match(v141Css, /@media \(max-width: 760px\)/);
assert.match(v141Css, /width: 38px !important;/);

assert.ok(server.includes('streamUrl: liveWatchStableHlsUrl(kind, id)'));
assert.ok(server.includes("delivery: 'proxied-hls'"));
assert.ok(server.includes("providerStabilityPath = /^(?:LiveWatch|OHA|WiTV|FSTV|StreamSports99)$/i.test(provider)"));
assert.ok(server.includes("...(reference.headers.origin ? { origin: reference.headers.origin } : {})"));
assert.ok(shell.includes('const appleNativeFirst = appleTouch && /^NorthTV$/i.test(playbackProvider);'));
assert.ok(shell.includes('if (appleNativeFirst && startNativeHls'));

console.log('v141 TV controls, NorthTV mobile and WiTV HLS checks passed');
