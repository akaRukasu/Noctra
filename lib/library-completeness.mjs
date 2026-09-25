const positive = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
export const providerId = (item, name) => positive(Object.entries(item?.ProviderIds || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]);
const dateState = (date, now) => {
  const timestamp = Date.parse(date || '');
  return !Number.isFinite(timestamp) ? 'undated' : timestamp > now ? 'upcoming' : 'missing';
};

function finishGroup(group, entries, present, expected, warning = '') {
  const missingCount = entries.filter(row => row.state === 'missing').length;
  const upcomingCount = entries.filter(row => row.state === 'upcoming').length;
  const unknownCount = entries.filter(row => ['undated', 'unverified'].includes(row.state)).length;
  return { ...group, present, expected, missingCount, upcomingCount, unknownCount, warning,
    status: missingCount ? 'incomplete' : unknownCount || warning || !expected ? 'unknown' : 'complete', entries };
}

export function auditMovieCollection(collection, inventory, now = Date.now()) {
  const parts = [...new Map((collection.parts || []).filter(part => positive(part.id)).map(part => [Number(part.id), part])).values()];
  const entries = [];
  let present = 0;
  for (const part of parts) {
    const state = inventory.get(Number(part.id));
    if (state === 'present') { present++; continue; }
    const date = part.release_date || part.releaseDate || '';
    entries.push({ id: String(part.id), title: part.title || part.original_title || part.originalTitle || `Film ${part.id}`, date,
      state: state === 'unverified' ? 'unverified' : dateState(date, now) });
  }
  entries.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  return finishGroup({ id: `movie:${collection.id}`, kind: 'movie', title: collection.name || 'Saga', source: 'TMDB' },
    entries, present, parts.length, parts.length ? '' : 'Liste des films indisponible.');
}

export function auditSeries(series, expectedEpisodes, ownedEpisodes, { now = Date.now(), source = 'TMDB', warning = '' } = {}) {
  const expected = [...new Map(expectedEpisodes.filter(row => Number(row.season) > 0 && positive(row.episode))
    .map(row => [`${row.season}:${row.episode}`, row])).values()];
  const entries = [];
  const matchedFiles = new Set();
  let present = 0;
  for (const row of expected) {
    // Match episode identities first; numbering is only a fallback when an ID is unavailable.
    const matches = ownedEpisodes.filter(owned => {
      const sameId = row.provider && row.providerId && providerId(owned, row.provider) === Number(row.providerId);
      if (sameId) return true;
      const start = Number(owned.IndexNumber), end = Math.max(start, Number(owned.IndexNumberEnd) || start);
      if (Number(owned.ParentIndexNumber) !== Number(row.season) || row.episode < start || row.episode > end) return false;
      return end > start || !row.providerId || !providerId(owned, row.provider);
    });
    matches.forEach(item => matchedFiles.add(item));
    if (matches.some(item => item.fileState === 'present')) { present++; continue; }
    entries.push({ id: `${row.season}:${row.episode}`, title: row.title || `Episode ${row.episode}`,
      season: Number(row.season), episode: Number(row.episode), date: row.date || '',
      state: matches.some(item => item.fileState === 'unverified') ? 'unverified' : dateState(row.date, now) });
  }
  const unmatchedFiles = ownedEpisodes.filter(item => item.fileState === 'present' && Number(item.ParentIndexNumber) !== 0 && !matchedFiles.has(item));
  if (unmatchedFiles.length) {
    warning = `${warning ? `${warning} ` : ''}${unmatchedFiles.length} fichier(s) avec une numerotation non rapprochee. Absences a confirmer.`;
    for (const entry of entries) if (entry.state === 'missing') entry.state = 'unverified';
  }
  entries.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return finishGroup({ id: `series:${series.Id}`, kind: 'series', title: series.Name, source }, entries, present, expected.length,
    warning || (expected.length ? '' : 'Liste des episodes indisponible.'));
}

async function eachLimit(items, limit, callback) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) await callback(items[cursor++]);
  }));
}

