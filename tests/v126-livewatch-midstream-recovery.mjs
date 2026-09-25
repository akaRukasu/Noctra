import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));

// Une erreur de la balise vidéo après démarrage ne doit plus devenir une erreur
// terminale avant la récupération HLS.js.
assert.ok(shell.includes('livewatch-video-error-recoverable'));
assert.ok(shell.includes('coupure détectée · récupération en cours'));

// Le même direct Premium peut être renouvelé plusieurs fois lors d'une longue
// session, sans changement automatique de chaîne/source.
assert.ok(shell.includes('tvLiveWatchRefreshCount < 8'));
assert.ok(shell.includes('tvLiveWatchRecoveryInFlight'));
assert.ok(shell.includes('refresh=1&_=${Date.now()}'));
assert.ok(shell.includes("cache: 'no-store'"));
assert.ok(shell.includes('`${provider} · direct repris`'));
assert.ok(shell.includes('réseau instable · nouvelle tentative'));
assert.equal(shell.includes('fallbackTvResolvedOption('), false);

console.log('v126 LiveWatch mid-stream recovery checks passed.');
