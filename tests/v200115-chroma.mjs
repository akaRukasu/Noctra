// 200.0.115 — Chroma : couleurs tirées de l'œuvre, affiche mobile 16:9,
// médiathèques au format de l'image, reflet et intro.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../public/noctra-aurora.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../public/noctra-aurora.js', import.meta.url), 'utf8');
const block = css.slice(css.indexOf('200.0.115 — « Chroma »'), css.indexOf('200.0.116 — Fluidité') > 0 ? css.indexOf('200.0.116 — Fluidité') : undefined);
assert.ok(block.length > 2000);

// Couleurs dynamiques déclarées et animées ; valeurs par défaut Aurora.
assert.match(block, /@property --na-dyn-1 \{syntax:'<color>';inherits:true;initial-value:#8b5cf6;\}/);
assert.match(block, /transition:--na-dyn-1 1\.6s ease,--na-dyn-2 1\.6s ease/);
// Extraction locale sur 24 × 24 px, sans requête réseau ni fuite d'erreur.
assert.match(js, /canvas\.width = canvas\.height = 24;/);
assert.match(js, /catch \{ \/\* Image non lisible/);
assert.ok(!/fetch\(|XMLHttpRequest|localStorage|ApiClient/.test(js));
assert.match(js, /if \(!body \|\| document\.hidden \|\| playing\(\)\) return;/, 'Pas de calcul pendant la lecture');

// Affiche mobile : image paysage entière en 16:9, carte ajustée, texte sous le poster.
const mobile = block.slice(block.indexOf('Affiche d\'accueil sur mobile'), block.indexOf('Médiathèques : cartes au format'));
assert.match(mobile, /height:auto!important;min-height:0!important;grid-template-rows:auto auto!important;container-type:inline-size/);
assert.match(mobile, /aspect-ratio:16\/9;object-fit:cover!important/);
assert.match(mobile, /:has\(\.noctra-premiere-art:is\(\[data-shape="portrait"\],\[data-shape="square"\]\)\) \.noctra-premiere-copy/);

// Médiathèques : cartes 16:9 comme les images générées par Jellyfin (texte non rogné).
assert.match(block, /\.noctra-library-card \{\s*height:auto!important;min-height:0!important;aspect-ratio:16\/9!important;/);

// Intro : une fois par session, jamais bloquante, jamais avec le mouvement réduit.
assert.match(block, /#na-intro \{\s*position:fixed;inset:0;z-index:2147483000;pointer-events:none;/);
assert.match(js, /if \(seen \|\| !motionAllowed\(\)/);
assert.match(js, /window\.setTimeout\(\(\) => intro\.remove\(\), \d{3,4}\)/);

// Animations nouvelles : gardées par na-motion ; aucune continue ; dock et vidéo intacts.
const motion = block.slice(block.indexOf('@media (prefers-reduced-motion:no-preference)'));
for (const rule of motion.match(/[^{}]+\{[^{}]*animation:na-[^{}]*\}/g) ?? []) assert.ok(rule.includes('.na-motion'), rule.slice(0, 80));
assert.ok(!/infinite/.test(block.replace(/\/\*[\s\S]*?\*\//g, '')));
assert.ok(!/(^|[\s>,(])(video|iframe|canvas)\b[^{]*\{/.test(block));
assert.ok(!/#noctra-dock[^{]*\{[^}]*(animation|transform|translate|scale)/.test(block));

console.log('v200.0.115 : Chroma, affiche mobile 16:9, médiathèques non rognées, reflet et intro : OK');
