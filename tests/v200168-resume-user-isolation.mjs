// 200.0.168 : les lectures en cours (accueil web, applis) sont toujours celles
// de l'utilisateur connecté. Avant : sur un navigateur où un autre compte
// s'était connecté, le cookie de session de Noctra servait la liste de cet
// autre compte tant que Jellyfin n'avait pas fourni son jeton.
// Vrai serveur Noctra, Jellyfin simulé avec deux utilisateurs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
assert.ok(shell.includes("if (!payloadUser || !liveUser || payloadUser !== liveUser) {"), 'réponse acceptée seulement pour l’utilisateur connecté');
assert.ok(shell.includes('const cachedResumeItems = resumeUser && premiereResumeCache?.user === resumeUser'), 'pas de reprise mémorisée sans utilisateur connu');
assert.ok(shell.includes("if (jellyfinAccessToken() && currentJellyfinUserId()) return true;"), 'demande avec le jeton de l’utilisateur Jellyfin');

const users = { 'jeton-alice-0000000001': { Id: 'aaaa', Name: 'Alice' }, 'jeton-bruno-0000000002': { Id: 'bbbb', Name: 'Bruno' } };
const resume = {
  aaaa: [{ Id: 'film-alice', Name: 'Film d’Alice', RunTimeTicks: 1e10, UserData: { PlaybackPositionTicks: 3e9, Played: false } }],
  bbbb: [{ Id: 'serie-bruno', Name: 'Épisode de Bruno', RunTimeTicks: 1e10, UserData: { PlaybackPositionTicks: 5e9, Played: false } }]
};
const jellyfin = createServer((req, res) => {
  const token = decodeURIComponent((String(req.headers.authorization || '').match(/Token="([^"]*)"/) || [])[1] || '');
  const user = users[token];
  res.setHeader('content-type', 'application/json');
  if (!user) { res.statusCode = 401; return res.end('{}'); }
  if (req.url.startsWith('/Users/Me')) return res.end(JSON.stringify({ ...user, Policy: { IsAdministrator: false } }));
  const match = req.url.match(/^\/Users\/([a-z]+)\/Items\/Resume/);
  if (match) {
    // Jellyfin refuse les données d'un autre utilisateur avec ce jeton.
    if (match[1] !== user.Id) { res.statusCode = 403; return res.end('{}'); }
    return res.end(JSON.stringify({ Items: resume[user.Id] }));
  }
  res.end('{}');
}).listen(0, '127.0.0.1');
await new Promise(resolve => jellyfin.once('listening', resolve));
const freePort = () => new Promise(resolve => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const port = await freePort();
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NOCTRA_WASM')));
const noctra = spawn(process.execPath, ['--disable-wasm-trap-handler', 'server.mjs'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...env, NODE_OPTIONS: '', PORT: String(port), HOST: '127.0.0.1', JELLYFIN_URL: `http://127.0.0.1:${jellyfin.address().port}`, JELLYFIN_API_KEY: '' }
});
let log = '';
noctra.stdout.on('data', d => { log += d; });
noctra.stderr.on('data', d => { log += d; });
const call = async (path, headers = {}) => {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
      return { status: response.status, body: await response.json().catch(() => ({})), cookie: response.headers.get('set-cookie') || '' };
    } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  throw new Error('Noctra ne démarre pas : ' + log);
};
try {
  // Alice se connecte sur ce navigateur : cookie de session Noctra d'Alice.
  const alice = await call('/api/session', { 'x-noctra-token': 'jeton-alice-0000000001' });
  assert.equal(alice.status, 200);
  const aliceCookie = alice.cookie.split(';')[0];
  assert.match(aliceCookie, /^noctra_session=[a-f0-9]{64}$/);
  // Bruno ouvre l'accueil sur le même navigateur : Jellyfin n'a pas encore donné son jeton.
  const early = await call('/api/home/resume', { cookie: aliceCookie });
  assert.equal(early.status, 428, 'pas de lectures en cours d’après le seul cookie');
  assert.ok(!JSON.stringify(early.body).includes('film-alice'), 'jamais celles d’Alice');
  // Avec son jeton : uniquement les siennes, même si le cookie d'Alice est encore là.
  const bruno = await call('/api/home/resume', { cookie: aliceCookie, 'x-noctra-token': 'jeton-bruno-0000000002' });
  assert.equal(bruno.status, 200, JSON.stringify(bruno.body));
  assert.equal(bruno.body.userId, 'bbbb');
  assert.deepEqual(bruno.body.items.map(item => item.Id), ['serie-bruno']);
  const aliceOwn = await call('/api/home/resume', { 'x-noctra-token': 'jeton-alice-0000000001' });
  assert.deepEqual(aliceOwn.body.items.map(item => item.Id), ['film-alice']);
  console.log('200.0.168 : lectures en cours de l’utilisateur connecté seulement (jamais d’après le cookie d’un autre compte) : OK');
} finally {
  noctra.kill('SIGTERM');
  jellyfin.close();
}
