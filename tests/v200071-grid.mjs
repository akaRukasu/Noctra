import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/noctra-library-grid.js',import.meta.url),'utf8');
const a=source.indexOf('  function balancedRows('), b=source.indexOf('\n  }',a)+4;
const rows=new Function(source.slice(a,b)+';return balancedRows;')();
for(const width of [960,1000,1280,1845,2340,3440])for(let count=1;count<=520;count++){
 const layout=rows(count,width);
 assert.equal(layout.reduce((a,b)=>a+b,0),count);
 assert(Math.max(...layout)-Math.min(...layout)<=1);
 assert(layout.every(n=>n>0));
}
assert.deepEqual(rows(54,1845),[9,9,9,9,9,9]);
console.log('Library grids: all items preserved, balanced final rows, 1–520 items across six desktop widths OK');
