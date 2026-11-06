// Relais Samsung 2014 sur la seedbox (updater PC V8.6, RELAIS-SAMSUNG-2014-V8.cmd).
// - Vérification : relais installé, actif, qui vise bien le serveur de cette
//   seedbox (pas l'ancienne) et qui répond ; adresse à saisir sur le téléviseur.
// - Installation / réparation : le port déjà connu du téléviseur est gardé.
// - ultra/install-relais-samsung2014.sh relancé sans port garde aussi le port
//   (avant : un autre port libre était pris et le téléviseur ne joignait plus le relais).
// Seedbox simulée : commandes systemctl, curl, hostname, getent, app-ports factices.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, chmod, rm, copyFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const ps1 = await readFile(join(root, 'ultra/pc-updater/MISE-A-JOUR-NOCTRA-DEPUIS-PC-V8.ps1'), 'utf8');
assert.ok(!/[^\x00-\x7F]/.test(ps1), 'PowerShell 5.1 : ASCII seulement');
assert.match(ps1, /\[switch\]\$Relay\b/);
assert.match(ps1, /\$script:NoctraUpdaterVersion = '8\.6'/);
assert.match(ps1, /if \(\$Allow -match '\^\[0-9A-Fa-f:\.\]\+\$'\)/, 'adresse autorisée filtrée (aucune commande injectée)');
const cmd = await readFile(join(root, 'ultra/pc-updater/RELAIS-SAMSUNG-2014-V8.cmd'), 'utf8');
assert.ok(cmd.includes('\r\n') && cmd.includes('MISE-A-JOUR-NOCTRA-DEPUIS-PC-V8.ps1" -Relay'), 'lanceur Windows');
const relayScript = /\$script:RelayScript = @'\r?\n([\s\S]*?)\r?\n'@/.exec(ps1)[1];

const dir = await mkdtemp(join(tmpdir(), 'noctra-relais-'));
const home = join(dir, 'home');
const bin = join(dir, 'bin');
const app = join(home, 'apps/noctra');
const unit = join(home, '.config/systemd/user/noctra-relais-tv.service');
await mkdir(join(app, 'ultra'), { recursive: true });
await mkdir(join(app, 'apps/samsung-orsay/serveur'), { recursive: true });
await mkdir(join(app, 'logs'), { recursive: true });
await mkdir(join(home, '.config/systemd/user'), { recursive: true });
await mkdir(bin, { recursive: true });
await writeFile(join(app, '.env'), 'PORT=13180\nBASE_URL=/noctra\n');
await writeFile(join(app, 'apps/samsung-orsay/serveur/noctra-samsung2014.mjs'), '// relais\n');
await copyFile(join(root, 'ultra/install-relais-samsung2014.sh'), join(app, 'ultra/install-relais-samsung2014.sh'));
const tool = async (name, body) => { await writeFile(join(bin, name), '#!/usr/bin/env bash\n' + body + '\n'); await chmod(join(bin, name), 0o755); };
await tool('hostname', 'echo astra');
await tool('whoami', 'echo akarukasu');
await tool('getent', 'echo "203.0.113.7 astra.usbx.me"');
await tool('app-ports', 'echo "Free ports: 15000 15001"');
await tool('sleep', 'exit 0');
await tool('node', 'exit 0');
await tool('systemctl', `case "$*" in *is-active*) cat "${dir}/state" 2>/dev/null || echo inactive ;; *restart*) echo active > "${dir}/state" ;; esac; exit 0`);
// Relais qui répond seulement sur le port écrit dans le service ; serveur astra joignable.
await tool('curl', `url="\${@: -1}"
port="$(sed -n 's/^ExecStart=.*--port \\([0-9]*\\).*/\\1/p' "${unit}" 2>/dev/null)"
case "$url" in
  https://akarukasu.astra.usbx.me/noctra/health) printf '{"status":"ok","client":"Noctra"}\\n200' ;;
  "http://127.0.0.1:$port/noctra/health") [ -n "$port" ] && [ "$(cat "${dir}/state" 2>/dev/null)" = active ] && printf '{"status":"ok","client":"Noctra"}\\n200' || { printf '\\n000'; exit 7; } ;;
  *) printf '\\n000'; exit 7 ;;
esac`);
await writeFile(join(dir, 'relay.sh'), relayScript.replace(/\r\n/g, '\n'));
execFileSync('bash', ['-n', join(dir, 'relay.sh')]);
execFileSync('bash', ['-n', join(root, 'ultra/install-relais-samsung2014.sh')]);
const env = extra => ({ ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, ...extra });
const run = (action, extra = {}) => spawnSync('bash', [join(dir, 'relay.sh')], { env: env({ NOCTRA_RELAY_ACTION: action, ...extra }), encoding: 'utf8' });
const service = (port, server, allow = '') => `[Service]\nExecStart=/usr/bin/node ${app}/apps/samsung-orsay/serveur/noctra-samsung2014.mjs relais --public --port ${port} --serveur ${server}${allow ? ' --autoriser ' + allow : ''}\n`;

