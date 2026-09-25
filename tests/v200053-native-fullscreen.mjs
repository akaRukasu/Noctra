import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const start=src.indexOf('  async function toggleTvFullscreen()');
const end=src.indexOf('  function tryTvAutoPictureInPicture()',start);
async function scenario({apple=false,coarse=true,ready=4,frame=false,reject=false}={}) {
 const calls=[];
 const video={readyState:ready,paused:false,requestFullscreen:async()=>{calls.push('video');if(reject)throw Error('denied')}};
 const screen={requestFullscreen:async()=>calls.push('screen')};
 const doc={body:{classList:{contains:()=>false}},querySelector:s=>s==='.noctra-tv-screen'?screen:s.includes('video')?(frame?null:video):s.includes('embed')?(frame?{}:null):null};
 const fn=new Function('document','window','tvFullscreenTarget','tvAppleTouchDevice','enterTvNativeVideoFullscreen','toast','showTvDesktopLiveControls','enterTvPseudoFullscreen',src.slice(start,end)+';return toggleTvFullscreen;')(doc,{matchMedia:()=>({matches:coarse})},()=>({}),()=>apple,()=>{calls.push('apple');return !reject},m=>calls.push('message'),()=>{},()=>calls.push('expanded'));
 await fn();return {calls,video};
}
assert.deepEqual((await scenario({apple:true})).calls,['apple']);
assert.deepEqual((await scenario()).calls,['video']);
assert.deepEqual((await scenario({ready:0})).calls,['message']);
assert.deepEqual((await scenario({apple:true,frame:true})).calls,['expanded']);
assert.deepEqual((await scenario({coarse:false})).calls,['screen']);
const denied=await scenario({reject:true});assert.equal(denied.video.controls,true);assert.deepEqual(denied.calls,['video','expanded']);
assert.ok(src.slice(start,end).includes('enterTvPseudoFullscreen('));
console.log('v200.0.53: iOS and Android video first; loading guard; iframe guidance; desktop retained; denied request preserves playback and enables native controls.');
