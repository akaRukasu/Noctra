import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [pkg, server, shell, theme, sw, index, changelog] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('server.mjs', root), 'utf8'),
  readFile(new URL('public/noctra-shell.js', root), 'utf8'),
  readFile(new URL('public/noctra-theme.css', root), 'utf8'),
  readFile(new URL('public/noctra-sw.js', root), 'utf8'),
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('CHANGELOG-V200.md', root), 'utf8')
]);

assert.equal(pkg.version, '200.0.43');
assert.match(server, /version: '200\.0\.43'/);
assert.match(shell, /NOCTRA_BUILD_VERSION = '200\.0\.43'/);
assert.match(sw, /CACHE_NAME = 'noctra-shell-v200-r43'/);
assert.match(index, /noctra-shell\.js\?v=200\.43/);
assert.match(theme, /woff2\?v=200\.43/);
assert.match(changelog, /## 200\.0\.43/);

const controlsStart = shell.indexOf('<div class="noctra-tv-desktop-live-controls"');
const controls = shell.slice(controlsStart, controlsStart + 2400);
const pip = controls.indexOf('data-tv-live-pip');
const theater = controls.indexOf('data-tv-safe-theater');
const fullscreen = controls.indexOf('data-tv-live-fullscreen');
assert.ok(pip >= 0 && theater > pip && fullscreen > theater, 'Cinéma doit être entre PiP et Plein écran.');
assert.match(shell, /event\.target\.closest\('button\[data-tv-safe-theater\]'\)/);
assert.doesNotMatch(shell, /event\.target\.closest\('\[data-tv-safe-theater\]'\)/);
assert.match(shell, /aria-pressed[^\n]+tvSafeExtras\.theater/);
assert.match(theme, /button\[data-tv-safe-theater\]\[data-active="true"\]/);

assert.match(server, /id: 'streamsports99-live-tv'.+section: 'channels'.+\/live-tv/);
assert.match(server, /async function tvCatalogFromStreamSports99LiveTv/);
assert.match(server, /source\.id === 'streamsports99-live-tv'\) catalog = await tvCatalogFromStreamSports99LiveTv/);
const sportsCatalog = server.slice(server.indexOf('async function tvCatalogFromStreamSports99(rootValue'), server.indexOf('\nfunction streamedMatchChannel'));
assert.doesNotMatch(sportsCatalog, /streamSports99LiveTvApiCatalog/);
assert.doesNotMatch(sportsCatalog, /\['live-tv', 'Live TV'\]/);

assert.match(server, /const ohaConfirmedPublicRoutes = new Map\(\)/);
assert.match(server, /for \(const candidate of routeCandidates\) addWatchId\(candidate\)/);
assert.match(server, /addWatchId\(channelId\)/);
assert.match(server, /const externalUrl = officialPage\.url \|\| new URL\('\/live'/);
assert.match(server, /history\.replaceState\(\{\},'',\$\{JSON\.stringify\(remoteRoute\)\}/);
assert.match(server, /'kool\.to', 'www\.kool\.to'/);

const routeStart = server.indexOf('function ohaWatchRouteFromValue');
const routeEnd = server.indexOf('\nfunction ohaRouteCandidatesFromValue', routeStart);
const route = new Function(
  'safeTvRemoteUrl', 'ohaAllowedHost',
  `${server.slice(routeStart, routeEnd)}; return ohaWatchRouteFromValue;`
)(value => new URL(value), value => ['kool.ws', 'kool.to'].includes(new URL(value).hostname));
assert.equal(
  route('https://kool.ws/watch?live=66217962033a2d3e9c47f', 'https://kool.ws/live'),
  'https://kool.ws/watch?live=66217962033a2d3e9c47f'
);
const candidatesStart = server.indexOf('function ohaOfficialPageCandidates');
const candidatesEnd = server.indexOf('\nasync function selectOhaOfficialPage', candidatesStart);
const officialCandidates = new Function(
  'safeTvRemoteUrl',
  `${server.slice(candidatesStart, candidatesEnd)}; return ohaOfficialPageCandidates;`
)(value => new URL(value));
const rebuilt = officialCandidates(
  'https://kool.ws/live',
  '66217962033a2d3e9c47f',
  'https://oha.cx/watch?live=66217962033a2d3e9c47f',
  ['https://oha.cx/watch?live=66217962033a2d3e9c47f']
);
assert.equal(rebuilt[0], 'https://kool.ws/watch?live=66217962033a2d3e9c47f');
assert.ok(rebuilt.includes('https://kool.ws/live'));
assert.ok(rebuilt.every(value => new URL(value).hostname === 'kool.ws'));

const wiTvResolver = server.slice(server.indexOf('async function resolveWiTvPlayerOption'), server.indexOf('\nfunction wiTvChannelIdentity'));
assert.match(wiTvResolver, /const officialPlayerUrl = safeTvRemoteUrl\(item\.url\)\.toString\(\)/);
assert.match(wiTvResolver, /url: officialPlayerUrl/);
assert.match(wiTvResolver, /officialClient: true/);
assert.doesNotMatch(wiTvResolver, /ne fournit actuellement aucun segment vidéo valide/);

assert.match(server, /const crossFamilyPromise = kind === 'frame'/);
assert.match(server, /Secours \$\{variant\.familyLabel\}/);
assert.match(shell, /startResolvedOptionFallback\('aucun média reçu avant le délai'\)/);
assert.match(shell, /\^FrameTV\$\/i\.test\(playbackProvider\) \? 42_000/);
assert.match(shell, /manifestLoadingRetryDelay: 900/);
assert.match(shell, /fragLoadingMaxRetryTimeout: 10_000/);
assert.match(shell, /const retryDelay = Math\.min\(4_000, 450 \* \(2 \*\*/);

console.log('Noctra v200.0.43 · cinéma, routes et stabilité Live TV : OK');
