import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTvSegmentCache} from '../lib/tv-segment-cache.mjs';
const segment=Buffer.alloc(188*10,0x47);
let now=0,loads=0;
const cache=createTvSegmentCache({maxBytes:segment.length*2,maxSegmentBytes:segment.length+1,ttl:20,clock:()=>now});
const load=async()=>{loads++;return new Response(segment,{headers:{'content-type':'video/mp2t'}});};
await Promise.all([cache.prime('one',load),cache.prime('one',load)]);assert.equal(loads,1,'Single flight for identical token');
assert.deepEqual((await cache.read('one')).body,segment);
assert.equal(await cache.read('another-private-token'),null,'Do not mix distinct authorization references');
await cache.prime('two',load);await cache.prime('three',load);assert.equal(cache.stats().entries,2);assert.equal(cache.get('one'),null);assert.equal(cache.stats().bytes,segment.length*2);
now=21;assert.equal(cache.get('two'),null);assert.equal(cache.stats().bytes,0);
for(const response of [new Response('<html>error</html>'),new Response(segment,{status:206}),new Response(segment,{status:403}),new Response(Buffer.alloc(segment.length+2))]){
 await cache.prime('bad',async()=>response);assert.equal(cache.get('bad'),null);
}
let aborted=false;
const pending=cache.prime('slow',signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('cancel'));},{once:true})));
assert.equal(await cache.read('slow',5),null);await pending;assert.equal(aborted,true,'Demand does not wait for the six-second speculative deadline');
const parallel=createTvSegmentCache({concurrency:2});let running=0,max=0;const resolvers=[];
const tasks=Array.from({length:20},(_,i)=>parallel.prime(String(i),signal=>new Promise(resolve=>{running++;max=Math.max(max,running);const done=()=>{running--;resolve(new Response(segment));};resolvers.push(done);signal.addEventListener('abort',done,{once:true});})));
assert.ok(parallel.stats().queued<=6);assert.equal(max,2);
parallel.clear();await Promise.all(tasks);assert.equal(parallel.stats().entries,0);

// Production playlist rewrite: only complete EXTINF media URIs, no keys,
// playlists, byte ranges, LL-HLS parts or VOD.
const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const a=source.indexOf('function rewriteTvPlaylist('),b=source.indexOf('\nfunction detectTvImageMime',a);
let warmed=[],references=[];
const rewrite=new Function('HttpError','resolveTvUrl','tvChildReferenceHeaders','issueStableProviderChildReference','tvPublicStreamUrl','warmTvSegments',`${source.slice(a,b)};return rewriteTvPlaylist;`)(Error,(v,base)=>new URL(v,base).href,h=>h,(url,headers,provider,forceHls)=>{references.push({url,forceHls});return String(references.length);},token=>'/stream/'+token,items=>warmed=items);
const playlist='#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:6,\none.ts\n#EXTINF:6,\ntwo.ts';
rewrite(playlist,'https://provider.test/live/',{}, {provider:'OHA'});assert.equal(warmed.length,2);assert.ok(warmed.every(s=>references[Number(s.token)-1].url.endsWith('.ts')));
for(const suffix of ['\n#EXT-X-ENDLIST','\n#EXT-X-BYTERANGE:512@0','\n#EXT-X-PART:DURATION=1,URI="part.m4s"']){rewrite(playlist+suffix,'https://provider.test/');assert.equal(warmed.length,0);}
rewrite('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000\nhigh.m3u8','https://provider.test/');assert.equal(warmed.length,0);
console.log('v200.0.50: bounded segment cache, TTL/eviction, single flight, auth-token isolation, cancellation, invalid responses and playlist exclusions OK');
// Execute the production relay's cache branch and its Range/miss fallback.
const {EventEmitter}=await import('node:events');
const relayCache=createTvSegmentCache();await relayCache.prime('ready',load);
const refs=new Map(['ready','miss'].map(key=>[key,{url:'https://provider.test/media.ts',headers:{},expiresAt:Date.now()+60000,meta:{finiteSegment:true}}]));
let upstreamRequests=0;
const proxySource=source.slice(source.indexOf('async function proxyTvStream('),source.indexOf('\nasync function readJsonBody',source.indexOf('async function proxyTvStream(')));
const proxy=new Function('tvReferences','HttpError','tvSegmentCache','safeTvRemoteUrl','fetchTvRemoteUntilHeaders','pipeRemoteResponseBody',`${proxySource};return proxyTvStream;`)(refs,Error,relayCache,v=>new URL(v),async()=>{upstreamRequests++;return new Response(segment)},async(response,res)=>res.end(Buffer.from(await response.arrayBuffer())));
function response(){const res=new EventEmitter();res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;};res.end=body=>{res.body=body;res.emit('finish');};return res;}
let res=response();await proxy('ready',{headers:{}},res);assert.equal(upstreamRequests,0);assert.equal(res.headers['x-noctra-relay'],'memory-hit');assert.deepEqual(res.body,segment);
res=response();await proxy('ready',{headers:{range:'bytes=0-10'}},res);assert.equal(upstreamRequests,1,'Range bypasses complete-segment cache');
res=response();await proxy('miss',{headers:{}},res);assert.equal(upstreamRequests,2,'Miss uses the original streaming path');
await assert.rejects(proxy('expired',{headers:{}},response()));
relayCache.clear();
console.log('v200.0.50 relay: ready segment served without upstream IO, Range and miss preserve streaming, unknown reference rejected OK');
