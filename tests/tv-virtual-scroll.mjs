import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function tvVirtualKey('),source.indexOf('  function bindTvVirtualList('));
const frames=[];
const state={pitch:68,lastKey:'',lastStart:-1,lastEnd:-1};
const ctx={tvState:{sourceId:'test',group:'',search:''},normalizedText:x=>x,tvVirtualState:state,
 requestAnimationFrame:fn=>frames.push(fn),getComputedStyle:()=>({marginBottom:'4.32px'}),
 tvChannelCard:(channel,index)=>`<row data-index="${index}"></row>`};
vm.createContext(ctx);vm.runInContext(code,ctx);
const matches=Array.from({length:900},(_,index)=>({index,channel:{name:'Channel '+index}}));
const list={isConnected:true,dataset:{virtual:'true'},clientHeight:650,scrollTop:0,innerHTML:'',
 querySelector:()=>({getBoundingClientRect:()=>({height:96})})};
ctx.renderTvVirtualWindow(list,matches,true);frames.shift()();
assert.equal(state.pitch,100.32,'Keep fractional row pitch; rounding accumulates across hundreds of channels');
while(frames.length)frames.shift()();
list.scrollTop=state.pitch*880;ctx.renderTvVirtualWindow(list,matches,true);
assert.ok(list.innerHTML.includes('data-index="880"'));
assert.equal(state.lastStart,873);
list.dataset.virtual='false';const last=list.innerHTML;state.pitch=68;
frames.shift()();
assert.equal(list.innerHTML,last,'A queued virtual measurement cannot overwrite the mobile list after resizing');
console.log('TV virtual scroll: fractional pitch, end of large catalogue and pending resize cancellation passed.');
