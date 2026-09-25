import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const server = await readFile(new URL('server.mjs', root), 'utf8');
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
assert.equal(pkg.version, '200.0.44');
assert.match(server, /version: '200\.0\.44'/);
assert.match(shell, /NOCTRA_BUILD_VERSION = '200\.0\.44'/);
assert.match(await readFile(new URL('public/noctra-sw.js', root), 'utf8'), /noctra-shell-v200-r44/);
assert.match(await readFile(new URL('public/client/index.html', root), 'utf8'), /noctra-shell\.js\?v=200\.44/);
const controls = shell.slice(shell.indexOf('<div class="noctra-tv-desktop-live-controls"'), shell.indexOf('<div class="noctra-tv-desktop-live-controls"') + 2400);
assert.ok(controls.indexOf('data-tv-live-pip') < controls.indexOf('data-tv-safe-theater'));
assert.ok(controls.indexOf('data-tv-safe-theater') < controls.indexOf('data-tv-live-fullscreen'));
assert.match(shell, /event\.target\.closest\('button\[data-tv-safe-theater\]'\)/);
const extract = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Function not found: ${start}`);
  return source.slice(from, to);
};
const load = (body, name, deps = {}) => new Function(...Object.keys(deps), `${body}; return ${name};`)(...Object.values(deps));
const urlDeps = { safeTvRemoteUrl: value => new URL(value), ohaAllowedHost: value => ['kool.ws', 'kool.to', 'oha.cx', '185.254.196.78'].includes(new URL(value).hostname) };
const watch = load(extract(server, 'function ohaWatchRouteFromValue(', '\nfunction ohaRouteCandidatesFromValue'), 'ohaWatchRouteFromValue', urlDeps);
const routes = load(extract(server, 'function ohaPublicRouteCandidates(', '\nfunction ohaServerLabel'), 'ohaPublicRouteCandidates', { ohaWatchRouteFromValue: watch });
const id = '300113394ceebba66c8ad';
const otherId = '12345678901234567890';
const routeList = routes({ id, entries: [{ ids: { id }, epg: [{ id: otherId }], token: otherId }] }, 'https://kool.ws/live');
assert.deepEqual(routeList, [`https://kool.ws/watch?live=${id}`], 'EPG/token IDs must never become watch routes');
const candidates = load(extract(server, 'function ohaOfficialPageCandidates(', '\nasync function selectOhaOfficialPage'), 'ohaOfficialPageCandidates', urlDeps);
assert.equal(candidates('https://kool.ws/live', id, `https://oha.cx/watch?live=${otherId}`, [`https://oha.cx/watch?live=${otherId}`])[0], `https://kool.ws/watch?live=${id}`);

// Compile the actual generated scripts, not just the Node server template.
const sanitize = load(extract(server, 'function sanitizeOhaPlayerHtml(', '\nasync function proxyOhaEmbed'), 'sanitizeOhaPlayerHtml', { publicPath: value => `/noctra${value}` });
const html = sanitize('<html><head><script src="/assets/app.js"></script></head><body></body></html>', `https://kool.ws/watch?live=${id}`, 'test-token', { channelId: id });
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
assert.equal(scripts.length, 2);
scripts.forEach(script => assert.doesNotThrow(() => new vm.Script(script)));
const hostileName = sanitize('<html><head></head><body></body></html>', `https://kool.ws/watch?live=${id}`, 'test-token', { channelName: '</script><script>throw Error("injection")</script>' });
assert.equal([...hostileName.matchAll(/<script>/g)].length, 2, 'Remote labels cannot escape an inline script');
assert.match(html, /\/noctra\/api\/tv\/oha\/site\/test-token\/assets\/app\.js/);

const requests = [], messages = [];
class Element { setAttribute(key, value) { this[key] = value; } }
class Media extends Element { get src() { return this.value; } set src(value) { this.value = value; } }
class Xhr { open() {} }
const context = {
  URL, Request, Headers, Element, HTMLMediaElement: Media, XMLHttpRequest: Xhr,
  location: { href: 'https://noctra.test/noctra/api/tv/oha/embed/test-token' },
  history: { replaceState() {} },
  document: { documentElement: {}, querySelectorAll: () => [], querySelector: () => null },
  MutationObserver: class { observe() {} },
  parent: { postMessage(value) { messages.push(value); } },
  addEventListener() {}, setTimeout() {}, clearTimeout() {},
  fetch: async input => { requests.push(String(input)); return { headers: new Headers(), url: String(input) }; }
};
context.window = context;
vm.createContext(context);
scripts.forEach(script => vm.runInContext(script, context));
await context.fetch('https://cdn.test/live/segment.ts');
assert.equal(messages.length, 0, 'An individual segment is not a playable source');
await context.fetch('https://cdn.test/live/stream.m3u8');
assert.equal(messages.length, 1, 'The manifest can be handed to the native player');
assert.match(requests.at(-1), /media=1&url=/);
const proxied = requests.at(-1);
await context.fetch(proxied);
assert.equal(requests.at(-1), proxied, 'Already proxied media must not be wrapped twice');
const video = new Media();
video.src = 'blob:https://kool.ws/local-media';
assert.equal(video.src, 'blob:https://kool.ws/local-media', 'MSE blob URLs must stay local');
await context.fetch('/assets/app.js');
assert.equal(requests.at(-1), '/noctra/api/tv/oha/site/test-token/assets/app.js');

