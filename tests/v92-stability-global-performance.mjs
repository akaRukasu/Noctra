import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');

// Les optimisations globales de la v92 doivent rester présentes même si son
// expérimentation HLS agressive a été retirée en v93.
assert.ok(shell.includes("classList.toggle('noctra-performance-desktop', performanceDesktop)"), 'Le profil performance desktop global doit rester activé selon le viewport.');
assert.ok(shell.includes("classList.toggle('noctra-native-wheel', performanceDesktop || ultrawide)"), 'Le scroll desktop doit rester natif.');
assert.ok(shell.includes("if (document.body.classList.contains('noctra-panel-open')) return;"), 'Les mutations Jellyfin derrière un panneau Noctra ne doivent plus relancer les scans DOM.');
assert.ok(shell.includes('!desktopPerformanceProfile() && !heavyPanel && document.startViewTransition'), 'Les gros View Transitions doivent rester désactivés sur desktop.');
assert.ok(shell.includes('viewportResizeFrame'), 'Les recalculs de resize doivent rester regroupés dans une frame.');
assert.ok(css.includes('Noctra v92 — mode performance global desktop'), 'Le thème doit conserver le profil performance global introduit en v92.');
assert.ok(css.includes('html.noctra-performance-desktop #noctra-panel *') && css.includes('backdrop-filter: none !important'), 'Les flous internes coûteux doivent rester retirés sur desktop.');
assert.ok(css.includes('html.noctra-performance-desktop #noctra-panel .noctra-row') && css.includes('content-visibility: auto'), 'Les longues listes Noctra doivent toujours différer leur rendu hors écran.');
assert.ok(css.includes('html.noctra-performance-desktop .itemsContainer > .card') && css.includes('contain: layout paint style'), 'Les grilles Jellyfin doivent conserver leur isolation de rendu.');

assert.ok(shell.includes('slice(0, 52)') || (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).includes('slice(0, 52)'), 'La profondeur Discovery ne doit pas être diminuée pour gagner en fluidité.');

console.log('Performance globale héritée de Noctra v92 : OK');
