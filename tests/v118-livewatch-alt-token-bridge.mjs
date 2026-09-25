import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
// Le transport tokenisé v118 reste disponible en compatibilité ; v123 revient
// au bridge historique pour les familles VIP et garde les embeds docs hors VIP.
assert.ok(server.includes("meta?.kind !== 'livewatch-bridge'"));
assert.ok(server.includes("trustedLiveWatchBridgeRequest"));
assert.ok(server.includes("const vipFamilySource = sourceId === 'livewatch-curated';"));
assert.ok(server.includes("playbackType: 'embed'"));
assert.ok(shell.includes("tvTrustedEmbedHosts = new Set(['livewatch.top'"));
console.log('v118/v119 token bridge fallback checks passed');
