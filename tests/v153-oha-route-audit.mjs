import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));

// La route Ligue 1+ fournie/confirmée doit être conservée telle quelle.
assert.ok(server.includes("'https://oha.cx/watch?live=505952112a3ea267236a1'"));

// Toutes les entrées OHA sont inspectées récursivement afin de récupérer une
// vraie route /watch publiée dans le catalogue, même si elle est imbriquée dans
// JSON/JS au lieu d'être dans entry.url.
assert.ok(server.includes('function ohaRouteCandidatesFromValue'));
assert.ok(server.includes('function ohaPublicRouteCandidates'));
assert.ok(server.includes('ohaRouteCandidatesFromValue(entry, rootValue'));

// Une route publiée passe avant /live, mais ids.id ne doit plus servir à
// fabriquer arbitrairement une deep-link qui peut finir sur NOT FOUND.
const candidates = server.slice(server.indexOf('function ohaOfficialPageCandidates'), server.indexOf('async function selectOhaOfficialPage'));
assert.ok(candidates.indexOf('routeCandidates') < candidates.indexOf("add(new URL('/live', root).toString())"));
const publicPage = server.slice(server.indexOf('function ohaCatalogPublicPageUrl'), server.indexOf('function buildOhaCatalog'));
assert.ok(publicPage.includes("return new URL('/live', root).toString()"));
assert.equal(publicPage.includes("/watch?live=${encodeURIComponent(id)}"), false);

// Si une route /watch devient invalide après le boot de la SPA, le bridge doit
// détecter le NOT FOUND côté DOM et revenir automatiquement sur /live, où la
// chaîne est recherchée par son nom/id.
assert.ok(server.includes('function routeLooksMissing()'));
assert.ok(server.includes('function recoverBrokenRoute()'));
assert.ok(server.includes("location.replace(S+'/live')"));
assert.ok(shell.includes("event.data.state === 'route-fallback'"));

console.log('v153 OHA route audit/self-healing regression checks: OK');
