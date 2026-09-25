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
assert.ok(server.includes('if (res.headersSent || res.writableEnded || res.destroyed)'));
assert.ok(server.includes('if (!res.writableEnded && !res.destroyed) res.destroy(error);'));

assert.ok(shell.includes("/^(?:LiveWatch|NorthTV|FrameTV)$/i.test(playbackProvider)"));
assert.ok(shell.includes('if (refreshResolvedStream(provider)) return;'));
assert.ok(shell.includes('if (bufferedResolvedStream)') && shell.includes('if (bufferedResolvedStream && stableDesktopLive)'));
assert.ok(shell.includes("(!liveWatchFamily && !/^WiTV$/i.test(playbackProvider)) || playbackBecameActive || providerFallbackStarted"));
assert.ok(shell.includes("recordTvDiagnostic('provider-web-fallback-start'"));
assert.ok(shell.includes("recordTvDiagnostic('provider-web-fallback-failed'"));
assert.ok(shell.includes("/^WiTV$/i.test(playbackProvider) ? 12_000 : 22_000"));
assert.ok(shell.includes('refreshResolvedStream(playbackProvider)'));
assert.ok(shell.includes('if (appleTouch && startNativeHls()) return;'));
assert.ok(shell.includes('if (startHlsJs()) return;\n    if (startNativeHls()) return;'));
assert.ok(shell.includes("recordTvDiagnostic('hls-fatal'"));
assert.ok(shell.includes("recordTvDiagnostic('video-error'"));

assert.ok(shell.includes("const homeMutationSelector = '.homePage .homeSectionsContainer"));
assert.ok(shell.includes('if (homeContent) scheduleHomeEnhancement();'));

const v140Css = css.slice(css.lastIndexOf('/* Noctra V140 - bandeau mobile affine'));
assert.ok(v140Css.length > 800);
assert.match(v140Css, /height: calc\(64px \+ env\(safe-area-inset-top\)\) !important;/);
assert.match(v140Css, /top: calc\(env\(safe-area-inset-top\) \+ 80px\) !important;/);
assert.match(v140Css, /calc\(100% - 64px - env\(safe-area-inset-top\)\)/);

console.log('v140 TV, home refresh and mobile header checks passed');
