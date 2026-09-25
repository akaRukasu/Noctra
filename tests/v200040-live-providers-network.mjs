import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.40');
assert.ok(server.includes("version: '200.0.40'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.40'"));
assert.ok(sw.includes("CACHE_NAME = 'noctra-shell-v200-r40'"));

const crossFamilyStart = server.indexOf('async function liveWatchCrossFamilyVariants');
const crossFamilyEnd = server.indexOf('// Compatibilité des anciens tests', crossFamilyStart);
assert.ok(crossFamilyStart > 0 && crossFamilyEnd > crossFamilyStart);
const crossFamilyVariants = new Function(
  'liveWatchChannelVariants',
  'liveWatchFamilyLabel',
  `${server.slice(crossFamilyStart, crossFamilyEnd)}; return liveWatchCrossFamilyVariants;`
)(
  async (kind, id) => {
    if (kind === 'frame') return [
      { kind, id: id || 'frame-current', label: 'BASIC' },
      { kind, id: 'frame-secondary', label: 'CABLE' }
    ];
    if (kind === 'main') return [{ kind, id: 'main-healthy', label: 'BASIC' }];
    if (kind === 'north') return [{ kind, id: 'north-healthy', label: 'BASIC' }];
    return [];
  },
  kind => ({ main: 'LiveWatch', north: 'NorthTV', frame: 'FrameTV' })[kind] || 'LiveWatch'
);
const orderedVariants = await crossFamilyVariants('frame', 'frame-dead', '20 MINUTES TV', 'France', 'https://livewatch.top/api/v1/public/frame/channels');
assert.deepEqual(
  orderedVariants.slice(0, 4).map(item => `${item.kind}:${item.id}`),
  ['frame:frame-dead', 'main:main-healthy', 'north:north-healthy', 'frame:frame-secondary'],
  'Une occurrence de chaque famille sœur doit être essayée avant les variantes secondaires mortes.'
);
assert.equal(orderedVariants[0].crossFamily, false);
assert.equal(orderedVariants[1].familyLabel, 'LiveWatch');
assert.equal(orderedVariants[2].familyLabel, 'NorthTV');
assert.ok(server.includes('validateLiveWatchStreamReference(token, 7_000)'), 'Chaque secours LiveWatch doit atteindre un segment média avant affichage.');
const liveWatchResolverStart = server.indexOf('async function resolveLiveWatchVipPlayback');
const liveWatchResolverEnd = server.indexOf('async function liveWatchVipDiagnosticCheck', liveWatchResolverStart);
const liveWatchResolver = server.slice(liveWatchResolverStart, liveWatchResolverEnd);
assert.ok(liveWatchResolver.indexOf('const selectedDirect = await probeVariant') < liveWatchResolver.indexOf('const crossFamily = await liveWatchCrossFamilyVariants'));
assert.ok(liveWatchResolver.includes('.slice(0, 3)') && liveWatchResolver.includes('Promise.all(fallbackCandidates.map(probeVariant))'));

class TestHttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const channelHelperStart = server.indexOf('function streamSports99LiveTvReference');
const channelHelperEnd = server.indexOf('function streamSports99DecodeBase64Url', channelHelperStart);
const channelHelpers = new Function(
  'HttpError',
  `${server.slice(channelHelperStart, channelHelperEnd)}; return { streamSports99LiveTvReference, streamSports99ChannelPlayerUrl };`
)(TestHttpError);
assert.deepEqual(channelHelpers.streamSports99LiveTvReference('ABC__us'), { name: 'ABC', code: 'us' });
assert.deepEqual(channelHelpers.streamSports99LiveTvReference('BBC_World__gb'), { name: 'BBC World', code: 'gb' });
assert.equal(channelHelpers.streamSports99LiveTvReference('bad-slug'), null);
const directPlayer = new URL(channelHelpers.streamSports99ChannelPlayerUrl('ABC', 'us'));
assert.equal(directPlayer.hostname, 'cdnlivetv.is');
assert.equal(directPlayer.pathname, '/api/v1/channels/player/');
assert.equal(directPlayer.searchParams.get('name'), 'ABC');
assert.equal(directPlayer.searchParams.get('code'), 'us');
assert.equal(directPlayer.searchParams.get('user'), 'cdnlivetv');
assert.equal(directPlayer.searchParams.get('plan'), 'free');

