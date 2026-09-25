import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [pkg, server, shell, theme, index, sw] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('server.mjs', root), 'utf8'),
  readFile(new URL('public/noctra-shell.js', root), 'utf8'),
  readFile(new URL('public/noctra-theme.css', root), 'utf8'),
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('public/noctra-sw.js', root), 'utf8')
]);

const assetVersion = pkg.version.replace(/^(\d+)\.0\.(\d+)$/, '$1.$2');
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.ok(shell.includes(`NOCTRA_BUILD_VERSION = '${pkg.version}'`));
assert.ok(server.includes(`version: '${pkg.version}'`));
assert.ok(index.includes(`noctra-shell.js?v=${assetVersion}`));
assert.ok(index.includes(`noctra-theme.css?v=${assetVersion}`));
assert.ok(sw.includes(`noctra-shell-v200-r${pkg.version.split('.').at(-1)}`));

const candidates = server.slice(
  server.indexOf('function prowlarrBaseCandidates()'),
  server.indexOf('\nasync function prowlarrRequest', server.indexOf('function prowlarrBaseCandidates()'))
);
assert.ok(candidates.indexOf('PROWLARR_INTERNAL_URL') < candidates.indexOf('127.0.0.1'));
assert.ok(candidates.indexOf('127.0.0.1') < candidates.lastIndexOf('PROWLARR_URL'));
assert.ok(candidates.includes('.filter(Boolean)'));
assert.ok(server.includes("throw new HttpError(502, 'Prowlarr tarde à répondre. Réessaie dans un instant.')"));
assert.ok(!server.includes('Prowlarr est inaccessible via ses URL configurées.'));

assert.match(theme, /@media \(max-width: 760px\) \{[\s\S]*?\.homePage \.emby-scrollbuttons,[\s\S]*?\.sectionTitleTextButton > svg\[data-noctra-material-icon\][\s\S]*?display: none !important/);
assert.match(theme, /body\.noctra-panel-open\.noctra-discovery-torrent-live-open #noctra-dock \{[\s\S]*?visibility: hidden !important/);
assert.match(theme, /\.noctra-discovery-torrent-live \{[\s\S]*?inset: 0 !important;[\s\S]*?height: 100dvh !important/);
assert.match(theme, /\.noctra-live-torrent-row:has\(\.noctra-live-torrent-download\) \{[\s\S]*?"rank copy"[\s\S]*?"action action"/);
assert.match(theme, /\.noctra-live-torrent-download \{[\s\S]*?grid-area: action !important;[\s\S]*?width: 100% !important/);
assert.match(theme, /#noctra-panel > \.noctra-panel-body,[\s\S]*?max-width: 100% !important/);

console.log(`Noctra v${pkg.version} - Prowlarr local prioritaire et interfaces mobiles nettoyées : OK`);
