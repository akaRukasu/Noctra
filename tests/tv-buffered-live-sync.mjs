import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {playerFixture} from './v200048-tv-recovery.mjs';

const runtime = {console, setTimeout, clearTimeout, setInterval, clearInterval, URL, performance, navigator:{userAgent:'test'}};
runtime.self = runtime;
vm.runInNewContext(await readFile(new URL('../public/vendor/hls.min.js', import.meta.url), 'utf8'), runtime);
const hls = new runtime.Hls({enableWorker:false});
const sync = hls.streamController.synchronizeToLiveEdge;
function recover(mode, ranges) {
  const media = {currentTime:89.5, duration:Infinity, readyState:2,
    buffered:{length:ranges.length, start:i=>ranges[i][0], end:i=>ranges[i][1]}};
  sync.call({config:{liveSyncMode:mode,liveMaxLatencyDuration:90,maxFragLookUpTolerance:.25},
    media,hls:{liveSyncPosition:119.1},playhead:media.currentTime,_hasEnoughToStart:true,warn(){}},
    {fragmentStart:100,edge:150,targetduration:10});
  return media.currentTime;
}
assert.equal(recover('edge', [[20,89.6]]),119.1,'Reproduces old seek ahead of all downloaded media');
assert.equal(recover('buffered', [[20,89.6]]),89.5,'Wait for new media without skipping into an empty buffer');
assert.equal(recover('buffered', [[20,89.6],[100,130]]),100,'Skip a genuine gap to the next downloaded range');
assert.equal(recover('buffered', [[20,130]]),119.1,'Keep live catch-up when its destination is already downloaded');
for (const provider of ['LiveWatch','Movix','OHA']) {
  const p = await playerFixture(provider,false,{section:'channels'});
  assert.equal(p.deps.tvHls.config.liveSyncMode,'buffered');
}
hls.destroy();
console.log('Bundled HLS.js: empty-target regression, buffered gap recovery and available live catch-up passed');
