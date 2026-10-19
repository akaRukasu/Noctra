// 200.0.142 — LiveWatch exige une autorisation de lecture (« grant_required ») avant chaque flux :
// POST /api/play/grant avec la session VIP, puis en-tête X-Play-Grant, comme le lecteur officiel.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const start = server.indexOf('const liveWatchPlayGrants = new Map();');
const end = server.indexOf('function liveWatchStableHlsUrl(');
assert.ok(start > 0 && end > start);

const calls = [];
let grantCalls = 0;
const fetchTvRemote = async (url, options = {}) => {
  const headers = options.headers || {};
  calls.push({ url: String(url), method: options.method || 'GET', grant: headers['x-play-grant'] || '', agent: headers['user-agent'] || '' });
  if (String(url).endsWith('/api/play/grant')) {
    grantCalls += 1;
    assert.equal(headers.authorization, 'Bearer jeton-vip');
    if (grantCalls === 1) return new Response(JSON.stringify({ retry_after: 0 }), { status: 425 });
    return new Response(JSON.stringify({ grant: `grant-${grantCalls}`, tier: 'vip', expires_in: 3600 }), { status: 200 });
  }
  if (!headers['x-play-grant']) return new Response(JSON.stringify({ detail: 'Autorisation de lecture requise', code: 'grant_required' }), { status: 403 });
  return new Response(JSON.stringify({ url: 'https://livewatch.icu/api/hls/abc/index.m3u8' }), { status: 200, headers: { 'content-type': 'application/json' } });
};
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const references = new Map();
const factory = new Function('fetchTvRemote', 'HttpError', 'tvReferences', 'liveWatchVipDirectCache', 'liveWatchOrigin', 'liveWatchBrowserAgent', `
  let liveWatchClientMode = { browser: false, changedAt: 0 };
  const liveWatchClientHeaders = (path, browser = liveWatchClientMode.browser) => ({ 'user-agent': browser ? 'navigateur' : 'Noctra' });
  const liveWatchPlayerCookies = async () => '';
  const liveWatchAccessSession = async () => ({ accessToken: 'jeton-vip', userId: 'u1' });
  const validLiveWatchChannelReference = (kind, id) => ({ kind, id });
  const liveWatchStreamUrlFromPayload = payload => payload.url || '';
  const safeTvRemoteUrl = value => new URL(value);
  const isLiveWatchFamilyHost = host => /livewatch\\.(icu|top)$/.test(host);
  const tvResponseCookieHeader = () => '';
  const mergeTvCookieHeaders = (a, b) => a + b;
  let counter = 0;
  const issueTvReference = (url, headers, meta) => { const token = 't' + (++counter); tvReferences.set(token, { url, headers, meta }); return token; };
  ${server.slice(start, end)}
  return { liveWatchStreamReference, liveWatchPlayGrant, liveWatchPlayGrantInfo };`);
const cache = new Map();
const api = factory(fetchTvRemote, HttpError, references, cache, 'https://livewatch.icu', 'UA');

const token = await api.liveWatchStreamReference('main', 'bein1');
const reference = references.get(token);
assert.equal(reference.url, 'https://livewatch.icu/api/hls/abc/index.m3u8');
assert.equal(reference.headers['x-play-grant'], 'grant-2', 'autorisation jointe au flux (425 puis 200)');
assert.deepEqual(api.liveWatchPlayGrantInfo({ userId: 'u1' }).tier, 'vip');
const streamCall = calls.find(call => call.url.includes('/api/stream/'));
assert.equal(streamCall.grant, 'grant-2', 'X-Play-Grant envoyé à /api/stream');
// 200.0.143 : autorisation jointe = identité du navigateur qui l'a obtenue, même en mode Noctra.
assert.equal(streamCall.agent, 'navigateur');
assert.equal(reference.headers['user-agent'], 'navigateur');
assert.match(server, /let liveWatchClientMode = \{ browser: true, changedAt: 0 \};/, 'mode navigateur par défaut');
assert.match(server, /excerpt: text\.slice\(0, 300\)/, 'diagnostic : début d’une réponse qui n’est pas une playlist');
// Autorisation gardée en mémoire : pas de nouvelle demande pour la chaîne suivante.
cache.clear();
await api.liveWatchStreamReference('daddy', 'bein2');
assert.equal(grantCalls, 2);
assert.match(server, /\.\.\.\(trustedLiveWatchRedirect \? \[\] : \['x-play-grant'\]\)/, 'autorisation retirée lors d’une redirection hors LiveWatch');
assert.match(server, /lower\.startsWith\('x-play-'\)/, 'lecteur officiel relayé : en-tête X-Play-Grant transmis');
console.log('v200.0.142/143 : autorisation de lecture LiveWatch (play/grant, X-Play-Grant, 425, identité navigateur) : OK');
