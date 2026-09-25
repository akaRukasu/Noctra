import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pkgText, server, shell, index, sw] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/client/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8')
]);

assert.equal(JSON.parse(pkgText).version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21') && index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(shell.includes("liveSyncDurationCount: networkProfile.weak ? 4 : 3"));
assert.ok(shell.includes("liveMaxLatencyDurationCount: networkProfile.weak ? 6 : 5"));
assert.ok(shell.includes('maxLiveSyncPlaybackRate: 1'));
assert.ok(!shell.includes('stableDesktopLive ? 1.08 : 1'));
assert.ok(shell.includes('startLevel: networkProfile.weak ? 0 : -1'));
assert.ok(shell.includes('stableDesktopLive ? 4_000_000 : 5_000_000'));
assert.ok(shell.includes("maxBufferLength: 30"));
assert.ok(shell.includes('maxMaxBufferLength: 45'));

assert.ok(shell.includes('drift > 24'));
assert.ok(shell.includes('(profile.weak || bufferedResolvedStream) ? 18_000 : 14_000'));
assert.ok(shell.includes('live-stall-severe-catchup'));
assert.ok(shell.includes('live-stall-observed'));
assert.ok(!shell.includes('stable-desktop-live-stall-catchup'));
assert.ok(!shell.includes('live-stall-reload'));

for (const marker of [
  'channel-requested',
  'resolver-requested',
  'resolver-ready',
  'direct-stream-ready',
  'hls-player-started',
  'hls-manifest-loaded',
  'hls-manifest-parsed',
  'hls-first-fragment',
  'metadata-ready',
  'can-play',
  'first-playing'
]) assert.ok(shell.includes(marker), `Le diagnostic doit enregistrer ${marker}.`);

assert.ok(shell.includes('void ensureHlsLibrary().catch(() => undefined)'));
assert.ok(shell.includes("if (/url|token|cookie|authorization/i.test(key)) continue"));
assert.ok(shell.includes("const appleNativeFirst = appleTouch && /^NorthTV$/i.test(playbackProvider)"));
assert.ok(shell.includes("if (appleNativeFirst && startNativeHls(`${playbackProvider} · lecteur HLS natif iOS…`)) return"));

console.log('V145 native-like live startup checks passed.');
