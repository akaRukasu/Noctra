import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pkgText, server, shell, css, index, sw] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/client/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8')
]);

assert.equal(JSON.parse(pkgText).version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21') && index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(shell.includes("const desktopNative = !tvAppleTouchDevice() && window.matchMedia?.('(min-width: 761px)')?.matches"));
assert.ok(shell.includes('desktopNative || (!preferOfficialAltIframe && mobileNative)'));
assert.ok(shell.includes('lecteur direct Noctra'));

assert.ok(shell.includes('liveDurationInfinity: true'));
assert.ok(shell.includes("liveSyncDurationCount: networkProfile.weak ? 4 : 3"));
assert.ok(shell.includes("liveMaxLatencyDurationCount: networkProfile.weak ? 6 : 5"));
assert.ok(shell.includes('maxLiveSyncPlaybackRate: 1'));
assert.ok(shell.includes('if (bufferedResolvedStream)'));
assert.ok(shell.includes('bufferedResolvedStream && stableDesktopLive'));
assert.ok(shell.includes('maxBufferLength: 30'));

assert.ok(shell.includes("video.addEventListener('playing', onPlaying, { signal: videoEventSignal })"));
assert.ok(shell.includes("video.addEventListener('stalled', onWaiting, { signal: videoEventSignal })"));
assert.ok(shell.includes('live-stall-severe-catchup'));
assert.ok(shell.includes('function returnTvToLiveEdge()'));
assert.ok(shell.includes('data-tv-live-edge'));

const v144Css = css.slice(css.lastIndexOf('/* Noctra V144 - commande live et lecteur direct desktop. */'));
assert.ok(v144Css.length > 1800);
assert.match(v144Css, /width: 76px !important;/);
assert.match(v144Css, /border: 0 !important;/);
assert.match(v144Css, /@media \(max-width: 760px\)[\s\S]*?display: none !important;/);

console.log('V144 desktop live player checks passed.');
