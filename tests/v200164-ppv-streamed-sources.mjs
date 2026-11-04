// 200.0.164 / 200.0.167 : Streamed (strmfree.pk, puis les autres adresses) et
// PPV (rockylive.st, tim-streams.com, puis ppv.st / ppv.to, /api/streams), avec
// le site du fournisseur proposé si aucune adresse ne répond. Fonctions du
// serveur exécutées avec des réponses simulées (sites injoignables ici).
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

assert.match(server, /id: 'streamed-sports', name: 'Streamed', section: 'sports', description: 'Événements sportifs publics · strmfree\.pk', url: 'https:\/\/strmfree\.pk\/'/);
assert.match(server, /id: 'ppv-sports', name: 'PPV', section: 'sports', description: 'Événements sportifs publics · rockylive\.st \(secours : tim-streams\.com\)', url: 'https:\/\/rockylive\.st\/', type: 'ppv'/);
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
  constant('STREAMED_HOSTS'), 'let streamedHealthyHost = null;', extract('fetchStreamedJson'),
  constant('PPV_HOSTS'), constant('PPV_SITES'), constant('STREAMED_SITES'), extract('providerSiteChannels'),
  extract('ppvEvents'), extract('ppvChannel'), extract('tvCatalogFromPpv'),
  'this.fetchStreamedJson = fetchStreamedJson; this.tvCatalogFromPpv = tvCatalogFromPpv; this.ppvChannel = ppvChannel; this.providerSiteChannels = providerSiteChannels; this.resetHealthy = () => { streamedHealthyHost = null; };'
].join('\n'), context);

const plain = value => JSON.parse(JSON.stringify(value));
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const html = () => ({ ok: true, status: 200, text: async () => '<!doctype html><title>Parking</title>' });

// Streamed : strmfree.pk d'abord ; page HTML ou panne → adresses suivantes dans l'ordre.
responder = url => url.startsWith('https://strmfree.pk/') ? json([{ id: 'm1' }]) : html();
assert.deepEqual(plain(await context.fetchStreamedJson('https://strmfree.pk/api/matches/live', 'https://strmfree.pk/')), [{ id: 'm1' }]);
context.resetHealthy();
calls.length = 0;
responder = url => url.startsWith('https://rockylive.st/') ? json([{ id: 'm2' }]) : url.startsWith('https://strmfree.pk/') ? html() : json({}, 503);
assert.deepEqual(plain(await context.fetchStreamedJson('https://strmfree.pk/api/matches/live', 'https://strmfree.pk/')), [{ id: 'm2' }]);
assert.deepEqual(calls, ['strmfree.pk', 'strmfree.st', 'streamed.pk', 'streamed.st', 'rockylive.st'].map(host => `https://${host}/api/matches/live`), 'adresses essayées dans l’ordre');
// Rubrique suivante : directement sur l'adresse qui a répondu.
calls.length = 0;
assert.deepEqual(plain(await context.fetchStreamedJson('https://strmfree.pk/api/matches/featured', 'https://strmfree.pk/')), [{ id: 'm2' }]);
assert.deepEqual(calls, ['https://rockylive.st/api/matches/featured'], 'adresse qui répond retenue');
context.resetHealthy();
calls.length = 0;
responder = () => json({}, 503);
await assert.rejects(context.fetchStreamedJson('https://strmfree.pk/api/sports', 'https://strmfree.pk/'));
assert.equal(calls.length, 6, 'chaque adresse une seule fois');
// Site du fournisseur proposé quand aucune adresse ne répond (lecteur web de Noctra).
const sites = plain(context.providerSiteChannels('PPV', ['https://rockylive.st/', 'https://tim-streams.com/']));
assert.deepEqual(sites.map(c => [c.name, c.embedUrl, c.playbackType, c.compatPage]), [
  ['PPV · site rockylive.st', 'https://rockylive.st/', 'embed', true],
  ['PPV · site tim-streams.com', 'https://tim-streams.com/', 'embed', true]
]);

// PPV : programme groupé par catégorie, événements en cours / à venir / terminés.
const now = Math.floor(Date.now() / 1000);
responder = url => url === 'https://rockylive.st/api/streams' ? json({
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
const catalog = await context.tvCatalogFromPpv('https://rockylive.st/');
assert.equal(catalog.name, 'PPV');
assert.deepEqual(plain(catalog.channels.map(c => c.name)), ['PSG vs OM', 'Lyon vs Nice', 'Chaîne sport 24/7'], 'événement terminé retiré');
const [live, later, always] = catalog.channels;
assert.equal(live.embedUrl, 'https://embed.example/e/psg');
assert.equal(live.externalUrl, 'https://rockylive.st/live/football/psg-om');
assert.equal(live.isLive, true);
assert.equal(live.group, 'Football');
assert.equal(live.logo, 'https://img.example/psg.png');
assert.equal(later.embedUrl, 'https://rockylive.st/live/football/lyon-nice', 'sans lecteur intégré : page de l’événement');
assert.equal(later.isLive, false);
assert.equal(always.embedUrl, 'https://rockylive.st/embed/sport', 'adresse relative résolue');
assert.equal(always.isLive, true);
assert.ok(catalog.channels.every(c => c.compatPage && c.playbackType === 'embed'));
assert.equal(catalog.warning, '');

// rockylive.st en panne : tim-streams.com, puis ppv.st… essayés ; rien du tout : sites du fournisseur.
context.tvCatalogCache.clear();
calls.length = 0;
responder = url => url === 'https://tim-streams.com/api/streams' ? json([{ name: 'Boxe', uri_name: 'boxe/main', always_live: true }]) : json({}, 502);
const mirror = await context.tvCatalogFromPpv('https://rockylive.st/');
assert.deepEqual(calls, ['https://rockylive.st/api/streams', 'https://tim-streams.com/api/streams']);
assert.deepEqual(plain(mirror.channels.map(c => c.externalUrl)), ['https://tim-streams.com/live/boxe/main']);
context.tvCatalogCache.clear();
calls.length = 0;
responder = () => html();
const down = await context.tvCatalogFromPpv('https://rockylive.st/');
assert.deepEqual(calls, ['rockylive.st', 'tim-streams.com', 'ppv.st', 'ppv.to'].map(host => `https://${host}/api/streams`));
assert.deepEqual(plain(down.channels.map(c => c.embedUrl)), ['https://rockylive.st/', 'https://tim-streams.com/'], 'sites du fournisseur proposés');
assert.match(down.warning, /^L’API PPV ne répond sur aucune adresse \(rockylive\.st, tim-streams\.com, ppv\.st, ppv\.to/);

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const tvApp = await readFile(new URL('../apps/androidtv/web/app.js', import.meta.url), 'utf8');
for (const [name, text] of [['web', shell], ['TV', tvApp]]) {
  for (const host of ['strmfree.pk', 'rockylive.st', 'tim-streams.com', 'huhu.bz', 'kool.ws', 'vavoo.top']) assert.ok(text.includes(`'${host}', 'www.${host}'`), `lecteurs intégrés autorisés (${name}) : ${host}`);
}
console.log('200.0.167 : Streamed (strmfree.pk puis autres adresses), PPV (rockylive.st, tim-streams.com, ppv.st) et sites du fournisseur en secours : OK');
