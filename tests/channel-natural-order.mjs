import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// 200.0.153 (site, Noctra TV), iOS 2.18.6, Android 1.9.11 : chaînes réunies dans l'ordre des
// nombres. Le tri comparait les noms caractère par caractère : « A LA CARTE 10 » passait avant
// « A LA CARTE 2 », « C+Live 11 » avant « C+Live 2 », « 750G » avant « 7A Limoges ».
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const shuffled = ['C+Live 2', 'A LA CARTE 10', 'C+Live 11', '750G', 'A LA CARTE 2', 'A12 TV', 'A LA CARTE 1', '7A Limoges', 'A7C', 'C+Live 1', 'AMAZON PRIME 8', 'AMAZON PRIME 1', 'TF1'];
const expected = ['7A Limoges', '750G', 'A LA CARTE 1', 'A LA CARTE 2', 'A LA CARTE 10', 'A7C', 'A12 TV', 'AMAZON PRIME 1', 'AMAZON PRIME 8', 'C+Live 1', 'C+Live 2', 'C+Live 11', 'TF1'];
for (const path of ['public/noctra-tv-unified.js', 'apps/androidtv/web/app.js']) {
  const source = await read(path);
  const start = source.indexOf('  function normalize(value) {');
  const end = source.indexOf('\n  }\n', source.indexOf('  function sortKey(value) {')) + 4;
  assert.ok(start >= 0 && end > start, path);
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + '\nglobalThis.sortKey = sortKey;', context);
  const sorted = shuffled.map(name => ({ name, _sort: context.sortKey(name) })).sort((a, b) => a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0).map(item => item.name);
  assert.deepEqual(sorted, expected, path);
  assert.match(source, /list\.forEach\(function \(unified\) \{ unified\._sort = sortKey\(unified\.name\); \}\);/, path + ' : chaînes réunies');
  assert.ok(!/=>/.test(source.slice(start, end)), path + ' : ES5 (téléviseurs anciens)');
}
const swiftNames = await read('apps/ios-native/Noctra/Sources/LiveNames.swift');
const swiftViews = await read('apps/ios-native/Noctra/Sources/LiveTVViews.swift');
assert.match(swiftNames, /static func sortKey\(_ value: String\) -> String \{[\s\S]*?String\(repeating: "0", count: max\(0, 6 - digits\.count\)\) \+ digits/);
assert.match(swiftViews, /channels\.map \{ \(\$0\.id, ChannelNaming\.sortKey\(\$0\.name\)\) \}/, 'iOS : chaînes réunies');
const kotlinNames = await read('apps/android-native/app/src/main/java/com/noctra/mobile/live/LiveNames.kt');
const kotlinStore = await read('apps/android-native/app/src/main/java/com/noctra/mobile/live/LiveStore.kt');
assert.match(kotlinNames, /fun sortKey\(value: String\): String = sortDigits\.replace\(normalize\(value\)\) \{ it\.value\.padStart\(6, '0'\) \}/);
assert.match(kotlinStore, /\.sortedBy \{ ChannelNaming\.sortKey\(it\.name\) \}/, 'Android : chaînes réunies');
console.log('Chaînes réunies dans l\'ordre des nombres (site, Noctra TV, iOS, Android) : OK');
