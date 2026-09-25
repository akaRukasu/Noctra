import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.41');
assert.ok(server.includes("version: '200.0.41'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.41'"));
assert.ok(sw.includes("CACHE_NAME = 'noctra-shell-v200-r41'"));

const cleanStart = server.indexOf('function cleanLiveWatchChannelName');
const cleanEnd = server.indexOf('\nfunction liveWatchSourceLabel', cleanStart);
const cleanName = new Function(`${server.slice(cleanStart, cleanEnd)}; return cleanLiveWatchChannelName;`)();
assert.equal(cleanName('BEIN SPORTS 1 (BACKUP) FHD'), 'BEIN SPORTS 1');
assert.equal(cleanName('BEIN SPORTS 1 [LIVE DURING EVENTS ONLY] · SAT'), 'BEIN SPORTS 1');
assert.ok(server.includes('if (!candidates.length && id) candidates.push'), 'Un identifiant LiveWatch absent du catalogue ne doit plus être prioritaire.');
assert.ok(server.includes('validateLiveWatchStreamReference(token, 18_000)'));
assert.ok(server.includes('collapseLiveWatchLogicalChannels(catalog.channels || [])'));

const hlsStart = server.indexOf('function streamSports99DecodeBase64Url');
const hlsEnd = server.indexOf('async function streamSports99ResolvedHls', hlsStart);
const extractHls = new Function('Buffer', `${server.slice(hlsStart, hlsEnd)}; return streamSports99ExtractHlsUrl;`)(Buffer);
const expected = 'https://media.example/live/playlist.m3u8?token=ok';
assert.equal(extractHls(`<script>const cfg={src:"${expected}"}</script>`), expected);
const split = 22;
const encodedFixture = `<script>
  let a="${Buffer.from(expected.slice(0, split)).toString('base64')}";
  const b='${Buffer.from(expected.slice(split)).toString('base64')}';
  const stream=Decode(a)+Decode(b);
  const player={source:{src:stream}};
</script>`;
assert.equal(extractHls(encodedFixture), expected);

const tvStart = server.indexOf('function streamSports99CountryName');
const tvEnd = server.indexOf('\nasync function streamSports99LiveTvApiCatalog', tvStart);
const buildTvChannels = new Function(
  'Intl', 'createHash', 'streamSports99AllowedPlayerHost', 'safeTvRemoteUrl',
  'streamSports99ChannelPlayerUrl', 'encodeTvStateReference', 'publicPath',
  `${server.slice(tvStart, tvEnd)}; return streamSports99CdnTvChannels;`
)(
  Intl,
  createHash,
  value => new URL(value).hostname === 'cdnlivetv.tv',
  value => new URL(value),
  (name, code) => `https://cdnlivetv.tv/api/v1/channels/player/?name=${encodeURIComponent(name)}&code=${code}`,
  (_kind, payload) => `state-${payload.name}-${payload.code}`,
  value => value
);
const tvChannels = buildTvChannels({ channels: [
  { name: 'ABC', code: 'us', url: 'https://cdnlivetv.tv/api/v1/channels/player/?name=ABC&code=us', status: 'online' },
  { name: 'Offline', code: 'us', url: 'https://cdnlivetv.tv/api/v1/channels/player/?name=Offline&code=us', status: 'offline' }
] });
assert.equal(tvChannels.length, 1);
assert.equal(tvChannels[0].category, 'Live TV');
assert.match(tvChannels[0].group, /^Live TV · /);
assert.match(tvChannels[0].resolverUrl, /streamsports99\/channel/);
assert.ok(server.includes('https://api.cdnlivetv.tv/api/v1/channels/?user=cdnlivetv&plan=free'));
assert.ok(server.includes('await resolveStreamSports99ChannelReference(token)'));
assert.ok(server.includes('streamSports99VerifiedOption(playerUrl, \'Direct TV vérifié\''));

assert.ok(server.includes('resolveSingleOhaCandidate(reference, candidate, index, 22_000)'));
assert.ok(server.includes("const externalUrl = new URL('/live', safeTvRemoteUrl(officialRoot)).toString()"));
assert.ok(server.includes('Le lecteur WiTV ${label} ne fournit actuellement aucun segment vidéo valide.'));
assert.ok(server.includes("label: 'WiTV officiel · secours manuel'"));

assert.ok(shell.includes("/^(?:LiveWatch|NorthTV|FrameTV|OHA|WiTV|StreamSports99)$/i.test(playbackProvider)"));
assert.ok(shell.includes('Math.max(90_000, Number(resolverProfile.resolverTimeout || 0))'));
assert.ok(shell.includes("/^(?:OHA|WiTV|StreamSports99)$/i.test(provider)"));

console.log('Noctra v200.0.41 · catalogues TV et stabilité : OK');
