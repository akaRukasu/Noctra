// 200.0.119 — fluidité PC rétablie (plus d'animation liée au défilement par
// affiche) et lecture involontaire depuis l'affiche d'accueil corrigée.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const css = await readFile(new URL('public/noctra-aurora.css', root), 'utf8');
const aurora = await readFile(new URL('public/noctra-aurora.js', root), 'utf8');
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

// 1. Aucune animation liée à la vue d'un élément (une couche graphique par
//    affiche : ≈ 380 couches et images à 200 ms mesurées sur un accueil de
//    12 rangées) ; plus de projecteur :has() recalculé à chaque survol.
assert.ok(!/animation-timeline:\s*view\(/.test(code), 'Pas de view() timeline');
assert.ok(!/scrollSlider:has\(/.test(code), 'Pas de projecteur :has()');
assert.ok(!/na-flow-(rise|depth)/.test(code), 'Animations de rangées et de profondeur retirées');
// Une seule animation pilotée par le défilement : la parallaxe de l'affiche (un élément).
assert.equal((code.match(/animation-timeline:scroll\(root\)/g) || []).length, 2, 'Parallaxe + titre d’accueil (115) seulement');
assert.match(code, /@supports \(animation-timeline: scroll\(\)\) \{\s*@media \(prefers-reduced-motion:no-preference\) \{\s*html\[data-noctra-skin="aurora"\]\.na-motion\.noctra-performance-desktop:not\(#na-skin\) body\.noctra-ready\.noctra-home:not\(\.noctra-playing\) \.homePage \.noctra-premiere \.noctra-premiere-picture \{/);
// L'apparition des rangées revient au script (animation jouée une fois).
assert.match(aurora, /const scanReveal = \(\) => \{\n    if \(!revealObserver \|\| /);
assert.match(aurora, /cssScroll = Boolean\(window\.CSS\?\.supports\?\.\('animation-timeline: scroll\(\)'\)\)/);

// 2. Affiche d'accueil : le clic fantôme qui suit une flèche est absorbé.
const controls = shell.slice(shell.indexOf('const bindPremiereControl'), shell.indexOf("bindPremiereControl('[data-premiere-prev]'"));
assert.match(controls, /const swallowGhostClick = ghost => \{/);
assert.match(controls, /if \(Date\.now\(\) - lastPointerActivation > 700 \|\| button\.contains\(ghost\.target\)\) return;/);
assert.match(controls, /if \(!premiere\.contains\(ghost\.target\)\) return;/);
assert.match(controls, /ghost\.preventDefault\(\);\s*ghost\.stopImmediatePropagation\(\);/);
assert.match(controls, /document\.addEventListener\('click', swallowGhostClick, \{ capture: true, once: true \}\);/);

// 3. Toucher l'affiche suspend le défilement automatique ; « Reprendre »
//    lance le titre affiché au moment où le doigt s'est posé.
assert.match(shell, /const canRun = \(\) => !paused && !hovering && !focused && Date\.now\(\) - touchedAt > 6000 && visible/);
assert.match(shell, /pressedIndex = event\.target\.closest\?\.\('\[data-premiere-play\], \[data-premiere-details\]'\) \? index : -1;/);
assert.match(shell, /\[data-premiere-play\]'\)\.onclick = \(\) => \{ const item = pressedItem\(\); pressedIndex = -1; item\?\.resume\?\.click\(\); \};/);

console.log('v200.0.119 : fluidité PC rétablie et plus de lecture involontaire depuis l’affiche : OK');
