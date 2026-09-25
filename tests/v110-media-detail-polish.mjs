import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes('<span>Torrents : …</span>'), 'Avant vérification, le bouton torrent doit afficher un état explicite.');
assert.ok(shell.includes("label.textContent = unknown ? 'Torrents : à vérifier' : `Torrents : ${count}`"), 'Le compteur distingue zéro résultat et échec de recherche.');
assert.ok(!shell.includes('Torrents live'), 'Le libellé générique Torrents live ne doit plus remplacer le zéro.');
assert.ok(shell.includes('noctra-media-detail-info-grid'), 'La fiche doit proposer des blocs d’informations enrichis.');
assert.ok(shell.includes('noctra-media-detail-cast-list'), 'La distribution doit être visible dans la fiche.');
assert.ok(shell.includes('noctra-media-detail-live-count'), 'La disponibilité torrent doit être intégrée dans le résumé de la fiche.');
assert.ok(shell.includes('Bande-annonce') && shell.includes('IMDb'), 'La fiche doit exposer les liens externes utiles quand ils existent.');
assert.ok(server.includes('credits,videos,release_dates,keywords,external_ids'), 'Les films doivent charger les métadonnées TMDB enrichies.');
assert.ok(server.includes('credits,videos,content_ratings,keywords,external_ids'), 'Les séries doivent charger les métadonnées TMDB enrichies.');
assert.ok(server.includes('productionCompanies') && server.includes('numberOfSeasons') && server.includes('nextEpisode'), 'Le serveur doit exposer production et informations série détaillées.');
assert.ok(css.includes('Noctra V110 — fiche média enrichie'), 'La couche visuelle V110 doit être présente.');
assert.ok(css.includes('.noctra-media-detail-hero-grid') && css.includes('.noctra-media-detail-info-grid'), 'La nouvelle intégration responsive de la fiche doit être active.');
console.log('Fiche média enrichie et compteurs torrents Noctra v110 : OK');
