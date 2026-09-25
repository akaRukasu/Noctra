import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));

// V106 ajoute uniquement diagnostic/récupération même flux côté lecteur ; le transport v104 reste présent.
const directStart = shell.indexOf('async function playTvDirectStream');
const directEnd = shell.indexOf('async function playTvResolvedOption', directStart);
const directHash = createHash('sha256').update(shell.slice(directStart, directEnd)).digest('hex');
assert.equal(directHash, '358d6a707ba385f12ef0cf2f7aec7800b7ca97b4daa1f5e01bf23fa617479bbb');

// LiveWatch : les media-playlists doivent produire des segments stables par MEDIA-SEQUENCE.
assert.ok(server.includes('function liveWatchMediaPlaylistPointers'));
assert.ok(server.includes('function rewriteLiveWatchStableMediaPlaylist'));
assert.ok(server.includes('async function proxyLiveWatchVipHlsMediaResource'));
assert.ok(server.includes("requestUrl.searchParams.get('res')"));
assert.ok(server.includes('liveWatchFreshMediaPointer'));
assert.ok(server.includes('liveWatchRefreshableMediaStatus'));
assert.ok(server.includes("`s${mediaSequence + segmentOffset}`"));
assert.ok(server.includes("'x-noctra-livewatch-resource': resourceKey"));

// Vérifie réellement la numérotation d'une media-playlist glissante.
const ptrStart = server.indexOf('function liveWatchStableResourceIdentity');
const ptrEnd = server.indexOf('function liveWatchMediaResourceCacheKey', ptrStart);
assert.ok(ptrStart >= 0 && ptrEnd > ptrStart);
const pointerFactory = new Function('createHash', 'resolveTvUrl', 'tvChildReferenceHeaders', `${server.slice(ptrStart, ptrEnd)}; return liveWatchMediaPlaylistPointers;`)(
  createHash,
  (value, base) => new URL(value, base).toString(),
  headers => ({ ...headers })
);
const pointers = pointerFactory(`#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:420\n#EXTINF:4,\nseg420.ts?sig=a\n#EXTINF:4,\nseg421.ts?sig=b\n`, 'https://cdn.example/live/index.m3u8', {});
assert.equal(pointers.byKey.get('s420')?.url, 'https://cdn.example/live/seg420.ts?sig=a');
assert.equal(pointers.byKey.get('s421')?.url, 'https://cdn.example/live/seg421.ts?sig=b');

// OHA desktop : détecter HEVC-only et préférer un serveur AVC lorsqu'il existe.
const codecStart = server.indexOf('function hlsCodecSummary');
const codecEnd = server.indexOf('async function probeOhaStreamCodec', codecStart);
assert.ok(codecStart >= 0 && codecEnd > codecStart);
const hlsCodecSummary = new Function(`${server.slice(codecStart, codecEnd)}; return hlsCodecSummary;`)();
assert.equal(hlsCodecSummary('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="hvc1.1.6.L120.90,mp4a.40.2"\nhevc.m3u8').desktopCodecRisk, true);
assert.equal(hlsCodecSummary('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="avc1.640028,mp4a.40.2"\navc.m3u8').desktopCodecRisk, false);
assert.ok(server.includes('preferDesktopAvc: tvDesktopPlaybackUserAgent(clientUserAgent)'));
assert.ok(server.includes('desktopCodecRisk ? [bridge, nativeAttempt] : [nativeAttempt, bridge]'));
assert.ok(server.includes("req.headers['user-agent'] || ''"));

console.log('Stabilité segments LiveWatch + compatibilité codec OHA desktop Noctra v104 : OK');
