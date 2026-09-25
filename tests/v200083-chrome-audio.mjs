import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const shell=fs.readFileSync(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const part=(a,b)=>shell.slice(shell.indexOf(a),shell.indexOf(b,shell.indexOf(a)+a.length));
const ctx={};vm.createContext(ctx);
vm.runInContext(part('  function setTvSafeExternalAudio(','  function bindTvSafeMultiviewChrome('),ctx);
const media={muted:false};const frame={contentDocument:{querySelectorAll:s=>s==='video,audio'?[media]:[]}};
assert(ctx.setTvSafeExternalAudio(frame,true));assert.equal(media.muted,true);
assert(ctx.setTvSafeExternalAudio(frame,false));assert.equal(media.muted,false);
assert.equal(ctx.setTvSafeExternalAudio({get contentDocument(){throw Error('Cross origin')}},true),false);
assert.equal(ctx.setTvSafeExternalAudio({contentDocument:null},true),false);
let repairs=0;ctx.repairRecentEpisodeCards=()=>repairs++;
const toggles={};const section={classList:{toggle:(key,value)=>toggles[key]=value},querySelector:()=>null};
ctx.normalizedText=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
vm.runInContext(part('  function markRecentHomeSections(','  function '),ctx);
for(const textContent of ['Séries, ajouts récents','Animes, ajouts récents']){
 ctx.markRecentHomeSections({},[{textContent,closest:selector=>selector==='.verticalSection'?section:null}]);assert(repairs>0);
}
const before=repairs;ctx.markRecentHomeSections({},[{textContent:'Reprendre la lecture',closest:selector=>selector==='.verticalSection'?section:null}]);assert.equal(repairs,before);
console.log('v83: real external audio capability and recent-only episode filter passed');
