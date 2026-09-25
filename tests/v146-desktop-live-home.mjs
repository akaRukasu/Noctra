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

assert.ok(shell.includes('data-tv-desktop-live-controls'));
assert.ok(shell.includes('<span>EN DIRECT</span>'));
assert.ok(shell.includes('data-tv-live-toggle'));
assert.ok(shell.includes('data-tv-live-volume'));
assert.ok(shell.includes('data-tv-live-pip'));
assert.ok(shell.includes('data-tv-live-fullscreen'));
assert.ok(shell.includes("!tvAppleTouchDevice()\n      && window.matchMedia?.('(min-width: 761px)')?.matches"));
assert.ok(shell.includes('video.controls = !enabled'));

assert.ok(shell.includes('liveSyncDurationCount: networkProfile.weak ? 4 : 3'));
assert.ok(shell.includes('maxBufferLength: 30'));
assert.ok(shell.includes('maxMaxBufferLength: 45'));
assert.ok(shell.includes('hlsOptions.fragLoadingMaxRetry = Math.max(hlsOptions.fragLoadingMaxRetry, 12)'));
assert.ok(shell.includes('const signedUrlExpired = [401, 403, 410].includes(statusCode)'));
assert.ok(shell.includes('tvHls.startLoad(-1)'));
assert.ok(shell.includes('if (tvHls) tvHls._noctraNetworkRestarts = 0'));
assert.ok(shell.includes('maxLiveSyncPlaybackRate: 1'));

assert.ok(shell.includes('function extendHomeMovieCarousel'));
assert.ok(shell.includes('IncludeItemTypes: state.includeItemTypes'));
assert.ok(shell.includes("section.dataset.noctraExtendedFeed = `${includeItemTypes.toLowerCase()}-latest`"));
assert.ok(shell.includes("if (state.parentId) query.ParentId = state.parentId"));
assert.ok(shell.includes('metrics.maximum - metrics.viewport * 1.4'));
assert.ok(css.includes('body[data-noctra-role]:not(.noctra-playing) .headerTop'));
assert.ok(css.includes('background: transparent !important;'));
assert.ok(css.includes('.noctra-tv-desktop-live-controls'));
assert.ok(css.includes('.noctra-tv-desktop-live-controls .noctra-tv-desktop-live-state'));
assert.ok(css.includes('background: rgba(187, 38, 56, .96) !important;'));
assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.noctra-tv-desktop-live-controls \{[\s\S]*?display: none !important;/);

console.log('V146 desktop live continuity and progressive home checks passed.');
