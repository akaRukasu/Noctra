import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));

// TV : version masquée et extras réellement périphériques.
assert.ok(shell.includes('<p class="noctra-eyebrow">NOCTRA · TV EN DIRECT</p>'));
assert.equal(/NOCTRA · TV EN DIRECT · v\d+/i.test(shell), false);
assert.ok(shell.includes("button.addEventListener('click', event =>"));
assert.ok(shell.includes("button.addEventListener('pointerdown', event => event.stopPropagation()"));
assert.ok(shell.includes('noctra-tv-safe-tools-launcher-icon'));

// Multiview : page dédiée, fullscreen, stabilité et absence de 3e flux caché.
assert.ok(shell.includes('toggleTvSafeMultiviewFullscreen'));
assert.ok(shell.includes('data-tv-safe-multi-fullscreen'));
assert.ok(shell.includes('suspendTvSafeMainPlaybackForMulti'));
assert.ok(shell.includes('restoreTvSafeMainPlayback'));
assert.ok(shell.includes('tvHls.stopLoad()'));
assert.ok(shell.includes('tvHls.startLoad(-1)'));
assert.ok(shell.includes('video.autoplay = false'));
assert.ok(shell.includes('tvSafeMultiStartupGoal'));
assert.ok(shell.includes('Hls.Events.FRAG_BUFFERED'));
assert.ok(shell.includes('lowerTvSafeMultiCap'));
assert.ok(shell.includes('Promise.resolve(exitResult).catch(() => {})'), 'La fermeture du Multiview doit absorber un rejet asynchrone de exitFullscreen.');
assert.ok(theme.includes('.noctra-tv-safe-multiview:fullscreen'));
assert.ok(theme.includes('body.noctra-tv-multiview-open #noctra-dock'));

// Notre fullscreen principal doit masquer le HUD Noctra, comme le fullscreen natif vidéo.
assert.ok(theme.includes('.noctra-tv-screen:fullscreen .noctra-tv-safe-status-hud'));
assert.ok(theme.includes('.noctra-tv-screen:fullscreen .noctra-tv-safe-tools-launcher'));

// Les panneaux lourds sont de vrais workspaces et gardent le dock au premier plan.
assert.ok(shell.includes('noctra-panel--workspace'));
assert.ok(theme.includes('#noctra-panel.noctra-panel--workspace'));
assert.ok(theme.includes('z-index: 1000080 !important'));

// Discovery : consultation temps réel Prowlarr, sans obligation de créer une demande.
assert.ok(shell.includes('data-discovery-torrents'));
assert.ok(shell.includes('Torrents : …') && shell.includes('Torrents : ${count}')); // V110 conserve la consultation live avec compteur explicite, zéro compris.
assert.ok(shell.includes('limit: \'24\''));
assert.ok(shell.includes("force: force ? '1' : '0'"));
assert.ok(shell.includes('Auto-actualisation 45 s'));
assert.ok(server.includes("requestUrl.searchParams.get('force') === '1'"));
assert.ok(server.includes('releases: normalized.slice(0, releaseLimit)'));
assert.ok(server.includes("const trackerBoost = cachedAvailability?.status === 'available'"));
assert.ok(server.includes('trackers: Math.round(trackerBoost)'));
assert.ok(server.includes('PROWLARR_INTERNAL_URL || process.env.PROWLARR_URL'));

console.log('Workspaces, Multiview et torrents live Noctra v100 : OK');