export function createLibraryAudit({ inventory, fileState, metadata, arrCatalog, sonarrEpisodes }) {
  let state = { running: false, phase: 'idle', processed: 0, total: 0, groups: [], warnings: [] };
  const unknown = (item, kind, warning) => finishGroup({ id: `${kind}:${item.Id}`, kind, title: item.Name, source: '' }, [], 0, 0, warning);
  const snapshot = () => {
    const groups = state.groups.map(({ entries, ...group }) => group).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    return { ...state, groups, counts: {
      incomplete: groups.filter(g => g.status === 'incomplete').length,
      complete: groups.filter(g => g.status === 'complete').length,
      unknown: groups.filter(g => g.status === 'unknown').length,
      missing: groups.reduce((n, g) => n + g.missingCount, 0),
      upcoming: groups.reduce((n, g) => n + g.upcomingCount, 0)
    } };
  };
  async function run(session) {
    try {
      const items = await inventory(session);
      const movies = items.filter(i => i.Type === 'Movie');
      const series = items.filter(i => i.Type === 'Series');
      const episodes = items.filter(i => i.Type === 'Episode');
      state.movies = movies.length;
      state.series = series.length;
      state.phase = 'files';
      state.total = movies.length + episodes.length;
      state.message = 'Verification des fichiers presents sur le serveur';
      await eachLimit([...movies, ...episodes], 12, async item => {
        item.fileState = await fileState(item);
        state.processed++;
      });
      const movieInventory = new Map();
      for (const item of movies) {
        const id = providerId(item, 'Tmdb');
        if (id && (movieInventory.get(id) !== 'present')) movieInventory.set(id, item.fileState);
      }
      const bySeries = new Map();
      for (const episode of episodes) {
        if (!bySeries.has(episode.SeriesId)) bySeries.set(episode.SeriesId, []);
        bySeries.get(episode.SeriesId).push(episode);
      }
      const seriesGroups = new Map();
      for (const item of series) {
        const key = providerId(item, 'Tmdb') ? `tmdb:${providerId(item, 'Tmdb')}`
          : providerId(item, 'Tvdb') ? `tvdb:${providerId(item, 'Tvdb')}` : item.Id;
        const previous = seriesGroups.get(key);
        if (previous) previous.owned.push(...(bySeries.get(item.Id) || []));
        else seriesGroups.set(key, { item, owned: [...(bySeries.get(item.Id) || [])] });
      }
      const catalog = {};
      for (const type of ['radarr', 'sonarr']) {
        try { catalog[type] = await arrCatalog(type); }
        catch { catalog[type] = []; state.warnings.push(`${type === 'sonarr' ? 'Sonarr' : 'Radarr'} indisponible : comparaison via TMDB.`); }
      }
      const radarr = new Map(catalog.radarr.map(item => [Number(item.tmdbId), item]));
      const sonarr = new Map(catalog.sonarr.map(item => [Number(item.tvdbId), item]));
      const collections = new Map();
      const uniqueMovies = [...new Map(movies.map(item => [providerId(item, 'Tmdb') || item.Id, item])).values()];
      state.phase = 'catalog'; state.processed = 0; state.total = uniqueMovies.length + seriesGroups.size;
      state.standalone = 0;
      state.message = 'Comparaison des sagas et des saisons';
      await eachLimit(uniqueMovies, 3, async item => {
        try {
          const id = providerId(item, 'Tmdb');
          if (!id) { state.groups.push(unknown(item, 'movie', 'Identifiant TMDB absent dans Jellyfin.')); return; }
          let collection = radarr.get(id)?.collection;
          if (!positive(collection?.tmdbId || collection?.id)) {
            const detail = await metadata(`/movie/${id}`);
            collection = detail.collection || detail.belongs_to_collection;
          }
          const collectionId = positive(collection?.tmdbId || collection?.id);
          if (collectionId) collections.set(collectionId, collection);
          else state.standalone++;
        } catch { state.groups.push(unknown(item, 'movie', 'Metadonnees du film indisponibles. Reessayer plus tard.')); }
        finally { state.processed++; }
      });
      state.total += collections.size;
      await eachLimit([...collections], 3, async ([id, collection]) => {
        try { state.groups.push(auditMovieCollection(await metadata(`/collection/${id}`), movieInventory)); }
        catch { state.groups.push(unknown({ Id: id, Name: collection.name || collection.title || `Saga ${id}` }, 'movie', 'Liste de la saga indisponible.')); }
        finally { state.processed++; }
      });
      await eachLimit([...seriesGroups.values()], 3, async ({ item, owned }) => {
        try {
          const managed = sonarr.get(providerId(item, 'Tvdb'));
          let expected, source = 'TMDB', warning = '';
          if (managed) {
            try {
              const rows = await sonarrEpisodes(managed.id);
              if (!Array.isArray(rows) || !rows.length) throw new Error('Empty episodes');
              expected = rows.map(row => ({ season: row.seasonNumber, episode: row.episodeNumber, title: row.title,
                date: row.airDateUtc || row.airDate, provider: 'Tvdb', providerId: row.tvdbId }));
              source = 'Sonarr / TVDB';
            } catch { warning = 'Sonarr indisponible pour cette serie. Comparaison TMDB uniquement.'; }
          }
          if (!expected) {
            const id = providerId(item, 'Tmdb');
            if (!id) { state.groups.push(unknown(item, 'series', 'Identifiant de serie absent.')); return; }
            const detail = await metadata(`/tv/${id}`);
            const seasons = (detail.seasons || []).filter(row => Number(row.seasonNumber ?? row.season_number) > 0);
            expected = [];
            let failed = 0;
            // Season calls stay sequential per series to bound pressure on metadata services.
            for (const season of seasons) {
              const number = Number(season.seasonNumber ?? season.season_number);
              try {
                const data = await metadata(`/tv/${id}/season/${number}`);
                if (!Array.isArray(data.episodes) || (!data.episodes.length && Number(season.episodeCount ?? season.episode_count) > 0)) throw new Error('Missing season');
                expected.push(...data.episodes.map(row => ({ season: number, episode: row.episodeNumber ?? row.episode_number,
                  title: row.name, date: row.airDate || row.air_date, provider: 'Tmdb', providerId: row.id })));
              } catch { failed++; }
            }
            if (failed) warning = `${failed} saison(s) sans metadonnees : resultat partiel.`;
          }
          state.groups.push(auditSeries(item, expected, owned, { source, warning }));
        } catch { state.groups.push(unknown(item, 'series', 'Liste des episodes indisponible. Reessayer plus tard.')); }
        finally { state.processed++; }
      });
      state.phase = 'complete';
      state.message = 'Verification terminee';
    } catch (error) {
      state.phase = 'failed';
      state.message = error?.message || 'Inventaire indisponible';
    } finally {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    }
  }
  return {
    snapshot,
    detail(id, offset = 0) {
      const group = state.groups.find(item => item.id === id);
      if (!group) return null;
      offset = Math.max(0, Math.floor(Number(offset) || 0));
      return { id, entries: group.entries.slice(offset, offset + 100), total: group.entries.length,
        nextOffset: offset + 100 < group.entries.length ? offset + 100 : null };
    },
    start(session) {
      if (state.running) return snapshot();
      state = { running: true, phase: 'inventory', processed: 0, total: 0, groups: [], warnings: [],
        message: 'Inventaire Jellyfin', startedAt: new Date().toISOString(), finishedAt: null };
      void run(session);
      return snapshot();
    }
  };
}
