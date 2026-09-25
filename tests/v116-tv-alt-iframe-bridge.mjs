import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
// Le bridge à jeton reste présent pour compatibilité, mais v123 restaure le
// bridge historique stable pour LiveWatch + Daddy/North/Frame quand le VIP est actif.
assert.ok(server.includes("kind: 'livewatch-bridge'"));
assert.ok(server.includes("const vipFamilySource = sourceId === 'livewatch-curated';"));
assert.ok(server.includes("liveWatchDocsEmbed: false"));
assert.ok(server.includes("if (status.active && vipFamilySource && reference"));
assert.ok(shell.includes("channel.liveWatchDocsEmbed"));
console.log('v116/v119 bridge isolation compatibility checks passed');
