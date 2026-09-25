// 200.0.111 — rafraîchissement des playlists TV : chargement détaché du lecteur,
// partagé entre tentatives, et dernière playlist renvoyée si le fournisseur tarde.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createTvSegmentCache } from '../lib/tv-segment-cache.mjs';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const between = (start, end) => server.slice(server.indexOf(start), server.indexOf(end, server.indexOf(start)));
const helpers = between('const tvPlaylistMemory = new Map();', '// 200.0.110 : Shaka interroge')
  .replace('TV_PLAYLIST_CLIENT_WAIT_MS = 7_000', 'TV_PLAYLIST_CLIENT_WAIT_MS = 150');
const proxySource = between('async function proxyTvStream(', '\nasync function readJsonBody');
assert.ok(helpers.includes('function serveRememberedTvPlaylist') && proxySource.includes('serveRememberedTvPlaylist'));

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let fetches = 0, upstreamDelay = 0, upstreamStatus = 200, version = 0, aborts = 0;
const fetchTvRemoteUntilHeaders = async (url, { signal }) => {
  fetches++;
  const current = ++version;
  signal?.addEventListener('abort', () => { aborts++; }, { once: true });
  await delay(upstreamDelay);
  return new Response(`#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:${current}\n`, { status: upstreamStatus, headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
};
const references = new Map([['live', { url: 'https://cdn.test/live/index.m3u8', headers: {}, expiresAt: Date.now() + 600_000, meta: {} }]]);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const deps = {
  tvReferences: references, HttpError, tvSegmentCache: createTvSegmentCache(), safeTvRemoteUrl: v => new URL(v),
  fetchTvRemoteUntilHeaders, pipeRemoteResponseBody: async () => {},
  readTvPlaylistBody: response => response.text(), tvResponseCookieHeader: () => '', tvChildReferenceHeaders: headers => headers,
  mergeTvCookieHeaders: (a, b) => b || a, rewriteTvPlaylist: text => text + '#noctra\n'
};
const proxy = new Function(...Object.keys(deps), `${helpers}\n${proxySource};return proxyTvStream;`)(...Object.values(deps));
const response = () => { const res = new EventEmitter(); res.writeHead = (status, headers) => { res.status = status; res.headers = headers; }; res.end = body => { res.body = String(body ?? ''); res.emit('finish'); }; return res; };
const request = async () => { const res = response(); await proxy('live', { headers: {} }, res); return res; };

// 1. Premier chargement : chemin normal, playlist mémorisée.
let res = await request();
assert.equal(res.status, 200);
assert.match(res.body, /MEDIA-SEQUENCE:1/);
assert.equal(fetches, 1);

// 2. Fournisseur rapide : playlist fraîche via le chargement détaché.
res = await request();
assert.equal(res.headers['x-noctra-playlist'], 'fresh');
assert.match(res.body, /MEDIA-SEQUENCE:2/);

// 3. Fournisseur lent : la dernière playlist est renvoyée sans erreur, et le
//    chargement continue sans être annulé par le départ du lecteur.
upstreamDelay = 600;
res = await request();
assert.equal(res.headers['x-noctra-playlist'], 'stale');
assert.match(res.body, /MEDIA-SEQUENCE:2/);
const before = fetches;
res = await request();
assert.equal(fetches, before, 'Une nouvelle tentative rejoint le chargement en cours');
assert.equal(res.headers['x-noctra-playlist'], 'stale');
await delay(700);
assert.equal(aborts, 0, 'Chargement mené à terme');
upstreamDelay = 0;
res = await request();
assert.equal(res.headers['x-noctra-playlist'], 'fresh');
assert.ok(Number(res.body.match(/MEDIA-SEQUENCE:(\d+)/)[1]) >= 3, 'Playlist récente disponible dès la tentative suivante');

// 4. Fournisseur en erreur : dernière playlist tant qu'elle a moins de 30 s.
upstreamStatus = 503;
res = await request();
assert.equal(res.status, 200);
assert.equal(res.headers['x-noctra-playlist'], 'stale');

// 4b. Lien expiré (403/410) : l'erreur remonte aussitôt pour renouveler l'URL.
upstreamStatus = 410;
await assert.rejects(request(), error => error.status === 410);
upstreamStatus = 503;

// 5. Au-delà, l'erreur remonte normalement au lecteur.
const realNow = Date.now;
Date.now = () => realNow() + 31_000;
await assert.rejects(request(), error => error.status === 503);
Date.now = realNow;

console.log('v200.0.111 : playlists TV partagées entre tentatives, jamais annulées par le lecteur, dernière version en secours : OK');
