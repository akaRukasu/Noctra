import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const fallbackStart = shell.indexOf("window.addEventListener('click', event => {");
const fallbackEnd = shell.indexOf("document.addEventListener('click', async event =>", fallbackStart);
const fallback = shell.slice(fallbackStart, fallbackEnd);

assert.ok(fallback.includes('if (boundHomeCarouselButtons.has(carouselButton)) return;'));
assert.ok(fallback.indexOf('boundHomeCarouselButtons.has(carouselButton)') < fallback.indexOf('moveHomeCarousel(carouselButton)'));

console.log('Noctra v178 - un seul deplacement par clic de carrousel : OK');
