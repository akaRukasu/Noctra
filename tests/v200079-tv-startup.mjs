import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const server=(await readFile(new URL('../server.mjs',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const shell=(await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const between=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return s.slice(i,j);};
const ctx={AbortController,AbortSignal,setTimeout,clearTimeout};vm.createContext(ctx);
vm.runInContext(between(server,'async function firstVerifiedLiveWatchVariant(','async function resolveLiveWatchVipPlayback('),ctx);
let cancelled=false;
const result=await ctx.firstVerifiedLiveWatchVariant(['dead','ready'],(name,signal)=>name==='ready'?Promise.resolve({variantId:'ready'}):new Promise((_,reject)=>signal.addEventListener('abort',()=>{cancelled=true;reject(new Error('cancelled'));},{once:true})));
assert.equal(result.variantId,'ready');assert(cancelled,'Cancel a pending loser before returning the winning stream');
assert.equal(await ctx.firstVerifiedLiveWatchVariant([],()=>assert.fail()),null);
assert.equal(await ctx.firstVerifiedLiveWatchVariant([1,2],async()=>null),null);
// Exercise the complete resolver: a hanging FrameTV cross-family catalogue must
// not block the selected stream; unprobed variants must remain selectable.
const deps={...ctx,validLiveWatchChannelReference:(kind,id)=>({kind,id}),liveWatchAccessSession:async()=>({}),
 liveWatchOfficialPlayerUrl:()=> 'https://livewatch.top/embed/frame/a',liveWatchChannelVariants:async()=>[{kind:'frame',id:'a'},{kind:'frame',id:'b'}],
 liveWatchCrossFamilyVariants:()=>new Promise(()=>{}),liveWatchStreamReference:async(k,id)=>id,
 validateLiveWatchStreamReference:async(token,ms,signal)=>token==='a'?true:new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})),
 liveWatchStableHlsUrl:(kind,id)=>`/hls/${kind}/${id}`,liveWatchFamilyLabel:()=> 'FrameTV',issueLiveWatchBridgeReference:()=> 'bridge',publicPath:p=>p};
vm.createContext(deps);vm.runInContext(between(server,'async function firstVerifiedLiveWatchVariant(','async function liveWatchVipDiagnosticCheck('),deps);
let timer;
const playback=await Promise.race([deps.resolveLiveWatchVipPlayback('frame','a'),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Ready stream blocked by another source')),500))]).finally(()=>clearTimeout(timer));
assert.equal(playback.options[0].streamUrl,'/hls/frame/a');assert.equal(playback.options[0].verified,true);
assert(playback.options.some(o=>o.variantId==='b'&&!o.verified));
// A master uses the cheapest rendition; a sliding media playlist uses a recent
// non-gap segment, then actual body bytes are required (not just HTTP headers).
const probe={...ctx,URL,Buffer,Response,ReadableStream,HttpError:class extends Error{constructor(status,m){super(m);this.status=status;}},safeTvRemoteUrl:u=>new URL(u),resolveTvUrl:(u,b)=>new URL(u,b).href};
vm.createContext(probe);vm.runInContext(between(server,'async function probeTvMediaBody(','async function validateWiTvHlsStream('),probe);
assert.equal(probe.tvRecentPlaylistProbeUri('#EXTM3U\n#EXTINF:2\nold.ts\n#EXTINF:2\nrecent.ts\n#EXTINF:2\nnew.ts','https://test/'),'https://test/recent.ts');
await assert.rejects(probe.probeTvMediaBody(new Response('')));
await assert.rejects(probe.probeTvMediaBody(new Response('<html>error</html>')));
await probe.probeTvMediaBody(new Response(Buffer.alloc(188,0x47)));
// Startup with real buffered-range and seek helpers, for desktop and mobile.
for(const desktopLive of [false,true]){
 const video={currentTime:100,buffered:{length:1,start:()=>100,end:()=>101},play:()=>{plays++;return Promise.resolve();}};
 let plays=0;
 const c={video,videoEventSignal:{aborted:false},playbackSequence:1,tvPlaybackSequence:1,playbackBecameActive:false,startupPlayRequested:false,startupDeadlineReached:false,desktopLive,networkProfile:{weak:false},protectedStartupBufferGoal:2,startupFallbackTimer:0,window:{setTimeout:()=>1,clearTimeout:()=>{}},recordTvDiagnostic:()=>{}};
 vm.createContext(c);
 vm.runInContext(between(shell,'  function tvBufferedAhead(','  function tvBufferedSpan(')+between(shell,'  function tvLatestBufferedWindow(','  function ',)+between(shell,'  function tvSeekIntoBufferedWindow(','  function tvSkipBufferedGap('),c);
 vm.runInContext(between(shell,'      const requestStartupPlayback =',"      videoEventSignal.addEventListener('abort', () => window.clearTimeout(startupFallbackTimer)")+ '\nthis.start=requestStartupPlayback;',c);
 assert.equal(c.start(),false);assert.equal(plays,0);
 c.startupDeadlineReached=true;assert.equal(c.start(),true);assert.equal(plays,1,'One second already buffered starts after the deadline');
 assert.equal(c.start(),false,'No duplicate play');
 c.startupPlayRequested=false;c.videoEventSignal.aborted=true;assert.equal(c.start(),false,'No stale playback');
}
console.log('v200.0.79: first ready stream, loser cancellation, hanging FrameTV catalogue, variants, media body checks and short-buffer startup OK');
