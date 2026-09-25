import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const extract = (name, async = false) => {
  const start = source.indexOf(`  ${async ? 'async ' : ''}function ${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
};
class Video extends EventTarget {
  setAttribute() {}
  async play() { this.played = true; this.dispatchEvent(new Event('playing')); }
}
class Player extends EventTarget {
  static isBrowserSupported() { return true; }
  constructor() { super(); this.config = {}; }
  configure(config) { for (const [key, value] of Object.entries(config)) this.config[key] = {...this.config[key], ...value}; }
  getVariantTracks() { return [{height:1080}]; }
  async attach(video) { this.video = video; }
  async load(url) { this.url = url; }
  async destroy() { this.destroyed = true; }
}
const tiles = ['one', 'two'].map(id => ({
  isConnected:true, dataset:{tvSafeMultiTile:id}, video:new Video(), status:{dataset:{}}, retry:{},
  querySelector(selector) { return selector.includes('video') ? this.video : selector.includes('status') ? this.status : selector.includes('retry') ? this.retry : null; }
}));
const state = {multiOpen:true, multiGeneration:1, audioId:'one', slots:tiles.map(t=>({id:t.dataset.tvSafeMultiTile})), shaka:new Map(), shakaCleanup:new Map(), multiControllers:new Map()};
let timerId = 0;
const timers = new Map();
const window = {setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearTimeout(id){timers.delete(id);}};
let library = async () => ({Player, polyfill:{installAll(){}}});
const start = new Function('document','tvSafeExtras','window','tvEnginePreference','ensureShakaLibrary','tvSafeMultiTargetHeight',
  extract('installTvShakaContinuity') + extract('applyTvSafeShakaQuality') + extract('startTvSafeMultiviewStream', true) + ';return startTvSafeMultiviewStream;')(
  {querySelectorAll:()=>tiles},state,window,'shaka',()=>library(),()=>720);
await start({id:'one',playbackType:'stream',streamUrl:'/one'});
await start({id:'two',playbackType:'stream',streamUrl:'/two'});
const first = state.shaka.get('one'), second = state.shaka.get('two');
assert.equal(first.url,'/one'); assert.equal(second.url,'/two');
assert.equal(first.config.streaming.segmentPrefetchLimit,1);
assert.equal(first.config.streaming.bufferingGoal,36);
assert.equal(first.config.abr.restrictions.maxHeight,1080,'Do not exclude the only available rendition');
assert.equal(tiles[0].video.muted,false); assert.equal(tiles[1].video.muted,true);
assert.equal(timers.size,0,'First playback cancels startup deadlines');
state.multiControllers.get('one').abort();
await Promise.resolve();
assert.equal(first.destroyed,true); assert.equal(second.destroyed,undefined);
await start({id:'one',playbackType:'stream',streamUrl:'/retry'});
assert.equal(state.shaka.get('one').url,'/retry');
assert.equal(state.shaka.get('two'),second,'Retry must preserve the other tile');
let release;
library=()=>new Promise(resolve=>release=resolve);
state.multiControllers.get('one').abort();
await new Promise(resolve=>setImmediate(resolve));
const pending=start({id:'one',playbackType:'stream',streamUrl:'/late'});
state.multiControllers.get('one').abort();
release({Player,polyfill:{installAll(){}}});
await pending;
assert.equal(state.shaka.has('one'),false,'Cancelled library loading cannot resurrect a tile');
state.multiControllers.get('two').abort();
assert.equal(second.destroyed,true);
console.log('Shaka Multiview: independent playback, bounded buffers, quality cap, exclusive audio, retry and cancellation passed');
