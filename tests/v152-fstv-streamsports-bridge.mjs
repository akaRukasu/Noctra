import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));

// FSTV: the browser no longer frames the remote DLE page directly. Its page,
// same-origin assets and AJAX calls are relayed under the Noctra origin.
assert.ok(server.includes('function sanitizeFstvBridgeHtml'));
assert.ok(server.includes('async function proxyFstvSite'));
assert.ok(server.includes("/api/tv/fstv/site/"));
assert.ok(server.includes('fstvBridgeCookies'));
assert.ok(server.includes("XMLHttpRequest.prototype.open=function(method,url,...rest)"));
assert.ok(server.includes("window.fetch=(input,init)=>"));
assert.ok(server.includes("'referrer-policy'] = 'no-referrer'"));

// StreamSports99: primary discovery uses the public sports API/player URLs used
// by the current web app, while mirror scraping remains a fallback.
assert.ok(server.includes('function streamSports99CdnEventChannels'));
assert.ok(server.includes('async function streamSports99PublicApiCatalog'));
assert.ok(server.includes('https://api.cdn-live.tv/api/v1/events/sports/?user=cdnlivetv&plan=free'));
assert.ok(server.includes("if (status === 'finished') continue;"));
assert.ok(server.includes("streamKind: 'StreamSports99 · HLS multi-serveurs'"));
assert.ok(server.includes('function resolveStreamSports99EventReference'));
assert.ok(server.includes("'https://streamsports99.website/'"));

console.log('v152 FSTV bridge / StreamSports99 public API checks: OK');
