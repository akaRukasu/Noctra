import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 200.0.162 : seedbox déplacée de akarukasu.merlion.usbx.me vers
// akarukasu.astra.usbx.me. Sans intervention à distance : le serveur réécrit
// lui-même son .env au démarrage (copie .env.avant-astra), et les applis
// corrigent l'adresse qu'elles avaient gardée.
const projectRoot = new URL('..', import.meta.url).pathname;
const root = await mkdtemp(join(tmpdir(), 'noctra-domain-'));
const envFile = join(root, 'test.env');
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const original = [
  `PORT=${port}`,
  'HOST=127.0.0.1',
  'BASE_URL=',
  'JELLYFIN_URL=https://akarukasu.merlion.usbx.me/jellyfin',
  'JELLYSEERR_URL="https://jellyseerr-akarukasu.merlion.usbx.me"',
  'RADARR_URL=http://127.0.0.1:13177/radarr',
  'LIVEWATCH_BUILTINS=false',
  ''
].join('\n');
await writeFile(envFile, original);
const env = { ...process.env, CONFIG_FILE: envFile, SONARR_URL: 'https://akarukasu.merlion.usbx.me/sonarr' };
for (const key of ['PORT', 'HOST', 'BASE_URL', 'JELLYFIN_URL', 'JELLYSEERR_URL', 'RADARR_URL']) delete env[key];
const child = spawn(process.execPath, ['server.mjs'], { cwd: projectRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
try {
  for (let attempt = 0; ; attempt++) {
    if (child.exitCode !== null) throw new Error('serveur arrêté : ' + output);
    if (await fetch(`http://127.0.0.1:${port}/health`).then(r => r.ok).catch(() => false)) break;
    if (attempt > 120) throw new Error('serveur non démarré : ' + output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const rewritten = await readFile(envFile, 'utf8');
  assert.match(rewritten, /^JELLYFIN_URL=https:\/\/akarukasu\.astra\.usbx\.me\/jellyfin$/m);
  assert.match(rewritten, /^JELLYSEERR_URL="https:\/\/jellyseerr-akarukasu\.astra\.usbx\.me"$/m);
  assert.match(rewritten, /^RADARR_URL=http:\/\/127\.0\.0\.1:13177\/radarr$/m, 'adresses locales inchangées');
  assert.ok(!/merlion/.test(rewritten), 'plus aucune adresse de l’ancien serveur');
  assert.equal(await readFile(`${envFile}.avant-astra`, 'utf8'), original, 'ancien .env gardé');
  assert.match(output, /Nouveau domaine du serveur appliqué/);
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
  await rm(root, { recursive: true, force: true });
}

// Applis : adresse gardée de l'ancien serveur corrigée au lancement.
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const launcher = await read('../apps/shared/launcher/launcher.js');
assert.match(launcher, /function movedServer\(url\)/);
assert.match(await read('../apps/shared/launcher/config.js'), /defaultServerUrl: 'https:\/\/akarukasu\.astra\.usbx\.me\/noctra'/);
assert.match(await read('../apps/android-native/app/src/main/java/com/noctra/mobile/core/Session.kt'), /\.replace\("\.merlion\.usbx\.me", "\.astra\.usbx\.me"\)/);
assert.match(await read('../apps/ios-native/Noctra/Sources/Session.swift'), /replacingOccurrences\(of: "\.merlion\.usbx\.me", with: "\.astra\.usbx\.me"\)/);
assert.match(await read('../apps/androidtv/java/com/noctra/tv/NoctraProcess.java'), /authentication_store\.json/);
assert.match(await read('../apps/scripts/build-androidtv.mjs'), /'https:\/\/akarukasu\.astra\.usbx\.me\/jellyfin'/);
assert.match(await read('../public/client/config.json'), /https:\/\/akarukasu\.astra\.usbx\.me\/jellyfin/);
console.log('v200.0.162 : nouveau domaine astra.usbx.me appliqué (serveur sans intervention, applis corrigées au lancement) : OK');
