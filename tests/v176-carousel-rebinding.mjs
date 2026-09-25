import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');

assert.ok(shell.includes('const boundHomeCarouselButtons = new WeakSet();'));
assert.ok(shell.includes('if (!boundHomeCarouselButtons.has(button))'));
assert.ok(shell.includes('boundHomeCarouselButtons.add(button)'));
assert.ok(!shell.includes("if (button.dataset.noctraCarouselBound !== 'true')"));

console.log('Noctra v178 - reconnexion des fleches apres remplacement Jellyfin : OK');
