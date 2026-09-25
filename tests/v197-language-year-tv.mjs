import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyReleaseLanguage, summarizeReleaseLanguages } from '../lib/release-language.mjs';
import { releaseMatchesMedia } from '../lib/release-match.mjs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const server = await readFile(new URL('server.mjs', root), 'utf8');
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.deepEqual(classifyReleaseLanguage('Mutiny.2026.MULTI.VFF.2160p'), { key: 'multi_vff', label: 'MULTI VFF', preferred: true });
assert.deepEqual(classifyReleaseLanguage('Mutiny.2026.TRUEFRENCH.1080p'), { key: 'vff', label: 'VFF', preferred: true });
assert.deepEqual(classifyReleaseLanguage('Mutiny.2026.VOSTFR.ExternalSubs.1080p'), { key: 'vostfr', label: 'VOSTFR', preferred: false });
assert.deepEqual(classifyReleaseLanguage('Mutiny.2026.VO.1080p'), { key: 'vo', label: 'VO', preferred: false });

const mutiny = summarizeReleaseLanguages([
  { title: 'Mutiny.2026.VO.1080p.WEB-DL' },
  { title: 'Mutiny.2026.VOSTFR.ExternalSubs.1080p.WEB-DL' }
]);
assert.equal(mutiny.preferredCount, 0);
assert.equal(mutiny.alternateCount, 2);
assert.deepEqual(mutiny.alternateLanguages, ['VOSTFR', 'VO']);
assert.equal(releaseMatchesMedia({
  title: 'The.Bits.A.French.Football.Mutiny.2026.POLISH.1080p.WEB.H264',
  protocol: 'torrent', size: 3_500_000_000, seeders: 5, categories: [{ id: 2040 }]
}, 'movie', 'Mutiny', '2026'), false);

assert.ok(server.includes("status: languageSummary.preferredCount > 0 ? 'available' : (normalized.length ? 'alternate' : 'missing')"));
assert.ok(server.includes("label: 'Ajouter quand même'"));
assert.ok(server.includes("['smart', 'year', 'cinema'"));
assert.ok(server.includes("['movie', 'annual-cinema', cinema]"));
assert.ok(server.includes("['tv', 'annual-tv-streaming', streamingTv]"));
assert.ok(shell.includes('function annualDiscoveryMarkup'));
assert.ok(shell.includes("['year', 'Top de l’année']"));
assert.ok(shell.includes("const channelFamilyStream = /^(?:LiveWatch|NorthTV|FrameTV|OHA|FSTV|WiTV|StreamSports99)$/i"));
assert.ok(shell.includes('hlsOptions.maxBufferSize = Math.max(hlsOptions.maxBufferSize, 192 * 1000 * 1000)'));
assert.ok(shell.includes('? 12\n            : ((tvConnectionProfile().weak || bufferedResolvedStream) ? 3 : 1)'));
assert.ok(shell.includes('Date.now() - lastBufferedFragmentAt < 60_000'));
assert.ok(server.includes("label: 'Public · 2 pubs (secours manuel)'"));

console.log('Noctra v197 - langues, tendances annuelles et stabilité TV : OK');
