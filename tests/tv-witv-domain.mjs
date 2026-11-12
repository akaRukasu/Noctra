import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseWiTvPublishedPlayers, wiTvPublishedMedia, wiTvRequestHeaders } from '../lib/witv-public.mjs';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = (start, end) => {
  const first = server.indexOf(start);
  const last = server.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  return server.slice(first, last);
};
const load = (source, name, deps) =>
  new Function(...Object.keys(deps), `${source}; return ${name};`)(...Object.values(deps));
const page = 'https://witv.eu/chaines-live/generaliste/';
const card = (link, name, logo) => `<div class="ann-short_item">
  <span class="badge badge-red">Live</span>
  <a href="${link}">Regarder</a>
  <div class="ann-short_price">${name}</div>
  <img class="poster" src="${logo}" alt="Texte secondaire">
</div>`;
const tf1 = card('/chaines-live/2-tf1.html', 'TF1', '/images/logo/tf1.png');
const canal = card('https://witv.eu/chaines-live/3-canal.html', 'CANAL &#43;', '/images/logo/canal.png');
const outside = card('https://unrelated.example/chaines-live/4-tf1.html', 'Autre site', '/logo.png');
const refs = new Map();
const deps = {
  safeTvRemoteUrl: value => new URL(value),
  resolveTvUrl: (value, base) => new URL(value, base).href,
  encodeTvStateReference: (kind, state) => { const ref = String(refs.size + 1); refs.set(ref, { kind, ...state }); return ref; }
};
const parse = load(extract('function decodeTvHtml(', '\nfunction tvIframeCandidatesFromHtml'), 'parseWiTvCategoryHtml', { ...deps, createHash });
const channels = parse(tf1 + canal + outside + tf1, page, 'Généraliste');
assert.deepEqual(channels.map(({ name, logo, externalUrl }) => [name, logo, externalUrl]), [
  ['CANAL +', 'https://witv.eu/images/logo/canal.png', 'https://witv.eu/chaines-live/3-canal.html'],
  ['TF1', 'https://witv.eu/images/logo/tf1.png', 'https://witv.eu/chaines-live/2-tf1.html']
]);
assert.equal(refs.get(channels[1].resolverUrl.split('/').at(-1)).referer, page);

const requests = [];
const catalog = load(extract('const wiTvCategories', '\nfunction stripTvHtml'), 'tvCatalogFromWiTv', {
  ...deps, wiTvRoot: 'https://witv.eu/', tvCatalogCache: new Map(), parseWiTvCategoryHtml: parse,
  fetchTvRemote: async url => {
    requests.push(url);
    return new Response(url === page ? tf1 : '<html>Maintenance</html>');
  }
});
const result = await catalog();
assert.equal(requests.length, 9);
assert.ok(requests.every(url => url.startsWith('https://witv.eu/chaines-live/')));
assert.equal(result.count, 1);
assert.match(result.warning, /Catalogue partiel/);

const tab = (n, title) => `<span class="player-tab" data-target="player${n}"><i class="icon"></i>${title}</span>`;
const selector = tab(1, 'Source 1') + tab(2, 'Source 2') + tab(2, 'Doublon') +
  '<span class="player-tab player-reload-btn">Recharger</span>' +
  '<div class="player-content" data-v="wt1_opaque"></div>';
