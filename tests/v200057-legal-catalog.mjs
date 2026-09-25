import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeProviders,providerFilter,regionalOffers,verifyProviderItems} from '../lib/legal-catalog.mjs';
import {discoveryCatalogPage} from '../lib/discovery-pagination.mjs';
const providers=normalizeProviders([
  {provider_id:8,provider_name:'Netflix',display_priorities:{FR:1}},
  {provider_id:1796,provider_name:'Netflix Standard with Ads'},
  {id:8,name:' Netflix '}, {id:119,name:'Amazon Prime Video'},
  {id:2100,name:'Amazon Prime Video with Ads'},
  {id:350,name:'Apple TV'}, {id:2,name:'Apple TV Store'},
  {id:531,name:'Paramount Plus'}, {id:2303,name:'Paramount Plus Premium'},
  {id:582,name:'Paramount+ Amazon Channel'},
]);
assert.equal(providers.length,6);
assert.equal(providers.find(p=>p.name==='Netflix').id,'8|1796');
assert.equal(providers.find(p=>p.name==='Amazon Prime Video').id,'119|2100');
assert.ok(providers.some(p=>p.name==='Paramount+ Amazon Channel'));
assert.equal(providerFilter('8|1796|8'),'8|1796');
for(const bad of ['8,1796','8&region=US','0','-8','abc','1|'.repeat(20)]) assert.equal(providerFilter(bad),'');
const payload={results:{FR:{flatrate:[{provider_id:8,provider_name:'Netflix'}],rent:[{provider_id:119,provider_name:'Amazon Prime Video'}]},US:{flatrate:[{provider_id:531,provider_name:'Paramount Plus'}]}}};
assert.deepEqual(regionalOffers(payload,'FR'),[{id:8,name:'Netflix',kind:'flatrate'}]);
assert.deepEqual(regionalOffers(payload,'BE'),[]);
assert.equal(regionalOffers({watchProviders:[{iso_3166_1:'FR',ads:[{id:1796,name:'Netflix Standard with Ads'}]}]},'FR')[0].name,'Netflix');
let active=0,max=0;
const items=Array.from({length:40},(_,i)=>({id:i+1,mediaType:i%2?'tv':'movie'}));
const verified=await verifyProviderItems([...items,items[0]],'8|1796',async(type,id)=>{
  active++; max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;
  return id%2?[{id:1796,name:'Netflix',kind:'flatrate'}]:[{id:119,name:'Amazon Prime Video',kind:'flatrate'}];
},'FR');
assert.equal(verified.length,20);assert.ok(max<=6);
assert.ok(verified.every(p=>p.legalAvailability.region==='FR'));
await assert.rejects(verifyProviderItems(items,'8',async()=>{throw Error('offline')},'FR'));
assert.equal(discoveryCatalogPage([], [['movie','streaming',{page:1,total_pages:20}]],1).nextPage,2);
const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const start=server.indexOf('async function providerDiscovery('),end=server.indexOf('\nasync function enrichDiscoveryLegalPlatforms',start);
const code=server.slice(start,end);let calls=[];
const factory=new Function('tmdbConfigured','tmdb','jellyseerr','discoveryRegion','discoverySeerrLanguage','discoveryGenreId','normalizedDiscoveryItem','filterDiscoveryCatalog','verifyProviderItems','discoveryLegalOffers','discoveryCatalogPage',code+';return providerDiscovery;');
for(const direct of [true,false]) {
  calls=[];
  const query=async(...args)=>{calls.push(args);return {page:3,total_pages:10,results:[{id:1}]};};
  const catalog=factory(()=>direct,query,query,'FR','fr',()=>28,(r,t)=>({...r,mediaType:t}),(rows)=>rows,verifyProviderItems,async()=>[{id:8,name:'Netflix',kind:'flatrate'}],discoveryCatalogPage);
  const page=await catalog('streaming','8|1796','action',3);
  assert.equal(page.results.length,2);assert.equal(page.nextPage,4);assert.equal(calls.length,2);
  if(direct) for(const [,params] of calls) {assert.equal(params.watch_region,'FR');assert.equal(params.with_watch_providers,'8|1796');assert.equal(params.with_genres,28);assert.equal(params.page,3);assert.ok(!('primary_release_date.gte' in params));}
  else for(const [path] of calls) {const params=new URL('http://local'+path).searchParams;assert.equal(params.get('watchProviders'),'8|1796');assert.equal(params.get('watchRegion'),'FR');assert.equal(params.get('page'),'3');}
}
console.log('v200.0.57: provider grouping, reseller boundaries, regional subscription verification, no rental/US leakage, bounded concurrency, duplicate media, failures, pagination, TMDB and Seerr query contracts OK');
