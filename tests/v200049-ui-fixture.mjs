// Local visual regression fixture. Uses production CSS, icon repair and TV markup;
// no credentials, external providers or replacement production authentication.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const shell = await readFile(resolve(root, 'public/noctra-shell.js'), 'utf8');
const extract = name => {
  const start = shell.indexOf(`  function ${name}(`);
  if (start < 0) throw Error(name);
  return shell.slice(start, shell.indexOf('\n  }', start) + 4);
};
const icons = shell.slice(shell.indexOf('  const icons ='), shell.indexOf('\n  };', shell.indexOf('  const icons =')) + 5);
const dock = shell.slice(shell.indexOf('<nav id="noctra-dock"'), shell.indexOf('</nav>', shell.indexOf('<nav id="noctra-dock"')) + 6);
const js = `${icons}\n${['normalizedText','materialIconFallback','repairMaterialIconFallbacks','repairHeaderMenuIcons','renderTvWorkspace','tvChannelCard','tvChannelMeta'].map(extract).join('\n')}
const markRecentHomeSections = () => {};
const escapeHtml = value => String(value ?? '').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const tvState = {mobileView:'channels',group:'Toutes',search:'',currentChannelIndex:0};
const tvNavigationSequence=1, authContext={isAdmin:false};
const tvNavigationMarkup=()=>'<div class="noctra-tabs"><button class="noctra-tab" data-active="true">Chaînes</button><button class="noctra-tab">Favoris</button><button class="noctra-tab">Sports</button></div>';
const tvSourceFormMarkup=()=>'',liveWatchVipMarkup=()=>'',tvLegalNote=()=>'',tvGroupCard=()=>'',scheduleTvLogoRefresh=()=>{};
const tvProgrammeLine=c=>c.now.title,tvChannelSearchBlob=c=>c.name,tvIsFavorite=()=>false;
const tvLogoMarkup=c=>'<b style="font:700 20px system-ui">'+escapeHtml(c.name.slice(0,2))+'</b>';
const setPanelBody=(html,options)=>{document.querySelector('.noctra-panel-body').innerHTML=html;options.afterUpdate?.();};
const renderTvChannelList=()=>{document.querySelector('.noctra-tv-channel-list').innerHTML=tvState.catalog.channels.map((c,i)=>tvChannelCard(c,i)).join('');};
document.body.insertAdjacentHTML('beforeend', \`${dock}\`);
const nav=document.querySelector('#noctra-dock');nav.dataset.role='user';nav.dataset.expanded='true';
nav.querySelectorAll('[data-noctra]').forEach(b=>{b.dataset.active=String(b.dataset.noctra==='tv');b.addEventListener('click',()=>{document.querySelector('#qa-result').textContent=b.getAttribute('aria-label');});});
if((location.pathname==='/tv'||location.pathname.endsWith('/tv.html'))) {
 document.body.classList.add('noctra-panel-open');
 document.querySelector('#fixture').innerHTML='<div id="noctra-backdrop" data-open="true" data-panel-kind="tv"><aside id="noctra-panel" class="noctra-panel--wide noctra-panel--workspace" data-noctra-panel-kind="tv"><header class="noctra-panel-header"><div><small>NOCTRA</small><h2>Télévision</h2></div><button class="noctra-button" aria-label="Fermer">×</button></header><div class="noctra-panel-body"></div></aside></div>';
 renderTvWorkspace({name:'Chaînes',source:{id:'fixture',section:'channels',provider:'QA'},channels:['France 2','France 3','France 5','ARTE','Franceinfo','TV5 Monde','LCP','France 24'].map((name,i)=>({name,group:'France',isLive:true,now:{title:['Le journal','Découverte','Culture & documentaires'][i%3]},quality:'HD',provider:'Source TV'})),groups:[],nativePlayback:true});
} else {
 const groups=[['akarukasu',[['Profil','person','lnkUserProfile'],['Connexion rapide','phonelink_lock'],['Affichage','tv'],['Accueil','home'],['Lecture','play_arrow'],['Sous-titres','closed_caption'],['Contrôles','keyboard']]],['Administration',[['Tableau de bord','dashboard'],['Gestionnaire de métadonnées','edit']]],['Utilisateur',[['Se déconnecter','exit_to_app']]]];
 const settings='<main class="libraryPage userPreferencesPage"><div class="padded-left padded-right padded-bottom-page padded-top"><div class="readOnlyContent">'+groups.map(([title,rows])=>'<section class="verticalSection verticalSection-extrabottompadding"><h2 class="sectionTitle headerUsername">'+title+'</h2>'+rows.map(([label,glyph,cls])=>'<a href="#'+glyph+'" class="listItem-border '+(cls||'')+'" style="display:block;margin:0;padding:0"><div class="listItem"><span class="material-icons listItemIcon listItemIcon-transparent '+glyph+'" aria-hidden="true"></span><div class="listItemBody"><div class="listItemBodyText">'+label+'</div></div></div></a>').join('')+'</section>').join('')+'</div></div></main>';
 const rows=[['Lire','play_arrow','resume'],['Tout lire à partir d’ici','play_arrow','playallfromhere'],['Sélectionner','check_box_outline_blank','select'],['Ajouter à la collection','library_add','addtocollection'],['Ajouter à la liste de lecture','playlist_add','addtoplaylist'],['Télécharger','file_download','download'],['Copier l’URL du flux','content_copy','copy-stream']];
 const menu='<section class="actionSheet actionsheet-not-fullscreen" style="position:relative;inset:auto;margin:36px auto;width:320px;padding:8px">'+rows.map(([label,glyph,id])=>'<button is="emby-button" type="button" class="actionSheetMenuItem listItem" data-id="'+id+'"><span class="actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons '+glyph+'" aria-hidden="true"></span><div class="listItemBody actionsheetListItemBody"><div class="listItemBodyText actionSheetItemText">'+label+'</div></div></button>').join('')+'</section>';
 document.querySelector('#fixture').innerHTML=(location.pathname==='/menu'||location.pathname.endsWith('/menu.html'))?menu:settings;
 repairHeaderMenuIcons();repairMaterialIconFallbacks();
 const count=document.querySelectorAll('svg[data-noctra-material-icon]').length;
 repairHeaderMenuIcons();repairMaterialIconFallbacks();
 document.body.dataset.iconCheck=String(count===document.querySelectorAll('svg[data-noctra-material-icon]').length);
 document.querySelectorAll('.actionSheetMenuItem').forEach(b=>b.addEventListener('click',()=>{document.querySelector('#qa-result').textContent=b.dataset.id;}));
}
`;
const html = `<!doctype html><html lang="fr" class="layout-desktop"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Noctra — vérification locale</title><link rel="stylesheet" href="/client/46967.03edf3bb7ee048ee10be.css"><link rel="stylesheet" href="/client/main.jellyfin.f725276386e5b19afe0c.css"><link rel="stylesheet" href="/noctra-theme.css"><style>body{margin:0}.userPreferencesPage{padding-top:24px!important}.listItem{display:flex;align-items:center}.actionSheetMenuItem{width:100%;border:0;background:transparent;text-align:left}#qa-result{position:fixed;top:0;right:0;z-index:999999;background:#111;color:white;font:12px system-ui}</style></head><body data-noctra-role="user"><div id="fixture"></div><output id="qa-result"></output><script src="/fixture.js"></script></body></html>`;
const server=createServer(async(req,res)=>{
 try {
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/fixture.js'){res.setHeader('Content-Type','application/javascript');return res.end(js);}
 if(pathname==='/mobile'){res.setHeader('Content-Type','text/html');return res.end('<html><body style="background:#252833;margin:0"><iframe title="Mobile" src="/settings" style="width:390px;height:844px;border:0"></iframe><iframe title="Menu mobile" src="/menu" style="width:390px;height:844px;border:0"></iframe></body></html>');}
 if(['/','/settings','/menu','/tv'].includes(pathname)){res.setHeader('Content-Type','text/html');return res.end(html);}
 const path=resolve(root,'public','.'+decodeURIComponent(pathname));
 if(!path.startsWith(resolve(root,'public')+'/')){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',({'.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));
 }catch{res.writeHead(404);res.end();}
});
if(process.argv.includes('--export')) {
 const out=resolve(root,'../../qa-v49');await mkdir(out,{recursive:true});
 const local=html.replaceAll('href="/','href="../work/noctra-media-client-v200.0.49/public/').replace('src="/fixture.js"','src="fixture.js"');
 await writeFile(resolve(out,'fixture.js'),js.replace('../noctra-mark.svg','../work/noctra-media-client-v200.0.49/public/noctra-mark.svg'));
 await Promise.all(['settings','menu','tv'].map(name=>writeFile(resolve(out,name+'.html'),local)));
 await writeFile(resolve(out,'mobile.html'),'<html><body style="background:#252833;margin:0"><iframe title="Mobile" src="settings.html" style="width:390px;height:844px;border:0"></iframe><iframe title="Menu mobile" src="menu.html" style="width:390px;height:844px;border:0"></iframe></body></html>');
 console.log(out);
} else server.listen(Number(process.env.QA_PORT||8765),'0.0.0.0',()=>console.log('Noctra UI fixture http://localhost:8765/settings'));
