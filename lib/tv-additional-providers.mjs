import { createBowdApi } from './bowd-api.mjs';
import { createHash } from 'node:crypto';
import { decodeFctvStream, fctvSessionUrl } from './fctv-stream.mjs';

const MOVIX = 'https://api.movix.college';
const MOVIX_SITE = 'https://movix.college/';
const NORTH = 'https://northlive.lol';
const RENE = 'https://reneveo.store';
export const additionalTvSources = [
  { id:'bowdtv-guide', name:'BowdTV', provider:'BowdTV', family:'bowd', url:'https://bowdtv.com/live?view=guide&country=France' },
  { id:'fctv33-sports', name:'FCTV33', provider:'FCTV33', family:'matches', url:'https://www.fctv33hd.bar/fr' },
  { id:'reneveo-fr', name:'RénéVéo', provider:'RénéVéo', family:'reneveo', url:RENE+'/live' },
  { id:'movix-vavoo', name:'Movix · Vavoo', provider:'Movix', family:'vavoo', url:MOVIX+'/api/livetv/manifest' },
  { id:'movix-northlive', name:'Northlive', provider:'Northlive', family:'northlive', url:MOVIX+'/api/livetv/manifest' },
  { id:'movix-iptv', name:'Movix · IPTV VIP', provider:'Movix', family:'iptv', url:MOVIX+'/api/livetv/iptv/categories' }
].map(s => ({...s, type:'additional', section:s.family === 'matches' ? 'sports' : 'channels', origin:'builtin', editable:false }));

export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i=0; i<text.length; i++) {
    const c=text[i];
    if (c === '"') { if (quoted && text[i+1] === '"') { field+='"'; i++; } else quoted=!quoted; }
    else if (!quoted && (c===',' || c==='\n')) { row.push(field.replace(/\r$/, '')); field=''; if(c==='\n'){rows.push(row);row=[];} }
    else field+=c;
  }
  if(field || row.length){row.push(field.replace(/\r$/, ''));rows.push(row);}
  const headers=(rows.shift()||[]).map(h=>h.replace(/^\uFEFF/,'').trim());
  return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])));
}

