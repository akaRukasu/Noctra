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

// LiveWatch : les familles publiées par LiveWatch restent distinctes dans Chaînes.
for (const [id, name, family] of [
  ['livewatch-north', 'NorthTV', 'north'],
  ['livewatch-frame', 'FrameTV', 'frame']
]) {
  assert.ok(server.includes(`id: '${id}', name: '${name}', section: 'channels'`), `${name} doit être exposé comme source Chaînes dédiée.`);
  assert.ok(server.includes(`family: '${family}'`), `${name} doit conserver sa famille LiveWatch.`);
}
assert.ok(!server.includes("id: 'livewatch-daddy'"), 'DaddyTV ne doit plus être exposé comme source Chaînes.');
assert.ok(server.includes("description: 'Catalogue LiveWatch officiel · sources alternatives séparées'"), 'Le catalogue principal LiveWatch doit rester séparé des familles alternatives.');

// Sports : les wrappers officiels LiveWatch opaques restent des embeds directs
// conformément à la documentation publique. Seul /embed/<id> principal peut
// utiliser le resolver VIP déjà validé.
assert.ok(server.includes('function liveWatchOfficialEmbedUrl(channel)'));
assert.ok(server.includes("['livewatch.top', 'www.livewatch.top'].includes(url.hostname.toLowerCase())"));
assert.ok(server.includes("const vipFamilySource = sourceId === 'livewatch-curated';"));
assert.ok(server.includes("if (status.active && vipFamilySource && reference && reference.kind === 'main')"));
assert.ok(server.includes("playbackType: 'resolver'") && server.includes('/api/tv/livewatch/resolve/${reference.kind}/'));
assert.ok(server.includes("label: 'VIP Premium · direct'"));

// OHA : le shell distant est une SPA. La page proxy Noctra ne doit jamais
// laisser son pathname /api/tv/oha/embed/... être interprété par le routeur OHA.
assert.ok(server.includes('function ohaPublicRouteCandidates'));
assert.ok(server.includes("'https://oha.cx/watch?live=505952112a3ea267236a1'"));
assert.ok(server.includes('const externalUrl = ohaCatalogPublicPageUrl(item, root)'), 'Une chaîne OHA doit privilégier la vraie page publique de son entrée plutôt qu’un ids.id supposé.');
assert.ok(server.includes("add(new URL('/live', root).toString())"), 'La route /live doit rester un fallback OHA.');
assert.ok(server.includes("add(new URL('/', root).toString())"), 'La racine OHA doit rester un fallback quand /watch ou /live change ou redirige.');
assert.ok(server.includes("return { url: new URL('/', safeTvRemoteUrl(reference?.meta?.root || 'https://oha.cx/live')).toString()"), 'Le dernier fallback OHA doit être une route publique sûre, pas une deep-link supposée.');
assert.ok(server.includes("const remoteRoute = `${page.pathname || '/'}${page.search || ''}${page.hash || ''}`"));
assert.ok(server.includes("R=${JSON.stringify(remoteRoute)}"));
assert.ok(server.includes("history.replaceState(history.state,'',R)"));

console.log('v113 LiveWatch sources/VIP Sports + OHA SPA routes regression checks passed');
