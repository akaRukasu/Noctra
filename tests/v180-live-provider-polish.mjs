import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const server = await readFile(new URL('server.mjs', root), 'utf8');
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const css = await readFile(new URL('public/noctra-theme.css', root), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));

assert.ok(shell.includes('const startPublicFallback = reason =>'));
assert.ok(shell.includes("recordTvDiagnostic('livewatch-public-fallback-start'"));
assert.ok(shell.includes("item?.vip !== true"));
assert.ok(shell.includes('le lecteur public reste disponible manuellement'));
assert.equal(shell.includes("startPublicFallback('aucune image VIP après 16 secondes')"), false);
assert.ok(shell.includes('}, 16_000);'));

assert.ok(server.includes('const emptyYouTubeEmbed ='));
assert.ok(server.includes('if (emptyYouTubeEmbed || emptyYouTubeShortLink) return;'));
assert.ok(shell.includes("const wiTvWebFrame = channel.provider === 'WiTV'"));
assert.ok(shell.includes('WiTV · lecteur web chargé · démarre la lecture dans le lecteur'));

assert.match(css, /\[data-noctra-header-menu="syncplay"\] \.actionSheetMenuItem > svg\[data-noctra-material-icon\] \{[\s\S]*?display: none !important;/);

console.log('Noctra v180 - secours TV et menu SyncPlay : OK');
