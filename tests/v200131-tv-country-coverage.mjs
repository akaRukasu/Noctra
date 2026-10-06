// 200.0.131 — serveurs manquants sous une chaîne réunie : le pays iptv-org,
// deviné par le serveur d'après le nom (« beIN Sports 1 » existe aussi au
// Qatar), passait avant les indications explicites ; la même chaîne devenait
// étrangère dans certaines sources et n'était plus réunie. Il passe désormais
// après « FR: », drapeau, pays de la source et marques françaises connues.
// Apport de chaque source affiché sous le titre de la liste réunie.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [shell, unifiedJs, dataJs, html, server, pkg] = await Promise.all([
  read('public/noctra-shell.js'), read('public/noctra-tv-unified.js'), read('public/noctra-tv-data.js'),
  read('public/client/index.html'), read('server.mjs'), read('package.json')
]);
const context = { localStorage: { getItem: () => null, setItem() {} }, location: { href: 'https://n.test/', origin: 'https://n.test' }, URL, console };
context.window = context;
vm.createContext(context);
vm.runInContext(dataJs, context);
vm.runInContext(unifiedJs, context);
const U = context.NoctraTvUnified;
assert.equal(U.version, '200.0.131');

const src = id => ({ id, name: id, section: 'channels' });
const merged = U.mergeChannels([
  { source: src('Movix'), channels: [{ name: 'beIN Sport 1', streamUrl: '/a', iptvOrgId: 'BeINSports1.qa', iptvOrgCountry: 'QA' }] },
  { source: src('LiveWatch'), channels: [{ name: 'beIN SPORTS 1 · SAT · HD', resolverUrl: '/r/1', playbackType: 'resolver' }] },
  { source: src('OHA'), channels: [{ name: 'FR: BEIN SPORTS 1 FHD', streamUrl: '/b', iptvOrgCountry: 'QA' }] },
  { source: src('Daddy'), channels: [{ name: 'beIN Sports MENA 1', streamUrl: '/c' }, { name: 'AR: beIN Sports 1', streamUrl: '/d' }] },
  { source: src('Liste'), channels: [{ name: 'Al Jazeera', streamUrl: '/e', iptvOrgCountry: 'QA' }, { name: 'TV Inconnue', streamUrl: '/f', iptvOrgCountry: 'DE' }] }
]);
const bein = merged.filter(channel => channel.country === 'fr' && /bein/i.test(channel.name));
assert.equal(bein.length, 1, 'Une seule chaîne beIN Sports 1 française');
assert.deepEqual([...new Set(bein[0]._entries.map(entry => entry.source.name))].sort(), ['LiveWatch', 'Movix', 'OHA'], 'Serveurs des trois sources réunis');
assert.ok(merged.some(channel => /mena/i.test(channel.name) && channel.country === 'arab'), 'beIN MENA reste étrangère');
assert.ok(merged.some(channel => channel._entries.some(entry => entry.channel.name === 'AR: beIN Sports 1') && channel.country === 'arab'), '« AR: » explicite reste étrangère');
assert.equal(merged.find(channel => channel._entries.some(entry => entry.channel.name === 'TV Inconnue'))?.country, 'de', 'Sans autre indice, le pays iptv-org reste utilisé');

assert.match(unifiedJs, /found = countryOfCode\(channel\.country\) \|\| countryOfWords\(channel\.country\);/);
assert.match(unifiedJs, /if \(FRENCH_BRANDS\.test\(brandName\(name\)\)\) return 'fr';\s*found = countryOfCode\(channel\.iptvOrgCountry\);/, 'Marques françaises avant le pays iptv-org');

// Apport de chaque source sous le titre.
assert.match(shell, /coverage\[part\.source\.name\] = \(coverage\[part\.source\.name\] \|\| 0\) \+ part\.channels\.filter\(channel => unifiedApi\.keepChannel\(channel, part\.source\)\)\.length;/);
assert.match(shell, /`\$\{coverage\.length\} sources réunies : \$\{coverage\.map/);
assert.match(shell, /source: coverageText \? \{ \.\.\.selected, description: coverageText \} : selected,/);

assert.match(pkg, /"version": "200\.0\.131"/);
assert.match(shell, /const NOCTRA_BUILD_VERSION = '200\.0\.131';/);
assert.equal((server.match(/'200\.0\.131'/g) || []).length, 2);
assert.ok(!html.includes('v=200.130') && html.includes('noctra-shell.js?v=200.131'));
console.log('v200.0.131 : pays des chaînes fiable (sources réunies) et apport de chaque source : OK');
