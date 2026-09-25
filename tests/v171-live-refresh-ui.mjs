import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const theme = await readFile(new URL('public/noctra-theme.css', root), 'utf8');
const server = await readFile(new URL('server.mjs', root), 'utf8');
const index = await readFile(new URL('public/client/index.html', root), 'utf8');
const sw = await readFile(new URL('public/noctra-sw.js', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('public/noctra.webmanifest', root), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21') && index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(server.includes('async function jellyfinLibraryRefreshStatus(session = null)'));
assert.ok(server.includes("`${jellyfinUrl}/ScheduledTasks`"));
assert.ok(server.includes("String(candidate?.Key || '').toLowerCase() === 'refreshlibrary'"));
assert.ok(server.includes("path === '/api/libraries/refresh' && req.method === 'GET'"));
assert.ok(shell.includes('function showLibraryRefreshProgress(status)'));
assert.ok(shell.includes("await api('/api/libraries/refresh', { cache: 'no-store'"));
assert.ok(shell.includes("progress: 100, message: 'Médiathèques actualisées · 100 %'"));
assert.match(theme, /#noctra-toast\[data-progress\][\s\S]*?#noctra-toast\[data-progress\] > i > b/);

assert.ok(shell.includes('function moveHomeCarousel(button)'));
assert.ok(shell.includes("event.target.closest('.emby-scrollbuttons-button, .emby-scrollbuttons .scrollbutton')"));
assert.ok(shell.includes('function setCarouselPosition(scroller, position, animate = false, knownMetrics = null)'));
assert.ok(shell.includes('setCarouselPosition(scroller, target, true, metrics)'));
assert.ok(shell.includes('const planned = homeCarouselTargets.get(scroller)'));
assert.ok(shell.includes("typeof scroller.scrollToPosition === 'function'"));
assert.ok(shell.includes('function homeCarouselDirection(button)'));

assert.ok(shell.includes('function positionHeaderActionMenu(menu, kind)'));
assert.ok(shell.includes("menu.style.setProperty('--noctra-header-menu-left'"));
assert.match(theme, /left:\s*var\(--noctra-header-menu-left/);
assert.match(theme, /max-height:\s*var\(--noctra-header-menu-max-height/);
const v171Theme = theme.slice(theme.lastIndexOf('/* Noctra V171'));
assert.equal(v171Theme.includes('.headerCastButton[aria-expanded'), false, 'La v171 ne doit pas restyler les boutons Cast/SyncPlay d’origine.');

assert.ok(!shell.includes("liveSyncMode: 'buffered'"));
assert.ok(shell.includes('maxLiveSyncPlaybackRate: 1'));
assert.ok(shell.includes('liveMaxUnchangedPlaylistRefresh: 4'));
assert.ok(shell.includes('maxBufferLength: 30'));
assert.ok(shell.includes('maxMaxBufferLength: 45'));
assert.ok(!shell.includes('hlsOptions.maxBufferLength = conservativePublicStream ? 180 : 150'));
assert.ok(!shell.includes('tvHls.targetLatency ='));

const hlsSource = await readFile(new URL('public/vendor/hls.min.js', root), 'utf8');
const hlsContext = {};
hlsContext.self = hlsContext;
hlsContext.globalThis = hlsContext;
vm.runInNewContext(hlsSource, hlsContext);
assert.equal(hlsContext.Hls.version, '1.7.1');

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
for (const [name, size] of [['noctra-180.png', 180], ['noctra-192.png', 192], ['noctra-512.png', 512], ['noctra-maskable-512.png', 512]]) {
  const png = await readFile(new URL(`public/icons/${name}`, root));
  assert.ok(png.subarray(0, 8).equals(pngSignature), `${name} doit etre un PNG valide.`);
  assert.equal(png.readUInt32BE(16), size, `${name} doit avoir la bonne largeur.`);
  assert.equal(png.readUInt32BE(20), size, `${name} doit avoir la bonne hauteur.`);
}
assert.ok(manifest.icons.every(icon => icon.src.includes('?v=182')));
assert.match(theme, /#reactRoot:has\(> \.splashLogo\)[\s\S]*?height:\s*100dvh/);

assert.ok(shell.includes("fallbackImage.addEventListener('load'"));
assert.ok(shell.includes("fallbackImage.addEventListener('error'"));
assert.ok(shell.includes('fallbackImage.dataset.noctraLibrarySource'));
assert.ok(server.includes("path === '/api/libraries' || path.startsWith('/api/jellyfin/image/')"));
assert.match(theme, /cardImageContainer\[data-noctra-library-title\]::after \{[\s\S]*?content:\s*none !important;[\s\S]*?display:\s*none !important;/);
assert.match(theme, /card:has\(\.cardImageContainer\[data-noctra-library-image-ready="true"\]\) \.cardText-first \{[\s\S]*?display:\s*none !important;/);

console.log('Noctra v171 - progression, TV live, navigation, menus, splash et images : OK');
