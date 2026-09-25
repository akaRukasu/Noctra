import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

assert.ok(shell.includes('function enterTvNativeVideoFullscreen(video)'), 'Le lecteur TV doit disposer d’un helper plein écran vidéo natif.');
assert.ok(shell.includes('video.webkitEnterFullscreen()') && shell.includes('video.webkitEnterFullScreen()'), 'Safari/iOS doit essayer les API vidéo WebKit natives.');
assert.ok(shell.includes("video.webkitSetPresentationMode('fullscreen')"), 'Le mode présentation fullscreen WebKit doit rester un secours natif.');
assert.ok(shell.includes('frame.dataset.tvResolvedMedia') && shell.includes('enterTvNativeVideoFullscreen(nativeVideo)'), 'Un LiveWatch bridgé doit pouvoir passer au vrai vidéo natif au clic Plein écran sur mobile.');
assert.ok(shell.includes('mobileNativeHandoffStarted') && shell.includes('!mediaPlaying'), 'Le handoff LiveWatch mobile doit être antérieur à la lecture, jamais tardif.');
assert.ok(server.includes('async function resolveLiveWatchVipPlayback') && server.includes('await liveWatchAccessSession();'), 'Le resolver Premium doit vérifier la session sans renouvellement forcé à chaque clic.');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'") && server.includes("version: '200.0.21'"), 'Client et serveur doivent annoncer v84.');

console.log('Régressions ciblées Noctra v88 : OK');
