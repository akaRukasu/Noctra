// 200.0.130 — tous les serveurs de toutes les sources au clic sur une chaîne,
// comme sur Noctra TV : une source « automatique » (LiveWatch VIP, OHA, WiTV…)
// est dépliée en tous ses serveurs, préfixés du nom de la source, testés et
// classés avec les autres ; une source lente est dépliée à son arrivée ; le
// secours manuel (lecteur public avec publicités) n'est jamais lancé seul.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [shell, unifiedJs, html, server, pkg] = await Promise.all([
  read('public/noctra-shell.js'), read('public/noctra-tv-unified.js'), read('public/client/index.html'), read('server.mjs'), read('package.json')
]);

const context = { localStorage: { getItem: () => null, setItem() {} }, location: { href: 'https://n.test/', origin: 'https://n.test' }, URL, console };
context.window = context;
vm.createContext(context);
vm.runInContext(unifiedJs, context);
const U = context.NoctraTvUnified;
assert.match(U.version, /^200\.0\.13\d$/);
const ranked = [...U.rankServers([
  { label: 'Secours', sourceId: 'a', kind: 'web', manualOnly: true },
  { label: 'Page', sourceId: 'a', kind: 'web', compatPage: true },
  { label: 'Web', sourceId: 'a', kind: 'web' },
  { label: 'Direct', sourceId: 'a', kind: 'native' }
], 'k')].map(item => item.label);
assert.deepEqual(ranked, ['Direct', 'Web', 'Page', 'Secours'], 'Page web et secours manuel après les autres');

// Dépliage des sources « automatiques ».
assert.match(shell, /function tvUnifiedExpand\(server, result\)/);
assert.match(shell, /label: `\$\{server\.label\} · \$\{option\.label\}`/, 'Serveur préfixé du nom de sa source');
assert.match(shell, /result\.serverChoices\.filter\(choice => \(choice\?\.resolveUrl \|\| choice\?\.url \|\| choice\?\.streamUrl\)/, 'Serveurs OHA listés à part');
assert.match(shell, /run\.servers\.splice\(position, 1, \.\.\.fresh\);/);
assert.match(shell, /if \(address && known\.has\(address\)\) return false;/, 'Même flux de deux sources : un seul serveur');
assert.match(shell, /await Promise\.race\(\[Promise\.all\(resolving\.map\(server => server\.resolution\)\), tvUnifiedDelay\(2_500\)\]\);/, 'Liste ouverte sans attendre plus de 2,5 s');
assert.match(shell, /probes\.add\(expandTvUnifiedServer\(run, server, outcome\)\);/, 'Source lente dépliée et testée à son arrivée');
assert.match(shell, /const chosen = run\.servers\.length === 1 && !run\.pending\.size \? 0 : await decideTvUnifiedServer\(run, probes\);/);
// Lecture d'un serveur déplié et secours.
assert.match(shell, /tvState\.resolvedEmbeds = server\.group\.slice\(\);\s*await playTvResolvedOption\(\{ \.\.\.server\.entry\.channel \}, server\.option, server\.optionIndex, playbackSequence,\s*manual && server\.option\.playbackType === 'external'\);/);
assert.match(shell, /const usable = server => !server\.failed && !server\.manualOnly && server\.probeState !== 'down';/, 'Jamais de secours manuel automatique');
assert.match(shell, /if \(!candidate \|\| candidate\.failed \|\| candidate\.manualOnly\) continue;/);
assert.match(shell, /if \(tvUnifiedActive\(\) && tvUnifiedRun\.servers\[tvUnifiedRun\.index\]\?\.option\) \{\s*target\.hidden = true;/, 'Pas de seconde barre de serveurs');

console.log('v200.0.130 : tous les serveurs de toutes les sources, testés et classés : OK');
