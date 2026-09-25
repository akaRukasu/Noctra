import { basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

function normalizedMediaText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mediaTokens(value) {
  return new Set(normalizedMediaText(value)
    .split(/\s+/)
    .filter(token => token.length > 1 && !/^(?:1080p?|2160p?|720p?|4k|uhd|fhd|hd|webrip|webdl|bluray|x26[45]|hevc|aac|dts|truehd|multi|french|vostfr|proper|repack|mkv|mp4|m4v|avi|mov|webm|mpg|mpeg|m2ts|media|films?|movies?|series?|season|saison)$/.test(token)));
}

function candidateScore(file, candidate) {
  const fileName = basename(String(file.name || ''));
  const candidateName = basename(String(candidate.path || ''));
  const fileStem = normalizedMediaText(fileName.slice(0, fileName.length - extname(fileName).length));
  const candidateStem = normalizedMediaText(candidateName.slice(0, candidateName.length - extname(candidateName).length));
  const fileExtension = extname(fileName).toLowerCase();
  const candidateExtension = extname(candidateName).toLowerCase();
  const fileWords = mediaTokens(fileName);
  const candidateWords = mediaTokens(candidate.path);
  let overlap = 0;
  for (const token of fileWords) if (candidateWords.has(token)) overlap += 1;
  return {
    value: (fileStem && fileStem === candidateStem ? 1000 : 0)
      + (fileExtension && fileExtension === candidateExtension ? 40 : 0)
      + (overlap * 25),
    overlap
  };
}

function sourceScore(file, candidate) {
  return [candidate.path, ...(candidate.aliases || [])]
    .map(path => candidateScore(file, { path }))
    .sort((a, b) => b.value - a.value)[0];
}

function selectSource(file, preferred, fallback, claimed) {
  const size = Number(file.size || 0);
  const available = list => list.filter(candidate => (
    Number(candidate.size || 0) === size
    && candidate.path
    && !claimed.has(candidate.physicalKey || candidate.path)
  ));
  const historyMatches = available(preferred);
  const pool = historyMatches.length ? historyMatches : available(fallback);
  if (!pool.length) return null;
  const ranked = pool
    .map(candidate => ({ candidate, ...sourceScore(file, candidate) }))
    .sort((left, right) => right.value - left.value || String(left.candidate.path).localeCompare(String(right.candidate.path)));
  if (historyMatches.length) return ranked[0].candidate;
  if (pool.length === 1) return ranked[0].overlap >= 1 || ranked[0].value >= 1000 ? ranked[0].candidate : null;
  if (ranked[0].overlap < 1 || ranked[0].value === ranked[1].value) return null;
  return ranked[0].candidate;
}

export function matchTorrentMediaFiles(files, historyCandidates = [], libraryBySize = new Map()) {
  const entries = Array.isArray(files) ? files : [];
  const selected = entries
    .filter(file => Number(file?.size || 0) > 0 && Number(file?.priority ?? 1) !== 0);
  const media = selected.filter(file => /\.(?:mkv|mp4|m4v|avi|mov|webm|mpg|mpeg|ts|m2ts)$/i.test(String(file?.name || '')));
  const ancillary = media.length ? entries.filter(file => Number(file.size) > 0 && !/\.(?:mkv|mp4|m4v|avi|mov|webm|mpg|mpeg|ts|m2ts)$/i.test(file.name)) : [];
  const ignored = [];
  const wanted = (media.length ? media : selected)
    .sort((left, right) => Number(right.size || 0) - Number(left.size || 0));
  const claimed = new Set();
  const matches = [];
  const unmatched = [];

  for (const file of wanted) {
    const source = selectSource(
      file,
      historyCandidates,
      libraryBySize.get(Number(file.size || 0)) || [],
      claimed
    );
    if (!source) {
      unmatched.push(file);
      continue;
    }
    claimed.add(source.physicalKey || source.path);
    matches.push({ file, source });
  }

  // Les annexes existantes peuvent contenir le debut/la fin d'une piece partagee
  // avec la video. Les rattacher evite de perdre ces pieces sans rien telecharger.
  for (const file of ancillary) {
    const source = selectSource(file, historyCandidates, libraryBySize.get(Number(file.size)) || [], claimed);
    if (source) {
      claimed.add(source.physicalKey || source.path);
      matches.push({ file, source, ancillary: true });
    } else if (Number(file.priority ?? 1) !== 0) ignored.push(file);
  }

  return { wanted, matches, unmatched, ignored };
}

export function interiorPieceSamples(file, files, pieceSize, pieceHashes) {
  if (!Number.isSafeInteger(pieceSize) || pieceSize <= 0 || pieceSize > 32 * 1024 * 1024 || !Array.isArray(pieceHashes)) return [];
  const ordered = [...files].sort((a, b) => a.index - b.index);
  let offset = 0;
  for (const entry of ordered) {
    if (entry.index === file.index) break;
    offset += Number(entry.size || 0);
  }
  if (!Number.isSafeInteger(offset) || (file.pieceRange && Number(file.pieceRange[0]) !== Math.floor(offset / pieceSize))) return [];
  const first = Math.ceil(offset / pieceSize);
  const last = Math.floor((offset + Number(file.size)) / pieceSize) - 1;
  if (last < first) return [];
  const indexes = [...new Set([first, Math.floor((first + last) / 2), last])];
  if (indexes.length < 2) return [];
  return indexes.map(index => ({ offset: index * pieceSize - offset, size: pieceSize, hash: pieceHashes[index] }))
    .filter(sample => /^[a-f0-9]{40}$/i.test(sample.hash || ''));
}

async function sourceMatchesPieces(path, samples, expectedSize) {
  const file = await open(path, 'r').catch(() => null);
  if (!file) return false;
  try {
    if ((await file.stat()).size !== expectedSize) return false;
    for (const sample of samples) {
      const buffer = Buffer.alloc(sample.size);
      let read = 0;
      while (read < buffer.length) {
        const result = await file.read(buffer, read, buffer.length - read, sample.offset + read);
        if (!result.bytesRead) return false;
        read += result.bytesRead;
      }
      if (createHash('sha1').update(buffer).digest('hex') !== sample.hash.toLowerCase()) return false;
    }
    return true;
  } finally { await file.close(); }
}

export async function recoverRelinkByPieces(matching, files, libraryBySize, proof) {
  if (proof?.validateMatched) {
    const kept = [];
    for (const match of matching.matches) {
      const samples = interiorPieceSamples(match.file, files, proof.pieceSize, proof.hashes);
      if (!match.ancillary && samples.length >= 2 && !await sourceMatchesPieces(match.source.path, samples, Number(match.file.size))) {
        matching.unmatched.push(match.file);
      } else kept.push(match);
    }
    matching.matches = kept;
  }
  const claimed = new Set(matching.matches.map(match => match.source.physicalKey || match.source.path));
  const recovered = [];
  for (const file of [...matching.unmatched]) {
    const samples = interiorPieceSamples(file, files, proof?.pieceSize, proof?.hashes);
    if (samples.length < 2) continue;
    const candidates = [...new Map((libraryBySize.get(Number(file.size)) || [])
      .filter(candidate => !claimed.has(candidate.physicalKey || candidate.path))
      .map(candidate => [candidate.physicalKey || candidate.path, candidate])).values()]
      .sort((a, b) => sourceScore(file, b).value - sourceScore(file, a).value).slice(0, 64);
    let valid = null;
    for (const candidate of candidates) {
      if (await sourceMatchesPieces(candidate.path, samples, Number(file.size))) { valid = candidate; break; }
    }
    // Identical existing copies are interchangeable; full qBit verification remains mandatory.
    if (!valid) continue;
    claimed.add(valid.physicalKey || valid.path);
    recovered.push({ file, source: valid, proof: 'piece-sample' });
  }
  matching.matches.push(...recovered);
  const recoveredFiles = new Set(recovered.map(match => match.file));
  matching.unmatched = matching.unmatched.filter(file => !recoveredFiles.has(file));
  return recovered.length;
}

export function describeUnmatchedFiles(matching, libraryBySize) {
  const missing = matching.unmatched.filter(file => !libraryBySize.has(Number(file.size)));
  const different = matching.unmatched.length - missing.length;
  return [missing.length ? `${missing.length} fichier(s) absent(s) ou de taille différente` : '',
    different ? `${different} fichier(s) sans empreinte correspondante` : ''].filter(Boolean).join(' ; ')
    + '. Torrent conservé arrêté, sans téléchargement.';
}
