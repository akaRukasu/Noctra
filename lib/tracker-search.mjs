import { releaseMatchesMedia } from './release-match.mjs';

function titleKey(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').toLowerCase().trim();
}

export function trackerSearchIdentity(title, year, metadata = {}) {
  const titles = [];
  const seen = new Set();
  for (const value of [title, metadata.title || metadata.name, metadata.originalTitle || metadata.originalName || metadata.original_title || metadata.original_name]) {
    const safe = String(value || '').trim().slice(0, 240);
    const key = titleKey(safe);
    if (key && !seen.has(key)) { seen.add(key); titles.push(safe); }
  }
  const date = metadata.release_date || metadata.releaseDate || metadata.first_air_date || metadata.firstAirDate || '';
  const canonicalYear = String(date).slice(0, 4);
  return { titles, year: /^\d{4}$/.test(canonicalYear) ? canonicalYear : (/^\d{4}$/.test(String(year)) ? String(year) : '') };
}

export function trackerSearchQueries(identity) {
  const seen = new Set();
  const queries = [];
  const add = query => {
    if (query && !seen.has(query)) { seen.add(query); queries.push(query); }
  };
  identity.titles.forEach(title => add(`${title}${identity.year ? ` ${identity.year}` : ''}`));
  identity.titles.forEach(title => add(titleKey(title)));
  return queries;
}

export async function searchTrackerReleases({ mediaType, identity, indexerIds, preferredIndexerIds = [], exhaustive = true, patient = false, request }) {
  const queries = trackerSearchQueries(identity);
  let rejectedRows = 0;
  let lastError = null;
  let completedAttempts = 0;
  // Recherche interactive des applis (patient) : indexeurs lents attendus jusqu'à une minute.
  const deadline = Date.now() + (patient ? 60_000 : (exhaustive ? 18_000 : 9_000));
  const allIds = [...new Set((indexerIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
  const fastIds = [...new Set((preferredIndexerIds || []).map(Number).filter(id => allIds.includes(id)))];
  const primaryIds = fastIds.length ? fastIds : allIds;
  const sameIndexerSet = primaryIds.length === allIds.length && primaryIds.every(id => allIds.includes(id));
  const titledQueries = queries.slice(0, Math.max(1, identity.titles.length));
  const attempts = [
    ...titledQueries.map(query => ({ query, categories: true, ids: primaryIds })),
    ...(sameIndexerSet || !exhaustive ? [] : titledQueries.map(query => ({ query, categories: true, ids: allIds }))),
    ...queries.slice(titledQueries.length).map(query => ({ query, categories: false, ids: exhaustive ? allIds : primaryIds }))
  ];
  let checkedIndexerIds = [];
  for (const attempt of attempts) {
    const { query } = attempt;
    try {
      if (Date.now() >= deadline) throw new Error('Recherche des trackers trop longue. Relance la verification.');
      const params = new URLSearchParams({ query, type: 'search' });
      // The fallback omits remote categories, but still validates every result locally.
      if (attempt.categories) params.append('categories', mediaType === 'tv' ? '5000' : '2000');
      attempt.ids.forEach(id => params.append('indexerIds', String(id)));
      const payload = await request(`/api/v1/search?${params}`, { method: 'GET', timeoutMs: Math.max(1, Math.min(6_500 * (patient ? 4 : 1), deadline - Date.now())) });
      const rows = Array.isArray(payload) ? payload : payload?.records || payload?.results || payload?.data;
      if (!Array.isArray(rows)) throw new Error('Reponse de recherche Prowlarr invalide.');
      completedAttempts += 1;
      checkedIndexerIds = attempt.ids;
      const matching = rows.filter(item => identity.titles.some(title => releaseMatchesMedia(item, mediaType, title, identity.year)));
      rejectedRows = Math.max(rejectedRows, rows.length - matching.length);
      if (matching.length) {
        const unique = new Map();
        matching.forEach(row => unique.set(`${row.indexerId || row.indexer || row.indexerName}:${row.guid || row.infoHash || `${row.title}:${row.size}`}`, row));
        return { rows: [...unique.values()], rejectedRows, query, error: null, checkedIndexerIds };
      }
    } catch (error) { lastError = error; }
  }
  return { rows: [], rejectedRows, query: queries[0], error: completedAttempts ? null : lastError, checkedIndexerIds };
}
