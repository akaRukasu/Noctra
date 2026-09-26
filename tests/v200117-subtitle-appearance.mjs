// 200.0.117 — section « Apparence » des sous-titres affichée sur Safari / iOS
// récent, où getComputedStyle(video, '::cue') renvoie un fond vide.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const script = await readFile(new URL('public/noctra-subtitle-appearance.js', root), 'utf8');
const html = await readFile(new URL('public/client/index.html', root), 'utf8');
const bundle = await readFile(new URL('public/client/main.jellyfin.bundle.js', root), 'utf8');

// Chargé avant le bundle Jellyfin, qui évalue la détection au démarrage.
const at = name => html.indexOf(name);
assert.ok(at('noctra-subtitle-appearance.js') > 0 && at('noctra-subtitle-appearance.js') < at('main.jellyfin.bundle.js'));

// La détection Jellyfin, extraite telle quelle du bundle.
const start = bundle.indexOf('try{var e=document.createElement("video"),t=document.createElement("style");t.textContent="video::cue');
assert.ok(start > 0, 'Détection Jellyfin introuvable');
const detection = `(function(){${bundle.slice(start, bundle.indexOf('}}()', start) + 1)}})()`;

const run = ({ ua, platform = 'iPhone', touch = 5, background = '', cssSelector = false }) => {
  class Element { constructor(name) { this.localName = name; } }
  const calls = [];
  const nativeStyle = (element, pseudo) => {
    calls.push(pseudo);
    return { background: pseudo === '::cue' ? background : 'rgb(0, 0, 0)', color: 'red', getPropertyValue(name) { return this[name]; } };
  };
  const document = {
    createElement: name => new Element(name),
    body: { appendChild() {}, removeChild() {} }
  };
  const context = {
    Element, document, console, Proxy, Reflect,
    navigator: { userAgent: ua, platform, maxTouchPoints: touch },
    CSS: { supports: () => cssSelector }
  };
  context.window = context;
  context.getComputedStyle = context.window.getComputedStyle = nativeStyle;
  vm.createContext(context);
  vm.runInContext(script, context);
  return { context, supported: vm.runInContext(detection.replaceAll('window.getComputedStyle', 'window.getComputedStyle'), context), nativeStyle };
};

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
const ipadDesktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15';
const chrome = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

// 1. iOS 27 (fond ::cue vide) : la section redevient disponible, iPhone comme iPad.
assert.equal(run({ ua: iphone }).supported, true, 'iPhone');
assert.equal(run({ ua: ipadDesktop, platform: 'MacIntel', touch: 5 }).supported, true, 'iPad en mode bureau');
// 2. Navigateurs qui répondent déjà correctement : rien ne change.
{
  const { context, nativeStyle } = run({ ua: chrome, background: 'rgba(0, 0, 0, 0.8)', cssSelector: true });
  assert.equal(vm.runInContext(detection, context), true);
  const video = new context.Element('video');
  assert.equal(context.getComputedStyle(video, '::cue').background, 'rgba(0, 0, 0, 0.8)');
  assert.equal(nativeStyle, context.getComputedStyle, 'Hors WebKit Apple : aucun correctif (200.0.118)');
}
// 3. Autre moteur, même annonçant ::cue : aucun correctif (une réponse vide peut y être réelle).
{
  const { context, nativeStyle, supported } = run({ ua: chrome, cssSelector: true });
  assert.equal(context.getComputedStyle, nativeStyle);
  assert.equal(supported, false);
}
// 4. Tout autre appel est inchangé ; le style corrigé reste utilisable.
{
  const { context } = run({ ua: iphone });
  const video = new context.Element('video'), div = new context.Element('div');
  assert.equal(context.getComputedStyle(div, '::cue').background, '');
  assert.equal(context.getComputedStyle(video).background, 'rgb(0, 0, 0)');
  const cue = context.getComputedStyle(video, '::cue');
  assert.equal(cue.background, 'inherit');
  assert.equal(cue.color, 'red');
  assert.equal(cue.getPropertyValue('color'), 'red');
  // Chargé deux fois : un seul correctif.
  const once = context.getComputedStyle;
  vm.runInContext(script, context);
  assert.equal(context.getComputedStyle, once);
}
// 5. Aucun accès réseau ni stockage.
assert.ok(!/fetch\(|XMLHttpRequest|localStorage|ApiClient/.test(script));

console.log('v200.0.117 : apparence des sous-titres disponible sur Safari / iOS récent : OK');