const resolve = load(extract('function wiTvOfficialTabOptions(', '\nconst wiTvCategories'), 'resolveTvPageReference', {
  ...deps, publicPath: value => value, tvReferences: new Map(),
  decodeTvStateReference: (token, kind) => refs.get(token)?.kind === kind ? refs.get(token) : null,
  fetchTvRemote: async () => new Response(selector),
  parseWiTvPublishedPlayers,
  tvIframeCandidatesFromHtml: () => [], isWiTvPublicPlayer: () => false,
  decodeTvHtml: value => value
});
const resolved = await resolve(channels[1].resolverUrl.split('/').at(-1));
assert.equal(resolved.officialPageOnly, true);
assert.equal(resolved.nativeUnavailable, true);
assert.equal(resolved.externalUrl, channels[1].externalUrl);
assert.ok(resolved.options.length && resolved.options.every(option => option.manualOnly && !option.streamUrl));
assert.deepEqual(resolved.options.filter(option => option.playbackType === 'external').map(option =>
  [option.sourceLabel, option.serverIndex, new URL(option.url).hash]), [
  ['Source 1', 0, '#player1'], ['Source 2', 1, '#player2']
]);
assert.deepEqual(resolved.embeds, []);

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const start = shell.indexOf('async function playTvResolvedOption(');
const end = shell.indexOf('\n  }', start) + 4;
const opened = [];
const playOption = load(shell.slice(start, end), 'playTvResolvedOption', {
  tvPlaybackSequence: 1, tvOptionSequence: 0, document: { querySelectorAll: () => [] },
  window: { open: url => opened.push(url) }, setTvPlaybackStatus: () => {},
  playTvEmbedUrl: () => assert.fail('An external source must not be framed')
});
const external = resolved.options[0];
await playOption({ provider: 'WiTV' }, external, 0, 1, false);
assert.deepEqual(opened, []);
await playOption({ provider: 'WiTV' }, external, 0, 1, true);
assert.deepEqual(opened, [external.url]);
console.log('WiTV · domaine, cartes, options distinctes, ouverture manuelle et catalogue partiel : OK');

const channelPage = 'https://witv.eu/chaines-live/2-tf1.html';
const publicMap = { wt1_first: '/player/source2/?id=one', wt1_second: '/player/source2/?id=two',
  wt1_third: 'https://other.example/player/source2/?id=three' };
const data = `public|salt|${Buffer.from(JSON.stringify(publicMap)).toString('base64')}`;
const encoded = [...data].map(character => character.charCodeAt(0) ^ 49).join(',');
const publishedHtml = selector + tab(3, 'Source 3') +
  '<div id="player1" data-v="wt1_first"></div><div id="player2" data-v="wt1_second"></div>' +
  '<div id="player3" data-v="wt1_third"></div>' +
  `<script>var _a=[${encoded}],_m=49,_in=7;</script>`;
const published = parseWiTvPublishedPlayers(publishedHtml, channelPage);
assert.deepEqual(published.map(item => [item.label, item.url]), [
  ['Source 1', 'https://witv.eu/player/source2/?id=one'],
  ['Source 2', 'https://witv.eu/player/source2/?id=two']
]);
assert.deepEqual(parseWiTvPublishedPlayers(publishedHtml, 'https://other.example/'), []);
assert.deepEqual(parseWiTvPublishedPlayers('var _a=[999999],_m=49;', channelPage), []);
const streamPath = '/player/source2/?vp=public-media&tk=temporary&vc=channel';
const payload = [...Buffer.from(streamPath).toString('base64')].reverse().join('');
assert.deepEqual(wiTvPublishedMedia(`var m3u8Url='/?vc=notice';var _wtPayload="${payload}";`, published[0].url),
  ['https://witv.eu' + streamPath]);
assert.deepEqual(wiTvPublishedMedia('var _wtPayload="dG9uIGEgdXJs";', published[0].url), []);
const hlsHeaders = { origin: 'https://witv.eu', referer: published[0].url };
assert.equal(wiTvRequestHeaders(new URL(published[0].url), {})['sec-fetch-dest'], 'iframe');
const childHeaders = wiTvRequestHeaders(new URL('https://cdn.example' + streamPath), hlsHeaders);
assert.equal(childHeaders['sec-fetch-mode'], 'cors');
assert.equal(childHeaders['sec-fetch-site'], 'cross-site');
assert.deepEqual(wiTvRequestHeaders(new URL('https://cdn.example/other-stream'), hlsHeaders), hlsHeaders);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const validate = load(extract('async function validateWiTvHlsStream(', '\nasync function resolveWiTvPlayerOption'), 'validateWiTvHlsStream', {
  ...deps, HttpError, tvResponseCookieHeader: () => '', mergeTvCookieHeaders: () => '',
  fetchTvRemote: async () => new Response('#EXTM3U\n#EXTINF:5,\nnotice.ts\n#EXT-X-ENDLIST'),
  readTvPlaylistBody: response => response.text()
});
await assert.rejects(validate('https://witv.eu' + streamPath), error => error.status === 502);
console.log('WiTV · lecteurs dynamiques, média publié, bornes des données et en-têtes du relais CDN : OK');
