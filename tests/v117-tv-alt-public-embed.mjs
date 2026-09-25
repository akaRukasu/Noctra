import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("liveWatchMandatoryAd: ['daddy', 'north', 'frame'].includes(sourceFamily)"));
assert.ok(server.includes("streamKind: `${familyLabel} · lecteur officiel`"));
assert.ok(shell.includes("lecteur officiel chargé · débloque la chaîne dans le lecteur"));
assert.ok(server.includes("vipFallbackUrl: officialEmbed"), 'Le public doit rester un secours manuel quand le VIP est actif.');
assert.ok(shell.includes("valide l’étape intégrée pour lancer la lecture"));
console.log('v117/v119 public official embed checks passed');
