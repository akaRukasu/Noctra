/* Écran de connexion commun aux applications Noctra (Android, Android TV,
   iOS, LG webOS, Samsung Tizen).

   Il vérifie l'adresse du serveur (/health répond « client: Noctra »), la
   mémorise puis ouvre l'interface web du serveur dans la même fenêtre : la
   session Jellyfin, les cookies Noctra et le stockage restent ceux du serveur,
   exactement comme dans un navigateur. Syntaxe ES5 volontaire : cet écran doit
   pouvoir s'afficher, et expliquer le problème, sur un téléviseur trop ancien. */
(function () {
  'use strict';

  var config = window.NOCTRA_LAUNCHER_CONFIG || {};
  var params = parseQuery(location.search);
  var platform = String(params.platform || window.NOCTRA_PLATFORM || '').toLowerCase();
  var labels = { android: 'Android', androidtv: 'Android TV', ios: 'iOS', webos: 'LG webOS', tizen: 'Samsung Tizen' };
  var isTv = platform === 'webos' || platform === 'tizen' || platform === 'androidtv';
  var storageKey = 'noctra-launcher-server-v1';
  var busyRequest = null;
  var busyCancelled = false;
  var countdownTimer = 0;

  if (isTv) document.documentElement.className += ' tv';

  function $(id) { return document.getElementById(id); }

  function parseQuery(search) {
    var result = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (part) {
      if (!part) return;
      var index = part.indexOf('=');
      var key = decodeURIComponent((index < 0 ? part : part.slice(0, index)).replace(/\+/g, ' '));
      result[key] = index < 0 ? '' : decodeURIComponent(part.slice(index + 1).replace(/\+/g, ' '));
    });
    return result;
  }

  // ── Hôte natif ──────────────────────────────────────────────────────────
  // Android : MessagePort transmis par l'appli à la page (voir
  // public/noctra-app-bridge.js) ; iOS : gestionnaire de messages « noctra ».
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
        else hostQueue.push(text);
        return true;
      }
      var handlers = window.webkit && window.webkit.messageHandlers;
      if (handlers && handlers.noctra) { handlers.noctra.postMessage(message); return true; }
    } catch (error) {}
    return false;
  }

  // Serveur déplacé (seedbox merlion.usbx.me → astra.usbx.me) : l'adresse
  // gardée est corrigée d'elle-même.
  function movedServer(url) {
    return String(url || '').replace(/([\/.@])merlion\.usbx\.me(?=$|[\/:?#])/i, '$1astra.usbx.me');
  }

  function loadState() {
    // Android et iOS transmettent le serveur mémorisé par l'appli.
    if (params.server !== undefined) {
      return { url: movedServer(params.server || ''), auto: params.auto !== '0', skipAuto: params.manual === '1' };
    }
    try {
      var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && typeof saved.url === 'string') {
        var url = movedServer(saved.url);
        if (url !== saved.url) saveState(url, saved.auto !== false);
        return { url: url, auto: saved.auto !== false };
      }
    } catch (error) {}
    return { url: '', auto: true };
  }

  function saveState(url, auto) {
    try { localStorage.setItem(storageKey, JSON.stringify({ url: url, auto: auto })); } catch (error) {}
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

  function openServer(base, serverTvApp) {
    // LG webOS et Samsung Tizen : interface Noctra TV, la même que l'appli
    // Android TV. Celle du serveur s'il la propose (/health : tvApp, toujours
    // la plus récente) ; sinon celle intégrée à l'appli (tv/), si le
    // téléviseur peut joindre l'API Noctra depuis l'appli ; en dernier
    // recours, et ailleurs, l'interface web complète.
    var tvHost = (platform === 'webos' || platform === 'tizen') && config.tvInterface !== false;
    var web = base + '/client/index.html' + (platform ? '?noctraApp=' + encodeURIComponent(platform) : '');
    function go(target) {
      if (postNative('openServer', { base: base, url: target })) return;
      location.replace(target);
    }
    if (tvHost && serverTvApp === true) { go(base + '/tv-app/index.html?platform=' + encodeURIComponent(platform)); return; }
    if (!tvHost) { go(web); return; }
    apiReachable(base, function (ok) {
      if (ok) location.replace('tv/index.html?platform=' + encodeURIComponent(platform) + '&server=' + encodeURIComponent(base));
      else go(web);
    });
  }

  // API Noctra joignable depuis l'appli (autre origine) : requête avec
  // l'en-tête de jeton, comme celles de l'interface. Une réponse lisible
  // (même 401) suffit ; 0 = requête refusée par le téléviseur.
  function apiReachable(base, done) {
    var finished = false;
    var finish = function (ok) { if (!finished) { finished = true; done(ok); } };
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', base + '/api/tv/sources', true);
      xhr.setRequestHeader('x-noctra-token', 'probe');
      xhr.timeout = 9000;
      xhr.onload = function () { finish(xhr.status > 0); };
      xhr.onerror = function () { finish(false); };
      xhr.ontimeout = function () { finish(false); };
      xhr.send();
    } catch (error) {
      finish(false);
    }
  }

  // ── Adresse du serveur ──────────────────────────────────────────────────
  function normalize(value) {
    var url = String(value || '').replace(/^\s+|\s+$/g, '');
    if (!url) return { url: '', explicitScheme: false };
    var explicitScheme = /^https?:\/\//i.test(url);
    if (!explicitScheme) url = 'https://' + url.replace(/^\/+/, '');
    url = url.replace(/^(https?:\/\/)/i, function (scheme) { return scheme.toLowerCase(); });
    url = url.replace(/[?#].*$/, '');
    url = url.replace(/\/+$/, '');
    url = url.replace(/\/(client(\/index\.html)?|health|web)$/i, '');
    url = url.replace(/([^:])\/{2,}/g, '$1/');
    return { url: url, explicitScheme: explicitScheme };
  }

  function valid(url) {
    return /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(url);
  }

  function describe(url) { return url.replace(/^https?:\/\//, ''); }

  // /health répond { client: 'Noctra' } avec l'en-tête CORS depuis 200.0.121.
  // Un serveur plus ancien est reconnu par son logo public.
  function probe(base, done) {
    var finished = false;
    var finish = function (result) { if (!finished) { finished = true; busyRequest = null; done(result); } };
    var xhr = new XMLHttpRequest();
    busyRequest = xhr;
    try {
      xhr.open('GET', base + '/health', true);
      xhr.timeout = 9000;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          var data = null;
          try { data = JSON.parse(xhr.responseText); } catch (error) {}
          if (data && data.client === 'Noctra') finish({ ok: true, version: data.version || '', tvApp: data.tvApp === true });
          else finish({ ok: false, error: 'Ce serveur répond, mais ce n’est pas un serveur Noctra. Vérifiez l’adresse (par exemple https://mon-serveur.fr/noctra).' });
        } else if (xhr.status === 404) {
          finish({ ok: false, error: 'Aucun serveur Noctra à cette adresse (erreur 404). Vérifiez le chemin, par exemple /noctra.' });
        } else if (xhr.status) {
          finish({ ok: false, error: 'Le serveur a répondu avec l’erreur ' + xhr.status + '. Réessayez dans un instant.' });
        } else {
          imageProbe(base, finish);
        }
      };
      xhr.onerror = function () { imageProbe(base, finish); };
      xhr.ontimeout = function () { finish({ ok: false, error: 'Le serveur ne répond pas (délai dépassé). Vérifiez la connexion Internet et l’adresse.' }); };
      xhr.send();
    } catch (error) {
      imageProbe(base, finish);
    }
  }

  var UNREACHABLE = 'Serveur injoignable, ou ce n’est pas un serveur Noctra. Vérifiez l’adresse (par exemple https://mon-serveur.fr/noctra) et la connexion Internet.';

  function imageProbe(base, finish) {
    if (busyCancelled) return;
    var image = new Image();
    var timer = setTimeout(function () { image.onload = image.onerror = null; finish({ ok: false, error: UNREACHABLE }); }, 9000);
    image.onload = function () { clearTimeout(timer); finish({ ok: true, version: '' }); };
    image.onerror = function () { clearTimeout(timer); finish({ ok: false, error: UNREACHABLE }); };
    image.src = base + '/noctra-mark.svg?probe=' + Date.now();
  }

  // Sans « https:// » saisi, on essaie https puis http (serveur local).
  function check(input, done) {
    var normalized = normalize(input);
    if (!valid(normalized.url)) {
      done({ ok: false, error: 'Adresse invalide. Exemple : https://mon-serveur.fr/noctra' });
      return;
    }
    probe(normalized.url, function (result) {
      if (result.ok || normalized.explicitScheme || busyCancelled) { result.url = normalized.url; done(result); return; }
      var fallback = normalized.url.replace(/^https:/, 'http:');
      probe(fallback, function (second) {
        if (second.ok) { second.url = fallback; done(second); return; }
        result.url = normalized.url;
        done(result);
      });
    });
  }

  // ── Vues ────────────────────────────────────────────────────────────────
  var views = ['view-auto', 'view-form', 'view-busy'];
  function show(id, focusId) {
    for (var index = 0; index < views.length; index += 1) $(views[index]).hidden = views[index] !== id;
    var target = $(focusId);
    if (target) setTimeout(function () { try { target.focus(); } catch (error) {} }, 30);
  }

  function showForm(url, error) {
    stopCountdown();
    $('server-url').value = url || '';
    var errorNode = $('form-error');
    errorNode.hidden = !error;
    errorNode.textContent = error || '';
    // À la télécommande, le clavier virtuel ne s'ouvre qu'à la demande.
    show('view-form', isTv && url ? 'form-submit' : 'server-url');
  }

  function connect(input, auto) {
    stopCountdown();
    busyCancelled = false;
    $('busy-status').textContent = 'Vérification de ' + describe(normalize(input).url || input) + '…';
    show('view-busy', 'busy-cancel');
    check(input, function (result) {
      if (busyCancelled) return;
      if (!result.ok) { showForm(result.url || input, result.error); return; }
      saveState(result.url, auto);
      postNative('saveServer', { url: result.url, auto: auto });
      $('busy-status').textContent = 'Ouverture de Noctra…';
      openServer(result.url, result.tvApp);
    });
  }

  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = 0;
  }

  function showAuto(state) {
    var seconds = Math.max(0, Number(config.autoConnectDelaySeconds));
    if (!(seconds >= 0)) seconds = 3;
    $('auto-server').textContent = describe(state.url);
    show('view-auto', 'auto-connect');
    if (!seconds) { connect(state.url, true); return; }
    var started = Date.now();
    var bar = $('auto-progress');
    var tick = function () {
      var elapsed = (Date.now() - started) / 1000;
      var left = Math.max(0, Math.ceil(seconds - elapsed));
      $('auto-status').textContent = 'Connexion automatique dans ' + left + ' s';
      bar.style.width = Math.min(100, elapsed / seconds * 100) + '%';
      if (elapsed >= seconds) connect(state.url, true);
    };
    tick();
    countdownTimer = setInterval(tick, 100);
  }

  function pauseCountdown() {
    if (!countdownTimer) return;
    stopCountdown();
    $('auto-status').textContent = 'Connexion automatique en pause.';
  }

  // ── Télécommande et clavier ─────────────────────────────────────────────
  function focusables() {
    var current = null;
    for (var index = 0; index < views.length; index += 1) if (!$(views[index]).hidden) current = $(views[index]);
    if (!current) return [];
    var nodes = current.querySelectorAll('input, button');
    var list = [];
    for (var i = 0; i < nodes.length; i += 1) if (!nodes[i].disabled && nodes[i].offsetParent !== null) list.push(nodes[i]);
    return list;
  }

  function move(step) {
    var list = focusables();
    if (!list.length) return;
    var index = list.indexOf(document.activeElement);
    var next = index < 0 ? 0 : Math.max(0, Math.min(list.length - 1, index + step));
    list[next].focus();
  }

  document.addEventListener('keydown', function (event) {
    var code = event.keyCode;
    var active = document.activeElement;
    var typing = active && active.type === 'url';
    if (code !== 13) pauseCountdown();
    if (code === 461 || code === 10009 || (code === 27 && isTv)) {
      event.preventDefault();
      if (!$('view-busy').hidden) { cancelBusy(); return; }
      exitApp();
      return;
    }
    if (code === 38) { event.preventDefault(); move(-1); return; }
    if (code === 40) { event.preventDefault(); move(1); return; }
    if ((code === 37 || code === 39) && !typing) { event.preventDefault(); move(code === 37 ? -1 : 1); return; }
    if (code === 13 && active && active.type === 'checkbox') { event.preventDefault(); active.checked = !active.checked; }
  });
  document.addEventListener('mousedown', pauseCountdown);
  document.addEventListener('touchstart', pauseCountdown);

  function cancelBusy() {
    busyCancelled = true;
    if (busyRequest) { try { busyRequest.abort(); } catch (error) {} }
    showForm(normalize($('server-url').value || loadState().url).url, '');
  }

  // Appelé par l'appli Android (touche Retour).
  window.NoctraApp = {
    platform: platform,
    back: function () {
      if (!$('view-busy').hidden) { cancelBusy(); return 'handled'; }
      return 'exit';
    }
  };

  // ── Démarrage ───────────────────────────────────────────────────────────
  function modernEngine() {
    // L'interface Noctra utilise la syntaxe de Chromium 85 (?., ??, ||=).
    try { new Function('var a = {}; a.b ||= 1; return a?.b ?? 0;'); return true; } catch (error) { return false; }
  }

  var engine = (/Chrome\/(\d+)/.exec(navigator.userAgent) || [])[1];
  $('footer').textContent = 'Noctra ' + (labels[platform] || '') + ' ' + (config.appVersion || '')
    + (engine ? ' · moteur Chromium ' + engine : '');
  $('auto-connect').onclick = function () { connect(loadState().url, true); };
  $('auto-change').onclick = function () { showForm(loadState().url, ''); };
  $('busy-cancel').onclick = cancelBusy;
  $('server-form').onsubmit = function (event) {
    event.preventDefault();
    connect($('server-url').value, $('server-auto').checked);
  };

  var state = loadState();
  $('server-auto').checked = state.auto !== false;
  if (!modernEngine()) {
    showForm(state.url || config.defaultServerUrl || '', isTv
      ? 'Ce téléviseur utilise un moteur web trop ancien pour l’interface Noctra (il faut un Samsung de 2021 ou plus récent, ou un LG webOS 22 ou plus récent).'
      : 'Le moteur web de cet appareil est trop ancien pour Noctra. Mettez à jour « Android System WebView » (ou Chrome) depuis le Play Store.');
    return;
  }
  // L'appli native signale un serveur devenu injoignable pendant l'utilisation.
  if (params.error) showForm(state.url || config.defaultServerUrl || '', params.error);
  else if (state.url && state.auto !== false && !state.skipAuto) showAuto(state);
  // Premier lancement : serveur prévu dans config.js, ouvert sans saisie.
  else if (!state.url && config.defaultServerUrl && !state.skipAuto) connect(config.defaultServerUrl, true);
  else showForm(state.url || config.defaultServerUrl || '', '');
})();
