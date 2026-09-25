import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const shell=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const extract=name=>{const a=shell.indexOf('  function '+name+'(');return shell.slice(a,shell.indexOf('\n  }',a)+4);};
let position=0,frame,listener;
const cards=Array.from({length:8},(_,id)=>({id,classList:{contains:n=>n==='card'},get offsetLeft(){return slider.children.indexOf(this)*150;}}));
const slider={children:[...cards],contains:()=>false,insertBefore(node,first){this.children.splice(this.children.indexOf(node),1);this.children.unshift(node);},append(node){this.children.splice(this.children.indexOf(node),1);this.children.push(node);}};
const scroller={dataset:{},isConnected:true,getScrollSlider:()=>slider,addEventListener:(n,f)=>{listener=f;},reload(){}};
const context={window:{innerWidth:390},document:{body:{classList:{contains:()=>false}}},requestAnimationFrame:fn=>(frame=fn,1),getCarouselMetrics:()=>({position,maximum:810,viewport:390}),setCarouselPosition:(_s,p)=>{position=p;}};
vm.createContext(context);vm.runInContext(extract('bindMobileCarouselLoop'),context);context.scroller=scroller;vm.runInContext('bindMobileCarouselLoop(scroller)',context);frame();assert.equal(position,150);assert.equal(slider.children[1],cards[0]);
for(let i=0;i<50;i++){position=810;listener();frame();assert.equal(position,660);assert.equal(new Set(slider.children).size,8);}
for(let i=0;i<50;i++){position=0;listener();frame();assert.equal(position,150);assert.equal(new Set(slider.children).size,8);}
assert.deepEqual(new Set(slider.children),new Set(cards),'original cards and their native handlers preserved');
const a=shell.indexOf('protectedStartupBufferGoal = tvAchievableBufferGoal(Math.max('),b=shell.indexOf(';',a);
const goal=new Function('startupBufferGoal','latestPlaylistDetails','tvAchievableBufferGoal','let protectedStartupBufferGoal;'+shell.slice(a,b+1)+'return protectedStartupBufferGoal;');
assert.equal(goal(6,{targetduration:14},x=>x),28);
assert.equal(goal(6,{targetduration:2},x=>x),6);
assert.equal(goal(6,{targetduration:14},x=>Math.min(x,10)),10,'short playlist remains achievable');
const line=shell.match(/const channelContinuity = (.+);/)[1];
const protectedSource=new Function('tvState','playbackProvider','return '+line);
for(const section of ['channels','favorites','sports']) assert(protectedSource({section},'LiveWatch'));
console.log('200.0.66: 100 mobile loop crossings preserve native cards; long-segment startup and cross-section TV protection OK');
