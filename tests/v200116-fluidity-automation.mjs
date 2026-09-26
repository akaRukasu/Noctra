// 200.0.116 — fluidité (moins de recalculs et de flous) et centre
// d'automatisation intégré au design Aurora sur tous les écrans.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../public/noctra-aurora.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../public/noctra-aurora.js', import.meta.url), 'utf8');
const block = css.slice(css.indexOf('200.0.116 — Fluidité'), css.indexOf('200.0.118 — « Aurora Flow »') > 0 ? css.indexOf('200.0.118 — « Aurora Flow »') : undefined);
assert.ok(block.length > 4000, 'Bloc 116 présent');
const P = 'html[data-noctra-skin="aurora"]:not(#na-skin) body.noctra-ready #noctra-panel[data-noctra-panel-kind="automation"]';

// 1. Couleurs Chroma : plus de transition héritée sur tout le document.
assert.match(block, /html\[data-noctra-skin="aurora"\] \{transition:none!important;\}/);
assert.match(block, /\.noctra-performance-desktop:not\(#na-skin\) body\.noctra-ready:not\(\.noctra-playing\):not\(\.noctra-video-route\)::before \{\s*transition:--na-dyn-1/);
// Aurore en pause (sans saut) sous un panneau.
assert.match(block, /body\.noctra-ready\.noctra-panel-open[^{]*::before \{\s*animation-play-state:paused!important;/);

// 2. Animations composées par le GPU : panneau, reflet, pastille.
const keyframes = name => block.slice(block.indexOf(`@keyframes ${name}`), block.indexOf('\n', block.indexOf(`@keyframes ${name}`)));
assert.ok(!/clip-path/.test(keyframes('na-panel-zoom')), 'Ouverture sans clip-path');
assert.match(keyframes('na-panel-zoom'), /opacity:0;scale:\.94;translate:0 14px/);
assert.match(keyframes('na-glare-move'), /transform:translate3d\(420%,0,0\)/);
assert.ok(!/left/.test(keyframes('na-glare-move')));
assert.match(keyframes('na-pulse-soft'), /^@keyframes na-pulse-soft \{50% \{opacity:\.45;\}\}$/);
assert.match(block, /#noctra-backdrop\[data-open="true"\] > #noctra-panel \{\s*animation:na-panel-zoom/);
// Seule animation continue : la pastille, en opacité, réservée au desktop performant.
const code = block.replace(/\/\*[\s\S]*?\*\//g, '');
assert.deepEqual(code.match(/animation:[^;]*infinite/g), ['animation:na-pulse-soft 2.6s ease-in-out infinite']);
assert.match(code, /noctra-performance-desktop[^{]*\.noctra-eyebrow::before \{\s*animation:na-pulse-soft/);
// Les autres animations restent gardées par na-motion.
const motionRules = code.match(/[^{}]+\{[^{}]*animation:na-(?!pulse-soft)[^{}]*\}/g) ?? [];
assert.ok(motionRules.length >= 5);
for (const rule of motionRules) assert.ok(rule.includes('.na-motion'), rule.slice(0, 90));
assert.ok(!/#noctra-dock[^{]*\{[^}]*(animation|transform|translate|scale)/.test(code), 'Dock sans animation');

// 3. Écrans tactiles : aucun flou d'arrière-plan sur le dock, l'en-tête, les panneaux, l'affiche.
const touch = block.slice(block.indexOf('@media (hover:none), (pointer:coarse)'), block.indexOf('Centre d\'automatisation'));
for (const target of ['#noctra-dock', '.skinHeader', '#noctra-panel .noctra-panel-header', '.noctra-premiere .noctra-button']) assert.ok(touch.includes(target), target);
assert.equal((touch.match(/backdrop-filter:none!important/g) || []).length, 3 * 2);

// 4. Automatisation : en-tête libre (plus de hauteur figée à 66 px), onglets sur une ligne.
assert.ok(block.includes(`${P} .noctra-arr-hero {\n display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;`));
assert.match(block, /height:auto!important;min-height:0!important;max-height:none!important;/);
assert.match(block, /\.noctra-arr-nav \{\s*display:flex!important;flex-wrap:nowrap!important;[^}]*overflow-x:auto!important;/);
assert.match(block, /\.noctra-arr-nav > \.noctra-tab \{\s*flex:0 0 auto!important;[^}]*white-space:nowrap!important;/);
// Cartes : actions alignées sur une grille, repli sur deux lignes dans une carte étroite.
assert.match(block, /\.noctra-arr-actions \{\s*display:grid!important;grid-template-columns:auto minmax\(0,1fr\) 40px!important;/);
assert.match(block, /@container \(max-width:290px\)[\s\S]*?\.noctra-arr-actions > \.noctra-button--primary \{grid-column:1\/-1;\}/);
assert.match(block, /\.noctra-arr-card-body \{[^}]*container-type:inline-size;/);
// Liste vide : ni titre orphelin ni grille vide.
assert.match(block, /\.noctra-section-heading:has\(\+ \.noctra-arr-grid:empty\)/);
// Calendrier et file d'attente : panneaux Aurora (plus l'ancienne teinte verte).
assert.match(block, /\.noctra-arr-columns > section \{[^}]*background:var\(--na-auto-glass\)!important;/);
// Mobile : service en commutateur pleine largeur, compteurs 3 + 2, en-tête empilé.
const mobile = block.slice(block.indexOf('@media (max-width:760px)'));
assert.match(mobile, /\.noctra-arr-hero \{grid-template-columns:minmax\(0,1fr\)!important;/);
assert.match(mobile, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important;/);
assert.match(mobile, /\.noctra-metric:nth-child\(5\):last-child \{grid-column:span 3;\}/);
// Le centre ne touche ni à la lecture ni aux autres panneaux.
for (const rule of code.slice(code.indexOf(`${P} {--na-auto-line`)).match(/[^{}]+\{/g) ?? []) {
  if (/^\s*(@|from|to|\d)/.test(rule) || /^\s*html\[data-noctra-skin="aurora"\]\.na-motion/.test(rule)) continue;
  for (const selector of rule.slice(0, -1).split(/,(?![^(]*\))/)) {
    if (!selector.trim() || /^\s*@/.test(selector)) continue;
    assert.ok(selector.includes('[data-noctra-panel-kind="automation"]'), `Sélecteur hors automatisation : ${selector.trim().slice(0, 90)}`);
  }
}

// 5. Script : un seul minuteur, rien pendant un défilement ni en lecture, positions mémorisées.
assert.equal((js.match(/setInterval\(/g) || []).length, 1, 'Un seul minuteur');
assert.match(js, /if \(performance\.now\(\) - lastScroll < 300 \|\| playing\(\)\)/);
assert.match(js, /lastScroll = performance\.now\(\);\n    forgetRects\(\);/);
assert.match(js, /const rect = rectOf\(tilted\.closest\('\.card'\) \|\| tilted\);/);
assert.match(js, /const rect = rectOf\(magnet\);/);
assert.ok(!/getBoundingClientRect\(\)/.test(js.slice(js.indexOf('const paintPointer'), js.indexOf('const cursorLight'))), 'Aucune lecture de mise en page par image');
assert.match(js, /window\.setTimeout\(\(\) => intro\.remove\(\), 1400\)/);
assert.ok(!/fetch\(|XMLHttpRequest|localStorage|ApiClient/.test(js));

console.log('v200.0.116 : fluidité (GPU, sans flou tactile, minuteur unique) et centre d’automatisation intégré : OK');
