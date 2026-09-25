import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');

assert.ok(server.includes('function seriesRequestPolicy('), 'La politique de demande série doit être centralisée.');
assert.ok(server.includes("'returning series', 'in production', 'planned', 'pilot'"), 'Les séries non terminées doivent être reconnues.');
assert.ok(server.includes('requestPolicy.forceAutomatic ? \'auto\' : requestedSelectionMode'), 'Une série non terminée doit conserver la recherche automatique.');
assert.ok(server.includes("requestUrl.searchParams.get('mediaId')"), 'La destination doit connaître le média afin de calculer la politique série.');
assert.ok(shell.includes('&mediaId=${encodeURIComponent(pendingRequest.mediaId)}'), 'Le formulaire doit demander la politique du média sélectionné.');
assert.ok(shell.includes("const forceSeriesAuto = pendingRequest.mediaType === 'tv' && Boolean(requestPolicy.forceAutomatic)"), 'Le client doit verrouiller visuellement les séries en cours sur automatique.');
assert.ok(shell.includes("authContext?.isAdmin && requestServersForMode('manual').length"), 'Hors série en cours, le choix manuel doit être proposé en priorité quand il existe.');
assert.ok(shell.includes('Série non terminée · automatique conservé'), 'Le comportement automatique des séries en cours doit être expliqué.');
assert.ok(css.includes('data-mode="series-auto"'), 'La note série automatique doit avoir son intégration visuelle dédiée.');
console.log('Politique hybride demandes séries Noctra v110 : OK');
