import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));

// Le transport v94 reste compatible avec le profil live desktop actuel.
assert.ok(shell.includes('lowLatencyMode: false'));
assert.ok(shell.includes('backBufferLength: 30') && shell.includes('maxBufferLength: 30'));
assert.ok(!shell.includes('function startTvPlaybackWatchdog'));

// Un timeout de connexion ne doit pas devenir un timeout du body média.
assert.ok(server.includes('async function fetchTvRemoteUntilHeaders'));
assert.ok(server.includes("providerStabilityPath = /^(?:LiveWatch|OHA|WiTV|FSTV|StreamSports99)$/i.test(provider)"));
assert.ok(server.includes("? await fetchTvRemoteUntilHeaders(url, { headers }, 18_000)"));

// Le chemin générique reste disponible pour les autres fournisseurs.
assert.ok(server.includes(": await fetchTvRemote(url, { headers, signal: AbortSignal.timeout(30_000) });"));
assert.ok(server.includes("...(reference.headers.origin ? { origin: reference.headers.origin } : {})"));

// Les playlists LiveWatch/OHA réutilisent les mêmes URLs locales de segments.
assert.ok(server.includes('function issueStableProviderChildReference'));
assert.ok(server.includes("{ provider: 'LiveWatch' }"));
assert.ok(server.includes("{ provider: 'OHA' }"));
assert.ok(server.includes("kind: 'provider-hls-child'"));
assert.ok(server.includes("/^(?:LiveWatch|OHA|WiTV|FSTV|StreamSports99)$/i.test(provider)"));

// OHA et le bridge LiveWatch relaient désormais les médias en streaming.
assert.ok(server.includes("'x-accel-buffering': 'no'"));
assert.ok(server.includes('pipeRemoteResponseBody(response, res)'));
assert.equal(server.includes('Readable.fromWeb(response.body).pipe(res)'), false);
assert.ok(server.includes('res.flushHeaders?.()'));
assert.ok(server.includes("externalMedia\n    ? await fetchTvRemoteUntilHeaders(target.toString()"));
assert.ok(server.includes("if (externalMedia || tvBridgeMediaResponseAllowed(finalUrl, responseHeaders['content-type']))"));

console.log('Transport TV LiveWatch/OHA Noctra v94 : OK');
