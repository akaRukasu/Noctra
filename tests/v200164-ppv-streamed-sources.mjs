// 200.0.164 : Streamed à sa nouvelle adresse (strmfree.st, anciennes adresses
// ensuite) et source PPV (ppv.st, /api/streams). Fonctions du serveur exécutées
// avec des réponses simulées (les sites eux-mêmes ne sont pas joignables ici).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

function extract(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(server);
  assert.ok(match, 'fonction ' + name);
  let depth = 0, i = server.indexOf('{', server.indexOf(')', match.index));
  // Paramètres par défaut contenant des accolades : aucune ici.
  for (let j = i; j < server.length; j++) {
    const c = server[j];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return server.slice(match.index, j + 1);
  }
  throw new Error('fin introuvable : ' + name);
}
const constant = name => { const m = new RegExp(`const ${name} = [^;]+;`).exec(server); assert.ok(m, name); return m[0]; };

assert.match(server, /id: 'streamed-sports', name: 'Streamed', section: 'sports', description: 'Événements sportifs publics · strmfree\.st', url: 'https:\/\/strmfree\.st\/'/);
assert.match(server, /id: 'ppv-sports', name: 'PPV', section: 'sports', description: 'Événements sportifs publics · ppv\.st', url: 'https:\/\/ppv\.st\/', type: 'ppv'/);
assert.match(server, /else if \(source\.type === 'ppv'\) catalog = await tvCatalogFromPpv\(source\.url\);/);
assert.match(server, /'streamed', 'ppv', 'volkamax'/);

const calls = [];
let responder = () => { throw new Error('non simulé'); };
const context = {
  URL, AbortSignal, Date, JSON, Number, String, Boolean, Array, Set, Map, Math, encodeURIComponent, console,
  createHash, calls,
  HttpError: class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } },
  issueTvReference: () => 'jeton', tvPublicStreamUrl: token => '/api/tv/stream/' + token,
  tvCatalogCache: new Map(),
  fetchTvRemote: async (url, options) => { calls.push(url); return responder(url, options); }
};
vm.createContext(context);
vm.runInContext([
  extract('safeTvRemoteUrl'), extract('resolveTvUrl'), extract('normalizeTvChannel'),
  constant('STREAMED_HOSTS'), extract('fetchStreamedJson'),
  constant('PPV_HOSTS'), extract('ppvEvents'), extract('ppvChannel'), extract('tvCatalogFromPpv'),
  'this.fetchStreamedJson = fetchStreamedJson; this.tvCatalogFromPpv = tvCatalogFromPpv; this.ppvChannel = ppvChannel;'
].join('\n'), context);

const plain = value => JSON.parse(JSON.stringify(value));
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const html = () => ({ ok: true, status: 200, text: async () => '<!doctype html><title>Parking</title>' });

// Streamed : strmfree.st d'abord ; page HTML ou panne → streamed.pk puis streamed.st.
responder = url => url.startsWith('https://strmfree.st/') ? json([{ id: 'm1' }]) : html();
assert.deepEqual(plain(await context.fetchStreamedJson('https://strmfree.st/api/matches/live', 'https://strmfree.st/')), [{ id: 'm1' }]);
calls.length = 0;
responder = url => url.startsWith('https://streamed.st/') ? json([{ id: 'm2' }]) : url.startsWith('https://strmfree.st/') ? html() : json({}, 503);
assert.deepEqual(plain(await context.fetchStreamedJson('https://strmfree.st/api/matches/live', 'https://strmfree.st/')), [{ id: 'm2' }]);
assert.deepEqual(calls, ['https://strmfree.st/api/matches/live', 'https://streamed.pk/api/matches/live', 'https://streamed.st/api/matches/live'], 'adresses essayées dans l’ordre');
calls.length = 0;
responder = () => json({}, 503);
await assert.rejects(context.fetchStreamedJson('https://strmfree.st/api/sports', 'https://strmfree.st/'));
assert.equal(calls.length, 3, 'chaque adresse une seule fois');

// PPV : programme groupé par catégorie, événements en cours / à venir / terminés.
const now = Math.floor(Date.now() / 1000);
responder = url => url === 'https://ppv.st/api/streams' ? json({
  success: true,
  streams: [
    { category: 'Football', streams: [
      { id: 1, name: 'PSG vs OM', uri_name: 'football/psg-om', poster: 'https://img.example/psg.png', starts_at: now - 600, ends_at: now + 6000, iframe: 'https://embed.example/e/psg' },
      { id: 2, name: 'Lyon vs Nice', uri_name: 'football/lyon-nice', starts_at: now + 7200, ends_at: now + 14400 },
      { id: 3, name: 'Ancien match', uri_name: 'football/old', starts_at: now - 20000, ends_at: now - 10000 }
    ] },
    { category: '24/7', streams: [{ id: 4, name: 'Chaîne sport 24/7', uri_name: '24-7/sport', always_live: 1, iframe: '/embed/sport' }] }
  ]
}) : json({}, 404);
const catalog = await context.tvCatalogFromPpv('https://ppv.st/');
assert.equal(catalog.name, 'PPV');
assert.deepEqual(plain(catalog.channels.map(c => c.name)), ['PSG vs OM', 'Lyon vs Nice', 'Chaîne sport 24/7'], 'événement terminé retiré');
const [live, later, always] = catalog.channels;
assert.equal(live.embedUrl, 'https://embed.example/e/psg');
assert.equal(live.externalUrl, 'https://ppv.st/live/football/psg-om');
assert.equal(live.isLive, true);
assert.equal(live.group, 'Football');
assert.equal(live.logo, 'https://img.example/psg.png');
assert.equal(later.embedUrl, 'https://ppv.st/live/football/lyon-nice', 'sans lecteur intégré : page de l’événement');
assert.equal(later.isLive, false);
assert.equal(always.embedUrl, 'https://ppv.st/embed/sport', 'adresse relative résolue');
assert.equal(always.isLive, true);
assert.ok(catalog.channels.every(c => c.compatPage && c.playbackType === 'embed'));
assert.equal(catalog.warning, '');

// PPV injoignable sur ppv.st : ppv.to essayé ; rien du tout : message clair, pas de plantage.
context.tvCatalogCache.clear();
calls.length = 0;
responder = url => url === 'https://ppv.to/api/streams' ? json([{ name: 'Boxe', uri_name: 'boxe/main', always_live: true }]) : json({}, 502);
const mirror = await context.tvCatalogFromPpv('https://ppv.st/');
assert.deepEqual(calls, ['https://ppv.st/api/streams', 'https://ppv.to/api/streams']);
assert.deepEqual(plain(mirror.channels.map(c => c.externalUrl)), ['https://ppv.to/live/boxe/main']);
context.tvCatalogCache.clear();
responder = () => json({}, 502);
const down = await context.tvCatalogFromPpv('https://ppv.st/');
assert.equal(down.count, 0);
assert.match(down.warning, /^PPV ne répond pas/);

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const tvApp = await readFile(new URL('../apps/androidtv/web/app.js', import.meta.url), 'utf8');
for (const [name, text] of [['web', shell], ['TV', tvApp]]) assert.ok(text.includes("'strmfree.st', 'www.strmfree.st', 'ppv.st', 'www.ppv.st'"), 'lecteurs intégrés autorisés : ' + name);
console.log('200.0.164 : Streamed (strmfree.st puis anciennes adresses) et PPV (ppv.st) : OK');