// A resolved stream returns immediately without waiting for web-page probes.
let bridgeMeta, signalUsed;
const state = { root: 'https://kool.ws/live', channelId: otherId, candidates: [{ url: 'https://kool.ws/source/one', channelId: id, label: 'One' }] };
const resolveBody = extract(server, 'async function resolveOhaStreamReference(', '\nfunction ohaCatalogPublicPageUrl');
const resolver = load(resolveBody, 'resolveOhaStreamReference', {
  decodeTvStateReference: () => state, tvReferences: new Map(), publicPath: x => x,
  firstSuccessfulOhaCandidate: async (_r, _c, signal) => { signalUsed = signal; return { streamUrl: '/stream/test', serverIndex: 0, native: true }; },
  resolveSingleOhaCandidate: async () => { throw Error('unexpected preferred candidate'); },
  selectOhaOfficialPage: () => { throw Error('HTML probe must not block native playback'); },
  issueTvReference: (_u, _h, meta) => { bridgeMeta = meta; return 'bridge'; },
  ohaWebFallbackOption: () => ({ url: '/embed/bridge', fallback: true }),
  ohaOfficialPageCandidates: candidates, safeTvRemoteUrl: urlDeps.safeTvRemoteUrl,
  AbortController, setTimeout, clearTimeout, cleanError: error => error.message, HttpError: Error
});
const result = await resolver('token');
assert.equal(result.options[0].streamUrl, '/stream/test');
assert.equal(result.externalUrl, `https://kool.ws/watch?live=${id}`);
assert.equal(bridgeMeta.channelId, id);
assert.equal(signalUsed.aborted, true, 'Losing probes must be cancelled');

const goal = load(extract(shell, '  function tvAchievableBufferGoal(', '\n  function tvLatestBufferedWindow'), 'tvAchievableBufferGoal');
assert.equal(goal(10), 10);
assert.equal(goal(12, { live: false, totalduration: 5 }), 12);
assert.equal(goal(10, { live: true, totalduration: 30, targetduration: 6 }), 10);
assert.equal(goal(16, { live: true, totalduration: 8, targetduration: 4 }), 5.75);
assert.equal(goal(12, { live: true, totalduration: 4, targetduration: 4 }), 2.75);
assert.equal(goal(12, { live: true, totalduration: 60, targetduration: 6 }), 12);

// Exercise waiting/playing handlers: two notifications of one stall must not
// trigger the long adaptive pause. Two genuine interruptions still must.
const directPlayer = shell.slice(shell.indexOf('  async function playTvDirectStream('));
const waitingBody = extract(directPlayer, '    const onWaiting = () => {', '\n    const onError =');
const events = { paused: 0, timers: 0 };
const waitingFactory = new Function('events', `
let clock=100000;const Date={now:()=>{clock+=2000;return clock}};
let playbackSequence=1,tvPlaybackSequence=1,playbackBecameActive=true,waitingHistory=[],waitingEpisodeActive=false;
let tvHls=null,providerFallbackStarted=false,providerFallbackTimer=0,optionIndex=0,tvWaitingStatusTimer=0;
const playbackProvider='LiveWatch', bufferedResolvedStream=true, video={};
const tvConnectionProfile=()=>({desktop:true,weak:false});
const tvSkipBufferedGap=()=>false,tvBufferedAhead=()=>0;
const beginAdaptiveRebuffer=()=>{events.paused++;return true};
const setTvPlaybackStatus=()=>{},refreshTvLiveEdgeControl=()=>{},recordTvDiagnostic=()=>{};
const window={clearTimeout(){},setTimeout(){events.timers++;return events.timers}};
${waitingBody}
return {waiting:onWaiting,playing(){waitingEpisodeActive=false}};`)(events);
waitingFactory.waiting();
waitingFactory.waiting();
assert.equal(events.paused, 0, 'One continuous stall is one episode');
waitingFactory.playing();
waitingFactory.waiting();
assert.equal(events.paused, 1, 'Repeated distinct stalls still adapt');
assert.match(shell, /videoEventSignal\.aborted \|\| playbackSequence !== tvPlaybackSequence \|\| playbackBecameActive/);
assert.match(shell, /addEventListener\('abort', \(\) => window\.clearTimeout\(startupFallbackTimer\)/);
console.log('Noctra v200.0.44: generated bridge, routes, cancellation, buffer windows and stall episodes OK');
