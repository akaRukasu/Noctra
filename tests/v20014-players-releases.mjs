import assert from 'node:assert/strict';
import { compareReleaseSize, sonarrPackKind, collectSeriesPacks } from '../lib/release-search.mjs';
import { readFile } from 'node:fs/promises';

for (const title of ['Example.S01.MULTI.VFF', 'Example_S02_1080p', 'Example.Saison.3.Complete', 'Example Season 4']) assert.equal(sonarrPackKind({ title }), 'season', title);
for (const title of ['Example.S01-S03.MULTI', 'Example.Integrale', 'Example.Complete.Series', 'Example.Saisons.1.a.3']) assert.equal(sonarrPackKind({ title }), 'integral', title);
assert.equal(sonarrPackKind({ title: 'Example.Complete.S01E01' }), '');
assert.equal(sonarrPackKind({ title: 'Example.S01', episodeNumbers: [1] }), '');
assert.equal(sonarrPackKind({ title: 'Example.S01', fullSeason: true, episodeNumbers: [1, 2] }), 'season');
assert.equal(sonarrPackKind({ title: 'Example.Integrale', fullSeason: true }), 'integral');
const releases = [{ guid: 'large', indexerId: 1, size: 9e9, title: 'S1', packKind: 'season' }, { guid: 'small', indexerId: 1, size: 1e9, title: 'S2', packKind: 'season' }];
const fallback = collectSeriesPacks([...releases, releases[0], { guid: 'episode' }]);
assert.equal(fallback.packMode, 'season');
assert.equal(fallback.integralCount, 0);
assert.equal(fallback.seasonPackCount, 2);
assert.deepEqual(fallback.releases.map(r => r.guid), ['small', 'large']);
const integral = collectSeriesPacks([...releases, { guid: 'all', indexerId: 1, size: 1e10, title: 'All', packKind: 'integral' }]);
assert.equal(integral.packMode, 'integral');
assert.equal(integral.seasonPackCount, 2, 'Season alternatives remain available even with an integral');
const sorted = [{ size: 0 }, { size: 10, seeders: 99 }, { size: 2, seeders: 0 }, { size: -1 }, { size: Infinity }].sort(compareReleaseSize);
assert.deepEqual(sorted.slice(0, 2).map(r => r.size), [2, 10]);

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
assert.match(shell, /sortTorrentsBySize\(Array\.isArray\(data\?\.releases\)/);
assert.match(shell, /sortTorrentsBySize\(data\.releases \|\| \[\]\)/);
assert.match(shell, /data-release-more/);
assert.match(css, /\.noctra-library-showcase \{ grid-template-columns: minmax\(0, 1fr\) !important/);
console.log('v200.14: pack fallback, ascending size and mobile library: OK');
