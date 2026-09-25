import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));
assert.ok(server.includes("version: '200.0.21'"));

assert.ok(server.includes("'streamed'"));
assert.ok(server.includes("'volkamax'"));
assert.ok(server.includes("id: 'streamed-sports'"));
assert.ok(server.includes("id: 'volkamax-sports'"));
assert.ok(server.includes('async function tvCatalogFromStreamed'));
assert.ok(server.includes('/api/matches/live/popular'));
assert.ok(server.includes('/api/matches/featured'));
assert.ok(server.includes('/watch/${encodeURIComponent(id)}'));
assert.ok(server.includes('async function tvCatalogFromVolkamax'));
assert.ok(server.includes('bzh-sport\\.lat'));

assert.ok(server.includes('function fstvLiveUrlFromChannelPage'));
assert.ok(server.includes('async function enrichFstvDirectStreams'));
assert.ok(server.includes("streamKind: 'FSTV · HLS direct'"));
assert.ok(server.includes("provider: 'FSTV', forceHls: true"));
assert.ok(server.includes('/^(?:LiveWatch|OHA|WiTV|FSTV|StreamSports99)$/i.test(provider)'));

assert.ok(server.includes('https://api.cdnlivetv.is/api/v1/events/sports/?user=cdnlivetv&plan=free'));
assert.ok(server.includes('https://cdnlivetv.is/api/v1/events/sports/?user=cdnlivetv&plan=free'));
assert.ok(server.includes('cdn-live\\.tv|cdnlivetv\\.(?:is|tv)'));

console.log('v154 Sport sources / FSTV / StreamSports99 checks: OK');
