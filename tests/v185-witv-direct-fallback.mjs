import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

assert.match(shell, /NOCTRA_BUILD_VERSION = '200\.0\.21'/);
assert.match(server, /version: '200\.0\.21'/);
assert.match(shell, /const directFallbackStarted = \/\^WiTV\$\/i\.test\(playbackProvider\)/);
assert.match(shell, /startResolvedOptionFallback\('aucun média reçu avant le délai'\)/);
assert.match(shell, /!directFallbackStarted && !startProviderWebFallback/);
assert.match(shell, /\? 12_000 : 22_000/);

console.log('Noctra v185 - reprise WiTV directe prioritaire : OK');
