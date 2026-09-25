import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const server = await readFile(new URL('server.mjs', root), 'utf8');
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
assert.ok(Number(JSON.parse(await readFile(new URL('package.json', root), 'utf8')).version.split('.')[2]) >= 47);
const extract = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
};
const load = (source, name, deps) => new Function(...Object.keys(deps), `${source};return ${name};`)(...Object.values(deps));
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const playerBody = extract(server, 'async function resolveWiTvPlayerOption(', '\nfunction wiTvChannelIdentity');
let pageStatus = 200, hasHls = false;
const player = load(playerBody, 'resolveWiTvPlayerOption', {
  HttpError, AbortSignal, AbortController,
  safeTvRemoteUrl: value => new URL(value), isWiTvPublicPlayer: () => true,
  fetchTvRemote: async () => new Response('<html>player</html>', { status: pageStatus }),
  tvResponseCookieHeader: () => '',
  wiTvStreamCandidatesFromPlayerHtml: () => hasHls ? ['https://cdn.test/live.m3u8'] : [],
  validateWiTvHlsStream: async () => { throw new HttpError(503, 'Private media URL must not leak'); }
});
const item = { url: 'https://witv.football/player/playerjs/witv-player.php?id=1' };
assert.deepEqual((await player(item, 0, 'https://witv.football/channel')).nativeFailure, { stage: 'hls-extraction', status: 0 });
hasHls = true;
const unavailable = await player(item, 0, 'https://witv.football/channel');
assert.equal(unavailable.url, item.url);
assert.deepEqual(unavailable.nativeFailure, { stage: 'hls-validation', status: 503 });
assert.ok(!JSON.stringify(unavailable).includes('Private media URL'));
pageStatus = 403;
assert.deepEqual((await player(item, 0, 'https://witv.football/channel')).nativeFailure, { stage: 'player-page', status: 403 });

let available = false;
const oha = load(extract(server, 'async function resolveOhaStreamReference(', '\nfunction ohaCatalogPublicPageUrl'), 'resolveOhaStreamReference', {
  HttpError, AbortController, setTimeout, clearTimeout,
  decodeTvStateReference: () => ({ root: 'https://kool.ws/live', channelId: 'channel', candidates: [{ url: 'public-stream', channelId: 'channel' }] }),
  tvReferences: new Map(), publicPath: value => value, cleanError: error => error.message,
  resolveSingleOhaCandidate: async () => { if (!available) throw new HttpError(502, 'unavailable'); return { streamUrl: '/hls', serverIndex: 0 }; },
  firstSuccessfulOhaCandidate: async () => { if (!available) throw new HttpError(502, 'unavailable'); return { streamUrl: '/hls', serverIndex: 0 }; },
  ohaOfficialPageCandidates: () => ['https://kool.ws/watch?live=channel'],
  issueTvReference: () => 'bridge',
  ohaWebFallbackOption: () => ({ url: '/oha/embed/bridge', fallback: true, playbackType: 'embed' })
});
const failed = await oha('token');
assert.equal(failed.nativeUnavailable, true);
assert.equal(failed.options[0].manualOnly, true, 'Failed initial native resolution cannot start the web automatically');
await assert.rejects(oha('token', 0), error => error.status === 502, 'Failed selected server must not return the same bridge again');
available = true;
const ready = await oha('token', 0);
assert.equal(ready.options[0].streamUrl, '/hls');
assert.equal(ready.options[1].manualOnly, true);

const timeoutBody = extract(shell, '    if (/^(?:LiveWatch|NorthTV|FrameTV|WiTV|OHA)', '\n    const startHlsJs =');
const schedule = new Function('deps', `with(deps){${timeoutBody}}`);
for (const provider of ['OHA', 'WiTV']) {
  let callback, milliseconds, destroyed = 0, aborted = 0, paused = 0, status;
  schedule({ videoEventSignal: {aborted:false}, playbackProvider: provider, providerFallbackTimer: 0, playbackSequence: 4, tvPlaybackSequence: 4, playbackBecameActive: false, playbackNeedsGesture: false,
    tvStartupStillProgressing: () => false, startupAttemptAt: 0, startupLastProgressAt: 0, tvBufferedSpan: () => 0,
    window: { setTimeout: (fn, ms) => { callback = fn; milliseconds = ms; return 1; } },
    startResolvedOptionFallback: () => false, startProviderWebFallback: () => false,
    tvHls: { destroy: () => { destroyed++; } }, tvVideoEventsController: { abort: () => { aborted++; } },
    video: { pause: () => { paused++; } }, setTvPlaybackStatus: (label, state) => { status = state; }
  });
  assert.equal(milliseconds, 36000); callback();
  assert.equal(destroyed, 1); assert.equal(aborted, 1); assert.equal(paused, 1); assert.equal(status, 'error');
}
const startupEnd = extract(shell, "    if (provider === 'OHA' && result.nativeUnavailable)", '\n  function updateTvCastButton');
assert.match(startupEnd, /setTvPlaybackStatus[\s\S]*?return;/);
assert.match(startupEnd, /options.findIndex\(item => !item.manualOnly\)/);
assert.match(shell, /tvHls && \(playbackBecameActive \|\| !\/\^\(\?:OHA\|WiTV\)\$\/i.test\(playbackProvider\)\)/);
const web = extract(shell, '  function playTvEmbedUrl(', '\n  function resetTvQualitySelector');
assert.match(web, /!item\?\.manualOnly && !tvFailedOptionIndexes.has\(index\)/);
assert.match(web, /wiTvWebFrame && !wiTvPreparedBridge \? 'idle'/);
console.log('v200.0.47: provider isolation, explicit upstream failure, no OHA web loop, bounded startup and safe WiTV diagnostics OK');
