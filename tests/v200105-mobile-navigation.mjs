import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const responsive = await readFile(new URL('public/noctra-responsive.css', root), 'utf8');

assert.ok(shell.includes('function navigateNoctraBack()'));
assert.ok(shell.includes('if (location.href === before) goHome();'));
assert.ok(shell.includes("event.target.closest('#noctra-back')"));
assert.ok(shell.includes("button.addEventListener('pointerup', activate"));
assert.ok(shell.includes('if (items.length < 2) return;'));
assert.ok(responsive.includes('.noctra-premiere-controls {position:absolute !important;left:22px !important'));
assert.ok(responsive.includes('z-index:20 !important'));
const tvStudio = await readFile(new URL('public/noctra-tv-studio.css', root), 'utf8');
assert.ok(tvStudio.includes('.noctra-premiere .noctra-premiere-controls'));
assert.ok(tvStudio.includes('grid-template-columns:44px 44px 44px 44px!important'));
assert.ok(tvStudio.includes('position:static!important;inset:auto!important'));
assert.ok(tvStudio.includes('display:flex!important;flex-direction:column!important'));
assert.ok(tvStudio.includes('position:static!important;inset:auto!important;left:auto!important'));
assert.ok(tvStudio.includes('overflow-wrap:anywhere!important'));
assert.ok(tvStudio.includes('height:min(78vh,620px)!important;min-height:520px!important;max-height:640px!important'));
assert.ok(tvStudio.includes('-webkit-line-clamp:2!important'));
assert.ok(tvStudio.includes('margin-top:auto!important;padding:0 22px 24px!important'));
assert.ok(tvStudio.includes("object-position:center 22%!important"));
assert.ok(responsive.includes('touch-action:manipulation'));
assert.ok(responsive.includes('.noctra-premiere-controls > button svg {pointer-events:none'));

console.log('v200.105 : navigation retour et commandes du hero mobile : OK');
