import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { releaseMatchesMedia } from '../lib/release-match.mjs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const server = await readFile(new URL('server.mjs', root), 'utf8');
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.equal(releaseMatchesMedia({
  title: 'The.Odyssey.2026.MULTi.1080p.WEB-DL',
  protocol: 'torrent', size: 4_000_000_000, seeders: 18,
  categories: [{ id: 2040 }]
}, 'movie', "L'Odyssée", '2026'), true);
assert.equal(releaseMatchesMedia({
  title: 'The.Odyssey.1997.1080p.BluRay',
  protocol: 'torrent', size: 3_000_000_000, seeders: 289,
  categories: [{ id: 2040 }]
}, 'movie', "L'Odyssée", '2026'), false);
assert.equal(releaseMatchesMedia({
  title: 'The.Odyssey.2026.Trailer.1080p',
  protocol: 'torrent', size: 200_000_000, seeders: 12,
  categories: [{ id: 2040 }]
}, 'movie', "L'Odyssée", '2026'), false);
assert.equal(releaseMatchesMedia({
  title: 'The.Odyssey.2026.1080p.WEB-DL',
  protocol: 'usenet', size: 4_000_000_000, seeders: null,
  categories: [{ id: 2040 }]
}, 'movie', "L'Odyssée", '2026'), false);

assert.ok(server.includes('await searchTrackerReleases({'));
assert.ok(server.includes("label: 'Bientôt disponible'"));
assert.ok(server.includes('options.unshift({ ...noctraFallback, fallback: false, preferred: true })'));
assert.ok(shell.includes('/^(?:LiveWatch|NorthTV|FrameTV|OHA|FSTV|WiTV|StreamSports99)$/i'));
assert.ok(shell.includes("const stabilitySensitiveStream = /^(?:NorthTV|StreamSports99)$/i"));
assert.ok(shell.includes('const restartLimit = stabilitySensitiveStream'));
assert.ok(shell.includes("requestButton.textContent = 'Bientôt disponible'"));

console.log('Noctra v195 - stabilité TV, priorité FSTV et disponibilité torrent : OK');
