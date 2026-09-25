import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAdditionalTvProviders} from '../lib/tv-additional-providers.mjs';
const refs=[];
const provider=createAdditionalTvProviders({publicPath:x=>x,readKeys:async()=>({movix:'key'}),streamUrl:x=>'/stream/'+x,
issueReference:(url,headers,meta)=>{refs.push({url,headers,meta});return String(refs.length);},
request:async()=>new Response(JSON.stringify({streams:[{url:'https://cdn.example/live.ts?token=private',userAgent:'VAVOO/2.6',behaviorHints:{proxyHeaders:{request:{Referer:'https://movix.fun/',Origin:'https://movix.fun',Authorization:'never-forward'}}}},{url:'https://cdn.example/live.m3u8'}]}))});
const result=await provider.resolve({provider:'iptv',id:'123'});
assert.equal(result.options[0].transport,'mpegts');assert.equal(result.options[1].transport,'hls');
assert.equal(refs.find(r=>r.url.includes('live.ts')).headers['user-agent'],'VAVOO/2.6');assert.equal(refs.find(r=>r.url.includes('live.ts')).headers.origin,'https://movix.fun');assert.equal(refs.find(r=>r.url.includes('live.ts')).headers.authorization,undefined);
assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('requestHeaders'));
const source=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const start=source.indexOf("    if (channel.transport === 'mpegts')"),end=source.indexOf('// iOS 17.1+',start);
const run=new Function('channel','ensureMpegTsLibrary','videoEventSignal','playbackSequence','tvPlaybackSequence','video','streamUrl','setTvPlaybackStatus','benignTvPlayInterruption','refreshResolvedStream','playbackProvider','return (async()=>{'+source.slice(start,end)+'})();');
let destroyed=0,loaded=0,reconnected=0,onError;const controller=new AbortController();const player={on(_event,fn){onError=fn},attachMediaElement(){},load(){loaded++},play:async()=>{},destroy(){destroyed++}};
await run({transport:'mpegts'},async()=>({isSupported:()=>true,createPlayer:()=>player,Events:{ERROR:'error'},ErrorTypes:{NETWORK_ERROR:'network'}}),controller.signal,1,1,{},'/stream/1',()=>{},()=>false,()=>{reconnected++;return true;},'Movix');
assert.equal(loaded,1);onError('network');assert.equal(reconnected,1);controller.abort();onError('network');assert.equal(reconnected,1);assert.equal(destroyed,1);
console.log('MPEG-TS routing, HLS preservation, provider headers, private URLs and player cleanup passed');


