function normalizedLanguageText(value) {
  return ` ${String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')} `;
}

const hasToken = (text, token) => text.includes(` ${token} `);

export function classifyReleaseLanguage(title) {
  const text = normalizedLanguageText(title);
  const multi = hasToken(text, 'MULTI') || hasToken(text, 'MULTi'.toUpperCase());
  const vff = hasToken(text, 'VFF') || hasToken(text, 'TRUEFRENCH') || (hasToken(text, 'TRUE') && hasToken(text, 'FRENCH'));
  const vfq = hasToken(text, 'VFQ') || hasToken(text, 'FRENCHCANADIAN') || (hasToken(text, 'FRENCH') && hasToken(text, 'CANADIAN'));
  const vostfr = hasToken(text, 'VOSTFR') || hasToken(text, 'SUBFRENCH') || (hasToken(text, 'FRENCH') && hasToken(text, 'SUBS'));

  if (multi && vff) return { key: 'multi_vff', label: 'MULTI VFF', preferred: true };
  if (vff) return { key: 'vff', label: 'VFF', preferred: true };
  if (multi && vfq) return { key: 'multi_vfq', label: 'MULTI VFQ', preferred: false };
  if (vfq) return { key: 'vfq', label: 'VFQ', preferred: false };
  if (vostfr) return { key: 'vostfr', label: 'VOSTFR', preferred: false };
  if (hasToken(text, 'VO') || hasToken(text, 'ENGLISH') || hasToken(text, 'ENG')) {
    return { key: 'vo', label: 'VO', preferred: false };
  }
  if (hasToken(text, 'FRENCH')) return { key: 'french_unspecified', label: 'VF non précisée', preferred: false };
  if (multi) return { key: 'multi_unspecified', label: 'MULTI non précisé', preferred: false };
  if (/\b(?:POLISH|GERMAN|SPANISH|ITALIAN|PORTUGUESE|RUSSIAN|ARABIC|JAPANESE|KOREAN)\b/.test(text)) {
    return { key: 'other', label: 'Autre langue', preferred: false };
  }
  return { key: 'unknown', label: 'Langue non précisée', preferred: false };
}

const alternateLanguageOrder = new Map([
  ['vostfr', 0], ['vo', 1], ['multi_vfq', 2], ['vfq', 3],
  ['french_unspecified', 4], ['multi_unspecified', 5], ['other', 6], ['unknown', 7]
]);

export function summarizeReleaseLanguages(releases = []) {
  const rows = (Array.isArray(releases) ? releases : []).map(release => {
    const language = classifyReleaseLanguage(release?.title || '');
    return { ...release, language: language.label, languageKey: language.key, preferredLanguage: language.preferred };
  });
  const preferredCount = rows.filter(release => release.preferredLanguage).length;
  const alternateLanguages = [...new Map(rows
    .filter(release => !release.preferredLanguage)
    .map(release => [release.languageKey, release.language])).entries()]
    .sort(([left], [right]) => (alternateLanguageOrder.get(left) ?? 99) - (alternateLanguageOrder.get(right) ?? 99))
    .map(([, label]) => label);
  return {
    releases: rows,
    preferredCount,
    alternateCount: rows.length - preferredCount,
    alternateLanguages
  };
}
