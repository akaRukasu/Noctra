// 200.0.113 — Aurora Motion : motion design sans risque pour la lecture ni
// pour l'accessibilité.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../public/noctra-aurora.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../public/noctra-aurora.js', import.meta.url), 'utf8');
const block = css.slice(css.indexOf('200.0.113 — Aurora Motion'));
assert.ok(block.length > 1000);

// Toutes les animations Motion dépendent de html.na-motion et de prefers-reduced-motion.
const motionMedia = block.slice(block.indexOf('@media (prefers-reduced-motion:no-preference)'), block.indexOf('html[data-noctra-skin="aurora"]:not(#na-skin) #na-cursor-light {'));
for (const rule of motionMedia.match(/[^{}]+\{[^{}]*animation[^{}]*\}/g) ?? []) {
  assert.ok(rule.includes('.na-motion'), `Animation hors garde na-motion : ${rule.slice(0, 90)}`);
}
for (const name of ['na-panel-reveal', 'na-reveal', 'na-card-in', 'na-title-in', 'na-toast-in']) {
  assert.ok(motionMedia.includes(name), `${name} doit rester dans le bloc prefers-reduced-motion`);
}
// Aucune animation continue ajoutée ; rien sur le dock ni sur la vidéo.
assert.ok(!/infinite/.test(block.replace(/\/\*[\s\S]*?\*\//g, '')), 'Pas d’animation continue');
assert.ok(!/#noctra-dock[^{]*\{[^}]*(animation|transform|translate|scale)/.test(block), 'Dock statique');
assert.ok(!/(^|[\s>,(])(video|iframe|canvas)\b[^{]*\{/.test(block), 'Aucune règle sur la vidéo');
// Effets lourds réservés au desktop performant.
assert.match(block, /\.na-motion\.noctra-performance-desktop:not\(#na-skin\)[^{]*#na-cursor-light \{\s*display:block;/);
assert.match(block, /\.na-motion\.noctra-performance-desktop:not\(#na-skin\)[^{]*\.noctra-premiere-picture \{\s*translate:0 var\(--na-parallax/);

// Script : jamais d'animation si le mouvement est réduit ; rien pendant la lecture.
assert.match(js, /const motionAllowed = \(\) => !reducedMotion\?\.matches;/);
assert.match(js, /root\.classList\.toggle\('na-motion', motionAllowed\(\)\)/);
assert.match(js, /playing\(\)\) return;/);
// Ce qui est déjà visible n'est jamais masqué par l'apparition au défilement.
assert.match(js, /element\.dataset\.naReveal = 'shown'; continue;/);
// Écouteurs passifs, aucune requête réseau ni stockage.
const listeners = [...js.matchAll(/addEventListener\('(pointermove|scroll|click|pointerleave)',[\s\S]*?, (\{[^{}]*\})\);/g)];
assert.ok(listeners.length >= 4);
for (const [, type, options] of listeners) assert.ok(/passive: true/.test(options), `Écouteur ${type} non passif`);
assert.ok(!/fetch\(|XMLHttpRequest|localStorage|ApiClient/.test(js));

console.log('v200.0.113 : Aurora Motion gardé (mouvement réduit, lecture, dock, vidéo) : OK');
