import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(sw.includes("noctra-shell-v200-r15"));

// LiveWatch iOS : reprise du même direct uniquement.
assert.ok(shell.includes('tvLiveWatchRefreshCount < 8'));
assert.ok(shell.includes('refresh=1&_=${Date.now()}'));
assert.ok(shell.includes('`${provider} · reconnexion ${tvLiveWatchRefreshCount}/8…`'));
assert.ok(server.includes('options?.forceRefresh') && server.includes('liveWatchVipDirectCache.delete(`${kind}:${id}`)'));
assert.ok(server.includes("forceRefresh: requestUrl.searchParams.get('refresh') === '1'"));
assert.equal(shell.includes('fallbackTvResolvedOption('), false, 'Aucun fallback automatique vers un autre serveur ne doit être réintroduit.');

// Fullscreen iOS : natif d'abord, fallback viewport vérifié ensuite.
assert.ok(shell.includes("document.body.classList.contains('noctra-tv-pseudo-fullscreen')"));
assert.ok(shell.includes('video.webkitDisplayingFullscreen'));
assert.ok(shell.includes("video.addEventListener('webkitbeginfullscreen'"));
assert.ok(shell.includes('enterTvPseudoFullscreen(card)'));
assert.ok(css.includes('body.noctra-tv-pseudo-fullscreen #noctra-dock'));

console.log('v112 LiveWatch iOS + fullscreen regression checks passed');
