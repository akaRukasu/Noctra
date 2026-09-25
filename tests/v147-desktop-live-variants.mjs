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

for (const marker of [
  'liveSyncDurationCount: networkProfile.weak ? 4 : 3',
  'liveMaxLatencyDurationCount: networkProfile.weak ? 6 : 5',
  'backBufferLength: 30',
  'maxBufferLength: 30',
  'maxMaxBufferLength: 45',
  'maxBufferHole: .5',
  'hlsOptions.startLevel = 0',
  'hlsOptions.abrEwmaDefaultEstimate = 2_500_000',
  'tvHls.startLoad(-1)'
]) assert.ok(shell.includes(marker), `Profil HLS desktop manquant: ${marker}`);

assert.ok(shell.includes("video.addEventListener('timeupdate', scheduleTvLiveEdgeControl"));
assert.ok(shell.includes("video.addEventListener('progress', scheduleTvLiveEdgeControl"));
assert.ok(!shell.includes("video.addEventListener('timeupdate', refreshTvLiveEdgeControl"));
assert.ok(shell.includes('function updateTvDesktopControlIcon'));
assert.ok(shell.includes("screen.setAttribute('data-tv-controls-hidden', 'true')"));
assert.ok(shell.includes("document.documentElement.classList.toggle('noctra-tv-native-fullscreen', native)"));

const v147Css = css.slice(css.indexOf('/* Noctra V147 - plein écran TV exclusif'));
assert.ok(v147Css.length > 1_000);
assert.match(css, /\.noctra-tv-screen\[data-tv-controls-hidden="true"\][\s\S]*?opacity: 0 !important;/);
assert.match(v147Css, /html\.noctra-tv-native-fullscreen[\s\S]*?overflow: hidden !important;/);
assert.match(v147Css, /::-webkit-scrollbar[\s\S]*?display: none !important;/);
assert.match(css, /\.noctra-tv-desktop-live-controls \{[\s\S]*?backdrop-filter: none;/);

assert.ok(server.includes('const candidates = entries.map((entry, index) => ({'));
assert.ok(!server.includes('const candidates = entries.slice(0, 6).map((entry, index) => ({'));
assert.ok(server.includes('const serverChoices = candidates.map((candidate, index) => ({'));
assert.ok(server.includes('resolveUrl: `${resolverPath}?server=${index}`'));
assert.ok(server.includes('const key = reference ? `${reference.kind}:${reference.id}` : String(channel.id || \'\');'));
assert.ok(server.includes('name: `${baseName} · ${variantLabel}${ordinal > 1 ? ` ${ordinal}` : \'\'}`'));
assert.ok(shell.includes('channel.sourceLabel, channel.quality'));

console.log('V147 desktop live stability, fullscreen and variants checks passed.');
