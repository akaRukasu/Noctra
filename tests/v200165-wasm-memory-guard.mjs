// 200.0.165 : « Cannot allocate Wasm memory » / « fetch failed » sur un service
// à mémoire virtuelle limitée (Ultra.cc). Reproduit avec ulimit -v : sans le
// réglage, Noctra ne joint plus Jellyfin ; avec la garde (relance automatique
// avec --disable-wasm-trap-handler), la session Jellyfin est validée, l'arrêt
// (SIGTERM) arrête bien Noctra, et l'updater ajoute le réglage au service.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { needsWasmRelaunch, wasmFlagActive, WASM_FLAG } from '../lib/wasm-memory.mjs';

const root = new URL('../', import.meta.url);
const server = await readFile(new URL('server.mjs', root), 'utf8');
assert.ok(server.startsWith("import './lib/wasm-memory-guard.mjs';"), 'garde chargée avant tout le reste');
assert.ok(!/^export /m.test(await readFile(new URL('lib/wasm-memory-guard.mjs', root), 'utf8')), 'la garde n’exporte rien (fonctions dans wasm-memory.mjs)');
assert.equal(WASM_FLAG, '--disable-wasm-trap-handler');
assert.equal(wasmFlagActive(['--disable-wasm-trap-handler'], ''), true);
assert.equal(wasmFlagActive([], '--max-old-space-size=512 --disable-wasm-trap-handler'), true);
assert.equal(wasmFlagActive([], '--max-old-space-size=512'), false);
const allowed = new Set([WASM_FLAG]);
assert.equal(needsWasmRelaunch({ execArgv: [], env: {}, allowed }), true);
assert.equal(needsWasmRelaunch({ execArgv: [], env: { NOCTRA_WASM_CHILD: '1' }, allowed }), false, 'pas de boucle de relance');
assert.equal(needsWasmRelaunch({ execArgv: [], env: { NOCTRA_WASM_GUARD: 'off' }, allowed }), false);
assert.equal(needsWasmRelaunch({ execArgv: [], env: { NODE_OPTIONS: WASM_FLAG }, allowed }), false);
assert.equal(needsWasmRelaunch({ execArgv: [], env: {}, allowed: new Set() }), false, 'Node.js sans ce réglage : lancement normal');

