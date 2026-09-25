// 200.0.112 — image de l'affiche d'accueil adaptée à son format et à l'appareil.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-aurora.css', import.meta.url), 'utf8');

// Résolution demandée selon l'écran : 1280 à 2560 px, densité plafonnée à 2.
const source = shell.slice(shell.indexOf('  function premiereImageWidth('), shell.indexOf('\n  }', shell.indexOf('  function premiereImageWidth(')) + 4);
const widthFor = (innerWidth, devicePixelRatio, screenWidth = innerWidth) =>
  new Function('window', `${source};return premiereImageWidth();`)({ innerWidth, devicePixelRatio, screen: { width: screenWidth } });
assert.equal(widthFor(390, 3), 1280, 'Mobile : jamais sous 1280 px');
assert.equal(widthFor(1440, 1), 1440);
assert.equal(widthFor(1440, 2), 2560, 'Écran haute densité : 2560 px maximum');
assert.equal(widthFor(1920, 1), 1920);
assert.equal(widthFor(3840, 1), 2560);
assert.equal(widthFor(1366, 1) % 160, 0, 'Paliers de 160 px (cache Jellyfin partagé)');
assert.match(shell, /maxWidth: premiereImageWidth\(\)/);
assert.match(shell, /url\.searchParams\.set\('fillHeight', String\(Math\.round\(width \* 9 \/ 16\)\)\)/);

// Format réel mesuré au chargement de l'image.
assert.match(shell, /art\.dataset\.shape = shape < 1\.2 \? 'portrait' : shape < 1\.6 \? 'square' : 'landscape';/);
assert.match(shell, /art\.style\.setProperty\('--noctra-art-url'/);

// Poster entier sur fond flouté, paysage plein cadre, composition mobile dédiée.
assert.match(css, /\.noctra-premiere-art::before \{[^}]*var\(--noctra-art-url/);
assert.match(css, /\[data-shape="portrait"\],\[data-shape="square"\]\) \.noctra-premiere-picture \{[^}]*object-fit:contain!important/);
const mobile = css.slice(css.lastIndexOf('@media (max-width:760px)'));
assert.match(mobile, /height:60%!important/);
assert.match(mobile, /height:30%!important/);

console.log('v200.0.112 : affiche d’accueil adaptée au format de l’image et à l’écran : OK');
