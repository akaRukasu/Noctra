import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));

// V121 : même si Safari garde un ancien catalogue qui contenait un resolver VIP,
// les sources LiveWatch documentées doivent repasser par leur embed officiel.
assert.ok(shell.includes('const LIVEWATCH_OFFICIAL_EMBED_SOURCES = new Set(['));
for (const id of ['livewatch-north','livewatch-frame','livewatch-sports','livewatch-football','livewatch-bosstv','livewatch-jacktv','livewatch-daily']) {
  assert.ok(shell.includes(`'${id}'`));
}
assert.ok(!shell.includes("'livewatch-daddy'"));
assert.ok(shell.includes('if (await playDocumentedLiveWatchEmbed(channel, index, playbackSequence)) return;'));
assert.ok(shell.includes("vipPlayback: northSameOrigin"));
assert.ok(shell.includes("const mandatoryGate = !northSameOrigin"));
assert.ok(shell.includes("resolverUrl: ''"));
assert.ok(shell.includes("class=\"noctra-livewatch-status\"") && shell.includes("officialEmbedSource ? 'LiveWatch connecté' : 'LiveWatch VIP connecté'"));

// Le centre qBittorrent doit armer son polling APRES insertion asynchrone du DOM.
assert.ok(shell.includes('afterUpdate: () => {') && shell.includes('scheduleDownloadsLive(700);'));
assert.ok(shell.includes("function scheduleDownloadsLive(delay = 1100)"));
assert.ok(shell.includes("readDownloadsApi(`/api/downloads?live=${Date.now()}`, { cache: 'no-store', timeoutMs: 8_000 })"));
assert.ok(shell.includes("document.addEventListener('visibilitychange'"));

// La sélection manuelle doit tenir dans un viewport iPhone sans overflow horizontal.
assert.ok(css.includes('Noctra V121 — sélection de release mobile + stabilité du temps réel'));
assert.match(css, /#noctra-panel\[data-noctra-panel-kind="automation"\] \.noctra-release\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) !important;[\s\S]*?width:\s*100% !important;[\s\S]*?overflow:\s*hidden !important;/);
assert.match(css, /#noctra-panel\[data-noctra-panel-kind="automation"\] \.noctra-release-title h3\s*\{[\s\S]*?white-space:\s*normal !important;[\s\S]*?overflow-wrap:\s*anywhere !important;/);
assert.match(css, /#noctra-panel\[data-noctra-panel-kind="automation"\] \.noctra-release > \.noctra-button\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?min-width:\s*0 !important;/);
assert.ok(shell.includes("setLoading(title, `${type === 'sonarr' ? 'SONARR' : 'RADARR'} · RECHERCHE INTERACTIVE`, true, { kind: 'automation' });"));
assert.ok(shell.includes("setLoading(title, 'SONARR · CHOISIR UN ÉPISODE', true, { kind: 'automation' });"));

// Cache PWA : le client, le thème et le service worker doivent tous changer de clé.
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(index.includes('noctra-theme.css?v=200.21'));
assert.ok(index.includes('noctra.webmanifest?v=182'));
assert.ok(shell.includes('noctra-sw.js?v=182'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

console.log('v121 TV/docs embed, downloads live polling and mobile release checks passed');
