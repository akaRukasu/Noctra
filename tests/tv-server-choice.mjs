import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/noctra-server-choice.js', import.meta.url), 'utf8');
const store = new Map(); let calls = [], pending = false;
const context = { window: {}, location: { href: 'https://noctra.test/client/' },
  localStorage: { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v) },
  AbortController, TextDecoder, Uint8Array, URL, Date, performance, setTimeout, clearTimeout,
  fetch: async (url, {signal}) => {
    calls.push(url);
    if (pending) return new Promise((resolve,reject) => {
      signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});
    });
    if (url.includes('broken')) return new Response('', {status:503});
    if (url.endsWith('.m3u8')) return new Response('#EXTM3U\n#EXTINF:6\na.ts\n#EXTINF:6\nb.ts\n#EXTINF:6\nc.ts');
    return new Response(new Uint8Array(1024).fill(71));
  }
};
vm.runInNewContext(source, context);
const selector = context.window.NoctraServerChoice;
const channel = {provider:'LiveWatch',id:'bein1'};
const options = [ {label:'bad',streamUrl:'https://noctra.test/broken.m3u8'},
  {label:'good',streamUrl:'https://noctra.test/good.m3u8'},
  {label:'external',url:'https://external.test'},
  {label:'manual',manualOnly:true,streamUrl:'https://noctra.test/manual.m3u8'} ];
const controller=new AbortController();
const args={signal:controller.signal,normalize:u=>u,current:()=>true,resolve:async()=>{throw Error('unexpected');}};
selector.begin(false);
assert.equal(await selector.choose(channel,options,0,args),0);
assert.equal(calls.length,0,'Never probe outside Channels');
selector.begin(true);
assert.equal(await selector.choose(channel,options,0,args),1,'Media samples beat a failed manifest');
assert.equal(calls.filter(u=>u.endsWith('.ts')).length,2,'Two distinct segments are sampled');
assert.ok(calls.every(u=>!u.includes('external')&&!u.includes('manual')));
assert.ok(![...store.values()].join('').includes('https'),'No addresses persisted');
calls=[];
assert.equal(await selector.choose(channel,options,0,args),1);
assert.equal(calls.filter(u=>u.includes('good')||u.endsWith('.ts')).length,0,'Healthy probe reused for ten minutes');
selector.manual(); calls=[];
assert.equal(await selector.choose(channel,options,0,args),0);
assert.equal(calls.length,0,'Manual choice bypasses scanning');
selector.begin(true); pending=true;
const another={provider:'Northlive',id:'other'};
const scan=selector.choose(another,options,0,args);
await new Promise(r=>setImmediate(r)); selector.manual();
assert.equal(await scan,0,'Manual choice cancels in-flight probes');
assert.equal(selector.isManual(),true);
selector.begin(true); pending=false;
assert.equal(selector.isManual(),false,'A new channel resets the manual lock');
assert.equal(await selector.choose(channel,options,0,{...args,current:()=>false}),0,'Obsolete results are not selected');
// Sustained playback and stalls inform future rankings, including manual sessions.
const video=new EventTarget(); video.currentTime=0; video.paused=false; video.seeking=false;
const life=new AbortController(); selector.track(channel,options[1],video,life.signal);
for(let i=0;i<35;i++){video.currentTime++;video.dispatchEvent(new Event('timeupdate'));}
video.dispatchEvent(new Event('waiting')); life.abort();
const history=JSON.parse([...store.values()][0]);
assert.ok(Object.values(history).some(h=>h.seconds>=35&&h.stalls===1));
console.log('Server selection: channel scope, two media samples, failure ranking, cache, privacy, manual cancellation, stale results and playback history passed');
