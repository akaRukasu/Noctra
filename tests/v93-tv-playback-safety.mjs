import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));

// Le cœur de lecture conserve les garde-fous historiques avec le profil v171.
assert.ok(shell.includes('lowLatencyMode: false'), 'Le mode HLS doit rester faible latence sur bon réseau et devenir stable sur connexion faible.');
assert.ok(shell.includes('backBufferLength: 30') && shell.includes('maxBufferLength: 30') && shell.includes('maxMaxBufferLength: 45'), 'Le profil tampon commun doit rester borne pour toutes les chaines.');
assert.ok(shell.includes('manifestLoadingTimeOut: networkProfile.manifestTimeout') && shell.includes('fragLoadingTimeOut: networkProfile.fragmentTimeout'), 'Les timeouts doivent s’adapter au réseau.');
assert.ok(shell.includes('const restartLimit = stabilitySensitiveStream') && shell.includes('retries < restartLimit') && shell.includes('tvHls.startLoad(-1)'), 'La reprise réseau doit rester bornée tout en renforçant les fournisseurs sensibles.');
assert.ok(shell.includes('recoveries < 1') && shell.includes('tvHls.recoverMediaError()'), 'La récupération média doit rester sur le profil historique v94 : une seule récupération contrôlée.');

// Les mécanismes v92 ayant pu lutter contre le contrôleur interne HLS.js doivent disparaître.
// V172 delegue la synchronisation au controleur HLS.js sans mode tamponne force.
assert.ok(!shell.includes('function startTvPlaybackWatchdog'), 'Le watchdog externe v92 doit être supprimé.');
assert.ok(!shell.includes('rememberTvBandwidth(channel'), 'La mémoire ABR expérimentale v92 doit être supprimée.');
assert.ok(!shell.includes("liveSyncMode: 'buffered'"), 'Le lecteur ne doit plus poursuivre le bord de la plage tamponnee.');
assert.ok(!shell.includes('maxBufferHole: .45'), 'La tolérance de trou forcée v92 doit être supprimée.');
assert.ok(shell.includes('liveSyncDurationCount: networkProfile.weak ? 4 : 3'), 'La marge live doit rester dans les playlists courtes.');
assert.ok(shell.includes('nudgeMaxRetry: 5') && shell.includes('highBufferWatchdogPeriod: 2'), 'La reprise live desktop doit rester bornée par HLS.js avec une tolérance de micro-coupures.');
assert.ok(!shell.includes('startLoad(-1, true)'), 'Le redémarrage agressif du chargeur v92 doit être supprimé.');

// Compatibilité iOS et reprise bornée sur les serveurs de la même chaîne.
assert.ok(shell.includes('iosHlsJsPreferred') && shell.includes('preferManagedMediaSource = true'), 'La compatibilité iOS v85 doit rester intacte.');
assert.ok(shell.includes('startResolvedOptionFallback') && shell.includes('Erreur réseau · aucun autre serveur compatible'), 'Une erreur réseau doit parcourir les alternatives sans boucle infinie.');

console.log('Lecture TV sûre Noctra v93 : OK');
