import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const shell=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const extract=(name,async=false)=>{const a=shell.indexOf(`  ${async?'async ':''}function ${name}(`);return shell.slice(a,shell.indexOf('\n  }',a)+4);};
let constructed=0,plays=0,destroyed=0,timerId=0;
const timers=new Map();
const status={dataset:{},textContent:''},badge={textContent:''},retry={hidden:true,textContent:''};
class Video extends EventTarget {constructor(){super();this.paused=true;this.isConnected=true;this.currentTime=0;this.buffered={length:1,start:()=>0,end:()=>12};}canPlayType(){return ''}setAttribute(){}play(){plays++;this.paused=false;this.dispatchEvent(new Event('playing'));return Promise.resolve();}}
const video=new Video();
const tile={isConnected:true,dataset:{tvSafeMultiTile:'one'},querySelector:sel=>({'[data-tv-safe-multi-video]':video,'[data-tv-safe-multi-frame]':null,'[data-tv-safe-multi-status]':status,'[data-tv-safe-multi-quality-badge]':badge,'[data-tv-safe-multi-retry]':retry}[sel])};
class Hls {static Events={MANIFEST_PARSED:'manifest',FRAG_BUFFERED:'buffered',LEVEL_SWITCHED:'level',ERROR:'error',DESTROYING:'destroying'};static ErrorTypes={NETWORK_ERROR:'networkError',MEDIA_ERROR:'mediaError'};static isSupported(){return true;}constructor(c){constructed++;this.config=c;this.events=new Map();this.levels=[{height:360,bitrate:500000},{height:720,bitrate:1500000}];}on(e,fn){this.events.set(e,fn)}loadSource(url){this.url=url}attachMedia(v){this.media=v;this.events.get('manifest')?.();this.events.get('buffered')?.();}stopLoad(){this.stopped=true;}startLoad(){this.starts=(this.starts||0)+1;}destroy(){destroyed++;this.events.get('destroying')?.();}recoverMediaError(){}}
const extras={slots:[{id:'one'},{id:'two'}],multiOpen:true,multiGeneration:1,multiQuality:'stable',audioId:'',hls:new Map(),shaka:new Map(),shakaCleanup:new Map(),multiControllers:new Map()};
const win={Hls,setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id)};
let release;
let reserve=12;
let resolver=async()=>({streamUrl:"/fresh.m3u8"});
let ensure=()=>Promise.resolve();
const start=new Function('document','tvSafeExtras','window','tvAppleTouchDevice','ensureHlsLibrary','tvConnectionProfile','tvSafeBufferedAhead','tvSafeMultiStartupGoal','applyTvSafeMultiQualityCap','lowerTvSafeMultiCap','api','tvEnginePreference',extract('startTvSafeMultiviewStream',true)+';return startTvSafeMultiviewStream;')(
 {querySelectorAll:()=>[tile]},extras,win,()=>false,()=>ensure(),()=>({weak:false}),()=>reserve,()=>8,()=>720,()=>false,(...args)=>resolver(...args),'hls');
