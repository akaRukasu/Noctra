import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("label: 'VIP Premium · direct'"));
assert.ok(server.includes("const vipFamilySource = sourceId === 'livewatch-curated';"));
assert.ok(server.includes("playbackType: 'resolver'"));
assert.ok(server.includes("liveWatchMandatoryAd: false"));
assert.ok(server.includes("playbackType: 'embed'"));
console.log('v115/v119 official alternative playback compatibility checks passed');
