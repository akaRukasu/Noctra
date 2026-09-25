import assert from 'node:assert/strict';
import { libraryRefreshState } from '../lib/library-refresh.mjs';
import { createInteractiveSearchCache } from '../lib/interactive-search.mjs';
import { publicIndexer, updateIndexer } from '../lib/prowlarr-indexers.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const start = Date.parse('2026-08-27T12:00:00Z');
const previous = { EndTimeUtc: new Date(start - 10000).toISOString(), Status: 'Completed' };
let monitor = { requestedAt: start, baselineEnd: start - 10000 };
const idle = { State: 'Idle', LastExecutionResult: previous };
assert.equal(libraryRefreshState(idle, monitor, start + 16000).phase, 'starting');
assert.equal(libraryRefreshState(idle, monitor, start + 61000).phase, 'error');
assert.equal(libraryRefreshState({ ...idle, State: 'Running', CurrentProgressPercentage: 45.2 }, monitor, start + 62000).progress, 45);
assert.equal(libraryRefreshState(idle, monitor, start + 64000).phase, 'error', 'Old results never confirm a new scan');
const completed = { State: 'Idle', LastExecutionResult: { EndTimeUtc: new Date(start + 65000).toISOString(), Status: 'Completed' } };
assert.equal(libraryRefreshState(completed, monitor, start + 66000).phase, 'complete');

assert.equal(libraryRefreshState(completed, monitor, start + 67000).progress, 100);
assert.equal(libraryRefreshState({ ...completed, LastExecutionResult: { ...completed.LastExecutionResult, Status: 'Failed' } }, monitor, start + 67000).phase, 'error');
monitor = {};
assert.equal(libraryRefreshState(idle, monitor, start).phase, 'idle');
assert.equal(libraryRefreshState({ ...idle, State: 'Running' }, monitor, start).phase, 'running');
assert.equal(monitor.baselineEnd, start - 10000);
assert.notEqual(libraryRefreshState(idle, monitor, start + 2000).phase, 'complete', 'An externally started scan also requires a fresh result');
assert.equal(libraryRefreshState(null, monitor, start + 61000).phase, 'error');
assert.equal(libraryRefreshState(completed, monitor, start + 66000).phase, 'complete');
assert.equal(libraryRefreshState({ ...completed, State: 'Running' }, monitor, start + 120000).phase, 'running');
assert.equal(libraryRefreshState(completed, monitor, start + 122000).phase, 'starting', 'A later external scan cannot reuse the preceding successful result');

let now = 0;
const cache = createInteractiveSearchCache({ now: () => now, ttlMs: 20000, limit: 2 });
let release;
let calls = 0;
const loader = async report => {
  calls++;
  report({ total: 3, completed: 1, releases: ['partial'] });
  await new Promise(resolve => { release = resolve; });
  return { completed: 3, releases: ['partial', 'final'] };
};
const job = cache.get('series', loader);
await Promise.resolve();
assert.equal(job.value.completed, 1);
assert.equal(job.value.running, true);
assert.equal(cache.get('series', loader, true), job, 'Force must not duplicate an active search');
assert.equal(calls, 1);
release();
await job.promise;
assert.equal(job.value.running, false);
assert.equal(cache.get('series', loader), job);
now = 21000;
const fresh = cache.get('series', async () => ({ releases: ['new'] }));
assert.notEqual(fresh, job);
await fresh.promise;
const error = cache.get('error', async () => { throw new Error('Indexer offline'); });
await error.promise;
assert.equal(error.value.error, 'Indexer offline');
assert.equal(error.expiresAt, 31000);
now = 32000;
assert.notEqual(cache.get('error', async () => ({ releases: [] })), error);
const bounded = createInteractiveSearchCache({ limit: 1 });
let finish;
bounded.get('first', () => new Promise(resolve => { finish = resolve; }));
await Promise.resolve();
bounded.clear();
assert.throws(() => bounded.get('second', async () => ({})), /recherches en cours/);
finish({ releases: [] });

const original = { id: 2, name: 'Test', enable: true, priority: 25, appProfileId: 1, tags: [3], fields: [
  { name: 'baseUrl', label: 'URL', value: 'https://tracker.example', type: 'textbox' },
  { name: 'apiKey', value: 'private-api-key', type: 'textbox' },
  { name: 'cookie', value: 'private-cookie', type: 'textbox' },
  { name: 'password', value: 'private-password', type: 'password' },
  { name: 'other', value: 'private-token', privacy: 'apiKey', type: 'textbox' },
  { name: 'hidden', value: 'private-hidden', hidden: true },
  { name: 'limit', value: 100, type: 'number' },
  { name: 'enabledFeature', value: false, type: 'checkbox' }
] };
const clean = publicIndexer(original);
assert.ok(!JSON.stringify(clean).includes('private-'));
assert.equal(clean.fields.filter(field => field.secret).length, 4);
assert.ok(clean.fields.find(field => field.name === 'apiKey').hasValue);
const updated = updateIndexer(original, { name: 'Renamed', priority: 10, enable: false, fields: { apiKey: '', cookie: '', password: 'new', hidden: 'overwrite', limit: '10', enabledFeature: true } });
assert.equal(updated.name, 'Renamed');
assert.equal(updated.fields.find(field => field.name === 'apiKey').value, 'private-api-key');
assert.equal(updated.fields.find(field => field.name === 'hidden').value, 'private-hidden');
assert.equal(updated.fields.find(field => field.name === 'password').value, 'new');
assert.equal(updated.fields.find(field => field.name === 'limit').value, 10);
assert.equal(updated.fields.find(field => field.name === 'enabledFeature').value, true);
assert.deepEqual(updated.tags, [3]);
assert.equal(original.name, 'Test');
assert.throws(() => updateIndexer(original, { name: '' }));
assert.throws(() => updateIndexer(original, { name: 'Test', priority: 51 }));
assert.throws(() => updateIndexer(original, { name: 'Test', fields: { limit: 'bad' } }));
assert.throws(() => updateIndexer(original, { name: 'Test', fields: { baseUrl: { unexpected: true } } }));

