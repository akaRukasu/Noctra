import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const server = await readFile(new URL('server.mjs', root), 'utf8');
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
assert.ok(Number(JSON.parse(await readFile(new URL('package.json', root), 'utf8')).version.split('.')[2]) >= 46);
const extract = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
};
const load = (source, name, deps) => new Function(...Object.keys(deps), `${source};return ${name};`)(...Object.values(deps));
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const urlDeps = { safeTvRemoteUrl: value => new URL(value), resolveTvUrl: (value, base) => new URL(value, base).href };
const recent = load(extract(server, 'function tvRecentPlaylistProbeUri(', '\nasync function validateWiTvHlsStream'), 'tvRecentPlaylistProbeUri', urlDeps);
assert.equal(recent('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000\nhigh\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow', 'https://media.test/master'), 'https://media.test/low');
assert.equal(recent('#EXTM3U\n#EXTINF:6,\nexpired.ts\n#EXTINF:6,\nrecent.ts\n#EXTINF:6,\nnew.ts', 'https://media.test/live'), 'https://media.test/recent.ts');
assert.equal(recent('#EXTM3U\n#EXTINF:6,\nonly.ts', 'https://media.test/live'), 'https://media.test/only.ts');
assert.equal(recent('#EXTM3U\n#EXT-X-GAP\n#EXTINF:6,\nmissing.ts', 'https://media.test/live'), '');
const readPlaylist = load(extract(server, 'async function readTvPlaylistBody(', '\nfunction decodeTvWrappedUrl'), 'readTvPlaylistBody', { HttpError, Buffer, setTimeout, clearTimeout });
const bodyProbe = load(extract(server, 'async function probeTvMediaBody(', '\nfunction tvRecentPlaylistProbeUri'), 'probeTvMediaBody', { HttpError, Buffer, setTimeout, clearTimeout });
const mediaRequests = [];
const validate = load(extract(server, 'async function validateWiTvHlsStream(', '\nasync function resolveWiTvPlayerOption'), 'validateWiTvHlsStream', {
  ...urlDeps, HttpError, AbortSignal, tvRecentPlaylistProbeUri: recent, readTvPlaylistBody: readPlaylist, probeTvMediaBody: bodyProbe,
  tvResponseCookieHeader: () => '', mergeTvCookieHeaders: (a, b) => b || a,
  liveWatchFirstPlaylistUri: () => { throw Error('Old-segment probe must not be used here'); },
  fetchTvRemote: async value => {
    const url = String(value); mediaRequests.push(url);
    if (url.endsWith('/expired.ts')) return new Response('', { status: 404 });
    return new Response(url.endsWith('/master') ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nvariant'
      : url.endsWith('/variant') ? '#EXTM3U\n#EXTINF:6,\nexpired.ts\n#EXTINF:6,\nrecent.ts\n#EXTINF:6,\nnew.ts' : 'segment bytes',
    { headers: { 'content-type': 'application/octet-stream' } });
  }
});
assert.equal((await validate('https://media.test/master', {}, 8000, null, true)).url, 'https://media.test/master', 'Keep original ABR master for playback');
assert.deepEqual(mediaRequests, ['https://media.test/master', 'https://media.test/variant', 'https://media.test/recent.ts']);

// Real WiTV player function: a fast candidate wins, a blocked candidate is cancelled.
let probeSignals = [], sentCookies = [];
const playerBody = extract(server, 'async function resolveWiTvPlayerOption(', '\nfunction wiTvChannelIdentity');
const player = load(playerBody, 'resolveWiTvPlayerOption', {
  ...urlDeps, HttpError, AbortController, AbortSignal,
  isWiTvPublicPlayer: url => new URL(url).hostname === 'witv.football',
  tvResponseCookieHeader: () => 'private=player-session',
  fetchTvRemote: async () => new Response('<html>player</html>'),
  wiTvStreamCandidatesFromPlayerHtml: () => ['https://cdn.test/slow.m3u8', 'https://cdn.test/fast.m3u8'],
  validateWiTvHlsStream: async (url, headers, timeout, signal, recentSegments) => {
    assert.equal(recentSegments, true); probeSignals.push(signal); sentCookies.push(headers.cookie);
    if (url.includes('slow')) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }));
    return { url, cookie: '' };
  },
  issueTvReference: url => url.endsWith('fast.m3u8') ? 'fast' : 'unexpected',
  tvPublicStreamUrl: token => `/media/${token}`
});
const native = await player({ url: 'https://witv.football/player/playerjs/witv-player.php?id=1', label: 'Serveur 2' }, 1, 'https://witv.football/channel');
assert.equal(native.streamUrl, '/media/fast'); assert.equal(native.verified, true); assert.equal(native.serverIndex, 1);
assert.ok(probeSignals.every(signal => signal.aborted));
assert.ok(sentCookies.every(cookie => cookie === undefined), 'Do not send WiTV page cookies to an unrelated CDN');

