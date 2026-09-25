import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');

assert.ok(server.includes("const vipFamilySource = sourceId === 'livewatch-curated';"), 'Only main LiveWatch may be decorated with the VIP resolver.');
assert.ok(server.includes("if (status.active && vipFamilySource && reference && reference.kind === 'main')"), 'Main LiveWatch must keep its VIP resolver.');
assert.ok(server.includes("['north', 'frame'].includes(sourceFamily)"), 'NorthTV and FrameTV must use their current official HLS resolver paths.');
assert.ok(shell.includes("if (!liveWatchOfficialEmbedSource()) return false;"), 'Official alternative sources must retain their documented public fallback.');
assert.ok(shell.includes("if (channel?.playbackType === 'resolver' && channel?.resolverUrl) return false;"), 'A current resolver must win over a stale public embed cache.');
assert.ok(shell.includes("const vipBridgeSource = sourceId === 'livewatch-curated';"), 'Alternative sources must not advertise the main LiveWatch VIP bridge.');
assert.ok(shell.includes("resolverUrl: '',"));
assert.ok(shell.includes("vipPlayback: northSameOrigin,"));
assert.ok(shell.includes("const mandatoryGate = !northSameOrigin"), 'Public fallback embeds must keep their documented gate.');
console.log('v125 LiveWatch alternative official-embed regression checks passed.');
