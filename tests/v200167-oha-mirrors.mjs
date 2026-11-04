// 200.0.167 : OHA / Kool sur ses miroirs actuels (huhu.bz, kool.ws, vavoo.top,
// oha.cx), application « #/channels ». Fonctions du serveur exécutées avec des
// réponses simulées (miroirs injoignables depuis l'environnement de test).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
function extract(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(server);
  assert.ok(match, name);
  let depth = 0;
  for (let j = server.indexOf('{', server.indexOf(')', match.index)); j < server.length; j++) {
    if (server[j] === '{') depth++;
    else if (server[j] === '}' && --depth === 0) return server.slice(match.index, j + 1);
  }
  throw new Error(name);
}
const line = name => { const m = new RegExp(`const ${name} = [^\\n]+;`).exec(server); assert.ok(m, name); return m[0]; };

assert.match(server, /id: 'oha-live', name: 'OHA \/ Kool', section: 'channels', description: 'Live TV · France · A–Z · huhu\.bz \(secours : kool\.ws, vavoo\.top, oha\.cx\)', url: 'https:\/\/huhu\.bz\/#\/channels'/);
assert.ok(!/['"]https:\/\/kool\.ws\/live['"]/.test(server.replace(/\/\/[^\n]*/g, '')), 'plus d’adresse kool.ws/live codée en dur');

const calls = [];
let responder = () => { throw new Error('non simulé'); };
const context = {
  URL, JSON, Date, Array, String, Number, Promise, console, calls,
  HttpError: class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } },
  safeTvRemoteUrl: value => new URL(String(value)),
  fetchTvRemote: async (url, options) => { calls.push(url); return responder(url, options); }
};
vm.createContext(context);
vm.runInContext([
  'let ohaHealthyRoot = null;', line('OHA_MIRRORS'), line('OHA_LEGACY_HOSTS'), line('OHA_HOSTS'),
  extract('ohaIsMirror'), extract('ohaApiEndpoints'), extract('ohaPostJson'), extract('ohaRootAlternatives'),
  extract('ohaAllowedHost'), extract('ohaWatchRouteFromValue'), extract('ohaOfficialPageCandidates'),
  'Object.assign(this, { ohaApiEndpoints, ohaPostJson, ohaRootAlternatives, ohaAllowedHost, ohaOfficialPageCandidates });'
].join('\n'), context);
const plain = value => JSON.parse(JSON.stringify(value));

// Ordre d'essai : miroir configuré, puis huhu.bz, kool.ws, vavoo.top, oha.cx, puis IP de secours.
assert.deepEqual(plain(context.ohaRootAlternatives('https://huhu.bz/#/channels')), [
  'https://huhu.bz/live', 'https://kool.ws/live', 'https://vavoo.top/live', 'https://oha.cx/live',
  'http://185.254.196.78/live', 'http://178.83.5.50/live'
]);
assert.deepEqual(plain(context.ohaRootAlternatives('https://vavoo.top/#/channels')).slice(0, 2), ['https://vavoo.top/live', 'https://huhu.bz/live']);
for (const host of ['huhu.bz', 'www.huhu.bz', 'kool.ws', 'vavoo.top', 'oha.cx', '185.254.196.78']) assert.equal(context.ohaAllowedHost(`https://${host}/x`), true, host);
assert.equal(context.ohaAllowedHost('https://huhu.bz.evil.example/'), false);
assert.equal(context.ohaAllowedHost('https://example.org/'), false);

