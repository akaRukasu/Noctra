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
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(!server.includes("id: 'iptv-org-france'"));
assert.ok(!server.includes('https://iptv-org.github.io/iptv/countries/fr.m3u'));
assert.ok(server.includes("const tvLogoIndexCachePath = join(runtimeRoot, 'tv-logo-index.json')"));
assert.ok(server.includes('AbortSignal.timeout(25_000)'));
assert.ok(server.includes('generated-fallback'));
assert.ok(server.includes('tvLogoFallbackSvg'));
assert.ok(shell.includes("['LiveWatch', 'NorthTV', 'FrameTV', 'WiTV', 'OHA']"));
assert.ok(shell.includes('timeoutMs: 35_000'));

const v135Css = css.slice(css.indexOf('/* Noctra V135 - bandeau compact'));
assert.ok(v135Css.length > 7_000);
assert.match(v135Css, /\.headerTop \.headerRight > button\.headerButton[\s\S]*background: transparent !important;/);
assert.match(v135Css, /\.headerUserButtonRound > \.headerUserButtonRound[\s\S]*background-size: cover !important;/);
assert.match(v135Css, /\.actionSheet\.actionsheet-not-fullscreen[\s\S]*width: min\(286px/);
assert.match(v135Css, /#app-sync-play-menu \.MuiPaper-root[\s\S]*width: min\(286px/);
assert.match(v135Css, /button\.noctra-dock-button\[data-active="true"\][\s\S]*background: transparent !important;/);
assert.match(v135Css, /\.backgroundContainer:not\(\.withBackdrop\)[\s\S]*linear-gradient\(145deg/);

console.log('v135 header, compact menus, resilient TV logos and color backgrounds checks passed');
