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

assert.ok(server.includes('function tvLogoChannelIdKey(value)'));
assert.ok(server.includes('const enriched = await enrichTvLogosFromIptvOrg('));
assert.ok(server.includes('logosReady: iptvOrgLogoCache.schemaVersion >= tvLogoIndexSchemaVersion'));
assert.ok(server.includes("'private, max-age=30, must-revalidate'"));
assert.ok(shell.includes('if (catalog?.logosReady) return;'));
assert.ok(shell.includes('fetchpriority="high"'));
assert.ok(shell.includes('tvChannelCard(channel, index, true)'));

const v137Css = css.slice(css.indexOf('/* Noctra V137 - bandeau mobile confortable'));
assert.ok(v137Css.length > 2_500);
assert.match(v137Css, /min-height: calc\(72px \+ env\(safe-area-inset-top\)\) !important;/);
assert.match(v137Css, /body\[data-noctra-role="administrator"\][\s\S]*height: calc\(72px \+ env\(safe-area-inset-top\)\) !important;/);
assert.match(v137Css, /top: calc\(env\(safe-area-inset-top\) \+ 88px\) !important;/);
assert.match(v137Css, /top: calc\(72px \+ env\(safe-area-inset-top\)\) !important;/);
assert.match(v137Css, /background-attachment: scroll !important;/);
assert.match(v137Css, /\.skinHeader[\s\S]*backdrop-filter: none !important;/);
assert.match(v137Css, /transition-property: transform, background-color, border-color, color, opacity !important;/);

console.log('v137 mobile header, immediate TV logos and desktop fluidity checks passed');
