import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));
assert.ok(server.includes("version: '200.0.21'"));

assert.ok(server.includes("'alternative'"));
assert.ok(server.includes("id: 'haloule-alternatives'"));
assert.ok(server.includes("section: 'alternatives'"));
assert.ok(server.includes('function parseHalouleAlternatives'));
assert.ok(server.includes('async function tvCatalogFromAlternative'));
assert.ok(server.includes('tvCatalogFromAlternative(source.url)'));
assert.ok(server.includes('5 * 60_000'));

assert.ok(server.includes('live\\.php\\?(?:id=[a-z0-9-]+|dl=\\d+)'));
assert.ok(shell.includes("'streamed.pk'"));
assert.ok(shell.includes("'bzh-sport.lat'"));
assert.ok(shell.includes("channel?.provider === 'Streamed'"));
assert.ok(shell.includes("channel?.provider === 'Volkamax'"));
assert.ok(shell.includes("alternatives: 'Alternative'"));
assert.ok(shell.includes("['favorites', 'channels', 'sports', 'alternatives', 'portals', 'personal']"));

assert.ok(theme.includes('Noctra V155 - dock lisible'));
assert.ok(theme.includes('background: rgba(12, 14, 20, .86) !important'));
assert.ok(theme.includes('backdrop-filter: blur(14px) saturate(120%) !important'));

console.log('v155 Alternative/dock/sources checks: OK');
