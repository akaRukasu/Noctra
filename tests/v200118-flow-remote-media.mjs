// 200.0.118 — « Aurora Flow » (mouvement piloté par le défilement, ressort,
// projecteur) ; sous-titres dans le lecteur natif iOS / PiP ; bouton Diffuser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [css, aurora, media, appearance, html, chrome] = await Promise.all([
  read('public/noctra-aurora.css'), read('public/noctra-aurora.js'), read('public/noctra-remote-media.js'),
  read('public/noctra-subtitle-appearance.js'), read('public/client/index.html'), read('public/noctra-player-chrome.css')
]);
const block = css.slice(css.indexOf('200.0.118 — « Aurora Flow »'));
const code = block.replace(/\/\*[\s\S]*?\*\//g, '');

// 1. Ressort : courbe linear() seulement si le navigateur la connaît.
assert.match(code, /@supports \(transition-timing-function: linear\(0, 1\)\) \{\s*:root\[data-noctra-skin="aurora"\] \{\s*--na-ease:linear\(0,/);

// 2-3. Les effets de défilement par rangée/affiche et le projecteur ont été
//      retirés en 200.0.119 (≈ 380 couches graphiques sur un accueil réel) :
//      voir tests/v200119-*. Restent la parallaxe de l'affiche et la pression à ressort.
assert.match(code, /\.noctra-premiere-picture \{\s*translate:none;animation:na-flow-parallax linear both!important;animation-timeline:scroll\(root\)!important;/);
assert.ok(!/infinite/.test(code));
assert.ok(!/#noctra-dock/.test(code), 'Dock intact');
assert.ok(!/(^|[\s>,(])(video|iframe)\b[^{]*\{/.test(code), 'Rien sur la vidéo');
assert.match(aurora, /if \(cssScroll \|\| !perfDesktop\(\)/);
assert.match(code, /:active \{\s*scale:\.94;transition:scale \.09s ease-out!important;/);

// 4. Sous-titres dans le lecteur natif iOS / PiP / AirPlay.
assert.ok(html.indexOf('noctra-remote-media.js') > html.indexOf('main.jellyfin.bundle.js'), 'Chargé après Jellyfin');
for (const type of ['webkitbeginfullscreen', 'webkitendfullscreen', 'enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']) assert.ok(media.includes(`'${type}'`), type);
assert.match(media, /api\.getSessions\(\{ deviceId: api\.deviceId\(\) \}\)/);
assert.match(media, /Subtitles\/\$\{index\}\/0\/Stream\.vtt`, \{ api_key: api\.accessToken\(\) \}/);
assert.match(media, /if \(stream && stream\.IsTextSubtitleStream === false\) return \{ image: true \};/, 'Sous-titres image ignorés');
assert.match(media, /if \(nativeShowing\(video\)\) return;/, 'Piste native Jellyfin respectée');
assert.match(media, /if \(text === lastText\) return;/, 'Copie de secours sans clignotement');
assert.match(media, /element\.remove\(\);/, 'Piste retirée au retour dans la page');
assert.match(media, /video\.webkitCurrentPlaybackTargetIsWireless\)/, 'Actif aussi en AirPlay');

// 5. Diffuser : AirPlay ou Remote Playback, bouton visible seulement si un appareil est disponible.
assert.match(media, /video\.webkitShowPlaybackTargetPicker\(\)/);
assert.match(media, /await video\.remote\.prompt\(\)/);
assert.match(media, /event\.availability === 'available'/);
assert.match(media, /video\.remote\.watchAvailability\(/);
assert.match(media, /button\.classList\.toggle\('hide', !\(available \|\| wireless\)\)/);
assert.match(chrome, /\.btnNoctraCast\[data-active="true"\]/);
assert.ok(!/localStorage|sessionStorage|XMLHttpRequest/.test(media), 'Aucun stockage');

// 6. Correctif « Apparence » limité au WebKit d'Apple (revue de code 117).
assert.match(appearance, /if \(!appleWebKit\) return;/);
assert.ok(!/CSS\.supports/.test(appearance));

console.log('v200.0.118 : Aurora Flow, sous-titres dans le lecteur iOS / PiP et diffusion AirPlay : OK');
