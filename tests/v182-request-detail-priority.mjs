import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const css = await readFile(new URL('public/noctra-theme.css', root), 'utf8');

assert.equal(pkg.version, '200.0.21');

const releaseStart = css.lastIndexOf('/* Noctra V182');
const oldDockRule = css.slice(0, releaseStart).lastIndexOf('body #noctra-dock[data-role]');
assert.ok(releaseStart > oldDockRule, 'La règle de la fiche doit rester après les anciens correctifs du dock.');

const releaseCss = css.slice(releaseStart);
assert.match(releaseCss, /html body\.noctra-media-detail-open #noctra-dock\[data-role\][\s\S]*?visibility: hidden !important;[\s\S]*?pointer-events: none !important;/);
assert.match(releaseCss, /html body\.noctra-media-detail-open #noctra-panel > \.noctra-panel-header[\s\S]*?visibility: hidden !important;/);

console.log('Noctra v182 - fiche Demandes prioritaire : OK');
