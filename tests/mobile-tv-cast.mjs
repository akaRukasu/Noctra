import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createTvCastAccess } from '../lib/tv-cast.mjs';
let time = 100;
const casts = createTvCastAccess({ basePath: '/noctra', now: () => time, ttl: 1000 });
const issued = casts.issue({ token: 'private-account-token', path: '/noctra/api/tv/livewatch/hls/main/a?sel=2', origin: 'https://example.test' });
assert.ok(!issued.url.includes('private-account-token'));
assert.equal(casts.tokenForRequest({ method: 'GET', url: issued.url }), 'private-account-token');
assert.equal(casts.tokenForRequest({ method: 'HEAD', url: issued.url }), 'private-account-token');
const key = new URL(issued.url, 'https://example.test').searchParams.get('cast');
assert.equal(casts.tokenForRequest({ method: 'GET', url: '/noctra/api/admin?cast=' + key }), '');
assert.equal(casts.tokenForRequest({ method: 'POST', url: issued.url }), '');
const headers = new Map([['content-type', 'application/vnd.apple.mpegurl']]);
let output;
const res = { setHeader: (k,v) => headers.set(k,v), getHeader: k => headers.get(k), removeHeader: k => headers.delete(k), end: body => { output = body; } };
assert.ok(casts.wrapResponse({ url: issued.url }, res));
const source = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="/noctra/api/tv/stream/key"\n/noctra/api/tv/stream/segment?res=1\nhttps://vendor.test/api/tv/stream/file';
res.end(source);
assert.match(output, /key\?cast=[a-f0-9]{64}/);
assert.match(output, /res=1&cast=[a-f0-9]{64}/);
assert.ok(output.endsWith('https://vendor.test/api/tv/stream/file'));
assert.equal(source.includes('cast='), false);
assert.equal(headers.get('access-control-allow-origin'), '*');
time = 1100;
assert.equal(casts.tokenForRequest({ method: 'GET', url: issued.url }), '');
assert.throws(() => casts.issue({ token: 'x', path: '/api/admin', origin: 'https://example.test' }));
// Une vraie ServerResponse interdit removeHeader après writeHead : vérifier le
// chemin employé par les relais HLS, puis un segment envoyé en plusieurs blocs.
const actual = createTvCastAccess({ basePath: '/noctra' });
let actualUrl;
const http = createServer((req, response) => {
  assert.ok(actual.wrapResponse(req, response));
  if (req.url.startsWith('/api/tv/stream/chunk')) {
    response.writeHead(206, { 'content-type': 'video/mp2t', 'content-length': '6', 'content-range': 'bytes 0-5/6' });
    response.flushHeaders(); response.write('abc'); response.end('def');
  } else {
    response.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl', 'content-length': Buffer.byteLength(source), 'access-control-allow-origin': 'https://other.test' });
    response.end(source);
  }
});
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
try {
  const origin = `http://127.0.0.1:${http.address().port}`;
  actualUrl = actual.issue({ token: 'secret', path: '/api/tv/stream/master', origin }).url;
  const response = await fetch(origin + actualUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /res=1&cast=[a-f0-9]{64}/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const chunk = actual.issue({ token: 'secret', path: '/api/tv/stream/chunk', origin }).url;
  const media = await fetch(origin + chunk);
  assert.equal(media.status, 206); assert.equal(await media.text(), 'abcdef');
  assert.equal(media.headers.get('content-range'), 'bytes 0-5/6');
} finally { await new Promise(resolve => http.close(resolve)); }
console.log('Droits TV temporaires : portée, expiration et listes HLS vérifiées.');
