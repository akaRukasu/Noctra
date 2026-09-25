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

assert.ok(!server.includes('oha.to'), 'Le serveur ne doit plus référencer oha.to.');
assert.ok(!shell.includes('oha.to'), 'Le client ne doit plus autoriser oha.to.');
assert.ok(server.includes("try { return ['oha.cx', 'www.oha.cx']"), 'OHA doit rester limité à oha.cx.');

assert.ok(server.includes('function streamSports99ExtractHlsUrl'), 'StreamSports99 doit décoder le HLS du player CDN Live TV.');
assert.ok(server.includes('/api/tv/streamsports99/stream/'), 'StreamSports99 doit exposer un flux Noctra local.');
assert.ok(server.includes("provider: 'StreamSports99', forceHls: true"), 'StreamSports99 doit passer par le proxy HLS stable.');

assert.ok(server.includes('async function streamedPlayerChannels'), 'Streamed doit interroger /api/stream/source/id.');
assert.ok(server.includes('/api/stream/${encodeURIComponent(sourceName)}/${encodeURIComponent(sourceId)}'), 'Streamed doit utiliser les lecteurs API publics.');
assert.ok(shell.includes("'embed.st'"), 'Le client doit accepter les lecteurs Streamed embed.st.');

assert.ok(server.includes('function volkamaxExtractEmbedUrl'), 'Volkamax doit extraire les iframes embeds[].');
assert.ok(server.includes('/api/tv/volkamax/embed/'), 'Volkamax doit passer par un bridge Noctra ciblé.');
assert.ok(shell.includes("'zonalive.click'"), 'Le client doit accepter les lecteurs Volkamax résolus.');

assert.ok(server.includes("'access-control-allow-origin': '*'"), 'Le proxy HLS doit envoyer un CORS valide.');
assert.ok(server.includes("reference.headers.accept || '*/*'"), 'Le proxy HLS doit conserver l’accept spécifique FSTV.');
assert.ok(server.includes('/^(?:LiveWatch|OHA|WiTV|FSTV|StreamSports99)$/i.test(provider)'), 'Les fournisseurs réparés doivent utiliser le chemin média stable.');

console.log('v156 Sport playback repair checks: OK');
