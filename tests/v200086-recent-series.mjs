import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const start=source.indexOf('  const recentEpisodeRepairs =');
const code=source.slice(start,source.indexOf('  function markRecentHomeSections(',start));
let cards=[],rendered=[],requests=[];
function episode(id){return {dataset:{id},classList:{contains:()=>false},remove(){cards=cards.filter(c=>c!==this)},insertAdjacentHTML(where,html){rendered.push(html)}}}
cards=[episode('e1'),episode('e2'),episode('e3')];
const section={querySelectorAll:s=>s.includes('Episode')?cards:[],contains:c=>cards.includes(c)};
const context={window:{setTimeout:fn=>fn(),ApiClient:{getCurrentUserId:()=> 'user',getItems:async(user,q)=>{requests.push(q);return requests.length===1?{Items:[{Id:'e1',SeriesId:'s1'},{Id:'e2',SeriesId:'s1'},{Id:'e3',SeriesId:'s2'}]}:{Items:[{Id:'s1',Type:'Series'},{Id:'s2',Type:'Series'}]}}}},homeCarouselItemKey:v=>String(v||'').toLowerCase(),homeCarouselCardTools:()=>({cards:{getCardsHtml:({items})=>items[0].Id},lazy:{lazyChildren(){}}})};
vm.createContext(context);vm.runInContext(code,context);
await context.repairRecentEpisodeCards(section);
assert.deepEqual(rendered,['s1','s2']);assert.equal(cards.length,0);assert.equal(requests.length,2);
// A failed parent lookup must leave usable episode cards rather than empty slots.
cards=[episode('e4')];context.window.ApiClient.getItems=async()=>{throw Error('offline')};
await context.repairRecentEpisodeCards(section);assert.equal(cards.length,1);
const tools=source.slice(source.indexOf('  function tvSafeToolsMenuMarkup('),source.indexOf('  function ensureTvSafeToolsMenu('));
assert.match(tools,/data-tv-safe-theater/);assert.doesNotMatch(tools,/data-tv-safe-quality-step/);
console.log('v86: batch episode-to-series replacement, deduplication, failure preservation and cinema tools passed');
