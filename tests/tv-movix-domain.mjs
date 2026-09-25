import assert from 'node:assert/strict';
import {additionalTvSources,createAdditionalTvProviders} from '../lib/tv-additional-providers.mjs';

const calls=[], refs=[];
const provider=createAdditionalTvProviders({
  publicPath:x=>x,streamUrl:x=>'/stream/'+x,readKeys:async()=>({movix:'test-key'}),
  issueReference:(url,headers,meta)=>{refs.push({url,headers,meta});return String(refs.length);},
  request:async(url,options)=>{
    calls.push({url,headers:options.headers});
    const path=new URL(url).pathname;
    const body=path.endsWith('/manifest') ? {catalogs:[{id:'vavoo_france',name:'France'},{id:'northlive_sport',name:'Sport'}]}
      :path.endsWith('/categories') ? {categories:[{category_id:1,category_name:'FR | HEVC'}]}
      :path.includes('/catalog/') ? {metas:[{id:'channel-1',name:'Test'}]}
      :path.includes('/streams/') ? {streams:[{stream_id:1,name:'Test'}]}
      :path.endsWith('/check-vip') ? {vip:true}
      :{streams:[{url:'https://cdn.example/live.m3u8'}]};
    return new Response(JSON.stringify(body));
  }
});
for(const family of ['vavoo','northlive','iptv']){
  const catalog=await provider.catalog(family);
  assert.equal(catalog.groups.length,1);
  const group=await provider.group({provider:family,id:catalog.groups[0].id});
  assert.equal(group.channels.length,1);
  assert.equal((await provider.resolve({provider:family,id:'channel-1'})).options.length,1);
}
await provider.verify('movix','test-key');
assert.equal(calls.filter(call=>call.url.endsWith('/manifest')).length,1,'Public bouquets share the manifest cache');
assert.ok(calls.every(call=>new URL(call.url).origin==='https://api.movix.college'));
assert.ok(calls.every(call=>call.headers.referer==='https://movix.college/'));
assert.ok(calls.filter(call=>call.url.includes('/iptv/')).every(call=>call.headers['x-access-key']==='test-key'));
assert.ok(additionalTvSources.filter(s=>s.id.startsWith('movix-')).every(s=>s.url.startsWith('https://api.movix.college/')));
assert.ok(refs.filter(ref=>ref.url.startsWith('https://cdn.example')).every(ref=>ref.headers.referer==='https://movix.college/'));
console.log('Movix: Vavoo, Northlive, IPTV catalogs/resolvers/VIP verification use the current API and referer.');
