// 200.0.108 — refonte graphique « Aurora 2 » : couche visuelle isolée, sans
// impact sur la lecture ni sur la logique existante.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [index, css, js] = await Promise.all([
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('public/noctra-aurora.css', root), 'utf8'),
  readFile(new URL('public/noctra-aurora.js', root), 'utf8')
]);

// Chargée après toutes les autres feuilles Noctra, activable par un seul attribut.
assert.match(index, /<html [^>]*data-noctra-skin="aurora"/);
const finish = index.indexOf('noctra-finish.css');
const aurora = index.indexOf('noctra-aurora.css?v=200.108');
assert.ok(finish > 0 && aurora > finish, 'La couche Aurora doit être chargée après noctra-finish.css.');
assert.ok(index.includes('noctra-aurora.js?v=200.108'));
assert.ok(index.includes('noctra-shell.js?v=200.108'), 'Le correctif Shaka est rechargé par les navigateurs.');
assert.ok(index.includes('fonts/sora-latin-wght.woff2'), 'Police de titre préchargée.');

// Chaque règle est limitée à l'habillage Aurora.
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[^{]+\{/g, '{').match(/[^{}@]+\{/g) ?? [];
for (const raw of rules) {
  const selector = raw.slice(0, -1).trim();
  if (!selector || /^(from|to|\d+%|[\d%, ]+)$/.test(selector) || selector.startsWith('(')) continue;
  const parts = []; let depth = 0, current = '';
  for (const char of selector) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { parts.push(current); current = ''; } else current += char;
  }
  parts.push(current);
  for (const part of parts) {
    assert.ok(part.trim().startsWith('html[data-noctra-skin="aurora"]') || part.trim().startsWith(':root[data-noctra-skin="aurora"]'),
      `Sélecteur hors périmètre Aurora : ${part.trim()}`);
  }
}

// Rien au-dessus ou sur la vidéo : pas de filtre, flou ni habillage pendant la lecture.
assert.ok(!rules.some(rule => /(^|[\s>,(])(video|iframe|canvas)\b/.test(rule)), 'Aucune règle ne cible un élément vidéo.');
assert.ok(!/noctra-tv-player-card[^{]*\{[^}]*(backdrop-filter|filter:)/.test(css));
assert.ok(css.includes('body.noctra-ready:not(.noctra-playing):not(.noctra-video-route)::before'));

// Animations continues : desktop performant, hors lecture, hors onglet masqué, mouvement non réduit.
const motion = css.slice(css.indexOf('@media (prefers-reduced-motion:no-preference)'));
assert.ok(motion.length > 0);
for (const match of css.matchAll(/animation:[^;]*infinite/g)) {
  const before = css.slice(0, match.index);
  assert.ok(before.lastIndexOf('@media (prefers-reduced-motion:no-preference)') > -1, 'Animation continue sans garde de mouvement réduit.');
  const ruleStart = before.lastIndexOf('}');
  const selector = css.slice(ruleStart + 1, match.index);
  assert.ok(selector.includes('.noctra-performance-desktop') && selector.includes(':not(.noctra-playing)') && selector.includes(':not(.noctra-page-hidden)'),
    'Animation continue non limitée au desktop hors lecture.');
}
assert.ok(css.includes('#noctra-backdrop[data-panel-kind="tv"][data-open="true"])::before {animation:none'), 'Aurore figée derrière le lecteur TV.');

// Le dock reste statique : aucune transformation ni animation sur ses boutons.
const dockRules = css.match(/#noctra-dock[^{]*\{[^}]*\}/g) ?? [];
assert.ok(dockRules.length > 0);
for (const rule of dockRules) assert.ok(!/transform|animation|translate/.test(rule), `Dock animé : ${rule.slice(0, 80)}`);

// Les arrondis restent présents.
assert.ok((css.match(/border-radius:/g) ?? []).length >= 8);

// Script décoratif autonome : écouteur passif, respect du mouvement réduit.
assert.ok(js.includes("{ passive: true }"));
assert.ok(js.includes('prefers-reduced-motion'));
assert.ok(js.includes("noctra-playing"));
assert.ok(!/fetch\(|XMLHttpRequest|localStorage|ApiClient/.test(js), 'Le script visuel ne touche ni au réseau ni aux données.');

console.log('v200.0.108 : refonte Aurora 2 isolée, lecture et dock préservés : OK');
