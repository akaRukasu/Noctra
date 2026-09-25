import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const server = await readFile(new URL('server.mjs', root), 'utf8');
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const version = JSON.parse(await readFile(new URL('package.json', root), 'utf8')).version;
assert.ok(/^200\.0\.\d+$/.test(version) && Number(version.split('.')[2]) >= 45);
assert.ok(shell.includes(`NOCTRA_BUILD_VERSION = '${version}'`));
assert.ok((await readFile(new URL('public/noctra-sw.js', root), 'utf8')).includes(`noctra-shell-v200-r${version.split('.')[2]}`));
const extract = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
};
const load = (source, name, deps) => new Function(...Object.keys(deps), `${source};return ${name};`)(...Object.values(deps));
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const readPlaylist = load(extract(server, 'async function readTvPlaylistBody(', '\nfunction decodeTvWrappedUrl'), 'readTvPlaylistBody', { HttpError, Buffer, setTimeout, clearTimeout });
const bodyProbe = load(extract(server, 'async function probeTvMediaBody(', '\nfunction tvRecentPlaylistProbeUri'), 'probeTvMediaBody', { HttpError, Buffer, setTimeout, clearTimeout });
assert.match(extract(server, 'async function proxyTvStream(', '\nasync function readJsonBody'), /await readTvPlaylistBody\(response\)/);
assert.match(extract(server, 'async function proxyOhaHttp(', '\nasync function proxyTvStream'), /await readTvPlaylistBody\(response\)/);
assert.equal(await readPlaylist(new Response('#EXTM3U\n#EXTINF:6,\nseg.ts')), '#EXTM3U\n#EXTINF:6,\nseg.ts');
await assert.rejects(readPlaylist(new Response('<html>not found</html>')), error => error.status === 415);
await assert.rejects(readPlaylist(new Response('#EXTM3UX\ninvalid')), error => error.status === 415);
let cancelledBody = false;
await assert.rejects(readPlaylist(new Response(new ReadableStream({ cancel() { cancelledBody = true; } })), 10), error => error.status === 504);
assert.equal(cancelledBody, true, 'A stalled manifest body is cancelled');
await assert.rejects(readPlaylist(new Response('#EXTM3U\n' + 'x'.repeat(2 * 1024 * 1024))), error => error.status === 413);

const transportBody = extract(server, 'async function fetchTvRemoteUntilHeaders(', '\nasync function readTvPlaylistBody');
let calls = 0, cancelled503 = false;
const transport = load(transportBody, 'fetchTvRemoteUntilHeaders', {
  AbortController, AbortSignal, setTimeout, clearTimeout, delay: async () => {},
  fetchTvRemote: async () => ++calls === 1
    ? { status: 503, headers: new Headers(), body: { cancel: async () => { cancelled503 = true; } } }
    : new Response('segment')
});
assert.equal((await transport('https://media.test/segment')).status, 200);
assert.equal(calls, 2); assert.equal(cancelled503, true);
for (const status of [401, 403, 404, 429]) {
  let attempts = 0;
  const noRetry = load(transportBody, 'fetchTvRemoteUntilHeaders', {
    AbortController, AbortSignal, setTimeout, clearTimeout, delay: async () => {},
    fetchTvRemote: async () => { attempts++; return new Response('', { status }); }
  });
  assert.equal((await noRetry('https://media.test/segment')).status, status);
  assert.equal(attempts, 1, `No hidden retry for HTTP ${status}`);
}

const inherited = load(extract(server, 'function tvChildReferenceHeaders(', '\nfunction issueStableProviderChildReference'), 'tvChildReferenceHeaders', {});
const children = [];
const rewrite = load(extract(server, 'function rewriteTvPlaylist(', '\nfunction detectTvImageMime'), 'rewriteTvPlaylist', {
  warmTvSegments: () => {},
  HttpError, resolveTvUrl: (value, base) => new URL(value, base).href,
  tvChildReferenceHeaders: inherited,
  issueStableProviderChildReference: (url, headers, provider, forceHls) => { children.push({ url, headers, provider, forceHls }); return String(children.length); },
  tvPublicStreamUrl: token => `/stream/${token}`
});
await assert.rejects(async () => rewrite('Not found', 'https://kool.ws/live', {}, { provider: 'OHA' }), error => error.status === 415);
rewrite('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio?id=1"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvariant?id=2\n', 'https://media.test/master', { origin: 'https://kool.ws', cookie: 'local=test' }, { provider: 'OHA' });
assert.ok(children.every(child => child.forceHls), 'Extensionless child playlists are explicitly typed');
assert.equal(children[1].headers.origin, 'https://kool.ws');
children.length = 0;
rewrite('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXT-X-MAP:URI="init"\n#EXTINF:6,\nhttps://other.test/segment\n', 'https://media.test/variant', { origin: 'https://kool.ws', cookie: 'local=test', authorization: 'private' }, { provider: 'OHA' });
assert.ok(children.every(child => !child.forceHls), 'Keys and segments must not be treated as playlists');
assert.equal(children[2].headers.cookie, undefined);
assert.equal(children[2].headers.authorization, undefined);

