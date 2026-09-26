// Noctra 200.0.117 — section « Apparence » des sous-titres sur Safari / iOS.
// Jellyfin n'affiche cette section que si getComputedStyle(video, '::cue')
// renvoie un fond. Les versions récentes de WebKit (iOS 27) renvoient une
// valeur vide alors qu'elles appliquent bien les styles ::cue : la section
// disparaissait pour tous les comptes. Seul ce test précis est corrigé ; tout
// autre appel à getComputedStyle est rendu tel quel.
(() => {
  'use strict';
  const native = window.getComputedStyle;
  if (typeof native !== 'function' || native.__noctraCue) return;
  const ua = navigator.userAgent || '';
  const appleWebKit = /iP(?:hone|ad|od)/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || (/AppleWebKit/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|Android/.test(ua));
  let cueSupported = appleWebKit;
  try { cueSupported = cueSupported || CSS.supports('selector(::cue)'); } catch { /* ancien moteur */ }
  if (!cueSupported) return;

  const patched = function getComputedStyle(element, pseudo) {
    const style = native.apply(this === undefined ? window : this, arguments);
    if (pseudo !== '::cue' || !(element instanceof Element) || element.localName !== 'video') return style;
    let background = '';
    try { background = style.background; } catch { /* style inaccessible */ }
    if (background) return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === 'background') return 'inherit';
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };
  patched.__noctraCue = true;
  try { window.getComputedStyle = patched; } catch { /* lecture seule : comportement Jellyfin d'origine */ }
})();
