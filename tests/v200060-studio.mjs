import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const shell=await readFile(new URL('public/noctra-shell.js',root),'utf8');
const start=shell.indexOf('  function syncMobileViewport(');
const fn=shell.slice(start,shell.indexOf('\n  }',start)+4);
const values=new Map();let writes=0,keyboard=false,editing=false;
const context={window:{innerHeight:844,visualViewport:{height:844,offsetTop:0,scale:1}},document:{documentElement:{style:{getPropertyValue:n=>values.get(n),setProperty:(n,v)=>{writes++;values.set(n,v);}}},body:{classList:{toggle:(n,v)=>{keyboard=v;}}},activeElement:{matches:()=>editing}}};
vm.createContext(context);vm.runInContext(fn,context);
const sync=()=>vm.runInContext('syncMobileViewport()',context);
sync();assert.equal(values.get('--noctra-app-height'),'844px');assert.equal(keyboard,false);
sync();assert.equal(writes,2,'unchanged dimensions must not trigger style mutations');
editing=true;context.window.visualViewport.height=490;context.window.visualViewport.offsetTop=47.4;sync();
assert.equal(values.get('--noctra-app-height'),'490px');assert.equal(values.get('--noctra-app-top'),'47px');assert.equal(keyboard,true);
context.window.visualViewport.scale=2;context.window.visualViewport.height=245;sync();
assert.equal(values.get('--noctra-app-height'),'490px','pinch zoom must preserve document geometry');
context.window.visualViewport={height:844,offsetTop:0,scale:1};editing=false;sync();assert.equal(keyboard,false);
delete context.window.visualViewport;context.window.innerHeight=568;sync();assert.equal(values.get('--noctra-app-height'),'568px','older browser fallback');
const reports=JSON.parse(await readFile(new URL('tests/v200060-browser-results.json',root),'utf8'));
assert.equal(reports.length,160);
for(const r of reports){
 const label=`${r.width}×${r.height} ${r.role} ${r.route}`;
 assert.ok(!r.error,label+': '+r.error);assert.ok(r.overflow<=1,label+' document overflow');assert.ok(r.panelOverflow<=1,label+' panel overflow');
 if(r.width<=1180){for(const f of r.fields)assert.ok(f.size>=16,label+' readable field');if(r.titleTop!==undefined)assert.ok(r.titleTop>=r.safe&&r.closeTop>=r.safe,label+' notch clearance');}
 if(r.width<=760){
  assert.ok(Math.abs(r.dockBottom-(r.height-Math.max(6,r.bottom)))<=1,label+' stable dock');
  assert.equal(r.buttonWidths.length,5,label+' five navigation actions');
  assert.ok(Math.max(...r.buttonWidths)-Math.min(...r.buttonWidths)<1,label+' equal widths');
  for(const l of r.labels){assert.ok(l.overflow<=1&&l.height<=l.available,label+' complete '+l.text);}
  if(r.titleTop!==undefined)assert.ok(r.titleTop>=r.safe&&r.closeTop>=r.safe,label+' notch clearance');
 }
 if(r.route==='/home'){
  assert.equal(r.visibleSections,3,label+' delayed section visible');
  assert.deepEqual(r.sections,['Mes médias','Continuer de regarder','Derniers ajouts'],label+' native order');
  for(const k of ['changed','resumeTarget','detailTarget','backHidden','previewTarget','dockStableWithPanel','headerClear'])assert.equal(r[k],true,label+' '+k);
  assert.ok(r.image.includes('art.svg?id=3'),label+' nested lazy image');
 }
 if(r.route==='/more'){assert.equal(r.moreLastReachable,true,label+' last action reachable');assert.equal(r.moreActions,r.role==='user'?2:7);}
 if(r.scrollReached!==undefined)assert.equal(r.scrollReached,true,label+' full panel scroll');
}
const behavior=JSON.parse(await readFile(new URL('tests/v200060-behavior-results.json',root),'utf8'));
for(const [name,passed]of Object.entries(behavior))assert.equal(passed,true,name);
console.log('200.0.60: viewport fallback, keyboard and pinch zoom; 160 saved browser cases; actual hero timer, pause, resume, panel suspension and disposal OK. Regenerate browser evidence with the fixture after UI changes.');
