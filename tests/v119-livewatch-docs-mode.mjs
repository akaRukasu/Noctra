import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("https://livewatch.top/api/v1/public/all"));
assert.ok(!server.includes("https://livewatch.top/api/v1/public/daddy/channels"));
assert.ok(server.includes("https://livewatch.top/api/v1/public/north/channels"));
assert.ok(server.includes("https://livewatch.top/api/v1/public/frame/channels"));
assert.ok(server.includes("https://livewatch.top/api/v1/public/football"));
assert.ok(server.includes("https://livewatch.top/api/v1/public/bosstv"));
assert.ok(server.includes("https://livewatch.top/api/v1/public/jacktv/matches"));
assert.ok(server.includes("https://livewatch.top/api/v1/public/sports/daily"));
assert.ok(server.includes("liveWatchDocsEmbed: true"));
assert.ok(server.includes("const vipFamilySource = sourceId === 'livewatch-curated';"));
assert.ok(server.includes("liveWatchDocsEmbed: false"));
assert.ok(shell.includes("channel.liveWatchDocsEmbed"));
assert.ok(shell.includes("chaîne disponible uniquement pendant certains événements"));
console.log('v119 LiveWatch docs-mode checks passed');
