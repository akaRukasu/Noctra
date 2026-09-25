import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const shell=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const extract=name=>{const start=shell.indexOf(`  function ${name}(`);assert.ok(start>=0);return shell.slice(start,shell.indexOf('\n  }',start)+4);};
const normalizedText=new Function(`${extract('normalizedText')};return normalizedText;`)();
const fallback=new Function('normalizedText',`${extract('materialIconFallback')};return materialIconFallback;`)(normalizedText);
const element=(glyph,{label='',id='',classes='actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons'}={})=>({
 classList:(classes+' '+glyph).split(' '),textContent:'',getAttribute:()=>null,
 parentElement:{getAttribute:()=>null},
 closest:()=>({querySelector:()=>({textContent:label}),getAttribute:name=>name==='data-id'?id:null})
});
const cases={play_arrow:'play',phonelink_lock:'lightning',keyboard:'gamepad',content_copy:'copy',playlist_add:'playlist',library_add:'library',check_box_outline_blank:'select',file_download:'download',skip_next:'skipNext',keyboard_arrow_left:'back',keyboard_arrow_right:'next',volume_off:'muted',closed_caption:'captions',pause:'pause',cast:'cast'};
for(const [glyph,expected] of Object.entries(cases))assert.equal(fallback(element(glyph)),expected,glyph);
assert.equal(fallback(element('unknown_glyph')), '', 'Structural MenuItem classes must not be mistaken for the more/menu icon');
for(const [label,expected] of [['Connexion rapide','lightning'],['Contrôles','gamepad'],['Ajouter à la liste de lecture','playlist'],['Tout lire à partir d’ici','play'],['Copier l’URL du flux','copy']])assert.equal(fallback(element('\ue000',{label})),expected,label);
assert.equal(fallback(element('\ue000',{id:'copy-stream'})),'copy');
const iconsBody=shell.slice(shell.indexOf('  const icons ='),shell.indexOf('\n  };',shell.indexOf('  const icons ='))+5);
const icons=new Function(`${iconsBody};return icons;`)();
const repair=new Function('materialIconFallback','icons','markRecentHomeSections',`${extract('repairMaterialIconFallbacks')};return repairMaterialIconFallbacks;`)(fallback,icons,()=>{});
// Minimal DOM double checks ownership and idempotence of replacement, including
// a root that is itself a newly mounted icon. Real layout is a separate fixture.
let svg=null,inserts=0;const attributes={};
const parent={matches:()=>false,classList:{contains:()=>true},querySelector:selector=>selector.includes('header-icon')?null:svg};
const glyph={...element('play_arrow'),parentElement:parent,dataset:{},style:{},hidden:false,
 getAttribute:name=>attributes[name],setAttribute:(name,value)=>attributes[name]=value,
 matches:selector=>selector.includes('.material-icons'),closest:()=>null,querySelector:()=>null,querySelectorAll:()=>[],
 insertAdjacentHTML:(position,html)=>{assert.equal(position,'beforebegin');inserts++;const name=html.match(/data-noctra-material-icon="([^"]+)"/)[1];svg={dataset:{noctraMaterialIcon:name},remove:()=>svg=null};}
};
repair(glyph);repair(glyph);
assert.equal(inserts,1);assert.equal(svg.dataset.noctraMaterialIcon,'play');assert.equal(glyph.hidden,true);assert.equal(attributes['aria-hidden'],'true');
glyph.classList=['material-icons','pause'];repair(glyph);assert.equal(inserts,2);assert.equal(svg.dataset.noctraMaterialIcon,'pause');
svg=null;glyph.style.visibility='hidden';repair(glyph);assert.equal(svg,null,'Do not display empty selection check placeholders');
console.log('v200.0.49 UI: source glyph mappings, label fallback, icon-root repair, play/pause updates and idempotence OK');
