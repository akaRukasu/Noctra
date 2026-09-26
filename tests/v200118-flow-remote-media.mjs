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

// 2. Défilement natif : tout est sous @supports + mouvement autorisé + na-motion, jamais en lecture.
const scroll = code.slice(code.indexOf('@supports (animation-timeline: view())'), code.indexOf('@keyframes na-flow-rise'));
assert.match(scroll, /@media \(prefers-reduced-motion:no-preference\)/);
for (const rule of scroll.match(/[^{}]+\{[^{}]*animation:na-[^{}]*\}/g) ?? []) {
  assert.ok(rule.includes('.na-motion') && rule.includes(':not(.noctra-playing)'), rule.slice(0, 100));
}
assert.match(scroll, /\.verticalSection \{\s*animation:na-flow-rise linear both!important;animation-timeline:view\(\)!important;animation-range:entry 0% entry 55%!important;/);
// Profondeur : une seule animation (entrée + sortie) pour ne pas s'écraser l'une l'autre ; desktop seulement.
assert.match(scroll, /noctra-performance-desktop[^{]*\.scrollSlider > \.card \{\s*animation:na-flow-depth linear both!important;animation-timeline:view\(inline\)!important;/);
assert.match(code, /@keyframes na-flow-depth \{\s*entry 0% \{opacity:\.3;scale:\.84;\} entry 100% \{opacity:1;scale:1;\}\s*exit 0% \{opacity:1;scale:1;\} exit 100% \{opacity:\.3;scale:\.84;\}/);
assert.match(scroll, /\.noctra-premiere-picture \{\s*translate:none;animation:na-flow-parallax linear both!important;animation-timeline:scroll\(root\)!important;/);
// Uniquement opacité / scale / translate (calculés par le GPU), aucune animation continue.
for (const frames of code.match(/@keyframes na-flow-[\w-]+ \{[\s\S]*?\}\s*\}/g) ?? []) {
  assert.ok(!/(width|height|top|left|filter|box-shadow|clip-path|background)/.test(frames), frames.slice(0, 60));
}
assert.ok(!/infinite/.test(code));
assert.ok(!/#noctra-dock/.test(code), 'Dock intact');
assert.ok(!/(^|[\s>,(])(video|iframe)\b[^{]*\{/.test(code), 'Rien sur la vidéo');

// Le script s'efface quand le navigateur anime lui-même.
assert.match(aurora, /cssScroll = Boolean\(window\.CSS\?\.supports\?\.\('animation-timeline: view\(\)'\)\)/);
assert.match(aurora, /if \(cssScroll \|\| !revealObserver/);
assert.match(aurora, /if \(cssScroll \|\| !perfDesktop\(\)/);

// 3. Projecteur au survol (pointeur fin) et pression à ressort.
assert.match(code, /@media \(prefers-reduced-motion:no-preference\) and \(hover:hover\) and \(pointer:fine\)[\s\S]*?\.scrollSlider:has\(> \.card:hover\) > \.card:not\(:hover\) \.cardBox \{\s*opacity:\.42;/);
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
