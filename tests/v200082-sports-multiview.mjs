import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAdditionalTvProviders,parseRenePublicConfig} from '../lib/tv-additional-providers.mjs';
import {decodeFctvStream,fctvSessionUrl} from '../lib/fctv-stream.mjs';
const str='https://video.example/live.m3u8';
const rot=s=>s.replace(/[!-~]/g,c=>String.fromCharCode(33+(c.charCodeAt(0)-33+47)%94));
const field=(n,b)=>Buffer.concat([Buffer.from([n*8+2,b.length]),b]);
const binary=field(10,field(2,field(4,Buffer.from(rot('12345678'+str)))));
assert.equal(decodeFctvStream(binary),str);
assert.throws(()=>decodeFctvStream(binary.subarray(0,8)));
assert.throws(()=>decodeFctvStream(Buffer.from([0])));
assert.throws(()=>fctvSessionUrl(str,''));
assert.match(new URL(fctvSessionUrl(str,'public-test-session')).pathname,/^\/token-.+a\/live\.m3u8$/);
for(const quote of ['"',"'"]){assert.deepEqual(parseRenePublicConfig(`const SUPABASE_URL = ${quote}https://public.supabase.co/${quote}; const SUPABASE_ANON_KEY = ${quote}anon-fixture${quote};`),{base:'https://public.supabase.co/',key:'anon-fixture'});}
const refs=new Map();let id=0,unavailable=false;const checks=[];
const providers=createAdditionalTvProviders({publicPath:p=>p,readKeys:async()=>({}),streamUrl:k=>'/stream/'+k,
 issueReference:(url,headers,meta)=>{const k=String(++id);refs.set(k,{url,headers,meta});return k;},
 validateStream:async url=>{checks.push(url);if(unavailable)throw Error('No video');},
 request:async url=>{
  if(url==='https://reneveo.store/live')return new Response("const SUPABASE_URL='https://public.supabase.co';const SUPABASE_ANON_KEY='anon-fixture';");
  if(url.includes('.supabase.co/rest/'))return Response.json([{id:'1',name:'Test',active:true,source_1_url:'https://v.example/one.m3u8',source_1_type:'HLS',source_2_url:'https://v.example/two.m3u8',source_2_type:'hls'}]);
  if(url.includes('/api/livetv/stream/'))return Response.json({streams:[{title:'Serveur A',_fctvLocal:{matchId:1,streamId:2,sportType:3,siteType:2001,apiBase:'https://apis-data-defra10.tcdru136ovur.ru'}}]});
  if(url.includes('/api/stream/detail?'))return new Response(binary,{headers:{'rb-session':'public-test-session'}});
  throw Error('Unexpected request '+url);
 }});
assert.equal((await providers.catalog('reneveo')).count,1);
const rene=await providers.resolve({provider:'reneveo',id:'1'});assert.equal(rene.options.length,2);
const selected=refs.get(rene.options[1].resolveUrl.split('/').at(-1)).meta;
checks.length=0;await providers.resolve(selected);assert.deepEqual(checks,['https://v.example/two.m3u8'],'Renewal preserves the selected server');
const event={provider:'matches',id:'match_fctv_1',externalUrl:'https://www.fctv33hd.bar/fr/event.html'};
const ready=await providers.resolve(event);assert(ready.options[0].streamUrl);
unavailable=true;const failed=await providers.resolve(event);assert.equal(failed.options[0].url,event.externalUrl);assert(failed.options.slice(1).every(o=>o.manualOnly));
await assert.rejects(providers.resolve({provider:'fctv-server',id:'bad',local:{matchId:1,streamId:2,sportType:3,siteType:2001,apiBase:'https://unknown.example'}}));

const shell=fs.readFileSync(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const part=(a,b)=>shell.slice(shell.indexOf(a),shell.indexOf(b,shell.indexOf(a)+a.length));
const attrs=new Map();const frame={setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
const c={URL,window:{location:{href:'https://noctra.test/',origin:'https://noctra.test'}},tvTrustedEmbedHosts:new Set(),tvDefaultIframeSandbox:'restricted'};vm.createContext(c);
vm.runInContext(part('  function configureTvIframe(','  function destroyTvPlayback('),c);
for(const provider of ['DLStreams','BrigitteTV','DaddyLive','Streamed','Volkamax','RénéVéo','FCTV33']){
 attrs.set('sandbox','restricted');c.configureTvIframe(frame,{provider,embedUrl:'https://provider.example/player'});assert(!attrs.has('sandbox'));
 c.configureTvIframe(frame,{provider,embedUrl:'/api/local'});assert(attrs.has('sandbox'),'Local pages remain isolated');
}
const tiles=['a','b','c'].map(id=>({dataset:{tvSafeMultiTile:id},querySelector:()=>({setAttribute(){}})}));
const layer={dataset:{},style:{setProperty(){}},querySelectorAll:()=>tiles};
const focus={window:{requestAnimationFrame(){}},document:{querySelector:()=>layer}};vm.createContext(focus);
vm.runInContext(part('  function focusTvSafeMultiviewTile(','  function closeTvSafeMultiview('),focus);
focus.focusTvSafeMultiviewTile('b');assert.equal(layer.dataset.focusedTile,'b');assert.equal(tiles[1].dataset.featured,'true');
focus.focusTvSafeMultiviewTile('b');assert.equal(layer.dataset.focusedTile,'');
focus.focusTvSafeMultiviewTile('missing');assert.equal(layer.dataset.focusedTile,'');
const fullscreenDoc={fullscreenElement:null,querySelector:()=>group,body:{classList:{add(){},remove(){}}},async exitFullscreen(){this.fullscreenElement=null;}};
const attributeMap=new Map();
const tile={dataset:{tvSafeMultiTile:'web'},async requestFullscreen(){fullscreenDoc.fullscreenElement=this;},setAttribute:(k,v)=>attributeMap.set(k,v),removeAttribute:k=>attributeMap.delete(k)};
const group={querySelectorAll:()=>[tile],querySelector:()=>attributeMap.has('data-tv-safe-fullscreen-fallback')?tile:null,hasAttribute:()=>false,async requestFullscreen(){fullscreenDoc.fullscreenElement=this;}};
const screen={document:fullscreenDoc,tvSafeExtras:{fullscreenFallback:false}};vm.createContext(screen);
vm.runInContext(part('  async function toggleTvSafeMultiviewFullscreen(','  function focusTvSafeMultiviewTile('),screen);
await screen.toggleTvSafeMultiviewFullscreen('web');assert.equal(fullscreenDoc.fullscreenElement,tile);
await screen.toggleTvSafeMultiviewFullscreen();assert.equal(fullscreenDoc.fullscreenElement,group);
await screen.toggleTvSafeMultiviewFullscreen();assert.equal(fullscreenDoc.fullscreenElement,null);
tile.requestFullscreen=()=>Promise.reject(Error('Unsupported'));
await screen.toggleTvSafeMultiviewFullscreen('web');assert(attributeMap.has('data-tv-safe-fullscreen-fallback'));
await screen.toggleTvSafeMultiviewFullscreen();assert(!attributeMap.has('data-tv-safe-fullscreen-fallback'),'Escape/group control clears the tile fallback');
console.log('v82: provider config, selected-server renewal, FCTV validation/fallback, iframe boundaries and multiview focus passed');
