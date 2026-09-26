// 200.0.121 — survol fluide, « Reprendre » / « Voir la fiche » fiables à chaque
// clic, réglages en une colonne, réserve de démarrage Shaka, intro allongée.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [shell, css, aurora] = await Promise.all([read('public/noctra-shell.js'), read('public/noctra-aurora.css'), read('public/noctra-aurora.js')]);

// 1. Accès au client Jellyfin : webpack n'exécute le rappel d'un chunk qu'à
//    sa première déclaration. Émulation fidèle de webpackJsonpCallback.
const installed = {};
const require = id => ({ id });
const webpackChunk = {
  push([chunkIds, , runtime]) {
    if (chunkIds.some(id => installed[id] !== 0)) {
      if (runtime) runtime(require);
    }
    for (const id of chunkIds) installed[id] = 0;
  }
};
const helper = shell.slice(shell.indexOf('  function homeWebpackRequire() {'), shell.indexOf('\n  }', shell.indexOf('  function homeWebpackRequire() {')) + 4);
const grab = new Function('window', 'performance', `let jellyfinWebpackRequire = null;\n${helper}\nreturn homeWebpackRequire;`)({ webpackChunk }, { now: () => 1234 });
assert.equal(grab(), require, 'Premier clic');
assert.equal(grab(), require, 'Deuxième clic : le require mémorisé est réutilisé');
// L'ancien code (identifiant fixe) échouait dès le deuxième clic.
const fixed = () => { let runtime; webpackChunk.push([['noctra-premiere-actions'], {}, r => { runtime = r; }]); return runtime; };
assert.ok(fixed()); assert.equal(fixed(), undefined, 'Reproduction du bug 200.0.120');
// L'affiche utilise désormais l'accès mémorisé.
const actions = shell.slice(shell.indexOf('  function premiereResumeData(item) {'), shell.indexOf('  function currentJellyfinUserId() {'));
assert.match(actions, /const runtime = homeWebpackRequire\(\);/);
assert.ok(!/noctra-premiere-actions/.test(actions));

// 2. Survol : plus de variables posées sur <html> à chaque image, plus de
//    lecture de mise en page par image, perspective limitée à l'affiche survolée.
assert.ok(!/root\.style\.setProperty\('--na-c[xy]'/.test(aurora), 'Lumière du curseur sans variable racine');
assert.match(aurora, /cursorLight\.style\.transform = `translate3d\(\$\{Math\.round\(x\)\}px,\$\{Math\.round\(y\)\}px,0\)`;/);
assert.ok(!/setProperty\('--na-m[xy]'/.test(aurora), 'Reflet fixe, plus suivi image par image');
assert.ok(!/getBoundingClientRect\(\)/.test(aurora.slice(0, aurora.indexOf('// Lumière ambiante'))), 'Aucune mesure au mouvement du pointeur');
const block = css.slice(css.indexOf('200.0.121 — Survol léger'));
assert.match(block, /\.card \{perspective:none!important;\}/);
assert.match(block, /transform:perspective\(900px\) translateY\(-6px\) rotateX\(var\(--na-rx,0deg\)\) rotateY\(var\(--na-ry,0deg\)\)!important;transform-style:flat!important;/);

// 3. Réglages du profil : une seule colonne centrée sur PC.
assert.match(block, /#myPreferencesMenuPage \.readOnlyContent \{\s*grid-template-columns:minmax\(0,1fr\)!important;max-width:720px!important;/);
assert.match(block, /#myPreferencesMenuPage \.readOnlyContent > \.verticalSection \{grid-row:auto!important;grid-column:1!important;/);

// 4. Shaka : 15 s de réserve au démarrage, reprise à partir de 6 s ensuite.
assert.match(shell, /streaming: \{ bufferingGoal: 45, rebufferingGoal: 15, bufferBehind: 15, segmentPrefetchLimit: 1,/);
assert.match(shell, /player\.configure\(\{ streaming: \{ segmentPrefetchLimit: 2, rebufferingGoal: 6 \} \}\);/);
assert.match(shell, /installTvShakaContinuity\(player, video, videoEventSignal, 6, reserve =>/);

// 5. Intro : 2,2 s à la première ouverture de la session, 1,2 s ensuite.
assert.match(aurora, /const minimum = !motionAllowed\(\) \? 0 : seen \? 1200 : 2200;/);

console.log('v200.0.121 : survol fluide, fiche/lecture fiables à chaque clic, réglages en colonne, réserve Shaka 15 s : OK');