const hlsHelperStart = server.indexOf('function streamSports99DecodeBase64Url');
const hlsHelperEnd = server.indexOf('async function streamSports99ResolvedHls', hlsHelperStart);
const extractHls = new Function(
  'Buffer',
  `${server.slice(hlsHelperStart, hlsHelperEnd)}; return streamSports99ExtractHlsUrl;`
)(Buffer);
const expectedHls = 'https://media.example/live/playlist.m3u8?token=test';
const splitAt = 28;
const hlsFixture = `
  <script>
    var firstPart='${Buffer.from(expectedHls.slice(0, splitAt)).toString('base64')}';
    var secondPart='${Buffer.from(expectedHls.slice(splitAt)).toString('base64')}';
    var decodedSource=Decode(firstPart)+Decode(secondPart);
    const player={source:{src:decodedSource,format:'hls'}};
  </script>`;
assert.equal(extractHls(hlsFixture), expectedHls, 'Le décodeur doit reconstruire le HLS réellement publié par le player CDN.');

const parserStart = server.indexOf('function parseStreamSports99Sports');
const parserEnd = server.indexOf('async function enrichStreamSports99GenericNames', parserStart);
const parseStreamSports99Sports = new Function(
  'resolveTvUrl', 'decodeTvHtml', 'streamSports99NameFromSlug', 'publicTvPageName',
  'streamSports99ContextName', 'normalizeTvChannel', 'streamSports99LiveTvReference',
  'encodeTvStateReference', 'publicPath',
  `${server.slice(parserStart, parserEnd)}; return parseStreamSports99Sports;`
)(
  (value, base) => new URL(value, base).toString(),
  value => String(value || ''),
  value => String(value || '').replace(/[-_]+/g, ' '),
  () => '',
  () => '',
  raw => ({ id: 'fixture', name: raw.name, embedUrl: raw.embed_url, playbackType: 'embed' }),
  channelHelpers.streamSports99LiveTvReference,
  (kind, state) => `s.${kind}.${state.name}.${state.code}`,
  value => value
);
const parsedChannels = parseStreamSports99Sports(
  '<a href="/live-tv/ABC__us"><span>ABC</span></a>',
  'https://streamsports99.su/live-tv',
  'Live TV'
);
assert.equal(parsedChannels.length, 1);
assert.equal(parsedChannels[0].name, 'ABC');
assert.equal(parsedChannels[0].playbackType, 'resolver');
assert.equal(parsedChannels[0].embedUrl, '');
assert.match(parsedChannels[0].resolverUrl, /\/api\/tv\/streamsports99\/channel\/s\.streamsports99-channel\.ABC\.us$/);
assert.equal(parsedChannels[0].externalUrl, 'https://streamsports99.su/live-tv/ABC__us');
assert.ok(server.includes("event.event || event.title") && server.includes('event.eventIMG'), 'Le catalogue d’événements doit accepter le format courant de l’API.');
assert.ok(server.includes('resolveStreamSports99ChannelReference(token)'));

const profileStart = shell.indexOf('function tvConnectionProfile()');
const profileEnd = shell.indexOf('\n  function officialLiveWatchEmbedUrl', profileStart);
assert.ok(profileStart > 0 && profileEnd > profileStart);
const makeProfile = connection => new Function(
  'navigator', 'window', 'tvAppleTouchDevice',
  `${shell.slice(profileStart, profileEnd)}; return tvConnectionProfile;`
)(
  { connection },
  { matchMedia: () => ({ matches: true }) },
  () => false
)();
const normalProfile = makeProfile({ effectiveType: '4g', type: 'wifi', downlink: 10, rtt: 40, saveData: false });
assert.equal(normalProfile.weak, false);
assert.deepEqual(
  [normalProfile.resolverTimeout, normalProfile.manifestTimeout, normalProfile.fragmentTimeout],
  [28_000, 24_000, 30_000],
  'Le profil normal doit rester strictement inchangé.'
);
const desktop3gProfile = makeProfile({ effectiveType: '3g', type: 'cellular', downlink: 1.8, rtt: 500, saveData: false });
assert.equal(desktop3gProfile.weak, true, 'Un ordinateur en partage 3G doit utiliser le profil prudent.');
assert.equal(desktop3gProfile.resolverTimeout, 42_000);
const saveDataProfile = makeProfile({ effectiveType: '4g', type: 'wifi', downlink: 10, rtt: 40, saveData: true });
assert.equal(saveDataProfile.veryWeak, true);
assert.equal(saveDataProfile.fragmentTimeout, 65_000);
assert.ok(shell.includes('networkProfile.veryWeak ? 450_000'));
assert.ok(shell.includes("networkProfile.veryWeak ? .5 : (networkProfile.weak ? .6 : .72)"));
assert.ok(shell.includes("Math.max(65_000, Number(resolverProfile.resolverTimeout || 0))"));

console.log('Noctra v200.0.40 · LiveWatch / StreamSports99 / réseau faible : OK');
