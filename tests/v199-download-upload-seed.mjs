import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const projectRoot = new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1');
const [shell, theme, serverSource] = await Promise.all([
  readFile(join(projectRoot, 'public', 'noctra-shell.js'), 'utf8'),
  readFile(join(projectRoot, 'public', 'noctra-theme.css'), 'utf8'),
  readFile(join(projectRoot, 'server.mjs'), 'utf8')
]);

assert.match(shell, /data-download-add-torrent/);
assert.match(shell, /id="noctra-torrent-upload-form"/);
assert.match(shell, /name="savePath"/);
assert.match(shell, /function submitTorrentUploadRequest/);
assert.match(shell, /NOCTRA_HTML_RESPONSE/);
assert.match(shell, /\/api\/downloads\?relinkPreview=/);
assert.match(shell, /\/api\/downloads\?relinkStart=/);
assert.match(shell, /data-download-seed-status/);
assert.match(shell, /En seed/);
assert.match(shell, /Seed arrêté/);
assert.match(shell, /Complet, seed arrêté/);
assert.match(shell, /location\.pathname\.match\(\/\^\(\.\*\)\\\/client\\\/\(\?:index\\\.html\)\?\$\/i\)/);
assert.match(theme, /\.noctra-torrent-upload-card/);
assert.match(theme, /\.noctra-torrent-seed-status/);
assert.match(serverSource, /path === '\/api\/downloads\/add'/);
assert.match(serverSource, /searchParams\.has\('relinkPreview'\)/);
assert.match(serverSource, /searchParams\.has\('relinkStart'\)/);
assert.match(serverSource, /body\.append\('savepath', requestedSavePath\)/);
assert.match(serverSource, /alreadyPresent: true/);
assert.match(serverSource, /\.noctra-seed\(\?:\\\/\|\$\)/);
assert.match(serverSource, /\.slice\(0, 32\)/);
assert.match(serverSource, /Un torrent non rattaché doit rester arrêté[\s\S]*?qbitAction\(torrent\.hash, 'pause'\)/);

const root = await mkdtemp(join(tmpdir(), 'noctra-v199-torrent-upload-'));
let uploadedContentType = '';
let uploadedBody = Buffer.alloc(0);
let addResult = 'Ok.';
let knownTorrents = [];

function readRequest(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const mock = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/Users/Me') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ Id: '1'.repeat(32), Name: 'QA', Policy: { IsAdministrator: true } }));
  }
  if (url.pathname === '/api/v2/auth/login') {
    res.writeHead(200, { 'set-cookie': 'SID=noctra-v199; Path=/' });
    return res.end('Ok.');
  }
  if (url.pathname === '/api/v2/torrents/add') {
    uploadedContentType = String(req.headers['content-type'] || '');
    uploadedBody = await readRequest(req);
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end(addResult);
  }
  if (url.pathname === '/api/v2/app/preferences') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ save_path: '/media/Films' }));
  }
  if (url.pathname === '/api/v2/torrents/info') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(knownTorrents));
  }
  res.writeHead(404);
  res.end('Not found');
});

await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const appPort = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const mockPort = mock.address().port;

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
    LIVEWATCH_BUILTINS: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let childOutput = '';
child.stdout.on('data', chunk => { childOutput += chunk.toString('utf8'); });
child.stderr.on('data', chunk => { childOutput += chunk.toString('utf8'); });

const base = `http://127.0.0.1:${appPort}`;
const headers = { 'content-type': 'application/json', 'x-noctra-token': 'noctra-v199-test-token' };
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Noctra test server stopped (${child.exitCode}). ${childOutput}`);
    const ready = await fetch(`${base}/health`).then(response => response.ok).catch(() => false);
    if (ready) break;
    if (attempt === 79) throw new Error(`Noctra test server did not start. ${childOutput}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const info = Buffer.from('d4:name10:sample.mkve');
  const torrent = Buffer.concat([Buffer.from('d4:info'), info, Buffer.from('e')]);
  const added = await fetch(`${base}/api/downloads/add`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'manual-test.torrent',
      dataBase64: torrent.toString('base64'),
      category: 'Films',
      savePath: '/media/Films',
      startPaused: false
    })
  });
  const addedText = await added.text();
  assert.equal(added.status, 201, addedText);
  const result = JSON.parse(addedText);
  assert.equal(result.name, 'manual-test.torrent');
  assert.equal(result.category, 'Films');
  assert.equal(result.savePath, '/media/Films');
  assert.equal(result.startPaused, false);
  assert.match(uploadedContentType, /^multipart\/form-data; boundary=/);
  const multipart = uploadedBody.toString('latin1');
  assert.match(multipart, /filename="manual-test\.torrent"/);
  assert.match(multipart, /name="category"\r\n\r\nFilms/);
  assert.match(multipart, /name="savepath"\r\n\r\n\/media\/Films/);
  assert.match(multipart, /name="paused"\r\n\r\nfalse/);
  assert.ok(uploadedBody.includes(torrent), 'Le contenu bencodé doit être transmis sans altération.');

  const hash = createHash('sha1').update(info).digest('hex');
  addResult = 'Fails.';
  knownTorrents = [{
    hash,
    name: 'sample.mkv',
    state: 'pausedUP',
    progress: 1,
    total_size: 1024,
    downloaded: 1024,
    save_path: '/media/Films'
  }];
  const duplicate = await fetch(`${base}/api/downloads/add`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'manual-test.torrent', dataBase64: torrent.toString('base64'), savePath: '/media/Films' })
  });
  assert.equal(duplicate.status, 201);
  assert.equal((await duplicate.json()).alreadyPresent, true, 'Une relance ambiguë ne doit pas créer de doublon ni afficher un faux échec.');

  addResult = 'Ok.';
  const forbiddenDestination = await fetch(`${base}/api/downloads/add`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'manual-test.torrent', dataBase64: torrent.toString('base64'), savePath: '/media/Inconnu' })
  });
  assert.equal(forbiddenDestination.status, 400);

  const invalid = await fetch(`${base}/api/downloads/add`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'manual-test.txt', dataBase64: torrent.toString('base64') })
  });
  assert.equal(invalid.status, 400);
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
  await new Promise(resolve => mock.close(resolve));
  await rm(root, { recursive: true, force: true });
}

console.log('v199 manual torrent upload and seed status tests passed');
