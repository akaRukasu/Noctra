import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const start=source.indexOf('  const tvDefaultIframeSandbox');
const end=source.indexOf('  function destroyTvPlayback',start);
const configure=new Function('window',source.slice(start,end)+';return configureTvIframe;')({location:{href:'https://noctra.example/client/',origin:'https://noctra.example'}});
for(const provider of ['DaddyLive','DLStreams','BrigitteTV']){
 for(const fullPage of [false,true]){
  const attrs=new Map();
  const frame={dataset:{tvCompatPage:String(fullPage)},setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
  configure(frame,{provider,embedUrl:'https://provider.example/player'});
  assert.equal(attrs.get('scrolling'),fullPage?'auto':'no');
  assert(!attrs.has('sandbox'),'Do not reintroduce rejected sandbox policies');
  assert(attrs.has('allowfullscreen'));
 }
}
console.log('Video embeds do not scroll; full-page fallback remains navigable; fullscreen and provider compatibility preserved.');
