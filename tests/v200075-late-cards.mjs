import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const start=source.indexOf('  async function extendHomeMovieCarousel(');
const fn=source.slice(start,source.indexOf('\n  }',start)+4);
const mounted=[];
const state={ids:new Set(),section:{dataset:{}},itemsContainer:{querySelectorAll:()=>mounted},startIndex:0,limit:36,includeItemTypes:'Movie'};
const appended=[];
const window={ApiClient:{getCurrentUserId:()=> 'user',getItems:async()=>{
  // Initial Jellyfin render finishes while the additional page is in flight.
  mounted.push({dataset:{id:'aabb'}});
  return {Items:[{Id:'AA-BB'},{Id:'ccdd'}],TotalRecordCount:2};
}}};
const extend=new Function('window','homeCarouselFeed','getCarouselMetrics','homeCarouselItemKey','appendHomeCarouselItems','recycleHomeCarouselItems','enableInfiniteHomeCarousels','syncHomeCarouselButtons',fn+';return extendHomeMovieCarousel;')(
 window,()=>state,()=>({position:0,viewport:400}),id=>id.replace(/-/g,'').toLowerCase(),(_s,items)=>{appended.push(...items);return items.length;},()=>0,()=>{},()=>{});
await extend({scroller:{reload(){}}});
assert.deepEqual(appended.map(i=>i.Id),['ccdd']);
assert.equal(state.loading,false);
console.log('200.0.75: late-mounted Jellyfin cards are not duplicated by the next page.');
