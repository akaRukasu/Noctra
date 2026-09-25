import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [pkg, shell] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('public/noctra-shell.js', root), 'utf8')
]);

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));

const repairStart = shell.indexOf('function repairScrollArrowButtons(root = document)');
const repairEnd = shell.indexOf('\n  function repairAuthenticatedViewState', repairStart);
const repair = shell.slice(repairStart, repairEnd);
assert.ok(repair.length > 500);
assert.ok(repair.includes('boundHomeCarouselButtons.has(button)'));
assert.ok(repair.includes("button.addEventListener('click', event =>"));
assert.ok(repair.includes('const carousel = getHomeCarousel(button)'));
assert.ok(repair.includes('event.stopImmediatePropagation()'));
assert.ok(repair.includes('moveHomeCarousel(button)'));
assert.ok(repair.indexOf('boundHomeCarouselButtons.add(button)') < repair.indexOf("button.addEventListener('click'"));

console.log('Noctra v178 - liaison directe des fleches Jellyfin : OK');
