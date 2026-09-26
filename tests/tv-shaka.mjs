import assert from 'node:assert/strict';
import {playerFixture} from './v200048-tv-recovery.mjs';
class Shaka extends EventTarget {
 static version='5.2.10'; static isBrowserSupported(){return true;}
 constructor(){super();this.config={abr:{enabled:true},streaming:{}};this.tracks=[{height:720,bandwidth:1000000}];}
 configure(c){for(const [k,v]of Object.entries(c))this.config[k]={...this.config[k],...v};}
 getConfiguration(){return this.config;}getStats(){return {estimatedBandwidth:1000000};}getVariantTracks(){return this.tracks;}
 async attach(video){this.video=video;}async load(url,startTime){this.url=url;this.startTime=startTime;}async destroy(){this.destroyed=true;}
}
const p=await playerFixture('LiveWatch',false,{section:'channels'});
const old=p.deps.tvHls;
p.deps.tvEnginePreference='shaka';p.deps.ensureShakaLibrary=async()=>({Player:Shaka,polyfill:{installAll(){}}});
// 200.0.123 : la lecture attend 15 s de réserve (Shaka télécharge vidéo en pause).
p.ahead=0;
const restarting=p.deps.tvDirectRestart();
await new Promise(r=>setImmediate(r));
assert.equal(p.video.paused,true,'Pas de play() avant la réserve de démarrage');
p.ahead=16;
for(let i=0;i<5&&p.video.paused;i++){for(const [id,{fn}] of [...p.callbacks]){p.callbacks.delete(id);fn();}await new Promise(r=>setImmediate(r));}
await restarting;
assert.equal(old.destroyed,true);assert.equal(p.deps.tvHls,null);
const shaka=p.deps.tvShaka;
assert.ok(shaka instanceof Shaka);assert.equal(shaka.url,'/media/original');assert.equal(p.video.paused,false);
assert.equal(shaka.config.streaming.rebufferingGoal,15,'200.0.121 : démarrage avec 15 s de réserve');
assert.equal(shaka.startTime,-30,'200.0.124 : départ 30 s en retrait du direct');
assert.equal(shaka.config.streaming.segmentPrefetchLimit,1,'First image takes priority over parallel prefetch');
assert.equal(shaka.config.streaming.bufferingGoal,45);
const diagnosticEvents=[];
p.deps.recordTvDiagnostic=(event,details)=>diagnosticEvents.push({event,...details});
const emit=(type,details)=>shaka.dispatchEvent(Object.assign(new Event(type),details));
emit('downloadcompleted',{requestType:1});
emit('downloadcompleted',{requestType:0});
emit('downloadfailed',{requestType:1,httpResponseCode:503,aborted:false,
 error:{code:1001,category:1,data:['https://private/?token=secret']},request:{uris:['secret']}});
