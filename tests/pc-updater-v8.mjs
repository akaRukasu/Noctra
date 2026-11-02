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
  for (const [name, marker] of [['update', "$remoteScript = @'"], ['diagnostic', "$script:DiagnosticScript = @'"]]) {
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
for (const name of ['LANCER-MISE-A-JOUR-NOCTRA-V8.cmd', 'DIAGNOSTIC-NOCTRA-V8.cmd']) {
  const cmd = await readFile(new URL('../ultra/pc-updater/' + name, import.meta.url), 'utf8');
  assert.match(cmd, /\r\n/, name + ' : fins de ligne Windows');
}
console.log('Updater PC V8 : astra.usbx.me, .env adapté, première installation, diagnostic (scripts bash valides) : OK');
