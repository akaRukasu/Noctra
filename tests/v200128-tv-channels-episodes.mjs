// 200.0.128 — comme sur Noctra TV :
// - « Toutes les chaînes » et « Chaînes sport » : chaînes de toutes les
//   sources réunies (une carte par chaîne, numéros TNT, matchs écartés) ;
// - serveurs d'une chaîne testés (6 à la fois) et classés (fiabilité, test
//   « en ligne », rapidité), bascule automatique sur le suivant ;
// - bouton « Passer l'intro / le récap / le générique » (segments Jellyfin,
//   chapitres, générique appris) ; « À suivre » et transition entre épisodes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [shell, unifiedJs, dataJs, flowJs, flowCss, unifiedCss, html, server, pkg] = await Promise.all([
  read('public/noctra-shell.js'), read('public/noctra-tv-unified.js'), read('public/noctra-tv-data.js'),
  read('public/noctra-episode-flow.js'), read('public/noctra-episode-flow.css'), read('public/noctra-tv-unified.css'),
  read('public/client/index.html'), read('server.mjs'), read('package.json')
]);

// ── Chargement des modules ──
const at = name => html.indexOf(`../${name}?v=`);
assert.ok(at('noctra-tv-data.js') > 0 && at('noctra-tv-data.js') < at('noctra-tv-unified.js'));
assert.ok(at('noctra-tv-unified.js') < at('noctra-shell.js'), 'Module des chaînes avant le shell');
assert.ok(at('noctra-shell.js') < at('noctra-episode-flow.js'));
assert.ok(at('noctra-tv-unified.css') > 0 && at('noctra-episode-flow.css') > 0);

