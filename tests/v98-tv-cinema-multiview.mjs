import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("const TV_SAFE_MULTI_MAX = 25;"));
assert.ok(shell.includes("const multiReady = count >= 2;"));
assert.ok(shell.includes("slots.slice(0, TV_SAFE_MULTI_MAX)"));
assert.ok(shell.includes("Math.min(5, Math.max(2, Math.ceil(Math.sqrt(safeCount))))"));
assert.ok(shell.includes("2 chaînes sélectionnées : le Multiview est maintenant disponible."));
assert.ok(shell.includes("data-tv-safe-multi-clear"));
assert.ok(shell.includes("multiGeneration"));
assert.ok(shell.includes("index * 90"));

// Le mode cinéma est un simple toggle de layout et doit être entièrement réversible.
assert.ok(shell.includes("panelNode.setAttribute('data-tv-safe-theater', 'true')"));
assert.ok(shell.includes("panelNode.removeAttribute('data-tv-safe-theater')"));
assert.ok(shell.includes("closeTvSafeToolsMenu();"));
assert.ok(theme.includes('height:clamp(460px,68vh,900px)!important'));
assert.ok(theme.includes('width:min(100%,1600px)!important'));
assert.ok(!theme.includes('[data-tv-safe-theater="true"] .noctra-tv-browser{display:none!important}'));
assert.ok(!theme.includes('[data-tv-safe-theater="true"] .noctra-tv-navigation,\n  #noctra-panel[data-noctra-panel-kind="tv"][data-tv-safe-theater="true"] .noctra-tv-topbar,\n  #noctra-panel[data-noctra-panel-kind="tv"][data-tv-safe-theater="true"] .noctra-tv-browser{display:none!important}'));

// 2..25, grille desktop jusqu'à 5x5 + adaptation mobile portrait/paysage.
assert.ok(theme.includes('repeat(var(--tv-safe-multi-cols,2),minmax(0,1fr))'));
assert.ok(theme.includes('repeat(var(--tv-safe-multi-rows,1),minmax(0,1fr))'));
assert.ok(theme.includes('repeat(var(--tv-safe-multi-mobile-cols,1),minmax(0,1fr))'));
assert.ok(theme.includes('orientation:landscape'));
assert.ok(shell.includes(`De 2 à ${'${TV_SAFE_MULTI_MAX}'} chaînes · grille jusqu’à 5 × 5`));

// Toujours aucune intervention des extras sur le HLS principal.
const start = shell.indexOf('  /* V99 — TV extras isolated');
const end = shell.indexOf('\n\n  async function playTvDirectStream', start);
assert.ok(start >= 0 && end > start);
const extras = shell.slice(start, end);
assert.ok(!extras.includes('tvHls?.stopLoad'));
assert.ok(!extras.includes('tvHls?.startLoad'));
assert.ok(!extras.includes('currentTime ='));

console.log('Cinéma réversible + Multiview 2–25 / 5x5 Noctra v98 : OK');
