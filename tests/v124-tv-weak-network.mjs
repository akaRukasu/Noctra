import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes('function tvConnectionProfile()'), 'Le lecteur doit disposer d’un profil réseau adaptatif.');
assert.ok(shell.includes('const appleConservative = tvAppleTouchDevice()'), 'iOS doit utiliser un profil conservateur même sans Network Information API.');
assert.ok(shell.includes('lowLatencyMode: false'), 'Le faible débit doit désactiver le mode faible latence.');
assert.ok(shell.includes('maxBufferLength: 30'), 'Le tampon cible doit rester raisonnable sur connexion faible.');
assert.ok(shell.includes('maxMaxBufferLength: 45'), 'Le lecteur doit conserver une reserve bornee pour les ralentissements reseau.');
assert.ok(shell.includes('startLevel: networkProfile.weak ? 0 : -1'), 'Le démarrage doit partir d’un niveau prudent sur connexion faible.');
assert.ok(shell.includes('Mode réseau prudent · le lecteur continue de charger…'), 'Une iframe lente ne doit plus être déclarée en erreur après le délai doux.');
assert.ok(shell.includes('embedHardTimeout: veryWeak ? 120_000 : weak ? 90_000 : 55_000'), 'Le lecteur web doit tolérer les liaisons lentes.');
assert.ok(server.includes('liveWatchStreamReference(kind, id, 16_000)'), 'Le resolver LiveWatch doit laisser davantage de temps au direct Premium.');
assert.ok(shell.includes("label: 'VIP Premium · direct'") || server.includes("label: 'VIP Premium · direct'"), 'Le direct VIP doit rester prioritaire.');
assert.ok(shell.includes('button.onclick = event =>'), 'Les boutons de suppression torrent doivent être liés directement sur iOS.');
assert.ok(theme.includes('touch-action: manipulation'), 'Les actions critiques mobiles doivent optimiser les taps.');
console.log('Noctra v124 — réseau faible / LiveWatch / suppression iOS : OK');
