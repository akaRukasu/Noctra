export function compareReleaseSize(left, right) {
  const size = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : Number.MAX_VALUE;
  return size(left.size) - size(right.size)
    || String(left.title || '').localeCompare(String(right.title || ''), 'fr', { numeric: true })
    || String(left.guid || '').localeCompare(String(right.guid || ''));
}

export function sonarrPackKind(item) {
  const title = String(item.title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = title.replace(/[._]+/g, ' ');
  // Episode releases sometimes contain "complete" in the series title.
  if ((!item.fullSeason && item.episodeNumbers?.length) || /\bs\d{1,3}\s*e\d|\b\d{1,3}x\d{2}\b|\bepisode\s*\d/i.test(words)) return '';
  if (/\bs\d{1,3}\s*(?:-|to|a)\s*s?\d{1,3}\b|\b(?:seasons?|saisons?)\s*\d{1,3}\s*(?:-|to|a)\s*\d{1,3}\b|\b(?:all seasons|toutes (?:les )?saisons|complete series)\b/i.test(words)) return 'integral';
  const season = /\bs\d{1,3}\b|\b(?:season|saison)\s*\d{1,3}\b/i.test(words);
  if (season) return 'season';
  if (/\b(?:integrale?|complete|complet)\b/i.test(words)) return 'integral';
  return item.fullSeason ? 'season' : '';
}

export function collectSeriesPacks(releases) {
  const unique = new Map();
  for (const item of releases) {
    if (!item.packKind) continue;
    const key = `${item.indexerId}:${item.guid}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  const rows = [...unique.values()].sort(compareReleaseSize);
  const integralCount = rows.filter(item => item.packKind === 'integral').length;
  return { releases: rows, integralCount, seasonPackCount: rows.length - integralCount, packMode: integralCount ? 'integral' : 'season' };
}
