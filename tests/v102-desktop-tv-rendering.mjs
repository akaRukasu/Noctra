import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(shell.includes("const desktopWorkspacePanels = new Set(['files'])"), 'La TV et Discovery ne doivent pas faire partie des workspaces immersifs desktop.');
assert.ok(css.includes('Noctra v102 — rendu TV desktop'));
assert.ok(css.includes('#noctra-panel[data-noctra-panel-kind="tv"] .noctra-tv-screen video'));
assert.ok(css.includes('contain: none !important;'));
assert.ok(css.includes('.noctra-tv-channel-list[data-virtual="true"]'), 'La virtualisation/zapping doit rester optimisée.');
console.log('Rendu TV desktop Noctra v102 : OK');
