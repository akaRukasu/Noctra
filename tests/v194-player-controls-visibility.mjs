import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes('function revealNativePlayerControls(event)'));
assert.ok(shell.includes("document.body.classList.add('noctra-player-controls-visible')"));
assert.ok(shell.includes('}, 3_200)'));
assert.ok(shell.includes("document.addEventListener('pointermove', revealNativePlayerControls"));
assert.ok(shell.includes("document.addEventListener('pointerdown', revealNativePlayerControls"));
assert.ok(shell.includes("document.addEventListener('touchstart', revealNativePlayerControls"));
assert.match(theme, /noctra-player-controls-visible[\s\S]*?videoOsdBottom\.hide[\s\S]*?display:\s*flex !important/);
assert.match(theme, /body\.noctra-playing #noctra-dock[\s\S]*?display:\s*none !important/);

console.log('Noctra v194 - visibilité des commandes Jellyfin : OK');
