import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21') && index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(shell.includes('function hydrateHomeLibraryImages(mediaSection)'), 'Mes medias doit utiliser le catalogue Noctra comme repli.');
assert.ok(shell.includes("cachedApi('/api/libraries', 45_000)"), 'Le repli doit reutiliser les images du menu Mediatheques.');
assert.ok(shell.includes('void hydrateHomeLibraryImages(mediaSection)'), 'Le repli authentifie doit etre rejoue meme apres une image native tardive.');
assert.ok(shell.includes("dock.dataset.persistent = 'true'"), 'Le dock ne doit plus se replier.');
assert.ok(shell.includes('const persistent = !playing'), 'Le dock doit rester developpe hors lecture et disparaitre pendant un film ou une serie.');

assert.ok(theme.includes('Noctra V167 - dock stable et mediatheques sans defilement inutile.'));
assert.match(theme, /body\.noctra-panel-open #noctra-dock\[data-role\][\s\S]*?width:\s*max-content !important;/);
assert.match(theme, /body\.noctra-panel-open #noctra-panel > \.noctra-panel-header[\s\S]*?height:\s*84px !important;/);
assert.match(theme, /data-noctra-panel-kind="libraries"[\s\S]*?height:\s*clamp\(190px,[\s\S]*?300px\) !important;/);
assert.ok(theme.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;'));
assert.ok(theme.includes('overflow-y: hidden !important;'));

console.log('Noctra v169 - dock et mediatheques : OK');
