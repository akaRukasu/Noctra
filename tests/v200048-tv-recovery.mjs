import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const server = (await readFile(new URL('server.mjs', root), 'utf8')).replace(/\r\n/g, '\n');
const shell = (await readFile(new URL('public/noctra-shell.js', root), 'utf8')).replace(/\r\n/g, '\n');
const extract = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
};
const load = (source, name, deps = {}) => new Function(...Object.keys(deps), `${source};return ${name};`)(...Object.values(deps));
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const bodyProbe = load(extract(server, 'async function probeTvMediaBody(', '\nfunction tvRecentPlaylistProbeUri'), 'probeTvMediaBody', { HttpError, Buffer, setTimeout, clearTimeout });
const readPlaylist = load(extract(server, 'async function readTvPlaylistBody(', '\nfunction decodeTvWrappedUrl'), 'readTvPlaylistBody', { HttpError, Buffer, setTimeout, clearTimeout });
const urlDeps = { safeTvRemoteUrl: value => new URL(value), resolveTvUrl: (value, base) => new URL(value, base).href };
const recent = load(extract(server, 'function tvRecentPlaylistProbeUri(', '\nasync function validateWiTvHlsStream'), 'tvRecentPlaylistProbeUri', urlDeps);
const segment = Buffer.alloc(188 * 10, 0x47);
let cancelled = 0;
await bodyProbe(new Response(new ReadableStream({ start(c) { c.enqueue(segment); }, cancel() { cancelled++; } })));
assert.equal(cancelled, 1, 'Stop downloading the selected probe after receiving data');
await assert.rejects(bodyProbe(new Response('')), error => error.status === 502);
for (const body of ['<html>upstream error</html>', '{"error":"unavailable"}']) {
  await assert.rejects(bodyProbe(new Response(body, { headers: { 'content-type': 'application/octet-stream' } })), error => error.status === 415);
}
let hangingCancelled = false;
await assert.rejects(bodyProbe(new Response(new ReadableStream({ cancel() { hangingCancelled = true; } })), null, 15), error => error.status === 504);
assert.ok(hangingCancelled, 'HTTP 200 without any bytes must lose the provider race');
const controller = new AbortController();
const cancelledProbe = bodyProbe(new Response(new ReadableStream()), controller.signal);
controller.abort(new Error('cancelled probe'));
await assert.rejects(cancelledProbe, /cancelled probe/);

