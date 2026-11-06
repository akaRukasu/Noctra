import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Updater PC V8 (Windows) : serveur astra.usbx.me, .env adapté sur le serveur,
// première installation si la seedbox a été déplacée sans Noctra, diagnostic.
// Scripts bash embarqués vérifiés (syntaxe), sans caractère non ASCII
// (PowerShell 5.1 lit les scripts sans BOM en ANSI).
const ps1 = await readFile(new URL('../ultra/pc-updater/MISE-A-JOUR-NOCTRA-DEPUIS-PC-V8.ps1', import.meta.url), 'utf8');
assert.ok(!/[^\x00-\x7F]/.test(ps1), 'ASCII seulement');
assert.ok(!/\r/.test(ps1), 'fins de ligne Unix (scripts bash embarqués)');
assert.match(ps1, /\[string\]\$RemoteHost = 'astra\.usbx\.me'/);
assert.match(ps1, /\$remoteScript\.Replace\("`r`n", "`n"\)/);
const dir = await mkdtemp(join(tmpdir(), 'noctra-pc-updater-'));
try {
  for (const [name, marker] of [['update', "$remoteScript = @'"], ['diagnostic', "$script:DiagnosticScript = @'"], ['repair', "$script:RepairScript = @'"]]) {
    const start = ps1.indexOf(marker);
    assert.ok(start > 0, marker);
    const body = ps1.slice(start + marker.length, ps1.indexOf("\n'@", start)).replace(/^\n/, '');
    const file = join(dir, name + '.sh');
    await writeFile(file, body + '\n');
    execFileSync('bash', ['-n', file]);
  }
} finally { await rm(dir, { recursive: true, force: true }); }
assert.match(ps1, /repair_env "\$NEW_DIR\/\.env"/);
assert.match(ps1, /qb_port="\$\(sed -nE 's\/\^WebUI\\\\Port=/);
assert.match(ps1, /bash "\$APP_DIR\/ultra\/install-ultra\.sh"/);
// V8.2 : réparation sur place (sans nouvelle version), proposée après le diagnostic.
assert.match(ps1, /\$script:RepairScript = @'/);
assert.match(ps1, /cp -p "\$APP_DIR\/\.env" "\$APP_DIR\/\.env\.avant-reparation-/, 'copie du .env avant réparation');
assert.match(ps1, /Reparer automatiquement maintenant/);
assert.match(ps1, /port_in_use "\$port" \|\| return 0/, 'port gardé s’il est libre');
// V8.4 : « fetch failed » partout (Noctra n'arrive pas à joindre Jellyfin) :
// adresse publique injoignable par Noctra remplacée par l'adresse locale du
// même service (ports écoutés par ses programmes, lus dans /proc).
assert.equal((ps1.match(/fix_services "\$(NEW_DIR|APP_DIR)\/\.env"/g) || []).length, 2, 'mise à jour et réparation');
assert.match(ps1, /fix_local "\$file" JELLYFIN_URL jellyfin \/System\/Info\/Public '' \/jellyfin ''/);
assert.match(ps1, /awk -v list="\$inodes" 'FNR > 1 && \$4 == "0A"/, 'ports en écoute lus dans /proc/net/tcp');
assert.match(ps1, /sed -i -E "s#\(\[\/@\.\]\)\$\{OLD_HOST/, 'version web (config.json) corrigée');
assert.match(ps1, /Noctra n'arrive pas a joindre Jellyfin/);
// V8.5 : un seul problème restant : « Count » introuvable sous StrictMode (PowerShell 5.1).
assert.match(ps1, /\$script:DiagnosticProblems = @\(\$report -split/);
for (const name of ['LANCER-MISE-A-JOUR-NOCTRA-V8.cmd', 'DIAGNOSTIC-NOCTRA-V8.cmd', 'REPARER-NOCTRA-V8.cmd', 'RELAIS-SAMSUNG-2014-V8.cmd']) {
  const cmd = await readFile(new URL('../ultra/pc-updater/' + name, import.meta.url), 'utf8');
  assert.match(cmd, /\r\n/, name + ' : fins de ligne Windows');
}
console.log('Updater PC V8.5 : astra.usbx.me, .env adapté, première installation, diagnostic, réparation (scripts bash valides) : OK');
