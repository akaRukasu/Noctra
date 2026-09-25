// Subscription variants share a tile. Reseller channels and stores stay distinct.
export function providerIdentity(name) {
  const clean = String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (/amazon channels?|apple tv channels?|store|boutique|vod/i.test(clean)) return clean;
  if (/^netflix(?: standard with ads)?$/i.test(clean)) return 'Netflix';
  if (/^amazon prime video(?: with ads)?$/i.test(clean)) return 'Amazon Prime Video';
  if (/^paramount(?: plus|\+)(?: premium| basic with ads)?$/i.test(clean)) return 'Paramount+';
  if (/^(?:hbo )?max(?: with ads)?$/i.test(clean)) return 'HBO Max';
  if (/^disney(?: plus|\+)$/i.test(clean)) return 'Disney+';
  return clean;
}

export function normalizeProviders(rows, region = 'FR') {
  const groups = new Map();
  for (const row of rows || []) {
    const ids = row.ids || [row.provider_id ?? row.id];
    const valid = ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
    const name = providerIdentity(row.provider_name ?? row.name);
    if (!valid.length || !name) continue;
    const key = name.toLocaleLowerCase('fr');
    const priority = Number(row.display_priorities?.[region] ?? row.display_priority ?? row.displayPriority ?? 9999);
    const old = groups.get(key);
    const logoPath = row.logo_path ?? row.logoPath ?? null;
    if (old) {
      old.ids = [...new Set([...old.ids, ...valid])];
      if (priority < old.priority) { old.priority = priority; old.logoPath = logoPath || old.logoPath; }
    } else groups.set(key, { name, ids: [...new Set(valid)], logoPath, priority });
  }
  return [...groups.values()].sort((a,b) => a.priority-b.priority || a.name.localeCompare(b.name,'fr'))
    .map(p => ({ ...p, ids:p.ids.sort((a,b)=>a-b), id:p.ids.sort((a,b)=>a-b).join('|') }));
}

export function providerFilter(value) {
  const text = String(value || '').trim();
  if (!/^\d{1,8}(?:\|\d{1,8}){0,11}$/.test(text)) return '';
  return [...new Set(text.split('|').map(Number).filter(n => n > 0))].sort((a,b)=>a-b).join('|');
}

export function regionalOffers(payload, region) {
  const regional = Array.isArray(payload?.watchProviders)
    ? payload.watchProviders.find(p => String(p.iso_3166_1).toUpperCase() === region)
    : payload?.results?.[region];
  const offers = [];
  for (const kind of ['flatrate','free','ads']) {
    for (const p of regional?.[kind] || []) {
      const id = Number(p.provider_id ?? p.id);
      const name = providerIdentity(p.provider_name ?? p.name);
      if (id && name) offers.push({id,name,kind});
    }
  }
  return offers;
}

export async function verifyProviderItems(items, provider, lookup, region, concurrency = 6) {
  const ids = new Set(providerFilter(provider).split('|').map(Number));
  const unique = [...new Map(items.map(p=>[`${p.mediaType}:${p.id}`,p])).values()];
  const results = new Array(unique.length); let cursor = 0;
  await Promise.all(Array.from({length: Math.min(concurrency,unique.length)}, async () => {
    while (cursor < unique.length) {
      const index = cursor++, item = unique[index];
      // A failed lookup must remain an error, never an unverified recommendation.
      const offers = (await lookup(item.mediaType,item.id)).filter(p=>ids.has(p.id));
      if (offers.length) results[index] = {...item,legalPlatforms:[...new Set(offers.map(p=>p.name))],
        legalAvailability:{region,verifiedAt:new Date().toISOString(),offers},reason:`Sur ${offers[0].name} · ${region}`};
    }
  }));
  return results.filter(Boolean);
}
