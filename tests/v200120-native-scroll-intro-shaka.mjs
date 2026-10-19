// 200.0.120 — défilement natif sur PC, un seul écran de démarrage, fenêtre du
// direct Shaka élargie (plus de sauts qui annulent les téléchargements).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [shell, css, aurora, html, vendor] = await Promise.all([
  read('public/noctra-shell.js'), read('public/noctra-aurora.css'), read('public/noctra-aurora.js'),
  read('public/client/index.html'), read('public/vendor/shaka-player.compiled.js')
]);

// 1. PC : molette native (le script de lissage n'est plus installé sur desktop).
assert.match(shell, /document\.documentElement\.classList\.toggle\('noctra-native-wheel', performanceDesktop \|\| ultrawide\);/);
assert.ok(!/classList\.toggle\('noctra-native-wheel', false\)/.test(shell));
assert.ok(shell.indexOf('    syncViewportProfile();') < shell.indexOf('    installDesktopSmoothWheel();'), 'Profil posé avant l’installation du lissage');
assert.match(shell, /function installDesktopSmoothWheel\(\) \{[\s\S]{0,200}classList\.contains\('noctra-native-wheel'\)\) \{[\s\S]{0,200}return;/);

// 2. Un seul écran de démarrage : l'intro Noctra est dans la page, le logo Jellyfin masqué.
assert.ok(html.indexOf('<div id="na-intro" aria-hidden="true">') > html.indexOf('<div id="reactRoot">'));
assert.ok(html.indexOf('noctra-aurora.css') < html.indexOf('<body'), 'Styles de l’intro chargés avant le premier rendu');
const block = css.slice(css.indexOf('200.0.120 — Un seul écran de démarrage'));
assert.match(block, /#reactRoot > \.splashLogo \{visibility:hidden!important;/);
assert.match(block, /animation:na-intro-failsafe \.01s linear 12s forwards!important;/, 'Jamais bloquée si le script manque');
assert.match(block, /#na-intro\.na-intro-leave \{opacity:0;visibility:hidden;\}/);
assert.match(block, /@media \(prefers-reduced-motion:no-preference\) \{\s*html\[data-noctra-skin="aurora"\]:not\(#na-skin\) #na-intro img \{animation:na-intro-mark/);
// Retrait quand l'application est prête (logo Jellyfin disparu), 1,1 s minimum la
// première fois, 10 s maximum, immédiat vers la lecture.
const intro = aurora.slice(aurora.indexOf('const playIntro = () => {'), aurora.indexOf('  try {\n    if (document.body) playIntro();'));
assert.match(intro, /let intro = document\.getElementById\('na-intro'\);/);
assert.match(intro, /const minimum = [^;]*!motionAllowed\(\)[^;]*;/); // durée allongée en 200.0.121
assert.match(intro, /const booting = document\.querySelector\('#reactRoot > \.splashLogo'\);/);
assert.match(intro, /if \(\/video\|playback\/i\.test\(location\.hash\) \|\| \(!booting && now >= minimum\) \|\| now > 10000\) leave\(\);/);
assert.ok(!/pointer-events:auto/.test(block), 'Aucune interaction interceptée');

// 3. Shaka : fenêtre du direct de 120 s sur le lecteur et la multivue.
assert.equal((shell.match(/availabilityWindowOverride: 120/g) || []).length, 2);
// Avec le vrai Shaka 5.2.10 : tolérance au blocage avant éjection de la fenêtre.
const context = { console, setTimeout, clearTimeout, setInterval, clearInterval, TextDecoder, TextEncoder, URL, AbortController, navigator: { userAgent: 'test' } };
context.self = context; context.global = context; vm.createContext(context); vm.runInContext(vendor, context);
const tolerance = availability => vm.runInContext(`(() => {
  let now = 1000000; Date.now = () => now;
  const tl = new shaka.media.PresentationTimeline(now / 1000 - 36, 30, false);
  tl.setStatic(false); tl.setSegmentAvailabilityDuration(${availability}); tl.notifyMaxSegmentDuration(6);
  const playhead = tl.getSeekRangeEnd();
  for (let s = 0; s <= 180; s++) { now = 1000000 + s * 1000; if (tl.getSeekRangeStart() > playhead) return s; }
  return Infinity;
})()`, context);
const before = tolerance(36), after = tolerance(120);
assert.ok(before <= 8, `Fenêtre de playlist (~36 s) : éjection après ${before} s de blocage (boucle observée)`);
assert.ok(after >= 85, `Fenêtre 120 s : ${after} s de tolérance`);
// Le paramètre est bien appliqué par l'analyseur HLS de Shaka.
assert.match(vendor, /isNaN\(a\.h\.availabilityWindowOverride\)\|\|\(b=a\.h\.availabilityWindowOverride\);a\.m\.ji\(b\)/);

console.log(`v200.0.120 : molette native, écran de démarrage unique, fenêtre du direct Shaka ${before} s → ${after} s de tolérance : OK`);
