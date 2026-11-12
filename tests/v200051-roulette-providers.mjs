import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {rouletteFilters,drawRoulette} from '../lib/roulette.mjs';
import {parseCsv,parseNorthPlayer,createAdditionalTvProviders,additionalTvSources} from '../lib/tv-additional-providers.mjs';

for(const query of ['count=11','count=0','rating=NaN','rating=11','minYear=2025&maxYear=2020','minYear=1','count=1.5'])assert.throws(()=>rouletteFilters(new URLSearchParams(query)));
const filters=rouletteFilters(new URLSearchParams('library=films&count=3&genre=Drame&rating=7&minYear=2000&maxYear=2020&unplayed=1'));
let calls=[];
const result=await drawRoulette({filters,libraries:{Films:{id:'films',type:'movies'},Animes:{id:'anime',type:'tvshows'}},
  items:async params=>{calls.push(params);return [{Id:'one',Name:'Titre <test>',Genres:['Drame'],ImageTags:{Primary:'tag'}}];},imageUrl:i=>'/image/'+i.Id});
assert.equal(calls.length,1);assert.equal(calls[0].ParentId,'films');assert.equal(calls[0].IncludeItemTypes,'Movie');assert.equal(calls[0].IsPlayed,false);
assert.equal(calls[0].MinCommunityRating,7);assert.equal(calls[0].Genres,'Drame');assert.equal(calls[0].SortBy,'Random');assert.equal(calls[0].Years.split(',').length,21);
assert.equal(result.results.length,1);assert.equal(result.requested,3);assert.equal(result.results[0].image,'/image/one');
await assert.rejects(drawRoulette({filters:{...filters,library:'forbidden'},libraries:{},items:()=>assert.fail(),imageUrl:()=>''}));
assert.equal((await drawRoulette({filters:{...filters,library:''},libraries:{},items:()=>assert.fail(),imageUrl:()=>''})).results.length,0);
assert.deepEqual(parseCsv('id,name,active\n1,"Nom, avec virgule",true\n2,"Une ""citation""",false'),[{id:'1',name:'Nom, avec virgule',active:'true'},{id:'2',name:'Une "citation"',active:'false'}]);
assert.deepEqual(parseNorthPlayer('const PLAY_TOKEN="opaque"; const VARIANTS=[{"slug":"bein-1-b","active":true},{"slug":"bad","active":false}];'),{token:'opaque',variants:[{slug:'bein-1-b',active:true}]});
assert.equal(additionalTvSources.length,6);
assert.ok(additionalTvSources.some(source => source.provider === 'FCTV33' && source.section === 'sports'));
assert.ok(!additionalTvSources.some(source => source.family === 'all'));

let refs=new Map(),count=0,requests=[];
const key='private-test-key',northkey='private-north-key';
const providers=createAdditionalTvProviders({publicPath:p=>'/base'+p,readKeys:async()=>({movix:key,northlive:northkey}),
  issueReference:(url,headers,meta)=>{const id='opaque'+(++count);refs.set(id,{url,headers,meta});return id;},streamUrl:id=>'/base/stream/'+id,
  request:async (url,opts)=>{
    requests.push({url,opts});const u=new URL(url);let data;
    if(u.pathname.startsWith('/api/livetv/') || u.pathname==='/api/check-vip') {
      assert.equal(u.origin,'https://api.movix.dog');
      assert.equal(opts.headers.referer,'https://movix.dog/');
    }
    if(u.pathname==='/api/check-vip'){assert.equal(opts.headers['x-access-key'],key);data={vip:true};}
    else if(u.pathname==='/api/livetv/iptv/categories'){assert.equal(opts.headers['x-access-key'],key);data={categories:Array.from({length:353},(_,i)=>({category_id:String(i),category_name:'FR '+i}))};}
    else if(u.pathname.includes('/iptv/streams/'))data={streams:[{stream_id:123,name:'Chaîne'}]};
    else if(u.pathname.includes('/iptv/stream-url/'))data={streams:[{url:'https://cdn.example/live.m3u8?token=secret',title:'HD'}]};
    else if(u.pathname.endsWith('/player'))return new Response('const PLAY_TOKEN="play-token"; const VARIANTS=[{"slug":"bein-sports-1-hd-b","active":true}];');
    else if(u.searchParams.get('route')==='play_url'){
      assert.equal(opts.headers.authorization,'Bearer '+northkey);assert.equal(opts.headers.origin,'https://northlive.lol');
      assert.equal(JSON.parse(opts.body).play_token,'play-token');data={success:true,url:'https://cdn.example/north.m3u8'};
    } else assert.fail(u.pathname);
    return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  }});
