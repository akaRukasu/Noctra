import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {additionalTvSources,createAdditionalTvProviders} from '../lib/tv-additional-providers.mjs';
const shell=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
assert.ok(!additionalTvSources.some(s=>s.family==='matches'));
assert.ok(!server.includes("{ id: 'streamsports99-sports',"));
assert.ok(server.includes("{ id: 'streamsports99-live-tv',"));
const code=shell.slice(shell.indexOf('  function materialIconFallback('),shell.indexOf('\n  function repairMaterialIconFallbacks('));
const icon=new Function('normalizedText',code+';return materialIconFallback;')(s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
for(const [text,expected] of [['Lire','play'],['Tout lire à partir d’ici','play'],['Sélectionner','select'],['Ajouter à la collection','library'],['Ajouter à la liste de lecture','playlist'],['Télécharger','download'],["Copier l’URL du flux",'copy']]){
 const action={textContent:text,querySelector:()=>null,getAttribute:()=>null};
 assert.equal(icon({classList:['material-icons'],textContent:'\ue000',getAttribute:()=>null,closest:()=>action}),expected,text);
}
const refs=new Map();let counter=0;let ended=false;let external=false;
const p=createAdditionalTvProviders({publicPath:p=>p,streamUrl:t=>'/stream/'+t,readKeys:async()=>({}),issueReference:(url,headers,meta)=>{const id=String(++counter);refs.set(id,{url,headers,meta});return id;},request:async url=>{
 if(url==='https://reneveo.store/live')return new Response('no catalogue');
 if(String(url).endsWith('channels_rows.csv'))return new Response('id,name,active,source_1_url,source_1_type,source_2_url,source_2_type\n1,TF1,true,https://bad.example/live.m3u8,hls,https://good.example/live.m3u8,hls'+(external?'\n2,Web,true,https://bad.example/live.m3u8,hls,https://web.example/player,embed':''));
 if(String(url).includes('bad.example'))throw Error('offline');
 return new Response('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts'+(ended?'\n#EXT-X-ENDLIST':''));
}});
const channels=await p.catalog('reneveo');const resolved=await p.resolve(refs.get(channels.channels[0].resolverUrl.split('/').pop()).meta);
assert.equal(resolved.options[0].label,'RénéVéo · Source 2');
assert.equal(resolved.options.length,2,'Keep the other published source as a fallback');
ended=true;await assert.rejects(p.resolve(refs.get(channels.channels[0].resolverUrl.split('/').pop()).meta),/ne répondent pas/);
console.log('v200.0.52: sports removal scoped correctly; all seven context menu actions mapped; unavailable first RénéVéo source skipped OK');
const positionCode=shell.slice(shell.indexOf('  function setCarouselPosition('),shell.indexOf('\n  function homeCarouselCardStep('));
const styles={setProperty(k,v){this[k]=v;}};
const windows={setTimeout:()=>0,matchMedia:()=>({matches:false})};
const position=new Function('window','homeCarouselTargets',positionCode+';return setCarouselPosition;')(windows,new Map());
position({},320,true,{slider:{style:styles}});
assert.match(styles.transition,/440ms/);assert.equal(styles.transform,'translate3d(-320px, 0, 0)');
windows.matchMedia=()=>({matches:true});position({},640,true,{slider:{style:styles}});assert.equal(styles.transition,'none');
console.log('Carousel animation and reduced-motion preference OK');

// A failed HLS probe must not discard an available manual web option.
// Isolated fixture avoids catalogue cache from the preceding scenario.
const webRefs=new Map();let refId=0;
const webProvider=createAdditionalTvProviders({publicPath:p=>p,streamUrl:t=>'/stream/'+t,readKeys:async()=>({}),issueReference:(u,h,m)=>{const id=String(++refId);webRefs.set(id,m);return id;},request:async url=>{
 if(String(url).endsWith('channels_rows.csv'))return new Response('id,name,active,source_1_url,source_1_type,source_2_url,source_2_type\n2,Web,TRUE,https://bad.example/live.m3u8,hls,https://web.example/player,embed');
 if(String(url).includes('bad.example'))throw Error('offline');
 return new Response('no catalogue');
}});
const webCatalog=await webProvider.catalog('reneveo');assert.equal(webCatalog.channels.length,1);
const webResolved=await webProvider.resolve(webRefs.get(webCatalog.channels[0].resolverUrl.split('/').pop()));
assert.equal(webResolved.options[0].playbackType,'embed');assert.equal(webResolved.options[0].manualOnly,true);
console.log('RénéVéo: active flag normalization and manual web fallback retained after HLS failures OK');
