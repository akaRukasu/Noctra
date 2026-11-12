// Run on the Noctra host: npm run audit:tv
// HTTP reachability and response format only. This does not certify video playback.
const sources = [
  ['LiveWatch','https://livewatch.icu/'],['FSTV','https://fstv.rest/'],
  ['OHA · IP 1','http://185.254.196.78/live'],['OHA · IP 2','http://178.83.5.50/live'],['OHA · Vavoo','http://vavoo.top/live'],['OHA · Kool','https://kool.ws/live'],
  ['WiTV','https://witv.eu/chaines-live/generaliste/'],['Movix','https://movix.men/live-tv'],['Movix · catalogue','https://api.movix.men/api/livetv/manifest'],
  ['Streamed · strmfree.pk','https://strmfree.pk/'],['PPV · rockylive','https://rockylive.st/'],['PPV · tim-streams','https://tim-streams.com/'],['OHA · huhu.bz','https://huhu.bz/'],['Streamed · PK','https://streamed.pk/'],['Streamed · ST','https://streamed.st/'],
  ['StreamSports99','https://streamsports99.su/live-tv'],['BZH-Sport','https://bzh-sport.lat/'],['Volkamax','https://volkamax.club/'],
  ['DaddyLive','https://dlive.sx/'],['BrigitteTV','https://quellefrappe.click/prog.php'],['Xtemus','https://box.xtemus.com/?playlist=u256y494u21596x2'],['Xtemus · lien court','https://rebrand.ly/w/3/u']
];
const results = Array(sources.length); let cursor=0;
async function worker(){
  while(cursor<sources.length){
    const index=cursor++;const [source,url]=sources[index];const started=performance.now();
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(8000),redirect:'follow',headers:{accept:'text/html,application/json,*/*','user-agent':'Noctra-TV-Audit/200.0.78'}});
      const reader=response.body?.getReader();let bytes=0;
      try {while(reader && bytes<16384){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;}}
      finally {await reader?.cancel().catch(()=>{});}
      results[index]={source,http:response.status,ms:Math.round(performance.now()-started),format:response.headers.get('content-type')?.split(';')[0]||'inconnu',result:response.ok&&bytes>0?'Réponse reçue · lecture à tester':'Réponse vide ou erreur HTTP'};
    }catch(error){results[index]={source,http:null,ms:Math.round(performance.now()-started),result:['TimeoutError','AbortError'].includes(error.name)?'Délai dépassé':'Connexion impossible'};}
  }
}
await Promise.all(Array.from({length:4},worker));
console.table(results);
console.log('Ce contrôle ne lance aucun lecteur. Teste ensuite une chaîne dans Noctra : première image, continuité et changement de serveur.');
if(process.argv.includes('--json'))console.log(JSON.stringify({date:new Date().toISOString(),scope:'http-only',results},null,2));
process.exitCode=results.some(r=>!r.http||r.http>=400)?1:0;
