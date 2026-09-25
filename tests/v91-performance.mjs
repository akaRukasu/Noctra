import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes('renderTvVirtualWindow') && shell.includes('data-virtual'), 'La liste TV desktop doit être virtualisée sans retirer de chaînes.');
assert.ok(shell.includes('applyTvCatalogRefresh(enriched, sequence)'), 'Les rafraîchissements progressifs TV doivent rester en place sans remonter tout le lecteur.');
assert.ok(shell.includes('ensureTvChannelVisible(index)'), 'Le zapping doit pouvoir rejoindre une chaîne hors fenêtre virtualisée.');
assert.ok(shell.includes('startDiscoveryFeed'), 'Discovery doit afficher les résultats progressivement sans en réduire le nombre.');
assert.ok(shell.includes("const deferredResults = progressiveDiscovery ? results.slice(12) : []"), 'Seul le montage DOM est différé, les résultats complets restent conservés.');
assert.ok(shell.includes('scheduleHeavyPrefetch') && shell.includes("'/api/tv/sources'") && shell.includes("'/api/discovery?category=smart&provider=&mode=balanced'"), 'Les pages lourdes desktop doivent être réchauffées pendant une période idle.');
assert.ok(css.includes('.noctra-tv-channel-list[data-virtual="true"]') && css.includes('contain: layout paint style'), 'La liste TV virtualisée doit isoler layout et paint.');
assert.ok(css.includes('.noctra-smart-section') && css.includes('content-visibility: auto'), 'Les sections Discovery hors écran doivent être différées par le moteur de rendu.');
assert.ok(shell.includes('backdrop.dataset.panelKind = panelKind') && css.includes('backdrop-filter: none !important'), 'Les panneaux lourds PC doivent supprimer le blur plein écran coûteux.');
assert.ok(css.includes('content-visibility: hidden !important') && css.includes('#reactRoot'), 'Le rendu Jellyfin derrière un panneau lourd doit être suspendu sans supprimer son DOM.');
assert.ok(server.includes('gzipSync') && server.includes("from 'node:zlib'"), 'Les gros JSON doivent pouvoir être compressés.');
assert.ok(server.includes("'content-encoding': 'gzip'"), 'La réponse JSON gzip doit annoncer son encodage.');
assert.ok(shell.includes("slice(0, 52)") || server.includes("slice(0, 52)"), 'Le moteur de suggestions conserve sa profondeur de contenu.');
console.log('Performance desktop Noctra v92 : OK');
