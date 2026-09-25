import assert from 'node:assert/strict';
import {createBowdApi} from '../lib/bowd-api.mjs';
for(const modern of [false,true]){
 const api=createBowdApi(async(url,opts)=>{
  if(url.endsWith('/challenge'))return Response.json({challenge:'test',difficulty:0,exp:1,sig:'test'});
  if(url.endsWith('/resolve')){const r=Response.json({ticket:'test'},{headers:{'set-cookie':'session=ok; Expires=Wed, 09 Sep 2026 23:00:00 GMT; HttpOnly, other=two; Secure'}});if(!modern)Object.defineProperty(r.headers,'getSetCookie',{value:undefined});return r;}
  if(url.endsWith('/token')){assert.match(opts.headers.cookie,/session=ok/);assert.match(opts.headers.cookie,/other=two/);return Response.json({token:'jwt'});}
  return Response.json({channels:[{id:'tf1',name:'TF1'}],nextCursor:null});
 });
 assert.equal((await api.channels()).length,1);
}
console.log('v89: Bowd session works with modern and legacy Fetch cookie headers');
