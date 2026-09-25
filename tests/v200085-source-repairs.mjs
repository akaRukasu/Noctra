import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAdditionalTvProviders} from '../lib/tv-additional-providers.mjs';
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const part=(a,b)=>server.slice(server.indexOf(a),server.indexOf(b,server.indexOf(a)+a.length));
let settings={sources:[{name:'Legacy',url:'https://legacy.test'}]};
const c={readTvRuntimeSources:async()=>settings.sources,writeTvRuntimeSources:async sources=>settings.sources=sources,tvSourceId:()=> 'legacy-id',safeTvRemoteUrl:u=>new URL(u),HttpError:Error,tvCatalogCache:{clear(){}},builtInTvSources:()=>[{id:'xtemus-box',section:'personal'}],readFile:async()=>JSON.stringify(settings),writeFile:async(p,s)=>settings=JSON.parse(s),mkdir:async()=>{},tvSourcesPath:'virtual',runtimeRoot:'virtual',Set,JSON};vm.createContext(c);
vm.runInContext(part('async function removeTvSource(','function issueTvReference('),c);
await c.removeTvSource('legacy-id');assert.equal(settings.sources.length,0,'Last legacy source can be deleted');
await c.removeTvSource('xtemus-box');assert.deepEqual(settings.hiddenSourceIds,['xtemus-box']);
await assert.rejects(c.removeTvSource('unknown'));
assert.doesNotMatch(server,/id: 'bowdtv-guide'/);
assert.match(server,/isLive: true,\s+streamKind: 'TV en direct · OHA'/);

const encoded=Buffer.from('https://example.test/live.m3u8');
const f=(n,b)=>Buffer.concat([Buffer.from([n*8+2,b.length]),b]);const packet=f(10,f(2,f(4,encoded)));
const calls=[],refs=[];let failCanal=false;
const p=createAdditionalTvProviders({publicPath:x=>x,readKeys:async()=>({}),issueReference:(url,h,m)=>{refs.push({url,h,m});return String(refs.length)},streamUrl:id=>'/s/'+id,
 validateStream:async()=>{},request:async url=>{
 if(url.includes('/api/livetv/stream/'))return Response.json({streams:[{title:'Other',_fctvLocal:{matchId:1,streamId:2,sportType:3,siteType:2001,apiBase:'https://apis-data10.tcdru136ovur.ru'}},{title:'Canal FR',_fctvLocal:{matchId:1,streamId:1,sportType:3,siteType:2001,apiBase:'https://apis-data10.tcdru136ovur.ru'}}]});
 const id=new URL(url).searchParams.get('streamId');calls.push(id);if(failCanal&&id==='1')return new Response('',{status:503});return new Response(packet,{headers:{'rb-session':'public-fixture'}});
 }});
const result=await p.resolve({provider:'matches',id:'test'});assert.equal(result.options[0].label,'Canal FR');assert.deepEqual(calls,[]);assert.equal(result.options[0].playbackType,'resolver');
failCanal=true;calls.length=0;const fallback=await p.resolve({provider:'matches',id:'test'});assert.equal(fallback.options[0].label,'Canal FR');assert.deepEqual(calls,[]);assert.equal(fallback.options.find(o=>o.label==='Other').manualOnly,true);
console.log('v85: last runtime source, builtin personal removal, France default and Canal FR preference/fallback passed');
