// 200.0.145 — direct diffusé (Chromecast, AirPlay) : départ ~18 s avant le bord du direct, pour une
// réserve sur le téléviseur (image et son fluides) ; listes VOD, courtes ou déjà réglées inchangées.
import assert from 'node:assert/strict';
import { createTvCastAccess, withCastStart } from '../lib/tv-cast.mjs';

const live = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n' + Array.from({ length: 8 }, (_, i) => `#EXTINF:4.0,\ns${i}.ts`).join('\n') + '\n';
assert.match(withCastStart(live), /^#EXTM3U\n#EXT-X-START:TIME-OFFSET=-18,PRECISE=NO\n#EXT-X-VERSION:3/);
const short = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\na.ts\n#EXTINF:6,\nb.ts\n';
assert.equal(withCastStart(short), short, 'liste trop courte : départ inchangé');
assert.doesNotMatch(withCastStart(live + '#EXT-X-ENDLIST\n'), /EXT-X-START/, 'vidéo (VOD) inchangée');
assert.equal(withCastStart('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n', 'liste principale inchangée');
const already = live.replace('#EXTM3U\n', '#EXTM3U\n#EXT-X-START:TIME-OFFSET=-6\n');
assert.equal(withCastStart(already), already);

// Appliqué aux listes servies avec un droit de diffusion.
const cast = createTvCastAccess();
const { url } = cast.issue({ token: 'jeton', path: '/api/tv/stream/abc', origin: 'https://noctra.test' });
const key = new URL(url, 'https://noctra.test').searchParams.get('cast');
const headers = {};
const res = { getHeader: name => headers[name], setHeader: (name, value) => { headers[name] = value; }, removeHeader: name => { delete headers[name]; }, headersSent: false,
  writeHead() { return this; }, end(body) { this.body = body; return this; } };
assert.equal(cast.wrapResponse({ url: `/api/tv/stream/abc?cast=${key}`, method: 'GET' }, res), true);
res.setHeader('content-type', 'application/vnd.apple.mpegurl');
res.end(live);
assert.match(res.body, /#EXT-X-START:TIME-OFFSET=-18/);
assert.match(res.body, /s0\.ts\?cast=/);
console.log('v200.0.145 : direct diffusé avec une réserve de 18 s (Chromecast, AirPlay) : OK');
