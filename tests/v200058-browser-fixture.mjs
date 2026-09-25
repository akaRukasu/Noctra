// Isolated browser QA. Production renderers/styles, synthetic data, no account.
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,relative,isAbsolute,extname} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const shell=await readFile(resolve(root,'public/noctra-shell.js'),'utf8');
const extract=name=>{const m=new RegExp('  (?:async )?function '+name+'\\(').exec(shell);if(!m)throw Error(name);return shell.slice(m.index,shell.indexOf('\n  }',m.index)+4);};
const a=shell.indexOf('  const icons =');
const dock=shell.slice(shell.indexOf('<nav id="noctra-dock"'),shell.indexOf('</nav>',shell.indexOf('<nav id="noctra-dock"'))+6);
const js=`${shell.slice(a,shell.indexOf('\n  };',a)+5)}
const escapeHtml=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const authContext={isAdmin:false};const formatDate=v=>String(v||'').slice(0,4);
let rouletteSequence=0;const rouletteState={library:'',genre:'',rating:0,minYear:'',maxYear:'',count:1,unplayed:false};
const samples=Array.from({length:6},(_,i)=>({id:String(i+1),title:['Interstellar','Dune : deuxième partie','Le Voyage de Chihiro'][i%3],year:2024,type:'movie',overview:'Une aventure à découvrir dans votre médiathèque.',library:'Cinéma',rating:8.4,genres:['Aventure'],image:'/client/themes/blueradiance/bg.jpg',posterPath:'',backdropPath:''}));
const catalog={'Films':{id:'1',type:'movies'},'Séries':{id:'2',type:'tvshows'},'Films Animation':{id:'3',type:'movies'},'Japanimation':{id:'4',type:'tvshows'}};
const cachedApi=async()=>catalog;const api=async()=>({results:samples.slice(0,3),requested:3});
const setPanelBody=html=>document.querySelector('.noctra-panel-body').innerHTML=html;
const showError=error=>{throw error};
const setLoading=(title,subtitle,wide,options={})=>{document.body.classList.add('noctra-panel-open');document.querySelector('#fixture').innerHTML='<div id="noctra-backdrop" data-open="true" data-panel-kind="'+(options.kind||'generic')+'"><aside id="noctra-panel" class="noctra-panel--wide" data-noctra-panel-kind="'+(options.kind||'generic')+'"><header class="noctra-panel-header"><div><p class="noctra-eyebrow">'+subtitle+'</p><h2>'+title+'</h2></div><button class="noctra-close" aria-label="Fermer">×</button></header><div class="noctra-panel-body"></div></aside></div>';};
const markRecentHomeSections=()=>{};
${['normalizedText','enhancePremiereHome','openRoulette','spinRoulette','openLibraries','mobileMoreMarkup','materialIconFallback','repairMaterialIconFallbacks','discoveryImageMarkup','discoveryExplanation','trackerBadgeMarkup','discoveryCard','requestDiscoverySkeletonMarkup','requestHomeShellMarkup','streamingPlatformButtons'].map(extract).join('\n')}
const route=location.pathname;
// QA-only emulation of the normal-motion CSS branch. Never shipped to the app.
if(location.search.includes('motion=full'))for(const sheet of document.styleSheets)for(const rule of sheet.cssRules)if(rule.media?.mediaText.includes('prefers-reduced-motion'))rule.media.mediaText='not all';
const compact=innerWidth<=760,tablet=innerWidth>760&&innerWidth<=1100;
document.documentElement.className=compact?'layout-mobile noctra-mobile-viewport':tablet?'layout-desktop noctra-tablet-viewport':'layout-desktop';
document.body.insertAdjacentHTML('beforeend',\`${dock}\`);
document.querySelector('#noctra-dock').dataset.role='user';document.querySelector('#noctra-dock').dataset.expanded='true';
if(route==='/home'){
 document.body.classList.add('noctra-home');
 document.querySelector('#fixture').innerHTML='<main class="homePage libraryPage"><div class="homeSectionsContainer"><section class="verticalSection noctra-continue-section"><h2 class="sectionTitle">Continuer de regarder</h2><div class="qa-row">'+samples.map(i=>'<article class="card" data-id="'+i.id+'"><a class="cardImageContainer" aria-label="'+i.title+'" style="background-image:url(/client/themes/blueradiance/bg.jpg)"></a><div class="cardText-first">'+i.title+'</div><div class="cardText-secondary">Votre séance en cours</div><button data-action="resume" hidden>Reprendre</button></article>').join('')+'</div></section></div></main>';
 enhancePremiereHome(document.querySelector('.homePage'));enhancePremiereHome(document.querySelector('.homePage'));
 document.querySelector('[data-action="resume"]').onclick=()=>document.body.dataset.resumed='true';
 document.querySelector('.cardImageContainer').onclick=()=>document.body.dataset.details='true';
}else if(route==='/roulette'){await openRoulette();document.querySelector('form').onsubmit=e=>{e.preventDefault();spinRoulette(e.target);};}
else if(route==='/libraries'){await openLibraries();}
else if(route==='/more'){setLoading('Plus','NOCTRA',true,{kind:'more'});setPanelBody(mobileMoreMarkup(false));}
else if(route==='/requests'){
 setLoading('Demandes','NOCTRA · VOS ENVIES',true,{kind:'requests'});setPanelBody(requestHomeShellMarkup({quota:{remaining:7,limit:10},summary:{pending:3}}));
 document.querySelector('[data-platform-buttons]').innerHTML=streamingPlatformButtons([{id:'8',name:'Netflix'},{id:'9',name:'Prime Video'},{id:'337',name:'Disney+'}],'8','FR');
 document.querySelector('#noctra-seerr-results').innerHTML='<div class="noctra-grid noctra-discovery-grid">'+samples.map(discoveryCard).join('')+'</div>';
}
if(route==='/icons'){
 document.querySelector('#fixture').innerHTML='<div id="reactRoot"><h1>Menu PC — police volontairement indisponible</h1></div>';
 document.querySelector('#reactRoot').insertAdjacentHTML('beforeend','<div class="qa-controls" style="display:flex;gap:24px;margin-top:80px"><button aria-label="Retour" class="paper-icon-button-light btnBack" style="width:44px;height:44px">'+icons.back+'</button><button aria-label="Précédent" class="emby-scrollbuttons-button noctra-scroll-icon-fixed" style="width:44px;height:44px">'+icons.back+'</button><button aria-label="Suivant" class="emby-scrollbuttons-button noctra-scroll-icon-fixed" style="width:44px;height:44px">'+icons.next+'</button></div>');
 const headerActionMenuIntentUntil=0,headerActionMenuIntent='';
 const repairHeaderIconButtons=()=>{},repairScrollArrowButtons=()=>{},repairHeaderMenuIcons=()=>{},syncHeaderActionMenus=()=>{},repairAuthenticatedViewState=()=>{},scheduleHomeEnhancement=()=>{},syncRouteState=()=>{};
 ${shell.slice(shell.indexOf('  let mutationSyncTimer ='),shell.indexOf('  const installTvSafeExtrasObserver ='))}
 ${shell.match(/observer\.observe\(document\.body, \{\s*childList: true,\s*subtree: true\s*\}\);/)[0]}
 setTimeout(()=>{
 const rows=[['resume','play_arrow','Lire'],['playallfromhere','play_arrow','Tout lire à partir d’ici'],['select','check_box_outline_blank','Sélectionner'],['addtocollection','library_add','Ajouter à la collection'],['addtoplaylist','playlist_add','Ajouter à la liste de lecture'],['download','file_download','Télécharger'],['copy-stream','content_copy','Copier l’URL du flux']];
 document.body.insertAdjacentHTML('beforeend','<div class="actionSheet actionsheet-not-fullscreen qa-menu"><div class="actionSheetScroller">'+rows.map(([id,glyph,label])=>'<button class="listItem listItem-button actionSheetMenuItem" data-id="'+id+'"><span class="actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons '+glyph+'"></span><div class="listItemBody"><div class="listItemBodyText actionSheetItemText">'+label+'</div></div></button>').join('')+'</div></div>');
 },50);
}
window.qaInspect=()=>{
 const panel=document.querySelector('#noctra-panel'),body=panel?.querySelector('.noctra-panel-body'),head=panel?.querySelector('header');
 const report={route,width:innerWidth,height:innerHeight,documentOverflow:document.documentElement.scrollWidth-innerWidth,bodyOverflow:body?body.scrollWidth-body.clientWidth:0,headerHeight:head?.getBoundingClientRect().height,bodyHeight:body?.clientHeight,headerContained:head ? (()=>{const a=head.getBoundingClientRect(),b=head.querySelector('div').getBoundingClientRect();return b.top>=a.top && b.bottom<=a.bottom;})():true,rootScroll:document.documentElement.scrollHeight-document.documentElement.clientHeight,icons:document.querySelectorAll('.actionSheet svg[data-noctra-material-icon]').length,heroCount:document.querySelectorAll('.noctra-premiere').length};
 if(route==='/home'){
 const hero=document.querySelector('.noctra-premiere'),motion=hero.querySelector('.noctra-premiere-motion');motion.click();report.paused=getComputedStyle(hero.querySelector('.noctra-premiere-art')).animationPlayState==='paused';motion.click();report.running=getComputedStyle(hero.querySelector('.noctra-premiere-art')).animationPlayState==='running';hero.querySelector('[data-premiere-play]').click();hero.querySelector('[data-premiere-details]').click();report.nativeActions=document.body.dataset.resumed==='true'&&document.body.dataset.details==='true';report.reducedMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;report.animationName=getComputedStyle(hero.querySelector('.noctra-premiere-art')).animationName;
 }
 report.arrowOffsets=[...document.querySelectorAll('.qa-controls button')].map(e=>{const a=e.getBoundingClientRect(),b=e.querySelector('svg').getBoundingClientRect();return {x:Math.abs(a.x+a.width/2-b.x-b.width/2),y:Math.abs(a.y+a.height/2-b.y-b.height/2),glyphX:(()=>{const p=e.querySelector('path').getBBox();return Math.abs(p.x+p.width/2-12);})()};});
 return report;
};
`;
const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Noctra — validation 200.0.58</title><link rel="stylesheet" href="/client/46967.03edf3bb7ee048ee10be.css"><link rel="stylesheet" href="/client/main.jellyfin.f725276386e5b19afe0c.css"><link rel="stylesheet" href="/noctra-theme.css"><link rel="stylesheet" href="/noctra-cinema.css"><style>body{margin:0}.homePage{padding-top:40px}.qa-row{display:flex;gap:18px;overflow:auto}.qa-row .card{min-width:220px;padding:0!important}.qa-row .cardImageContainer{position:static;display:block;height:140px;background-size:cover;border-radius:18px}.qa-menu{position:relative!important;inset:auto!important;margin:30px;width:300px}.qa-menu .material-icons{font-family:unavailable!important}#reactRoot{padding:24px}</style></head><body class="noctra-ready" data-noctra-role="user"><div id="fixture"></div><script type="module" src="/qa.js"></script></body></html>`;
const reports=[];
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),p=url.pathname;
 if(p==='/qa.js'){res.setHeader('Content-Type','application/javascript');return res.end(js);}
 if(p==='/report'&&req.method==='POST'){let body='';for await(const c of req)body+=c;reports.push(JSON.parse(body));await writeFile(resolve(root,'tests/v200058-browser-results.json'),JSON.stringify(reports,null,2));res.end('ok');return;}
 if(p==='/lab'){
 const w=Number(url.searchParams.get('w'))||1440,h=Number(url.searchParams.get('h'))||1000,view=url.searchParams.get('view')||'roulette';
 res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<html><body style="margin:0;background:#050711;color:white;font:14px system-ui"><div style="padding:12px">Validation '+view+' · '+w+' × '+h+' · données fictives <a style="color:#bbaaff" href="/matrix">Tous les contrôles</a></div><iframe src="/'+view+'" style="width:'+w+'px;height:'+h+'px;border:0"></iframe></body></html>');
 }
 if(p==='/motion'){
 res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<!doctype html><html><body><h1>Contrôle de l’animation</h1><pre>En cours…</pre><iframe src="/home?motion=full" style="width:1100px;height:700px"></iframe><script type="module">
 const f=document.querySelector('iframe');await new Promise(r=>f.onload=r);await new Promise(r=>setTimeout(r,200));const d=f.contentDocument,w=f.contentWindow,art=d.querySelector('.noctra-premiere-art'),b=d.querySelector('.noctra-premiere-motion'),read=()=>w.getComputedStyle(art).transform;
 const a=read();await new Promise(r=>setTimeout(r,500));const moving=read()!==a;b.click();await new Promise(r=>setTimeout(r,100));const c=read();await new Promise(r=>setTimeout(r,400));const stopped=read()===c;b.click();await new Promise(r=>setTimeout(r,500));const resumed=read()!==c;
 const report={route:'/motion',moving,stopped,resumed,animation:w.getComputedStyle(art).animationName};document.querySelector('pre').textContent=JSON.stringify(report,null,2);await fetch('/report',{method:'POST',body:JSON.stringify(report)});
 </script></body></html>`);
 }
 if(p==='/matrix'){
 res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<!doctype html><html><body style="font:14px system-ui;background:#10121c;color:#ddd"><h1>Contrôles responsive et interactions</h1><pre id="result">En cours…</pre><script type="module">
 const reports=[];for(const [w,h] of [[1440,1000],[820,1180],[390,844],[320,568],[844,390]])for(const view of ['home','roulette','requests','libraries','more','icons']){
 const f=document.createElement('iframe');f.style.cssText='width:'+w+'px;height:'+h+'px;border:0;position:fixed;left:0;top:0;visibility:hidden';f.src='/'+view;document.body.append(f);await new Promise(r=>f.onload=r);await new Promise(r=>setTimeout(r,180));
 try{const d=f.contentDocument,win=f.contentWindow;if(view==='roulette'){d.querySelector('details').open=true;}const report=win.qaInspect();if(view==='roulette'){d.querySelector('[type="submit"]').click();await new Promise(r=>setTimeout(r,100));report.results=d.querySelectorAll('.noctra-roulette-result').length;report.resultOverflow=d.querySelector('.noctra-panel-body').scrollWidth-d.querySelector('.noctra-panel-body').clientWidth;}
 reports.push(report);await fetch('/report',{method:'POST',body:JSON.stringify(report)});}catch(e){reports.push({view,w,error:String(e)});}f.remove();document.querySelector('pre').textContent=JSON.stringify(reports,null,2);}
 </script></body></html>`);
 }
 if(['/home','/roulette','/requests','/libraries','/more','/icons'].includes(p)){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 const publicRoot=resolve(root,'public'),path=resolve(publicRoot,'.'+decodeURIComponent(p)),rel=relative(publicRoot,path);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',({'.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));
 }catch(e){res.writeHead(500);res.end(String(e));}
}).listen(0,'127.0.0.1',function(){console.log('http://127.0.0.1:'+this.address().port+'/lab');});
