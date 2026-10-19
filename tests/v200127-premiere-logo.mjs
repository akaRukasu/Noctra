// 200.0.127 — l'affiche d'accueil « Continuer à regarder » affiche le logo de
// l'œuvre à la place du titre, comme la version TV. Les logos sont chargés et
// décodés d'avance (aucun délai à la rotation) ; sans logo, le titre reste.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const css = await readFile(new URL('public/noctra-aurora.css', root), 'utf8');

assert.match(shell, /<h1><img class="noctra-premiere-logo" alt="" decoding="async" hidden><span class="noctra-premiere-title-text"><\/span><\/h1>/);
assert.match(shell, /const premiereLogos = new Map\(\);\s*function preloadPremiereLogo\(url\)/);
assert.match(shell, /image\.decode\?\.\(\)/, 'Logo décodé avant affichage');
assert.match(shell, /if \(premiereLogos\.size > 60\)/, 'Cache borné');
assert.match(shell, /const logoTag = item\.ImageTags\?\.Logo \|\| item\.ParentLogoImageTag \|\| '';/);
assert.match(shell, /const logoId = item\.ImageTags\?\.Logo \? item\.Id : item\.ParentLogoItemId \|\| '';/);
assert.match(shell, /type: 'Logo', tag: logoTag/);
assert.ok((shell.match(/preloadPremiereLogo\(entry\.logo\)\)/g) || []).length >= 3, 'Préchargement à l’ouverture, au rafraîchissement et à la réception');
assert.match(shell, /if \(entry\?\.ready\) return display\(\);/, 'Logo prêt : affiché sans attendre');
assert.match(shell, /premiere\.dataset\.logo = 'pending';\s*logoFallbackTimer = window\.setTimeout\([^]*?, 700\);/);
assert.match(shell, /if \(disposed \|\| items\[index\]\?\.id !== item\.id\) return;/, 'Pas de logo d’un autre titre');
assert.match(shell, /text\('\.noctra-premiere-title-text', item\.title\)/);

const block = css.slice(css.indexOf('200.0.127'));
assert.ok(block.length > 0 && css.includes('200.0.127'));
assert.match(block, /\.noctra-premiere-logo/);
assert.match(block, /\[data-logo="true"\]/);
assert.match(block, /\[data-logo="pending"\]/);

console.log('v200.0.127 : logo de l’œuvre sur l’affiche d’accueil, préchargé, repli texte : OK');
