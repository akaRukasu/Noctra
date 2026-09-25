import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));

// L'ordre de l'univers Chaînes doit rester celui demandé, indépendamment de
// l'ordre historique des tableaux LiveWatch/complementary.
const priorities = [
  "['livewatch-curated', 0]",
  "['fstv-public', 1]",
  "['oha-live', 2]",
  "['livewatch-north', 3]",
  "['witv-public', 4]",
  "['livewatch-frame', 5]"
];
let previous = -1;
for (const token of priorities) {
  const index = server.indexOf(token);
  assert.ok(index > previous, `Priorité absente ou mal ordonnée: ${token}`);
  previous = index;
}
assert.ok(!server.includes("id: 'livewatch-daddy', name: 'Daddy TV', section: 'channels'"));

// Sur iPhone/iPad, NorthTV utilise WebKit natif pour commencer à décoder ses
// gros segments plus tôt ; les autres directs Premium conservent MMS/HLS.js.
assert.ok(shell.includes('const appleNativeFirst = appleTouch && /^NorthTV$/i.test(playbackProvider);'));
assert.ok(shell.includes('&& !appleNativeFirst'));
assert.ok(shell.includes('NorthTV · reprise avec le lecteur HLS compatible iOS…'));
assert.ok(shell.includes('hlsOptions.preferManagedMediaSource = true'));
assert.ok(shell.includes("/^(?:LiveWatch|NorthTV|FrameTV)$/i.test(playbackProvider)"));
assert.ok(shell.includes('if (refreshResolvedStream(provider)) return;'));
assert.ok(shell.includes("startNativeHls('Compatibilité iOS · essai du moteur HLS natif…')"));
assert.ok(shell.includes('livewatch-refresh-failed'));

console.log('v114 TV family iOS playback + source order regression checks passed');
