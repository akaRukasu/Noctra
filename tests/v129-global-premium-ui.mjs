import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(theme.includes('Noctra V129 - finition premium globale'));
assert.ok(theme.includes('--noctra-violet-soft: #b49ae5'));
assert.ok(theme.includes('--noctra-blue-soft: #84b6e3'));
assert.ok(theme.includes('--noctra-amber: #e4b96f'));
assert.match(theme, /\.noctra-library-card \{[\s\S]*?border-radius: 14px !important/);
assert.match(theme, /\.noctra-button,[\s\S]*?border-radius: 10px !important/);
assert.match(theme, /\.noctra-media-detail-main,[\s\S]*?border-radius: 12px !important/);

assert.ok(theme.includes('#noctra-panel[data-noctra-panel-kind="libraries"] .noctra-panel-body'));
assert.ok(theme.includes('#noctra-panel[data-noctra-panel-kind="downloads"] .noctra-panel-body'));
assert.ok(theme.includes('#noctra-panel[data-noctra-panel-kind="automation"] .noctra-panel-body'));
assert.ok(theme.includes('#noctra-panel[data-noctra-panel-kind="tv"] .noctra-tv-navigation'));
assert.ok(theme.includes('.noctra-panel-header > div { padding-top: 38px !important; }'));
assert.match(theme, /\.noctra-library-card \{[\s\S]*?width: 100% !important;[\s\S]*?min-width: 0 !important;[\s\S]*?min-height: 0 !important/);
assert.ok(theme.includes('.noctra-arr-metrics { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; }'));
assert.ok(theme.includes('V129 - boutons sans contour permanent'));
assert.match(theme, /\.noctra-button,[\s\S]*?\.noctra-torrent-actions \[data-torrent-maintenance\][\s\S]*?border-color: transparent !important/);
assert.match(theme, /\.noctra-button:focus-visible,[\s\S]*?outline: 0 !important;[\s\S]*?filter: brightness\(1\.16\) !important/);
assert.match(theme, /\.noctra-tabs,[\s\S]*?\.noctra-service-tabs \{[\s\S]*?border-color: transparent !important/);

const announceIcon = shell.match(/announce: '(<svg[^']+)'/)?.[1];
const verifyIcon = shell.match(/verify: '(<svg[^']+)'/)?.[1];
assert.ok(announceIcon?.includes('m3 11 18-5v12L3 14z'));
assert.ok(verifyIcon?.includes('M20 13c0 5'));
assert.notEqual(announceIcon, verifyIcon);
assert.ok(shell.includes('${icons.announce}</button>'));
assert.ok(shell.includes('${icons.verify}</button>'));
assert.ok(shell.includes('data-torrent-maintenance="reannounce"'));
assert.ok(shell.includes('data-torrent-maintenance="recheck"'));

assert.ok(shell.includes('PiP bloqué par iOS · mode app'));
assert.ok(shell.includes('La PWA installée depuis Safari fonctionne en mode app autonome.'));
assert.ok(!shell.includes('PiP · disponible dans Safari'));

assert.ok(shell.includes("let activeAutomation = 'radarr';"));
assert.ok(shell.includes("function openAutomation(type = 'radarr', view = 'overview')"));
assert.ok(shell.indexOf('data-arr="radarr"') < shell.indexOf('data-arr="sonarr"'));
assert.ok(shell.includes('RADARR · SONARR · PROWLARR'));
assert.ok(shell.includes('const dt = lastFrameAt ? Math.min(34, Math.max(.25, now - lastFrameAt)) : 0;'));
assert.ok(shell.includes('const response = 1 - Math.exp(-dt / 68);'));
assert.ok(shell.includes('frame = requestAnimationFrame(animate);'));
assert.ok(!shell.includes('1000 / 120'));

console.log('V129 global premium UI, torrent icons and refresh-rate fluidity checks: OK');
