import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(shell.includes('function recordTvDiagnostic'), 'Le lecteur doit journaliser les événements sans exposer les URLs/tokens.');
assert.ok(shell.includes('data-tv-safe-diagnostics'), 'Le menu TV doit exposer le diagnostic local.');
assert.ok(shell.includes('data-tv-diagnostics-copy'), 'Le diagnostic doit pouvoir être copié pour analyse.');
assert.ok(shell.includes("video.addEventListener('playing', onPlaying, listenerOptions)"), 'L’état playing doit pouvoir être restauré après une erreur transitoire.');
assert.ok(shell.includes("video.addEventListener('timeupdate', onProgress, listenerOptions)"), 'La reprise réelle de la vidéo doit effacer un faux statut erreur.');
assert.ok(shell.includes("if (retries < 3)"), 'Une erreur réseau fatale doit pouvoir retenter le même flux jusqu’à trois fois.');
assert.ok(shell.includes("if (recoveries < 2)"), 'Une erreur média fatale doit bénéficier de deux récupérations contrôlées.');
assert.ok(shell.includes("if (!data.fatal) return;"), 'Les erreurs HLS non fatales ne doivent pas tuer la lecture.');
assert.ok(shell.includes('video-error-recovered'), 'Une erreur HTMLMediaElement transitoire doit être reconnue comme récupérée.');
assert.ok(css.includes('.noctra-tv-diagnostics-panel'), 'Le panneau diagnostic doit avoir un responsive dédié.');
assert.ok(css.includes('@media (max-width: 760px)'), 'Le diagnostic doit rester utilisable sur mobile.');

console.log('Diagnostic TV + récupération même flux Noctra v106 : OK');
