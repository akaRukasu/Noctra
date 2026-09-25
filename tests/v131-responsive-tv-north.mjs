import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(server.includes('async function prepareLiveWatchVipEmbed'));
assert.ok(server.includes("path.startsWith('/api/tv/livewatch/prepare/')"));
assert.ok(server.includes('issueLiveWatchBridgeReference(kind, id'));
assert.ok(server.includes('`/api/tv/livewatch/vip/${encodeURIComponent(token)}/embed`'));
assert.ok(server.includes('const bridge = String.raw`<base href='));
assert.ok(server.includes("playbackType: 'resolver'"));
assert.ok(server.includes('`/api/tv/livewatch/resolve/${sourceFamily}/${encodeURIComponent(reference.id)}`'));
assert.ok(shell.includes("api(`/api/tv/livewatch/prepare/north/${encodeURIComponent(reference.id)}`"));
assert.ok(shell.includes("channel?.playbackType === 'resolver' && channel?.resolverUrl"));
assert.ok(shell.includes("Le relais NorthTV n’a pas fourni de lecteur."));
assert.ok(shell.includes('channel?.vipPlayback || channelFamilyStream'));

const tokenEmbedStart = server.indexOf('async function proxyLiveWatchVipTokenEmbed');
const tokenEmbedEnd = server.indexOf('\n\nasync function proxyLiveWatchVipTokenSite', tokenEmbedStart);
assert.ok(tokenEmbedStart >= 0 && tokenEmbedEnd > tokenEmbedStart);
assert.ok(server.slice(tokenEmbedStart, tokenEmbedEnd).includes('await liveWatchAccessSession();'));
assert.ok(!server.slice(tokenEmbedStart, tokenEmbedEnd).includes('liveWatchAccessSession(true)'));

assert.ok(shell.includes('function backgroundPrefetchProfile()'));
assert.ok(shell.includes("allowed: !connection?.saveData && effectiveType !== 'slow-2g'"));
assert.ok(shell.includes('profile.desktop ? 1800 : 650'));
assert.ok(shell.includes('const warmCatalog = validCachedApiValue(catalogPath)'));
assert.ok(shell.includes('if (catalog !== warmCatalog) renderTvWorkspace(catalog, sequence)'));
assert.ok(shell.includes("rememberedSourceId = window.localStorage?.getItem('noctra-tv-last-source')"));

assert.ok(css.includes('grid-template-columns: minmax(54px, .85fr) minmax(74px, 1.15fr) repeat(3, 36px)'));
assert.ok(css.includes('#noctra-panel[data-noctra-panel-kind="downloads"] .noctra-download-counts'));
assert.ok(css.includes('background: linear-gradient(145deg, rgba(116, 89, 255, .30), rgba(69, 91, 214, .20))'));
assert.ok(css.includes('#noctra-dock .noctra-dock-button[data-active="true"]'));
assert.ok(css.includes('border-radius: 16px !important;'));

console.log('v131 responsive downloads, classic dock, TV prefetch and NorthTV bridge checks passed');