const validateBody = extract(server, 'async function validateWiTvHlsStream(', '\nasync function resolveWiTvPlayerOption');
const responseAt = (url, body, status = 200, cookie = '') => {
  const response = new Response(body, { status, headers: { 'content-type': 'application/octet-stream', ...(cookie ? { 'set-cookie': cookie } : {}) } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
};
const validateDeps = {
  ...urlDeps, HttpError, AbortSignal, readTvPlaylistBody: readPlaylist, probeTvMediaBody: bodyProbe,
  tvRecentPlaylistProbeUri: recent,
  liveWatchFirstPlaylistUri: recent,
  tvResponseCookieHeader: response => (response.headers.get('set-cookie') || '').split(';')[0],
  mergeTvCookieHeaders: (a, b) => b || a
};
let requests = [];
const validate = load(validateBody, 'validateWiTvHlsStream', {
  ...validateDeps,
  fetchTvRemote: async (value, options) => {
    const url = String(value); requests.push({ url, cookie: options.headers.cookie });
    if (url.endsWith('/master')) return responseAt(url, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000\nvariant', 200, 'root=ok');
    if (url.endsWith('/variant')) return responseAt(url, '#EXTM3U\n#EXTINF:6,\nhttps://segments.test/old\n#EXTINF:6,\nhttps://segments.test/gone\n#EXTINF:6,\nhttps://segments.test/current');
    if (url.endsWith('/gone')) return responseAt(url, '', 404);
    return responseAt(url, segment, 200, 'segment=private');
  }
});
const verified = await validate('https://media.test/master', { cookie: 'initial=ok' }, 8000, null, true);
assert.equal(verified.url, 'https://media.test/master', 'Keep the full ABR master');
assert.equal(verified.cookie, 'root=ok', 'Do not return a segment CDN cookie as a root playlist cookie');
assert.deepEqual(requests.map(r => r.url), ['https://media.test/master', 'https://media.test/variant', 'https://segments.test/gone', 'https://segments.test/current']);
assert.equal(requests[1].cookie, 'root=ok');
assert.ok(requests.slice(2).every(r => r.cookie === undefined), 'No root cookie on another CDN');
let failures = 0;
const unavailable = load(validateBody, 'validateWiTvHlsStream', {
  ...validateDeps,
  fetchTvRemote: async url => {
    if (String(url).endsWith('/master')) return responseAt(url, '#EXTM3U\n#EXTINF:6,\na\n#EXTINF:6,\nb');
    failures++;
    return responseAt(url, '', 410);
  }
});
await assert.rejects(unavailable('https://media.test/master', {}, 8000, null, true), error => error.status === 410);
assert.equal(failures, 2, 'Adjacent segment retry is bounded');

const transportBody = extract(server, 'async function fetchTvRemoteUntilHeaders(', '\nasync function readTvPlaylistBody');
let attempts = 0;
const transport = load(transportBody, 'fetchTvRemoteUntilHeaders', {
  AbortController, AbortSignal, setTimeout, clearTimeout, delay: async () => {},
  fetchTvRemote: async () => { if (++attempts === 1) throw new TypeError('fetch failed'); return new Response(segment); }
});
assert.equal((await transport('https://media.test/segment')).status, 200);
assert.equal(attempts, 2);
attempts = 0;
await assert.rejects(transport('https://media.test/resolve', { method: 'POST' }), TypeError);
assert.equal(attempts, 1, 'Do not replay provider POST requests');

// Exercise the real proxy function with local HTTP streams and disconnects.
let upstreamCancelled = false;
let requestSignal;
const upstream = createServer((req, res) => {
  if (req.url === '/waiting') return;
  res.writeHead(200, { 'content-type': 'video/mp2t' });
  res.write(segment);
  const timer = setInterval(() => res.write(segment), 10);
  res.on('close', () => { clearInterval(timer); upstreamCancelled = true; });
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
const liveTransport = load(transportBody, 'fetchTvRemoteUntilHeaders', {
  AbortController, AbortSignal, clearTimeout, delay,
  // Accelerate only the connection deadline; an active stream must outlive it.
  setTimeout: fn => setTimeout(fn, 70),
  fetchTvRemote: (url, options) => { requestSignal = options.signal; return fetch(url, options); }
});
const references = new Map([
  ['live', { url: upstreamUrl + '/live', headers: {}, expiresAt: Date.now() + 60000 }],
  ['waiting', { url: upstreamUrl + '/waiting', headers: {}, expiresAt: Date.now() + 60000 }]
]);
const proxy = load(extract(server, 'async function proxyTvStream(', '\nasync function readJsonBody'), 'proxyTvStream', {
  ...urlDeps, HttpError, AbortController, tvReferences: references,
  fetchTvRemoteUntilHeaders: liveTransport,
  readTvPlaylistBody: readPlaylist,
  pipeRemoteResponseBody: load(extract(server, 'function pipeRemoteResponseBody(', '\nclass HttpError'), 'pipeRemoteResponseBody', { Readable, pipeline })
});
const relay = createServer((req, res) => {
  void proxy(req.url.slice(1), req, res).catch(() => { if (!res.destroyed) { res.writeHead(502); res.end(); } });
});
await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
try {
  const relayUrl = `http://127.0.0.1:${relay.address().port}`;
  const abort = new AbortController();
  const response = await fetch(relayUrl + '/live', { signal: abort.signal });
  const reader = response.body.getReader();
  assert.ok((await reader.read()).value.byteLength > 0);
  await delay(130);
  assert.ok((await reader.read()).value.byteLength > 0, 'Continuous TV is not cut by a whole-body deadline');
  abort.abort();
  await reader.cancel().catch(() => {});
  await delay(30);
  assert.ok(requestSignal.aborted, 'Client disconnect cancels upstream request');
  assert.ok(upstreamCancelled);
  const stop = new AbortController();
  const pending = fetch(relayUrl + '/waiting', { signal: stop.signal }).catch(error => error);
  await delay(20);
  const waitingSignal = requestSignal;
  stop.abort();
  await pending;
  await delay(20);
  assert.ok(waitingSignal.aborted, 'Zapping also cancels a request still waiting for headers');
} finally {
  relay.closeAllConnections(); upstream.closeAllConnections();
  await Promise.all([new Promise(resolve => relay.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
}

const policies = load(extract(shell, '  function tvHlsLoadPolicies(', '\n  function watchTvPlaybackProgress'), 'tvHlsLoadPolicies');
for (const weak of [false, true]) {
  const config = policies({ weak });
  const fragment = config.fragLoadPolicy.default;
  assert.ok(fragment.maxTimeToFirstByteMs < fragment.maxLoadTimeMs);
  for (const policy of Object.values(config)) {
    const retry = policy.default.errorRetry;
    for (const code of [401, 403, 404, 410, 415, 422, 429]) assert.equal(retry.shouldRetry(retry, 0, false, { code }, true), false);
    assert.equal(retry.shouldRetry(retry, 0, false, { code: 503 }, true), true);
    assert.equal(retry.shouldRetry(retry, retry.maxNumRetry, false, { code: 503 }, true), false);
  }
}
// Verify the vendored HLS engine accepts these policies, not just their shape.
const context = { console, performance, setTimeout, clearTimeout, setInterval, clearInterval, navigator: { userAgent: 'test', onLine: true } };
context.self = context; context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(new URL('public/vendor/hls.min.js', root), 'utf8'), context);
const hls = new context.Hls({ ...policies({ weak: false }), enableWorker: false });
assert.equal(hls.config.fragLoadPolicy.default.maxTimeToFirstByteMs, 10000);
assert.equal(hls.config.fragLoadPolicy.default.errorRetry.maxNumRetry, 3);
hls.destroy();

const failure = load(extract(shell, '  function tvHlsFailurePolicy(', '\n  function tvShouldDownshift'), 'tvHlsFailurePolicy');
assert.equal(failure({ details: 'fragLoadError', response: { code: 404 } }, true, 'OHA').invalid, false);
assert.equal(failure({ details: 'fragLoadError', response: { code: 410 } }, true, 'WiTV').expired, false);
assert.equal(failure({ details: 'manifestLoadError', response: { code: 410 } }, true, 'WiTV').expired, true);

const watch = load(extract(shell, '  function watchTvPlaybackProgress(', '\n  function tvLatestBufferedWindow'), 'watchTvPlaybackProgress');
function fixture() {
  let now = 0, tick, cleared = false, recoveries = 0, bytes = 0, ahead = 0, active = true, managed = false, current = true;
  const controller = new AbortController();
  const video = { currentTime: 1, paused: false, seeking: false, isConnected: true };
  watch({ video, signal: controller.signal, isCurrent: () => current, isActive: () => active, isManagedPause: () => managed,
    downloadedBytes: () => bytes, bufferedAhead: () => ahead, stallDelay: () => 18000, clock: () => now,
    timers: { setInterval(fn) { tick = fn; return 1; }, clearInterval() { cleared = true; } },
    onStall: () => { recoveries++; return recoveries < 2; }
  });
  return { video, controller, advance(ms) { for (let n = 0; n < ms; n += 2000) { now += 2000; if (!cleared) tick(); } },
    get recoveries() { return recoveries; }, get cleared() { return cleared; },
    set bytes(value) { bytes = value; }, set ahead(value) { ahead = value; }, set active(value) { active = value; }, set managed(value) { managed = value; }, set current(value) { current = value; } };
}
const bufferedFreeze = fixture();
bufferedFreeze.ahead = 12;
for (let n = 1; n <= 9; n++) { bufferedFreeze.bytes = n * 1000; bufferedFreeze.advance(2000); }
assert.equal(bufferedFreeze.recoveries, 1, 'A frozen decoder with buffered media must not receive the 90-second network grace');
let f = fixture();
for (let n = 0; n < 3600; n++) { f.video.currentTime += 2; f.bytes = n * 1000; f.advance(2000); }
assert.equal(f.recoveries, 0, 'Two hours of simulated healthy playback trigger no recovery');
f.advance(18000); assert.equal(f.recoveries, 1, 'Detect a silent freeze without waiting/error events');
f.advance(10000); assert.equal(f.recoveries, 1, 'No overlapping recovery loop');
f.advance(10000); assert.equal(f.recoveries, 2); assert.ok(f.cleared);
f = fixture(); f.video.paused = true; f.advance(120000); assert.equal(f.recoveries, 0, 'Respect deliberate pause');
f = fixture(); f.video.paused = true; f.managed = true; f.advance(18000); assert.equal(f.recoveries, 1, 'Automatic rebuffer cannot wait forever');
f = fixture();
for (let n = 1; n <= 40; n++) { f.bytes = n * 1000; f.advance(2000); }
assert.equal(f.recoveries, 0, 'A large segment making download progress is not discarded');
f.advance(16000); assert.equal(f.recoveries, 1);
f = fixture();
for (let n = 1; n <= 44; n++) { f.bytes = n * 1000; f.advance(2000); }
assert.equal(f.recoveries, 0, 'Downloading retains its bounded grace period');
f.bytes = 45000; f.advance(2000);
assert.equal(f.recoveries, 1, 'A frozen picture recovers even while downloads continue');
for (let n = 46; n <= 54; n++) { f.bytes = n * 1000; f.advance(2000); }
assert.equal(f.recoveries, 1, 'Continuing downloads do not create overlapping recoveries');
f.bytes = 55000; f.advance(2000);
assert.equal(f.recoveries, 2); assert.ok(f.cleared);
f = fixture(); f.controller.abort(); f.advance(120000); assert.ok(f.cleared); assert.equal(f.recoveries, 0);
f = fixture(); f.current = false; f.advance(120000); assert.ok(f.cleared); assert.equal(f.recoveries, 0);
f = fixture(); f.active = false; f.advance(120000); assert.equal(f.recoveries, 0, 'Startup is handled by its own deadline');

// Existing API timeout and playback cancellation must both remain effective.
let apiSignal;
const api = load(extract(shell, '  async function api(', '\n\n  function clearApiCache'), 'api', {
  Headers, AbortController, window: { setTimeout, clearTimeout }, jellyfinAccessToken: () => '', appPath: x => x,
  fetch: async (_, options) => {
    apiSignal = options.signal;
    return new Promise((_, reject) => { if (apiSignal.aborted) reject(apiSignal.reason); else apiSignal.addEventListener('abort', () => reject(apiSignal.reason), { once: true }); });
  }
});
const apiController = new AbortController();
const request = api('/api/tv/resolve', { timeoutMs: 5000, signal: apiController.signal });
apiController.abort();
await assert.rejects(request);
assert.ok(apiSignal.aborted, 'Cancelling a previous player cancels its resolver even with a timeout');

// Execute the whole player entry point: wiring, autoplay, renewal and stale replies.
export async function playerFixture(provider, blockedAutoplay = false, { section, weak = false } = {}) {
  const callbacks = new Map();
  let nextTimer = 0, watcher, finishResolve;
  const apiCalls = [];
  class FakeHls {
    static Events = context.Hls.Events;
    static ErrorTypes = context.Hls.ErrorTypes;
    static isSupported() { return true; }
    constructor(config) { this.config = config; this.handlers = new Map(); this.currentLevel = 0; this.autoLevelEnabled = true; this.levels = [{ bitrate: 500000 }, { bitrate: 1500000 }, { bitrate: 4000000 }]; this.capLevelToPlayerSize = true; this.autoLevelCapping = -1; }
    loadSource(url) { this.source = url; }
    attachMedia() {}
    on(name, fn) { this.handlers.set(name, fn); }
    emit(name, data) { this.handlers.get(name)?.(name, data); }
    destroy() { this.destroyed = true; }
    startLoad() {}
  }
  const video = new EventTarget();
  Object.assign(video, { currentTime: 0, paused: true, readyState: 0, isConnected: true,
    parentElement: { querySelector: () => null }, closest: () => null,
    removeAttribute() {}, setAttribute() {}, load() {}, canPlayType: () => '', pause() { this.paused = true; },
    play() { if (blockedAutoplay) return Promise.reject(Object.assign(new Error('gesture required'), { name: 'NotAllowedError' })); this.paused = false; return Promise.resolve(); }
  });
  const document = new EventTarget();
  document.querySelector = selector => selector === '#noctra-tv-video' ? video : null;
  let ahead = 0;
  const deps = {
    document, AbortController, Date,
    window: { Hls: FakeHls, matchMedia: () => ({ matches: true }),
      setTimeout(fn, ms) { callbacks.set(++nextTimer, { fn, ms }); return nextTimer; }, clearTimeout(id) { callbacks.delete(id); },
      setInterval(fn, ms) { callbacks.set(++nextTimer, { fn, ms, interval:true }); return nextTimer; }, clearInterval(id) { callbacks.delete(id); }
    },
    tvShaka: null, tvShakaCleanup: Promise.resolve(), tvShakaBufferedRecoverySequence: -1, tvEnginePreference: 'hls', tvDirectRestart: null,
    tvHls: null, tvVideoEventsController: null, tvWaitingStatusTimer: 0, tvPlaybackSequence: 1,
    tvLiveWatchRefreshSequence: 0, tvLiveWatchRefreshCount: 0, tvLiveWatchLastRefreshAt: 0, tvLiveWatchRecoveryInFlight: false,
    tvResolvedFallbackSequence: 0, tvFailedOptionIndexes: new Set(), noctraBasePath: '',
    tvState: { section, resolvedEmbeds: [{ streamUrl: '/media/original', resolveUrl: '/api/tv/exact-server', playbackType: 'stream', serverIndex: 2, label: 'Exact' }] },
    tvAppleTouchDevice: () => false, tvConnectionProfile: () => ({ weak, desktop: true, resolverTimeout: 28000 }),
    applyTvChannelAutoQuality: load(extract(shell, '  function applyTvChannelAutoQuality(', '\n  function populateTvQualitySelector'), 'applyTvChannelAutoQuality'),
    createTvContinuityGuard: load(extract(shell, '  function createTvContinuityGuard(', '\n  function tvSeekIntoBufferedWindow'), 'createTvContinuityGuard'),
    tvHlsLoadPolicies: policies, tvHlsFailurePolicy: failure, tvShouldDownshift: () => false,
    watchTvPlaybackProgress: args => { watcher = args; },
    tvBufferedAhead: () => ahead, tvBufferedSpan: () => ahead, tvSkipBufferedGap: () => false,
    tvStartupStillProgressing: load(extract(shell, '  function tvStartupStillProgressing(', '\n  function tvAchievableBufferGoal'), 'tvStartupStillProgressing'),
    tvLatestBufferedWindow: () => ahead > 0 ? { start: 0, end: ahead, duration: ahead } : null,
    tvStartupBufferGoal: load(extract(shell, '  function tvAchievableBufferGoal(', '\n  function tvHlsFailurePolicy'), 'tvStartupBufferGoal'),
    tvSeekIntoBufferedWindow: () => false, tvAchievableBufferGoal: load(extract(shell, '  function tvAchievableBufferGoal(', '\n  function tvHlsFailurePolicy'), 'tvAchievableBufferGoal'),
    appPath: x => x, ensureHlsLibrary: async () => {}, benignTvPlayInterruption: () => false,
    api: (url, options) => { apiCalls.push({ url, options }); return new Promise(resolve => { finishResolve = resolve; }); },
    tvPlaybackElapsedMs: () => 0
  };
  for (const name of ['refreshTvDesktopLiveControls', 'refreshTvLiveEdgeControl', 'updateTvCastButton', 'refreshTvSafeToolsMenu',
    'recordTvDiagnostic', 'setTvPlaybackStatus', 'refreshTvDesktopLiveState', 'scheduleTvLiveEdgeControl', 'syncTvFullscreenUi',
    'showTvDesktopLiveControls', 'scheduleTvDesktopControlsHide', 'populateTvQualitySelector', 'toast', 'renderTvStreamOptions']) deps[name] = () => {};
  deps.installTvShakaContinuity = new Function('deps', `with(deps) { return ${extract(shell, '  function installTvShakaContinuity(', '\n  function tvSafeBufferedAhead')}; }`)(deps);
  const start = new Function('deps', `with(deps) { return ${extract(shell, '  async function playTvDirectStream(', '\n  async function playTvResolvedOption')}; }`)(deps);
  const channel = { provider, resolverUrl: '/api/tv/channel' };
  await start(channel, '/media/original', '', 1, 0);
  return { deps, callbacks, video, get watcher() { return watcher; }, apiCalls, get finishResolve() { return finishResolve; }, set ahead(value) { ahead = value; } };
}
for (const provider of ['WiTV', 'OHA', 'StreamSports99']) {
  const p = await playerFixture(provider, true);
  assert.equal(p.deps.tvHls.config.fragLoadPolicy.default.errorRetry.maxNumRetry, 3);
  p.ahead = 12;
  p.deps.tvHls.emit(context.Hls.Events.FRAG_BUFFERED, { frag: { duration: 6, level: 0 } });
  await Promise.resolve();
  const startupDeadline = [...p.callbacks.values()].find(t => t.ms >= 36000);
  assert.ok(startupDeadline);
  startupDeadline.fn();
  assert.ok(!p.deps.tvHls.destroyed, 'A blocked autoplay keeps the prepared media for the user');
  p.deps.tvVideoEventsController.abort();
}
const p = await playerFixture('WiTV');
p.video.paused = false;
p.video.dispatchEvent(new Event('playing'));
assert.ok(p.watcher.isActive());
p.watcher.onStall();
assert.equal(p.apiCalls.length, 0, 'First freeze retries the same HLS stream before URL renewal');
p.watcher.onStall();
assert.equal(p.apiCalls.length, 1);
assert.match(p.apiCalls[0].url, /^\/api\/tv\/exact-server\?refresh=1/, 'Silent freeze renews the selected WiTV server');
const oldHls = p.deps.tvHls;
p.deps.tvPlaybackSequence++;
p.deps.tvVideoEventsController.abort();
assert.ok(p.apiCalls[0].options.signal.aborted);
p.finishResolve({ options: [{ streamUrl: '/media/stale', playbackType: 'stream' }] });
await Promise.resolve(); await Promise.resolve();
assert.equal(p.deps.tvHls, oldHls, 'A resolver result from an old selection cannot replace the current player');
console.log('v200.0.48: real media bytes, recent segment retry, cookie boundaries, live relay/disconnects, HLS 1.7.1 policies, frozen playback and API cancellation OK');
