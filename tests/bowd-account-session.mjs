import assert from 'node:assert/strict';
import {createBowdApi} from '../lib/bowd-api.mjs';
let saved=null;
const calls=[];
const request=async(url,options)=>{
  calls.push(new URL(url).pathname);
  assert(!url.includes('/guest/'));
  if(url.endsWith('/sign-in/username')){
    assert.deepEqual(JSON.parse(options.body),{username:'test',password:'test-password'});
    return Response.json({user:{id:'test'}},{headers:{'set-cookie':'better-auth.session_token=session-value; HttpOnly; Secure; Path=/'}});
  }
  if(url.endsWith('/token')){
    assert.match(options.headers.cookie,/better-auth.session_token=session-value/);
    return Response.json({token:'test-jwt'});
  }
  assert.equal(options.headers.authorization,'Bearer test-jwt');
  return Response.json({countries:[],channels:[{id:'tf1'}]});
};
const api=createBowdApi(request,{saveSession:async value=>{saved=value;}});
await api.authenticateAccount('test','test-password');
assert(!JSON.stringify(saved).includes('test-password'));
assert(!JSON.stringify(saved).includes('test-jwt'));
assert(saved.account);
const restored=createBowdApi(request,{readSession:async()=>saved});
assert.equal((await restored.channels()).length,1);
assert.equal(calls.filter(path=>path.endsWith('/sign-in/username')).length,1);
let failedCalls=0;
const expired=createBowdApi(async()=>{failedCalls++;return Response.json({message:'invalid'},{status:401});},{readSession:async()=>saved});
await assert.rejects(expired.channels(),/Reconnectez le compte/);
assert.equal(failedCalls,1,'Expired account sessions must not retry guest login.');
console.log('BowdTV: account login, password-free persistence, restart restoration and explicit expired-session handling passed.');