// Real page resolver: native first, no eager cross-provider lookup, exact player renewal.
const states = new Map([['page', { kind: 'witv-page', url: 'https://witv.football/channel', name: 'Example TV' }]]);
const players = [0, 1].map(index => ({ url: `https://witv.football/player/playerjs/witv-player.php?id=${index}`, label: `Serveur ${index + 1}` }));
let backupCalls = 0, selectedUrls = [], activeAvailable = true, raceSignals = [];
const resolve = load(extract(server, 'async function resolveTvPageReference(', '\nconst wiTvCategories'), 'resolveTvPageReference', {
  ...urlDeps, HttpError, AbortSignal, AbortController, publicPath: value => value,
  decodeTvStateReference: (token, kind) => states.get(token)?.kind === kind ? states.get(token) : null,
  encodeTvStateReference: (kind, state) => { const token = `t${states.size}`; states.set(token, { ...state, kind }); return token; },
  tvReferences: new Map(), isWiTvPublicPlayer: () => true,
  fetchTvRemote: async () => new Response('<html>channel</html>'),
  tvIframeCandidatesFromHtml: () => players,
  resolveWiTvPlayerOption: async (item, index, page, signal) => {
    selectedUrls.push(item.url);
    if (signal) raceSignals.push(signal);
    if (!activeAvailable) return { label: item.label, url: item.url };
    if (signal && index === 0) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }));
    return { streamUrl: `/stream/${index}`, playbackType: 'stream', label: item.label, serverIndex: index, verified: true };
  },
  wiTvNoctraFallbackOption: async () => { backupCalls++; return { streamUrl: '/fstv', label: 'Secours Noctra · FSTV', providerFallback: 'FSTV' }; },
  verifiedLiveWatchNamedFallbackOptions: async () => { throw Error('Must not search LiveWatch while WiTV/FSTV works'); },
  tvPublicEmbedUrl: token => `/embed/${token}`
});
const result = await resolve('page');
assert.equal(result.options[0].streamUrl, '/stream/1'); assert.equal(backupCalls, 0);
assert.ok(raceSignals.every(signal => signal.aborted));
assert.equal(result.options[1].playbackType, 'resolver', 'Keep the other WiTV HLS lazy and ahead of backups');
assert.ok(result.options.filter(option => option.providerFallback).every(option => option.manualOnly));
assert.ok(result.options.some(option => option.url && option.officialClient && !option.manualOnly));
selectedUrls = [];
await resolve(result.options[0].resolveUrl.split('/').at(-1));
assert.deepEqual(selectedUrls, [players[1].url], 'Refresh the exact working player, not another source/CABLE');
await resolve(result.options.find(option => option.providerFallback).resolveUrl.split('/').at(-1));
assert.equal(backupCalls, 1, 'Search FSTV only when its fallback is requested');
activeAvailable = false;
await assert.rejects(resolve(result.options[0].resolveUrl.split('/').at(-1)), error => error.status === 502);
const failed = await resolve('page');
assert.equal(failed.options[0].url, players[0].url); assert.equal(backupCalls, 1, 'No hidden backup work during failed native scan');

// Real OHA root race: the configured root hangs, its mirror can still win.
const ohaRequests = [], ohaSignals = [];
const oha = load(extract(server, 'async function resolveSingleOhaCandidate(', '\nasync function firstSuccessfulOhaCandidate'), 'resolveSingleOhaCandidate', {
  ...urlDeps, HttpError, AbortController, AbortSignal, setTimeout, clearTimeout,
  ohaRootAlternatives: () => ['https://kool.ws/live', 'http://185.254.196.78/live', 'https://oha.cx/live'],
  ohaRequestBody: (kind, value) => value, ohaProviderHttpError: () => null,
  fetchTvRemote: async (url, options) => {
    ohaRequests.push(url); ohaSignals.push(options.signal);
    assert.equal(JSON.parse(options.body).url, 'provider-specific-stream');
    if (url.includes('kool.ws')) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }));
    assert.equal(options.headers.origin, 'http://185.254.196.78');
    return new Response(JSON.stringify({ streamUrl: 'https://cdn.test/master' }));
  },
  ohaResolvedStreamUrl: payload => payload.streamUrl,
  validateWiTvHlsStream: async (url, headers, timeout, signal, recentSegments) => {
    assert.equal(recentSegments, true); assert.equal(headers.referer, 'http://185.254.196.78/live');
    return { url, cookie: '' };
  },
  issueTvReference: () => 'verified', tvPublicStreamUrl: token => `/media/${token}`
});
assert.equal((await oha({ meta: { root: 'https://kool.ws/live' }, headers: {} }, { url: 'provider-specific-stream' }, 2)).serverIndex, 2);
assert.equal(ohaRequests.length, 2, 'Cancel delayed third mirror when second is ready');
assert.ok(ohaSignals.every(signal => signal.aborted), 'Cancel the hanging mirror');

const rankBody = extract(shell, '      const rank = ({ item, index }) => {', '\n      candidates.sort');
const rank = load(rankBody, 'rank', { playbackProvider: 'WiTV', optionIndex: 0, liveWatchFamily: false });
assert.ok(rank({ item: { resolveUrl: '/same-provider' }, index: 2 }) < rank({ item: { streamUrl: '/fstv', providerFallback: 'FSTV' }, index: 1 }));
assert.match(shell, /if \(\/\^WiTV\$\/i\.test\(playbackProvider\)\) return startResolvedOptionFallback\(reason\)/);
const mergeBody = extract(shell, '          const keepWiTvChoices =', '\n          tvState.resolvedEmbeds = playbackOptions;');
const choices = [{ streamUrl: '/old', resolveUrl: '/exact' }, { resolveUrl: '/backup', providerFallback: 'FSTV' }];
const merge = load(mergeBody, '{ playbackOptions, playbackIndex }', {
  provider: 'WiTV', freshOptions: [{ streamUrl: '/renewed' }], tvState: { resolvedEmbeds: choices }, optionIndex: 0, directIndex: 0
});
assert.equal(merge.playbackOptions[0].streamUrl, '/renewed');
assert.equal(merge.playbackOptions[0].resolveUrl, '/exact');
assert.equal(merge.playbackOptions[1], choices[1], 'Renewal retains untried WiTV and external backups');
assert.equal(merge.playbackIndex, 0);
console.log('v200.0.46: WiTV lazy fallbacks, exact-player renewal, first-ready native and OHA mirrors, recent-segment probes OK');
