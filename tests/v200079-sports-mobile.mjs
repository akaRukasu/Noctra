import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const s=(await readFile(new URL('../server.mjs',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const extract=(a,b)=>{let i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i);return s.slice(i,j);};
const deps={URL,createHash,AbortSignal,Promise,safeTvRemoteUrl:u=>new URL(u),resolveTvUrl:(u,b)=>new URL(u,b).href,
 decodeTvHtml:s=>s.replaceAll('&nbsp;',' ').replaceAll('&amp;','&'),stripTvHtml:s=>s.replace(/<[^>]*>/g,''),publicTvPageName:s=>s.replace(/<[^>]*>/g,''),normalizedIdentifier:s=>s.toLowerCase().replace(/\W/g,''),alternativeBrowserUrl:u=>'/api/tv/alternative/open/test?url='+encodeURIComponent(u)};
vm.createContext(deps);
vm.runInContext(extract('function normalizeHalouleDirectSportLabel(','function alternativeShortenerHost(')+extract('function parseHalouleAlternatives(','async function tvCatalogFromAlternative('),deps);
const html=await readFile(new URL('./fixtures/haloule-1-1.html',import.meta.url),'utf8');
const result=deps.parseHalouleAlternatives(html,'https://www.haloule.com/');
assert.equal(result.length,63,'All 63 named links in the observed section must be imported');
assert(result.some(c=>c.name==='ESPN FR by DISNEY+'));
assert(result.some(c=>c.name==='LIGUE 1+ 6 (v2)'));
assert.equal(result.filter(c=>/^BeinSport MAX/.test(c.name)).length,7);
assert(result.every(c=>c.group==='Haloule · section 1.1'));
assert.equal(result.filter(c=>/BBlack/i.test(c.name)).length,3,'Distinct labels sharing one published link are preserved');
assert.equal(deps.parseHalouleAlternatives(html.replace('1.1) Liens direct','Absent'), 'https://www.haloule.com/').length,0);
assert.equal(deps.parseHalouleAlternatives(html.replace('1.1) Liens direct','1.1)</span><b>Liens</b> direct'), 'https://www.haloule.com/').length,63);
// No dependency on a slow shortener for a URL which is already direct.
const shorten={...deps,alternativeShortenerHost:u=>/clictune/.test(u),extractDlinkFinalUrl:()=>'',fetch:async(u,o)=>{assert(o.signal);throw new Error('slow shortener');}};
vm.createContext(shorten);vm.runInContext(extract('async function resolveAlternativePublicTarget(','function alternativeBrowserUrl('),shorten);
assert.equal(await shorten.resolveAlternativePublicTarget('https://player.test/live'),'https://player.test/live');
let code,headers,body;
const res={writeHead:(c,h)=>{code=c;headers=h;},end:b=>{body=b;}};
const proxy={...deps,tvReferences:new Map([['test',{url:'https://www.clictune.com/test',expiresAt:Date.now()+60000,meta:{kind:'alternative-browser',label:'Test'}}]]),
 HttpError:Error,resolveAlternativePublicTarget:async()=>{throw new Error('timeout');},escapeTvLogoText:s=>s};
vm.createContext(proxy);vm.runInContext(extract('async function proxyAlternativeBrowser(','function parseHalouleAlternatives('),proxy);
await proxy.proxyAlternativeBrowser('test',res,true);
assert.equal(code,302);assert.equal(headers.location,'https://www.clictune.com/test');assert.equal(body,undefined,'Mobile uses one outer iframe; no nested wrapper');
await proxy.proxyAlternativeBrowser('test',res,false);assert.equal(code,200);assert.match(body,/noctraAltFrame/,'Desktop wrapper retained');
console.log('v200.0.79: 63 Haloule links, ESPN, variants, strict section boundary, timeout fallback and single mobile iframe OK');
