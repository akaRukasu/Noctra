import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { discoveryCatalogPage } from '../lib/discovery-pagination.mjs';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21', 'Le paquet doit annoncer la v87.');

assert.ok(server.includes('function seerrDiscoveryConfigured()'), 'Le moteur discovery doit détecter Seerr/Jellyseerr.');
assert.ok(server.includes('function discoveryMetadataConfigured()'), 'Le moteur doit accepter TMDB direct OU Seerr comme backend metadata.');
assert.ok(server.includes("return tmdbConfigured() || seerrDiscoveryConfigured();"), 'Seerr doit suffire sans token TMDB externe.');
assert.ok(server.includes('/api/v1/discover/trending'), 'Les tendances Seerr doivent être exploitées.');
assert.ok(server.includes("query('/discover/movies'"), 'Discover films Seerr doit être exploité.');
assert.ok(server.includes("query('/discover/tv'"), 'Discover séries Seerr doit être exploité.');
assert.ok(server.includes('/recommendations') && server.includes('/similar'), 'Les recommandations et similarités Seerr/TMDB doivent être croisées.');
assert.ok(server.includes('/api/v1/genres/movie') && server.includes('/api/v1/genres/tv'), 'Les genres doivent pouvoir venir de Seerr.');
assert.ok(server.includes('/api/v1/watchproviders/'), 'Les plateformes légales doivent pouvoir venir de Seerr.');
assert.ok(server.includes("metadata: tmdbConfigured() ? 'TMDB direct' : 'Seerr/TMDB intégré'"), 'L’API doit annoncer le backend réellement utilisé.');
assert.ok(server.includes('requiresExternalTmdbToken: false'), 'Un token TMDB externe ne doit plus être requis avec Seerr configuré.');


const seerrStart = server.indexOf('function discoveryProviderFilter');
const seerrEnd = server.indexOf('async function tmdbDiscovery', seerrStart);
assert.ok(seerrStart >= 0 && seerrEnd > seerrStart, 'Le backend Seerr Discovery doit être extractible.');
const requestedPaths = [];
const seerrDiscovery = new Function(
  'seerrDiscoveryConfigured', 'discoveryRegion', 'discoverySeerrLanguage', 'jellyseerr', 'normalizedDiscoveryItem', 'discoveryCatalogPage',
  `${server.slice(seerrStart, seerrEnd)}; return seerrDiscovery;`
)(
  () => true,
  'FR',
  'fr',
  async path => {
    requestedPaths.push(path);
    return { results: [{ id: requestedPaths.length, mediaType: path.includes('/tv') ? 'tv' : 'movie', title: 'Test', name: 'Test', voteAverage: 8, popularity: 20 }] };
  },
  (item, forcedType, source) => ({ id: item.id, mediaType: forcedType || item.mediaType, score: 50, source }),
  discoveryCatalogPage
);
const seerrRows = await seerrDiscovery('smart', '8');
assert.ok(seerrRows.results.length > 0, 'Le moteur Seerr doit retourner des candidats sans token TMDB direct.');
assert.equal(seerrRows.page, 1);
await seerrDiscovery('movies', '8', '', 3);
assert.ok(requestedPaths.some(path => path.includes('page=3')), 'La pagination doit atteindre la source Seerr.');
assert.ok(requestedPaths.some(path => path.includes('/api/v1/discover/movies?')), 'Le moteur doit réellement interroger Discover films via Seerr.');
assert.ok(requestedPaths.some(path => path.includes('/api/v1/discover/tv?')), 'Le moteur doit réellement interroger Discover séries via Seerr.');
assert.ok(requestedPaths.some(path => path.includes('timeWindow=day')) && requestedPaths.some(path => path.includes('timeWindow=week')), 'Le moteur doit croiser tendances jour et semaine.');
assert.ok(requestedPaths.some(path => path.includes('watchRegion=FR') && path.includes('watchProviders=8')), 'Le filtre plateforme doit transiter par Seerr avec la région FR.');

const discoveryStart = server.indexOf('async function discoveryResults');
const discoveryEnd = server.indexOf('async function discoveryProviders', discoveryStart);
assert.ok(discoveryStart >= 0 && discoveryEnd > discoveryStart, 'discoveryResults doit être extractible.');
const discoverySource = server.slice(discoveryStart, discoveryEnd);
assert.ok(discoverySource.includes('jellyfinTasteProfile(session)'), 'Le profil Jellyfin doit être calculé même sans token TMDB direct.');
assert.equal(discoverySource.includes('Ajoute TMDB_BEARER_TOKEN'), false, 'Le chemin normal discovery ne doit plus demander TMDB_BEARER_TOKEN.');

assert.ok(shell.includes('aucun token TMDB supplémentaire requis.'), 'L’interface doit expliquer que Seerr fournit les métadonnées sans token TMDB supplémentaire.');
assert.ok(shell.includes('Métadonnées et disponibilité légale récupérées via Seerr/TMDB.'), 'Le crédit discovery doit refléter le backend intégré.');

const v87CssStart = css.indexOf('/* Noctra v87 — admin mobile compact');
assert.ok(v87CssStart >= 0, 'Le correctif mobile admin v87 doit être présent.');
const mobileCss = css.slice(v87CssStart);
assert.ok(mobileCss.includes('body.noctra-dashboard #userProfilesPage') && mobileCss.includes('padding-top: 0 !important;'), 'La double réserve verticale des pages admin doit être supprimée.');
assert.ok(mobileCss.includes('#userProfilesPage .content-primary') && mobileCss.includes('env(safe-area-inset-top) + 2.75rem'), 'Utilisateurs doit réserver une seule hauteur de header mobile.');
assert.ok(mobileCss.includes('grid-template-columns: 64px minmax(0,1fr)'), 'Les cartes utilisateurs doivent être compactes sur mobile.');
assert.ok(mobileCss.includes('.noctra-discovery-toolbar') && mobileCss.includes('flex-direction: column'), 'La barre Discovery doit être réorganisée sur téléphone.');

console.log('Noctra v88 — Seerr discovery + admin mobile : OK');