export function parseNorthPlayer(html) {
  const token = JSON.parse(html.match(/const\s+PLAY_TOKEN\s*=\s*("(?:[^"\\]|\\.)*")/)?.[1] || '""');
  const variants = JSON.parse(html.match(/const\s+VARIANTS\s*=\s*(\[[^;]*\])\s*;/)?.[1] || '[]');
  return { token, variants:variants.filter(v=>v.active && /^[a-z0-9-]+$/i.test(v.slug)) };
}

export function parseRenePublicConfig(html) {
  const base = String(html).match(/const\s+SUPABASE_URL\s*=\s*(["'])(https:\/\/[^"'/]+\.supabase\.co\/?)\1/)?.[2];
  const key = String(html).match(/const\s+SUPABASE_ANON_KEY\s*=\s*(["'])([^"']+)\1/)?.[2];
  return {base, key};
}

export function createAdditionalTvProviders({ request, issueReference, streamUrl, publicPath, readKeys, validateStream, readBowdSession, saveBowdSession }) {
  const cache=new Map();
  const headers={ 'user-agent':'Mozilla/5.0', accept:'application/json,text/plain,*/*', referer:MOVIX_SITE };
  async function read(url, options={}) {
    const response=await request(url, { ...options, headers:{...headers,...options.headers}, signal:AbortSignal.timeout(20_000) });
    if(!response.ok) { const e=new Error(`Fournisseur TV indisponible (${response.status}).`);e.status=response.status;throw e; }
    const text=await response.text();
    if(text.length>8*1024*1024) throw new Error('Catalogue TV trop volumineux.');
    return text;
  }
  async function json(url, options={}) { return JSON.parse(await read(url,options)); }
  async function cached(key, fn, ttl=120_000) {
    const previous=cache.get(key);
    if(previous?.expires>Date.now()) return previous.value;
    if(previous?.pending) return previous.pending;
    const pending=fn().then(value=>{cache.set(key,{value,expires:Date.now()+ttl});return value;})
      .catch(error=>{cache.delete(key);throw error;});
    cache.set(key,{...previous,pending});return pending;
  }
  const ref=(provider,id,kind='additional-resolver',extra={})=>issueReference(provider==='reneveo'?RENE+'/live':MOVIX+'/api/livetv/manifest',{}, {kind,provider,id,...extra});
  const resolveUrl=(provider,id,extra={})=>publicPath(`/api/tv/resolve/${ref(provider,id,'additional-resolver',extra)}`);
  const identity=(provider,id)=>createHash('sha1').update(provider+':'+id).digest('hex').slice(0,16);
  function channel(provider,item,group='France') {
    const id=String(item.id || item.stream_id || '');
    return {id:identity(provider,id),name:String(item.name||item.title||id),group,logo:item.poster||item.stream_icon||item.logo||'',
      provider:provider==='matches'?'FCTV33':provider==='northlive'?'Northlive':provider==='reneveo'?'RénéVéo':'Movix',
      playbackType:'resolver',resolverUrl:resolveUrl(provider,id,provider==='matches'?{externalUrl:item._pageUrl||'https://www.fctv33hd.bar/fr'}:{}),streamKind:'HLS',country:provider==='reneveo'||/France|^FR\s*\|/i.test(group)?'France':''};
  }
  async function movixHeaders(){const keys=await readKeys();return keys.movix?{'x-access-key':keys.movix}:{};}
  async function reneRows(){
    return cached('rene-rows',async()=>{
      // Use the public catalogue the provider's own player loads. The CSV is its published fallback.
      try {
        const html=await read(RENE+'/live');
        const {base,key}=parseRenePublicConfig(html);
        if(base && key){
          const data=await json(base.replace(/\/$/,'')+'/rest/v1/channels?select=id,name,logo,slug,category,active,source_1_url,source_1_type,source_2_url,source_2_type,source_3_url,source_3_type&order=sort_order,name',{headers:{apikey:key,authorization:`Bearer ${key}`}});
          if(Array.isArray(data))return data;
        }
      } catch {}
      return parseCsv(await read(RENE+'/assets/serv/channels_rows.csv'));
    });
  }
  const bowd=createBowdApi(request,{readSession:readBowdSession,saveSession:saveBowdSession});
  async function bowdCatalog(country='France'){
    const rows=await cached('bowd-channels:'+country,()=>bowd.channels(country));
    return rows.map(item=>({...channel('bowd',item,country),provider:'BowdTV',country,isLive:true,streamKind:'TV en direct · BowdTV'}));
  }
  async function catalog(family){
    if(family==='bowd'){
      const channels=await bowdCatalog();
      const countries=await cached('bowd-countries',()=>bowd.countries()).catch(()=>({countries:[]}));
      const groups=(countries.countries||[]).map(item=>typeof item==='string'?item:item.country||item.name).filter(Boolean).sort((a,b)=>Number(b==='France')-Number(a==='France')).map(name=>({id:name,name,ref:ref('bowd',name,'additional-group',{name})}));
      return {name:'BowdTV · France',groups,channels,count:channels.length};
    }

    if(family==='reneveo'){
      const rows=(await reneRows()).filter(r=>/^(true|1)$/i.test(String(r.active).trim()));
      const channels=rows.map(r=>channel('reneveo',r,r.category||'France'));
      return {name:'RénéVéo · France',groups:[],channels,count:channels.length};
    }
    if(family==='iptv'){
      const keys=await readKeys();
      if(!keys.movix)return {name:'Movix · IPTV VIP',groups:[],channels:[],count:0,warning:'Activez votre accès Movix dans « Accès TV ».'};
      const data=await json(MOVIX+'/api/livetv/iptv/categories',{headers:await movixHeaders()});
      const categories=[...(data.categories||[])].sort((a,b)=>Number(!/^FR\s*\|/i.test(a.category_name))-Number(!/^FR\s*\|/i.test(b.category_name)));
      return {name:'Movix · IPTV VIP',groups:categories.map(c=>({id:String(c.category_id),name:c.category_name,ref:ref('iptv',String(c.category_id),'additional-group',{name:c.category_name})})),channels:[],count:0};
    }
    const manifest=await cached('movix-manifest',()=>json(MOVIX+'/api/livetv/manifest'));
    let categories=(manifest.catalogs||[]).filter(c=>typeof c.id==='string' && (family==='all' || c.id.startsWith(family+'_')));
    // French bouquets first; all remaining published categories remain available.
    categories.sort((a,b)=>Number(!a.id.startsWith('vavoo_france'))-Number(!b.id.startsWith('vavoo_france')));
    return {name:family==='all'?'Movix · Tous les bouquets':family==='northlive'?'Northlive':family==='vavoo'?'Movix · Vavoo':'Movix · FCTV33',
      groups:categories.map(c=>({id:c.id,name:c.name,ref:ref(family==='all'?c.id.split('_')[0]:family,c.id,'additional-group',{name:c.name})})),channels:[],count:0};
  }
  async function group(meta){
    const {provider,id}=meta;
    if(provider==='bowd'){const channels=await bowdCatalog(id);return {name:'BowdTV · '+id,groups:[],channels,count:channels.length};}
    const url=provider==='iptv'?MOVIX+'/api/livetv/iptv/streams/'+encodeURIComponent(id):MOVIX+'/api/livetv/catalog/tv/'+encodeURIComponent(id);
    const data=await json(url,{headers:await movixHeaders()});
    const channels=(data.metas||data.streams||[]).map(item=>({...channel(provider,item,meta.name||'IPTV'),...(provider==='matches'?{description:[item._competition,item._timeText].filter(Boolean).join(' · '),externalUrl:item._pageUrl||'https://www.fctv33hd.bar/fr',serverCount:item._serverCount||0,category:'Sport',isLive:Boolean(item._isLive)}:{})}));
    return {name:meta.name||'Movix · IPTV',groups:[],channels,count:channels.length};
  }
  function nativeOption(url,label,referer='',extra={}) {
    const provider=label.startsWith('RénéVéo')?'RénéVéo':label.startsWith('Northlive')?'Northlive':'Movix';
    const transport=/\.ts(?:\?|$)/i.test(url) ? 'mpegts' : 'hls';
    const token=issueReference(url,{...(referer?{referer}:{}),...(extra.requestHeaders||{})},{provider,forceHls:transport==='hls'&&/\.m3u8(?:\?|$)/i.test(url)});
    const {requestHeaders,...publicExtra}=extra;
    return {label,playbackType:'stream',streamUrl:streamUrl(token),streamKind:transport==='mpegts'?'MPEG-TS':'HLS',transport,...publicExtra};
  }
  async function northResolve(slug,key){
    if(!/^[a-z0-9-]+$/i.test(slug))throw new Error('Identifiant Northlive invalide.');
    const page=NORTH+'/api/v1/tv/'+encodeURIComponent(slug)+'/player';
    const html=await read(page+'?api_key='+encodeURIComponent(key));
    const {token,variants}=parseNorthPlayer(html);
    const data=await json(NORTH+'/api/v1/index.php?route=play_url&api_key='+encodeURIComponent(key),{method:'POST',headers:{origin:NORTH,referer:page,authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({slug,api_key:key,...(token?{play_token:token}:{})})});
    if(!data.success||!data.url)throw new Error('Northlive n’a pas fourni de flux pour cet accès.');
    const url=new URL(data.url,NORTH);
    if(token&&!url.searchParams.has('pt'))url.searchParams.set('pt',token);
    return {options:[nativeOption(url.href,'Northlive · '+slug,page,{resolveUrl:resolveUrl('northlive','northlive_'+slug)}),
      ...variants.filter(v=>v.slug!==slug).map(v=>({label:v.slug,playbackType:'resolver',resolveUrl:resolveUrl('northlive','northlive_'+v.slug)}))]};
  }
  async function resolve(meta){
    const {provider,id}=meta;
    if(provider==='bowd') {
      const data=await bowd.stream(id);
      const streams=(data.streams||[]).filter(item=>!meta.variantTag||item.variantTag===meta.variantTag);
      if(!streams.length)throw new Error('Aucun serveur BowdTV publié pour cette chaîne.');
      const prepare=async item=>{
        const target=item.direct?.url||item.url;
        const supplied=item.direct?.headers||{};
        const h={};for(const [key,value] of Object.entries(supplied))if(['user-agent','referer','origin'].includes(key.toLowerCase()))h[key.toLowerCase()]=String(value);
        const validated=await validateStream(target,h);
        const token=issueReference(validated?.url||target,{...h,...(validated?.cookie?{cookie:validated.cookie}:{})},{provider:'BowdTV',forceHls:true});
        return {variantTag:item.variantTag,label:'BowdTV · '+String(item.quality||'Auto').toUpperCase(),playbackType:'stream',streamUrl:streamUrl(token),resolveUrl:resolveUrl('bowd',id,{variantTag:item.variantTag})};
      };
      streams.sort((a,b)=>Number(Boolean(b.direct))-Number(Boolean(a.direct)));
      let ready;
      try {ready=await Promise.any(streams.slice(0,4).map(prepare));}
      catch{throw new Error('Les serveurs BowdTV de cette chaîne ne fournissent pas de vidéo actuellement. Essayez une autre chaîne.');}
      return {options:[ready,...streams.map(item=>({variantTag:item.variantTag,label:'BowdTV · '+String(item.quality||'Auto').toUpperCase(),playbackType:'resolver',resolveUrl:resolveUrl('bowd',id,{variantTag:item.variantTag}),manualOnly:true})).filter(item=>item.variantTag!==ready.variantTag)]};
    }
    if(provider==='fctv-server') {
      const local=meta.local;
      if(!local || ![local.matchId,local.streamId,local.sportType,local.siteType].every(n=>Number.isSafeInteger(Number(n))&&Number(n)>0)) throw new Error('Serveur FCTV33 invalide.');
      const base=new URL(local.apiBase);
      if(base.protocol!=='https:'||!/^apis-data(?:-defra)?10\.tcdru136ovur\.ru$/.test(base.hostname))throw new Error('Origine FCTV33 inconnue. Rechargez le programme.');
      const endpoint=new URL('/api/stream/detail',base);
      for(const key of ['matchId','sportType','streamId','siteType'])endpoint.searchParams.set(key,String(local[key]));
      const response=await request(endpoint.href,{headers:{...headers,referer:'https://www.fctv33hd.bar/'},signal:AbortSignal.timeout(12_000)});
      if(!response.ok)throw new Error(`Serveur FCTV33 indisponible (${response.status}).`);
      const url=fctvSessionUrl(decodeFctvStream(new Uint8Array(await response.arrayBuffer())),response.headers.get('rb-session'));
      if(!validateStream) throw new Error('Validation FCTV33 indisponible.');
      const validated=await validateStream(url,{referer:meta.referer||'https://www.fctv33hd.bar/'});
      const token=issueReference(validated?.url||url,{referer:meta.referer||'https://www.fctv33hd.bar/',...(validated?.cookie?{cookie:validated.cookie}:{})},{provider:'FCTV33',forceHls:true});
      return {options:[{label:meta.label||'FCTV33',streamUrl:streamUrl(token),playbackType:'stream',resolveUrl:resolveUrl(provider,id,meta)}]};
    }
    if(provider==='reneveo'){
      const row=(await reneRows()).find(r=>String(r.id)===id&&/^(true|1)$/i.test(String(r.active).trim()));
      if(!row)throw new Error('Chaîne RénéVéo indisponible.');
      const options=[];
      for(let n=1;n<=3;n++){
        if (meta.sourceIndex && Number(meta.sourceIndex) !== n) continue;
        const url=row[`source_${n}_url`];const type=String(row[`source_${n}_type`]||'').toLowerCase().trim();
        if(!url)continue;
        if(type==='hls'||/\.m3u8(?:\?|$)/i.test(url))options.push(nativeOption(url,`RénéVéo · Source ${n}`,RENE+'/live',{resolveUrl:resolveUrl(provider,id,{sourceIndex:n})}));
        else options.push({label:`RénéVéo · Lecteur ${n}`,url,playbackType:'embed',manualOnly:true});
      }
      if(!options.length)throw new Error('Aucune source publiée pour cette chaîne.');
      const native=options.filter(o=>o.streamUrl);
      if(native.length){
        const candidates=[1,2,3].filter(n=>(!meta.sourceIndex || Number(meta.sourceIndex)===n) && row[`source_${n}_url`] && (String(row[`source_${n}_type`]||'').trim().toLowerCase()==='hls'||/\.m3u8(?:\?|$)/i.test(row[`source_${n}_url`])));
        try {
          const first=await Promise.any(candidates.map(async n=>{
            if(validateStream) await validateStream(row[`source_${n}_url`],{referer:RENE+'/live'});
            else {
              const body=await read(row[`source_${n}_url`],{headers:{referer:RENE+'/live'}});
              if(!/^\s*#EXTM3U/.test(body)||/#EXT-X-ENDLIST/.test(body))throw new Error('Direct indisponible');
            }
            return options.find(o=>o.label===`RénéVéo · Source ${n}`);
          }));
          return {options:[first,...options.filter(o=>o!==first).map(o=>({...o,manualOnly:true}))]};
        } catch {
          const web=options.filter(o=>o.playbackType==='embed');
          if(web.length)return {options:[...web.map(o=>({...o,manualOnly:false})),...native.map(o=>({...o,manualOnly:true}))],message:'Les flux directs sont indisponibles. Un lecteur externe reste disponible.'};
          throw new Error('Les sources de cette chaîne RénéVéo ne répondent pas actuellement. Essayez une autre chaîne.');
        }
      }
      return {options};
    }
    const keys=await readKeys();
    if(provider==='northlive'&&keys.northlive)return northResolve(id.replace(/^northlive_/,''),keys.northlive);
    const url=provider==='iptv'?MOVIX+'/api/livetv/iptv/stream-url/'+encodeURIComponent(id):MOVIX+'/api/livetv/stream/tv/'+encodeURIComponent(id);
    const data=await json(url,{headers:await movixHeaders()});
    const streams=Array.isArray(data.streams)?[...data.streams]:[];
    if(provider==='matches') streams.sort((a,b)=>Number(!/^canal\s*(?:\+\s*)?fr\b/i.test(a.title||''))-Number(!/^canal\s*(?:\+\s*)?fr\b/i.test(b.title||'')));
    const options=[];
    for(const [index,item] of streams.entries()){
      if(provider==='matches' && item._fctvLocal) {
        options.push({label:item.title||`Serveur ${index+1}`,playbackType:'resolver',resolveUrl:resolveUrl('fctv-server',id,{local:item._fctvLocal,referer:item._fctvReferer,label:item.title})});
        continue;
      }
      if(!item.url)continue;
      let target;
      try { target=new URL(item.url,MOVIX); } catch { continue; }
      if(!['https:','http:'].includes(target.protocol))continue;
      // Never expose credentials embedded in a Northlive player URL to the browser.
      if(target.hostname==='northlive.lol' && /\/player/.test(target.pathname)){
        const slug=target.pathname.match(/\/tv\/([^/]+)\/player/)?.[1];
        const supplied=keys.northlive||target.searchParams.get('api_key');
        if(slug&&supplied){const resolved=await northResolve(slug,supplied);options.push(...resolved.options);continue;}
      }
      const label=item.title||item.name||`Serveur ${index+1}`;
      if(item.behaviorHints?.notWebReady && !/\.m3u8|\.ts(?:\?|$)/i.test(target.href))continue;
      if(/\/player(?:[/?]|$)|\.html?(?:\?|$)/i.test(target.href)){
        if(![...target.searchParams.keys()].some(k=>/key|token|auth/i.test(k)))options.push({label,url:target.href,playbackType:'embed',manualOnly:true});
      }else {
        const requestHeaders={};
        for(const [key,value] of Object.entries(item.behaviorHints?.proxyHeaders?.request||{})) {
          if(['referer','origin','user-agent'].includes(key.toLowerCase()))requestHeaders[key.toLowerCase()]=String(value);
        }
        if(item.userAgent)requestHeaders['user-agent']=String(item.userAgent);
        options.push(nativeOption(target.href,label,item.referer||requestHeaders.referer||MOVIX_SITE,{resolveUrl:resolveUrl(provider,id),requestHeaders}));
      }
    }
    if(provider==='matches') {
      const web={label:'Lecteur officiel FCTV33',url:meta.externalUrl||'https://www.fctv33hd.bar/fr',playbackType:'embed',compatPage:true};
      // Select the requested French server before resolving it: a failed probe
      // must not silently switch languages or select the official web page.
      const canalOption=options.find(item=>/^canal\s*(?:\+\s*)?fr\b/i.test(item.label||''));
      if(canalOption) return {options:[canalOption,...options.filter(item=>item!==canalOption).map(item=>({...item,manualOnly:true})),{...web,manualOnly:true}]};
      // Keep every server selectable. A failed upstream response is never marked playable.
      const candidates=streams.filter(item=>item._fctvLocal).slice(0,6);
      try {
        const prepare=async item=>{
          const result=await resolve({provider:'fctv-server',id,local:item._fctvLocal,referer:item._fctvReferer,label:item.title});
          return result.options[0];
        };
        const canal=candidates.find(item=>/^canal\s*(?:\+\s*)?fr\b/i.test(item.title||''));
        const preferred=canal ? await prepare(canal).catch(()=>null) : null;
        const ready=preferred || await Promise.any(candidates.filter(item=>item!==canal).map(prepare));
        return {options:[ready,...options.filter(o=>o.label!==ready.label).map(o=>({...o,manualOnly:true})),{...web,manualOnly:true}]};
      } catch {
        return {options:[web,...options.map(o=>({...o,manualOnly:true}))],message:'Les flux directs FCTV33 ne répondent pas. Le lecteur officiel et les choix de serveurs restent disponibles.'};
      }
    }
    if(!options.length)throw new Error('Aucun flux compatible disponible. Vérifiez votre accès TV ou choisissez un autre serveur.');
    return {options};
  }
  async function verify(provider,key){
    if(provider==='movix') { const result=await json(MOVIX+'/api/check-vip',{headers:{'x-access-key':key}});if(!result.vip)throw new Error('Cette clé Movix ne donne pas accès au VIP.');return {expiresAt:result.expiresAt||null}; }
    // Validate a Northlive key with a player route, without starting a broadcast.
    await northResolve('bein-sports-1-fhd-b', key);
    return {};
  }
  return {catalog,group,resolve,verify,clear:()=>cache.clear()};
}
