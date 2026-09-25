import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const recent=new Function('safeTvRemoteUrl','resolveTvUrl',extract('function tvRecentPlaylistProbeUri(', '\nasync function validateWiTvHlsStream(')+';return tvRecentPlaylistProbeUri;')(u=>new URL(u),(u,b)=>new URL(u,b).href);
const master='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000\nhigh.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow.m3u8';
const playlist='#EXTM3U\n#EXTINF:4,\nexpired.ts\n#EXTINF:4,\nrecent.ts\n#EXTINF:4,\nlatest.ts';
async function check(status){const calls=[];const probe=async url=>{calls.push(url);if(url.endsWith('master.m3u8'))return {kind:'playlist',url,text:master};if(url.endsWith('low.m3u8'))return {kind:'playlist',url,text:playlist};if(url.endsWith('recent.ts')&&status)throw Object.assign(Error('probe failed'),{status});return {kind:'media',url};};
 const validate=new Function('tvReferences','HttpError','liveWatchProbeResponse','tvRecentPlaylistProbeUri',extract('async function validateLiveWatchStreamReference(', '\nfunction liveWatchComparableName(')+';return validateLiveWatchStreamReference;')(new Map([['test',{url:'https://media.example/master.m3u8'}]]),Error,probe,recent);
 if(status===403)await assert.rejects(validate('test'));else assert.equal(await validate('test'),true);
 assert.ok(!calls.some(x=>x.endsWith('expired.ts')||x.endsWith('high.m3u8')));
 assert.equal(calls.some(x=>x.endsWith('latest.ts')),[404,410].includes(status));
}
for(const status of [0,404,410,403])await check(status);
assert.equal(recent('#EXTM3U\n#EXT-X-GAP\nmissing.ts\n#EXTINF:4,\nvalid.ts','https://media.example/'), 'https://media.example/valid.ts');
console.log('LiveWatch: recent media, bounded expired-segment retry, gap exclusion and no authorization retry passed');
