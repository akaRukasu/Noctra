import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');

assert.match(shell, /NOCTRA_BUILD_VERSION = '200\.0\.21'/);
assert.match(server, /version: '200\.0\.21'/);
assert.match(shell, /document\.documentElement\.dataset\.noctraBuild = NOCTRA_BUILD_VERSION/);
assert.match(shell, /frame < 12 && !document\.querySelector\('#noctra-seerr-results'\)/);
assert.match(shell, /const quick = await api\(quickPath, \{ timeoutMs: 18_000 \}\)/);
assert.match(shell, /apiResponseCache\.set\(quickPath, \{ value: quick, expiresAt: Date\.now\(\) \+ 5 \* 60_000 \}\)/);
assert.doesNotMatch(shell, /Promise\.race\(\[/);
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(index.includes('noctra-theme.css?v=200.21'));

console.log('Noctra v188 - chargement déterministe des demandes : OK');