await start({id:'one',playbackType:'stream',streamUrl:'/sample.m3u8'});
await Promise.resolve();assert.equal(constructed,1,'real start path must not reference an undefined networkProfile');assert.equal(plays,1);assert.equal(status.dataset.state,'playing');
const hls=extras.hls.get('one');assert.equal(hls.config.maxBufferSize,80*1024*1024);assert.equal(hls.config.lowLatencyMode,false);
hls.events.get('error')(null,{fatal:true,type:'networkError'});assert.ok(timers.size>0);
extras.multiControllers.get('one').abort();assert.equal(timers.size,0,'close/retry cancels every pending timer');
// Closing while the HLS library is loading must not create a detached player.
ensure=()=>new Promise(r=>release=r);const pending=start({id:'one',playbackType:'stream',streamUrl:'/other.m3u8'});extras.multiGeneration++;release();await pending;assert.equal(constructed,1);
let audioState={audioId:''};const tiles=['a','b'].map(id=>({dataset:{tvSafeMultiTile:id},video:{muted:true,paused:false},button:{disabled:false,setAttribute(k,v){this[k]=v;}},querySelector(sel){return sel.includes('video')?this.video:sel.includes('frame')?null:this.button;}}));
const audio=new Function('tvSafeExtras','document','icons',extract('setTvSafeMultiviewAudio')+';return setTvSafeMultiviewAudio;')(audioState,{querySelectorAll:()=>tiles},{volume:'on',muted:'off'});
audio('a');assert.equal(tiles[0].video.muted,false);assert.equal(tiles[1].video.muted,true);audio('b');assert.equal(tiles[0].video.muted,true);assert.equal(tiles[1].video.muted,false);audio('b');assert.ok(tiles.every(t=>t.video.muted));assert.equal(tiles[1].button['aria-pressed'],'false');
const removeCode=extract('removeTvSafeMultiviewSlot');
let remainingDestroyed=0,layout=0,closed=0;
const removeState={slots:['a','b','c'].map(id=>({id})),multiOpen:true,audioId:'b',multiControllers:new Map(),hls:new Map([['a',{destroy(){destroyed++}}],['b',{destroy(){remainingDestroyed++}}]])};
const remove=new Function('tvSafeExtras','document','updateTvSafeMultiviewLayout','closeTvSafeMultiview','refreshTvSafeToolsMenu',removeCode+';return removeTvSafeMultiviewSlot;')(removeState,{querySelectorAll:()=>[]},()=>layout++,()=>closed++,()=>{});
remove('a');assert.equal(remainingDestroyed,0);assert.equal(removeState.hls.size,1);assert.equal(layout,1);assert.equal(closed,0);assert.equal(removeState.audioId,'b');
console.log('Multiview: actual HLS startup, cached manifest ordering, bounded buffer, cancellation during loading/reconnect, exclusive toggleable audio and removal without restarting peers OK');

let retried=0,retryDestroyed=0,retryPlayed=0;
const retryVideo={play(){retryPlayed++;return Promise.resolve()},pause(){},removeAttribute(){},load(){}};
const retryStatus={dataset:{state:'idle'}};
const retryTile={dataset:{tvSafeMultiTile:'a'},querySelector:s=>s==='video'?retryVideo:retryStatus};
const retryState={slots:[{id:'a'},{id:'b'}],multiOpen:true,multiControllers:new Map(),hls:new Map([['a',{destroy(){retryDestroyed++}}],['b',{destroy(){throw Error('Peer destroyed')}}]])};
const retryOne=new Function('tvSafeExtras','document','toast','startTvSafeMultiviewStream',extract('retryTvSafeMultiviewSlot')+';return retryTvSafeMultiviewSlot;')(retryState,{querySelectorAll:()=>[retryTile]},()=>{},()=>{retried++});
retryOne('a');assert.equal(retryPlayed,1);assert.equal(retryDestroyed,0);assert.equal(retried,0);
retryStatus.dataset.state='error';retryOne('a');assert.equal(retryDestroyed,1);assert.equal(retried,1);assert.ok(retryState.hls.has('b'));
console.log('Multiview manual play and retry affect only the selected stream OK');

ensure=()=>Promise.resolve();
await start({id:'one',playbackType:'stream',streamUrl:'/expired.m3u8',resolveUrl:'/resolve/exact'});
assert.equal(extras.hls.get('one').url,'/fresh.m3u8','Fresh exact-source URL replaces the expired selection');
let resolvePending;resolver=()=>new Promise(r=>resolvePending=r);
const countBefore=constructed;
const pendingResolve=start({id:'one',playbackType:'stream',streamUrl:'/expired',resolveUrl:'/resolve/exact'});
extras.multiControllers.get('one').abort();resolvePending({streamUrl:'/late'});await pendingResolve;
assert.equal(constructed,countBefore,'Cancelled resolution cannot create a detached player');
console.log('Multiview: fresh exact resolver and cancellation while resolving OK');

resolver=async()=>({streamUrl:'/fresh'});reserve=0;
const playsBefore=plays;
await start({id:'one',playbackType:'stream',streamUrl:'/slow'});
const slowHls=extras.hls.get('one');
[...timers.values()].find(t=>t.ms===10000).fn();
assert.equal(plays,playsBefore,'Startup deadline cannot play an empty buffer');
[...timers.values()].find(t=>t.ms===90000).fn();
assert.equal(slowHls.stopped,true);assert.equal(status.dataset.state,'error');
reserve=12;slowHls.events.get('buffered')();assert.equal(plays,playsBefore,'Late fragment cannot restart an expired attempt');
extras.multiControllers.get('one').abort();
console.log('Multiview: empty startup, bounded deadline and late fragments OK');
