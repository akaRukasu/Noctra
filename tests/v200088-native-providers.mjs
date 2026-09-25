import assert from 'node:assert/strict';
import {createBowdApi} from '../lib/bowd-api.mjs';
import {parseBrigitteNativeDocument} from '../lib/brigitte-players.mjs';
let challenges=0,pages=0;
const api=createBowdApi(async(url,options)=>{
 if(url.endsWith('/challenge')){challenges++;return Response.json({challenge:'test',difficulty:0,exp:Date.now()+60000,sig:'test'});}
 if(url.endsWith('/resolve')){assert.equal(JSON.parse(options.body).pow,'0');return Response.json({ticket:'test'},{headers:{'set-cookie':'session=test; Secure; HttpOnly'}});}
 if(url.endsWith('/token')){assert.equal(options.headers.cookie,'session=test');return Response.json({token:'fixture'});}
 assert.equal(options.headers.authorization,'Bearer fixture');
 const u=new URL(url);assert.equal(u.searchParams.get('country'),'France');pages++;
 return Response.json(u.searchParams.has('cursor')?{channels:[{id:'a'},{id:'b'}],nextCursor:null}:{channels:[{id:'a'}],nextCursor:'2'});
});
const rows=await api.channels();assert.deepEqual(rows.map(x=>x.id),['a','b']);assert.equal(challenges,1);assert.equal(pages,2);
assert.throws(()=>api.stream('../bad'));
const result=parseBrigitteNativeDocument('<script>const streamUrls = ["https://media.test/live.m3u8?x=1\\u0026y=2"];</script>','https://player.test/');
assert.equal(result.urls[0],'https://media.test/live.m3u8?x=1&y=2');
assert.equal(parseBrigitteNativeDocument('<script>const streamUrls = [evil()];</script>','https://player.test/').urls.length,0);
assert.equal(parseBrigitteNativeDocument('<iframe src="/next?a=1&amp;b=2"></iframe>','https://player.test/').next,'https://player.test/next?a=1&b=2');
console.log('v88: guest session, pagination, deduplication, IDs and non-executing Brigitte parser passed');
