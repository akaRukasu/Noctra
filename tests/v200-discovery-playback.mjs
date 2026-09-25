import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1');
const [shell, theme, serverSource] = await Promise.all([
  readFile(join(projectRoot, 'public', 'noctra-shell.js'), 'utf8'),
  readFile(join(projectRoot, 'public', 'noctra-theme.css'), 'utf8'),
  readFile(join(projectRoot, 'server.mjs'), 'utf8')
]);

assert.match(shell, /afterUpdate: \(\) => \{\s*if \(initialSeason !== undefined\) renderEpisodeSeason\(initialSeason\)/,
  'La saison initiale Sonarr doit être rendue après l’injection asynchrone du panneau.');
assert.match(shell, /data-season-release=/);
assert.match(shell, /data-series-release-all=/);
assert.match(shell, /data-discovery-genre/);
assert.match(shell, /\['anime', 'Animés'\]/);
assert.match(shell, /\['animation', 'Films d’animation'\]/);
assert.match(shell, /\['classics', 'Classiques'\]/);
assert.match(shell, /function stabilizeJellyfinVodPlayback/);
assert.match(shell, /state\.stalls < 2/);
assert.match(shell, /video\.preload = 'auto'/);
assert.match(shell, /streamsports99-stall-restart/);
assert.match(shell, /\^StreamSports99\$\/i\.test\(playbackProvider\) \? 8_000/,
  'StreamSports99 doit relancer le serveur courant après huit secondes de gel.');
assert.match(theme, /repeat\(2,minmax\(140px,.52fr\)\)/);
assert.match(serverSource, /function filterDiscoveryCatalog/);
assert.match(serverSource, /category === 'anime'/);
assert.match(serverSource, /category === 'animation'/);
assert.match(serverSource, /category === 'classics'/);

const root = await mkdtemp(join(tmpdir(), 'noctra-v200-discovery-'));
const json = (res, body) => {
  const value = JSON.stringify(body);
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(value) });
  res.end(value);
};

const anime = {
  id: 101, name: 'Anime comique', firstAirDate: '2026-01-10', originalLanguage: 'ja',
  genreIds: [16, 35], voteAverage: 8.1, voteCount: 500, popularity: 120
};
const animation = {
  id: 202, title: 'Animation familiale', releaseDate: '2025-09-12', originalLanguage: 'en',
  genreIds: [16, 10751], voteAverage: 7.5, voteCount: 600, popularity: 90
};
const classic = {
  id: 303, title: 'Grand classique', releaseDate: '1975-04-02', originalLanguage: 'fr',
  genreIds: [18], voteAverage: 8.4, voteCount: 2000, popularity: 65
};

const mock = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/Users/Me') return json(res, { Id: '1'.repeat(32), Name: 'QA', Policy: { IsAdministrator: true } });
  if (url.pathname === '/api/v1/discover/tv') return json(res, { results: [anime] });
  if (url.pathname === '/api/v1/discover/movies') {
    return json(res, { results: [url.searchParams.has('primaryReleaseDateLte') ? classic : animation] });
  }
  return json(res, { results: [] });
});

await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const mockPort = mock.address().port;
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const appPort = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    CONFIG_FILE: join(root, 'empty.env'),
    HOST: '127.0.0.1',
    PORT: String(appPort),
    BASE_URL: '',
    JELLYFIN_URL: `http://127.0.0.1:${mockPort}`,
    JELLYSEERR_URL: `http://127.0.0.1:${mockPort}`,
    JELLYSEERR_API_KEY: 'qa',
    TMDB_API_KEY: '',
    TMDB_BEARER_TOKEN: '',
    LIVEWATCH_BUILTINS: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
child.stderr.on('data', chunk => { output += chunk.toString('utf8'); });
const base = `http://127.0.0.1:${appPort}`;
const headers = { 'x-noctra-token': 'noctra-v200-discovery-token' };

try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Noctra stopped (${child.exitCode}). ${output}`);
    if (await fetch(`${base}/health`).then(response => response.ok).catch(() => false)) break;
    if (attempt === 79) throw new Error(`Noctra did not start. ${output}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const animeResponse = await fetch(`${base}/api/discovery?category=anime&genre=comedy`, { headers });
  assert.equal(animeResponse.status, 200);
  const animeData = await animeResponse.json();
  assert.equal(animeData.genre, 'comedy');
  assert.equal(animeData.results.length, 1);
  assert.equal(animeData.results[0].mediaType, 'tv');
  assert.equal(animeData.results[0].source, 'anime');

  const animationResponse = await fetch(`${base}/api/discovery?category=animation`, { headers });
  assert.equal(animationResponse.status, 200);
  const animationData = await animationResponse.json();
  assert.equal(animationData.results.length, 1);
  assert.equal(animationData.results[0].mediaType, 'movie');

  const classicResponse = await fetch(`${base}/api/discovery?category=classics`, { headers });
  assert.equal(classicResponse.status, 200);
  const classicData = await classicResponse.json();
  assert.equal(classicData.results.length, 1);
  assert.equal(classicData.results[0].title, 'Grand classique');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
  await new Promise(resolve => mock.close(resolve));
  await rm(root, { recursive: true, force: true });
}

console.log('v200 Sonarr initial actions, discovery genres and Jellyfin buffering checks passed');
