import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.39');
assert.ok(server.includes("version: '200.0.39'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.39'"));

const decorateStart = server.indexOf('async function decorateLiveWatchVipPlayback');
const decorateEnd = server.indexOf('function validLiveWatchChannelReference', decorateStart);
const decorate = server.slice(decorateStart, decorateEnd);
assert.ok(decorate.includes('channel.baseName || cleanLiveWatchChannelName'), 'Le resolver doit recevoir le nom de base, pas le suffixe SAT/CABLE affiché.');
assert.ok(decorate.includes("kind: 'livewatch-page'") && decorate.includes('/api/tv/livewatch/resolve/page/'), 'Les dérivés LiveWatch doivent eux aussi passer par le bridge VIP.');

const resolverStart = server.indexOf('async function resolveLiveWatchVipPlayback');
const resolverEnd = server.indexOf('async function liveWatchVipDiagnosticCheck', resolverStart);
const resolver = server.slice(resolverStart, resolverEnd);
assert.ok(resolver.includes('liveWatchChannelVariants') && resolver.includes('validateLiveWatchStreamReference(token'), 'Chaque variante LiveWatch doit être validée jusqu’au média.');
assert.ok(resolver.includes('directs.length >= 3') && resolver.includes('options: [...directs, official, publicFallback]'), 'Les variantes saines doivent précéder le lecteur React.');

const unwrapStart = server.indexOf('function fstvUnwrappedMediaReference');
const unwrapEnd = server.indexOf('async function validateFstvHlsPath', unwrapStart);
const unwrap = new Function('safeTvRemoteUrl', `${server.slice(unwrapStart, unwrapEnd)}; return fstvUnwrappedMediaReference;`)(value => new URL(value));
const wrappedSegment = 'https://fstv.rest/live.php?seg=https%3A%2F%2Fcdn.example%2Fa.zst&r=https%3A%2F%2Fplayer.example%2F';
const segment = unwrap(wrappedSegment, { referer: 'https://fstv.rest/page' });
assert.equal(segment.url, 'https://cdn.example/a.zst');
assert.equal(segment.headers.referer, 'https://player.example/');
assert.equal(segment.headers.origin, 'https://player.example');
const wrappedPlaylist = 'https://fstv.rest/live.php?seg=https%3A%2F%2Fcdn.example%2Fmono.m3u8&r=https%3A%2F%2Fplayer.example%2F';
assert.equal(unwrap(wrappedPlaylist, {}).url, wrappedPlaylist, 'Le relais FSTV reste utilisé pour la playlist enfant qu’il sait encore servir.');

const fstvCatalogStart = server.indexOf("async function tvCatalogFromFstv");
const fstvCatalogEnd = server.indexOf('function parseDlStreamsSports', fstvCatalogStart);
const fstvCatalog = server.slice(fstvCatalogStart, fstvCatalogEnd);
assert.ok(fstvCatalog.includes('const channels = [...map.values()]'), 'FSTV doit rester dynamique jusqu’au clic.');
assert.ok(server.includes('await validateFstvHlsPath(liveUrl, headers'), 'FSTV doit atteindre un segment avant d’annoncer le direct comme vérifié.');

const wiStart = server.indexOf('async function validateWiTvHlsStream');
const wiEnd = server.indexOf('async function resolveWiTvPlayerOption', wiStart);
const wiValidation = server.slice(wiStart, wiEnd);
assert.ok(wiValidation.includes('for (let depth = 0; depth < 4') && wiValidation.includes('liveWatchFirstPlaylistUri'), 'WiTV doit sonder master, playlist média puis segment.');
assert.ok(server.includes("verifiedLiveWatchNamedFallbackOptions(reference.meta?.channelName, 'Secours WiTV')"), 'WiTV doit disposer d’un secours réellement vérifié.');

const fallbackStart = shell.indexOf('const startResolvedOptionFallback');
const fallbackEnd = shell.indexOf('const onPlaying', fallbackStart);
const fallback = shell.slice(fallbackStart, fallbackEnd);
assert.ok(fallback.includes('!item?.manualOnly'), 'Le lecteur public avec pubs doit rester strictement manuel.');
assert.ok(fallback.indexOf("item?.streamUrl || item?.playbackType === 'stream'") < fallback.indexOf('item?.officialClient'), 'Les directs vérifiés doivent précéder le bridge React.');

console.log('Noctra v200.0.39 · chemins TV réels : OK');