const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
let additions = 0;
let fetches = 0;
let posted;
const downloads = new Map();
const downloadContext = vm.createContext({ createHash, Date, URL, Buffer, AbortSignal, HttpError,
  discoveryGrabReleases: downloads, process: { env: { PROWLARR_API_KEY: 'test-key' } },
  prowlarrBaseCandidates: () => ['http://prowlarr.test'], arrHeaders: key => ({ 'X-Api-Key': key }),
  fetch: async (url, options) => { fetches++; assert.equal(url.origin, 'http://prowlarr.test'); assert.equal(options.headers['X-Api-Key'], 'test-key'); return new Response(Buffer.from('d4:infod4:name4:testee')); },
  qbitAddTorrent: async body => { additions++; posted = body; return { ok: true, startPaused: body.startPaused }; }
});
vm.runInContext(source.slice(source.indexOf('function registerDiscoveryRelease('), source.indexOf('let indexerSchemaCache')), downloadContext);
const releaseData = { title: 'Test.2026.VFF', protocol: 'torrent', indexerId: 2, guid: 'test', downloadUrl: 'http://prowlarr.test/download/1?apikey=secret' };
const downloadId = downloadContext.registerDiscoveryRelease(releaseData);
assert.equal(downloadId.length, 64);
const firstGrab = downloadContext.grabDiscoveryTorrent({ downloadId, savePath: '/media/Films' });
downloadContext.registerDiscoveryRelease(releaseData);
await firstGrab;
assert.equal(posted.startPaused, true, 'Server defaults to stopped unless explicitly requested otherwise');
assert.equal(posted.savePath, '/media/Films');
assert.equal((await downloadContext.grabDiscoveryTorrent({ downloadId })).alreadyPresent, true);
assert.equal(additions, 1, 'Refreshing the list during a grab must retain idempotency');
assert.equal(fetches, 1);
await assert.rejects(downloadContext.grabDiscoveryTorrent({ downloadId: 'unknown' }), error => error.status === 409);
const rejectedId = downloadContext.registerDiscoveryRelease({ ...releaseData, guid: 'other', downloadUrl: 'https://untrusted.test/file.torrent' });
await assert.rejects(downloadContext.grabDiscoveryTorrent({ downloadId: rejectedId }), error => error.status === 502);
assert.equal(fetches, 1, 'An arbitrary external download URL must never be fetched');
downloads.get(downloadId).expiresAt = 0;
await assert.rejects(downloadContext.grabDiscoveryTorrent({ downloadId }), error => error.status === 409);

const tasteCache = new Map();
let itemReads = 0;
let failItems = false;
const profileContext = vm.createContext({ Date, tasteProfileCache: tasteCache, tasteProfileInFlight: new Map(),
  positiveInteger: n => Number(n) > 0 ? Number(n) : null,
  normalizedTitle: title => String(title).toLowerCase(), normalizedIdentifier: value => String(value).toLowerCase(),
  mapWithConcurrency: async (items, concurrency, fn) => { assert.equal(concurrency, 2); const results = []; for (const item of items) results.push(await fn(item)); return results; },
  jellyfinItems: async (path, query) => {
    itemReads++;
    assert.equal(query.Limit, 200);
    assert.ok(!query.Fields.includes('People'), 'Heavy people joins caused production timeouts');
    if (failItems) throw Error('Jellyfin unavailable');
    return [{ Id: String(query.StartIndex), Name: 'Test', Type: query.StartIndex ? 'Series' : 'Movie', Genres: ['Drama'], ProviderIds: { Tmdb: '12' }, UserData: { Played: true } }];
  }
});
vm.runInContext(source.slice(source.indexOf('async function jellyfinTasteProfile('), source.indexOf('async function tmdbGenreMaps(')), profileContext);
const profile = await profileContext.jellyfinTasteProfile({ user: { Id: 'qa' } });
assert.equal(profile.sampleSize, 4);
assert.equal(profile.playedCount, 4);
assert.ok(profile.existingTmdb.has('movie:12'));
assert.ok(profile.existingTmdb.has('tv:12'), 'Movie and series IDs must not collide');
await profileContext.jellyfinTasteProfile({ user: { Id: 'qa' } });
assert.equal(itemReads, 4);
tasteCache.clear();
failItems = true;
await assert.rejects(profileContext.jellyfinTasteProfile({ user: { Id: 'qa' } }), /unavailable/);
assert.equal(tasteCache.size, 0, 'A failed profile must not be cached as empty preferences');

console.log('v200.13 scan confirmation, progressive search/cache, indexer secrets and edits: OK');
