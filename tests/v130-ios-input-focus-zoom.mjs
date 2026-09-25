import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(theme.includes('Noctra V130 - iOS ne zoome plus au focus des champs mobiles.'));
assert.match(theme, /@media \(max-width: 760px\) \{[\s\S]*?#noctra-panel input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):not\(\[type="file"\]\),[\s\S]*?#noctra-panel select,[\s\S]*?#noctra-panel textarea \{[\s\S]*?font-size: 16px !important;/);
assert.ok(shell.includes('type="search" data-tv-search'));

const viewport = index.match(/<meta name="viewport" content="([^"]+)">/)?.[1] || '';
assert.ok(viewport.includes('width=device-width'));
assert.ok(!/maximum-scale|user-scalable\s*=\s*no/i.test(viewport));

console.log('V130 iOS mobile input focus zoom checks: OK');
