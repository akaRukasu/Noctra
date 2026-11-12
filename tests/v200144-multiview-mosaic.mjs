// 200.0.144 — multiview diffusable partout : ffmpeg compose les chaînes en un seul flux HLS
// (grille ou chaîne mise en avant, son d'une chaîne) lu par Chromecast, AirPlay ou tout lecteur.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mosaicArgs, mosaicLayout, createTvMosaic, findFfmpeg } from '../lib/tv-mosaic.mjs';
import { createTvCastAccess } from '../lib/tv-cast.mjs';

// Mises en page : cases dans l'image 1280 × 720, sans chevauchement.
for (const [count, featured] of [[1, -1], [2, -1], [4, -1], [5, -1], [9, -1], [2, 0], [4, 1], [8, 3]]) {
  const cells = mosaicLayout(count, featured);
  assert.equal(cells.length, count);
  for (const cell of cells) {
    assert.ok(cell.x >= 0 && cell.y >= 0 && cell.x + cell.w <= 1280 && cell.y + cell.h <= 720, `${count}/${featured} dans l'image`);
    assert.equal(cell.w % 2 + cell.h % 2 + cell.x % 2 + cell.y % 2, 0, 'pixels pairs (yuv420p)');
  }
  for (let a = 0; a < cells.length; a += 1) for (let b = a + 1; b < cells.length; b += 1) {
    const [p, q] = [cells[a], cells[b]];
    assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${count}/${featured} : cases ${a} et ${b} séparées`);
  }
}
assert.deepEqual(mosaicLayout(4, 1)[1], { x: 0, y: 90, w: 960, h: 540 }, 'chaîne mise en avant : grande et centrée');
assert.deepEqual(mosaicLayout(4, -1)[3], { x: 640, y: 360, w: 640, h: 360 }, 'grille 2 × 2');

const args = mosaicArgs({ inputs: ['http://127.0.0.1:3000/a', 'http://127.0.0.1:3000/b'], audio: 1, featured: 0, dir: '/tmp/m', generation: 3 });
assert.equal(args.filter(value => value === '-i').length, 3, 'deux chaînes et le fond noir');
assert.ok(args.includes('[1:a:0]asetpts=PTS-STARTPTS,aresample=48000:async=1000,aformat=channel_layouts=stereo[aout]') || args.some(value => value.includes('[1:a:0]asetpts')), 'son de la chaîne choisie');
assert.ok(args.some(value => value.includes('eof_action=repeat')), 'chaîne coupée : dernière image gardée');
assert.ok(args.includes('delete_segments+append_list+discont_start+omit_endlist+independent_segments'), 'relance sur la même liste');
assert.ok(args.includes('/tmp/m/s3-%05d.ts'), 'segments propres à chaque relance');
assert.ok(!args.includes('-live_start_index'), 'aucune option d’entrée que ffmpeg pourrait refuser');

// Gestion des mosaïques avec un faux ffmpeg.
const root = await mkdtemp(join(tmpdir(), 'noctra-mosaic-'));
const spawned = [];
const fakeSpawn = (file, list) => {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  spawned.push({ file, args: list, child });
  const playlist = list[list.length - 1];
  setTimeout(() => writeFile(playlist, '#EXTM3U\n#EXTINF:4,\ns1-00000.ts\n').catch(() => {}), 50);
  return child;
};
const mosaic = createTvMosaic({ root, locate: async () => ({ path: '/usr/bin/ffmpeg', version: '6.1' }), spawn: fakeSpawn });
const first = await mosaic.start({ owner: 'u1', inputs: ['http://127.0.0.1/a', 'http://127.0.0.1/b'], names: ['beIN 1', 'beIN 2'], audio: 1 });
assert.equal(first.ready, true, 'liste disponible avant la diffusion');
assert.match(first.playlist, /^\/api\/tv\/mosaic\/[a-f0-9]{24}\/index\.m3u8$/);
assert.equal(spawned.length, 1);
// Mise à jour (chaîne ajoutée, mise en avant) : même mosaïque, ffmpeg relancé.
const updated = await mosaic.start({ owner: 'u1', id: first.id, inputs: ['http://127.0.0.1/a', 'http://127.0.0.1/b', 'http://127.0.0.1/c'], featured: 2, wait: 0 });
assert.equal(updated.id, first.id);
assert.equal(updated.featured, 2);
assert.equal(spawned[0].child.killed, true, 'ancien ffmpeg arrêté');
assert.ok(spawned[1].args.includes(join(root, first.id, 's2-%05d.ts')));
// Une autre personne ne reprend pas cette mosaïque.
const other = await mosaic.start({ owner: 'u2', id: first.id, inputs: ['http://127.0.0.1/z'], wait: 0 });
assert.notEqual(other.id, first.id);
assert.equal(mosaic.stop(first.id, 'u2'), false);
assert.ok(mosaic.file(first.id, 'index.m3u8'));
assert.equal(mosaic.file(first.id, '../secret'), null, 'aucun autre fichier servi');
assert.equal(mosaic.file(first.id, 's1-00000.ts'), join(root, first.id, 's1-00000.ts'));
assert.equal(mosaic.stop(first.id, 'u1'), true);
assert.equal(mosaic.get(first.id), null);
await assert.rejects(createTvMosaic({ root, locate: async () => null, spawn: fakeSpawn }).start({ owner: 'u1', inputs: ['x'] }), /ffmpeg est introuvable/);
mosaic.stopAll();

// Droit de diffusion : la mosaïque est lisible par le Chromecast sans le jeton du compte.
const cast = createTvCastAccess({ basePath: '/noctra' });
assert.ok(cast.mediaPath('/noctra/api/tv/mosaic/0123456789abcdef01234567/index.m3u8'));
assert.ok(!cast.mediaPath('/noctra/api/tv/mosaic/../session'));

// Câblage du serveur.
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
assert.match(server, /if \(path === '\/api\/tv\/mosaic' && req\.method === 'POST'\)/);
assert.match(server, /tvCastAccess\.issue\(\{ token: session\.token, path: publicPath\(mosaic\.playlist\), origin: requestOrigin \}\)/);
assert.match(server, /return `http:\/\/\$\{tvMosaicLoopbackHost\(\)\}:\$\{port\}\$\{access\.url\}`;/, 'chaînes lues par ffmpeg via le relais local');
assert.match(server, /process\.once\(signal, \(\) => \{ tvMosaic\.stopAll\(\);/);

// Essai réel quand ffmpeg est installé : mosaïque de deux mires.
const ffmpeg = await findFfmpeg();
if (ffmpeg) {
  const { spawn } = await import('node:child_process');
  const { createServer } = await import('node:http');
  const sources = await mkdtemp(join(tmpdir(), 'noctra-mosaic-src-'));
  const makers = [1, 2].map(index => spawn(ffmpeg.path, ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25', '-f', 'lavfi', '-i', `sine=f=${300 * index}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-c:a', 'aac', '-f', 'hls', '-hls_time', '1', '-hls_list_size', '6', join(sources, `c${index}.m3u8`)], { stdio: 'ignore' }));
  const http = createServer(async (req, res) => {
    try { res.end(await readFile(join(sources, req.url.slice(1)))); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => setTimeout(resolve, 3_500));
  const real = createTvMosaic({ root, locate: async () => ffmpeg, preset: 'ultrafast', bitrate: 800 });
  const base = `http://127.0.0.1:${http.address().port}`;
  const live = await real.start({ owner: 'u1', inputs: [`${base}/c1.m3u8`, `${base}/c2.m3u8`], audio: 1, wait: 30_000 });
  assert.equal(live.ready, true, `mosaïque réelle produite (${live.error || 'sans erreur'})`);
  const text = await readFile(real.file(live.id, 'index.m3u8'), 'utf8');
  assert.match(text, /#EXTM3U[\s\S]*s1-\d{5}\.ts/);
  real.stopAll();
  makers.forEach(child => child.kill('SIGTERM'));
  http.close();
  await rm(sources, { recursive: true, force: true });
  console.log(`v200.0.144 : mosaïque réelle avec ffmpeg ${ffmpeg.version} : OK`);
}
await rm(root, { recursive: true, force: true });
console.log('v200.0.144 : multiview diffusable (mosaïque ffmpeg, mises en page, droits de diffusion) : OK');
