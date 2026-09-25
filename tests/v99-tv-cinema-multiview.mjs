import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes('const TV_SAFE_MULTI_MAX = 25;'));
assert.ok(shell.includes('const multiReady = count >= 2;'));
assert.ok(shell.includes("multiQuality: 'stable'"));
assert.ok(shell.includes("lowLatencyMode: false"));
assert.ok(shell.includes('const bufferLength = count <= 4 ? 72 : count <= 9 ? 52 : count <= 16 ? 38 : 28;'));
assert.ok(shell.includes('maxBufferLength: bufferLength'));
assert.ok(shell.includes('tvSafeMultiStartupGoal'));
assert.ok(shell.includes('Hls.Events.FRAG_BUFFERED'));
assert.ok(shell.includes('lowerTvSafeMultiCap'));
assert.ok(shell.includes('fragLoadingTimeOut: 38_000'));
assert.ok(shell.includes('applyTvSafeMultiQualityCap(hls)'));
assert.ok(shell.includes("if (count <= 4) return 720;"));
assert.ok(shell.includes('hls.autoLevelCapping = chosen ? chosen.index : -1'));
assert.ok(shell.includes('hls._noctraMultiNetworkRecoveries < 3'));
assert.ok(shell.includes('hls._noctraMultiMediaRecoveries < 2'));
assert.ok(shell.includes('Math.min(index * 260, 5200)'));

assert.ok(shell.includes('data-tv-safe-quality-select'));
assert.ok(shell.includes('Qualité du lecteur'));
assert.ok(shell.includes('tvHls.loadLevel ='));
assert.ok(shell.includes('1080p max'));
assert.ok(shell.includes('720p max'));
assert.ok(shell.includes('480p max'));
assert.ok(shell.includes('360p max'));
assert.ok(shell.includes('data-tv-safe-multi-quality-badge'));

assert.ok(theme.includes('.noctra-tv-safe-quality-picker'));
assert.ok(theme.includes('aspect-ratio:16/9!important') || theme.includes('aspect-ratio: 16/9 !important'));
assert.ok(theme.includes('.noctra-tv-safe-multi-controls'));
assert.ok(theme.includes('.noctra-tv-safe-multi-overlay'));
assert.ok(theme.includes('@media (max-width:760px)'));
assert.ok(theme.includes('orientation:landscape'));

assert.ok(shell.includes("panelNode.setAttribute('data-tv-safe-theater', 'true')"));
assert.ok(shell.includes('toggleTvSafeMultiviewFullscreen'));
assert.ok(shell.includes('data-tv-safe-multi-fullscreen'));
assert.ok(shell.includes("panelNode.removeAttribute('data-tv-safe-theater')"));

console.log('Qualité + Multiview stable/poli + Cinéma v100 : OK');