await providers.verify('movix',key);
const cat=await providers.catalog('iptv');assert.equal(cat.groups.length,353,'Do not truncate the available bouquets');
const channels=await providers.group(refs.get(cat.groups[0].ref).meta);assert.equal(channels.channels.length,1);
const playback=await providers.resolve(refs.get(channels.channels[0].resolverUrl.split('/').pop()).meta);
assert.equal(playback.options[0].playbackType,'stream');assert.ok(playback.options[0].streamUrl.startsWith('/base/stream/opaque'));
assert.equal(refs.get(playback.options[0].streamUrl.split('/').pop()).headers.referer,'https://movix.dog/');
assert.ok(additionalTvSources.filter(s=>s.id.startsWith('movix-')).every(s=>new URL(s.url).origin==='https://api.movix.dog'));
assert.ok(!JSON.stringify([cat,channels,playback]).includes(key));assert.ok(!JSON.stringify(playback).includes('token=secret'));
const north=await providers.resolve({provider:'northlive',id:'northlive_bein-sports-1-fhd-b'});
assert.equal(north.options.length,2);assert.ok(!JSON.stringify(north).includes(northkey));assert.ok(!JSON.stringify(north).includes('play-token'));

const shell=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const start=shell.indexOf('  function createTvContinuityGuard('),end=shell.indexOf('\n  function tvSeekIntoBufferedWindow',start);
const guardFactory=new Function(shell.slice(start,end)+';return createTvContinuityGuard;')();
const hls={autoLevelEnabled:true,autoLevelCapping:-1,capLevelToPlayerSize:true,currentLevel:2,levels:[{},{},{}]};
const guard=guardFactory(hls,{bufferAhead:()=>2,reserveGoal:()=>16,onAction:()=>{}});
guard.pending({level:2,duration:4,elapsedMs:1000});assert.equal(hls.autoLevelCapping,-1);
guard.pending({level:2,duration:4,elapsedMs:5000,type:'audio'});assert.equal(hls.autoLevelCapping,-1);
guard.pending({level:2,duration:4,elapsedMs:5000});assert.equal(hls.autoLevelCapping,1,'Protect before the slow fragment finishes');
guard.release();assert.equal(hls.autoLevelCapping,-1);assert.equal(hls.capLevelToPlayerSize,true);
hls.autoLevelEnabled=false;guard.pending({level:2,duration:4,elapsedMs:10000});assert.equal(hls.autoLevelCapping,-1,'Respect manual quality');
console.log('v200.0.51: roulette permissions/filters/empty results; CSV quoting; all 353 bouquets; authenticated provider protocol; secret-free responses; in-flight quality guard OK');

const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const scopedSource=server.slice(server.indexOf('function issueScopedTvSegmentReference('),server.indexOf('\nfunction rewriteTvPlaylist('));
const segmentRefs=new Map(),segmentCache=new Map();let counter=0;
const scoped=new Function('createHash','safeTvRemoteUrl','tvReferences','tvProviderChildReferenceCache','issueTvReference',scopedSource+';return issueScopedTvSegmentReference;')(
 createHash,u=>new URL(u),segmentRefs,segmentCache,(url,headers,meta)=>{const id='segment'+ ++counter;segmentRefs.set(id,{url,headers,meta,expiresAt:Date.now()+60000});return id;});
const one=scoped('https://cdn.example/42.ts?token=old',{cookie:'old'},'playbackA',42);
assert.equal(scoped('https://cdn.example/42.ts?token=new',{cookie:'new'},'playbackA',42),one,'Rotating signatures preserve HLS segment identity');
assert.equal(segmentRefs.get(one).url,'https://cdn.example/42.ts?token=new');
assert.equal(segmentRefs.get(one).headers.cookie,'new');
assert.notEqual(scoped('https://cdn.example/42.ts?token=new',{},'playbackB',42),one,'Separate playback sessions cannot share credentials');
assert.notEqual(scoped('https://cdn.example/42.ts?token=new',{},'playbackA',43),one,'Different media sequences remain separate');
assert.notEqual(scoped('https://cdn.example/43.ts?token=new',{},'playbackA',42),one,'Different media paths remain separate');
console.log('Signed segment rotation, updated credentials and playback isolation OK');
