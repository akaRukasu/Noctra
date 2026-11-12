import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Multiview de Noctra TV piloté depuis le téléphone : pont web (LG webOS, Samsung Tizen) et appli Android TV.
const bridge = await readFile(new URL('../apps/androidtv/web/tv-native.js', import.meta.url), 'utf8');
const start = bridge.indexOf('  var Multiview = {');
const end = bridge.indexOf('  handlers.push({ active: function () { return Boolean(Multiview.node); }');
const sent = [];
const node = () => ({ appendChild() {}, remove() {}, focus() {}, classList: { toggle() {} }, addEventListener() {}, setAttribute() {}, getAttribute() { return ''; }, style: {} });
const context = vm.createContext({
  MULTI_MAX: 12, ORSAY: null, sent, send: message => sent.push(message), keepScreenOn() {},
  document: { body: node(), activeElement: null }, setTimeout() {}, clearTimeout() {},
  el: () => node(), Engine: function () { this.destroy = () => {}; this.load = () => Promise.resolve(); }, listKeys() {}, is() { return false; },
  noctraFetch: () => Promise.resolve({})
});
vm.runInContext(bridge.slice(start, end) + '; this.Multiview = Multiview;', context);
const Multiview = context.Multiview;
// Lecture et disposition remplacées : seul l'état piloté est vérifié ici.
Multiview.play = () => {};
Multiview.arrange = () => {};
const option = { label: 'Flux', url: 'https://example.test/a.m3u8' };
Multiview.open([{ title: 'TF1', options: [option] }, { title: 'M6', options: [option] }], []);
let state = sent.at(-1).state;
assert.equal(sent.at(-1).type, 'multiviewState');
assert.deepEqual(Array.from(state.tiles, tile => tile.title), ['TF1', 'M6']);
assert.equal(state.audio, 0);
Multiview.remote({ command: 'add', item: { title: 'Arte', options: [option] } });
assert.equal(sent.at(-1).state.tiles.length, 3);
Multiview.remote({ command: 'solo', index: 2 });
state = sent.at(-1).state;
assert.equal(state.audio, 2, 'son sur la chaîne mise en avant');
assert.equal(state.featured, 2);
Multiview.remote({ command: 'grid' });
assert.equal(sent.at(-1).state.featured, -1);
Multiview.remote({ command: 'remove', index: 0 });
assert.deepEqual(Array.from(sent.at(-1).state.tiles, tile => tile.title), ['M6', 'Arte']);
Multiview.remote({ command: 'remove', index: 9 });
assert.equal(sent.at(-1).state.tiles.length, 2, 'index hors limites ignoré');
Multiview.remote({ command: 'close' });
assert.equal(sent.at(-1).state.tiles.length, 0);
console.log('Multiview LG/Samsung piloté depuis le téléphone : ajout, son, mise en avant, retrait, fermeture vérifiés.');

const activity = await readFile(new URL('../apps/androidtv/java/com/noctra/tv/NoctraMultiviewActivity.java', import.meta.url), 'utf8');
const home = await readFile(new URL('../apps/androidtv/java/com/noctra/tv/NoctraHomeActivity.java', import.meta.url), 'utf8');
for (const command of ['"add"', '"remove"', '"audio"', '"feature"', '"solo"', '"close"', '"grid"']) assert.ok(activity.includes(`command.equals(${command})`), command);
assert.match(activity, /static void remote\(final JSONObject message\)/);
assert.match(activity, /if \(active == this\) publish\(\);/, 'état renvoyé après chaque changement');
assert.match(home, /action\.equals\("multiviewCommand"\)/);
assert.match(home, /message\.put\("type", "multiviewState"\)/);
console.log('Multiview Android TV piloté depuis le téléphone : commandes et état vérifiés.');
