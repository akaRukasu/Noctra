import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const server = await readFile(new URL('server.mjs', root), 'utf8');
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const theme = await readFile(new URL('public/noctra-theme.css', root), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("['year', 'Top de l’année']"));
assert.ok(shell.includes('Top de l’année ${escapeHtml(year)}'));
assert.ok(shell.includes("presentation.title,\n          'missing'"));
assert.ok(shell.includes('Ajouter quand même'));
assert.ok(theme.includes('Noctra V198 - Top de l\'annee plus lisible et moins dense.'));
assert.ok(theme.includes('.noctra-annual-discovery') && theme.includes('gap: 30px'));
assert.ok(theme.includes('.noctra-annual-section .noctra-smart-rail'));
assert.ok(server.includes("const storageKey = 'livewatch-auth'"));
assert.equal(shell.includes("startPublicFallback('session VIP non reconnue')"), false);
assert.equal(shell.includes("startPublicFallback('aucune image VIP après 16 secondes')"), false);
assert.ok(shell.includes('le lecteur public reste disponible manuellement'));

console.log('Noctra v198 - top annuel, statuts torrents et VIP LiveWatch : OK');
