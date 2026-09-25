import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.match(server, /version: '200\.0\.21'/);
assert.match(shell, /NOCTRA_BUILD_VERSION = '200\.0\.21'/);
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.match(server, /function tvChannelSortIdentity/);
assert.match(server, /replace\(\/\\s\*\\\.\(\?:b\|c\|s\)\\s\*\$\/i, ''\)/);
assert.match(server, /if \(channel\.playbackType === 'resolver' && channel\.resolverUrl\) return 0/);
assert.match(server, /const playbackOrder = tvChannelPlaybackPriority\(left\.channel\) - tvChannelPlaybackPriority\(right\.channel\)/);

console.log('Noctra v189 - priorité des variantes TV fonctionnelles : OK');
