import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'noctra-v20013-api-'));
const project = fileURLToPath(new URL('..', import.meta.url));
const indexer = { id: 2, name: 'Tracker test', implementation: 'Torznab', definitionName: 'Torznab', protocol: 'torrent', enable: true, priority: 25, appProfileId: 1, fields: [{ name: 'apiKey', value: 'secret-test-key', privacy: 'apiKey', type: 'textbox' }] };
const actions = [];
let savedIndexer;
let additions = 0;
let upload = '';
const send = (res, value) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
const read = async req => { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks).toString(); };
const mock = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  actions.push(req.method + ' ' + url.pathname);
  if (url.pathname === '/Users/Me') return send(res, { Id: decodeURIComponent((req.headers.authorization || '').match(/Token="([^"]*)"/)?.[1] || '') === 'noctra-v20013-nonadmin' ? 'guest' : 'qa', Policy: { IsAdministrator: decodeURIComponent((req.headers.authorization || '').match(/Token="([^"]*)"/)?.[1] || '') !== 'noctra-v20013-nonadmin' } });
  if (url.pathname === '/api/v1/indexer/schema') return send(res, [{ ...indexer, id: undefined }]);
  if (url.pathname === '/api/v1/appprofile') return send(res, [{ id: 1, name: 'Standard' }]);
  if (url.pathname === '/api/v1/downloadclient') return send(res, []);
  if (url.pathname === '/api/v1/indexer' && req.method === 'GET') return send(res, [indexer]);
  if (url.pathname === '/api/v1/indexer/2' && req.method === 'GET') return send(res, indexer);
  if (['/api/v1/indexer', '/api/v1/indexer/2', '/api/v1/indexer/test'].includes(url.pathname)) { savedIndexer = JSON.parse(await read(req)); return send(res, { id: 2 }); }
  if (url.pathname === '/api/v1/search') return send(res, [{ title: 'Example.2026.VFF.1080p', protocol: 'torrent', guid: 'release', size: 5e9, seeders: 8, indexerId: 2, categories: [{ id: 2000 }], downloadUrl: `http://127.0.0.1:${mock.address().port}/download/test?apikey=secret-test-key` }]);
  if (url.pathname === '/download/test') { res.writeHead(200); res.end('d4:infod4:name10:sample.mkvee'); return; }
  if (url.pathname === '/api/v2/auth/login') { res.writeHead(200, { 'set-cookie': 'SID=qa; Path=/' }); res.end('Ok.'); return; }
  if (url.pathname === '/api/v2/app/preferences') return send(res, { save_path: root });
  if (url.pathname === '/api/v2/torrents/info') return send(res, []);
  if (url.pathname === '/api/v2/torrents/add') { additions++; upload = await read(req); res.writeHead(200); res.end('Ok.'); return; }
  res.writeHead(404); res.end('Not found');
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const remote = `http://127.0.0.1:${mock.address().port}`;
const child = spawn(process.execPath, ['server.mjs'], { cwd: project, env: { ...process.env, CONFIG_FILE: join(root, 'absent.env'), HOST: '127.0.0.1', PORT: String(port), BASE_URL: '',
  JELLYFIN_URL: remote, PROWLARR_URL: remote, PROWLARR_INTERNAL_URL: remote, PROWLARR_API_KEY: 'qa', QBITTORRENT_URL: remote, QBITTORRENT_USERNAME: 'qa', QBITTORRENT_PASSWORD: 'qa', LIVEWATCH_BUILTINS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { output += data; });
const base = `http://127.0.0.1:${port}`;
const headers = { 'x-noctra-token': 'noctra-v20013-admin', 'content-type': 'application/json' };
const api = (path, options = {}) => fetch(base + path, { headers, ...options });
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw Error(output);
    if (await fetch(base + '/health').then(r => r.ok).catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const context = await (await api('/api/prowlarr/indexer-context?id=2')).json();
  assert.ok(context.indexer, JSON.stringify({ context, actions }));
  assert.equal(context.indexer.name, indexer.name);
  assert.ok(!JSON.stringify(context).includes('secret-test-key'));
  const body = { id: 2, name: 'Renamed', appProfileId: 1, priority: 15, fields: { apiKey: '' } };
  assert.equal((await api('/api/prowlarr/indexer/test', { method: 'POST', body: JSON.stringify(body) })).status, 200);
  assert.equal(savedIndexer.fields[0].value, 'secret-test-key');
  assert.equal((await api('/api/prowlarr/indexer', { method: 'POST', body: JSON.stringify(body) })).status, 200);
  assert.ok(actions.includes('PUT /api/v1/indexer/2'));
  const template = await (await api('/api/prowlarr/indexer-context')).json();
  assert.equal((await api('/api/prowlarr/indexer', { method: 'POST', body: JSON.stringify({ ...body, id: null, schemaId: template.template.schemaId }) })).status, 200);
  assert.ok(actions.includes('POST /api/v1/indexer'));
  const availability = await (await api('/api/discovery/availability?mediaType=movie&title=Example&year=2026')).json();
  assert.equal(availability.count, 1, JSON.stringify(availability));
  const downloadId = availability.releases[0].downloadId;
  assert.ok(downloadId);
  assert.ok(!JSON.stringify(availability).includes('apikey='));
  const first = await api('/api/discovery/grab', { method: 'POST', body: JSON.stringify({ downloadId }) });
  const firstBody = await first.json();
  assert.equal(first.status, 200, JSON.stringify(firstBody));
  assert.match(upload, /name="paused"\r\n\r\ntrue/);
  assert.equal((await (await api('/api/discovery/grab', { method: 'POST', body: JSON.stringify({ downloadId }) })).json()).alreadyPresent, true);
  assert.equal(additions, 1);
  assert.equal((await api('/api/discovery/grab', { method: 'POST', body: JSON.stringify({ downloadId: 'bad' }) })).status, 409);
  assert.equal((await api('/api/prowlarr/indexer-context', { headers: { 'x-noctra-token': 'noctra-v20013-nonadmin' } })).status, 403);
  assert.equal((await api('/api/discovery/grab', { method: 'POST', headers: { 'x-noctra-token': 'noctra-v20013-nonadmin', 'content-type': 'application/json' }, body: JSON.stringify({ downloadId }) })).status, 403);
} finally {
  child.kill();
  if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
  await new Promise(resolve => mock.close(resolve));
  await rm(root, { recursive: true, force: true });
}
console.log('v200.13 isolated HTTP: Prowlarr CRUD, secrets, torrent grab, idempotency, admin permissions: OK');
