const TITLE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'de', 'des', 'du', 'et', 'l', 'la', 'le', 'les', 'of', 'the', 'un', 'une'
]);

function normalizedReleaseText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function meaningfulTitleTokens(value) {
  return normalizedReleaseText(value)
    .split(' ')
    .filter(token => token.length > 1 && !TITLE_STOP_WORDS.has(token));
}

function releaseYear(value) {
  const match = String(value || '').match(/\b(?:19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function categoryIds(categories) {
  return (Array.isArray(categories) ? categories : [])
    .map(category => Number(typeof category === 'object' ? category?.id : category))
    .filter(Number.isFinite);
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function titleTokenMatches(expected, actual) {
  if (expected === actual) return true;
  const tolerance = expected.length >= 7 ? 2 : (expected.length >= 5 ? 1 : 0);
  return tolerance > 0 && Math.abs(expected.length - actual.length) <= tolerance && editDistance(expected, actual) <= tolerance;
}

export function releaseMatchesMedia(release, mediaType, title, year = '') {
  const releaseTitle = String(release?.title || '');
  const expectedTokens = meaningfulTitleTokens(title);
  const actualTokens = meaningfulTitleTokens(releaseTitle);
  if (!expectedTokens.length || !expectedTokens.every(expected => actualTokens.some(actual => titleTokenMatches(expected, actual)))) return false;

  // Les titres d'un seul mot produisent facilement de faux positifs quand ce
  // mot apparaît à la fin du titre d'un autre film. Il doit faire partie des
  // deux premiers mots significatifs, avant l'année de la release.
  if (expectedTokens.length === 1) {
    const releaseIdentity = normalizedReleaseText(releaseTitle)
      .split(' ')
      .slice(0, Math.max(0, normalizedReleaseText(releaseTitle).split(' ').findIndex(token => /^(?:19|20)\d{2}$/.test(token))))
      .filter(token => token.length > 1 && !TITLE_STOP_WORDS.has(token));
    const identityIndex = releaseIdentity.findIndex(actual => titleTokenMatches(expectedTokens[0], actual));
    if (identityIndex > 1) return false;
  }

  const normalizedReleaseTitle = normalizedReleaseText(releaseTitle);
  if (/\b(?:bande annonce|behind the scenes|bonus|extras?|featurette|interview|making of|sample|soundtrack|trailer)\b/i.test(normalizedReleaseTitle)) return false;

  // A documentary reusing a feature film's title is not an available release of that film.
  if (mediaType !== 'tv'
    && !/\b(?:doc|documentaire|documentary)\b/i.test(normalizedReleaseText(title))
    && /\b(?:doc|documentaire|documentary)\b/i.test(normalizedReleaseTitle)) return false;

  const protocol = String(release?.protocol || '').trim().toLowerCase();
  if (protocol && protocol !== 'torrent') return false;

  const ids = categoryIds(release?.categories);
  const categoryMatches = mediaType === 'tv'
    ? ids.some(id => id >= 5000 && id < 6000)
    : ids.some(id => id >= 2000 && id < 3000);
  if (ids.length && !categoryMatches) return false;

  const expectedYear = /^\d{4}$/.test(String(year || '')) ? Number(year) : null;
  if (mediaType !== 'tv' && expectedYear && releaseYear(releaseTitle) !== expectedYear) return false;

  const size = Number(release?.size || 0);
  const minimumSize = mediaType === 'tv' ? 20 * 1024 * 1024 : 120 * 1024 * 1024;
  if (size > 0 && size < minimumSize) return false;

  const seeders = release?.seeders == null ? null : Number(release.seeders);
  const leechers = release?.leechers == null ? null : Number(release.leechers);
  if (seeders === 0 && (leechers === 0 || leechers == null)) return false;
  return true;
}
