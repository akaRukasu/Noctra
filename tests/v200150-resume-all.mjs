import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// 200.0.150 : tous les titres commencés (60 au plus), plus seulement 12, dans toutes les applis.
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const server = await read('server.mjs');
const start = server.indexOf('function strictResumeItems');
const end = server.indexOf('\n}\n', start) + 3;
const context = vm.createContext({});
vm.runInContext(server.slice(start, end) + '; this.strictResumeItems = strictResumeItems;', context);
const items = Array.from({ length: 40 }, (_, i) => ({ Id: 'i' + i, RunTimeTicks: 1000, UserData: { PlaybackPositionTicks: 100 + i } }));
items.push({ Id: 'vu', RunTimeTicks: 1000, UserData: { PlaybackPositionTicks: 995 } },
  { Id: 'i3', RunTimeTicks: 1000, UserData: { PlaybackPositionTicks: 300 } },
  { Id: 'rewatch', RunTimeTicks: 25_290_560_000, UserData: { Played: true, PlaybackPositionTicks: 7_384_840_000, PlayedPercentage: 29.2 } },
  { Id: 'terminé', UserData: { Played: true, PlaybackPositionTicks: 0 } },
  { Id: 'sans-durée-en-fin', UserData: { PlaybackPositionTicks: 995, PlayedPercentage: 99.5 } });
const result = context.strictResumeItems(items, 60);
assert.equal(result.length, 41, 'titres commencés et revisionnage, sans doublon ni titre terminé');
assert.equal(result.at(-1).Id, 'rewatch');
assert.equal(result.at(-1).UserData.Played, true, 'l’état vu de Jellyfin est conservé');
assert.match(server, /const wanted = Math\.min\(60, Math\.max\(1, Number\(requestUrl\.searchParams\.get\('limit'\)\) \|\| 60\)\);/);
assert.match(server, /Limit: 100, MediaTypes: 'Video'/);
assert.match(server, /const items = strictResumeItems\(rawItems, wanted\);/);

const tv = await read('apps/androidtv/web/app.js');
assert.match(tv, /if \(items\.length > 12\) add\(moreResume, row\('Autres titres à reprendre', items\.slice\(12\)/);
const shell = await read('public/noctra-shell.js');
assert.match(shell, /watch\.resumeItems\(payload\.items, 12\)/);
assert.match(await read('public/noctra-watch-state.js'), /row\.dataset\.noctraWatchRow === 'resume'\s*\?\s*resumeItems\(entries\)/);
assert.match(await read('apps/ios-native/Noctra/Sources/HomeView.swift'), /ItemRow\(title: "Autres titres à reprendre", items: Array\(resume\.dropFirst\(hero\.count\)\), wide: true\)/);
assert.match(await read('apps/android-native/app/src/main/java/com/noctra/mobile/ui/Home.kt'), /ItemRow\("Autres titres à reprendre", model\.resume\.drop\(model\.hero\.size\), wide = true\)/);
console.log('200.0.150 : tous les titres à reprendre (carrousel puis « Autres titres à reprendre ») : OK');
