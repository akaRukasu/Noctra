import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(index.includes('noctra-theme.css?v=200.21'));
assert.ok(index.includes('MaterialIcons-Regular.2d8017489da689caedc1.woff2?v=200.21'));
assert.equal(theme.includes("font-family: 'Noctra Material Icons'"), false);
assert.match(theme, /videoPlayerContainer \.material-icons::before[\s\S]*?font-family:\s*'Material Icons' !important/);
assert.match(theme, /body\.noctra-playing #noctra-dock[\s\S]*?display:\s*none !important/);

console.log('Noctra v193 - rendu visuel du lecteur Jellyfin : OK');