assert.deepEqual(diagnosticEvents.at(-1),{event:'shaka-download-failed',requestType:1,code:1001,category:1,httpStatus:503,timedOut:false});
emit('downloadfailed',{aborted:true,error:{code:7001}});
assert.equal(diagnosticEvents.at(-1).timedOut,true,'Shaka connection/stall timeout must not be hidden');
assert.equal(diagnosticEvents.at(-1).event,'shaka-download-failed');
emit('downloadfailed',{aborted:false,error:{code:7001}});
assert.equal(diagnosticEvents.at(-1).event,'shaka-download-cancelled','Ordinary cancellation is not an HTTP failure');
shaka.seekRange=()=>({start:20,end:70});
p.video.dispatchEvent(new Event('seeking'));
assert.equal(diagnosticEvents.at(-1).seekStart,20);
assert.equal(diagnosticEvents.at(-1).seekEnd,70);
emit('buffering',{buffering:true});
assert.ok(diagnosticEvents.at(-1).lastSegmentAgeMs>=0);
assert.ok(diagnosticEvents.at(-1).lastManifestAgeMs>=0);
emit('error',{});
assert.equal(diagnosticEvents.at(-1).code,null,'Missing codes are explicitly unknown');
emit('error',{detail:{name:'TypeError',severity:1,message:'https://private/?token=secret'}});
assert.equal(diagnosticEvents.at(-1).errorName,'TypeError');
const beforeRepeatedErrors=diagnosticEvents.length;
for(let i=0;i<30;i++)emit('error',{detail:{name:'TypeError',severity:1}});
assert.equal(diagnosticEvents.length,beforeRepeatedErrors,'Repeated parser errors must not erase preceding diagnostic evidence');
emit('error',{detail:{name:'https://private/?token=secret',severity:1}});
assert.equal(diagnosticEvents.at(-1).errorName,null,'Only known exception names may be recorded');
emit('mediasourcerecovered',{});
assert.equal(diagnosticEvents.at(-1).event,'shaka-media-source-recovered');
assert.ok(!JSON.stringify(diagnosticEvents).includes('secret'),'No request or error payload leaks');
p.video.dispatchEvent(new Event('playing'));
assert.equal(shaka.config.streaming.segmentPrefetchLimit,2,'Restore continuity prefetch after first playback');
assert.equal(shaka.config.streaming.rebufferingGoal,6,'200.0.121 : reprise après coupure à partir de 6 s');
for(let i=0;i<4;i++){p.video.dispatchEvent(new Event('waiting'));p.video.dispatchEvent(new Event('playing'));}
assert.equal(p.video.paused,false,'No HLS managed rebuffer pause over Shaka');
p.deps.tvEnginePreference='hls';await p.deps.tvDirectRestart();
assert.equal(shaka.destroyed,true);assert.equal(p.deps.tvShaka,null);assert.ok(p.deps.tvHls);
const afterCleanup=diagnosticEvents.length;
emit('downloadfailed',{requestType:1,httpResponseCode:503});
assert.equal(diagnosticEvents.length,afterCleanup,'Old players cannot contaminate diagnostics');
p.video.dispatchEvent(new Event('playing'));
assert.equal(shaka.config.streaming.segmentPrefetchLimit,2,'Old player is not reconfigured after engine change');
// A late library load must never resurrect a cancelled player.
let resolveLibrary;p.deps.tvEnginePreference='shaka';p.deps.ensureShakaLibrary=()=>new Promise(r=>resolveLibrary=r);
const pending=p.deps.tvDirectRestart();await new Promise(r=>setImmediate(r));
p.deps.tvVideoEventsController.abort();resolveLibrary({Player:Shaka,polyfill:{installAll(){}}});await pending;
assert.equal(p.deps.tvShaka,null);
console.log('Shaka: same-stream engine switch, native buffering ownership, cleanup and cancelled loading passed');
// A rejected Shaka load must retain the chosen engine for manual recovery.
const broken=await playerFixture('Movix',false,{section:'channels'});
broken.deps.tvEnginePreference='shaka';
broken.deps.ensureShakaLibrary=async()=>({Player:class extends Shaka { async load(){throw {code:4000};} },polyfill:{installAll(){}}});
await broken.deps.tvDirectRestart();
await new Promise(r=>setImmediate(r));
assert.equal(broken.deps.tvHls,null,'Failed Shaka load must not change engines');
assert.ok(broken.deps.tvShaka);
assert.equal(broken.deps.tvEnginePreference,'shaka','Keep the user preference');
console.log('Shaka load failure: no automatic engine switch passed');
const manualServer=await playerFixture('LiveWatch',false,{section:'channels'});
manualServer.deps.window.NoctraServerChoice={isManual:()=>true,track:()=>{}};
manualServer.video.dispatchEvent(new Event('playing'));
manualServer.watcher.onStall();
manualServer.watcher.onStall();
assert.equal(manualServer.apiCalls.length,0,'A manual server must not be substituted by a resolver');
manualServer.deps.tvVideoEventsController.abort();
const stalled=await playerFixture('Movix',false,{section:'channels'});
let deadline;const setTimer=stalled.deps.window.setTimeout;
stalled.deps.window.setTimeout=(fn,ms)=>{if(ms===30000)deadline=fn;return setTimer(fn,ms);};
stalled.deps.tvEnginePreference='shaka';
stalled.deps.ensureShakaLibrary=async()=>({Player:class extends Shaka { async load(){return new Promise(()=>{});} },polyfill:{installAll(){}}});
void stalled.deps.tvDirectRestart();await new Promise(r=>setImmediate(r));
assert.equal(typeof deadline,'function');deadline();await new Promise(r=>setImmediate(r));
assert.equal(stalled.deps.tvHls,null,'Slow startup must retain the selected engine');
assert.ok(stalled.deps.tvShaka);
assert.equal(stalled.deps.tvShaka.config.streaming.segmentPrefetchLimit,1,'No parallel startup prefetch while load remains pending');
console.log('Shaka slow startup: retains engine and pending load passed');
const unstable=await playerFixture('LiveWatch',false,{section:'channels'});
let now=1000;unstable.deps.performance={now:()=>now};
unstable.deps.tvEnginePreference='shaka';unstable.deps.ensureShakaLibrary=async()=>({Player:Shaka,polyfill:{installAll(){}}});
unstable.ahead=20;await unstable.deps.tvDirectRestart();unstable.video.dispatchEvent(new Event('playing'));
const unstablePlayer=unstable.deps.tvShaka;
const buffering=active=>{const event=new Event('buffering');event.buffering=active;unstablePlayer.dispatchEvent(event);};
for(let i=0;i<2;i++){buffering(true);now+=6000;buffering(false);now+=10000;}
buffering(true);await new Promise(r=>setImmediate(r));
assert.equal(unstable.deps.tvHls,null,'Repeated stalls must not switch engines');
assert.equal(unstable.deps.tvShaka,unstablePlayer);
assert.equal(unstablePlayer.config.streaming.rebufferingGoal,12,'200.0.121 : 6 s + 2 coupures × 3 s');
console.log('Shaka repeated stalls: adaptive reserve without engine switch passed');

