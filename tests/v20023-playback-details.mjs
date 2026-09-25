import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const playerHash = /71318:"([a-f0-9]+)"/.exec(await readFile(new URL('public/client/runtime.bundle.js', root),'utf8'))[1];
const [pkg, shell, theme, server, index, sw, hls, videoPlugin, runtime, main] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('public/noctra-shell.js', root), 'utf8'),
  readFile(new URL('public/noctra-theme.css', root), 'utf8'),
  readFile(new URL('server.mjs', root), 'utf8'),
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('public/noctra-sw.js', root), 'utf8'),
  readFile(new URL('public/client/node_modules.hls.js.07af454a74687273e35d.chunk.js', root), 'utf8'),
  readFile(new URL(`public/client/htmlVideoPlayer-plugin.${playerHash}.chunk.js`, root), 'utf8'),
  readFile(new URL('public/client/runtime.bundle.js', root), 'utf8'),
  readFile(new URL('public/client/main.jellyfin.bundle.js', root), 'utf8')
]);

const assetVersion = pkg.version.replace('.0.', '.');
assert.ok(shell.includes(`NOCTRA_BUILD_VERSION = '${pkg.version}'`));
assert.equal(server.split(`version: '${pkg.version}'`).length - 1, 2);
for (const asset of ['runtime.bundle.js', 'main.jellyfin.bundle.js', 'noctra-shell.js', 'noctra-theme.css', 'MaterialIcons-Regular.2d8017489da689caedc1.woff2']) {
  assert.ok(index.includes(`${asset}?v=${assetVersion}`));
}
assert.ok(index.includes('<meta id="themeColor" name="theme-color"'));
assert.ok(sw.includes(`noctra-shell-v200-r${pkg.version.split('.').at(-1)}`));

assert.equal(index.includes('../vendor/hls.min.js'), false);
assert.equal(index.includes('../noctra-hls-bridge.js'), false);
assert.ok(videoPlugin.includes('var t=e.default;'));
assert.match(playerHash, /^[a-f0-9]{20}$/);
assert.ok(runtime.includes('62907:"07af454a74687273e35d"'));

assert.ok(hls.includes('enableWorker:!0,workerPath:null'));
assert.equal(hls.includes('enableWorker:!1,workerPath:null'), false);
assert.ok(shell.includes('installJellyfinHlsCompatibility()'));
assert.ok(shell.includes("url.searchParams.set('VideoCodec', 'h264')"));
assert.ok(shell.includes("url.searchParams.set('RequireAvc', 'true')"));
assert.ok(videoPlugin.includes('r.searchParams.set("VideoCodec","h264")'));
assert.ok(videoPlugin.includes('r.searchParams.set("RequireAvc","true")'));
assert.ok(videoPlugin.includes('r.searchParams.set("VideoBitrate","12000000")'));
assert.ok(videoPlugin.includes('r.searchParams.set("AudioCodec","aac")'));
assert.ok(videoPlugin.includes('r.searchParams.set("SegmentContainer","ts")'));
assert.ok(videoPlugin.includes('r.searchParams.set("BreakOnNonKeyFrames","true")'));
assert.ok(videoPlugin.includes('new Hls({enableWorker:!0,startPosition:'));
assert.ok(videoPlugin.includes('manifestLoadingTimeOut:6e4'));
assert.ok(videoPlugin.includes('fragLoadingTimeOut:6e4'));
assert.ok(videoPlugin.includes('fragLoadingMaxRetry:6'));
assert.ok(main.includes('i.code&&r.fatal&&r.response.code>=400'));
assert.ok(shell.includes("['view', /view_comfy"));
assert.ok(shell.includes("['sort', /sort_by_alpha"));
assert.ok(shell.includes("['filter', /filter_alt"));
assert.ok(shell.includes("['loadstart', 'loadedmetadata', 'canplay', 'play', 'playing', 'pause', 'ended', 'emptied', 'abort', 'error']"));
assert.ok(shell.includes("document.body.classList.toggle('noctra-player-active', playerActive)"));
assert.match(theme, /body\.noctra-player-active \.videoPlayerContainer:not\(\.hide\)/);

assert.match(theme, /mainDetailButtons \.detailButton \.material-icons\[data-noctra-material-hidden="true"\][\s\S]*?display: none !important/);
assert.ok(shell.includes("if (!parent.classList.contains('noctra-material-icon-fixed'))"));
assert.ok(shell.includes("if (element.getAttribute('aria-hidden') !== 'true')"));
assert.ok(shell.includes('nativePlayerIconFrame = requestAnimationFrame('));
assert.match(theme, /mainDetailButtons \.detailButton:not\(\.btnPlay\)[\s\S]*?border-radius: 50% !important/);
assert.match(theme, /mainDetailButtons \.btnPlay::after[\s\S]*?content: attr\(title\) !important/);
assert.match(theme, /mainDetailButtons \.btnPlay::after[\s\S]*?content: none !important/);
assert.ok(/noctra-detail-mobile\.noctra-detail-ready[\s\S]*?flex-wrap: wrap !important;[\s\S]*?overflow: visible !important/.test(theme), 'Mobile actions must wrap without clipping');
assert.ok(/#videoOsdPage \{[^}]*pointer-events: auto !important/.test(theme), 'Native player must receive pointer and touch input');
assert.ok(/#videoOsdPage \{[^}]*z-index: 1001 !important/.test(theme), 'Native player menus must remain above the video');
assert.match(theme, /svg\[data-noctra-material-icon\][\s\S]*?fill: none !important;[\s\S]*?stroke: currentColor !important/);

console.log(`Noctra v${pkg.version} - lecture HLS, fiches et outils de mediatheque : OK`);
