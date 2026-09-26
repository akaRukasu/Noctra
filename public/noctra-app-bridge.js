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
   - exposer window.NoctraApp aux applications natives. */
(function () {
  'use strict';

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
    var agent = /NoctraApp\/[\d.]+ \(([a-z]+)\)/i.exec(ua);
    if (agent && platforms[agent[1].toLowerCase()]) return agent[1].toLowerCase();
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

  /* Canal vers l'appli native. Android : WebMessageListener « NoctraHost »
     (l'appli vérifie l'origine et le cadre principal de chaque message, les
     iframes des fournisseurs TV ne peuvent donc rien piloter). iOS :
     WKScriptMessageHandler « noctra », avec la même vérification. */
  function postNative(action, data) {
    var message = { action: action, data: data === undefined ? null : data };
    try {
      if (window.NoctraHost && typeof window.NoctraHost.postMessage === 'function') {
        window.NoctraHost.postMessage(JSON.stringify(message));
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

  // ── Android TV : mise en page 1920 px comme sur les téléviseurs LG/Samsung ──
  // La WebView d'Android TV annonce souvent 960 px (densité 2) : Noctra
  // choisirait alors sa mise en page mobile. L'appli active la vue large.
  if (platform === 'androidtv') {
    var viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) viewport.setAttribute('content', 'width=1920,initial-scale=1,viewport-fit=cover');
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
      'html.noctra-remote-nav :focus:not(.card):not(.cardBox):not(input):not(textarea):not(select){outline:3px solid #9ec5ff!important;outline-offset:3px!important;box-shadow:0 0 0 6px rgba(80,140,255,.28)!important}',
      'html.noctra-remote-nav input:focus,html.noctra-remote-nav textarea:focus,html.noctra-remote-nav select:focus{outline:3px solid #9ec5ff!important;outline-offset:1px!important}',
      'html.noctra-remote-nav .card:focus .cardBox{outline:3px solid #9ec5ff;outline-offset:2px}'
    ].join('\n');
    (document.head || root).appendChild(style);

    var arrowKeys = { 37: true, 38: true, 39: true, 40: true };
    document.addEventListener('keydown', function (event) {
      if (arrowKeys[event.keyCode]) root.classList.add('noctra-remote-nav');
    }, true);
    var pointerOff = function () { root.classList.remove('noctra-remote-nav'); };
    document.addEventListener('mousemove', pointerOff, { passive: true, capture: true });
    document.addEventListener('pointerdown', pointerOff, { passive: true, capture: true });

    // Les panneaux Noctra deviennent des conteneurs de focus Jellyfin : les
    // flèches ne s'échappent plus vers la page située derrière.
    var syncFocusContainers = function () {
      var panel = openOverlay();
      var marked = document.querySelectorAll('.noctra-app-focus-scope');
      for (var index = 0; index < marked.length; index += 1) {
        if (marked[index] !== panel) marked[index].classList.remove('focuscontainer', 'noctra-app-focus-scope');
      }
      if (panel && panel.id !== 'noctra-backdrop' && !panel.classList.contains('focuscontainer')) {
        panel.classList.add('focuscontainer', 'noctra-app-focus-scope');
      }
      if (panel && panel.id === 'noctra-backdrop') {
        var content = panel.querySelector('#noctra-panel') || panel;
        if (!content.classList.contains('focuscontainer')) content.classList.add('focuscontainer', 'noctra-app-focus-scope');
      }
    };
    document.addEventListener('keydown', function (event) {
      if (arrowKeys[event.keyCode]) syncFocusContainers();
    }, true);

    // Le focus entre dans un panneau qui vient de s'ouvrir.
    document.addEventListener('click', function () {
      if (!root.classList.contains('noctra-remote-nav')) return;
      setTimeout(function () {
        var panel = openOverlay();
        if (!panel || panel.contains(document.activeElement)) return;
        var first = panel.querySelector('button:not([disabled]),a[href],input:not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"])');
        if (first && first.getClientRects().length) first.focus();
      }, 350);
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
