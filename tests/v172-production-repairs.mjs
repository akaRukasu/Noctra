import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [pkg, shell, theme, server, index, sw, manifest] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('public/noctra-shell.js', root), 'utf8'),
  readFile(new URL('public/noctra-theme.css', root), 'utf8'),
  readFile(new URL('server.mjs', root), 'utf8'),
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('public/noctra-sw.js', root), 'utf8'),
  readFile(new URL('public/noctra.webmanifest', root), 'utf8').then(JSON.parse)
]);

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21') && index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));
assert.ok(manifest.icons.every(icon => icon.src.includes('?v=182')));

assert.ok(shell.includes("cover.className = 'noctra-home-library-cover'"));
assert.ok(shell.includes("const image = source ? appPath(source) : ''"));
assert.ok(shell.includes("cover.dataset.noctraLibraryLoaded = 'true'"));
assert.ok(shell.includes('if (visual.lastElementChild !== cover) visual.appendChild(cover)'));
assert.match(theme, /noctra-home-library-cover\[data-noctra-library-cover="true"\][\s\S]*?z-index:\s*50 !important/);
assert.match(theme, /card:not\(:has\(\.noctra-home-library-cover\[data-noctra-library-loaded="true"\]/);
assert.match(theme, /card:has\(\.noctra-home-library-cover\[data-noctra-library-loaded="true"\][\s\S]*?\.cardText-first \{[\s\S]*?display:\s*none !important/);

assert.ok(!shell.includes('function wrapHomeCarousel(button)'));
assert.ok(!shell.includes("button.dataset.noctraInfinite = 'true'"));
assert.ok(shell.includes('scroller.addScrollEventListener?.(check)'));
assert.ok(shell.includes("button.dataset.noctraCarouselEngine = nativeScrollerReady ? 'jellyfin-api' : 'dom-fallback'"));
assert.ok(shell.includes('moveHomeCarousel(carouselButton);'));
const carouselClick = shell.slice(shell.indexOf("window.addEventListener('click', event => {\n    const carouselButton"), shell.indexOf("document.addEventListener('click', async event =>", shell.indexOf("const carouselButton")));
assert.ok(carouselClick.length > 300);
assert.ok(carouselClick.includes('nativeScrollerReady'));
assert.ok(carouselClick.includes('event.preventDefault()'));
assert.ok(carouselClick.includes('event.stopImmediatePropagation()'));

assert.ok(!shell.includes("liveSyncMode: 'buffered'"));
assert.ok(shell.includes('liveSyncDurationCount: networkProfile.weak ? 4 : 3'));
assert.ok(shell.includes('liveMaxLatencyDurationCount: networkProfile.weak ? 6 : 5'));
assert.ok(shell.includes('maxLiveSyncPlaybackRate: 1'));
assert.ok(shell.includes('maxBufferLength: 30'));
assert.ok(shell.includes('maxMaxBufferLength: 45'));
assert.ok(shell.includes('const startupBufferGoal = networkProfile.weak ? 12 : (stabilitySensitiveStream ? 10 : 8)'));
assert.ok(shell.includes('const startupFallbackDelay = networkProfile.weak ? 28_000 : (stabilitySensitiveStream ? 30_000 : 24_000)'));
assert.ok(!shell.includes('tvHls.targetLatency ='));
assert.ok(!shell.includes('tvHls.startLoad(Number.isFinite(video.currentTime)'));

const v171Theme = theme.slice(theme.lastIndexOf('/* Noctra V171'));
assert.equal(v171Theme.includes('.headerCastButton[aria-expanded'), false);

console.log('Noctra v172 - medias persistants, carrousels natifs et TV stable : OK');
