import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const start = server.indexOf('function streamedMatchChannel(');
const end = server.indexOf('\nasync function ', server.indexOf('async function tvCatalogFromVolkamax(') + 1);
const calls = [];
const references = new Map();
let respond;
const context = {
  URL, Response, AbortSignal,
  HttpError: class extends Error { constructor(status, message) { super(message); this.status = status; } },
  tvCatalogCache: new Map(),
  tvReferences: references,
  safeTvRemoteUrl(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL invalide');
    return url;
  },
  resolveTvUrl: (url, base) => context.safeTvRemoteUrl(new URL(url, base)).href,
  fetchTvRemote: async url => { calls.push(String(url)); return respond(String(url)); },
  fetchPublicTvHtml: async url => { calls.push(url); return respond(url); },
  publicPath: value => value,
  issueTvReference(url, headers, meta) {
    const token = String(references.size + 1);
    references.set(token, { url, headers, meta, expiresAt: Date.now() + 60_000 });
    return token;
  },
  normalizeTvChannel(item) {
    return item.name && item.embed_url
      ? { ...item, id: item.name + item.embed_url, embedUrl: item.embed_url, playbackType: 'embed' } : null;
  },
  decodeTvHtml: value => value.replaceAll('&amp;', '&'),
  stripTvHtml: value => value.replace(/<[^>]*>/g, '').trim(),
  createHash: () => ({ update: value => ({ digest: () => String(value.split('\n').at(-1).split('/').at(-1)) }) })
};
vm.runInNewContext(server.slice(start, end) + '\nObject.assign(this, { tvCatalogFromStreamed, tvCatalogFromPpv, tvCatalogFromVolkamax, volkamaxExtractEmbedUrl, proxyVolkamaxEmbed });', context);
const reset = fn => { respond = fn; calls.length = 0; context.tvCatalogCache.clear(); };
const body = value => Response.json(value);

assert.match(server, /id: 'volkamax-sports'[^\n]+url: 'https:\/\/volkamax\.club\/'/);
const streamFree = { streams: [{ id: 'game', name: 'Match A', category: 'soccer', match_timestamp: 1793814300,
  sources: [{ quality: 'SD', url: 'https://strmfree.st/embed/soccer/game540p', live: false },
    { quality: 'FHD', url: 'https://strmfree.st/embed/soccer/game1080p', live: true }] }] };
reset(() => body(streamFree));
let catalogue = await context.tvCatalogFromStreamed();
assert.deepEqual(calls, ['https://strmfree.pk/api/v1/streams']);
assert.equal(catalogue.count, 1);
assert.equal(catalogue.channels[0].is_live, true);
let ref = references.get(catalogue.channels[0].resolverUrl.split('/').at(-1));
assert.equal(ref.meta.kind, 'sports-public-players');
assert.equal(ref.meta.options.map(item => item.label).join(','), 'FHD,SD');
assert.equal(ref.meta.options[0].url, 'https://strmfree.pk/embed/soccer/game1080p');

reset(url => body(url.startsWith('https://strmfree.pk') ? { streams: [{ name: 'Match sans lecteur', sources: [] }] } : streamFree));
catalogue = await context.tvCatalogFromStreamed();
assert.deepEqual(calls, ['https://strmfree.pk/api/v1/streams', 'https://strmfree.st/api/v1/streams']);
assert.match(catalogue.warning, /strmfree\.pk : programme vide/);
assert.equal(catalogue.count, 1);

const rocky = { success: true, events: [{ id: 10, title: 'Rocky Match', league: 'NBA', always_live: true,
  embed_url: 'https://rockyembed.st/source/fetch.php?full=10', event_url: 'https://rockylive.st/nba/rocky-match-10/' }] };
reset(() => body(rocky));
catalogue = await context.tvCatalogFromPpv();
assert.deepEqual(calls, ['https://rockylive.st/api/events.php?limit=1000']);
assert.equal(catalogue.channels[0].embedUrl, rocky.events[0].embed_url);
assert.equal(catalogue.channels[0].externalUrl, rocky.events[0].event_url);
assert.equal(catalogue.channels[0].group, 'NBA');

