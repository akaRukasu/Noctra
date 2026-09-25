import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { access, link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1');
const [shell, theme, serverSource] = await Promise.all([
  readFile(join(projectRoot, 'public', 'noctra-shell.js'), 'utf8'),
  readFile(join(projectRoot, 'public', 'noctra-theme.css'), 'utf8'),
  readFile(join(projectRoot, 'server.mjs'), 'utf8')
]);

assert.match(shell, /data-file-duplicates/);
assert.match(shell, /id="noctra-duplicate-form"/);
assert.match(shell, /data-duplicate-select-all/);
assert.match(shell, /Une copie de chaque fichier restera conservée/);
assert.match(theme, /\.noctra-duplicate-dialog/);
assert.match(serverSource, /sha256MediaFile/);
assert.match(serverSource, /path === '\/api\/files\/duplicates\/delete'/);
assert.match(shell, /class="noctra-qbit-instance"/);
assert.match(serverSource, /function qbitDashboardSummary/);

const root = await mkdtemp(join(tmpdir(), 'noctra-v199-duplicates-'));
const mediaRoot = join(root, 'Films');
const trashRoot = join(root, 'Trash');
await Promise.all([mkdir(mediaRoot), mkdir(trashRoot)]);

async function mediaFile(relative, content) {
  const target = join(mediaRoot, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  return target;
}

const firstPayload = Buffer.alloc(96 * 1024, 0x31);
const secondPayload = Buffer.alloc(80 * 1024, 0x42);
const firstKeep = await mediaFile('A/movie.mkv', firstPayload);
await mediaFile('B/movie-copy.mkv', firstPayload);
await mkdir(join(mediaRoot, 'C'), { recursive: true });
await link(firstKeep, join(mediaRoot, 'C/movie-hardlink.mkv'));
await mediaFile('D/episode.mkv', secondPayload);
await mediaFile('E/episode-copy.mkv', secondPayload);
await mediaFile('F/same-size-not-duplicate.mkv', Buffer.alloc(secondPayload.length, 0x63));

const json = (res, body, status = 200, headers = {}) => {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers });
  res.end(data);
};

const mock = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/Users/Me') return json(res, { Id: '1'.repeat(32), Name: 'QA', Policy: { IsAdministrator: true } });
  if (url.pathname === '/api/v2/auth/login') return json(res, {}, 200, { 'set-cookie': 'SID=v199-dashboard; Path=/' });
  if (url.pathname === '/api/v2/torrents/info') return json(res, [
    {
      hash: 'a'.repeat(40), name: 'Film', state: 'uploading', progress: 1,
      total_size: 1_000, downloaded: 1_000, uploaded: 2_500, num_leechs: 2,
      tracker: 'https://tracker-one.example/announce'
    },
    {
      hash: 'b'.repeat(40), name: 'Série', state: 'pausedUP', progress: 1,
      total_size: 2_000, downloaded: 2_000, uploaded: 500, num_leechs: 0,
      tracker: 'https://tracker-two.example/announce'
    }
  ]);
  if (url.pathname === '/api/v2/transfer/info') return json(res, {
    connection_status: 'connected', dl_info_speed: 0, up_info_speed: 128,
    alltime_dl: 3_000, alltime_ul: 3_000, free_space_on_disk: 9_000
  });
  if (url.pathname === '/api/v2/app/preferences') return json(res, {});
  if (url.pathname === '/api/v2/sync/maindata') return json(res, { server_state: { free_space_on_disk: 9_000 } });
  if (url.pathname === '/api/v2/app/version') { res.writeHead(200); return res.end('5.1.2'); }
  if (url.pathname === '/api/v2/app/webapiVersion') { res.writeHead(200); return res.end('2.11.4'); }
  if (url.pathname === '/api/v2/app/buildInfo') return json(res, { libtorrent: '2.0.11', bitness: 64 });
  return json(res, {});
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
    QBITTORRENT_URL: `http://127.0.0.1:${mockPort}`,
    QBITTORRENT_USERNAME: 'qa',
    QBITTORRENT_PASSWORD: 'qa',
    MEDIA_ROOTS: `Films:${mediaRoot}|Trash:${trashRoot}`,
    NOCTRA_DUPLICATE_MIN_SIZE: String(64 * 1024),
    LIVEWATCH_BUILTINS: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let childOutput = '';
