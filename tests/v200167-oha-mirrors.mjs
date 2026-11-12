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

const catalogueRefs = new Map();
const tvCatalogCache = new Map();
let nativeWorks = true;
Object.assign(context, {
  AbortController, AbortSignal, URLSearchParams, setTimeout, clearTimeout, tvCatalogCache,
  tvReferences: new Map(),
  normalizedIdentifier: value => value.toLowerCase(),
  resolveTvUrl: (value, base) => new URL(value, base).href,
  publicPath: path => path,
  tvPublicStreamUrl: token => '/stream/' + token,
  tvPublicOhaEmbedUrl: token => '/embed/' + token,
  tvPublicImageUrl: value => value,
  createHash: () => ({ update: value => ({ digest: () => value }) }),
  issueTvReference: () => 'lecteur',
  encodeTvStateReference(kind, state) {
    const key = String(catalogueRefs.size + 1);
    catalogueRefs.set(key, state);
    return key;
  },
  decodeTvStateReference: token => catalogueRefs.get(token),
  validateWiTvHlsStream: async (url, headers) => {
    if (!nativeWorks || headers.referer === 'https://huhu.bz/') throw new Error('Média absent');
    return { url };
  }
});
const start = server.indexOf('function ohaChannelIdentity(');
const end = server.indexOf('function parseDelimitedTvCatalog(', start);
vm.runInContext(['(() => {', line('ohaPublicGroups'), extract('cleanOhaChannelName'), server.slice(start, end),
  'Object.assign(this, { tvCatalogFromOha, resolveOhaStreamReference });', '})();'].join('\n'), context);

const item = (id, name, url, tag = 'France') => ({
  id, name, url, tags: [tag], images: { logo: '/live2/logo/' + id + '.png' }
});
calls.length = 0;
responder = (value, options) => {
  const url = new URL(value);
  if (url.pathname === '/live/resolve') {
    assert.equal(options.method, undefined);
    assert.equal(url.searchParams.get('language'), 'fr');
    return Response.json({ url: 'https://example.org/video.m3u8', format: 'hls' });
  }
  assert.equal(url.pathname, '/live/catalog/live/channels.json');
  const group = url.searchParams.get('filter[group]');
  if (url.hostname === 'kool.ws') return Response.json({ items: [] });
  if (url.hostname === 'oha.cx') return new Response('<!doctype html>');
  if (group === 'France Sport') return Response.json({ items: [] });
  if (url.hostname === 'vavoo.top') {
    return Response.json({ items: [item('4', 'TF1 HD (7)', 'https://www.vavoo.to/live/play/4'),
      item('99', 'Faux serveur', 'https://example.org/live/play/99')] });
  }
  const first = item('1', 'TF1 FHD (1)', 'https://huhu.bz/live/play/1');
  if (url.searchParams.get('cursor') === '300') {
    return Response.json({ items: [first, item('2', 'Arte HD (1)', 'https://huhu.bz/live/play/2')] });
  }
  return Response.json({ items: [first], nextCursor: '300' });
};

const catalogue = await context.tvCatalogFromOha();
assert.deepEqual(plain(catalogue.channels.map(channel => [channel.name, channel.serverCount])), [['Arte', 1], ['TF1', 2]]);
assert.match(catalogue.warning, /kool\.ws.*oha\.cx/);
assert.ok(calls.some(value => new URL(value).searchParams.get('cursor') === '300'));
const probes = calls.length;
await context.tvCatalogFromOha();
assert.equal(calls.length, probes);

const token = catalogue.channels.find(channel => channel.name === 'TF1').resolverUrl.split('/').at(-1);
let result = plain(await context.resolveOhaStreamReference(token));
assert.deepEqual(result.serverChoices.map(choice => choice.label), ['huhu.bz · FHD · Serveur 1', 'vavoo.top · HD · Serveur 7']);
assert.equal(result.activeServer, 1);
assert.equal(result.options[0].verified, true);
assert.equal(result.externalUrl, 'https://vavoo.top/#/channels');
const direct = result.serverChoices[1];
calls.length = 0;
result = plain(await context.resolveOhaStreamReference(token, direct.server, 'kool.ws'));
assert.equal(result.activeServer, 1);
assert.equal(calls.length, 1);
assert.equal(new URL(calls[0]).hostname, 'vavoo.top');
assert.equal(new URL(calls[0]).searchParams.get('url'), 'https://www.vavoo.to/live/play/4');
await assert.rejects(context.resolveOhaStreamReference(token, 0), /flux HLS vérifiable/);
nativeWorks = false;
result = plain(await context.resolveOhaStreamReference(token));
assert.equal(result.nativeUnavailable, true);
assert.equal(result.options[0].manualOnly, true);

for (const cache of tvCatalogCache.values()) cache.expiresAt = 0;
responder = () => Response.json({ items: [] });
assert.equal((await context.tvCatalogFromOha()).stale, true);
console.log('OHA / Kool : pagination par miroir, serveurs réels par chaîne, résolution HLS et catalogue de secours OK');
