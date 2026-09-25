import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const s=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const start=s.indexOf('function liveWatchComparableName('),end=s.indexOf('function liveWatchFamilyLabel(',start);
const name=new Function('normalizedIdentifier','cleanLiveWatchChannelName',s.slice(start,end)+';return liveWatchComparableName;')(s=>s.toLowerCase(),s=>s);
assert.equal(name('beIN SPORTS 1 FR','France'),name('BEIN SPORTS 1','France'));
assert.notEqual(name('beIN SPORTS 1 FR','USA'),name('BEIN SPORTS 1','France'));
assert.notEqual(name('France 2','France'),name('France 3','France'));
const a=s.indexOf('async function liveWatchCrossFamilyVariants('),b=s.indexOf('// Compatibilité des anciens tests/catalogues V38.',a);
const fallback=new Function('liveWatchChannelVariants','liveWatchFamilyLabel',s.slice(a,b)+';return liveWatchCrossFamilyVariants;')(async kind=>[{kind,id:kind+'-1'}],x=>x);
const variants=await fallback('daddy','broken','beIN SPORTS 1 FR','France','',[{kind:'daddy',id:'broken'}]);
assert.ok(variants.some(v=>v.kind==='main'&&v.crossFamily));
assert.ok(variants.some(v=>v.kind==='north'&&v.crossFamily));
console.log('Daddy fallback: same channel normalization, country isolation and existing verified fallback passed');
const d=s.indexOf('async function decorateLiveWatchVipPlayback('),e=s.indexOf('function validLiveWatchChannelReference(',d);
const decorate=new Function('liveWatchQuickVipStatus','liveWatchEmbedReference','publicPath','cleanLiveWatchChannelName','liveWatchFamilyLabel',s.slice(d,e)+';return decorateLiveWatchVipPlayback;')(
  async()=>({active:true}), channel=>({kind:'daddy',id:channel.id}), x=>x,x=>x,x=>x
);
const catalog=await decorate({channels:[{id:'116',name:'beIN Sports 1 France',country:'France',embedUrl:'https://livewatch.top/embed/daddy/116'}]}, {id:'livewatch-daddy',family:'daddy'});
assert.equal(catalog.channels[0].playbackType,'resolver');
assert.match(catalog.channels[0].resolverUrl,/\/resolve\/daddy\/116\?name=/);
assert.equal(catalog.channels[0].vipGenericPage,false);
console.log('Daddy catalogue routes clicks to the family resolver, not the generic embed');
