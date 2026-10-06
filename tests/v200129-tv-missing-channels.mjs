// 200.0.129 — chaînes manquantes dans « Toutes les chaînes » :
// - catalogue livré en plusieurs fois (OHA, LiveWatch en rafraîchissement :
//   « progressive ») redemandé jusqu'à être complet ;
// - chaîne à flux direct gardée même sans type « stream » ;
// - bouquets : 120 par source (français d'abord) au lieu de 60 ;
// - « Chaînes sport » : aussi les chaînes des sources sport ;
// - recherche par les noms d'origine des sources ;
// - chaînes françaises uniquement (pays France, ou rangées « France » par leur source).
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
assert.equal(U.version, '200.0.129');
const merged = U.mergeChannels([
  { source: { id: 'm3u', name: 'Ma liste', section: 'personal' }, channels: [{ name: 'Gulli', streamUrl: '/s/gulli.m3u8' }, { name: 'Sans lien' }] },
  { source: { id: 'sp', name: 'Sports', section: 'sports' }, channels: [{ name: 'Ligue1+ Live', playbackType: 'stream', streamUrl: '/s/l1.m3u8', group: 'Football' }] }
]);
assert.ok(merged.some(channel => channel.name === 'Gulli'), 'Flux direct sans type « stream » : chaîne gardée');
assert.ok(!merged.some(channel => channel.name === 'Sans lien'), 'Chaîne sans aucun lien : écartée');

// Chaînes françaises uniquement.
const french = U.mergeChannels([{ source: { id: 'lw', name: 'LiveWatch', section: 'channels' }, channels: [
  { name: 'beIN SPORTS 1 · SAT · HD', streamUrl: '/a' }, { name: 'Ligue1+ Live', streamUrl: '/e' }, { name: 'beIN SPORTS MAX 5', streamUrl: '/b' }, { name: 'UK: Sky Sports Main Event', streamUrl: '/c' }, { name: 'TF1', streamUrl: '/d' }
] }]);
const country = name => french.find(channel => channel.name.startsWith(name))?.country;
assert.equal(country('beIN SPORTS 1'), 'fr', 'beIN Sports 1 : offre française');
assert.equal(country('beIN SPORTS MAX 5'), 'fr');
assert.equal(country('TF1'), 'fr');
assert.equal(country('Ligue1+'), 'fr', 'Ligue 1+ : française');
assert.equal(country('Sky Sports'), 'uk');
assert.match(shell, /\.filter\(tvUnifiedIsFrench\)\s*\.filter\(channel => !sportOnly \|\| tvUnifiedIsSport\(channel\)\)/, 'Seulement les chaînes françaises');
assert.match(shell, /if \(channel\.country === 'fr'\) return true;\s*if \(channel\.country\) return false;/);
assert.match(shell, /const group = channel\.category \|\| 'Autres';/);

// Catalogues livrés en plusieurs fois.
assert.match(shell, /const TV_UNIFIED_PROGRESSIVE_DELAYS = \[2_500, 5_000, 9_000, 15_000, 24_000, 40_000\];/);
assert.match(shell, /if \(data\?\.progressive\) followProgressive\(job, path\);/);
assert.match(shell, /apiResponseCache\.delete\(path\);\s*cachedApi\(path, 5 \* 60_000, \{ timeoutMs: 45_000 \}\)/, 'Catalogue redemandé sans le cache');
assert.match(shell, /if \(data\?\.progressive\) followProgressive\(job, path, attempt \+ 1\);/);
assert.match(shell, /if \(finishedLoading && tvUnifiedCache\?\.generation !== generation\) return;/, 'Ancien chargement : plus de mise à jour');
assert.match(shell, /tvUnifiedSubscribers\.add\(data => \{\s*if \(!current\(\)\) return false;\s*if \(rendered\) show\(data\);/, 'Liste mise à jour sur place, même après le chargement');
// Bouquets.
assert.match(shell, /const TV_UNIFIED_GROUP_LIMIT = 120;/);
assert.match(shell, /tvUnifiedGroupOrder\(Array\.isArray\(data\?\.groups\) \? data\.groups : \[\]\)\.slice\(0, TV_UNIFIED_GROUP_LIMIT\)/);
assert.match(shell, /\.sort\(\(a, b\) => a\.first - b\.first \|\| a\.index - b\.index\)/, 'Bouquets français d’abord');
// Sport et recherche.
assert.match(shell, /\.filter\(channel => !sportOnly \|\| tvUnifiedIsSport\(channel\)\)/);
assert.match(shell, /tvSourceSection\(entry\.source\) === 'sports'/);
assert.match(shell, /description: \[\.\.\.new Set\(channel\._entries\.map\(entry => String\(entry\.channel\?\.name \|\| ''\)\)/);
// Type de serveur cohérent avec les chaînes gardées.
assert.match(shell, /const kind = item\.playbackType === 'resolver' && item\.resolverUrl \? 'resolve' : item\.streamUrl && item\.playbackType !== 'embed' \? 'native'/);

// Version.
assert.match(pkg, /"version": "200\.0\.129"/);
assert.match(shell, /const NOCTRA_BUILD_VERSION = '200\.0\.129';/);
assert.equal((server.match(/'200\.0\.129'/g) || []).length, 2);
assert.match(html, /noctra-tv-unified\.js\?v=200\.129/);
assert.match(html, /noctra-shell\.js\?v=200\.129/);

console.log('v200.0.129 : chaînes manquantes (catalogues en plusieurs fois, flux sans type, bouquets, sport, recherche) : OK');
