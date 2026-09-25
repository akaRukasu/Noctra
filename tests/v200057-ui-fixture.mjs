// Visual QA only: production render functions/styles with public metadata.
// Run with NOCTRA_QA_DATA pointing to a JSON {providers,samples} fixture.
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,relative,isAbsolute} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const shell=await readFile(resolve(root,'public/noctra-shell.js'),'utf8');
const data=JSON.parse(await readFile(process.env.NOCTRA_QA_DATA,'utf8'));
const extract=name=>{const a=shell.indexOf('  function '+name+'(');if(a<0)throw Error(name);return shell.slice(a,shell.indexOf('\n  }',a)+4);};
const a=shell.indexOf('  const icons =');
const icons=shell.slice(a,shell.indexOf('\n  };',a)+5);
const dock=shell.slice(shell.indexOf('<nav id="noctra-dock"'),shell.indexOf('</nav>',shell.indexOf('<nav id="noctra-dock"'))+6);
const js=`${icons}
const data=${JSON.stringify(data).replaceAll('<','\\u003c')};
const authContext={isAdmin:false};
const escapeHtml=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const formatDate=v=>String(v||'').slice(0,4);
${['enhancePremiereHome','discoveryImageMarkup','discoveryExplanation','trackerBadgeMarkup','discoveryCard','requestDiscoverySkeletonMarkup','requestHomeShellMarkup','streamingPlatformButtons','mobileMoreMarkup'].map(extract).join('\n')}
document.body.insertAdjacentHTML('beforeend',\`${dock}\`);
document.querySelector('#noctra-dock').dataset.role='user';
document.querySelector('#noctra-dock').dataset.expanded='true';
const route=location.pathname;
const sample=data.samples[0];
if(route==='/home') {
 document.body.classList.add('noctra-home');
 document.querySelector('#fixture').innerHTML='<main class="homePage libraryPage"><div class="homeSectionsContainer"><section class="verticalSection noctra-continue-section"><h2 class="sectionTitle">Continuer de regarder</h2><div class="qa-native-row">'+data.samples.slice(0,4).map(i=>'<div class="card overflowBackdropCard" data-id="'+i.id+'"><div class="cardScalable"><a class="cardImageContainer" role="img" aria-label="'+escapeHtml(i.title)+'" style="background-image:url(https://image.tmdb.org/t/p/w780'+i.backdropPath+')"></a></div><button data-action="resume" hidden>Reprendre</button><div class="cardText cardText-first">'+escapeHtml(i.title)+'</div><div class="cardText cardText-secondary">Votre séance en cours</div></div>').join('')+'</div></section><section class="verticalSection"><h2 class="sectionTitle">À l’affiche dans votre médiathèque</h2><div class="qa-posters">'+data.samples.map(i=>'<div class="card"><div class="cardImageContainer" style="background-image:url(https://image.tmdb.org/t/p/w342'+i.posterPath+')"></div><div class="cardText">'+escapeHtml(i.title)+'</div></div>').join('')+'</div></section></div></main>';
 enhancePremiereHome(document.querySelector('.homePage'));enhancePremiereHome(document.querySelector('.homePage'));
 document.querySelectorAll('[data-action="resume"]').forEach(b=>b.addEventListener('click',()=>document.querySelector('#qa-result').textContent='Lecture native transmise'));
 document.querySelectorAll('.cardImageContainer').forEach(b=>b.addEventListener('click',()=>document.querySelector('#qa-result').textContent='Fiche native transmise'));
} else {
 document.body.classList.add('noctra-panel-open');
 document.querySelector('#fixture').innerHTML='<div id="noctra-backdrop" data-open="true" data-panel-kind="requests"><aside id="noctra-panel" class="noctra-panel--wide noctra-panel--workspace" data-noctra-panel-kind="requests"><header class="noctra-panel-header"><div><small>NOCTRA · VOS ENVIES</small><h2>Demandes</h2></div><a class="noctra-button" href="/home">Accueil</a></header><div class="noctra-panel-body"></div></aside></div>';
 document.querySelector('.noctra-panel-body').innerHTML=requestHomeShellMarkup({quota:{remaining:7,limit:10},summary:{pending:3}});
 document.querySelector('[data-platform-buttons]').innerHTML=streamingPlatformButtons(data.providers,'8|1796','FR');
 document.querySelector('#noctra-seerr-results').innerHTML='<h3 class="noctra-section-title">À découvrir sur Netflix</h3><div class="noctra-grid noctra-discovery-grid">'+data.samples.map(i=>discoveryCard(i)).join('')+'</div>';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-platform-id]');if(b){document.querySelectorAll('[data-platform-id]').forEach(p=>p.setAttribute('aria-pressed',String(p===b)));document.querySelector('#qa-result').textContent='Plateforme : '+b.textContent.trim();}const nav=e.target.closest('[data-noctra]');if(nav?.dataset.noctra==='requests')location.href='/requests';if(nav?.dataset.noctra==='home')location.href='/home';});
`;
const html=`<!doctype html><html lang="fr" class="layout-desktop"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Noctra Premiere — aperçu de validation</title><link rel="stylesheet" href="/client/46967.03edf3bb7ee048ee10be.css"><link rel="stylesheet" href="/client/main.jellyfin.f725276386e5b19afe0c.css"><link rel="stylesheet" href="/noctra-theme.css"><link rel="stylesheet" href="/noctra-cinema.css"><style>body{margin:0}#qa-result{position:fixed;bottom:0;right:0;font:12px system-ui;background:#15182a;color:#fff;z-index:999999;padding:4px 12px;border-radius:20px}.qa-native-row{display:flex;gap:18px;overflow:auto}.qa-native-row>.card{min-width:240px;flex:1}.qa-native-row .cardScalable{height:150px}.qa-native-row .cardImageContainer{display:block;height:150px;position:static;background-size:cover;background-position:center}.qa-posters{display:flex;gap:16px;overflow:auto}.qa-posters>.card{min-width:150px;flex:1}.qa-posters .cardImageContainer{position:static;display:block;height:225px;background-size:cover}.homePage{padding-top:90px}.qa-native-row .card,.qa-posters .card{padding:0!important}.cardText{padding:8px 2px}</style></head><body class="noctra-ready" data-noctra-role="user"><div id="fixture"></div><output id="qa-result">Aperçu · données de démonstration · aucune demande envoyée</output><script src="/qa.js"></script></body></html>`;
const server=createServer(async(req,res)=>{
 try {
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/qa.js'){res.setHeader('Content-Type','application/javascript');return res.end(js);}
 if(['/','/home','/requests'].includes(pathname)){res.setHeader('Content-Type','text/html');return res.end(html);}
 const publicRoot=resolve(root,'public'),path=resolve(publicRoot,'.'+decodeURIComponent(pathname));
 const rel=relative(publicRoot,path);
 if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',({'.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));
 }catch {res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+'/home'));
