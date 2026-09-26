/* 200.0.121 — Pont entre l'interface web Noctra et les applications Noctra
   (Android, Android TV, iOS, LG webOS, Samsung Tizen).

   Chargé de façon synchrone avant le moteur Jellyfin : il ne dépend de rien et
   reste lisible par les anciens moteurs des téléviseurs (pas de ?. ni de ??),
   afin de ne jamais empêcher le reste de l'interface de démarrer.

   Rôle :
   - reconnaître l'application hôte (paramètre ?noctraApp=, agent utilisateur
     « NoctraApp/x (plateforme) » ajouté par les applis Android/iOS) ;
   - sur téléviseur : touche Retour qui ferme d'abord les panneaux Noctra,
     sortie propre de l'application à l'accueil, focus visible à la
     télécommande, OK qui active les éléments cliquables, touches média ;
   - garder l'écran allumé pendant une lecture (Android) ;
   - exposer window.NoctraApp aux applications natives.

   Sur téléviseur, Noctra garde sa mise en page habituelle (celle du PC) :
   la disposition « TV » de Jellyfin n'est pas prise en charge par l'interface
   Noctra (pas de dock, en-tête réduit). La navigation aux flèches est donc
   assurée ici, par proximité à l'écran. */
(function () {
  'use strict';

  // Déjà chargé (l'appli Android l'injecte aussi quand le serveur est ancien).
  if (window.NoctraApp) return;

  var root = document.documentElement;
  var ua = navigator.userAgent || '';
  var storageKey = 'noctra-app-platform';
  var platforms = { android: 'Android', androidtv: 'Android TV', ios: 'iOS', webos: 'LG webOS', tizen: 'Samsung Tizen' };

  function readStorage(key) { try { return localStorage.getItem(key) || ''; } catch (error) { return ''; } }
  function writeStorage(key, value) { try { localStorage.setItem(key, value); } catch (error) {} }

  function detectPlatform() {
    var fromQuery = '';
    try { fromQuery = String(new URLSearchParams(location.search).get('noctraApp') || '').toLowerCase(); } catch (error) {}
    if (platforms[fromQuery]) return fromQuery;
    // « android-leanback » : Android TV, sans « tv » dans l'agent utilisateur
    // (Jellyfin passerait sinon en disposition TV).
    var agent = /NoctraApp\/[\d.]+ \(([a-z-]+)\)/i.exec(ua);
    var named = agent ? agent[1].toLowerCase() : '';
    if (named === 'android-leanback') return 'androidtv';
    if (platforms[named]) return named;
    // Rechargement de page sur téléviseur : le paramètre a disparu de l'adresse.
    var saved = readStorage(storageKey);
    if (saved === 'webos' && /Web0S|webOS/i.test(ua)) return saved;
    if (saved === 'tizen' && /Tizen/i.test(ua)) return saved;
    return '';
  }

  var platform = detectPlatform();
  if (platform) writeStorage(storageKey, platform);
  var tv = platform === 'webos' || platform === 'tizen' || platform === 'androidtv'
    || (!platform && /Web0S|Tizen|SMART-TV|SmartTV/i.test(ua));
  var version = (/NoctraApp\/([\d.]+)/.exec(ua) || [])[1] || '';

  // Mise en page Noctra habituelle sur téléviseur (réglage « layout » de Jellyfin,
  // lu au démarrage du moteur, donc avant les scripts différés).
  if (tv && readStorage('layout') !== 'desktop') writeStorage('layout', 'desktop');

  /* Canal vers l'appli native.
     Android : après le chargement de la page, l'appli transmet un MessagePort
     au seul cadre principal (postWebMessage limité à l'origine du serveur) ;
     un message venu d'une iframe (source non nulle) est ignoré, donc les
     fournisseurs TV intégrés ne peuvent rien piloter. Les messages émis avant
     l'arrivée du port sont mis en attente.
     iOS : WKScriptMessageHandler « noctra », limité au cadre principal par l'appli. */
  var hostPort = null;
  var hostQueue = [];
  window.addEventListener('message', function (event) {
    if (hostPort || event.data !== 'noctra-host' || event.source || !event.ports || !event.ports[0]) return;
    hostPort = event.ports[0];
    var queued = hostQueue.splice(0, hostQueue.length);
    for (var index = 0; index < queued.length; index += 1) hostPort.postMessage(queued[index]);
  });
  function postNative(action, data) {
    var message = { action: action, data: data === undefined ? null : data };
    try {
      if (platform === 'android' || platform === 'androidtv') {
        var text = JSON.stringify(message);
        if (hostPort) hostPort.postMessage(text);
        else if (hostQueue.length < 20) hostQueue.push(text);
        return true;
      }
      var handlers = window.webkit && window.webkit.messageHandlers;
      if (handlers && handlers.noctra) { handlers.noctra.postMessage(message); return true; }
    } catch (error) {}
    return false;
  }

  if (platform) root.classList.add('noctra-app', 'noctra-app-' + platform);
  if (tv) root.classList.add('noctra-app-tv');

  // ── Compatibilité des moteurs TV (Chromium 85 et suivants) ──────────────
  // Array.prototype.at (Chromium 92) et AbortSignal.timeout (Chromium 103)
  // sont utilisés par l'interface ; ils manquent sur les TV 2021-2022.
  function defineAt(proto) {
    if (!proto || proto.at) return;
    Object.defineProperty(proto, 'at', {
      configurable: true, writable: true,
      value: function (index) {
        var length = this.length >>> 0;
        var position = Math.trunc(Number(index)) || 0;
        if (position < 0) position += length;
        return position < 0 || position >= length ? undefined : this[position];
      }
    });
  }
  defineAt(Array.prototype);
  defineAt(String.prototype);
  if (window.Int8Array) defineAt(Object.getPrototypeOf(Int8Array.prototype));
  if (window.AbortSignal && window.AbortController && !AbortSignal.timeout) {
    AbortSignal.timeout = function (milliseconds) {
      var controller = new AbortController();
      setTimeout(function () {
        var reason;
        try { reason = new DOMException('signal timed out', 'TimeoutError'); } catch (error) { reason = undefined; }
        controller.abort(reason);
      }, milliseconds);
      return controller.signal;
    };
  }

  // Element.replaceChildren (Chromium 86).
  [window.Element, window.Document, window.DocumentFragment].forEach(function (type) {
    var proto = type && type.prototype;
    if (!proto || proto.replaceChildren) return;
    proto.replaceChildren = function () {
      while (this.lastChild) this.removeChild(this.lastChild);
      this.append.apply(this, arguments);
    };
  });

  // ── Android TV : mise en page PC agrandie pour la distance du canapé ─────
  // La WebView d'Android TV annonce souvent 960 px (densité 2) : Noctra
  // choisirait sa mise en page tablette. 1280 px donne la mise en page PC
  // (au-delà de 1180 px), agrandie 1,5× sur un écran 1080p. Pas d'échelle
  // imposée : la WebView (vue d'ensemble) ajuste la page à la largeur de l'écran.
  if (platform === 'androidtv') {
    var viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) viewport.setAttribute('content', 'width=1280,viewport-fit=cover');
  }

  // ── Panneaux Noctra à fermer avant de reculer dans l'historique ─────────
  var overlaySelectors = [
    '#noctra-confirm[data-open="true"]',
    '[data-discovery-torrent-live]',
    '[data-tv-safe-multiview]',
    '[data-tv-safe-tools-menu][data-open="true"]',
    '.noctra-tv-source-picker[open]',
    '#noctra-backdrop[data-open="true"]'
  ];
  function openOverlay() {
    for (var index = 0; index < overlaySelectors.length; index += 1) {
      var node = document.querySelector(overlaySelectors[index]);
      if (node && (node.getClientRects().length || node.id === 'noctra-backdrop')) return node;
    }
    return null;
  }

  // Échap synthétique : l'interface Noctra ferme son panneau le plus haut ;
  // le moteur Jellyfin (qui écoute plus tard sur window) ne le voit jamais.
  var syntheticEscape = false;
  function closeOverlay() {
    if (!openOverlay()) return false;
    var target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
    var event;
    try { event = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }); }
    catch (error) { event = document.createEvent('Event'); event.initEvent('keydown', true, true); event.key = 'Escape'; }
    syntheticEscape = true;
    try { target.dispatchEvent(event); } finally { syntheticEscape = false; }
    return true;
  }
  window.addEventListener('keydown', function (event) {
    if (syntheticEscape && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  function jellyfinDialogOpen() {
    return Boolean(document.querySelector('.dialogContainer .dialog.opened'));
  }
  function atRoot() {
    if (jellyfinDialogOpen()) return false;
    var router = window.Emby && window.Emby.Page;
    if (router && typeof router.canGoBack === 'function') {
      try { return !router.canGoBack(); } catch (error) {}
    }
    return window.history.length <= 1;
  }

  function exitApp() {
    if (postNative('exit')) return;
    try {
      if (window.tizen && tizen.application) { tizen.application.getCurrentApplication().exit(); return; }
    } catch (error) {}
    try {
      if (window.webOS && typeof webOS.platformBack === 'function') { webOS.platformBack(); return; }
      if (window.PalmSystem && typeof PalmSystem.platformBack === 'function') { PalmSystem.platformBack(); return; }
    } catch (error) {}
    window.close();
  }

  // Retour Jellyfin : la commande « back » ferme ses dialogues, quitte le
  // lecteur et remonte l'historique de l'application.
  function jellyfinBack() {
    var target = document.activeElement || document.body;
    var event;
    try { event = new KeyboardEvent('keydown', { key: 'Back', bubbles: true, cancelable: true }); }
    catch (error) { event = document.createEvent('Event'); event.initEvent('keydown', true, true); event.key = 'Back'; }
    target.dispatchEvent(event);
  }

  /* Appelé par l'appli Android (touche Retour) et par les touches Retour des
     téléviseurs. Renvoie « handled » ou « exit » (rien d'autre à fermer). */
  function back() {
    if (closeOverlay()) return 'handled';
    if (atRoot()) return 'exit';
    jellyfinBack();
    return 'handled';
  }

  var backKeyCodes = { 461: true, 10009: true };
  var backKeyNames = { GoBack: true, BrowserBack: true, XF86Back: true };
  window.addEventListener('keydown', function (event) {
    if (!tv || event.defaultPrevented) return;
    var isBack = backKeyCodes[event.keyCode] || backKeyNames[event.key];
    if (!isBack) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (back() === 'exit') exitApp();
  }, true);

  // ── Navigation à la télécommande ────────────────────────────────────────
  if (tv) {
    var style = document.createElement('style');
    style.id = 'noctra-app-tv-style';
    style.textContent = [
      /* Le flou d'arrière-plan est très coûteux pour les processeurs graphiques des TV. */
      'html.noctra-app-tv *,html.noctra-app-tv *::before,html.noctra-app-tv *::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}',
      /* Focus visible uniquement quand on navigue aux flèches (pas au pointeur Magic Remote). */
      'html.noctra-remote-nav :focus:not(input):not(textarea):not(select){outline:4px solid #9ec5ff!important;outline-offset:3px!important;box-shadow:0 0 0 8px rgba(80,140,255,.30)!important;border-radius:12px}',
      'html.noctra-remote-nav input:focus,html.noctra-remote-nav textarea:focus,html.noctra-remote-nav select:focus{outline:4px solid #9ec5ff!important;outline-offset:1px!important}',
      'html.noctra-remote-nav .cardImageContainer:focus,html.noctra-remote-nav .card:focus-within .cardBox{transform:scale(1.04);transition:transform .12s ease-out}'
    ].join('\n');
    (document.head || root).appendChild(style);

    var arrows = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
    var pointerOff = function () { root.classList.remove('noctra-remote-nav'); };
    document.addEventListener('mousemove', pointerOff, { passive: true, capture: true });
    document.addEventListener('pointerdown', pointerOff, { passive: true, capture: true });

    var candidateSelector = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"]),[role="button"]';
    // Boutons secondaires des affiches (apparaissent au survol) et liens de
    // titre : l'affiche elle-même suffit, la navigation reste lisible.
    var skipped = '.cardOverlayContainer,.cardText,.cardFooter,.mdl-slider-background-flex-container,.skinHeader .headerSearchButton[hidden]';

    function usable(node) {
      if (!node || node.disabled || node.getAttribute('aria-hidden') === 'true') return false;
      if (node.closest('[hidden],[inert],.hide,[aria-hidden="true"],' + skipped)) return false;
      var rect = node.getBoundingClientRect();
      if (rect.width < 6 || rect.height < 6) return false;
      var style = window.getComputedStyle(node);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
    }

    function scope() {
      var dialogs = document.querySelectorAll('.dialogContainer .dialog.opened');
      if (dialogs.length) return [dialogs[dialogs.length - 1]];
      var overlay = openOverlay();
      if (!overlay) return [document];
      if (overlay.id === 'noctra-backdrop') {
        // Panneau Noctra : son contenu, plus le dock pour changer de section.
        var panel = overlay.querySelector('#noctra-panel') || overlay;
        var dock = document.getElementById('noctra-dock');
        return dock ? [panel, dock] : [panel];
      }
      return [overlay];
    }

    function candidates() {
      var list = [];
      var roots = scope();
      for (var r = 0; r < roots.length; r += 1) {
        var nodes = roots[r].querySelectorAll(candidateSelector);
        for (var i = 0; i < nodes.length; i += 1) if (usable(nodes[i])) list.push(nodes[i]);
      }
      return list;
    }

    // Choix du voisin : distance dans la direction + écart latéral pénalisé.
    function nearest(from, direction, list) {
      var a = from.getBoundingClientRect();
      var ax = a.left + a.width / 2;
      var ay = a.top + a.height / 2;
      var best = null;
      var bestScore = Infinity;
      for (var i = 0; i < list.length; i += 1) {
        var node = list[i];
        if (node === from || node.contains(from) || from.contains(node)) continue;
        var b = node.getBoundingClientRect();
        var bx = b.left + b.width / 2;
        var by = b.top + b.height / 2;
        var primary;
        var lateral;
        if (direction === 'right') { if (bx <= ax + 2 || b.right <= a.right) continue; primary = Math.max(0, b.left - a.right); lateral = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)) ? Math.abs(by - ay) : 0; }
        else if (direction === 'left') { if (bx >= ax - 2 || b.left >= a.left) continue; primary = Math.max(0, a.left - b.right); lateral = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)) ? Math.abs(by - ay) : 0; }
        else if (direction === 'down') { if (by <= ay + 2 || b.bottom <= a.bottom) continue; primary = Math.max(0, b.top - a.bottom); lateral = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)) ? Math.abs(bx - ax) : 0; }
        else { if (by >= ay - 2 || b.top >= a.top) continue; primary = Math.max(0, a.top - b.bottom); lateral = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)) ? Math.abs(bx - ax) : 0; }
        // Gauche / droite : rester sur la même rangée (pas de saut vers l'en-tête).
        if ((direction === 'left' || direction === 'right') && lateral > Math.max(a.height, b.height)) continue;
        var score = primary + lateral * (direction === 'up' || direction === 'down' ? 1.5 : 3);
        if (score < bestScore) { bestScore = score; best = node; }
      }
      return best;
    }

    function firstInView(list) {
      var best = null;
      var bestScore = Infinity;
      for (var i = 0; i < list.length; i += 1) {
        var rect = list[i].getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;
        var score = rect.top * 3 + rect.left;
        if (score < bestScore) { bestScore = score; best = list[i]; }
      }
      return best || list[0] || null;
    }

    // Dock et en-tête sont fixes : les atteindre ne doit pas faire défiler la page.
    function pinned(node) {
      for (var current = node; current && current !== document.body; current = current.parentElement) {
        var position = window.getComputedStyle(current).position;
        if (position === 'fixed' || position === 'sticky') return true;
      }
      return false;
    }

    function reveal(node, direction) {
      try { node.focus({ preventScroll: true }); } catch (error) { node.focus(); }
      if (pinned(node)) return;
      try {
        node.scrollIntoView({ block: direction === 'up' || direction === 'down' ? 'center' : 'nearest', inline: 'nearest' });
      } catch (error) { node.scrollIntoView(false); }
    }

    function scrollPage(direction) {
      var amount = Math.round(window.innerHeight * 0.45) * (direction === 'up' ? -1 : 1);
      var panel = document.getElementById('noctra-panel');
      var target = panel && openOverlay() ? (panel.querySelector('.noctra-panel-body') || panel) : (document.scrollingElement || document.documentElement);
      target.scrollTop += amount;
    }

    function moveFocus(direction) {
      var list = candidates();
      if (!list.length) { if (direction === 'up' || direction === 'down') scrollPage(direction); return; }
      var current = document.activeElement;
      var inScope = current && current !== document.body && list.indexOf(current) >= 0;
      if (!inScope) {
        var start = firstInView(list);
        if (start) reveal(start, direction);
        return;
      }
      var next = nearest(current, direction, list);
      if (next) reveal(next, direction);
      else if (direction === 'up' || direction === 'down') scrollPage(direction);
    }

    // Après les écouteurs de la page : le lecteur vidéo, les curseurs et les
    // champs de saisie gardent leurs flèches (ils appellent preventDefault).
    window.addEventListener('keydown', function (event) {
      var direction = arrows[event.keyCode];
      if (!direction || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      root.classList.add('noctra-remote-nav');
      var active = document.activeElement;
      var tag = active && active.tagName;
      var type = active && active.type;
      var horizontal = direction === 'left' || direction === 'right';
      if (horizontal && (tag === 'TEXTAREA' || (tag === 'INPUT' && type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit'))) return;
      if (!horizontal && tag === 'SELECT') return;
      event.preventDefault();
      moveFocus(direction);
    });

    // Le focus entre dans un panneau qui vient de s'ouvrir.
    document.addEventListener('click', function () {
      if (!root.classList.contains('noctra-remote-nav')) return;
      setTimeout(function () {
        var list = candidates();
        var current = document.activeElement;
        if (current && current !== document.body && list.indexOf(current) >= 0) return;
        var start = firstInView(list);
        if (start) reveal(start, 'down');
      }, 400);
    }, true);

    // OK sur un élément cliquable qui n'est pas un bouton natif.
    var nativeActivation = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY|VIDEO|IFRAME)$/;
    document.addEventListener('keydown', function (event) {
      if (event.keyCode !== 13 || event.defaultPrevented) return;
      var node = document.activeElement;
      if (!node || node === document.body || nativeActivation.test(node.tagName) || node.isContentEditable) return;
      if (node.getAttribute('role') === 'button' || node.hasAttribute('tabindex') || node.hasAttribute('data-noctra')) {
        event.preventDefault();
        node.click();
      }
    });

    // Touches média des télécommandes Samsung (à déclarer auprès du système).
    try {
      if (window.tizen && tizen.tvinputdevice) {
        var wanted = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious', 'ColorF0Red'];
        var supported = tizen.tvinputdevice.getSupportedKeys().map(function (key) { return key.name; });
        tizen.tvinputdevice.registerKeyBatch(wanted.filter(function (name) { return supported.indexOf(name) >= 0; }));
      }
    } catch (error) {}
  }

  // ── Erreurs affichées à l'écran dans les applis ─────────────────────────
  // Sans console sur un téléviseur, une erreur des scripts Noctra est montrée
  // quelques secondes : il suffit d'en faire une photo pour la signaler.
  if (platform) {
    var shownErrors = 0;
    window.addEventListener('error', function (event) {
      var file = String(event.filename || '');
      if (shownErrors >= 3 || !/noctra/i.test(file)) return;
      shownErrors += 1;
      var engine = (/Chrome\/(\d+)/.exec(ua) || [])[1];
      var text = 'Erreur Noctra : ' + event.message + ' — ' + file.split('/').pop().split('?')[0] + ':' + event.lineno
        + (engine ? ' — moteur Chromium ' + engine : '');
      var show = function () {
        var box = document.createElement('div');
        box.setAttribute('role', 'alert');
        box.style.cssText = 'position:fixed;left:24px;bottom:' + (24 + (shownErrors - 1) * 64) + 'px;z-index:2147483647;max-width:70vw;'
          + 'padding:12px 16px;border-radius:12px;background:#3a0f1c;color:#ffd7e0;font:16px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
        box.textContent = text;
        document.body.appendChild(box);
        setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 15000);
      };
      if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
    });
  }

  // ── Écran allumé pendant la lecture ─────────────────────────────────────
  var keepAwake = false;
  function syncKeepAwake() {
    var videos = document.getElementsByTagName('video');
    var playing = false;
    for (var index = 0; index < videos.length; index += 1) {
      var video = videos[index];
      if (!video.paused && !video.ended && video.readyState > 1 && !(video.muted && video.loop)) { playing = true; break; }
    }
    if (playing === keepAwake) return;
    keepAwake = playing;
    postNative('keepScreenOn', playing);
  }
  ['play', 'playing', 'pause', 'ended', 'emptied', 'error'].forEach(function (name) {
    document.addEventListener(name, function () { setTimeout(syncKeepAwake, 0); }, true);
  });

  window.NoctraApp = {
    platform: platform || (tv ? 'tv-browser' : 'web'),
    label: platforms[platform] || '',
    native: Boolean(platform),
    tv: tv,
    version: version,
    back: back,
    exit: exitApp,
    changeServer: function () { return postNative('changeServer'); }
  };
})();
