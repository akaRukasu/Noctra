import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Noctra TV 1.1.55 : chaînes réunies servies par les vrais serveurs des sources
// (« LiveWatch · Basic »…), plus par un « LiveWatch · automatique » découvert au
// lancement. Une source muette, vide ou en erreur est retirée ; les entrées
// automatiques ne restent qu'en dernier recours. 16 serveurs vérifiés.
const app = await readFile(new URL('../apps/androidtv/web/app.js', import.meta.url), 'utf8');
function between(a, b) { const start = app.indexOf(a), end = app.indexOf(b, start + a.length); assert(start >= 0 && end > start, a); return app.slice(start, end); }
const code = [
  between('  function optionKind(option) {', '  function optionLabel('),
  between('  var RESOLVE_WAIT_MS = 20000;', '  function serverList('),
  between('  function inheritSource(item, parent) {', '\n  }\n') + '\n  }\n'
].join('\n').replace('var RESOLVE_WAIT_MS = 20000;', 'var RESOLVE_WAIT_MS = 300;').replace('var RESOLVE_GRACE_MS = 1500;', 'var RESOLVE_GRACE_MS = 80;');
const answers = {
  '/lw': () => Promise.resolve([{ playbackType: 'stream', streamUrl: '/s/basic', label: 'Basic' }, { playbackType: 'stream', streamUrl: '/s/vip', label: 'VIP' }]),
  '/oha': () => Promise.reject(new Error('502')),
  '/mute': () => new Promise(() => {}),
  '/empty': () => Promise.resolve([]),
  '/slow': () => new Promise(resolve => setTimeout(() => resolve([{ playbackType: 'stream', streamUrl: '/s/slow', label: 'Lent' }]), 200))
};
const context = { setTimeout, clearTimeout, Promise, resolveOptions: url => answers[url]() };
vm.createContext(context);
vm.runInContext(code + '\nglobalThis.expandOptions = expandOptions;', context);
const auto = (prefix, url) => ({ playbackType: 'resolver', resolveUrl: url, label: prefix + ' · automatique', _prefix: prefix });
const progress = [];
const list = await context.expandOptions([
  { playbackType: 'stream', streamUrl: '/s/tnt', label: 'TNT · Flux direct', _prefix: 'TNT' },
  auto('LiveWatch', '/lw'), auto('OHA', '/oha'), auto('WiTV', '/mute'), auto('Vavoo', '/empty')
], (done, total) => progress.push(done + '/' + total));
assert.deepEqual(Array.from(list, option => option.label), ['TNT · Flux direct', 'LiveWatch · Basic', 'LiveWatch · VIP'], 'vrais serveurs des sources, sources muettes retirées');
assert.ok(list.every(option => !option.resolveUrl || option.streamUrl), 'aucun serveur « automatique »');
assert.equal(list[1].renewUrl, '/lw', 'liens renouvelables par la source');
// Source muette : plus attendue (délai de grâce), son avancement arrive après.
assert.deepEqual(progress, ['0/4', '1/4', '2/4', '3/4'], 'avancement affiché source par source');
const fallback = await context.expandOptions([auto('OHA', '/oha'), auto('WiTV', '/mute')]);
assert.deepEqual(Array.from(fallback, option => option.label), ['OHA · automatique', 'WiTV · automatique'], 'aucune source n’a répondu : dernier recours');
// 1.1.57 : la source la plus lente n'est plus attendue. Une source a répondu :
// les autres ont encore le délai de grâce, les retardataires arrivent ensuite.
const late = [];
const began = Date.now();
const quick = await context.expandOptions([auto('LiveWatch', '/lw'), auto('Slow', '/slow')], null, items => late.push(...items));
assert.ok(Date.now() - began < 170, 'lancement sans attendre la source lente');
assert.deepEqual(Array.from(quick, option => option.label), ['LiveWatch · Basic', 'LiveWatch · VIP']);
await new Promise(resolve => setTimeout(resolve, 250));
assert.deepEqual(late.map(option => option.label), ['Slow · Lent'], 'serveurs de la source lente ajoutés ensuite');
assert.match(app, /var RESOLVE_GRACE_MS = 1500;/);
assert.match(app, /fillPicker\(sheet, playback, trusted \? 1 : 2\);/);
assert.match(app, /var deadline = Date\.now\(\) \+ 4000;/);
assert.match(app, /\}, addLate\)\.then\(function \(options\) \{/);
assert.match(app, /state\.options\.forEach\(function \(option, index\) \{ if \(index < 16\) enqueue\(index, 16\); \}\);/, '16 serveurs vérifiés');
// 1.1.59 : test raté refait une fois, jamais compté comme un échec de lecture ;
// serveurs des sources lentes ajoutés à la fenêtre ouverte (et vérifiés).
assert.match(app, /if \(detail !== 'down'\) return detail;\s*return later\(800\)\.then\(function \(\) \{ return probeOption\(option\); \}\);/);
assert.ok(!/recordHealth\(state, index, false\)/.test(app), 'test de disponibilité hors de l’historique');
assert.match(app, /var HEALTH_KEY = 'noctra-tv-health-v3';/);
assert.match(app, /if \(state\.options\.length > from\) addPickerRows\(sheet, state, from\);/);
assert.match(app, /return target\._entries \|\| resolvers \? expandOptions\(options, onProgress, onLate\) : options;/);
assert.match(app, /sheet\.status\('Serveurs fournis par les sources : ' \+ done \+ ' \/ ' \+ total \+ '…'\)/);
console.log('Noctra TV 1.1.59 : vrais serveurs des sources (20 s par source), sources muettes retirées, tests refaits hors historique : OK');