// Réglage ajouté au service par la mise à jour et l'updater PC (même fonction).
const update = await readFile(new URL('ultra/update-noctra.sh', root), 'utf8');
const pc = await readFile(new URL('ultra/pc-updater/MISE-A-JOUR-NOCTRA-DEPUIS-PC-V8.ps1', root), 'utf8');
const fn = update.match(/^ensure_wasm_setting\(\) \{[\s\S]*?^\}$/m)[0];
assert.ok(pc.split('ensure_wasm_setting() {').length === 3, 'updater PC : réparation et mise à jour');
assert.ok(pc.includes(fn), 'même fonction dans l’updater PC');
assert.ok(!/[^\x00-\x7F]/.test(pc), 'updater PC en ASCII (PowerShell 5.1)');
assert.match(pc, /Cannot allocate Wasm memory'; then\n  bad "Noctra manque de memoire WebAssembly/);
const work = await mkdtemp(join(tmpdir(), 'noctra-wasm-'));
try {
  await writeFile(join(work, 'fn.sh'), fn);
  for (const [name, extra, expected] of [
    ['simple', '', ['noctra.service.d/noctra-memoire-wasm.conf', 'Environment=NODE_OPTIONS=--disable-wasm-trap-handler']],
    ['options', 'Environment=NODE_OPTIONS=--max-old-space-size=512\n', ['noctra.service', 'Environment=NODE_OPTIONS=--disable-wasm-trap-handler --max-old-space-size=512']],
    ['deja', 'Environment=NODE_OPTIONS=--disable-wasm-trap-handler\n', ['noctra.service', 'Environment=NODE_OPTIONS=--disable-wasm-trap-handler']]
  ]) {
    const home = join(work, name);
    const units = join(home, '.config/systemd/user');
    await mkdir(units, { recursive: true });
    await writeFile(join(units, 'noctra.service'), `[Service]\nExecStart=${process.execPath} /x/server.mjs\nEnvironment=NODE_ENV=production\n${extra}`);
    const run = () => spawnSync('bash', ['-c', `set -euo pipefail; log(){ echo "$*"; }; source "${join(work, 'fn.sh')}"; ensure_wasm_setting`], { env: { ...process.env, HOME: home, SERVICE_NAME: 'noctra.service' }, encoding: 'utf8' });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(run().stdout, '', 'deuxième passage : rien à changer (' + name + ')');
    const text = await readFile(join(units, expected[0]), 'utf8');
    assert.ok(text.includes(expected[1]), name + ' : ' + text);
    if (name === 'options') assert.ok((await readdir(units)).includes('noctra.service.avant-wasm'), 'copie du service gardée');
    if (name === 'deja') assert.equal(first.stdout, '');
  }
} finally {
  await rm(work, { recursive: true, force: true });
}

// Service à mémoire virtuelle limitée : Jellyfin simulé, vrai serveur Noctra.
const probe = spawnSync('bash', ['-c', 'ulimit -v 10000000 && echo ok'], { encoding: 'utf8' });
if (probe.stdout.trim() !== 'ok') { console.log('v200.0.165 : garde OK (ulimit indisponible : limite mémoire non simulée)'); process.exit(0); }
const jellyfin = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(req.url.startsWith('/Users/Me') ? JSON.stringify({ Id: 'u1', Name: 'Test', Policy: { IsAdministrator: false } }) : '{}');
}).listen(0, '127.0.0.1');
await new Promise(resolve => jellyfin.once('listening', resolve));
const jfPort = jellyfin.address().port;
const start = (port, extraEnv) => spawn('bash', ['-c', `ulimit -v 10000000; exec "${process.execPath}" server.mjs`], {
  cwd: new URL('.', root), stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NOCTRA_WASM'))), NODE_OPTIONS: '', PORT: String(port), HOST: '127.0.0.1', JELLYFIN_URL: `http://127.0.0.1:${jfPort}`, ...extraEnv }
});
const session = async port => {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/session`, { headers: { 'x-noctra-token': 'abcdefabcdefabcdef12' } });
      return { status: response.status, body: await response.text() };
    } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  return { status: 0, body: '' };
};
const stopped = child => new Promise(resolve => { if (child.exitCode !== null) resolve(child.exitCode); else child.once('exit', code => resolve(code)); });
const freePort = () => new Promise(resolve => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

// Sans garde (service sans le réglage, comme avant) : l'erreur est reproduite.
const plainPort = await freePort();
const plain = start(plainPort, { NOCTRA_WASM_GUARD: 'off' });
let plainLog = '';
plain.stdout.on('data', d => { plainLog += d; });
plain.stderr.on('data', d => { plainLog += d; });
const before = await session(plainPort);
plain.kill('SIGTERM');
await stopped(plain);
const reproduced = /Cannot allocate Wasm memory/.test(plainLog + before.body);

// Avec la garde : session Jellyfin validée.
const guardedPort = await freePort();
const guarded = start(guardedPort, {});
let guardedLog = '';
guarded.stdout.on('data', d => { guardedLog += d; });
guarded.stderr.on('data', d => { guardedLog += d; });
const after = await session(guardedPort);
assert.equal(after.status, 200, 'session Jellyfin avec la garde : ' + after.body + '\n' + guardedLog);
assert.match(after.body, /"name":"Test"/);
assert.ok(!/Cannot allocate Wasm memory/.test(guardedLog), guardedLog);
// Arrêt du service : SIGTERM au lanceur, Noctra s'arrête aussi.
guarded.kill('SIGTERM');
await stopped(guarded);
await new Promise(resolve => setTimeout(resolve, 600));
assert.equal((await session(guardedPort).catch(() => ({ status: 0 }))).status === 200 ? 'vivant' : 'arrêté', 'arrêté');
jellyfin.close();
console.log(`v200.0.165 : mémoire WebAssembly limitée${reproduced ? ' (erreur reproduite sans la garde)' : ''}, garde, session Jellyfin, arrêt, réglage du service : OK`);