for (const provider of ['WiTV', 'Northlive']) {
 const frozen=await playerFixture(provider,false,{section:'channels'});
 frozen.deps.tvEnginePreference='shaka';
 frozen.deps.ensureShakaLibrary=async()=>({Player:Shaka,polyfill:{installAll(){}}});
 frozen.ahead=20;await frozen.deps.tvDirectRestart();
 frozen.video.dispatchEvent(new Event('playing'));
 frozen.ahead=12;
 const previous=frozen.deps.tvShaka;
 frozen.watcher.onStall();
 await new Promise(r=>setImmediate(r));
 assert.equal(previous.destroyed,true);
 assert.ok(frozen.deps.tvShaka instanceof Shaka);
 assert.equal(frozen.deps.tvShaka.url,'/media/original');
 assert.equal(frozen.apiCalls.length,0,'Buffered freeze restarts the same URL first');
 assert.equal(frozen.deps.tvHls,null,'No automatic engine change');
 frozen.video.dispatchEvent(new Event('playing'));
 frozen.watcher.onStall();
 assert.equal(frozen.apiCalls.length,1,'Repeated freeze renews the URL instead of looping on local reload');
 frozen.deps.tvVideoEventsController.abort();
}
console.log('WiTV and Northlive Shaka freeze recovery: same URL, same engine, bounded restart passed');

const gapOwner=await playerFixture('LiveWatch',false,{section:'channels'});
gapOwner.deps.tvEnginePreference='shaka';
gapOwner.deps.ensureShakaLibrary=async()=>({Player:Shaka,polyfill:{installAll(){}}});
gapOwner.ahead=20;await gapOwner.deps.tvDirectRestart();
gapOwner.video.dispatchEvent(new Event('playing'));
let genericJumps=0;
gapOwner.deps.tvSkipBufferedGap=()=>{genericJumps++;return true;};
gapOwner.video.dispatchEvent(new Event('waiting'));
assert.equal(genericJumps,0,'Waiting must leave gap handling to Shaka');
gapOwner.watcher.onStall();
assert.equal(genericJumps,0,'Watchdog must not seek outside Shaka live window');
gapOwner.deps.tvVideoEventsController.abort();
const hlsGap=await playerFixture('LiveWatch',false,{section:'channels'});
hlsGap.video.dispatchEvent(new Event('playing'));
hlsGap.deps.tvSkipBufferedGap=()=>{genericJumps++;return true;};
hlsGap.video.dispatchEvent(new Event('waiting'));
assert.equal(genericJumps,1,'HLS gap recovery remains available');
hlsGap.deps.tvVideoEventsController.abort();
console.log('Live gap recovery: Shaka owns seeks, HLS retains generic recovery passed');
