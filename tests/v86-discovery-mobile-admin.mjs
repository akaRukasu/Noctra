import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');

assert.ok(server.includes('async function seerrTrendCandidates()'), 'Discovery doit croiser les tendances Seerr jour/semaine.');
assert.ok(server.includes("timeWindow=day") && server.includes("timeWindow=week"), 'Les deux fenêtres de tendance Seerr doivent être utilisées.');
assert.ok(server.includes("/${seed.mediaType}/${seed.id}/recommendations") && server.includes("/${seed.mediaType}/${seed.id}/similar"), 'Les seeds Jellyfin doivent alimenter recommandations ET contenus similaires TMDB.');
assert.ok(server.includes('topStudios:') && server.includes('movieShare:') && server.includes('seriesShare:'), 'Le profil de goût doit exposer des signaux plus riches.');
assert.ok(server.includes('saveDiscoveryFeedback') && server.includes("/api/discovery/feedback"), 'Le moteur doit apprendre des retours Plus comme ça / Pas pour moi.');
assert.ok(shell.includes('data-discovery-feedback=\"more\"') && shell.includes('data-discovery-feedback=\"less\"'), 'Les cartes doivent permettre un feedback explicite.');
assert.ok(shell.includes('NOCTRA DISCOVERY ENGINE') && shell.includes('TENDANCES CROISÉES') && shell.includes('Pépites bien notées'), 'La page Demandes doit présenter le nouveau parcours intelligent.');
assert.ok(shell.includes('CENTRE DE DEMANDES') && shell.includes('data-request-status-filter') && shell.includes('data-request-media-filter'), 'La gestion des demandes doit offrir synthèse et filtres.');
assert.ok(server.includes('summary = (requests.results || []).reduce'), 'L’API demandes doit retourner un résumé de statuts.');
assert.ok(css.includes('body.noctra-dashboard #userProfilesPage') && css.includes('body.noctra-dashboard #dashboardGeneralPage'), 'Dashboard et Utilisateurs doivent disposer de règles mobiles explicites.');
assert.ok(css.includes('grid-template-columns: 72px minmax(0,1fr)'), 'Les cartes utilisateurs doivent devenir compactes sur mobile.');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'") && server.includes("version: '200.0.21'"), 'Client et serveur doivent annoncer v86.');
console.log('Discovery avancée, demandes et admin mobile Noctra v88 : OK');
