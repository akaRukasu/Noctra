import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'noctra-v134-relink-'));
const libraryRoot = join(root, 'Films');
const trashRoot = join(root, 'Trash');
const seedRoot = join(root, '.noctra-seed');
await Promise.all([mkdir(libraryRoot), mkdir(trashRoot)]);
const sourcePath = join(libraryRoot, 'Film (2026).mkv');
const payload = Buffer.from('noctra-v134-hardlink-verification');
await writeFile(sourcePath, payload);

const torrentHash = 'a'.repeat(40);
const torrentName = 'Film.2026.MULTi.1080p.mkv';
const qbitActions = [];
let qbitLocation = '';
let qbitCheckPolls = -1;
let verifiedProgress = 1;
let verifiedRemaining = 0;

const json = (res, body, headers = {}) => {
  const data = JSON.stringify(body);
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers });
  res.end(data);
};

const mock = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/Users/Me') {
    return json(res, { Id: '1'.repeat(32), Name: 'QA', Policy: { IsAdministrator: true } });
  }
  if (url.pathname === '/api/v2/auth/login') {
    return json(res, {}, { 'set-cookie': 'SID=noctra-test; Path=/' });
  }
  if (url.pathname === '/api/v2/torrents/info') {
    const checking = qbitCheckPolls >= 0 && qbitCheckPolls < 2;
    const verified = qbitCheckPolls >= 2;
    if (qbitCheckPolls >= 0) qbitCheckPolls += 1;
    return json(res, [{
      hash: torrentHash,
      name: torrentName,
      state: checking ? 'checkingUP' : verified ? 'pausedUP' : 'missingFiles',
      progress: verified ? verifiedProgress : 0,
      amount_left: verified ? verifiedRemaining : payload.length,
      total_size: payload.length,
      downloaded: payload.length,
      uploaded: 0,
      save_path: trashRoot,
      content_path: join(trashRoot, torrentName),
      completion_on: 1_700_000_000,
      added_on: 1_699_000_000
    }]);
  }
  if (url.pathname === '/api/v2/torrents/files') {
    return json(res, [{ name: torrentName, size: payload.length, priority: 1, progress: 0 }]);
  }
  if (url.pathname === '/api/v2/torrents/setLocation') {
    const body = new URLSearchParams(await readRequest(req));
    qbitLocation = body.get('location') || '';
    qbitActions.push('setLocation');
    return json(res, {});
  }
  if (/^\/api\/v2\/torrents\/(?:stop|pause|start|resume|recheck)$/.test(url.pathname)) {
    const action = url.pathname.split('/').at(-1);
    qbitActions.push(action);
    if (action === 'recheck') qbitCheckPolls = 0;
    return json(res, {});
  }
  if (url.pathname === '/api/v3/history') {
    return json(res, {
      page: 1,
      pageSize: 1000,
      totalRecords: 1,
      records: [{ downloadId: torrentHash, eventType: 'downloadFolderImported', data: { importedPath: sourcePath } }]
    });
  }
  return json(res, {});
});

function readRequest(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

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
    QBITTORRENT_URL: `http://127.0.0.1:${mockPort}`,
    QBITTORRENT_USERNAME: 'qa',
    QBITTORRENT_PASSWORD: 'qa',
    RADARR_URL: `http://127.0.0.1:${mockPort}`,
    RADARR_API_KEY: 'qa',
    SONARR_URL: `http://127.0.0.1:${mockPort}`,
    SONARR_API_KEY: 'qa',
    MEDIA_ROOTS: `Films:${libraryRoot}|Trash:${trashRoot}`,
    NOCTRA_SEED_ROOT: seedRoot,
    LIVEWATCH_BUILTINS: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let childOutput = '';
child.stdout.on('data', chunk => { childOutput += chunk.toString('utf8'); });
child.stderr.on('data', chunk => { childOutput += chunk.toString('utf8'); });

const base = `http://127.0.0.1:${appPort}`;
const headers = { 'x-noctra-token': 'noctra-v134-test-token' };
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Noctra test server stopped (${child.exitCode}). ${childOutput}`);
    const ready = await fetch(`${base}/health`).then(response => response.ok).catch(() => false);
    if (ready) break;
    if (attempt === 79) throw new Error(`Noctra test server did not start. ${childOutput}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const preview = await fetch(`${base}/api/downloads/relink/preview`, { headers }).then(response => response.json());
  assert.equal(preview.candidates, 1);
  assert.equal(preview.missing, 1);

  const started = await fetch(`${base}/api/downloads/relink/start`, { method: 'POST', headers });
  assert.equal(started.status, 202);
  let status;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    status = await fetch(`${base}/api/downloads/relink/status`, { headers }).then(response => response.json());
    if (!status.running) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(status.phase, 'complete');
  assert.equal(status.relinked, 1);
  assert.equal(status.verified, 1);
  assert.equal(status.reseeded, 1);
  assert.equal(status.verificationFailed, 0);
  assert.equal(status.failed, 0);

  const targetPath = join(seedRoot, torrentHash, torrentName);
  assert.deepEqual(await readFile(targetPath), payload);
  const [sourceInfo, targetInfo] = await Promise.all([stat(sourcePath), stat(targetPath)]);
  assert.equal(sourceInfo.ino, targetInfo.ino, 'La relocalisation doit utiliser un lien physique sur le même volume.');
  assert.equal(qbitLocation, join(seedRoot, torrentHash));
  assert.ok(qbitActions.includes('setLocation'));
  assert.ok(qbitActions.includes('recheck'));
  assert.ok(qbitActions.includes('start') || qbitActions.includes('resume'));

  const resumeCount = () => qbitActions.filter(action => ['start', 'resume'].includes(action)).length;
  const safeResumes = resumeCount();
  qbitCheckPolls = -1;
  verifiedProgress = .9999999;
  verifiedRemaining = 1;
  const secondRun = await fetch(`${base}/api/downloads/relink/start`, { method: 'POST', headers });
  assert.equal(secondRun.status, 202);
  for (let attempt = 0; attempt < 300; attempt += 1) {
    status = await fetch(`${base}/api/downloads/relink/status`, { headers }).then(response => response.json());
    if (!status.running) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(status.phase, 'complete');
  assert.equal(status.relinked, 1, 'Un lien existant doit etre reutilise.');
  assert.equal(status.verificationFailed, 1);
  assert.equal(status.reseeded, 0, 'Meme un octet absent doit interdire la reprise.');
  assert.equal(resumeCount(), safeResumes, 'Aucun demarrage apres une verification incomplete.');
  assert.equal((await stat(targetPath)).ino, sourceInfo.ino, 'Aucune copie ni remplacement a la seconde execution.');
  const checks = qbitActions.filter(action => action === 'recheck').length;
  qbitCheckPolls = -1;
  assert.equal((await fetch(`${base}/api/downloads/relink/start`, { method: 'POST', headers })).status, 202);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    status = await fetch(`${base}/api/downloads/relink/status`, { headers }).then(response => response.json());
    if (!status.running) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(status.phase, 'complete');
  assert.equal(status.relinked, 0, 'Un fichier inchange deja invalide ne doit pas etre reverifie en boucle.');
  assert.equal(qbitActions.filter(action => action === 'recheck').length, checks);
  assert.equal(resumeCount(), safeResumes);
  assert.equal((await stat(targetPath)).ino, sourceInfo.ino);
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
  await new Promise(resolve => mock.close(resolve));
  await rm(root, { recursive: true, force: true });
}

console.log('v134 isolated qBittorrent/Radarr/Sonarr relink integration passed');
