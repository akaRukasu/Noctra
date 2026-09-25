import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { playerFixture } from './v200048-tv-recovery.mjs';
const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const extract = (start, end) => { const a = shell.indexOf(start), b = shell.indexOf(end, a + start.length); assert.ok(a >= 0 && b > a); return shell.slice(a, b); };
const load = (source, name, deps = {}) => new Function(...Object.keys(deps), `${source}; return ${name}`)(...Object.values(deps));
const forward = load(extract('  function tvForwardBufferedWindow(', '\n  function createTvContinuityGuard'), 'tvForwardBufferedWindow');
const guardFactory = load(extract('  function createTvContinuityGuard(', '\n  function tvSeekIntoBufferedWindow'), 'createTvContinuityGuard');
const video = { currentTime: 99, isConnected: true, playCalls: 0, play() { this.playCalls++; return Promise.resolve(); } };
let ranges = [[0, 100]];
video.buffered = { get length() { return ranges.length; }, start: i => ranges[i][0], end: i => ranges[i][1] };
assert.equal(forward(video).ahead, 1, '99 seconds already watched are not forward reserve');
let timer;
const deps = { adaptiveRebuffering: true, videoEventSignal: { aborted: false }, playbackSequence: 1, tvPlaybackSequence: 1,
  video, adaptiveRebufferGoal: () => 20, tvForwardBufferedWindow: forward, adaptiveRebufferStartedAt: 1,
  adaptiveRebufferTimer: 0, Date: { now: () => 32000 }, window: { setTimeout(fn) { timer = fn; return 1; }, clearTimeout() {} },
  cancelAdaptiveRebuffer() { deps.adaptiveRebuffering = false; }, waitingHistory: [], recordTvDiagnostic() {},
  tvBufferedAhead: () => forward(video)?.ahead || 0, setTvPlaybackStatus() {}, benignTvPlayInterruption: () => false
};
const resume = new Function('deps', `with(deps) { ${extract('    const resumeAdaptiveRebuffer =', '\n    const beginAdaptiveRebuffer')}; return resumeAdaptiveRebuffer; }`)(deps);
assert.equal(resume(true), false); assert.equal(video.playCalls, 0); assert.equal(video.currentTime, 99);
ranges = [[0, 125]];
assert.equal(resume(false), true); assert.equal(video.currentTime, 99, 'Resume at the current position, never rewind');
deps.adaptiveRebuffering = true; ranges = [[0, 95]]; assert.equal(resume(true), false);
ranges = [[0, 95], [102, 126]]; assert.equal(resume(false), true); assert.equal(video.currentTime, 102.05);
deps.adaptiveRebuffering = true; ranges = [[0, 95], [130, 155]]; assert.equal(resume(true), false, 'Do not skip a large unknown gap');

let now = 1000, ahead = 12;
const actions = [];
const engine = { autoLevelEnabled: true, autoLevelCapping: -1, capLevelToPlayerSize: true, currentLevel: 3,
  levels: [{ bitrate: 500000 }, { bitrate: 1500000 }, { bitrate: 3000000 }, { bitrate: 6000000 }] };
const guard = guardFactory(engine, { bufferAhead: () => ahead, reserveGoal: () => 18, clock: () => now, onAction: (...args) => actions.push(args) });
guard.sample({ level: 3, duration: 4, loadMs: 3900 });
assert.equal(engine.autoLevelCapping, 2); assert.equal(engine.capLevelToPlayerSize, false);
guard.sample({ level: 2, duration: 4, loadMs: 3800 });
assert.equal(engine.autoLevelCapping, 1, 'Hold a sustainable quality before reserve reaches zero');
now += 30000; ahead = 22;
for (let n = 0; n < 10; n++) guard.sample({ level: 1, duration: 4, loadMs: 1200 });
assert.equal(engine.autoLevelCapping, 1, 'No immediate rebound after a fast segment');
now += 20000;
guard.sample({ level: 1, duration: 4, loadMs: 1200 });
assert.equal(engine.autoLevelCapping, 2, 'Recovery raises one quality step at a time');
guard.stall(); now += 40000;
for (let n = 0; n < 8; n++) guard.sample({ level: 2, duration: 4, loadMs: 1200 });
assert.equal(engine.autoLevelCapping, 2, 'A new stall extends protection without an old timer removing it');
engine.autoLevelEnabled = false; guard.sample({ level: 3, duration: 4, loadMs: 6000 });
assert.equal(engine.autoLevelCapping, -1); assert.equal(engine.capLevelToPlayerSize, true);
const count = actions.length; guard.sample({ level: 3, duration: 4, loadMs: 6000 }); assert.equal(actions.length, count, 'Manual quality stays under user control');
engine.autoLevelEnabled = true; ahead = 2;
guard.sample({ level: 3, duration: 4, loadMs: 10000, type: 'audio' }); assert.equal(engine.autoLevelCapping, -1, 'Audio must not skew video quality decisions');
guard.sample({ level: 0, duration: 4, loadMs: 8000 }); assert.equal(engine.autoLevelCapping, -1, 'No invented lower rendition for single-quality sources');

const context = { console, performance, setTimeout, clearTimeout, setInterval, clearInterval, navigator: { userAgent: 'test', onLine: true } };
context.self = context; context.window = context;
vm.createContext(context); vm.runInContext(await readFile(new URL('public/vendor/hls.min.js', root), 'utf8'), context);
for (const weak of [false, true]) {
  const p = await playerFixture('OHA', false, { section: 'channels', weak });
  const config = p.deps.tvHls.config;
  assert.equal(config.liveSyncDurationCount, undefined);
  assert.equal(config.liveMaxLatencyDurationCount, undefined);
  assert.equal(config.liveSyncDuration, 30);
  const actual = new context.Hls({ ...config, enableWorker: false }); actual.destroy();
  p.ahead = 3;
  p.deps.tvHls.emit(context.Hls.Events.MANIFEST_PARSED, {});
  const startup = [...p.callbacks.values()].find(t => t.ms === (weak ? 12000 : 6000));
  assert.ok(startup, 'The bounded startup check must be scheduled');
  startup.fn(); assert.equal(p.video.paused, true, 'Do not start a channels stream on only three seconds of reserve');
  if (!weak) {
    p.ahead = 6;
    p.deps.tvHls.emit(context.Hls.Events.FRAG_BUFFERED, { frag: { duration: 2, type: 'main', level: 0 } });
    assert.equal(p.video.paused, true, 'Six seconds must not prematurely release the improved channel reserve');
  }
  p.ahead = weak ? 10 : 8;
  p.deps.tvHls.emit(context.Hls.Events.FRAG_BUFFERED, { frag: { duration: 2, type: 'main', level: 0 } });
  assert.equal(p.video.paused, false);
  p.deps.tvVideoEventsController.abort();
}
// A short moving playlist must not wait forever for an impossible reserve.
const short = await playerFixture('OHA', false, { section: 'channels' });
short.ahead = 5;
short.deps.tvHls.emit(context.Hls.Events.LEVEL_UPDATED, { details: { live: true, totalduration: 6, targetduration: 1 } });
assert.equal(short.deps.tvHls.config.liveSyncDuration, 4.75);
assert.equal(short.video.paused, false);
short.deps.tvVideoEventsController.abort();
console.log('v200.0.49 TV: forward-only rebuffer, persistent ABR protection, manual quality, audio isolation, real HLS config and startup reserves OK');
