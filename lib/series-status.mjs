import { auditSeries, providerId } from './library-completeness.mjs';

export async function seriesStatus(item, owned, metadata, now = Date.now(), managed = null) {
  const unknown = {state:'unknown', label:'Non vérifié', description:'Métadonnées insuffisantes pour vérifier les épisodes. Hors épisodes spéciaux.'};
  let id = providerId(item, 'Tmdb');
  if (!id && !managed) return unknown;
  try {
    // Some anime imports duplicate episode 1 as episode 0 with the same TVDB ID.
    owned = owned.filter(e => Number(e.IndexNumber) !== 0 || !owned.some(other =>
      Number(other.IndexNumber) > 0 && other.fileState === 'present' &&
      ['Tvdb','Tmdb'].some(p => providerId(e,p) && providerId(e,p) === providerId(other,p))));
    let detail;
    try {
      detail = managed ? {status:managed.status === 'ended' ? 'Ended' : managed.status === 'continuing' ? 'Returning Series' : ''} : await metadata(`/tv/${id}`);
    } catch {
      // Deleted standalone anime entries may have been merged into a parent show's season.
      const regular=owned.filter(e=>e.fileState==='present' && Number(e.ParentIndexNumber)>0);
      if (!regular.length || regular.some(e=>!/^tt\d+$/.test(e.ProviderIds?.Imdb || ''))) return unknown;
      const resolved=[];
      let cursor=0;
      await Promise.all(Array.from({length:3},async()=>{
        while(cursor<regular.length){
          const o=regular[cursor++];
          const data=await metadata(`/find/${o.ProviderIds.Imdb}?external_source=imdb_id`);
          if (data.tv_episode_results?.length !== 1) throw Error('Ambiguous episode');
          resolved.push({o,e:data.tv_episode_results[0]});
        }
      }));
      const first=resolved[0].e;
      if (!first.show_id || first.season_number<1 || resolved.some(({e})=>e.show_id!==first.show_id || e.season_number!==first.season_number) || !resolved.some(({e})=>e.episode_number===1)) return unknown;
      id=first.show_id;
      detail=await metadata(`/tv/${id}`);
      detail={...detail,seasons:detail.seasons.filter(s=>Number(s.season_number ?? s.seasonNumber)===Number(first.season_number))};
      owned=resolved.map(({o,e})=>({...o,ParentIndexNumber:e.season_number,IndexNumber:e.episode_number,IndexNumberEnd:undefined,ProviderIds:{Tmdb:String(e.id)}}));
    }
    const seasons = (detail.seasons || []).filter(s => Number(s.season_number ?? s.seasonNumber) > 0);
    if (!seasons.length && !managed) return unknown;
    const expected = [];
    if (managed) expected.push(...managed.episodes.map(e=>({season:e.seasonNumber,episode:e.episodeNumber,date:e.airDateUtc || e.airDate,provider:'Tvdb',providerId:e.tvdbId,title:e.title})));
    for (const season of seasons) {
      const number = Number(season.season_number ?? season.seasonNumber);
      const data = await metadata(`/tv/${id}/season/${number}`);
      if (!Array.isArray(data.episodes) || data.episodes.length < Number(season.episode_count ?? season.episodeCount ?? 0)) return unknown;
      expected.push(...data.episodes.map(e => ({season:number, episode:e.episode_number ?? e.episodeNumber,
        date:e.air_date ?? e.airDate, runtime:e.runtime, provider:'Tmdb', providerId:e.id, title:e.name})));
    }
    // Anime files often use absolute numbering which Jellyfin mistakes for specials.
    if (providerId(item,'AniDB') || providerId(item,'AniList') || providerId(item,'MyAnimeList')) {
      const order=[...expected].filter(e=>e.season>0).sort((a,b)=>a.season-b.season || a.episode-b.episode);
      const title=item.Name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'[ ._-]+');
      const numbered=new RegExp(`^(?:\\[[^\\]]+\\]\\s*)?${title}[ ._-]+(?:S\\d+E)?(\\d{1,4})(?=[ ._-])`,'i');
      const parsed=owned.filter(o=>!/(?:^|[ ._-])S00E\d+/i.test(o.Path?.split(/[\\/]/).pop() || '')).map(o=>{
        const file=o.Path?.split(/[\\/]/).pop() || '';
        return {o,n:Number(file.match(/^(\d{1,4})\s*[-–. ]/u)?.[1] || file.match(numbered)?.[1])};
      });
      if (parsed.length && parsed.every(p=>p.n>0 && p.n<=order.length) && new Set(parsed.map(p=>p.n)).size===parsed.length) {
        owned=parsed.map(({o,n})=>({...o,ParentIndexNumber:order[n-1].season,IndexNumber:order[n-1].episode,IndexNumberEnd:undefined,ProviderIds:{[order[n-1].provider]:String(order[n-1].providerId)}}));
      }
    }
    // Reconcile different season layouts using stable episode identities, never totals.
    let result = auditSeries(item, expected, owned, {now});
    const overlapsAnnouncement = result.missingCount && expected.some(e=>!e.date && owned.some(o=>Number(o.ParentIndexNumber)===Number(e.season) && Number(o.IndexNumber)===Number(e.episode)));
    if ((result.warning || overlapsAnnouncement) && !managed) {
      const normalized = owned.map(e=>({...e,ProviderIds:{...e.ProviderIds}}));
      const unresolved = expected.filter(e=>result.entries.some(r=>r.season===e.season && r.episode===Number(e.episode)));
      let cursor=0;
      await Promise.all(Array.from({length:3},async()=>{
        while(cursor<unresolved.length){
          const e=unresolved[cursor++];
          try{
            const ids=await metadata(`/tv/${id}/season/${e.season}/episode/${e.episode}/external_ids`);
            const matches=normalized.filter(o=>Number(o.ParentIndexNumber)!==0 && ((ids.tvdb_id && providerId(o,'Tvdb')===Number(ids.tvdb_id)) || (ids.imdb_id && o.ProviderIds.Imdb===ids.imdb_id)));
            for(const o of matches) o.ProviderIds.Tmdb=String(e.providerId);
          }catch{}
        }
      }));
      result=auditSeries(item,expected,normalized,{now});
      if (overlapsAnnouncement && result.missingCount) result.warning ||= 'Correspondance avec une saison annoncée non confirmée.';
    }
    const undated=result.entries.filter(e=>e.state==='undated');
    const lastDated=Math.max(0,...expected.filter(e=>e.date).map(e=>Number(e.season)*100000+Number(e.episode)));
    const announced=detail.status==='Returning Series' && undated.every(e=>e.season*100000+e.episode>lastDated);
    const description = `${result.present} épisode(s) présent(s), ${result.missingCount} manquant(s), ${result.upcomingCount} à venir. Hors épisodes spéciaux.`;
    const runtimes=expected.map(e=>Number(e.runtime)).filter(n=>n>0).sort((a,b)=>a-b);
    const standard=runtimes[Math.floor(runtimes.length/2)] || Number(managed?.runtime);
    const regular=owned.filter(e=>e.fileState==='present' && Number(e.ParentIndexNumber)>0);
    const bundled=standard>0 && regular.length>0 && regular.filter(e=>Number(e.RunTimeTicks)/600000000>standard*1.6).length>regular.length*.8;
    if ((result.missingCount || result.warning) && bundled) return {...unknown,label:'Épisodes regroupés',description:'Les fichiers contiennent plusieurs segments par épisode. Le découpage du catalogue diffère : aucun nombre de manquants fiable ne peut être annoncé. Hors épisodes spéciaux.'};
    if ((result.warning && result.present !== result.expected) || (result.unknownCount && !(announced && undated.length===result.unknownCount)) || !result.expected) return {...unknown, label:result.warning ? 'Numérotation à vérifier' : unknown.label, description:result.warning ? `${result.present} épisode(s) reconnu(s). ${result.warning} Aucun total de manquants fiable tant que ces correspondances ne sont pas résolues. Hors épisodes spéciaux.` : 'Numérotation ou dates à vérifier. ' + description};
    const ownedSeasons=[...new Set(regular.map(e=>Number(e.ParentIndexNumber)))];
    if (result.missingCount && ownedSeasons.length===1 && result.entries.filter(e=>e.state==='missing').every(e=>e.season!==ownedSeasons[0])) {
      return {state:'incomplete',label:`Saison ${ownedSeasons[0]} à jour`,description:`Seule la saison ${ownedSeasons[0]} est présente et ses épisodes diffusés sont disponibles. La série entière est incomplète : ${result.missingCount} épisodes absents dans les autres saisons. Hors épisodes spéciaux.`};
    }
    if (result.missingCount) return {state:'incomplete',label:`${result.missingCount} épisode${result.missingCount > 1 ? 's' : ''} manquant${result.missingCount > 1 ? 's' : ''}`,description};
    if (['Ended','Canceled'].includes(detail.status) && !result.upcomingCount) return {state:'complete',label:'Complet',description};
    if (['Returning Series','In Production','Planned','Pilot'].includes(detail.status)) return {state:'ongoing',label:result.present ? 'À jour · en cours' : 'À venir',description:description+(undated.length ? ` ${undated.length} épisode(s) annoncé(s) sans date.` : '')};
    return {...unknown, description:'Statut de fin de diffusion non confirmé. ' + description};
  } catch { return {...unknown,description:'Vérification momentanément indisponible. Hors épisodes spéciaux.'}; }
}
