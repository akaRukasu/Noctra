import assert from 'node:assert/strict';
import {playerFixture} from './v200048-tv-recovery.mjs';
const p=await playerFixture('LiveWatch',false,{section:'channels'});
let now=100000;const starts=[];const fallbacks=[];
p.deps.Date={now:()=>now};
p.deps.recordTvDiagnostic=(name,data)=>{if(name==='adaptive-rebuffer-start')starts.push(data.cycle);};
p.deps.tvForwardBufferedWindow=()=>({position:p.video.currentTime,ahead:30});
p.deps.playTvResolvedOption=async (...args)=>fallbacks.push(args[2]);
p.deps.tvState.resolvedEmbeds.push({streamUrl:'/media/alternative',label:'Second server'});
function stallAfter(ms){now+=ms;p.video.paused=false;p.video.readyState=2;p.ahead=.08;p.video.dispatchEvent(new Event('playing'));p.video.dispatchEvent(new Event('waiting'));}
function resume(){p.ahead=30;const t=[...p.callbacks.values()].filter(t=>t.ms===1000&&!t.interval).at(-1);t.fn();assert.equal(p.video.paused,false);p.video.dispatchEvent(new Event('playing'));}
for(let cycle=0;cycle<3;cycle++){
  stallAfter(cycle?130000:0);stallAfter(30000);stallAfter(30000);
  assert.equal(p.video.paused,true);resume();
}
assert.deepEqual(starts,[1,2,3],'Interruptions between rebuilds prevent budget reset even 190 s apart');
stallAfter(30000);stallAfter(30000);stallAfter(30000);
assert.deepEqual(fallbacks,[1],'Repeated failures eventually select another eligible server');
const q=await playerFixture('LiveWatch',false,{section:'channels'});
let clock=100000;const cycles=[];q.deps.Date={now:()=>clock};q.deps.recordTvDiagnostic=(n,d)=>{if(n==='adaptive-rebuffer-start')cycles.push(d.cycle);};
q.deps.tvForwardBufferedWindow=()=>({position:q.video.currentTime,ahead:30});
function qStall(ms){clock+=ms;q.video.paused=false;q.ahead=.08;q.video.dispatchEvent(new Event('playing'));q.video.dispatchEvent(new Event('waiting'));}
qStall(0);qStall(30000);qStall(30000);q.ahead=30;[...q.callbacks.values()].filter(t=>t.ms===1000&&!t.interval).at(-1).fn();
qStall(181000);qStall(30000);qStall(30000);
assert.deepEqual(cycles,[1,1],'A genuinely interruption-free period resets the budget');
console.log('Continuing stalls retain recovery budget; healthy interval resets it; eligible fallback reached');
