// 200.0.114 — fluidité, médiathèques mobiles, fiches films/séries, transitions de page.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../public/noctra-aurora.css', import.meta.url), 'utf8');
const block = css.slice(css.indexOf('200.0.114 — Fluidité'));
assert.ok(block.length > 2000);

// Fluidité : lumière ambiante calculée en petit puis agrandie ; pas de flou
// d'arrière-plan sur écran tactile ; rangées isolées.
assert.match(block, /#na-ambient > i \{[^}]*transform:scale\(4\)/);
assert.match(block, /@media \(hover:none\), \(pointer:coarse\) \{[\s\S]*?backdrop-filter:none!important/);
assert.match(block, /\.homeSectionsContainer > \.verticalSection \{contain:layout style;\}/);

// Médiathèques mobiles : titre sur deux lignes au plus, sans césure au milieu d'un mot,
// libellé « Explorer » remplacé par la seule flèche.
const mobile = block.slice(block.indexOf('Médiathèques sur mobile'), block.indexOf('Fiches films et séries'));
assert.match(mobile, /-webkit-line-clamp:2/);
assert.match(mobile, /word-break:normal!important/);
assert.match(mobile, /\.noctra-library-card__action \{font-size:0!important/);

// Fiches : habillage visuel uniquement, sans toucher à la lecture.
for (const part of ['.itemBackdrop::after', '.detailImageContainer .cardImageContainer', '.itemMiscInfo .mediaInfoItem', '.mainDetailButtons .btnPlay', '.overview:not(:empty)', '.detailPageSecondaryContainer', '.listItem {', '.personCard']) {
  assert.ok(block.includes(part), `Fiche : ${part}`);
}
assert.ok(!/(^|[\s>,(])(video|iframe|canvas)\b[^{]*\{/.test(block), 'Aucune règle sur la vidéo');
assert.ok(!/#noctra-dock[^{]*\{/.test(block), 'Dock inchangé');
assert.ok(!/infinite/.test(block.replace(/\/\*[\s\S]*?\*\//g, '')), 'Pas d’animation continue');

// Transitions : jouées une fois à l'affichage, uniquement avec le mouvement autorisé, hors lecture.
const motion = block.slice(block.indexOf('@media (prefers-reduced-motion:no-preference)'));
for (const rule of motion.match(/[^{}]+\{[^{}]*animation:na-[^{}]*\}/g) ?? []) {
  assert.ok(rule.includes('.na-motion') && rule.includes(':not(.noctra-playing)'), `Transition non gardée : ${rule.slice(0, 80)}`);
}
assert.match(motion, /\.mainAnimatedPage:not\(\.hide\) \{\s*animation:na-page-in/);
assert.match(motion, /:not\(\.noctra-video-route\) \.mainAnimatedPages/);

console.log('v200.0.114 : fluidité, médiathèques mobiles, fiches cinéma et transitions : OK');