const feeds = [{ url: 'https://player.test/slow', label: 'Slow' }, { url: 'https://player.test/fast', label: 'Fast' }];
let signals = [], selectedCalls = [];
const eventBody = extract(server, 'async function resolveStreamSports99EventReference(', '\nasync function resolveStreamSports99ChannelReference');
const eventResolver = load(eventBody, 'resolveStreamSports99EventReference', {
  decodeTvStateReference: () => ({ feeds }), HttpError, AbortController, setTimeout, clearTimeout, publicPath: x => x,
  streamSports99VerifiedOption: async (url, label, index, signal) => {
    selectedCalls.push(index); signals.push(signal);
    if (index === 0) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }));
    return { streamUrl: '/media/fast', serverIndex: index, label, playbackType: 'stream' };
  }
});
const eventResult = await eventResolver('test');
assert.equal(eventResult.options[0].streamUrl, '/media/fast');
assert.equal(eventResult.options[1].resolveUrl, '/api/tv/streamsports99/resolve/test?server=0');
assert.equal(eventResult.activeServer, 1);
assert.ok(signals.every(signal => signal.aborted), 'Slow siblings are cancelled after first success');
selectedCalls = [];
await eventResolver('test', 1);
assert.deepEqual(selectedCalls, [1], 'A selected server refresh does not race unrelated feeds');
await assert.rejects(eventResolver('test', 9), error => error.status === 400);

const firstUri = load(extract(server, 'function liveWatchFirstPlaylistUri(', '\nasync function liveWatchProbeResponse'), 'liveWatchFirstPlaylistUri', {
  safeTvRemoteUrl: value => new URL(value), resolveTvUrl: (value, base) => new URL(value, base).href
});
const validateBody = extract(server, 'async function validateWiTvHlsStream(', '\nasync function resolveWiTvPlayerOption');
const requested = [];
let invalidRoot = false;
const validate = load(validateBody, 'validateWiTvHlsStream', {
  HttpError, AbortSignal, safeTvRemoteUrl: value => new URL(value), readTvPlaylistBody: readPlaylist, probeTvMediaBody: bodyProbe,
  tvRecentPlaylistProbeUri: firstUri,
  liveWatchFirstPlaylistUri: firstUri, mergeTvCookieHeaders: (a, b) => b || a, tvResponseCookieHeader: () => '',
  fetchTvRemote: async (url, options) => {
    requested.push(url);
    assert.equal(options.headers.origin, 'https://kool.ws');
    const body = invalidRoot ? '{"error":"not a stream"}' : url.endsWith('/master')
      ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvariant'
      : url.endsWith('/variant') ? '#EXTM3U\n#EXTINF:6,\nsegment' : 'binary segment';
    return new Response(body, { headers: { 'content-type': 'application/octet-stream' } });
  }
});
assert.equal((await validate('https://media.test/master', { origin: 'https://kool.ws' })).url, 'https://media.test/master');
assert.deepEqual(requested, ['https://media.test/master', 'https://media.test/variant', 'https://media.test/segment']);
invalidRoot = true;
await assert.rejects(validate('https://media.test/master', { origin: 'https://kool.ws' }), error => error.status === 415);

const failure = load(extract(shell, '  function tvHlsFailurePolicy(', '\n  function tvShouldDownshift'), 'tvHlsFailurePolicy', {});
assert.equal(failure({ details: 'manifestParsingError' }, false, 'OHA').invalid, true);
assert.equal(failure({ response: { code: 415 } }, false, 'OHA').invalid, true);
assert.equal(failure({ response: { code: 403 } }, false, 'OHA').expired, true);
assert.equal(failure({ response: { code: 503 } }, false, 'OHA').limit, 1);
assert.equal(failure({ response: { code: 503 } }, true, 'FrameTV').limit, 2);
const downshift = load(extract(shell, '  function tvShouldDownshift(', '\n  function tvLatestBufferedWindow'), 'tvShouldDownshift', {});
assert.equal(downshift(3, 6, 5500, true, 2), true);
assert.equal(downshift(3, 6, 5500, false, 2), false, 'Do not override manual quality');
assert.equal(downshift(12, 6, 5500, true, 2), false);
assert.equal(downshift(3, 6, 500, true, 2), false);
assert.equal(downshift(3, 6, 5500, true, 0), false);
const refresh = extract(shell, '    const refreshResolvedStream =', '\n    if (/^(?:LiveWatch|NorthTV|FrameTV|WiTV|OHA)');
assert.doesNotMatch(refresh, /stopLoad/);
assert.match(refresh, /previousOption.resolveUrl \|\| channel.resolverUrl/);
assert.match(refresh, /videoEventSignal.aborted/);
assert.match(shell, /result.options.filter\(item => item\?\.url \|\| item\?\.streamUrl \|\| item\?\.resolveUrl\)/);
assert.match(shell, /repeatedStall && playbackBecameActive && adaptiveRebufferCycles >= 1/);
assert.match(shell, /activeLevel > 0 && tvHls.autoLevelEnabled/);
assert.ok(shell.indexOf("startResolvedOptionFallback('serveur FrameTV interrompu')") < shell.indexOf('if (refreshResolvedStream(provider)) return;', shell.indexOf('tvHls.on(window.Hls.Events.ERROR')));

// Retain the v44 generated-script regression, independently of old version pins.
const sanitize = load(extract(server, 'function sanitizeOhaPlayerHtml(', '\nasync function proxyOhaEmbed'), 'sanitizeOhaPlayerHtml', { publicPath: x => x });
const html = sanitize('<html><head></head><body></body></html>', 'https://kool.ws/watch?live=300113394ceebba66c8ad', 'test');
for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(script[1]));
console.log('v200.0.45: manifest validation, opaque routes, bounded retries, first-ready sports and buffer policy OK');
