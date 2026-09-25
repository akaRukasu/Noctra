// Local browser QA: real production multiview + public HLS test stream (Mux).
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,relative,isAbsolute,extname} from 'node:path';
const root=resolve(import.meta.dirname,'../public');
const shell=await readFile(resolve(root,'noctra-shell.js'),'utf8');
const extract=name=>{const match=new RegExp('  (?:async )?function '+name+'\\(').exec(shell);if(!match)throw Error(name);return shell.slice(match.index,shell.indexOf('\n  }',match.index)+4);};
const a=shell.indexOf('  const icons =');
const functions=['destroyTvSafeMultiviewPlayers','closeTvSafeMultiview','updateTvSafeMultiviewLayout','removeTvSafeMultiviewSlot','setTvSafeMultiviewAudio','retryTvSafeMultiviewSlot','tvSafeMultiTargetHeight','applyTvSafeMultiQualityCap','refreshTvSafeMultiQuality','tvSafeMultiStartupGoal','tvSafeBufferedAhead','lowerTvSafeMultiCap','startTvSafeMultiviewStream','tvSafeMultiviewGeometry','renderTvSafeMultiview','toggleTvSafeMultiviewFullscreen','tvConnectionProfile','tvAppleTouchDevice'];
const js=`${shell.slice(a,shell.indexOf('\n  };',a)+5)}
const TV_SAFE_MULTI_MAX=25;
const tvSafeExtras={slots:[],hls:new Map(),multiControllers:new Map(),multiGeneration:0,multiOpen:false,audioId:'',multiQuality:'stable'};
const escapeHtml=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast=m=>document.querySelector('output').textContent=m;
const ensureHlsLibrary=async()=>{};
const tvSafeExtrasPanel=()=>document;
const closeTvSafeToolsMenu=()=>{},refreshTvSafeToolsMenu=()=>{},suspendTvSafeMainPlaybackForMulti=()=>{},restoreTvSafeMainPlayback=()=>{};
${functions.map(extract).join('\n')}
document.addEventListener('click',e=>{
 const open=e.target.closest('[data-open]');if(open){tvSafeExtras.slots=Array.from({length:Number(open.dataset.open)},(_,i)=>({id:'sample-'+i,name:'Écran '+(i+1),provider:'Big Buck Bunny',group:'Flux public de test',playbackType:'stream',streamUrl:'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'}));renderTvSafeMultiview();}
 const audio=e.target.closest('[data-tv-safe-multi-audio]');if(audio)setTvSafeMultiviewAudio(audio.dataset.tvSafeMultiAudio);
 const remove=e.target.closest('[data-tv-safe-multi-remove]');if(remove)removeTvSafeMultiviewSlot(remove.dataset.tvSafeMultiRemove);
 const retry=e.target.closest('[data-tv-safe-multi-retry]');if(retry)retryTvSafeMultiviewSlot(retry.dataset.tvSafeMultiRetry);
 if(e.target.closest('[data-tv-safe-multi-close]'))closeTvSafeMultiview();
 if(e.target.closest('[data-tv-safe-multi-fullscreen]'))void toggleTvSafeMultiviewFullscreen();
});
document.addEventListener('change',e=>{if(e.target.matches('[data-tv-safe-multi-quality]')){tvSafeExtras.multiQuality=e.target.value;refreshTvSafeMultiQuality();}});
`;
const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Noctra — validation multiview</title><link rel="stylesheet" href="/noctra-theme.css"><link rel="stylesheet" href="/noctra-cinema.css"></head><body class="noctra-ready" data-noctra-role="user"><main style="padding:32px"><h1>Validation multiview</h1><p>Flux public Mux / Big Buck Bunny. Aucune lecture sur le serveur personnel.</p><button data-open="2" data-tv-safe-tools-launcher>Ouvrir 2 écrans</button><button data-open="4">Ouvrir 4 écrans</button><output></output></main><script src="/vendor/hls.min.js"></script><script src="/qa.js"></script></body></html>`;
createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;if(p==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}if(p==='/qa.js'){res.setHeader('Content-Type','application/javascript');return res.end(js);}const path=resolve(root,'.'+decodeURIComponent(p)),rel=relative(root,path);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403);return res.end();}res.setHeader('Content-Type',extname(path)==='.css'?'text/css':'application/javascript');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1',function(){console.log('http://127.0.0.1:'+this.address().port+'/');});
