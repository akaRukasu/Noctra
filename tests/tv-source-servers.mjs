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
  between('  var RESOLVE_WAIT_MS = 9000;', '  function serverList('),
  between('  function inheritSource(item, parent) {', '\n  }\n') + '\n  }\n'
].join('\n').replace('var RESOLVE_WAIT_MS = 9000;', 'var RESOLVE_WAIT_MS = 300;');
const answers = {
  '/lw': () => Promise.resolve([{ playbackType: 'stream', streamUrl: '/s/basic', label: 'Basic' }, { playbackType: 'stream', streamUrl: '/s/vip', label: 'VIP' }]),
  '/oha': () => Promise.reject(new Error('502')),
  '/mute': () => new Promise(() => {}),
  '/empty': () => Promise.resolve([])
};
const context = { setTimeout, Promise, resolveOptions: url => answers[url]() };
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
assert.deepEqual(progress, ['0/4', '1/4', '2/4', '3/4', '4/4'], 'avancement affiché source par source');
const fallback = await context.expandOptions([auto('OHA', '/oha'), auto('WiTV', '/mute')]);
assert.deepEqual(Array.from(fallback, option => option.label), ['OHA · automatique', 'WiTV · automatique'], 'aucune source n’a répondu : dernier recours');
assert.match(app, /state\.options\.slice\(0, 16\)\.forEach/, '16 serveurs vérifiés');
assert.match(app, /sheet\.status\('Serveurs fournis par les sources : ' \+ done \+ ' \/ ' \+ total \+ '…'\)/);
console.log('Noctra TV 1.1.55 : vrais serveurs des sources (plus de serveur « automatique »), sources muettes retirées : OK');
