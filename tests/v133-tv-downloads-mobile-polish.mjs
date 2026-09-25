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
assert.ok(index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(!server.includes("id: 'livewatch-daddy'"), 'DaddyTV ne doit plus être proposé.');
assert.ok(!shell.includes("'livewatch-daddy'"), 'Le client ne doit plus conserver DaddyTV comme source officielle.');
assert.ok(server.includes('Math.min(12_000, Number(options.channelLimit) || 2_500)'));
assert.ok(server.includes("channelLimit: source.family === 'frame' ? 12_000 : 2_500"));
assert.ok(shell.includes("const france = groupNames.find(group => normalizedText(group) === 'france')"));
assert.ok(shell.includes("if (france && (tvState.group === 'Toutes' || !groupNames.includes(tvState.group))) tvState.group = france"));
assert.ok(shell.includes('if (!sourceId && !options.preferSection)'));
assert.ok(shell.includes("await openTv(firstSource?.id || '', '', { preferSection: true })"));

assert.ok(shell.includes("const quick = await api(quickPath, { timeoutMs: 18_000 })"));
assert.ok(shell.includes('void cachedApi(smartPath, 60_000'));
assert.ok(shell.includes("void cachedApi('/api/discovery?category=trending&provider=&mode=balanced'"));
assert.ok(shell.includes("void cachedApi('/api/discovery?category=smart&provider=&mode=balanced'"));

assert.ok(shell.includes("return window.matchMedia?.('(max-width: 760px)')?.matches ? 30 : 60"));
assert.ok(shell.includes('data-download-render-key'));
assert.ok(shell.includes('list.dataset.downloadRenderKey !== renderKey'));
assert.ok(!shell.includes('view.innerHTML = downloadsMarkup(data)'));
assert.ok(shell.includes('downloadsUiState.detailHash = String(hash ||'));
assert.ok(shell.includes('scheduleDownloadsLive(1_500)'));
assert.ok(shell.includes('data-download-load-more'));

const v133Css = css.slice(css.indexOf('/* Noctra V133 - palette multi-accent'));
assert.ok(v133Css.length > 2_000);
assert.match(v133Css, /--noctra-violet:\s*#aa91e8/);
assert.match(v133Css, /--noctra-amber:\s*#e7b96e/);
assert.match(v133Css, /button\.noctra-dock-button\[data-active="true"\][\s\S]*box-shadow: none !important;/);
assert.match(v133Css, /\.headerTop \.mainDrawerButton[\s\S]*display: none !important;/);
assert.match(v133Css, /#noctra-toast[\s\S]*bottom: calc\(112px \+ env\(safe-area-inset-bottom\)\) !important;/);
assert.ok(shell.includes('function restoreAuthenticatedMobileHeader(playing = false)'));
assert.ok(shell.includes('restoreAuthenticatedMobileHeader(playing)'));

console.log('v133 TV, downloads, requests and mobile polish checks passed');
