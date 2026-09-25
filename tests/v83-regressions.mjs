import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');

assert.ok(server.includes("const noctraPendingRequestLimit = 10"), 'La capacité membre doit être de 10 demandes simultanément en attente.');
assert.ok(server.includes('filter=pending') && server.includes('quota.pending >= quota.limit'), 'La limite doit compter seulement les demandes PENDING, pas les demandes déjà approuvées/refusées.');
assert.ok(server.includes("/api/jellyseerr/requests/clear-pending") && server.includes("method: 'DELETE'"), 'L’administrateur doit pouvoir effacer en masse les demandes en attente.');
assert.ok(server.includes("/(approve|decline)$/") || server.includes('(approve|decline)'), 'L’administrateur doit pouvoir approuver/refuser les demandes depuis Noctra.');
assert.ok(shell.includes('data-clear-pending-requests') && shell.includes('data-request-admin-status') && shell.includes('data-request-delete-id'), 'La gestion des demandes doit être exposée dans l’interface.');
assert.ok(shell.includes('data-tv-quality') && shell.includes('populateTvQualitySelector') && shell.includes('tvHls.loadLevel'), 'Le lecteur HLS doit proposer le choix de qualité lorsqu’un master HLS expose plusieurs niveaux.');
assert.ok(theme.includes('.noctra-tv-screen:fullscreen .noctra-tv-screen-fullscreen') && theme.includes('display: none !important'), 'Le bouton plein écran doit disparaître une fois en vrai fullscreen.');
assert.ok(server.includes('function ohaPageLooksMissing') && server.includes('function ohaPublicRouteCandidates') && server.includes("add(new URL('/live', root).toString())") && server.includes('selectOhaOfficialPage'), 'OHA doit privilégier les routes /watch publiées puis conserver /live et / en secours sans fabriquer de hash arbitraire.');
assert.ok(server.includes('const externalUrl = ohaCatalogPublicPageUrl(item, root)'), 'Le catalogue OHA doit privilégier la vraie route publique fournie par ses entrées.');
assert.ok(server.includes("const preferOfficialLogo = ['livewatch', 'witv', 'oha'].includes(source.type) || options.logoRefresh") && server.includes('Boolean(options.logoRefresh)'), 'Les catalogues intégrés doivent être enrichis dès la première réponse et privilégier le logo officiel.');
assert.ok(shell.includes("const builtInTvLogos = ['LiveWatch', 'NorthTV', 'FrameTV', 'WiTV', 'OHA'].includes(provider)"), 'Le client doit déclencher l’enrichissement des logos pour toutes les familles TV intégrées.');
assert.ok(server.includes("tmdb('/trending/all/day'") && server.includes("tmdb('/movie/upcoming'") && server.includes('signalCount'), 'Les suggestions doivent combiner tendances du jour, sorties à venir et consensus multi-signaux.');
assert.ok(server.includes('/watch/providers') && server.includes('legalPlatforms'), 'Les suggestions doivent intégrer la disponibilité sur les plateformes légales en France.');
assert.equal(shell.includes('const firstWeb = options.findIndex'), false, 'WiTV doit garder le HLS en choix par défaut.');
assert.ok(theme.includes('body[data-noctra-role="user"] #noctra-dock[data-role="user"] *::before') && theme.includes('transition: none !important'), 'Le dock membre doit rester totalement statique au survol.');

console.log('Régressions ciblées Noctra v88 : OK');
