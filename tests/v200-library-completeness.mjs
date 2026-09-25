import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { auditMovieCollection, auditSeries, createLibraryAudit } from '../lib/library-completeness.mjs';

const now = Date.parse('2026-08-27T12:00:00Z');
const collection = { id: 4, name: 'Saga', parts: [
  { id: 1, title: 'Original', releaseDate: '1980-01-01' },
  { id: 2, title: 'Suite', release_date: '1985-01-01' },
  { id: 2, title: 'Suite', release_date: '1985-01-01' },
  { id: 3, title: 'Prochain film', release_date: '2027-01-01' },
  { id: 4, title: 'Sans date' }
] };
let group = auditMovieCollection(collection, new Map([[1, 'present'], [99, 'present']]), now);
assert.equal(group.expected, 4);
assert.equal(group.missingCount, 1, 'Another movie with the same title cannot complete a collection');
assert.equal(group.upcomingCount, 1);
assert.equal(group.unknownCount, 1);
assert.equal(group.present, 1);
assert.equal(group.status, 'incomplete');
assert.equal(auditMovieCollection({id:1, parts:[]}, new Map(), now).status, 'unknown');
assert.equal(auditMovieCollection({id:1, parts:[collection.parts[0]]}, new Map([[1,'unverified']]), now).status, 'unknown');
assert.equal(auditMovieCollection({id:1, parts:collection.parts.slice(0,2)}, new Map([[1,'present'],[2,'present']]), now).status, 'complete');

const series = { Id:'s1', Name:'Serie' };
const expected = Array.from({ length:5 }, (_,i) => ({ season:1, episode:i+1, title:`Episode ${i+1}`, date:i===4?'2027-01-01':'2020-01-01', provider:'Tvdb', providerId:i+10 }));
const owned = [{ ParentIndexNumber:1, IndexNumber:1, IndexNumberEnd:2, fileState:'present', ProviderIds:{Tvdb:'10'} },
  { ParentIndexNumber:2, IndexNumber:1, fileState:'present', ProviderIds:{Tvdb:'12'} }];
group = auditSeries(series, [...expected, {season:0,episode:1,date:'2020-01-01'}], owned, {now});
assert.equal(group.present, 3, 'Double episodes and episode identity across numbering changes');
assert.equal(group.missingCount, 1);
assert.equal(group.upcomingCount, 1);
assert.equal(group.expected, 5, 'Specials do not count as missing');
assert.equal(auditSeries(series, expected.slice(0,1), [{ParentIndexNumber:1,IndexNumber:1,fileState:'present',ProviderIds:{Tvdb:99}}], {now}).status, 'unknown', 'Conflicting IDs must not match by position or produce false absences');
assert.equal(auditSeries(series, expected.slice(0,1), [{...owned[0],fileState:'unverified'}], {now}).unknownCount, 1);
assert.equal(auditSeries(series, expected.slice(0,1), owned, {now,warning:'Partial metadata'}).status, 'unknown');

let scans = 0;
const calls = [];
const job = createLibraryAudit({
  inventory: async()=>{ scans++; return [{Id:'m1',Type:'Movie',Name:'Film',ProviderIds:{Tmdb:'1'}},
    {Id:'m2',Type:'Movie',Name:'Unidentified'}, {...series,Type:'Series',ProviderIds:{Tmdb:'5',Tvdb:'6'}},
    {Id:'s2',Name:'Second folder',Type:'Series',ProviderIds:{Tmdb:'5',Tvdb:'6'}},
    {Id:'e1',SeriesId:'s1',Type:'Episode',ParentIndexNumber:1,IndexNumber:1},
    {Id:'e2',SeriesId:'s2',Type:'Episode',ParentIndexNumber:1,IndexNumber:2}]; },
  fileState:async()=> 'present',
  arrCatalog:async kind=> kind==='radarr'?[{tmdbId:1,collection:{tmdbId:4}}]:[{tvdbId:6,id:7}],
  sonarrEpisodes:async()=> Array.from({length:203},(_,i)=>({seasonNumber:1,episodeNumber:i+1,airDate:'2020-01-01'})),
  metadata:async path=>{calls.push(path); return collection;}
});
assert.equal(job.start().running, true);
job.start();
while(job.snapshot().running) await new Promise(resolve=>setTimeout(resolve,1));
assert.equal(scans, 1, 'Opening twice cannot create concurrent scans');
const result = job.snapshot();
assert.equal(result.phase, 'complete');
assert.equal(result.processed, result.total);
assert.equal(result.counts.unknown, 1);
assert.equal(result.groups.find(g=>g.id==='series:s1').missingCount, 201);
assert.equal(result.groups.filter(g=>g.kind==='series').length, 1, 'Split series folders are audited together');
assert.equal(result.groups.some(g=>'entries' in g), false, 'Polling never sends large episode arrays');
assert.deepEqual(calls, ['/collection/4'], 'Radarr collection IDs avoid unnecessary per-movie lookups');
assert.equal(job.detail('series:s1').entries.length, 100);
assert.equal(job.detail('series:s1',100).entries.length, 100);
assert.equal(job.detail('series:s1',200).entries.length, 1);
assert.equal(job.detail('series:s1',200).nextOffset, null);
assert.equal(job.detail('unknown'), null);

