import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {playerFixture} from './v200048-tv-recovery.mjs';
const source=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const a=source.indexOf('  function tvConnectionProfile()'),b=source.indexOf('  function tvAppleTouchDevice()',a);
const profile=new Function('navigator','window','tvAppleTouchDevice',source.slice(a,b)+';return tvConnectionProfile();');
assert.equal(profile({connection:{downlink:1.5,rtt:100}},{matchMedia:()=>({matches:true})},()=>false).weak,true);
assert.equal(profile({connection:{downlink:10,rtt:30}},{matchMedia:()=>({matches:true})},()=>false).weak,false);
for(const weak of [false,true]){
 const p=await playerFixture('OHA',false,{section:'channels',weak});
 const c=p.deps.tvHls.config;
 assert.equal(c.appendTimeout,30_000);
 assert.ok(c.maxBufferLength>=60);
 assert.ok(c.maxMaxBufferLength>=90);
 assert.equal(c.manifestLoadPolicy.default.timeoutRetry.maxNumRetry,2);
 const retry=c.manifestLoadPolicy.default.errorRetry;
 assert.equal(retry.shouldRetry(retry,0,false,{code:403},true),false);
 assert.equal(retry.shouldRetry(retry,0,false,{code:503},true),true);
}
console.log('TV continuity: desktop bandwidth, forward reserve, transient retries and authorization failures passed');