try {
  // 1. Aucun relais : signalé.
  let result = run('verifier');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[OK\] Serveur Noctra joignable : https:\/\/akarukasu\.astra\.usbx\.me\/noctra/);
  assert.match(result.stdout, /\[!!\] Relais non installe sur cette seedbox/);

  // 2. Relais installé pour l'ancienne seedbox, arrêté : problèmes nommés.
  await writeFile(unit, service(12345, 'https://akarukasu.merlion.usbx.me/noctra', '198.51.100.4'));
  await writeFile(join(dir, 'state'), 'inactive\n');
  result = run('verifier');
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /\[!!\] Le relais vise https:\/\/akarukasu\.merlion\.usbx\.me\/noctra au lieu de https:\/\/akarukasu\.astra\.usbx\.me\/noctra/);
  assert.match(result.stdout, /\[!!\] Service noctra-relais-tv : inactive/);
  assert.match(result.stdout, /\[!!\] Le relais ne repond pas sur le port 12345/);
  assert.match(result.stdout, /Adresse du relais a saisir : 203\.0\.113\.7:12345/);

  // 3. Réparation : même port, même adresse autorisée, serveur astra ; vérifié en marche.
  result = run('installer');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const repaired = await readFile(unit, 'utf8');
  assert.match(repaired, /--port 12345 --serveur https:\/\/akarukasu\.astra\.usbx\.me\/noctra --autoriser 198\.51\.100\.4/);
  assert.match(result.stdout, /\[OK\] Relais en marche \(port 12345\)/);
  assert.match(result.stdout, /Adresse du relais a saisir : 203\.0\.113\.7:12345/);
  result = run('verifier');
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /\[OK\] Le relais repond et joint le serveur Noctra \(port 12345\)/);

  // 4. Nouvelle adresse autorisée choisie depuis le PC.
  result = run('installer', { NOCTRA_RELAY_ALLOW: '192.0.2.9' });
  assert.equal(result.status, 0);
  assert.match(await readFile(unit, 'utf8'), /--port 12345 .*--autoriser 192\.0\.2\.9/);

  // 5. Script de la seedbox relancé à la main sans port : port gardé (pas 15000).
  const direct = spawnSync('bash', [join(app, 'ultra/install-relais-samsung2014.sh')], { env: env({}), encoding: 'utf8' });
  assert.equal(direct.status, 0, direct.stdout + direct.stderr);
  assert.match(direct.stdout, /port 12345 gardé/);
  assert.match(await readFile(unit, 'utf8'), /--port 12345 .*--autoriser 192\.0\.2\.9/);
  // Port indiqué explicitement : utilisé.
  spawnSync('bash', [join(app, 'ultra/install-relais-samsung2014.sh'), '15001'], { env: env({}), encoding: 'utf8' });
  assert.match(await readFile(unit, 'utf8'), /--port 15001 /);
  console.log('Relais Samsung 2014 (updater PC V8.6) : vérification, réparation sur le même port, ancienne seedbox signalée, port gardé à la réinstallation : OK');
} finally {
  await rm(dir, { recursive: true, force: true });
}
