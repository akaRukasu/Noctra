// 200.0.165 : un serveur TV refusé (401/403) affiche la raison donnée par Noctra
// (refus du fournisseur, session VIP à reconnecter…) au lieu du seul code.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const server = await read('server.mjs');
const start = server.indexOf('function tvUpstreamError(');
const end = server.indexOf('\n}\n', start) + 3;
const context = { URL, HttpError: class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } } };
vm.createContext(context);
vm.runInContext(server.slice(start, end) + '\nthis.tvUpstreamError = tvUpstreamError;', context);
const refused = context.tvUpstreamError(403, 'Movix', 'https://cdn.example/live.m3u8');
assert.equal(refused.status, 403);
assert.equal(refused.message, 'Movix refuse ce flux au serveur Noctra (403) : refus du fournisseur, essaie un autre serveur.');
assert.match(context.tvUpstreamError(401, '', 'https://cdn.example/x').message, /^cdn\.example refuse ce flux au serveur Noctra \(401\)/);
assert.match(context.tvUpstreamError(410, 'LiveWatch', 'https://x/').message, /lien du flux expiré \(410\)/);
assert.equal(context.tvUpstreamError(502, 'NorthTV', 'https://x/').message, 'Flux TV indisponible chez NorthTV (502).');
assert.equal((server.match(/throw tvUpstreamError\(response\.status, provider, url\);/g) || []).length, 2, 'relais et rafraîchissement des listes');
assert.ok(!server.includes('`Flux TV indisponible (${response.status}).`'));

const ios = await read('apps/ios-native/Noctra/Sources/LiveServers.swift');
assert.match(ios, /let reason = session\.isNoctraOrigin\(url\) \? noctraReason\(body\) : nil/);
assert.match(ios, /static func noctraReason\(_ body: Data\) -> String\?/);
const android = await read('apps/android-native/app/src/main/java/com/noctra/mobile/live/LiveServers.kt');
assert.match(android, /val reason = if \(Session\.isNoctraOrigin\(url\)\) noctraReason\(first\.data\) else null/);
assert.match(android, /fun noctraReason\(body: ByteArray\): String\?/);
console.log('200.0.165 : raison des serveurs TV refusés (fournisseur, session VIP) affichée : OK');
