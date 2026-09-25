import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

assert.match(shell, /NOCTRA_BUILD_VERSION = '200\.0\.21'/);
assert.match(server, /version: '200\.0\.21'/);
assert.match(shell, /let lastRequestDiscoveryData = null/);
assert.match(shell, /lastRequestDiscoveryData = data/);
assert.match(shell, /if \(lastRequestDiscoveryData\) \{[\s\S]*renderDiscovery\(lastRequestDiscoveryData\)/);
assert.match(shell, /prefix\.startsWith\('\/api\/discovery'\)[\s\S]*lastRequestDiscoveryData = null/);

console.log('Noctra v186 - réouverture immédiate des demandes : OK');
