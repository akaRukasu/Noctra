import assert from 'node:assert/strict';
import {createBowdApi} from '../lib/bowd-api.mjs';
for(const [status,reason] of [[403,'GUEST_NOT_ALLOWED'],[403,'SECRET_PROVIDER_MESSAGE'],[502,'SECRET_PROVIDER_MESSAGE']]){
  let calls=0;
  const api=createBowdApi(async url=>{
    calls++;
    if(url.endsWith('/challenge'))return Response.json({challenge:'test',difficulty:0,exp:1,sig:'test'});
    assert(url.endsWith('/resolve'));
    return Response.json({message:reason,token:'SECRET_TOKEN'},{status});
  });
  await assert.rejects(api.channels(),error=>{
    assert(!error.message.includes('SECRET_'));
    assert(error.message.includes(String(status)));
    if(reason==='GUEST_NOT_ALLOWED')assert.equal(error.code,'BOWD_GUEST_NOT_ALLOWED');
    else assert.match(error.message,/validation de la session invitée/);
    return true;
  });
  assert.equal(calls,2,'A refusal must stop authentication before requesting channels.');
}
console.log('BowdTV: explicit guest refusal, safe errors, no retries or catalogue request after refusal.');
