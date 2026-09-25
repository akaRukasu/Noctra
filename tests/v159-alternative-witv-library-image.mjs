import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));
assert.ok(server.includes("version: '200.0.21'"));

const alternativeStart = server.indexOf('async function proxyAlternativeBrowser');
const alternativeEnd = server.indexOf('function parseHalouleAlternatives', alternativeStart);
assert.ok(alternativeStart >= 0 && alternativeEnd > alternativeStart, 'Le navigateur Alternative doit être extractible.');
const alternativeSource = server.slice(alternativeStart, alternativeEnd);
assert.equal(alternativeSource.includes('sandbox="'), false, 'Alternative ne doit pas sandboxer les lecteurs qui refusent ce mode.');
assert.ok(alternativeSource.includes('Ouvrir dehors'), 'Alternative doit garder le bouton de secours externe.');

const wiServerStart = server.indexOf('async function resolveTvPageReference');
const wiServerEnd = server.indexOf('const wiTvCategories', wiServerStart);
const wiSource = server.slice(wiServerStart, wiServerEnd);
assert.ok(
  wiSource.indexOf("label: `${option.label || 'Serveur'} · HLS`") < wiSource.indexOf("label: `${option.label || 'Serveur'} · lecteur web`"),
  'WiTV doit présenter le HLS validé avant le lecteur web.'
);
const resolverStart = shell.indexOf('async function resolveAndPlayTvChannel');
const resolverEnd = shell.indexOf('function updateTvCastButton', resolverStart);
const resolverSource = shell.slice(resolverStart, resolverEnd);
assert.equal(resolverSource.includes('const firstWeb = options.findIndex'), false, 'WiTV ne doit plus forcer le lecteur web par défaut.');

assert.ok(theme.includes('.homePage .noctra-my-media-section .cardImageContainer img'), 'Les images de Mes médias doivent être ciblées.');
assert.match(theme, /\.homePage \.noctra-my-media-section \.cardImage[\s\S]*?object-fit:\s*cover !important;/);
assert.match(theme, /\.homePage \.noctra-my-media-section \.cardImageContainer[\s\S]*?height:\s*100% !important;/);

console.log('v160 legacy Alternative/WiTV/images médiathèque checks: OK');