// API : MediaHubMX d'abord (oha.cx : MediaURL d'abord), l'autre si absente ou non JSON.
assert.deepEqual(plain(context.ohaApiEndpoints('https://huhu.bz/live', 'catalog')), ['/mediahubmx-catalog.json', '/mediaurl-catalog.json']);
assert.deepEqual(plain(context.ohaApiEndpoints('https://oha.cx/live', 'resolve')), ['/mediaurl-resolve.json', '/mediahubmx-resolve.json']);
const makeError = (status, detail) => new context.HttpError(status || 502, detail || `HTTP ${status}`);
responder = url => url.endsWith('/mediahubmx-catalog.json') ? new Response('', { status: 404 }) : new Response(JSON.stringify({ items: [1] }));
assert.deepEqual(plain(await context.ohaPostJson('https://huhu.bz/live', 'catalog', {}, makeError)), { items: [1] });
assert.deepEqual(calls.splice(0), ['https://huhu.bz/mediahubmx-catalog.json', 'https://huhu.bz/mediaurl-catalog.json']);
responder = url => url.endsWith('/mediahubmx-catalog.json') ? new Response('<!doctype html><title>app</title>') : new Response(JSON.stringify({ items: [2] }));
assert.deepEqual(plain(await context.ohaPostJson('https://kool.ws/live', 'catalog', {}, makeError)), { items: [2] }, 'page HTML : endpoint suivant');
calls.length = 0;
responder = () => new Response('', { status: 451 });
await assert.rejects(context.ohaPostJson('https://huhu.bz/live', 'catalog', {}, makeError), error => error.status === 451, 'refus du fournisseur : pas d’autre endpoint');
assert.equal(calls.length, 1);

// Page officielle : « #/channels » d'abord sur les miroirs actuels, routes /watch ensuite.
const pages = plain(context.ohaOfficialPageCandidates('https://huhu.bz/live', 'abcdefabcdef1234567890ab', '', []));
assert.equal(pages[0], 'https://huhu.bz/#/channels');
assert.ok(pages.includes('https://huhu.bz/watch?live=abcdefabcdef1234567890ab'));
assert.equal(plain(context.ohaOfficialPageCandidates('http://185.254.196.78/live', 'abcdefabcdef1234567890ab', '', []))[0], 'http://185.254.196.78/watch?live=abcdefabcdef1234567890ab', 'adresse IP : ancienne route');
assert.match(server, /if \(hash && !finalUrl\.hash\) finalUrl\.hash = hash;/, 'fragment « #\/channels » gardé après la requête');
assert.match(server, /history\.replaceState\(\{\},'','\/#\/channels'\)/, 'route expirée : retour à #/channels');
// Santé des miroirs : catalogue public de chacun, mis en mémoire.
vm.runInContext(['let ohaMirrorHealthState = null;', line('ohaPublicGroups'), extract('ohaRequestBody'), extract('ohaHealthyMirrors'), 'this.ohaHealthyMirrors = ohaHealthyMirrors;'].join('\n'), Object.assign(context, { AbortSignal }));
calls.length = 0;
responder = url => url.startsWith('https://kool.ws/') ? new Response('', { status: 503 })
  : url.startsWith('https://oha.cx/') && url.endsWith('/mediaurl-catalog.json') ? new Response('', { status: 404 })
  : new Response(JSON.stringify({ items: [] }));
assert.deepEqual(plain(await context.ohaHealthyMirrors()), ['huhu.bz', 'vavoo.top', 'oha.cx'], 'oha.cx : MediaHubMX en secours');
const probes = calls.length;
await context.ohaHealthyMirrors();
assert.equal(calls.length, probes, 'résultat gardé en mémoire');

