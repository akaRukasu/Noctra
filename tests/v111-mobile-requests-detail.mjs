import fs from 'node:fs';
import assert from 'node:assert/strict';

const css = fs.readFileSync(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.match(server, /version: '200\.0\.21'/);
assert.match(css, /Noctra V111 — Demandes : responsive mobile intégral \+ fiche média plein écran/);
assert.match(css, /\.noctra-media-detail-layer\s*\{[\s\S]*?inset:\s*max\(4px, env\(safe-area-inset-top\)\) 0 0 0 !important;/);
assert.match(css, /\.noctra-media-detail-body\s*\{[\s\S]*?var\(--noctra-v36-dock-space, 92px\)/);
assert.match(css, /\.noctra-media-detail-body\s*\{[\s\S]*?box-sizing:\s*border-box !important;/);
assert.match(css, /\.noctra-media-detail-head\s*\{[\s\S]*?box-sizing:\s*border-box !important;/);
assert.match(css, /#noctra-panel\[data-noctra-panel-kind="requests"\][\s\S]*?height:\s*100dvh !important;/);
assert.match(css, /\.noctra-request-config[\s\S]*?width:\s*100% !important;/);
assert.match(css, /\.noctra-request-row-actions[\s\S]*?grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\) !important;/);
assert.match(css, /\.noctra-discovery-actions[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0,1fr\)\) !important;/);
console.log('v111 mobile request/detail regression checks passed');