// ── Regroupement des chaînes (règles de la version TV) ──
const storage = new Map();
const context = {
  localStorage: { getItem: key => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  location: { href: 'https://noctra.test/client/', origin: 'https://noctra.test' },
  URL, console
};
context.window = context;
vm.createContext(context);
vm.runInContext(dataJs, context);
vm.runInContext(unifiedJs, context);
const U = context.NoctraTvUnified;
assert.match(U.version, /^200\.0\.1(2[89]|3\d)$/);
const ch = (name, extra = {}) => ({ name, playbackType: 'stream', streamUrl: `/s/${encodeURIComponent(name)}.m3u8`, ...extra });
const merged = U.mergeChannels([
  { source: { id: 'lw', name: 'LiveWatch', section: 'channels' }, channels: [ch('FR: TF1 HD'), ch('beIN SPORTS 1 · SAT · HD', { iptvOrgId: 'BeINSports1.fr' }), ch('France 2'), ch('UK: Sky Sports Main Event')] },
  { source: { id: 'mx', name: 'Movix', section: 'channels' }, channels: [ch('TF1'), ch('BEIN SPORTS 1 .b'), ch('France 2 FHD'), ch('Canal+ Sport 360')] },
  { source: { id: 'sp', name: 'Sports', section: 'sports' }, channels: [{ name: 'PSG vs OM', eventId: 9, embedUrl: 'https://x.invalid/m' }, ch('beIN Sports 2')] }
]);
const byName = name => merged.find(channel => channel.name === name);
assert.equal(byName('TF1')?._entries.length, 2, 'TF1 de deux sources : une seule carte');
assert.equal(byName('France 2')?._entries.length, 2);
assert.equal(byName('beIN SPORTS 1')?._entries.length, 2, '« .b » et « · SAT · HD » réunis');
assert.ok(!merged.some(channel => /PSG/.test(channel.name)), 'Les matchs restent dans leur source');
assert.equal(byName('TF1').category, 'Généralistes');
assert.equal(byName('beIN SPORTS 1').category, 'Sport');
assert.equal(byName('Sky Sports Main Event UK')?.country, 'uk');
const french = U.numberChannels(merged.filter(channel => channel.country === 'fr'), true);
assert.equal(french.find(channel => channel.name === 'TF1')._lcn, 1, 'Numéro TNT');
assert.equal(french.find(channel => channel.name === 'France 2')._lcn, 2);
assert.ok(U.officialLogo(byName('TF1')).includes('tv-logo/tv-logos'), 'Logo officiel tv-logos');

// ── Classement des serveurs ──
const key = 'all:tf1';
const servers = [
  { label: 'Web', sourceId: 'w', kind: 'web' },
  { label: 'Lent', sourceId: 'l', kind: 'native', probeState: 'up', probeMs: 6000 },
  { label: 'Rapide', sourceId: 'r', kind: 'native', probeState: 'up', probeMs: 300 },
  { label: 'Hors ligne', sourceId: 'h', kind: 'native', probeState: 'down' }
];
assert.deepEqual([...U.rankServers(servers, key)].map(server => server.label), ['Rapide', 'Lent', 'Web', 'Hors ligne']);
U.recordHealth(servers[2], key, false);
assert.equal(U.serverHealth(servers[2], key).verdict, 'recent-fail', 'Échec récent mémorisé');
U.rememberServer(key, 'Web');
assert.equal([...U.rankServers(servers, key)][0].label, 'Web', 'Dernier serveur fonctionnel en tête');
assert.equal(await U.probeStream('https://ailleurs.invalid/x.m3u8'), '', 'Flux tiers : non testé, jamais compté comme un échec');

// ── Intégration dans la page TV ──
assert.match(shell, /const TV_UNIFIED_SOURCES = \[\s*\{ id: 'all', name: 'Toutes les chaînes', section: 'channels'/);
assert.match(shell, /\{ id: 'all-sport', name: 'Chaînes sport', section: 'sports'/);
assert.match(shell, /tvState\.sources = realSources\.length \? \[\.\.\.TV_UNIFIED_SOURCES, \.\.\.realSources\] : \[\];/);
assert.match(shell, /if \(selected\.virtual\) \{\s*await openTvUnified\(selected, sequence\);/);
assert.match(shell, /const rememberedSourceId = '';/, 'Ouverture sur les chaînes réunies, comme sur la TV');
assert.match(shell, /filter\(source => !source\.virtual && tvSourceSection\(source\) !== 'portals'\)/);
assert.match(shell, /\.slice\(0, TV_UNIFIED_GROUP_LIMIT\)\s*\.forEach\(group => enqueue\(job\.source, group\.ref\)\)/, 'Bouquets limités (120 depuis 200.0.129)');
assert.match(shell, /while \(running < 6 && queue\.length\)/, 'Catalogues : 6 à la fois');
assert.match(shell, /const TV_UNIFIED_WAIT_MS = 12_000;/);
assert.match(shell, /const TV_UNIFIED_PROBE_WORKERS = 6;/);
assert.match(shell, /const TV_UNIFIED_DECIDE_MS = 6_000;/);
assert.match(shell, /if \(channel\.unified && Array\.isArray\(channel\._entries\)\) \{\s*await playTvUnifiedChannel\(channel, index, playbackSequence\);/);
assert.match(shell, /async function playTvSourceChannel\(channel, index, playbackSequence, extras = \{\}\)/);
assert.match(shell, /if \(unified\) throw error;/, 'Échec d’un serveur réuni : serveur suivant');
assert.match(shell, /const result = prefetched \|\| await api\(channel\.resolverUrl/, 'Résolution du test réutilisée');
assert.match(shell, /if \(tvUnifiedRun\) noteTvUnifiedStatus\(state\);/);
assert.match(shell, /run\.played \? TV_UNIFIED_PLAYING_GRACE_MS : TV_UNIFIED_ERROR_GRACE_MS/);
assert.match(shell, /if \(!tvUnifiedActive\(\) && tvState\.catalog\?\.channels\?\.\[Number\(index\)\]\) tvState\.catalog\.channels\[Number\(index\)\] = safeChannel;/, 'La chaîne réunie n’est jamais remplacée');
assert.match(shell, /return LIVEWATCH_OFFICIAL_EMBED_SOURCES\.has\(tvActiveSourceId\(\)\);/, 'Règles du fournisseur du serveur en cours');
assert.match(shell, /if \(tvState\.catalog\?\.unified\) return matches;/, 'Ordre des numéros conservé');
assert.match(shell, /data-tv-unified-servers hidden/);
assert.match(shell, /const tvUnifiedServer = event\.target\.closest\('\[data-tv-unified-server\]'\);/);
assert.match(unifiedCss, /\.noctra-tv-unified-servers i\[data-tone="good"\]/);

// ── Serveur : identité iptv-org et guide approchant (repris de Noctra TV) ──
assert.match(server, /const tvLogoIndexSchemaVersion = 3;/);
assert.match(server, /iptvOrgName: match\.name \|\| channel\.iptvOrgName \|\| '',\s*iptvOrgCountry: match\.country \|\| channel\.iptvOrgCountry \|\| ''/);
assert.match(server, /function fuzzyTvGuideProgrammes\(guide, name\)/);
assert.match(server, /const enriched = await enrichTvLogosFromIptvOrg\(catalog\.channels\)\.catch\(\(\) => catalog\.channels\);/);

// ── Génériques et épisodes ──
const flowContext = {
  window: null, document: { body: { classList: { toggle() {}, remove() {} } }, addEventListener() {}, querySelector: () => null },
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  performance, Symbol, console, setInterval: () => 0, setTimeout, clearTimeout, clearInterval: () => {}
};
flowContext.window = flowContext;
vm.createContext(flowContext);
vm.runInContext(flowJs, flowContext);
const flow = flowContext.NoctraEpisodeFlow;
assert.equal(flow.version, '200.0.164');
const chapters = flow.chapterSegments({
  RunTimeTicks: 1440 * 1e7,
  Chapters: [
    { Name: 'Prologue', StartPositionTicks: 0 },
    { Name: 'Opening', StartPositionTicks: 90 * 1e7 },
    { Name: 'Partie A', StartPositionTicks: 180 * 1e7 },
    { Name: 'Ending', StartPositionTicks: 1350 * 1e7 }
  ]
});
assert.deepEqual(JSON.parse(JSON.stringify(chapters)), [
  { type: 'intro', startMs: 90_000, endMs: 180_000, source: 'chapitres' },
  { type: 'outro', startMs: 1_350_000, endMs: 1_440_000, source: 'chapitres' }
]);
// 200.0.164 : plus de générique « appris » des avances manuelles (marqueurs réels seulement).
assert.equal(flow.learnIntro, undefined);
assert.ok(!/learnIntro|noctra-web-intros|source: 'appris'/.test(flowJs), 'aucun générique appris');
assert.equal(flow.skipLabel({ type: 'intro' }), 'Passer le générique');
assert.equal(flow.skipLabel({ type: 'outro' }), 'Passer le générique de fin');
assert.equal(flow.episodeLabel({ Type: 'Episode', ParentIndexNumber: 2, IndexNumber: 5, Name: 'Le retour' }), 'S2 · É5 — Le retour');
assert.match(flowJs, /requireJellyfin\(\)\?\.\(39738\)\?\.f/, 'Gestionnaire de lecture Jellyfin');
assert.match(flowJs, /client\.getUrl\(`MediaSegments\/\$\{item\.Id\}`\)/, 'Segments du serveur d’abord');
assert.match(flowJs, /if \(server\.length\) return server;\s*return chapterSegments\(full\);/);
assert.match(flowJs, /const COUNTDOWN_SECONDS = 10;/);
assert.match(flowJs, /const trigger = outro \? outro\.startMs : duration - \(duration > 10 \* 60_000 \? 30_000 : 15_000\);/);
assert.match(flowJs, /for \(const segment of state\.segments\) \{\s*if \(segment\.dismissed\) continue;/, '« Passer le générique de fin » et « Épisode suivant » distincts');
assert.ok(!/segment\.type === 'outro' && state\.item\?\.Type === 'Episode' && state\.next\) \{ playNext\(\)/.test(flowJs), 'passer le générique de fin ≠ épisode suivant');
assert.ok(!/updateNextButton|noctra-next-episode/.test(flowJs), '200.0.168 : pas de bouton « Épisode suivant » à part sur le web');
assert.match(flowJs, /const SKIP_STEP_MS = 15_000;/);
assert.match(flowJs, /if \(state\.nextQueued\) \{\s*state\.advancing = true;/, 'Fin d’épisode : Jellyfin enchaîne, pas de second « suivant »');
assert.match(flowJs, /state\.stopAtEnd && remaining < 1_200/, '« Plus tard » : arrêt à la fin');
assert.match(flowCss, /body\.noctra-episode-flow \.skip-button-container,\s*body\.noctra-episode-flow \.skip-button,\s*body\.noctra-episode-flow \.upNextContainer \{ display:none !important; \}/);
assert.ok(!/animation:[^;]*zoom/.test(flowCss), 'Pas d’animation coûteuse de l’image de fond');

console.log('v200.0.128 : chaînes réunies et serveurs testés, « Passer », « À suivre » et transition entre épisodes : OK');
