import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'noctra-v199-sonarr-season-'));
const requests = [];
const json = (res, body) => {
  const value = JSON.stringify(body);
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(value) });
  res.end(value);
};

const release = (guid, title, seasonNumber, fullSeason, seeders) => ({
  guid,
  indexerId: 7,
  indexer: 'C411',
  title,
  size: 5_000_000_000,
  seeders,
  fullSeason,
  seasonNumber,
  protocol: 'torrent',
  quality: { quality: { name: 'WEBDL-1080p' } },
  languages: [{ name: 'French' }]
});

const mock = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  requests.push(`${url.pathname}${url.search}`);
  if (url.pathname === '/Users/Me') return json(res, { Id: '1'.repeat(32), Name: 'QA', Policy: { IsAdministrator: true } });
  if (url.pathname === '/api/v3/episode') return json(res, [
    { id: 101, seasonNumber: 1, episodeNumber: 1 },
    { id: 201, seasonNumber: 2, episodeNumber: 1 }
  ]);
  if (url.pathname === '/api/v3/release' && url.searchParams.get('seasonNumber') === '1') return json(res, [
    release('season-1', 'Capitaines.de.la.Coupe.du.Monde.2023.S01.MULTI.VFF', 1, false, 42),
    release('episode-1', 'Capitaines.de.la.Coupe.du.Monde.S01E01.MULTI.VFF', 1, false, 80)
  ]);
  if (url.pathname === '/api/v3/release' && url.searchParams.get('seasonNumber') === '2') return json(res, [
    release('season-2', 'Capitaines.de.la.Coupe.du.Monde.2024.S02.COMPLETE.MULTI.VFF', 2, true, 20)
  ]);
  return json(res, []);
});

await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const mockPort = mock.address().port;
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const appPort = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const projectRoot = new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1');
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    CONFIG_FILE: join(root, 'empty.env'),
    HOST: '127.0.0.1',
    PORT: String(appPort),
    BASE_URL: '',
    JELLYFIN_URL: `http://127.0.0.1:${mockPort}`,
    SONARR_URL: `http://127.0.0.1:${mockPort}`,
    SONARR_API_KEY: 'qa',
    LIVEWATCH_BUILTINS: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
child.stderr.on('data', chunk => { output += chunk.toString('utf8'); });
const base = `http://127.0.0.1:${appPort}`;
const headers = { 'x-noctra-token': 'noctra-v199-season-token' };

try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Noctra stopped (${child.exitCode}). ${output}`);
    if (await fetch(`${base}/health`).then(response => response.ok).catch(() => false)) break;
    if (attempt === 79) throw new Error(`Noctra did not start. ${output}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const seasonResponse = await fetch(`${base}/api/servarr/releases?type=sonarr&seriesId=42&seasonNumber=1`, { headers });
  assert.equal(seasonResponse.status, 200);
  const season = await seasonResponse.json();
  assert.equal(season.searchKind, 'season');
  assert.equal(season.releases[0].guid, 'season-1', 'A taille égale, le titre départage les résultats.');
  assert.equal(season.releases[0].indexer, 'C411');

  const allResponse = await fetch(`${base}/api/servarr/releases?type=sonarr&seriesId=42&allSeasons=1`, { headers });
  assert.equal(allResponse.status, 200);
  const all = await allResponse.json();
  assert.equal(all.searchKind, 'series');
  assert.deepEqual(new Set(all.releases.map(item => item.guid)), new Set(['season-1', 'season-2']));
  assert.ok(all.releases.every(item => item.seriesPack));
  assert.equal(all.packMode, 'season');
  assert.equal(all.integralCount, 0);
  assert.equal(all.seasonPackCount, 2, 'Les packs S01 sans fullSeason doivent figurer dans le repli.');
  assert.ok(requests.some(value => value.includes('seriesId=42&seasonNumber=1')));
  assert.ok(requests.some(value => value.includes('seriesId=42&seasonNumber=2')));
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
  await new Promise(resolve => mock.close(resolve));
  await rm(root, { recursive: true, force: true });
}

console.log('v199 Sonarr season packs and full-series search tests passed');
