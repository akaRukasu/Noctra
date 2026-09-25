import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');

assert.match(server, /'fstv'.*'dlstreams'.*'streamsports99'/s, 'les nouveaux types TV doivent être acceptés');
assert.match(server, /id: 'fstv-public'.*name: 'FSTV'.*section: 'channels'/s, 'FSTV doit être une source Chaînes');
assert.match(server, /id: 'dlstreams-sports'.*section: 'sports'/s, 'DLStreams doit être dans Sports');
assert.match(server, /id: 'streamsports99-sports'.*section: 'sports'/s, 'StreamSports99 doit être dans Sports');

const lw = server.indexOf("['livewatch-curated', 0]");
const fstv = server.indexOf("['fstv-public', 1]");
const oha = server.indexOf("['oha-live', 2]");
assert.ok(lw >= 0 && fstv > lw && oha > fstv, 'FSTV doit être placé entre LiveWatch et OHA');

assert.match(server, /async function tvCatalogFromFstv/);
assert.match(server, /async function tvCatalogFromDlStreams/);
assert.match(server, /async function tvCatalogFromStreamSports99/);
assert.match(server, /\/stream\/stream-\$\{id\}\.php/, 'DLStreams doit utiliser son embed public documenté');
assert.ok(server.includes('\\/player\\/'), 'StreamSports99 doit conserver ses pages player publiques');
assert.match(server, /source\.type === 'fstv'.*tvCatalogFromFstv/s);
assert.match(server, /source\.type === 'dlstreams'.*tvCatalogFromDlStreams/s);
assert.match(server, /source\.type === 'streamsports99'.*tvCatalogFromStreamSports99/s);
assert.match(shell, /NOCTRA_BUILD_VERSION = '200\.0\.21'/);
assert.match(sw, /noctra-shell-v200-r15/);
console.log('v148 new TV sources tests passed');
