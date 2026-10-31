/* Noctra TV : nettoyage des publicites dans les pages des lecteurs externes.
   Injecte par l'appli Android TV (bloqueur de pubs active) au debut de chaque
   page de lecteur et de ses cadres, avant leurs propres scripts.
   - bibliotheque publicitaire aclib (pop-under, fausses notifications, bannieres)
     remplacee par une version vide ;
   - incrustations flottantes retirees : elements fixes par-dessus la page (fausse
     notification "in-page push" dans un coin, voile transparent qui ouvre une
     publicite au premier clic) qui menent vers un autre site, ou cadres
     d'un autre site poses par-dessus. Jamais un element qui contient la video
     ou le grand cadre du lecteur.
   ES5, ASCII seulement : la page est modifiee octet par octet. */
(function () {
  'use strict';
  if (window.__noctraAdblock) return;
  window.__noctraAdblock = 1;
  var noop = function () {};
  var aclib = { runPop: noop, runAutoTag: noop, runBanner: noop, runInPagePush: noop, runVideoSlider: noop, runInterstitial: noop, runNative: noop };
  try { Object.defineProperty(window, 'aclib', { configurable: false, get: function () { return aclib; }, set: noop }); } catch (error) { /* deja defini */ }

  // Racines d'ombre fermees : ouvertes pour pouvoir inspecter leur contenu.
  try {
    var attach = Element.prototype.attachShadow;
    if (attach) {
      Element.prototype.attachShadow = function (options) {
        var copy = {};
        for (var key in options) copy[key] = options[key];
        copy.mode = 'open';
        return attach.call(this, copy);
      };
    }
  } catch (error) { /* moteur sans Shadow DOM */ }

  var css = '[id^="inpage" i],[class*="inpage-push" i],[class*="in-page-push" i],[id*="in-page-push" i],'
    + '[class*="push-notification" i][style*="fixed"],[id*="pushnotif" i]{display:none!important}';
  function addStyle() {
    try {
      var style = document.createElement('style');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    } catch (error) { /* page sans tete */ }
  }

  var me = location.hostname;
  function siteOf(host) {
    var parts = String(host || '').toLowerCase().split('.');
    return parts.slice(-2).join('.');
  }
  function foreign(url) {
    if (!url || /^(?:javascript:|#|about:|data:|blob:)/i.test(url)) return false;
    try {
      var host = new URL(url, location.href).hostname;
      return Boolean(host) && siteOf(host) !== siteOf(me);
    } catch (error) { return false; }
  }
  function area(node) {
    var rect = node.getBoundingClientRect();
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }
  var screen = function () { return Math.max(1, window.innerWidth * window.innerHeight); };

  // Contenu du lecteur : la video, ou un grand cadre (lecteur d'un autre site).
  function holdsPlayer(node) {
    if (node.tagName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) return true;
    var frames = node.tagName === 'IFRAME' ? [node] : (node.querySelectorAll ? node.querySelectorAll('iframe') : []);
    for (var i = 0; i < frames.length; i++) if (area(frames[i]) > screen() * 0.3) return true;
    return false;
  }
  function leadsAway(node) {
    var roots = [node];
    if (node.shadowRoot) roots.push(node.shadowRoot);
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      if (root.tagName === 'A' && foreign(root.getAttribute('href'))) return true;
      if (root.tagName === 'IFRAME' && foreign(root.getAttribute('src'))) return true;
      var links = root.querySelectorAll ? root.querySelectorAll('a[href],iframe[src]') : [];
      for (var i = 0; i < links.length; i++) {
        if (foreign(links[i].getAttribute(links[i].tagName === 'A' ? 'href' : 'src'))) return true;
      }
    }
    return false;
  }
  function floating(node) {
    var style;
    try { style = window.getComputedStyle(node); } catch (error) { return false; }
    if (!style || style.position !== 'fixed') return false;
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  var removed = 0;
  function check(node) {
    if (!node || node.nodeType !== 1 || node === document.body || node === document.documentElement) return;
    if (!floating(node) || holdsPlayer(node) || !leadsAway(node)) return;
    try { node.parentNode.removeChild(node); removed++; } catch (error) { /* deja retire */ }
  }
  // Incrustations posees a la racine de la page (ou un niveau plus bas).
  function sweep() {
    var body = document.body;
    if (!body) return;
    var tops = [];
    var lists = [body.children, document.documentElement.children];
    for (var l = 0; l < lists.length; l++) {
      for (var i = 0; i < lists[l].length; i++) {
        var child = lists[l][i];
        if (child === body || child.tagName === 'HEAD' || child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
        tops.push(child);
        for (var j = 0; j < child.children.length; j++) tops.push(child.children[j]);
      }
    }
    for (var t = 0; t < tops.length; t++) check(tops[t]);
  }
  var queued = false;
  function soon() {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; sweep(); }, 120);
  }
  function start() {
    addStyle();
    sweep();
    try { new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true }); } catch (error) { /* ancien moteur */ }
    setInterval(sweep, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  window.__noctraAdblockRemoved = function () { return removed; };
})();
