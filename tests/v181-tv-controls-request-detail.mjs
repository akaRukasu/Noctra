import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const css = await readFile(new URL('public/noctra-theme.css', root), 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes('function scheduleTvDesktopControlsHide(delay = 800)'));
assert.ok(shell.includes("bar.matches(':hover') || bar.contains(document.activeElement)"));
assert.ok(shell.includes('else if (enabled) scheduleTvDesktopControlsHide();'));
assert.ok(!shell.includes('!tvFullscreenIsActive(screen) || video.paused'));

const releaseCss = css.slice(css.indexOf('/* Noctra V181'));
assert.match(releaseCss, /body\.noctra-media-detail-open #noctra-dock \{[\s\S]*?visibility: hidden !important;[\s\S]*?pointer-events: none !important;/);
assert.match(releaseCss, /\.noctra-media-detail-layer \{[\s\S]*?inset: 8px !important;[\s\S]*?border-radius: 8px !important;/);
assert.match(releaseCss, /\.noctra-media-detail-head h2 \{[\s\S]*?font-size: clamp\(1\.9rem, 2\.8vw, 3\.1rem\) !important;[\s\S]*?letter-spacing: 0 !important;/);
assert.ok(!css.includes('body:not(.noctra-tv-native-fullscreen):not(.noctra-tv-pseudo-fullscreen)'));

console.log('Noctra v181 - commandes TV et fiche Demandes : OK');
