import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseBrigittePlayers} from '../lib/brigitte-players.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const shell=read('public/noctra-shell.js'),server=read('server.mjs');
const between=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return s.slice(i,j);};
const ctx={setTimeout,clearTimeout};vm.createContext(ctx);
vm.runInContext(between(server,'async function firstVerifiedLiveWatchVariant(','async function resolveLiveWatchVipPlayback('),ctx);
let settle;
const winner=await ctx.firstVerifiedLiveWatchVariant(['slow','ready'],value=>value==='ready'?Promise.resolve({id:'ready'}):new Promise(resolve=>{settle=resolve;}));
assert.equal(winner.id,'ready');settle(null);
assert.equal(await ctx.firstVerifiedLiveWatchVariant([1,2],async()=>null),null);
// Run the actual startup callback with realistic buffered ranges.
for(const duration of [0,1,4,8]) {
 let plays=0;
 const c={videoEventSignal:{aborted:false},playbackSequence:1,tvPlaybackSequence:1,playbackBecameActive:false,startupPlayRequested:false,desktopLive:false,protectedStartupBufferGoal:8,channelContinuity:true,bufferedResolvedStream:true,networkProfile:{weak:false},startupFallbackTimer:0,
  video:{currentTime:100,buffered:{length:duration?1:0,start:()=>100,end:()=>100+duration},play:()=>{plays++;return Promise.resolve();}},window:{setTimeout:()=>1,clearTimeout:()=>{}},recordTvDiagnostic:()=>{}};
 vm.createContext(c);
 vm.runInContext(between(shell,'  function tvBufferedAhead(','  function tvBufferedSpan(')+between(shell,'  function tvLatestBufferedWindow(','  function tvForwardBufferedWindow(')+between(shell,'  function tvSeekIntoBufferedWindow(','  function tvSkipBufferedGap('),c);
 vm.runInContext(between(shell,'      const requestStartupPlayback =',"      videoEventSignal.addEventListener('abort', () => window.clearTimeout(startupFallbackTimer)")+'this.start=requestStartupPlayback;',c);
 assert.equal(c.start(true),duration>=4,'No half-second startup, useful reserve starts after grace');
 assert.equal(plays,duration>=4?1:0);
 c.videoEventSignal.aborted=true;c.startupPlayRequested=false;assert.equal(c.start(true),false);
}
// Delayed selection A must never replace selection B, including mobile iframe choices.
const calls=[],pending=new Map();
const option={tvPlaybackSequence:1,tvOptionSequence:0,tvResolverController:new AbortController(),document:{querySelectorAll:()=>[]},setTvPlaybackStatus:()=>{},tvConnectionProfile:()=>({resolverTimeout:1000}),api:url=>new Promise(resolve=>pending.set(url,resolve)),tvState:{resolvedEmbeds:[]},playTvEmbedUrl:(ch,url)=>calls.push(url),renderTvStreamOptions:()=>{}};
vm.createContext(option);vm.runInContext(between(shell,'  async function playTvResolvedOption(','  async function resolveAndPlayTvChannel('),option);
const first=option.playTvResolvedOption({provider:'BrigitteTV'},{resolveUrl:'/a'},0);
const second=option.playTvResolvedOption({provider:'BrigitteTV'},{resolveUrl:'/b'},1);
pending.get('/b')({options:[{url:'https://player.test/b'}]});await second;
pending.get('/a')({options:[{url:'https://player.test/a'}]});await first;
assert.deepEqual(calls,['https://player.test/b']);
const html=read('tests/fixtures/brigitte-servers.html');
const parsed=parseBrigittePlayers(html,'https://quellefrappe.click/event');
assert.equal(parsed.length,36);assert.equal(parsed[0].label,'FR · Wigi');assert.equal(parsed[1].label,'FR · Cartel');
assert(parsed.some(o=>o.label==='GB · Obcast'));
assert.equal(parseBrigittePlayers('<span class="change-video" data-embed="javascript:alert(1)">Bad</span>','https://quellefrappe.click').length,0);
// Exercise catalogue -> resolver -> selected player using the published markup.
const refs=new Map([['event',{url:'https://quellefrappe.click/event',expiresAt:Date.now()+60000,meta:{kind:'brigitte-event'}}]]);
const deps={URL,Date,parseBrigittePlayers,tvReferences:refs,HttpError:Error,safeTvRemoteUrl:u=>new URL(u),publicPath:p=>'/noctra'+p,decodeTvHtml:s=>s,resolveTvUrl:(u,b)=>new URL(u,b).href,issueTvReference:(url,h,meta)=>{const id=String(refs.size);refs.set(id,{url,meta,expiresAt:Date.now()+60000});return id;},fetchPublicTvHtml:async url=>({finalUrl:url,html:url.endsWith('/event')?html:url.includes('/part/')?'<iframe src="/ty/1/12"></iframe>':'<iframe src="https://player.test/live"></iframe>'})};
vm.createContext(deps);
const resolver=between(server,'async function resolveTvPageReference(','async function ');
vm.runInContext(resolver,deps);
const event=await deps.resolveTvPageReference('event');assert.equal(event.options.length,37);assert.equal(event.options.at(-1).compatPage,true);assert(event.options.slice(0,-1).every(o=>o.resolveUrl.startsWith('/noctra/api/tv/resolve/')));
const player=await deps.resolveTvPageReference(event.options[0].resolveUrl.split('/').at(-1));assert.equal(player.options[0].url,parsed.find(x=>/Cartel/i.test(x.label)).url);
const attrs=new Map([['sandbox','allow-scripts']]);const frame={setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
const iframe={URL,window:{location:{href:'https://noctra.test/',origin:'https://noctra.test'}},tvTrustedEmbedHosts:new Set(),tvDefaultIframeSandbox:'restricted'};vm.createContext(iframe);
vm.runInContext(between(shell,'  function configureTvIframe(','  function destroyTvPlayback('),iframe);
iframe.configureTvIframe(frame,{provider:'BrigitteTV',embedUrl:player.options[0].url});assert(!attrs.has('sandbox'));
iframe.configureTvIframe(frame,{provider:'BrigitteTV',embedUrl:'/api/local'});assert.equal(attrs.get('sandbox'),'restricted','Local HTML retains sandbox protection');
console.log('200.0.80: first ready server, startup reserve, stale selection isolation, 36 published Brigitte servers, wrapper resolution and scoped iframe compatibility OK');
// An expired cached manifest can produce HTTP 200 HTML, classified as 415.
// Renew the reference exactly once; never loop or pass HTML to HLS.js.
let opens=0,invalidations=0,alwaysInvalid=false;
const transport={validLiveWatchChannelReference:(kind,id)=>({kind,id}),liveWatchVipDirectCache:{delete:()=>invalidations++},liveWatchFreshHlsResource:async()=>{opens++;if(opens%2===1||alwaysInvalid)throw Object.assign(new Error('Not a playlist'),{status:415});return {playlist:true,text:'#EXTM3U\n#EXTINF:6,\nsegment.ts',headers:{},finalUrl:'https://test/playlist.m3u8'};},liveWatchPlaylistIsMaster:()=>false,rewriteLiveWatchStableMediaPlaylist:s=>s};
vm.createContext(transport);vm.runInContext(between(server,'async function proxyLiveWatchVipHls(','async function proxyLiveWatchVipStream('),transport);
let body='';await transport.proxyLiveWatchVipHls('main','a','',{}, {writeHead:code=>assert.equal(code,200),end:s=>body=s});
assert.equal(opens,2);assert.equal(invalidations,1);assert.match(body,/^#EXTM3U/);
alwaysInvalid=true;opens=0;await assert.rejects(transport.proxyLiveWatchVipHls('main','a','',{},{}));assert.equal(opens,2);
// All failed probes select the official player, with unsuccessful URLs manual.
const selection={setTimeout,clearTimeout,validLiveWatchChannelReference:(kind,id)=>({kind,id}),liveWatchAccessSession:async()=>({}),liveWatchOfficialPlayerUrl:()=> 'https://livewatch.top/embed/a',liveWatchChannelVariants:async()=>[{kind:'main',id:'a'},{kind:'main',id:'b'}],liveWatchCrossFamilyVariants:async()=>[],liveWatchStreamReference:async()=>{throw new Error('unavailable');},liveWatchStableHlsUrl:(kind,id)=>'/hls/'+id,liveWatchFamilyLabel:()=> 'LiveWatch',issueLiveWatchBridgeReference:()=> 'bridge',publicPath:p=>p};
vm.createContext(selection);vm.runInContext(between(server,'async function firstVerifiedLiveWatchVariant(','async function liveWatchVipDiagnosticCheck('),selection);
const failed=await selection.resolveLiveWatchVipPlayback('main','a');assert.equal(failed.directVerified,false);assert.equal(failed.options[0].officialClient,true);assert(failed.options.filter(o=>o.streamUrl).every(o=>o.manualOnly));
console.log('200.0.80: HTTP 415 refresh once, terminal invalid response, no automatic rotation through failed streams OK');
