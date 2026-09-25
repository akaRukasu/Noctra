import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));
assert.ok(server.includes("version: '200.0.21'"));

assert.ok(server.includes("embedUrl: volkamaxBridgeUrl(url)"), 'Volkamax doit conserver une URL locale Noctra.');
assert.ok(server.includes("playbackType: 'embed'") && server.includes("streamKind: 'Volkamax · lecteur résolu'"));
assert.ok(server.includes('/api/tv/volkamax/embed/'));
assert.ok(server.includes('location\\.href') && server.includes('volkamaxAllowedHost(redirected)'), 'Volkamax doit suivre le renvoi JavaScript vers BZH-Sport.');

assert.ok(server.includes('function alternativeBrowserUrl'), 'Alternative doit créer un navigateur intégré.');
assert.ok(server.includes('async function proxyAlternativeBrowser'), 'Alternative doit servir sa page navigateur Noctra.');
assert.ok(server.includes('/api/tv/alternative/open/'));
assert.ok(server.includes("streamKind: 'Alternative · navigateur intégré'"));

assert.ok(server.indexOf("label: `${option.label || 'Serveur'} · HLS`") < server.indexOf("label: `${option.label || 'Serveur'} · lecteur web`"), 'WiTV doit présenter le HLS avant le lecteur web.');
assert.equal(shell.includes('const firstWeb = options.findIndex'), false, 'Le client ne doit plus sélectionner WiTV web-first.');
assert.ok(!shell.includes('server2Hls >= 0 ? server2Hls'), 'Le client ne doit plus forcer HLS WiTV au démarrage.');

console.log('v157 Volkamax/WiTV/Alternative checks: OK');
