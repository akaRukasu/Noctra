import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

const decorateStart = server.indexOf('async function decorateLiveWatchVipPlayback');
const decorateEnd = server.indexOf('\n\nfunction validLiveWatchChannelReference', decorateStart);
assert.ok(decorateStart >= 0 && decorateEnd > decorateStart);
const decorateSource = server.slice(decorateStart, decorateEnd);
const embedReference = channel => {
  const url = new URL(channel.externalUrl || channel.embedUrl);
  const match = url.pathname.match(/^\/embed\/(?:(daddy|north|frame)\/)?([^/]+)\/?$/i);
  return match ? { kind: String(match[1] || 'main').toLowerCase(), id: match[2] } : null;
};
const makeDecorator = active => new Function(
  'liveWatchQuickVipStatus',
  'liveWatchEmbedReference',
  'publicPath',
  `${decorateSource}; return decorateLiveWatchVipPlayback;`
)(async () => ({ configured: true, active, isVip: active }), embedReference, value => `/noctra${value}`);

const northChannel = { name: 'FRANCE 2 HD', embedUrl: 'https://livewatch.top/embed/north/france-2-hd-b' };
const northVip = await makeDecorator(true)({ name: 'NorthTV', channels: [northChannel] }, { id: 'livewatch-north', name: 'NorthTV', family: 'north' });
assert.equal(northVip.channels[0].playbackType, 'resolver');
assert.equal(northVip.channels[0].embedUrl, '');
assert.equal(northVip.channels[0].resolverUrl, '/noctra/api/tv/livewatch/resolve/north/france-2-hd-b');
assert.equal(northVip.channels[0].vipFallbackUrl, northChannel.embedUrl);
assert.equal(northVip.channels[0].liveWatchSameOriginBridge, true);

const northPublic = await makeDecorator(false)({ name: 'NorthTV', channels: [northChannel] }, { id: 'livewatch-north', name: 'NorthTV', family: 'north' });
assert.equal(northPublic.channels[0].embedUrl, northChannel.embedUrl);
assert.equal(northPublic.channels[0].vipPlayback, false);
const daddyVip = await makeDecorator(true)({ name: 'Daddy TV', channels: [{ name: 'Test', embedUrl: 'https://livewatch.top/embed/daddy/test' }] }, { id: 'livewatch-daddy', name: 'Daddy TV', family: 'daddy' });
assert.equal(daddyVip.channels[0].embedUrl, 'https://livewatch.top/embed/daddy/test');
assert.equal(daddyVip.channels[0].vipPlayback, false);
assert.equal(daddyVip.channels[0].liveWatchMandatoryAd, true);

assert.ok(shell.includes("const northSameOrigin = sourceId === 'livewatch-north'"));
assert.ok(shell.includes("api(`/api/tv/livewatch/prepare/north/${encodeURIComponent(reference.id)}`"));
assert.ok(shell.includes("channel?.playbackType === 'resolver' && channel?.resolverUrl"));
assert.ok(shell.includes('const preferOfficialAltIframe = /^(?:DaddyTV|Daddy TV|NorthTV|FrameTV)$/i'));

const pipStart = shell.indexOf('function tvPictureInPictureSupported');
const pipEnd = shell.indexOf('\n\n  async function enterTvPictureInPicture', pipStart);
assert.ok(pipStart >= 0 && pipEnd > pipStart);
const pipSource = shell.slice(pipStart, pipEnd);
const makePipHelpers = ({ apple, standalone, documentValue }) => new Function(
  'tvVisibleVideo',
  'tvAppleTouchDevice',
  'tvStandalonePwa',
  'document',
  `${pipSource}; return { tvPictureInPictureSupported, tvPictureInPictureCapability };`
)(() => null, () => apple, () => standalone, documentValue);
const misleadingVideo = {
  webkitSupportsPresentationMode: () => false,
  requestPictureInPicture: async () => undefined
};
const misleadingDocument = { pictureInPictureEnabled: true };
const pwaPip = makePipHelpers({ apple: true, standalone: true, documentValue: misleadingDocument });
assert.deepEqual(pwaPip.tvPictureInPictureCapability(misleadingVideo), { supported: false, mode: '', reason: 'ios-standalone' });
const safariPip = makePipHelpers({ apple: true, standalone: false, documentValue: misleadingDocument });
assert.equal(safariPip.tvPictureInPictureCapability(misleadingVideo).supported, true);
const webkitPip = makePipHelpers({ apple: true, standalone: false, documentValue: {} });
assert.equal(webkitPip.tvPictureInPictureCapability({ webkitSupportsPresentationMode: () => true }).mode, 'webkit');
assert.ok(shell.includes("video.webkitPresentationMode === 'picture-in-picture'"));

assert.ok(server.includes("const liveWatchCatalogCachePath = join(runtimeRoot, 'livewatch-catalog-cache.json')"));
assert.ok(server.includes('const tvCatalogFetchPromises = new Map()'));
assert.ok(server.includes('async function readPersistedLiveWatchCuratedCatalog'));
assert.ok(server.includes('void refreshLiveWatchCuratedCatalog(cacheKey).catch(() => undefined)'));
assert.ok(server.includes('Date.now() + 15 * 60_000'));
assert.ok(server.includes('setTimeout(() => void tvCatalogFromLiveWatchCurated().catch(() => undefined), 250)'));

console.log('v128 NorthTV, iOS PiP capability and LiveWatch cache checks passed');
