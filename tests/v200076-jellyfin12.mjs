import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import vm from 'node:vm';

const project = new URL('../', import.meta.url);
const token = 'noctra-test-user-token';
const key = 'noctra-test-api-key';
const user = { Id: 'qa', Name: 'QA', Policy: { IsAdministrator: false } };
const requests = [];
const readToken = headers => decodeURIComponent((headers.authorization || '').match(/Token="([^"]*)"/)?.[1] || '');
const mock = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  requests.push({ path: url.pathname, headers: req.headers });
  const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (url.pathname === '/jellyfin/system/info/public') return send(200, { Id: 'server', Version: '12.0', ServerName: 'QA' });
  // Legacy auth is deliberately not accepted, like a default Jellyfin 12 server.
  if (![token, key].includes(readToken(req.headers))) return send(401, { error: 'Modern authorization required' });
  if (url.pathname === '/jellyfin/System/Info') return send(200, { Id: 'server', Version: '12.0', ServerName: 'QA' });
  if (url.pathname === '/jellyfin/Users/Me' || url.pathname === '/jellyfin/Users/qa') return send(200, user);
  if (url.pathname === '/jellyfin/Items/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Images/Primary') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end('test-image'); }
  return send(404, {});
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const upstream = `http://127.0.0.1:${mock.address().port}/jellyfin`;
let child;
let temp;
try {
  const storage = new Map();
  const sockets = [];
  const sandbox = { console: { log() {}, debug() {}, warn() {}, error() {} }, setTimeout, clearTimeout, setInterval, clearInterval, URL, Headers, Request, Response, fetch,
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    navigator: { userAgent: 'Noctra test' },
    WebSocket: class { constructor(url) { sockets.push(url); } },
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(await readFile(new URL('public/client/node_modules.jellyfin-apiclient.bundle.js', project), 'utf8'), sandbox);
  const module = { exports: {} };
  sandbox.webpackChunk[0][1][92600](module);
  const { ApiClient, ConnectionManager, Credentials } = module.exports;
  const api = new ApiClient(upstream, 'Noctra', '200.0.76', 'Test', 'device');
  api.enableAutomaticBitrateDetection = false;
  api.setAuthenticationInfo(token, 'qa');
  assert.equal((await api.getCurrentUser()).Id, 'qa');
  const download = new URL(api.getItemDownloadUrl('film'));
  assert.equal(download.searchParams.get('ApiKey'), token);
  assert.equal(download.searchParams.has('api_key'), false);
  api.openWebSocket();
  const socket = new URL(sockets[0]);
  assert.equal(socket.pathname, '/jellyfin/socket');
  assert.equal(socket.protocol, 'ws:');
  assert.equal(socket.searchParams.get('ApiKey'), token);
  assert.equal(socket.searchParams.has('api_key'), false);
  const credentials = new Credentials('qa');
  const manager = new ConnectionManager(credentials, 'Noctra', '200.0.76', 'Test', 'device', {});
  const result = await manager.connectToServer({ Id: 'server', ManualAddress: upstream, manualAddressOnly: true, AccessToken: token, UserId: 'qa' }, { enableWebSocket: false, reportCapabilities: false, enableAutomaticBitrateDetection: false });
  assert.equal(result.State, 'SignedIn', 'Saved credentials must survive server validation');
  assert.equal(result.ApiClient.accessToken(), token);
  assert.ok(requests.some(r => r.path === '/jellyfin/System/Info' && readToken(r.headers) === token));

  // Run the real Noctra HTTP routes from an isolated copy, without user config.
  temp = await mkdtemp(join(tmpdir(), 'noctra-jellyfin12-'));
  await cp(new URL('server.mjs', project), join(temp, 'server.mjs'));
  await cp(new URL('lib', project), join(temp, 'lib'), { recursive: true });
  await mkdir(join(temp, 'public/client'), { recursive: true });
  for (const name of ['index.html', 'node_modules.jellyfin-apiclient.bundle.js']) await cp(new URL('public/client/' + name, project), join(temp, 'public/client', name));
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  child = spawn(process.execPath, ['server.mjs'], { cwd: temp, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CONFIG_FILE: join(temp, 'absent.env'), HOST: '127.0.0.1', PORT: String(port), BASE_URL: '/noctra', JELLYFIN_URL: upstream, JELLYFIN_API_KEY: key, LIVEWATCH_BUILTINS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  const base = `http://127.0.0.1:${port}/noctra`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error(logs);
    if (await fetch(base + '/health').then(r => r.ok).catch(() => false)) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, logs);
  assert.equal((await fetch(base + '/api/session')).status, 401);
  const session = await fetch(base + '/api/session', { headers: { 'x-noctra-token': token } });
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base + '/api/session', { headers: { cookie } })).status, 200);
  assert.equal((await fetch(base + '/api/session', { headers: { 'x-noctra-token': 'invalid-noctra-token' } })).status, 401);
  assert.equal((await fetch(base + '/api/libraries/refresh', { method: 'POST', headers: { 'x-noctra-token': token } })).status, 403);
  const image = await fetch(base + '/api/jellyfin/image/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(image.status, 200);
  assert.equal(await image.text(), 'test-image');
  assert.ok(requests.some(r => r.path.endsWith('/Images/Primary') && readToken(r.headers) === key));
  assert.ok(requests.every(r => !r.headers['x-emby-token'] && !r.headers['x-mediabrowser-token']));
  const html = await (await fetch(base + '/client/index.html')).text();
  assert.ok(html.includes('node_modules.jellyfin-apiclient.bundle.js?v=200.76'), 'Patched bundle must bypass the old immutable cache');
  assert.equal((await fetch(base + '/client/node_modules.jellyfin-apiclient.bundle.js?v=200.76')).status, 200);
} finally {
  if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
  await new Promise(resolve => mock.close(resolve));
  if (temp) await rm(temp, { recursive: true, force: true });
}
console.log('200.0.76: strict Jellyfin auth, saved login, WebSocket/download URLs, session/cookie, API key images, permissions and cache refresh: OK');