const fallback = createLibraryAudit({inventory:async()=>[{...series,Type:'Series',ProviderIds:{Tmdb:5}}],fileState:async()=> 'present',arrCatalog:async()=>[],
  sonarrEpisodes:async()=>{throw Error('Not used');},metadata:async path=>path==='/tv/5'?{seasons:[{seasonNumber:1},{seasonNumber:2}]}:path.endsWith('/1')?{episodes:[{id:1,episodeNumber:1,airDate:'2020-01-01'}]}:Promise.reject(Error('Timeout'))});
fallback.start();
while(fallback.snapshot().running) await new Promise(resolve=>setTimeout(resolve,1));
assert.match(fallback.snapshot().groups[0].warning, /1 saison/);

const source = await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const context = vm.createContext({URL, HttpError:Error, jellyfinUrl:'http://jellyfin', jellyfinHeaders:()=>({}),
  jellyfinUser:async()=>({Id:'user'}), remote:async url=>({json:async()=>{
    const offset=Number(url.searchParams.get('StartIndex'));
    return {Items:Array.from({length:offset===0?500:13},(_,i)=>({Id:String(offset+i)})),TotalRecordCount:513};
  }})});
vm.runInContext(source.slice(source.indexOf('async function completenessInventory('),source.indexOf('async function completenessFileState(')),context);
assert.equal((await context.completenessInventory()).length, 513, 'Inventory reads all Jellyfin pages');
vm.runInContext(shell.slice(shell.indexOf('  function usesCompactLayout('),shell.indexOf('  function syncViewportProfile(')),context);
for (const [width,touch,expectedCompact] of [[390,false,true],[820,false,true],[1024,false,true],[1180,false,true],[1366,true,true],[1366,false,false],[1440,true,false]]) {
  context.window={innerWidth:width,matchMedia:()=>({matches:touch})};context.document={documentElement:{clientWidth:width}};context.navigator={maxTouchPoints:touch?5:0};
  assert.equal(context.usesCompactLayout(),expectedCompact,`Layout ${width}, touch=${touch}`);
}
assert.match(source, /'\/api\/files'/);
assert.match(shell, /data-file-completeness/);
assert.match(shell, /sequence !== completenessSequence/);
assert.match(shell, /data-file-completeness="movie"/);
assert.match(shell, /data-file-completeness="series"/);
assert.doesNotMatch(shell, /data-completeness-kind/);
vm.runInContext(shell.slice(shell.indexOf('  function completenessOverview('), shell.indexOf('  function completenessGroups(')), context);
const mixedGroups = {groups:[{kind:'movie',status:'incomplete',missingCount:2}, {kind:'series',status:'complete',missingCount:0}, {kind:'series',status:'unknown',missingCount:0}]};
assert.equal(context.completenessOverview(mixedGroups, 'movie').counts.incomplete, 1);
assert.equal(context.completenessOverview(mixedGroups, 'series').groups.length, 2);
assert.equal(context.completenessOverview(mixedGroups, 'series').counts.missing, 0, 'Series counts exclude missing movies');
const seasonMarkup = shell.slice(shell.indexOf('  function renderEpisodeSeason('), shell.indexOf('  async function openEpisodePicker('));
assert.doesNotMatch(seasonMarkup, /data-series-release-all/, 'Series-wide action must not be inside the selected season');
const pickerMarkup = shell.slice(shell.indexOf('  async function openEpisodePicker('), shell.indexOf('  function releaseRow('));
assert.ok(pickerMarkup.indexOf('data-series-release-all') < pickerMarkup.indexOf('noctra-season-tabs'), 'Full-series search precedes all season tabs');
assert.match(pickerMarkup, /if \(initialSeason !== undefined\)/, 'Series with no season still show the full-series action');
console.log('V200 collections: identities, dates, double episodes, partial metadata, pagination, read-only audit and tablet profiles OK');
