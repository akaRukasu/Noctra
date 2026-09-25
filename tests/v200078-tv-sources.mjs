import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createAdditionalTvProviders} from '../lib/tv-additional-providers.mjs';
const server=(await readFile(new URL('../server.mjs',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const shell=(await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
function between(text,a,b){const start=text.indexOf(a),end=text.indexOf(b,start+a.length);assert(start>=0&&end>start,a);return text.slice(start,end);}
const buffer={};vm.createContext(buffer);vm.runInContext(between(shell,'  function tvAchievableBufferGoal(','  function tvHlsFailurePolicy('),buffer);
assert.equal(buffer.tvStartupBufferGoal({weak:false}),4);
assert.equal(buffer.tvStartupBufferGoal({weak:true}),6);
assert.equal(buffer.tvStartupBufferGoal({weak:false},{live:true,totalduration:120,targetduration:15}),6,'Long segments must not impose a 30-second startup reserve');
assert.equal(buffer.tvStartupBufferGoal({weak:true},{live:true,totalduration:120,targetduration:15}),8);
assert(buffer.tvStartupBufferGoal({weak:false},{live:true,totalduration:3,targetduration:1})<=2,'Short live window must remain achievable');
const request=between(shell,'      const requestStartupPlayback =','      videoEventSignal.addEventListener(\'abort\', () => window.clearTimeout(startupFallbackTimer)');
let plays=0,ahead=0,timers=0;
const deps={videoEventSignal:{aborted:false},playbackSequence:1,tvPlaybackSequence:1,playbackBecameActive:false,startupPlayRequested:false,desktopLive:false,networkProfile:{weak:false},protectedStartupBufferGoal:4,
 video:{play:()=>{plays++;return Promise.resolve();}},tvLatestBufferedWindow:()=>({start:0,end:ahead,duration:ahead}),tvSeekIntoBufferedWindow:()=>false,tvBufferedAhead:()=>ahead,window:{clearTimeout:()=>{},setTimeout:()=>++timers},startupFallbackTimer:0,recordTvDiagnostic:()=>{}};
const start=new Function('deps',`with(deps){${request};return requestStartupPlayback;}`)(deps);
assert.equal(start(),false);assert.equal(plays,0);
ahead=3;assert.equal(start(),false);assert.equal(start(true),true);assert.equal(plays,1,'Deadline starts usable buffered media');
assert.equal(start(),false);deps.startupPlayRequested=false;deps.videoEventSignal.aborted=true;assert.equal(start(true),false);assert.equal(plays,1);

class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const refs=new Map();let seq=0;
const common={URL,Date,Map,Set,Promise,HttpError,AbortController,AbortSignal,
 safeTvRemoteUrl:u=>new URL(u),resolveTvUrl:(u,b)=>new URL(u,b).href,
 decodeTvHtml:s=>s.replaceAll('&amp;','&'),publicTvPageName:s=>s.replace(/<[^>]+>/g,'').trim(),
 normalizeTvChannel:(v,base)=>({...v,id:v.name,embedUrl:new URL(v.embed_url,base).href}),
 issueTvReference:(url,headers,meta)=>{const id=String(++seq);refs.set(id,{url,headers,meta});return id;},publicPath:p=>p,
 normalizedIdentifier:s=>s.replace(/\W/g,''),tvCatalogCache:new Map()};
const sports={...common,fetchPublicTvHtml:async()=>({finalUrl:'https://dlive.sx/',html:'<a href="watch.php?id=130">Sky Sports</a><a href="watch.php?id=130">duplicate</a><a href="api.php">API</a>'})};
vm.createContext(sports);vm.runInContext(between(server,'function parseDlStreamsSports(','async function tvCatalogFromDlStreams(')+between(server,'async function tvCatalogFromSportsPage(','function streamSports99NameFromSlug('),sports);
const daddy=await sports.tvCatalogFromSportsPage({id:'daddy',type:'daddylive',name:'DaddyLive',url:'https://dlive.sx/'});
assert.equal(daddy.channels.length,1);assert.equal(daddy.channels[0].provider,'DaddyLive');assert.equal(daddy.channels[0].embedUrl,'https://dlive.sx/stream/stream-130.php');
sports.fetchPublicTvHtml=async()=>({finalUrl:'https://quellefrappe.click/prog.php',html:'<a href="/regarder-parma-vs-monza-15h00-streaming-direct">Parma - Monza</a><a href="https://other.test/match.php?id=1">Ad</a><a href="/league.php">League</a>'});
const brig=await sports.tvCatalogFromSportsPage({id:'brig',type:'brigitte',name:'BrigitteTV',url:'https://quellefrappe.click/prog.php'});
assert.equal(brig.channels.length,1);assert.equal(brig.channels[0].name,'Parma - Monza');
sports.fetchPublicTvHtml=async()=>{throw new Error('timeout');};
const failed=await sports.tvCatalogFromSportsPage({id:'failed',type:'brigitte',name:'BrigitteTV',url:'https://quellefrappe.click/prog.php'});
assert(failed.warning);assert.match(failed.channels[0].streamKind,/non vérifiée/);

let streamRequests=[];
const streamed={...common,fetchStreamedJson:async u=>{streamRequests.push(u);return [{embedUrl:'https://player.test/fr',language:'French',hd:true},{embedUrl:'https://player.test/en',language:'English'}];}};
vm.createContext(streamed);vm.runInContext(between(server,'function streamedMatchChannel(','async function fetchStreamedJson(')+between(server,'async function streamedPlayerChannels(','async function tvCatalogFromStreamed('),streamed);
const ch=streamed.streamedDeferredChannel({id:'event-1',title:'Match',sources:[{source:'alpha',id:'123'},{source:'bravo',id:'456'}]},'https://streamed.pk/','Sports');
assert.equal(streamRequests.length,0,'Opening the catalogue must not resolve any player');
const choices=await streamed.resolveStreamedReference(refs.get(ch.resolverUrl.split('/').at(-1)));
assert.equal(choices.options.length,2);assert.equal(streamRequests.length,0);
const selected=await streamed.resolveStreamedReference(refs.get(choices.options[1].resolveUrl.split('/').at(-1)));
assert.equal(streamRequests.length,1);assert.match(streamRequests[0],/\/api\/stream\/bravo\/456$/);assert.equal(selected.options.length,2);
const mirror={...common,fetchTvRemote:async u=>{streamRequests.push(u);return new Response(new URL(u).hostname==='streamed.pk'?'error':'[]',{status:new URL(u).hostname==='streamed.pk'?503:200});}};
vm.createContext(mirror);vm.runInContext(between(server,'async function fetchStreamedJson(','async function streamedPlayerChannels('),mirror);
streamRequests=[];await mirror.fetchStreamedJson('https://streamed.pk/api/sports','https://streamed.pk/');assert.equal(streamRequests.length,2);assert.equal(new URL(streamRequests[1]).hostname,'streamed.st');

let cancelled=0;const origins=[];
const oha={...common,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,5)),clearTimeout,fetchTvRemote:(url,opts)=>{
 origins.push(new URL(url).hostname);
 if(new URL(url).hostname==='178.83.5.50')return Promise.resolve(new Response(JSON.stringify({items:[{name:'Channel'}],nextCursor:null})));
 return new Promise((resolve,reject)=>{opts.signal.addEventListener('abort',()=>{cancelled++;reject(opts.signal.reason);},{once:true});});
}};
vm.createContext(oha);vm.runInContext(between(server,'let ohaHealthyRoot =','async function ohaCatalogGroup('),oha);
const cat=await oha.ohaCatalogPage('https://kool.ws/live','France',null,3000);
assert.equal(new URL(cat.root).hostname,'178.83.5.50');assert(cancelled>0,'Losing mirror requests are cancelled');
origins.length=0;await oha.ohaCatalogPage('https://kool.ws/live','France',null,3000);assert.equal(origins[0],'178.83.5.50','Remember working mirror');
assert(oha.ohaRootAlternatives('https://kool.ws/live').includes('http://vavoo.top/live'));

const providerRefs=[];
const additional=createAdditionalTvProviders({publicPath:p=>p,readKeys:async()=>({}),issueReference:(url,h,meta)=>{providerRefs.push(meta);return 'r'+providerRefs.length;},streamUrl:id=>id,
 request:async()=>new Response(JSON.stringify({catalogs:[{id:'vavoo_france',name:'France'},{id:'northlive_fr',name:'North'},{id:'newfamily_sports',name:'New sports'}]}))});
const all=await additional.catalog('all');assert.equal(all.groups.length,3);assert.equal(providerRefs[2].provider,'newfamily');
const vip=await additional.catalog('iptv');assert.equal(vip.channels.length,0);assert.match(vip.warning,/accès Movix/);
console.log('v200.0.78: bounded startup, short playlists, cancellation, DaddyLive/Brigitte parsers, explicit portal fallback, lazy Streamed variants/mirror, OHA mirror race/cancellation/sticky origin, all Movix bouquets and VIP boundaries OK');