const tim = { genres: [{ id: 1, name: 'Soccer', sub_categories: [{ id: 7, name: 'Champions League' }] }], events: [
  { name: 'Tim Match', url: 'tim-match', genre: 1, sub_genre: 7, time: '2026-11-04T12:45', streams: [
    { name: 'VIP', url: 'https://example.org/vip', vip: true },
    { name: 'Server 1', url: 'https://example.org/public-1' },
    { name: 'Server 2', url: 'https://example.org/public-2' }
  ] },
  { name: 'Tim VIP', url: 'tim-vip', vip: true, streams: [{ url: 'https://example.org/vip' }] }
] };
reset(url => body(url.startsWith('https://rockylive.st') ? { success: true, events: [{ title: 'Pas de lecteur' }] } : tim));
catalogue = await context.tvCatalogFromPpv();
assert.deepEqual(calls, ['https://rockylive.st/api/events.php?limit=1000', 'https://tim-streams.com/api/live-upcoming']);
assert.equal(catalogue.count, 1);
assert.equal(catalogue.channels[0].group, 'Champions League');
assert.equal(catalogue.channels[0].externalUrl, 'https://tim-streams.com/watch/tim-match');
ref = references.get(catalogue.channels[0].resolverUrl.split('/').at(-1));
assert.equal(ref.meta.options.map(item => item.label).join(','), 'Server 1,Server 2');
assert.match(catalogue.warning, /rockylive\.st : programme vide/);

reset(url => url.startsWith('https://ppv.st') ? body({ streams: [{ category: 'Sport', streams: [
  { name: 'Legacy PPV', uri_name: 'legacy', iframe: 'https://example.org/player' }
] }] }) : new Response('<!doctype html>'));
catalogue = await context.tvCatalogFromPpv();
assert.equal(calls.at(-1), 'https://ppv.st/api/streams');
assert.equal(catalogue.channels[0].name, 'Legacy PPV');

reset(() => new Response('<!doctype html>'));
catalogue = await context.tvCatalogFromPpv();
assert.deepEqual(calls, ['https://rockylive.st/api/events.php?limit=1000', 'https://tim-streams.com/api/live-upcoming',
  'https://ppv.st/api/streams', 'https://ppv.to/api/streams']);
assert.equal(catalogue.channels.every(item => item.streamKind === 'Site du fournisseur'), true);
assert.match(catalogue.warning, /non JSON/);

const volkaHtml = '<a href="/ligue-1-streaming-direct">Ligue 1</a><a href="/regarder-la-chaine-test">Canal Test</a>' +
  '<tr><td>16:00</td><td>Europa League</td><td class="event-title">Match de test</td>' +
  '<td><a href="/match-streaming-direct" class="event btn">Regarder</a></td><td><img src="/live.gif"></td></tr>';
reset(url => ({ finalUrl: url, html: url.includes('bzzh.lat') ? volkaHtml : '<a href="/ligue-1-streaming-direct">Ligue 1</a>' }));
catalogue = await context.tvCatalogFromVolkamax();
assert.deepEqual(calls, ['https://volkamax.club/', 'https://bzzh.lat/']);
assert.equal(catalogue.count, 2);
assert.equal(catalogue.channels[0].name, 'Match de test');
assert.equal(catalogue.channels[0].group, 'Événements · Europa League');
assert.equal(catalogue.channels[0].isLive, true);
assert.match(catalogue.channels[1].externalUrl, /^https:\/\/bzzh\.lat/);
assert.equal(context.volkamaxExtractEmbedUrl('<script src="/ads.js"></script><img src="/offline.gif">', 'https://bzzh.lat/'), '');
assert.equal(context.volkamaxExtractEmbedUrl("embeds[0] = '<iframe src=\"https://example.org/player?a=1&amp;b=2\"></iframe>';", 'https://bzzh.lat/'), 'https://example.org/player?a=1&b=2');
const volkaToken = catalogue.channels[1].embedUrl.split('/').at(-1);
reset(url => ({ finalUrl: url, html: url.includes('bzzh.lat') ? '<img src="/offline.gif">' : '<iframe src="https://example.org/player"></iframe>' }));
await context.proxyVolkamaxEmbed(volkaToken, {
  writeHead(status, headers) {
    assert.equal(status, 302);
    assert.equal(headers.location, 'https://example.org/player');
  },
  end() {}
}, true);
assert.deepEqual(calls, ['https://bzzh.lat/regarder-la-chaine-test', 'https://volkamax.club/regarder-la-chaine-test']);
console.log('StreamFree, RockyLive, TimStreams, PPV historique et Volkamax : formats, lecteurs et replis OK');
