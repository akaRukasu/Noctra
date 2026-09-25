import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const source=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const start=source.indexOf('  function tvStartupStillProgressing(');
const fn=source.slice(start,source.indexOf('\n  }',start)+4);
const ctx={};vm.createContext(ctx);vm.runInContext(fn,ctx);
assert(ctx.tvStartupStillProgressing(50000,0,40000,18.78));
assert(!ctx.tvStartupStillProgressing(50000,0,20000,18.78),'stalled media must not extend timeout');
assert(!ctx.tvStartupStillProgressing(90000,0,89000,18.78),'hard bound');
assert(!ctx.tvStartupStillProgressing(50000,0,40000,0),'no media');
const expression=source.match(/hlsOptions.liveSyncDuration = (.+);/)[1];
const sync=new Function('desktopLive','networkProfile','return '+expression);
assert.equal(sync(true,{weak:false}),30);assert.equal(sync(false,{weak:false}),12);assert.equal(sync(false,{weak:true}),18);
// Execute the real provider deadline: progressing data keeps the current engine;
// cancelled playback cannot create another timer or select another source.
const timeoutBody=source.slice(source.indexOf('    if (/^(?:LiveWatch|NorthTV|FrameTV|WiTV|OHA)'),source.indexOf('\n    const startHlsJs ='));
const schedule=new Function('deps',`with(deps){${timeoutBody}}`);
let now=50000, callback, delay, fallbacks=0;
const deps={playbackProvider:'LiveWatch',providerFallbackTimer:0,playbackSequence:1,tvPlaybackSequence:1,
 playbackBecameActive:false,playbackNeedsGesture:false,startupAttemptAt:0,startupLastProgressAt:40000,
 tvStartupStillProgressing:ctx.tvStartupStillProgressing,tvBufferedSpan:()=>18.78,tvBufferedAhead:()=>18.78,video:{},
 Date:{now:()=>now},recordTvDiagnostic:()=>{},window:{setTimeout:(fn,ms)=>{callback=fn;delay=ms;return 7;}},
 startResolvedOptionFallback:()=>{fallbacks++;return true;}};
schedule(deps);callback();assert.equal(fallbacks,0);assert.equal(delay,10000);
now=90000;deps.startupLastProgressAt=89000;callback();assert.equal(fallbacks,1);
deps.tvPlaybackSequence=2;callback();assert.equal(fallbacks,1);

// A paused desktop playhead at the live edge must move into available media
// before the full startup goal exists; a small reserve must still not play.
const seekStart=source.indexOf('  function tvSeekIntoBufferedWindow(');
vm.runInContext(source.slice(seekStart,source.indexOf('\n  function tvSkipBufferedGap',seekStart)),ctx);
const startupStart=source.indexOf('      const requestStartupPlayback =');
const startupEnd=source.indexOf('\n      };',startupStart)+9;
const buildStartup=new Function('deps',`with(deps){${source.slice(startupStart,startupEnd)};return requestStartupPlayback;}`);
const video={currentTime:100};
const startupDeps={networkProfile:{weak:false},video,videoEventSignal:{aborted:false},playbackSequence:1,tvPlaybackSequence:1,
 playbackBecameActive:false,startupPlayRequested:false,desktopLive:true,protectedStartupBufferGoal:20,
 channelContinuity:true,tvLatestBufferedWindow:()=>({start:80,end:87,duration:7}),tvSeekIntoBufferedWindow:ctx.tvSeekIntoBufferedWindow};
assert.equal(buildStartup(startupDeps)(),false);assert.equal(video.currentTime,80.12);
video.currentTime=100;startupDeps.desktopLive=false;assert.equal(buildStartup(startupDeps)(),false);assert.equal(video.currentTime,100);
console.log('TV 200.0.70: real deadline grace, hard timeout, cancellation, early desktop playhead, PC reserve and unchanged mobile defaults OK');
