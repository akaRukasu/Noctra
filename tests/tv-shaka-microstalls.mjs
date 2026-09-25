import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const begin=source.indexOf('  function installTvShakaContinuity(');
let now=0;
const install=new Function('performance',source.slice(begin,source.indexOf('\n  function tvSafeBufferedAhead',begin))+';return installTvShakaContinuity;')({now:()=>now});
function fixture(initial=3){
 const player=new EventTarget(),video=new EventTarget(),controller=new AbortController(),goals=[];
 player.configure=c=>goals.push(c.streaming.rebufferingGoal);video.paused=false;video.seeking=false;
 install(player,video,controller.signal,initial);
 const emit=active=>{const e=new Event('buffering');e.buffering=active;player.dispatchEvent(e);};
 const stall=ms=>{emit(true);now+=ms;emit(false);};
 return {player,video,controller,goals,emit,stall};
}
const a=fixture();a.stall(1000);assert.deepEqual(a.goals,[],'Startup must not change startup delay');
a.video.dispatchEvent(new Event('playing'));
a.stall(100);a.stall(150);assert.deepEqual(a.goals,[],'Ignore event chatter');
a.stall(400);a.stall(500);assert.deepEqual(a.goals,[9],'Two microstalls count even below two seconds');
a.emit(true);assert.deepEqual(a.goals,[9],'Never extend a stall mid-load');now+=350;a.emit(false);assert.deepEqual(a.goals,[9,12]);
for(let i=0;i<5;i++)a.stall(500);assert.equal(a.goals.at(-1),12,'Reserve is bounded');
const b=fixture(4);b.video.dispatchEvent(new Event('playing'));b.stall(400);b.stall(400);assert.deepEqual(b.goals,[10],'Multiview has the same adaptation with its own state');
a.controller.abort();const length=a.goals.length;a.stall(500);assert.equal(a.goals.length,length,'Disposal stops adaptation');
const c=fixture();c.video.dispatchEvent(new Event('playing'));c.emit(true);now+=500;c.video.dispatchEvent(new Event('seeking'));c.emit(false);c.video.paused=true;c.stall(700);c.video.paused=false;c.stall(500);assert.deepEqual(c.goals,[],'Seeking and deliberate pause are not network stalls');
now+=91000;c.stall(500);assert.deepEqual(c.goals,[],'Old stalls expire');
console.log('Shaka microstalls: startup unchanged, short stalls counted, bounded independent reserve, seek/pause exclusion and cleanup passed');
