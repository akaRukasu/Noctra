// 200.0.133 — « Chaîne introuvable » dans le lecteur LiveWatch (livewatch.icu) :
// les sous-domaines LiveWatch (API, médias) passent par le pont VIP comme le
// site lui-même ; diagnostic des hôtes réellement utilisés par le site.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [server, shell, html, pkg] = await Promise.all([read('server.mjs'), read('public/noctra-shell.js'), read('public/client/index.html'), read('package.json')]);

const start = server.indexOf('const liveWatchOrigin =');
const end = server.indexOf('// Lien LiveWatch d\'un ancien domaine');
const hosts = Function('withoutSlash', 'process', `${server.slice(start, end)}; return { isLiveWatchHost, isLiveWatchFamilyHost, liveWatchBaseDomains };`)(
  value => String(value || '').replace(/\/+$/, ''), { env: {} }
);
assert.deepEqual([...hosts.liveWatchBaseDomains].sort(), ['livewatch.icu', 'livewatch.top']);
for (const host of ['livewatch.icu', 'www.livewatch.icu', 'api.livewatch.icu', 'cdn.media.livewatch.icu', 'api.livewatch.top']) assert.ok(hosts.isLiveWatchFamilyHost(host), host);
for (const host of ['livewatch.icu.evil.com', 'evillivewatch.icu', 'example.com']) assert.ok(!hosts.isLiveWatchFamilyHost(host), host);
assert.ok(!hosts.isLiveWatchHost('api.livewatch.icu'), 'Lecteurs et catalogues : domaine principal uniquement');

assert.match(server, /return isLiveWatchFamilyHost\(host\) \|\| host === supabaseHost;/, 'Pont : sous-domaines LiveWatch autorisés');
assert.match(server, /const isLiveWatch = officialTarget && isLiveWatchFamilyHost\(target\.hostname\.toLowerCase\(\)\);/);
assert.match(server, /origin: isSupabase \|\| externalMedia \|\| !isLiveWatchHost\(target\.hostname\) \? liveWatchOrigin : target\.origin,/);
assert.match(server, /LD=\$\{JSON\.stringify\(liveWatchBaseDomains\)\}/);
assert.match(server, /if\(LD\.some\(d=>u\.hostname===d\|\|u\.hostname===\('www\.'\+d\)\|\|u\.hostname\.endsWith\('\.'\+d\)\)\)return T\+'\?url='\+encodeURIComponent\(u\.href\);/, 'Appels du lecteur vers un sous-domaine : par le tunnel');
assert.match(server, /async function liveWatchSiteHosts\(\)/);
assert.match(server, /liveWatchSiteHosts\(\)\.catch\(error => \(\{ errors: \[cleanError\(error\)\] \}\)\)/);
assert.match(server, /checks,\s*site,/);

assert.match(pkg, /"version": "200\.0\.133"/);
assert.match(shell, /const NOCTRA_BUILD_VERSION = '200\.0\.133';/);
assert.equal((server.match(/'200\.0\.133'/g) || []).length, 2);
assert.ok(!html.includes('v=200.132') && html.includes('noctra-shell.js?v=200.133'));
console.log('v200.0.133 : sous-domaines LiveWatch relayés, diagnostic des hôtes du site : OK');