// Serveurs d'une chaîne : ceux de chaque miroir qui répond.
const resolveContext = {
  URL, JSON, Date, Array, String, Number, Promise, setTimeout, clearTimeout, AbortController, console,
  HttpError: context.HttpError, OHA_MIRRORS: ['huhu.bz', 'kool.ws', 'vavoo.top', 'oha.cx'],
  delay: ms => new Promise(resolve => setTimeout(resolve, ms)),
  publicPath: path => '/noctra' + path,
  decodeTvStateReference: () => ({ root: 'https://huhu.bz/live', candidates: [{ url: 'u1', label: 'HD · Serveur 1' }, { url: 'u2', label: 'SD · Serveur 2' }] }),
  tvReferences: new Map(), cleanError: error => error.message,
  ohaOfficialPageCandidates: () => ['https://huhu.bz/#/channels'],
  issueTvReference: () => 'bridge', ohaWebFallbackOption: () => ({ label: 'OHA intégré', fallback: true }),
  healthy: ['huhu.bz', 'vavoo.top', 'oha.cx'], forced: [],
  ohaHealthyMirrors: () => Promise.resolve(resolveContext.healthy),
  firstSuccessfulOhaCandidate: async () => ({ label: 'HD · Serveur 1', streamUrl: '/s/1', playbackType: 'stream', verified: true, serverIndex: 0, mirror: 'vavoo.top' }),
  resolveSingleOhaCandidate: async (reference, candidate, index, timeout, signal, onlyRoot) => {
    resolveContext.forced.push(onlyRoot);
    return { label: candidate.label, streamUrl: '/s/forced', playbackType: 'stream', verified: true, serverIndex: index, mirror: new URL(onlyRoot || 'https://huhu.bz/').hostname };
  }
};
vm.createContext(resolveContext);
vm.runInContext([extract('ohaServerChoices'), extract('resolveOhaStreamReference'), 'this.resolveOhaStreamReference = resolveOhaStreamReference;'].join('\n'), resolveContext);
let result = plain(await resolveContext.resolveOhaStreamReference('jeton'));
assert.deepEqual(result.serverChoices.map(c => c.label), [
  'huhu.bz · HD · Serveur 1', 'huhu.bz · SD · Serveur 2',
  'vavoo.top · HD · Serveur 1', 'vavoo.top · SD · Serveur 2',
  'oha.cx · HD · Serveur 1', 'oha.cx · SD · Serveur 2'
], 'kool.ws ne répond pas : absent');
assert.equal(result.serverChoices[3].resolveUrl, '/noctra/api/tv/oha/resolve/jeton?server=1&mirror=vavoo.top');
assert.equal(result.activeServer, 2, 'flux obtenu sur vavoo.top · Serveur 1');
assert.equal(result.options[0].label, 'vavoo.top · HD · Serveur 1');
assert.deepEqual(result.options.slice(1, -1).map(o => o.label), ['huhu.bz · HD · Serveur 1', 'huhu.bz · SD · Serveur 2', 'vavoo.top · SD · Serveur 2', 'oha.cx · HD · Serveur 1', 'oha.cx · SD · Serveur 2'], 'applis : serveurs des autres miroirs');
assert.equal(result.options.at(-1).label, 'OHA intégré');
// Serveur choisi sur un miroir précis.
result = plain(await resolveContext.resolveOhaStreamReference('jeton', 1, 'oha.cx'));
assert.deepEqual(resolveContext.forced, ['https://oha.cx/live']);
assert.equal(result.activeServer, 5);
// Adresse de miroir inconnue ignorée (pas de requête vers un site arbitraire).
resolveContext.forced.length = 0;
await resolveContext.resolveOhaStreamReference('jeton', 0, 'evil.example');
assert.deepEqual(resolveContext.forced, ['']);
// Aucun miroir vérifié : serveurs comme avant, sans nom de miroir.
resolveContext.healthy = [];
resolveContext.firstSuccessfulOhaCandidate = async () => { throw new Error('aucun flux'); };
result = plain(await resolveContext.resolveOhaStreamReference('jeton'));
assert.deepEqual(result.serverChoices.map(c => c.label), ['HD · Serveur 1', 'SD · Serveur 2']);
assert.equal(result.options[0].label, 'OHA intégré', 'sans flux : lecteur officiel d’abord');
assert.equal(result.nativeUnavailable, true);
console.log('200.0.167 : OHA / Kool sur huhu.bz, kool.ws, vavoo.top et oha.cx (#/channels), serveurs de chaque miroir : OK');
