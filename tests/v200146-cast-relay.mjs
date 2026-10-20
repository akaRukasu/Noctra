// 200.0.146 — relais d'une chaîne pour un téléviseur (AirPlay, Chromecast) : ffmpeg copie le flux
// (sans réencodage) dans une liste HLS locale avec une réserve de segments, et se reconnecte seul.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTvMosaic, findFfmpeg, relayArgs } from '../lib/tv-mosaic.mjs';

const args = relayArgs({ input: 'http://127.0.0.1:3000/api/tv/livewatch/hls/main/x', dir: '/tmp/r', generation: 2 });
assert.deepEqual(args.slice(args.indexOf('-c'), args.indexOf('-c') + 2), ['-c', 'copy'], 'aucun réencodage');
assert.ok(args.includes('0:a:0?'), 'chaîne sans son acceptée');
assert.ok(args.includes('/tmp/r/s2-%05d.ts'));
assert.equal(args[args.indexOf('-hls_list_size') + 1], '10');

const root = await mkdtemp(join(tmpdir(), 'noctra-relay-'));
const spawned = [];
let segments = 0;
const fakeSpawn = (file, list) => {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.killed = true; };
  spawned.push(list);
  const playlist = list[list.length - 1];
  // Segments écrits peu à peu : la diffusion attend une réserve de 3 segments.
  const timer = setInterval(() => {
    segments += 1;
    writeFile(playlist, '#EXTM3U\n' + Array.from({ length: segments }, (_, i) => `#EXTINF:4,\ns1-0000${i}.ts`).join('\n') + '\n').catch(() => {});
    if (segments >= 4) clearInterval(timer);
  }, 60);
  return child;
};
const relays = createTvMosaic({ root, locate: async () => ({ path: 'ffmpeg', version: 'x' }), spawn: fakeSpawn });
const started = await relays.start({ owner: 'u1:relais', inputs: ['http://127.0.0.1/a'], relay: true, wait: 5_000 });
assert.equal(started.ready, true);
assert.equal(started.relay, true);
assert.ok(segments >= 3, 'réserve de 3 segments avant la diffusion');
assert.ok(spawned[0].includes('copy'));
await assert.rejects(relays.start({ owner: 'u1:relais', inputs: ['a', 'b'], relay: true }), /qu’une chaîne/);
// Le multiview diffusé du même compte n'est pas remplacé par le relais (propriétaires distincts).
const mosaic = await relays.start({ owner: 'u1', inputs: ['http://127.0.0.1/a', 'http://127.0.0.1/b'], wait: 0 });
assert.ok(relays.get(started.id) && relays.get(mosaic.id));
relays.stopAll();

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
assert.match(server, /owner: `\$\{session\.id \|\| session\.token\}\$\{relay \? ':relais' : ''\}`/);

const ffmpeg = await findFfmpeg();
if (ffmpeg) {
  const { spawn } = await import('node:child_process');
  const { createServer } = await import('node:http');
  const sources = await mkdtemp(join(tmpdir(), 'noctra-relay-src-'));
  const maker = spawn(ffmpeg.path, ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25', '-f', 'lavfi', '-i', 'sine=f=440',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-c:a', 'aac', '-f', 'hls', '-hls_time', '1', '-hls_list_size', '20', join(sources, 'c.m3u8')], { stdio: 'ignore' });
  const http = createServer(async (req, res) => {
    try { res.end(await readFile(join(sources, req.url.slice(1)))); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => setTimeout(resolve, 3_000));
  const real = createTvMosaic({ root, locate: async () => ffmpeg });
  const live = await real.start({ owner: 'u1:relais', inputs: [`http://127.0.0.1:${http.address().port}/c.m3u8`], relay: true, wait: 40_000 });
  assert.equal(live.ready, true, `relais réel prêt (${live.error || 'sans erreur'})`);
  const text = await readFile(real.file(live.id, 'index.m3u8'), 'utf8');
  assert.ok((text.match(/#EXTINF/g) || []).length >= 3);
  real.stopAll();
  maker.kill('SIGTERM');
  http.close();
  await rm(sources, { recursive: true, force: true });
  console.log(`v200.0.146 : relais réel (copie, ffmpeg ${ffmpeg.version}) : OK`);
}
await rm(root, { recursive: true, force: true });
console.log('v200.0.146 : relais des chaînes diffusées (copie sans réencodage, réserve, reconnexion) : OK');