child.stdout.on('data', chunk => { childOutput += chunk.toString('utf8'); });
child.stderr.on('data', chunk => { childOutput += chunk.toString('utf8'); });

const base = `http://127.0.0.1:${appPort}`;
const headers = { 'content-type': 'application/json', 'x-noctra-token': 'noctra-v199-dashboard-token' };
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Noctra test server stopped (${child.exitCode}). ${childOutput}`);
    const ready = await fetch(`${base}/health`).then(response => response.ok).catch(() => false);
    if (ready) break;
    if (attempt === 79) throw new Error(`Noctra test server did not start. ${childOutput}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const downloads = await fetch(`${base}/api/downloads`, { headers }).then(response => response.json());
  assert.equal(downloads.dashboard.allTimeDownloaded, 3_000);
  assert.equal(downloads.dashboard.allTimeUploaded, 3_000);
  assert.equal(downloads.dashboard.globalRatio, 1);
  assert.equal(downloads.dashboard.totalSize, 3_000);
  assert.equal(downloads.dashboard.activeSize, 1_000);
  assert.equal(downloads.dashboard.activePeers, 2);
  assert.equal(downloads.dashboard.trackerCount, 2);
  assert.equal(downloads.dashboard.app.version, '5.1.2');
  assert.equal(downloads.relink.phase, 'idle');
  assert.equal(downloads.relink.running, false);

  const started = await fetch(`${base}/api/files/duplicates/start`, { method: 'POST', headers });
  assert.equal(started.status, 202);
  let duplicateStatus;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    duplicateStatus = await fetch(`${base}/api/files/duplicates/status`, { headers }).then(response => response.json());
    if (!duplicateStatus.running) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(duplicateStatus.phase, 'complete', duplicateStatus.message);
  assert.equal(duplicateStatus.groups.length, 2);
  assert.equal(duplicateStatus.duplicateFiles, 2, 'Le hardlink existant ne doit pas être compté comme une copie physique.');

  const firstGroup = duplicateStatus.groups.find(group => group.size === firstPayload.length);
  const secondGroup = duplicateStatus.groups.find(group => group.size === secondPayload.length);
  assert.ok(firstGroup && secondGroup);
  const firstDuplicate = firstGroup.duplicates[0];
  const secondDuplicate = secondGroup.duplicates[0];
  await writeFile(join(mediaRoot, secondDuplicate.path), Buffer.alloc(secondPayload.length, 0x7f));

  const selected = [
    { root: firstDuplicate.root, path: firstDuplicate.path, keepRoot: firstGroup.keep.root, keepPath: firstGroup.keep.path, size: firstGroup.size, hash: firstGroup.hash },
    { root: secondDuplicate.root, path: secondDuplicate.path, keepRoot: secondGroup.keep.root, keepPath: secondGroup.keep.path, size: secondGroup.size, hash: secondGroup.hash }
  ];
  const deletionResponse = await fetch(`${base}/api/files/duplicates/delete`, {
    method: 'POST', headers, body: JSON.stringify({ items: selected })
  });
  const deletion = await deletionResponse.json();
  assert.equal(deletionResponse.status, 200);
  assert.equal(deletion.removed, 1);
  assert.equal(deletion.errors.length, 1, 'Le fichier modifié après analyse doit être refusé.');
  await assert.rejects(access(join(mediaRoot, firstDuplicate.path)));
  await access(join(mediaRoot, firstGroup.keep.path));
  await access(join(mediaRoot, secondDuplicate.path));
  const keepInfo = await stat(join(mediaRoot, firstGroup.keep.path));
  const hardlinkInfo = await stat(join(mediaRoot, 'C/movie-hardlink.mkv'));
  assert.equal(keepInfo.ino, hardlinkInfo.ino);
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
  await new Promise(resolve => mock.close(resolve));
  await rm(root, { recursive: true, force: true });
}

console.log('v199 qBittorrent dashboard and exact duplicate controls passed');
