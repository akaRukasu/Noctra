import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const index=await readFile(new URL('public/client/index.html',root),'utf8');
assert(index.includes('noctra-player-chrome.css?v=200.62'));
const reports=JSON.parse(await readFile(new URL('tests/v200062-player-results.json',root),'utf8'));
assert.equal(reports.length,32);
for(const r of reports){
 const label=JSON.stringify({w:r.w,h:r.h,native:r.native,active:r.active});
 assert.equal(r.backCount,1,label);
 for(const key of ['backSize','safeTop','spacing','center','videoFull','hidden']) assert.equal(r[key],true,label+' '+key);
 assert.equal(r.overflow,false,label);
}
console.log('200.0.62: 32 browser cases; one back button, touch target, centering, safe areas, title clearance, full video surface and hidden OSD. Saved browser evidence; regenerate with v200062-player-fixture.mjs after styling changes.');
