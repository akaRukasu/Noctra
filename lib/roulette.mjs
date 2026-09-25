// Requests always use the signed-in user's Jellyfin session.
export function rouletteFilters(params, currentYear = new Date().getFullYear()) {
  const integer = (key, fallback, min, max) => {
    const raw = params.get(key);
    if (raw === null || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Filtre ${key} invalide.`);
    return value;
  };
  const count = integer('count', 1, 1, 10);
  const minYear = integer('minYear', 1870, 1870, currentYear + 2);
  const maxYear = integer('maxYear', currentYear + 2, 1870, currentYear + 2);
  if (minYear > maxYear) throw new Error('L’année minimum doit précéder l’année maximum.');
  const rating = Number(params.get('rating') || 0);
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) throw new Error('La note doit être comprise entre 0 et 10.');
  return { count, minYear, maxYear, rating, library: String(params.get('library') || ''),
    genre: String(params.get('genre') || '').trim().slice(0, 80), unplayed: params.get('unplayed') === '1' };
}

export async function drawRoulette({ filters, libraries, items, imageUrl, random = Math.random }) {
  const available = Object.entries(libraries).filter(([, lib]) => lib && (!filters.library || lib.id === filters.library));
  if (filters.library && !available.length) throw new Error('Cette médiathèque n’est pas accessible à ton compte.');
  const params = {
    Recursive: true, SortBy: 'Random', Limit: filters.count,
    Fields: 'Overview,Genres,CommunityRating,ProductionYear,ImageTags',
    EnableTotalRecordCount: false, MinCommunityRating: filters.rating,
    Years: Array.from({ length: filters.maxYear - filters.minYear + 1 }, (_, i) => i + filters.minYear).join(','),
    ...(filters.genre ? { Genres: filters.genre } : {}),
    ...(filters.unplayed ? { IsPlayed: false } : {})
  };
  const batches = await Promise.all(available.map(async ([label, lib]) => {
    const result = await items({ ...params, ParentId: lib.id, IncludeItemTypes: lib.type === 'tvshows' ? 'Series' : 'Movie' });
    return result.map(item => ({ id: item.Id, title: item.Name || 'Sans titre', type: item.Type,
      year: item.ProductionYear || null, rating: item.CommunityRating || null, overview: item.Overview || '',
      genres: item.Genres || [], library: label, image: item.ImageTags?.Primary ? imageUrl(item) : '' }));
  }));
  const pool = [...new Map(batches.flat().map(item => [item.id, item])).values()];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { results: pool.slice(0, filters.count), requested: filters.count };
}
