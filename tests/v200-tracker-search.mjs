import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { trackerSearchIdentity, searchTrackerReleases } from '../lib/tracker-search.mjs';
import { summarizeReleaseLanguages } from '../lib/release-language.mjs';
import { compareReleaseSize } from '../lib/release-search.mjs';

const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const metadata = { id:947, title:"Lawrence d'Arabie", originalTitle:'Lawrence of Arabia', releaseDate:'1962-12-11' };
const identity = trackerSearchIdentity("Lawrence d'Arabie", '1963', metadata);
assert.equal(identity.year, '1962');
assert.deepEqual(identity.titles, ["Lawrence d'Arabie", 'Lawrence of Arabia']);
const release = (title, extra = {}) => ({ title, protocol:'torrent', size:5_000_000_000, seeders:10, categories:[{id:2030}], indexerId:2, ...extra });
const c411 = ['2160p.REMUX', '1080p.AV1', '1080p.x265', 'SD.DVDRip', '1080p.REMUX', '1080p.mHD', '2160p.x265', '2160p.4KLight']
  .map((quality, i) => release(`${i === 7 ? 'Lawrence.DArabie' : 'Lawrence.D.Arabie'}.1962.MULTI.VFF.${quality}`));
const irrelevant = [release('Lawrence.D.Arabie.1962.BONUS.VOSTFR'), release('Lawrence.D.Arabie.1962.BONUS.Interview'), release('Lawrence.D.Arabie.1962.BONUS.Making.Of'), release('Lawrence.D.Arabie.2023.MULTI.VFF.1080p')];
let calls = [];
let response = [...c411, ...irrelevant, c411[0]];
const request = async (path, options) => { calls.push({path, options}); return response; };
let result = await searchTrackerReleases({ mediaType:'movie', identity, indexerIds:[2], request });
assert.equal(result.rows.length, 8, 'Eight real releases, no extras, remake or duplicate');
assert.equal(calls.length, 1);
assert.equal(calls[0].options.method, 'GET');
assert.match(calls[0].path, /1962/);
assert.ok(!calls[0].options.body);
assert.equal(result.rows.some(r=>r.title.includes('DArabie')), true);

calls = [];
result = await searchTrackerReleases({ mediaType:'movie', identity:trackerSearchIdentity('Les Evades', '1994', { originalTitle:'The Shawshank Redemption' }), indexerIds:[2],
  request:async (path, options) => { calls.push(path); assert.equal(options.method, 'GET'); return path.includes('Shawshank') ? [release('The.Shawshank.Redemption.1994.MULTI.VFF.1080p')] : []; } });
assert.equal(result.rows.length, 1, 'Original title fallback');
assert.equal(calls.length, 2);

result = await searchTrackerReleases({ mediaType:'movie', identity, indexerIds:[2],
  request:async path => path.includes('categories=') ? [] : c411 });
assert.equal(result.rows.length, 8, 'Fallback without remote category mapping');
result = await searchTrackerReleases({ mediaType:'movie', identity, indexerIds:[], request:async () => ({ invalid:true }) });
assert.ok(result.error, 'Invalid response must not masquerade as no results');
result = await searchTrackerReleases({ mediaType:'movie', identity, indexerIds:[], request:async path => { if(path.includes('Lawrence+of')) throw new Error('timeout'); return []; } });
assert.equal(result.error, null, 'A valid empty tracker answer is not replaced by a later timeout');
result = await searchTrackerReleases({ mediaType:'movie', identity, indexerIds:[], request:async () => { throw new Error('timeout'); } });
assert.ok(result.error, 'A search where every tracker attempt fails remains an error');

const cache = new Map();
let searches = 0;
const context = vm.createContext({ process:{ env:{ PROWLARR_URL:'http://test', PROWLARR_API_KEY:'test' } }, HttpError:Error,
  positiveInteger:n=>Number(n)>0?Number(n):null, trackerSearchKey:(...args)=>args.join(':'), trackerAvailabilityCache:cache,
  trackerAvailabilityInFlight:new Map(), registerDiscoveryRelease:()=>null, compareReleaseSize,
  requestMetadataDetail:async()=>metadata, tmdbConfigured:()=>false, trackerSearchIdentity, searchTrackerReleases,
  enabledProwlarrIndexers:async()=>[{id:2,name:'C411'}], prowlarrIndexerCache:{base:'http://test'},
  prowlarrRequest:async()=>{ searches++; return {payload:response}; }, summarizeReleaseLanguages, cleanError:e=>e.message });
vm.runInContext(source.slice(source.indexOf('async function prowlarrAvailability('), source.indexOf('const discoveryPlatformCache')), context);
const lookup = (options={})=>context.prowlarrAvailability('movie',"Lawrence d'Arabie",'1963',{tmdbId:947,...options});
let data = await lookup({limit:2});
assert.equal(data.count,8);
assert.equal(data.searchedYear,'1962');
assert.equal(data.releases.length,2);
data = await lookup({limit:24});
assert.equal(data.releases.length,8,'Cached badge must not truncate live release list');
assert.equal(searches,1);
response = [];
data = await lookup({force:true});
assert.equal(data.status,'missing');
assert.ok(searches>1,'Force really searches again');
assert.ok([...cache.values()][0].expiresAt-Date.now()<=120_000, 'Short negative cache');
response = [...c411];
data = await lookup({force:true});
assert.equal(data.count,8);

let apiPath = '';
const browserCache = new Map();
const uiContext = vm.createContext({ URLSearchParams, apiResponseCache:browserCache,
  api:async path=>{apiPath=path;return {configured:true,status:'available',count:8};},
  cachedApi:async()=>({configured:true,status:'error',count:0}) });
vm.runInContext(shell.slice(shell.indexOf('  function trackerAvailabilityPath('),shell.indexOf('  async function loadTrackerAvailability(')),uiContext);
const criteria = { mediaType:'movie',title:"Lawrence d'Arabie",year:'1963',tmdbId:947 };
await uiContext.fetchTrackerAvailability(criteria,true);
assert.match(apiPath,/tmdbId=947&force=1$/);
assert.equal(browserCache.size,1);
await uiContext.fetchTrackerAvailability(criteria);
assert.equal(browserCache.size,0,'Errors are not cached in the browser');
vm.runInContext(shell.slice(shell.indexOf('  function updateDiscoveryTorrentButton('),shell.indexOf('  function closeDiscoveryTorrentLive(')),uiContext);
const label = {textContent:''};
const button = {dataset:{},querySelector:()=>label};
const card = {querySelector:selector=>selector==='[data-discovery-torrents]'?button:null};
uiContext.updateDiscoveryTorrentButton({closest:()=>card},{configured:true,status:'error',count:0});
assert.equal(label.textContent,'Torrents : à vérifier');
assert.equal(button.dataset.count,'');
uiContext.updateDiscoveryTorrentButton({closest:()=>card},{configured:true,status:'missing',count:0});
assert.equal(label.textContent,'Torrents : 0');
console.log('Tracker search: canonical year, translated titles, GET only, filtering, cache and error states OK');
