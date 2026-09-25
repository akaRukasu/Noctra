import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("const desktopWorkspacePanels = new Set(['files'])"), 'Discovery doit revenir dans un panneau desktop intégré.');
assert.ok(server.includes('preventSearch: Boolean('), 'Les destinations Jellyseerr doivent exposer preventSearch.');
assert.ok(shell.includes('data-request-download-mode') && shell.includes("selectionMode: fields.get('selectionMode') === 'manual' ? 'manual' : 'auto'"), 'Le formulaire doit proposer le choix auto/manuel.');
assert.ok(server.includes("selectionMode === 'manual' ? server.preventSearch : !server.preventSearch"), 'Le serveur doit router le mode manuel vers une destination preventSearch.');
assert.ok(server.includes("path === '/api/media/detail'"), 'Une API de fiche média doit être disponible.');
assert.ok(shell.includes('data-media-detail-layer') && shell.includes('data-media-detail-refresh'), 'Les fiches média doivent afficher les torrents et pouvoir être actualisées.');
assert.ok(shell.includes("label.textContent = unknown ? 'Torrents : à vérifier' : `Torrents : ${count}`"), 'Un zéro confirmé se distingue d’une recherche en échec.');
assert.ok(shell.includes('Torrents : ${torrentCount}'), 'La fiche média doit exposer le compteur torrent, zéro compris.');
assert.ok(css.includes('Noctra V109 — Demandes / Discovery'), 'La couche responsive V109 doit être présente.');
console.log('Demandes manuelles, fiches média et Discovery intégré Noctra v109 : OK');
