import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { releaseMatchesMedia } from '../lib/release-match.mjs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

const baseRelease = {
  protocol: 'torrent',
  size: 2_000_000_000,
  seeders: 46,
  leechers: 0,
  categories: [{ id: 2040 }]
};

assert.equal(pkg.version, '200.0.21');
assert.equal(releaseMatchesMedia({
  ...baseRelease,
  title: 'The.Odyssey.2026.MULTi.VFF.1080p.WEB-DL'
}, 'movie', "L'Odyssée", '2026'), true);
assert.equal(releaseMatchesMedia({
  ...baseRelease,
  title: 'The.Odyssey.Making.Of.2026.DOC.MULTi.VFF.1080p.WEB'
}, 'movie', "L'Odyssée", '2026'), false);
assert.equal(releaseMatchesMedia({
  ...baseRelease,
  title: 'L.Odyssee.D.Ulysse.Le.Premier.Heros.2026.DOC.VFF.720p.WEB'
}, 'movie', "L'Odyssée", '2026'), false);
assert.equal(releaseMatchesMedia({
  ...baseRelease,
  title: 'L.Odyssee.2026.Bande.Annonce.1080p'
}, 'movie', "L'Odyssée", '2026'), false);

console.log('Noctra v196 - identité stricte des releases : OK');
