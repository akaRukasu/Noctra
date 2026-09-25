import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.match(shell, /NOCTRA_BUILD_VERSION = '200\.0\.21'/);
assert.match(sw, /noctra-shell-v200-r15/);

// LiveWatch main and the authenticated family trio must use the stable resolver.
assert.match(server, /vipFamilySource = sourceId === 'livewatch-curated'/);
assert.match(server, /resolverUrl: publicPath\(`\/api\/tv\/livewatch\/resolve\/\$\{reference\.kind\}/);
assert.match(server, /url: publicPath\(`\/api\/tv\/livewatch\/vip\/\$\{encodeURIComponent\(officialBridgeToken\)\}\/embed`\)/);
assert.match(server, /options: kind === 'page' \? \[official, publicFallback\] : \[\.\.\.\(direct \? \[direct\] : \[\]\), official, publicFallback\]/);
assert.doesNotMatch(server, /direct \? \[direct, official, publicFallback\] : \[publicFallback, official\]/);

// NorthTV uses native WebKit first for its larger segments; other LiveWatch
// families retain the HLS.js/ManagedMediaSource-first path.
assert.ok(shell.includes('const appleNativeFirst = appleTouch && /^NorthTV$/i.test(playbackProvider);'));
assert.ok(shell.includes('&& !appleNativeFirst'));
assert.match(shell, /preferManagedMediaSource = true/);
assert.doesNotMatch(shell, /preferAppleNativeLiveWatch/);
assert.ok(shell.indexOf("video.webkitEnterFullscreen()") < shell.indexOf("video.webkitSetPresentationMode('fullscreen')"));
assert.match(shell, /async function toggleTvFullscreen\(\) \{[\s\S]*enterTvNativeVideoFullscreen\(video\)[\s\S]*enterTvPseudoFullscreen\(card\)/);

// PiP is no longer a floating overlay; it lives in Outils TV and is disabled honestly in iOS PWA.
assert.doesNotMatch(shell, /data-tv-screen-pip/);
assert.match(shell, /data-tv-safe-pip/);
assert.match(shell, /function tvStandalonePwa\(\)/);
assert.match(shell, /PiP bloqué par iOS · mode app/);
assert.match(shell, /webkitSetPresentationMode\('picture-in-picture'\)/);

console.log('V123 LiveWatch/fullscreen/PiP regression checks: OK');
