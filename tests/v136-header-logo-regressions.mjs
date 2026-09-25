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

const pkg = JSON.parse(pkgText);
assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(server.includes("createHmac('sha256', tvImageTokenSecret)"));
assert.ok(server.includes('function signedTvImageToken(payload)'));
assert.ok(server.includes('function signedTvImagePayload(tokenValue)'));
assert.ok(server.includes('const trustedTvImageRequest = Boolean(tvImageToken && signedTvImagePayload(tvImageToken))'));
assert.ok(server.includes('const token = signedTvImageToken({ n: label })'));
assert.match(server, /signedTvImageToken\(\{ u: normalized, n:/);
assert.match(server, /if \(token\.startsWith\('s'\) \|\| token\.startsWith\('j'\)\)/);

assert.ok(shell.includes('function syncHeaderActionMenus()'));
assert.ok(shell.includes("'.headerCastButton, .headerSyncButton'"));
assert.ok(shell.includes('menu.dataset.noctraHeaderMenu = kind'));
assert.ok(shell.includes('M12.22 2h-.44'));
assert.doesNotMatch(shell.slice(0, 4_000), /tools:[\s\S]{0,900}transform="translate\(2\) scale\(\.83\)"/);

const v136Css = css.slice(css.indexOf('/* Noctra V136 - bandeau rééquilibré'));
assert.ok(v136Css.length > 2_500);
assert.match(v136Css, /\.headerTop \{[\s\S]*min-height: 68px !important;/);
assert.match(v136Css, /data-noctra-header-menu[\s\S]*top: calc\(max\(10px, env\(safe-area-inset-top\)\) \+ 66px\)/);
assert.match(v136Css, /#noctra-dock \.noctra-dock-items[\s\S]*align-items: center !important;/);
assert.match(v136Css, /button\.noctra-dock-button > svg[\s\S]*margin: 0 !important;/);
assert.match(v136Css, /min-height: calc\(64px \+ env\(safe-area-inset-top\)\) !important;/);

console.log('v136 header placement, dock alignment and signed TV logo checks passed');
