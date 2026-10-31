/* Pont web de Noctra TV pour LG webOS, Samsung Tizen et Samsung 2014 (Orsay).

   L'interface Noctra TV (app.js) dialogue avec un « hôte natif » par un
   MessagePort : sur Android TV, c'est l'appli (lecteur ExoPlayer, lecteur
   Jellyfin, lecteur web séparé…). Sur webOS et Tizen, il n'y a pas d'appli
   native : ce fichier joue ce rôle en JavaScript, avec le même protocole.
     - connexion Jellyfin (Quick Connect ou identifiants), session mémorisée ;
     - lecteur vidéo HTML5 (HLS natif du téléviseur, sinon hls.js ; MPEG-TS
       natif, sinon mpegts.js) : chaînes (guide, zapping, panneaux chaînes et
       serveurs, bascule de serveur) et films/épisodes (reprise, pistes audio et
       sous-titres, suivi de lecture Jellyfin, SyncPlay) ;
     - multiview (jusqu'à 12 vignettes, selon les décodeurs du téléviseur) ;
     - réglages (compte, déconnexion) et touches de la télécommande.
   Actif seulement avec ?platform=webos|tizen|web|orsay (ouvert par le lanceur
   des applis) : dans l'appli Android TV, il ne fait rien.
   Samsung 2014 (orsay) : lecteur, multiview, touches et sortie confiés à
   l'hôte de cette plateforme (apps/samsung-orsay/orsay-host.js).
   Syntaxe ES5 : webOS 4 (Chromium 53), Tizen 4 et, avec les compléments de
   orsay-compat.js, le moteur WebKit des Samsung de 2014. */
(function () {
  'use strict';

  // Samsung 2014 : adresse fixée par l'hôte (une seule page, pas de paramètres).
  var params = new URLSearchParams(window.NOCTRA_HOST_QUERY || location.search);
  var platform = String(params.get('platform') || '').toLowerCase();
  if (['webos', 'tizen', 'web', 'orsay'].indexOf(platform) < 0) return;
  document.documentElement.classList.add('web-host');
  document.documentElement.classList.add('host-' + platform);
  var ORSAY = platform === 'orsay' ? window.NoctraOrsay || null : null;

  var VERSION = '1.1.57';
  var DEVICE_NAME = platform === 'webos' ? 'LG webOS' : platform === 'tizen' ? 'Samsung Tizen' : ORSAY ? ORSAY.deviceName : 'Navigateur';
  // Interface servie par le serveur Noctra (/tv-app/), ou intégrée à l'appli
  // (fichiers locaux, ?server=adresse du serveur choisi dans le lanceur).
  var SERVER = String(params.get('server') || '').replace(/\/+$/, '');
  var BASE = SERVER || location.origin + location.pathname.replace(/\/tv-app\/.*$/, '');
  var SERVER_ORIGIN = (function () { try { return new URL(BASE).origin; } catch (error) { return location.origin; } })();
  var JF = String(params.get('jellyfin') || SERVER_ORIGIN + '/jellyfin').replace(/\/+$/, '');
  var STORE = 'noctra-tv-web-session-v1';

  var appPort = null;
  var session = null;

  // ── Outils ────────────────────────────────────────────────────────────
  function el(tag, attrs) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) { child.forEach(function (item) { if (item) node.appendChild(item); }); continue; }
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }
  function read(key, fallback) {
    try { var value = JSON.parse(localStorage.getItem(key)); return value === null ? fallback : value; } catch (error) { return fallback; }
  }
  function write(key, value) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* stockage indisponible */ }
  }
  function deviceId() {
    var id = read('noctra-tv-web-device', '');
    if (!id) { id = 'noctra-' + platform + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); write('noctra-tv-web-device', id); }
    return id;
  }
  function authorization(token, device) {
    return 'MediaBrowser Client="Noctra TV", Device="' + DEVICE_NAME + '", DeviceId="' + (device || deviceId()) + '", Version="' + VERSION + '"'
      + (token ? ', Token="' + token + '"' : '');
  }
  function jellyfin(method, path, body, token, device, keepalive) {
    var headers = { 'Authorization': authorization(token, device), 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var init = { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) };
    if (keepalive) init.keepalive = true;
    return fetch(JF + path, init).then(function (response) {
      if (!response.ok) { var error = new Error('Jellyfin : erreur ' + response.status); error.status = response.status; throw error; }
      return response.status === 204 ? null : response.text().then(function (text) { return text ? JSON.parse(text) : null; });
    });
  }
  function noctraFetch(url) {
    var headers = {};
    if (session && url.indexOf(BASE + '/') === 0) headers['x-noctra-token'] = session.token;
    return fetch(url, { headers: headers, credentials: SERVER ? 'omit' : 'same-origin' }).then(function (response) {
      if (!response.ok) throw new Error('Erreur ' + response.status);
      return response.json();
    });
  }
  var scripts = {};
  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = function () { delete scripts[src]; reject(new Error('Bibliothèque introuvable : ' + src)); };
        document.head.appendChild(script);
      });
    }
    return scripts[src];
  }
  function clock(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    var h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
    return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + s).slice(-2);
  }
  function hour(ms) {
    var date = new Date(Number(ms));
    return isNaN(date.getTime()) ? '' : ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
  }

  // ── Canal avec l'interface ────────────────────────────────────────────
  function send(message) { if (appPort) appPort.postMessage(JSON.stringify(message)); }
  function codecs() {
    if (ORSAY) return ORSAY.codecs();
    var video = document.createElement('video');
    function mse(type) { try { return Boolean(window.MediaSource && MediaSource.isTypeSupported(type)); } catch (error) { return false; } }
    function can(type) { try { return Boolean(video.canPlayType(type)); } catch (error) { return false; } }
    return {
      hevc: mse('video/mp4; codecs="hvc1.1.6.L120.90"') || can('video/mp4; codecs="hvc1.1.6.L120.90"') || can('video/mp4; codecs="hev1.1.6.L120.90"'),
      vp9: mse('video/webm; codecs="vp9"'),
      ac3: mse('audio/mp4; codecs="ac-3"') || can('audio/mp4; codecs="ac-3"'),
      eac3: mse('audio/mp4; codecs="ec-3"') || can('audio/mp4; codecs="ec-3"'),
      dts: false
    };
  }
  function engineInfo() {
    if (ORSAY) return ORSAY.engine();
    var match = /Chrome\/(\d+)[\d.]*/.exec(navigator.userAgent || '');
    return { version: match ? match[0].slice(7) : '', major: match ? Number(match[1]) : 0, package: '', recommended: 110 };
  }
  function sendSession() {
    send({
      type: 'session', token: session.token, userId: session.userId, userName: session.userName,
      serverAddress: JF, noctraUrl: BASE, jellyfinUrl: JF, version: VERSION, codecs: codecs(), platform: platform,
      // Ni lecteur Jellyfin natif, ni lecteur web séparé : lecteur HTML5 et iframes.
      caps: { jellyfinPlayer: false, webPlayer: false, multiview: true, mosaic: Boolean(ORSAY) },
      // Moteur web du téléviseur (fixé par le micrologiciel : pas de mise à jour possible).
      webEngine: engineInfo()
    });
  }
  function handle(message) {
    var action = message.action;
    if (action === 'hello') { if (session) sendSession(); else Login.show(); }
    else if (action === 'play') Player.open(message);
    else if (action === 'playerCommand') Player.command(message);
    else if (action === 'multiview') Multiview.open(message.items || [], message.catalog || []);
    else if (action === 'multiviewCommand') Multiview.remote(message);
    else if (action === 'jellyfinPlay') send({ type: 'resumed', jellyfinFailed: message.itemId, positionTicks: message.positionTicks });
    else if (action === 'openSettings') Settings.show();
    else if (action === 'keepScreenOn') keepScreenOn(Boolean(message.data));
    else if (action === 'exit') exitApp();
  }
  function keepScreenOn(on) {
    if (ORSAY) { ORSAY.keepScreenOn(on); return; }
    try {
      if (window.tizen && tizen.power) {
        if (on) tizen.power.request('SCREEN', 'SCREEN_NORMAL'); else tizen.power.release('SCREEN');
      }
    } catch (error) { /* réglage indisponible */ }
  }
  function exitApp() {
    if (ORSAY) { ORSAY.exit(); return; }
    try { if (window.tizen && tizen.application) { tizen.application.getCurrentApplication().exit(); return; } } catch (error) { /* hors Tizen */ }
    try { if (window.webOS && typeof webOS.platformBack === 'function') { webOS.platformBack(); return; } } catch (error) { /* hors webOS */ }
    try { if (window.PalmSystem && typeof PalmSystem.platformBack === 'function') { PalmSystem.platformBack(); return; } } catch (error) { /* hors webOS */ }
    window.close();
  }

  // ── Touches ───────────────────────────────────────────────────────────
  var K = {
    left: [37], up: [38], right: [39], down: [40], enter: [13, 29443],
    back: [461, 10009, 27, 8], playPause: [10252, 179], play: [415, 250], pause: [19], stop: [413, 178],
    forward: [417, 228], rewind: [412, 227], chUp: [427, 33], chDown: [428, 34], info: [457], menu: [10133, 93]
  };
  function is(event, name) {
    var code = event.keyCode;
    if (K[name].indexOf(code) >= 0) {
      // Retour arrière dans un champ de saisie : effacement, pas « Retour ».
      if (name === 'back' && code === 8 && event.target && event.target.tagName === 'INPUT') return false;
      return true;
    }
    var key = event.key;
    if (name === 'back') return key === 'GoBack' || key === 'BrowserBack' || key === 'XF86Back';
    if (name === 'playPause') return key === 'MediaPlayPause';
    if (name === 'play') return key === 'MediaPlay';
    if (name === 'pause') return key === 'MediaPause';
    if (name === 'stop') return key === 'MediaStop';
    return false;
  }
  var handlers = [];
  window.addEventListener('keydown', function (event) {
    for (var i = handlers.length - 1; i >= 0; i--) {
      if (!handlers[i].active()) continue;
      var result = handlers[i].key(event);
      // 'default' : comportement normal (curseur, clavier de l'écran), sans
      // atteindre l'interface derrière la fenêtre.
      if (result === 'default') { event.stopPropagation(); return; }
      if (result !== false) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    // Interface : « Retour » ferme la fenêtre ou la page ; à l'accueil, quitte.
    if (is(event, 'back') && event.keyCode !== 27 && event.keyCode !== 8) {
      event.preventDefault();
      event.stopPropagation();
      if (window.NoctraTV && window.NoctraTV.back() === 'exit') exitApp();
    }
  }, true);

  // Liste verticale navigable (connexion, réglages, menus du multiview).
  function listKeys(container, event, onBack) {
    var items = Array.prototype.slice.call(container.querySelectorAll('.nw-f')).filter(function (node) { return node.offsetParent !== null; });
    var at = items.indexOf(document.activeElement);
    if (is(event, 'up') || is(event, 'left')) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT' && is(event, 'left')) return 'default';
      if (items.length) items[Math.max(0, at - 1)].focus();
      return true;
    }
    if (is(event, 'down') || is(event, 'right')) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT' && is(event, 'right')) return 'default';
      if (items.length) items[Math.min(items.length - 1, at + 1)].focus();
      return true;
    }
    if (is(event, 'enter')) {
      var target = document.activeElement;
      if (target && target.tagName === 'INPUT') { if (target._submit) target._submit(); return 'default'; }
      if (target && items.indexOf(target) >= 0) target.click();
      return true;
    }
    if (is(event, 'back')) { if (onBack) onBack(); return true; }
    // Autres touches (lettres dans un champ…) : comportement normal.
    return 'default';
  }
  function listScroll(node) {
    if (node && node.scrollIntoView) { try { node.scrollIntoView({ block: 'nearest' }); } catch (error) { node.scrollIntoView(false); } }
  }

  // ── Connexion ─────────────────────────────────────────────────────────
  var Login = {
    node: null,
    timer: 0,
    show: function (message) {
      if (Login.node) return;
      var user = el('input', { class: 'nw-f nw-input', type: 'text', placeholder: 'Nom d’utilisateur', autocomplete: 'username' });
      var password = el('input', { class: 'nw-f nw-input', type: 'password', placeholder: 'Mot de passe', autocomplete: 'current-password' });
      var status = el('p', { class: 'nw-status-line', text: message || '' });
      var quick = el('div', { class: 'nw-quick' }, el('p', { class: 'nw-muted', text: 'Quick Connect : recherche d’un code…' }));
      var users = el('div', { class: 'nw-users' });
      function submit() {
        if (!user.value.trim()) { status.textContent = 'Indiquez votre nom d’utilisateur.'; user.focus(); return; }
        status.textContent = 'Connexion…';
        jellyfin('POST', '/Users/AuthenticateByName', { Username: user.value.trim(), Pw: password.value }).then(Login.success, function (error) {
          status.textContent = error.status === 401 ? 'Nom d’utilisateur ou mot de passe incorrect.' : 'Serveur Jellyfin injoignable (' + error.message + ').';
        });
      }
      user._submit = function () { password.focus(); };
      password._submit = submit;
      Login.node = el('div', { id: 'nw-login', class: 'nw-overlay' },
        el('div', { class: 'nw-card' },
          el('div', { class: 'nw-brand' }, el('img', { src: 'noctra-mark.svg', alt: '' }), el('span', { text: 'Noctra' })),
          el('h1', { text: 'Connexion' }),
          el('p', { class: 'nw-muted', text: 'Votre compte Jellyfin (' + JF.replace(/^https?:\/\//, '') + ')' }),
          quick, users, user, password,
          el('button', { class: 'nw-f nw-btn primary', onclick: submit }, 'Se connecter'),
          status));
      document.body.appendChild(Login.node);
      user.focus();
      Login.quickConnect(quick);
      jellyfin('GET', '/Users/Public').then(function (list) {
        (list || []).slice(0, 8).forEach(function (entry) {
          users.appendChild(el('button', { class: 'nw-f nw-chip', onclick: function () { user.value = entry.Name; password.focus(); } }, entry.Name));
        });
      }, function () { /* liste facultative */ });
    },
    quickConnect: function (box) {
      jellyfin('GET', '/QuickConnect/Enabled').then(function (enabled) {
        if (!enabled) throw new Error('désactivé');
        return jellyfin('POST', '/QuickConnect/Initiate').catch(function () { return jellyfin('GET', '/QuickConnect/Initiate'); });
      }).then(function (state) {
        if (!Login.node || !state || !state.Code) return;
        box.innerHTML = '';
        box.appendChild(el('p', { class: 'nw-muted', text: 'Quick Connect : sur votre téléphone ou votre PC, Jellyfin › Paramètres › Quick Connect, saisissez' }));
        box.appendChild(el('p', { class: 'nw-code', text: state.Code }));
        var poll = function () {
          if (!Login.node) return;
          jellyfin('GET', '/QuickConnect/Connect?Secret=' + encodeURIComponent(state.Secret)).then(function (result) {
            if (result && result.Authenticated) return jellyfin('POST', '/Users/AuthenticateWithQuickConnect', { Secret: state.Secret }).then(Login.success);
            Login.timer = setTimeout(poll, 3000);
          }, function () { Login.timer = setTimeout(poll, 5000); });
        };
        Login.timer = setTimeout(poll, 3000);
      }).catch(function () {
        box.innerHTML = '';
        box.appendChild(el('p', { class: 'nw-muted', text: 'Connectez-vous avec vos identifiants Jellyfin.' }));
      });
    },
    success: function (result) {
      if (!result || !result.AccessToken || !result.User) return;
      session = { token: result.AccessToken, userId: result.User.Id, userName: result.User.Name };
      write(STORE, session);
      Login.hide();
      sendSession();
    },
    hide: function () {
      clearTimeout(Login.timer);
      if (Login.node) Login.node.remove();
      Login.node = null;
    }
  };
  handlers.push({
    active: function () { return Boolean(Login.node); },
    key: function (event) { return listKeys(Login.node, event, exitApp); }
  });

  // ── Réglages ──────────────────────────────────────────────────────────
  var Settings = {
    node: null,
    show: function () {
      if (Settings.node) return;
      Settings.node = el('div', { class: 'nw-overlay nw-sheet-back' },
        el('div', { class: 'nw-sheet' },
          el('h2', { text: 'Paramètres' }),
          el('p', { class: 'nw-muted', text: 'Compte : ' + (session ? session.userName : '—') + ' · ' + DEVICE_NAME + ' · Noctra TV ' + VERSION }),
          el('button', { class: 'nw-f nw-btn', onclick: function () {
            var token = session && session.token;
            if (token) jellyfin('POST', '/Sessions/Logout', undefined, token).catch(function () { /* déjà expirée */ });
            session = null;
            write(STORE, null);
            Settings.hide();
            location.reload();
          } }, 'Se déconnecter / changer de compte'),
          // Samsung 2014 : l'interface web complète demande un navigateur récent.
          ORSAY ? null : el('button', { class: 'nw-f nw-btn', onclick: function () { location.href = BASE + '/client/index.html?noctraApp=' + platform; } }, 'Ouvrir l’interface web complète'),
          ORSAY ? ORSAY.settings().map(function (entry) {
            return el('button', { class: 'nw-f nw-btn', onclick: function () { Settings.hide(); entry[1](); } }, entry[0]);
          }) : null,
          el('button', { class: 'nw-f nw-btn primary', onclick: function () { Settings.hide(); } }, 'Fermer')));
      document.body.appendChild(Settings.node);
      Settings.node.querySelector('.nw-f').focus();
    },
    hide: function () { if (Settings.node) Settings.node.remove(); Settings.node = null; }
  };
  handlers.push({
    active: function () { return Boolean(Settings.node); },
    key: function (event) { return listKeys(Settings.node, event, Settings.hide); }
  });

  // ── Moteur vidéo (HLS / MPEG-TS / fichier) ────────────────────────────
  function Engine(video, onFatal, onInfo) {
    this.video = video;
    this.onFatal = onFatal;
    this.onInfo = onInfo || function () {};
    this.hls = null;
    this.ts = null;
    this.loads = 0;
  }
  // Flux relayé sans type connu : ses premiers octets disent s'il s'agit d'une
  // liste HLS (« #EXTM3U ») ou d'un flux MPEG-TS continu (octet de synchro 0x47),
  // que hls.js attendrait sans fin comme une liste. 6 s au plus, sinon HLS.
  function sniffStream(url, token) {
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      var done = false;
      function finish(kind) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { xhr.abort(); } catch (error) { /* déjà fermé */ }
        resolve(kind);
      }
      function check() {
        var text = xhr.responseText || '';
        if (/^\s*#EXTM3U/.test(text) || /#EXT-X-/.test(text)) return finish('hls');
        var start = text.replace(/^\s+/, '');
        if (start.length && (start.charCodeAt(0) & 0xff) === 0x47 && text.length >= 188) return finish('ts');
        if (text.length > 4096) finish('');
      }
      var timer = setTimeout(function () { finish(''); }, 6000);
      try {
        xhr.open('GET', url, true);
        if (token) xhr.setRequestHeader('x-noctra-token', token);
        xhr.overrideMimeType('text/plain; charset=x-user-defined');
        xhr.onprogress = check;
        xhr.onreadystatechange = function () { if (xhr.readyState >= 3) check(); if (xhr.readyState === 4) finish(''); };
        xhr.onerror = function () { finish(''); };
        xhr.send();
      } catch (error) { finish(''); }
    });
  }
  Engine.prototype.destroy = function () {
    // Un test de type en cours (sniffStream) n'aboutit plus à un chargement.
    this.loads++;
    if (ORSAY) ORSAY.release(this);
    try { if (this.hls) this.hls.destroy(); } catch (error) { /* déjà libéré */ }
    try { if (this.ts) { this.ts.unload(); this.ts.detachMediaElement(); this.ts.destroy(); } } catch (error) { /* déjà libéré */ }
    this.hls = null;
    this.ts = null;
    try { this.video.removeAttribute('src'); this.video.load(); } catch (error) { /* vidéo retirée */ }
  };
  // Adresse abrégée pour le journal du lecteur : hôte et fin du chemin.
  function shortUrl(url) {
    try {
      var parsed = new URL(url, location.href);
      var path = parsed.pathname.length > 28 ? '…' + parsed.pathname.slice(-26) : parsed.pathname;
      return (parsed.origin === SERVER_ORIGIN ? 'serveur Noctra' : parsed.hostname) + path;
    } catch (error) { return String(url).slice(0, 40); }
  }
  // Flux relayé par le serveur Noctra, depuis l'interface intégrée à l'appli :
  // le serveur exige le jeton (pas de cookie de session ici). Le lecteur du
  // téléviseur ne peut pas l'envoyer : hls.js / mpegts.js le joignent à
  // chaque requête.
  function needsToken(url) {
    return Boolean(SERVER && session && session.token && String(url).indexOf(BASE + '/') === 0);
  }
  // library : false = lecteur du téléviseur ; true = hls.js / mpegts.js (secours).
  // Samsung 2014 : lecteur du téléviseur seulement ; secours = relais du serveur.
  Engine.prototype.load = function (url, mime, library, headers) {
    if (ORSAY) return ORSAY.load(this, url, mime, library, headers);
    var self = this;
    var video = this.video;
    this.destroy();
    var token = needsToken(url) ? session.token : '';
    if (token) library = true;
    var where = shortUrl(url);
    if (String(mime || '').indexOf('mp2t') < 0) this.triedTs = false;
    var hint = String(mime || '').toLowerCase();
    var ts = hint.indexOf('mp2t') >= 0 || /\.ts(\?|$)/i.test(url);
    var file = /\.(mp4|m4v|mkv|webm|mov)(\?|$)/i.test(url);
    var hls = !ts && !file && (hint.indexOf('mpegurl') >= 0 || /\.m3u8(\?|$)/i.test(url) || url.indexOf('/api/tv/stream/') >= 0 || !hint);
    var nativeHls = Boolean(video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL'));
    var nativeTs = Boolean(video.canPlayType('video/mp2t'));
    if (!library && ((hls && nativeHls) || (ts && nativeTs) || (!hls && !ts))) {
      self.onInfo('Lecteur du téléviseur · ' + where);
      video.src = url;
      return Promise.resolve('native');
    }
    if (hls && !hint && url.indexOf('/api/tv/stream/') >= 0) {
      var load = this.loads;
      return sniffStream(url, token).then(function (kind) {
        if (load !== self.loads) return 'replaced';
        self.onInfo(kind === 'ts' ? 'Flux MPEG-TS continu détecté' : kind === 'hls' ? 'Liste HLS détectée' : 'Type du flux non reconnu : essai HLS');
        // Laisse au serveur le temps de fermer la connexion du test (fournisseurs à connexion unique).
        return new Promise(function (resolve) { setTimeout(resolve, kind === 'ts' ? 300 : 0); }).then(function () {
          if (load !== self.loads) return 'replaced';
          return self.load(url, kind === 'ts' ? 'video/mp2t' : 'application/vnd.apple.mpegurl', true);
        });
      });
    }
    if (ts) {
      return loadScript(BASE + '/vendor/mpegts.js').then(function () {
        if (!window.mpegts || !mpegts.isSupported()) throw new Error('MPEG-TS non pris en charge');
        self.ts = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: url },
          { enableStashBuffer: true, liveBufferLatencyChasing: false, headers: token ? { 'x-noctra-token': token } : undefined });
        self.ts.attachMediaElement(video);
        self.onInfo('mpegts.js' + (token ? ' · jeton joint' : '') + ' · ' + where);
        self.ts.on(mpegts.Events.ERROR, function (type, detail, info) {
          self.onInfo('Erreur MPEG-TS : ' + type + ' / ' + detail + (info && info.code ? ' · HTTP ' + info.code : ''));
          self.onFatal('Flux MPEG-TS : ' + detail);
        });
        self.ts.load();
        return 'mpegts';
      });
    }
    return loadScript(BASE + '/vendor/hls.min.js').then(function () {
      if (!window.Hls || !Hls.isSupported()) {
        self.onInfo('hls.js indisponible sur ce téléviseur' + (token ? ' : le jeton ne peut pas être joint' : ''));
        if (nativeHls) { video.src = url; return 'native'; }
        throw new Error('HLS non pris en charge par ce téléviseur');
      }
      self.onInfo('hls.js ' + (Hls.version || '') + (token ? ' · jeton joint' : '') + ' · ' + where);
      var retries = 0;
      // Réglages pour téléviseur :
      // - direct 4 segments derrière le bord (réserve), sans accélération pour le rattraper ;
      // - mémoire limitée des téléviseurs : 30 s d'avance et 40 Mo au plus, 10 s
      //   gardées en arrière (au-delà, « mémoire pleine » et coupures) ;
      // - définition plafonnée à celle de l'écran, démarrage à bonne qualité
      //   (estimation de débit de départ 6 Mb/s), décodage dans un worker ;
      // - segments lents réessayés plus longtemps.
      self.hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 40 * 1000 * 1000, backBufferLength: 10,
        liveSyncDurationCount: 4, liveMaxLatencyDurationCount: 12, maxLiveSyncPlaybackRate: 1,
        capLevelToPlayerSize: true, abrEwmaDefaultEstimate: 6000000, enableWorker: true, startFragPrefetch: true,
        fragLoadingMaxRetry: 8, fragLoadingTimeOut: 30000, manifestLoadingMaxRetry: 4, manifestLoadingTimeOut: 15000, levelLoadingMaxRetry: 6,
        xhrSetup: token ? function (xhr, address) { if (String(address).indexOf(BASE + '/') === 0) xhr.setRequestHeader('x-noctra-token', token); } : undefined });
      self.hls.on(Hls.Events.ERROR, function (event, data) {
        if (!data) return;
        var code = data.response && data.response.code;
        self.onInfo((data.fatal ? 'Erreur HLS : ' : 'Alerte HLS : ') + data.type + ' / ' + data.details + (code !== undefined ? ' · HTTP ' + code : '')
          + (data.url || (data.frag && data.frag.url) ? ' · ' + shortUrl(data.url || data.frag.url) : ''));
        if (!data.fatal) return;
        // Pas une liste HLS (flux MPEG-TS continu relayé par le serveur) : essai
        // avec mpegts.js, comme le lecteur Android TV (HLS puis flux direct).
        if (!self.triedTs && (data.details === 'manifestParsingError' || data.details === 'manifestIncompatibleCodecsError')) {
          self.triedTs = true;
          self.onInfo('Pas une liste HLS : essai en flux MPEG-TS');
          // Après l'événement : hls.js n'est pas détruit pendant son propre traitement.
          setTimeout(function () {
            self.load(url, 'video/mp2t', true).then(function () {
              var attempt = video.play();
              if (attempt && attempt.catch) attempt.catch(function () { /* lecture automatique refusée */ });
            }, function (error) { self.onFatal(error.message); });
          }, 0);
          return;
        }
        // Direct pas encore démarré et refus net du serveur (403, 404, 410…) :
        // serveur suivant tout de suite, sans nouvelles tentatives.
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && code >= 400 && code < 500 && video.readyState < 2 && Player.m && !Player.m.vod) {
          self.onFatal('Flux HLS refusé (HTTP ' + code + ')');
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retries < 3) { retries++; self.hls.startLoad(); return; }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries < 3) { retries++; self.hls.recoverMediaError(); return; }
        self.onFatal('Flux HLS : ' + (data.details || 'erreur'));
      });
      self.hls.loadSource(url);
      self.hls.attachMedia(video);
      return 'hls.js';
    });
  };
  Engine.prototype.canFallback = function () { return ORSAY ? ORSAY.canFallback(this) : !this.hls && !this.ts; };
  // Vidéo du lecteur : <video>, ou l'élément du lecteur matériel (Samsung 2014).
  function videoElement(attrs) { return ORSAY ? ORSAY.video(attrs) : el('video', attrs); }

  var PLAYER_ICONS = {
    playpause: '<path d="M4 5v14l9-7zM15 5h2v14h-2zM19 5h2v14h-2z"/>',
    audio: '<path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/>',
    subtitles: '<path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm2 7v2h4v-2zm6 0v2h6v-2zm-6-4v2h8V8zm10 0v2h2V8z"/>',
    channels: '<path d="M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z"/>',
    servers: '<path d="M7 7h11l-3-3 1.4-1.4L21.8 8l-5.4 5.4L15 12l3-3H7zm10 10H6l3 3-1.4 1.4L2.2 16l5.4-5.4L9 12l-3 3h11z"/>',
    close: '<path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/>'
  };
  // ── Lecteur plein écran ──────────────────────────────────────────────
  var Player = {
    node: null, video: null, engine: null, m: null, epg: null,
    played: false, library: false, finished: false, reconnects: 0, failure: null, failTimer: 0,
    stallTimer: 0, progressTimer: 0, bannerTimer: 0, seekTimer: 0, zapTimer: 0, zapDelta: 0, pendingSeek: -1,
    controlsOpen: false, panelMode: '', panelItems: [], panelCurrent: -1, report: null, playSessionId: '',

    open: function (m) {
      if (Player.node) Player.finish(true, null);
      Player.m = m;
      Player.epg = m.epg || null;
      Player.played = false;
      Player.library = false;
      Player.finished = false;
      Player.reconnects = 0;
      Player.failure = null;
      Player.pendingSeek = -1;
      Player.playSessionId = m.playSessionId || '';
      var video = videoElement({ autoplay: true, playsinline: true });
      Player.video = video;
      if (video.noctraLog !== undefined) video.noctraLog = function (line) { Player.log(line); };
      Player.title = el('div', { class: 'nw-title', text: m.title || '' });
      Player.subtitle = el('div', { class: 'nw-sub', text: m.subtitle || '' });
      Player.now = el('div', { class: 'nw-now' });
      Player.bar = el('div', { class: 'nw-bar' }, el('i'));
      Player.next = el('div', { class: 'nw-next' });
      Player.banner = el('div', { class: 'nw-banner' }, Player.title, Player.subtitle, Player.now, Player.bar, Player.next);
      Player.status = el('div', { class: 'nw-state' });
      // Journal du lecteur (moteur, erreurs, réponses du serveur) : visible tant
      // que la lecture n'a pas démarré, et avec le bandeau (OK).
      Player.diag = el('div', { class: 'nw-diag' });
      Player.diagLines = [];
      Player.sync = el('div', { class: 'nw-sync', text: m.sync ? 'SyncPlay · en attente du groupe…' : '' });
      Player.time = el('div', { class: 'nw-time' });
      Player.seek = el('div', { class: 'nw-seek' }, el('i'));
      Player.buttons = el('div', { class: 'nw-buttons' });
      Player.controls = el('div', { class: 'nw-controls' }, m.vod ? Player.seek : null, el('div', { class: 'nw-row' }, Player.buttons, Player.time));
      Player.panelTitle = el('h3');
      Player.panelList = el('div', { class: 'nw-list' });
      Player.panel = el('div', { class: 'nw-panel' }, Player.panelTitle, el('p', { class: 'nw-muted', text: 'OK : choisir · Retour : fermer' }), Player.panelList);
      // Bouton « Passer l'intro / le générique » (OK pendant qu'il est affiché).
      Player.skipButton = el('div', { class: 'nw-skip' });
      Player.skipButton.style.display = 'none';
      Player.segment = null;
      Player.skipLearn = null;
      Player.node = el('div', { id: 'nw-player', class: 'nw-overlay' }, video, Player.banner, Player.status, Player.diag, Player.sync, Player.skipButton, Player.controls, Player.panel);
      if (!m.sync) Player.sync.style.display = 'none';
      document.body.appendChild(Player.node);
      Player.engine = new Engine(video, function (message) { Player.fail(message); }, function (line) { Player.log(line); });
      video.addEventListener('playing', function () {
        clearTimeout(Player.stallTimer);
        Player.setStatus(null);
        Player.diag.style.display = 'none';
        if (!Player.played && Player.report) Player.report.start(Player.position());
        // Direct lancé : signalé à l'accueil (fiabilité du serveur).
        if (!Player.played && !m.vod) send({ type: 'playerEvent', event: 'live', action: 'playing', playSessionId: Player.playSessionId });
        Player.played = true;
        Player.reconnects = 0;
        if (m.sync) Player.event('state', 'ready');
      });
      video.addEventListener('waiting', function () {
        Player.setStatus('Chargement…');
        if (m.sync) Player.event('state', 'buffering');
        Player.watch(25000);
      });
      video.addEventListener('error', function () {
        // Vidéo vidée lors d'un changement de flux : pas une erreur.
        if (!video.getAttribute('src') && !video.currentSrc) return;
        Player.log('Erreur vidéo du téléviseur : ' + (video.error ? 'code ' + video.error.code + (video.error.message ? ' · ' + video.error.message : '') : 'inconnue'));
        Player.fail('Lecture impossible (' + (video.error ? 'code ' + video.error.code : 'erreur') + ').');
      });
      video.addEventListener('ended', function () { if (m.vod) Player.finish(true, null, false, true); else Player.fail('Le direct s’est arrêté.'); });
      video.addEventListener('loadedmetadata', function () {
        if (m.vod && m.startMs > 0 && !Player.startApplied) { Player.startApplied = true; try { video.currentTime = m.startMs / 1000; } catch (error) { /* position refusée */ } }
        if (Player.resumeAt >= 0) { try { video.currentTime = Player.resumeAt; } catch (error) { /* position refusée */ } Player.resumeAt = -1; }
        Player.showSubtitles();
      });
      video.addEventListener('timeupdate', Player.renderTime);
      video.addEventListener('timeupdate', Player.updateSkip);
      // Fin de film ou d'épisode : certains téléviseurs n'envoient pas
      // « ended » à la fin d'un flux HLS (image figée sur la dernière seconde).
      video.addEventListener('timeupdate', function () {
        if (!m.vod || !Player.played || !isFinite(video.duration) || !video.duration) return;
        var atEnd = video.currentTime >= video.duration - 0.6;
        if (!atEnd) { clearTimeout(Player.endTimer); Player.endTimer = 0; return; }
        if (Player.endTimer) return;
        Player.endTimer = setTimeout(function () {
          Player.endTimer = 0;
          if (Player.video === video && video.currentTime >= video.duration - 0.6 && !video.seeking) Player.finish(true, null, false, true);
        }, 2500);
      });
      Player.startApplied = false;
      Player.resumeAt = -1;
      if (m.vod && m.jellyfin && session) Player.report = new Report(m);
      Player.renderButtons();
      Player.renderGuide();
      Player.showBanner();
      Player.start(m.url, m.mime);
      Player.progressTimer = setInterval(function () {
        Player.renderGuide();
        if (Player.report && Player.played) Player.report.progress(Player.position(), video.paused);
      }, 10000);
      keepScreenOn(true);
    },
    managed: function () { return Boolean(Player.m && !Player.m.vod && !Player.m.sync && Player.epg && Player.epg.managed); },
    zappable: function () { return Boolean(Player.managed() && Player.epg.zap); },
    url: function (url) {
      // Lecteur du téléviseur : pas d'en-tête possible, jeton Jellyfin dans l'adresse.
      if (Player.m && Player.m.vod && session && url.indexOf(JF + '/') === 0 && url.indexOf('ApiKey=') < 0) url += (url.indexOf('?') < 0 ? '?' : '&') + 'ApiKey=' + encodeURIComponent(session.token);
      return url;
    },
    start: function (url, mime, limit) {
      Player.currentUrl = url;
      Player.currentMime = mime;
      Player.setStatus('Connexion…');
      // Direct : 12 s pour démarrer (10 s pour le second lecteur), puis serveur
      // suivant (la fenêtre des serveurs ou l'accueil en choisit un autre) ; film : 30 s.
      // Samsung 2014 : le relais du serveur prépare d'abord quelques segments (45 s).
      if (ORSAY && Player.library) limit = 45000;
      Player.watch(limit || (Player.m && !Player.m.vod ? 12000 : 30000));
      Player.engine.load(Player.url(url), mime, Player.library, Player.m && Player.m.headers).then(function () {
        var attempt = Player.video.play();
        if (attempt && attempt.catch) attempt.catch(function () { /* lecture automatique refusée : OK relance */ });
      }, function (error) { Player.fail(error.message); });
    },
    watch: function (ms) {
      clearTimeout(Player.stallTimer);
      Player.stallTimer = setTimeout(function () {
        if (Player.video && !Player.video.paused && Player.video.readyState < 3) Player.fail('Le flux ne répond plus.');
      }, ms);
    },
    fail: function (message) {
      if (!Player.node || Player.finished) return;
      clearTimeout(Player.stallTimer);
      // Lecteur du téléviseur en échec : second essai avec hls.js / mpegts.js
      // (format mal reconnu), sauf erreur réseau (le flux ne répond pas : un
      // autre lecteur n'y changerait rien, on passe au serveur suivant).
      var networkError = Player.video && Player.video.error && Player.video.error.code === 2;
      if (!Player.library && Player.engine.canFallback() && !Player.played && !networkError) {
        Player.library = true;
        Player.start(Player.currentUrl, Player.currentMime, 10000);
        return;
      }
      // Coupure après une lecture réussie : reconnexion espacée (1, 2, 4, 8 s).
      if (Player.played && Player.reconnects < 4 && !(Player.m && Player.m.vod)) {
        var delay = 1000 * Math.pow(2, Player.reconnects++);
        Player.setStatus('Reconnexion…');
        setTimeout(function () { if (Player.node && !Player.finished) Player.start(Player.currentUrl, Player.currentMime); }, delay);
        return;
      }
      Player.log('Échec : ' + (message || 'flux indisponible'));
      if (Player.managed() && !Player.failure) {
        // L'accueil choisit un autre serveur et renvoie son flux (« load »).
        Player.failure = message || 'Flux indisponible.';
        Player.setStatus('Serveur indisponible · recherche d’un autre serveur…');
        send({ type: 'playerEvent', event: 'failed', message: Player.failure, played: Player.played });
        clearTimeout(Player.failTimer);
        Player.failTimer = setTimeout(function () { Player.finish(false, Player.failure); }, 20000);
        return;
      }
      Player.finish(false, message);
    },
    log: function (line) {
      if (!Player.diag) return;
      var time = new Date();
      Player.diagLines.push(('0' + time.getMinutes()).slice(-2) + ':' + ('0' + time.getSeconds()).slice(-2) + '  ' + line);
      if (Player.diagLines.length > 6) Player.diagLines.shift();
      Player.diag.textContent = Player.diagLines.join('\n');
      if (!Player.played) Player.diag.style.display = '';
    },
    position: function () { return Player.video ? Math.floor((Player.video.currentTime || 0) * 1000) : 0; },
    setStatus: function (text) {
      if (!Player.status) return;
      Player.status.textContent = text || '';
      Player.status.style.display = text ? '' : 'none';
    },
    event: function (event, action, positionMs) {
      send({ type: 'playerEvent', event: event, action: action, positionMs: positionMs === undefined ? Player.position() : positionMs, playing: Player.video && !Player.video.paused });
    },

    // Bandeau : chaîne, programme en cours (avancement) et suivant.
    renderGuide: function () {
      if (!Player.node) return;
      var epg = Player.epg;
      var now = epg && epg.now, next = epg && epg.next, time = Date.now();
      if (now && now.stop && now.stop <= time && next && next.start <= time) { now = next; next = null; epg.now = now; epg.next = null; }
      if (now && now.title) {
        Player.now.textContent = 'En ce moment' + (now.start && now.stop ? ' · ' + hour(now.start) + ' – ' + hour(now.stop) : '') + ' · ' + now.title;
        Player.bar.style.display = now.start && now.stop > now.start ? '' : 'none';
        Player.bar.firstChild.style.width = Math.max(0, Math.min(100, (time - now.start) / (now.stop - now.start) * 100)) + '%';
      } else {
        Player.now.textContent = epg && !Player.m.vod ? 'Programme non communiqué par la source' : '';
        Player.bar.style.display = 'none';
      }
      var keys = Player.zappable() ? '▲ ▼ changer de chaîne · ◀ liste des chaînes · ▶ serveurs' + (epg.position ? ' · ' + epg.position : '')
        : Player.managed() ? '▶ changer de serveur' : '';
      Player.next.textContent = (next && next.title ? 'Ensuite' + (next.start ? ' · ' + hour(next.start) : '') + ' · ' + next.title + (keys ? '\n' : '') : '') + keys;
    },
    showBanner: function () {
      if (!Player.banner) return;
      Player.renderGuide();
      Player.banner.classList.add('shown');
      if (Player.diag && Player.diagLines.length) Player.diag.style.display = '';
      clearTimeout(Player.bannerTimer);
      Player.bannerTimer = setTimeout(function () {
        if (Player.banner) Player.banner.classList.remove('shown');
        if (Player.diag && Player.played) Player.diag.style.display = 'none';
      }, Player.epg ? 7000 : 5000);
    },

    // Barre de commandes : lecture/pause, pistes, chaînes, serveurs, quitter.
    renderButtons: function () {
      var m = Player.m;
      // Icônes dessinées : les symboles « ⏯ ☰ ⇄ 💬 » manquent dans les polices de certains téléviseurs.
      var list = [{ icon: 'playpause', label: 'Lecture / pause', run: function () { Player.togglePause(); } }];
      if (m.vod && m.tracks && m.tracks.audio && m.tracks.audio.length > 1) list.push({ icon: 'audio', label: 'Audio', run: function () { Player.openPanel('audio'); } });
      if (m.vod && m.tracks && m.tracks.subtitles && m.tracks.subtitles.length) list.push({ icon: 'subtitles', label: 'Sous-titres', run: function () { Player.openPanel('subtitles'); } });
      if (Player.zappable()) list.push({ icon: 'channels', label: 'Chaînes', run: function () { Player.openPanel('channels'); } });
      if (Player.managed()) list.push({ icon: 'servers', label: 'Serveurs', run: function () { Player.openPanel('servers'); } });
      list.push({ icon: 'close', label: 'Quitter', run: function () { Player.finish(true, null); } });
      Player.buttons.innerHTML = '';
      list.forEach(function (entry) {
        var button = el('button', { class: 'nw-btn', onclick: function () { entry.run(); } });
        button.innerHTML = '<svg class="nw-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + PLAYER_ICONS[entry.icon] + '</svg>';
        button.appendChild(document.createTextNode(entry.label));
        Player.buttons.appendChild(button);
      });
    },
    renderTime: function () {
      var video = Player.video;
      if (!video || !Player.m) return;
      if (Player.m.vod) {
        var duration = video.duration && isFinite(video.duration) ? video.duration : 0;
        var at = Player.pendingSeek >= 0 ? Player.pendingSeek / 1000 : video.currentTime;
        Player.time.textContent = clock(at) + (duration ? ' / ' + clock(duration) : '');
        Player.seek.firstChild.style.width = duration ? Math.min(100, at / duration * 100) + '%' : '0';
      } else {
        Player.time.textContent = 'En direct';
      }
    },
    showControls: function () {
      Player.controlsOpen = true;
      Player.controls.classList.add('shown');
      Player.renderTime();
      var first = Player.buttons.firstChild;
      if (first) first.focus();
      Player.showBanner();
    },
    hideControls: function () {
      Player.controlsOpen = false;
      Player.controls.classList.remove('shown');
      if (document.activeElement && Player.controls.contains(document.activeElement)) document.activeElement.blur();
    },
    togglePause: function () {
      var video = Player.video;
      if (!video) return;
      if (Player.m.sync) { Player.event('user', video.paused ? 'unpause' : 'pause'); Player.syncLabel(video.paused ? 'reprise demandée au groupe…' : 'pause demandée au groupe…'); return; }
      if (video.paused) { var attempt = video.play(); if (attempt && attempt.catch) attempt.catch(function () { /* refus */ }); }
      else video.pause();
      if (Player.report) Player.report.progress(Player.position(), video.paused);
    },
    syncLabel: function (text) {
      Player.sync.style.display = '';
      Player.sync.textContent = 'SyncPlay · ' + text;
    },
    // Génériques : segment en cours (intro, récap, aperçu, générique de fin).
    updateSkip: function () {
      var m = Player.m, video = Player.video;
      if (!m || !m.vod || !video || !Player.skipButton) return;
      var at = video.currentTime * 1000;
      var found = null;
      (m.segments || []).forEach(function (segment) {
        if (!found && at >= segment.startMs - 500 && at < segment.endMs - 1500) found = segment;
      });
      if (found === Player.segment) return;
      Player.segment = found;
      if (!found || found.dismissed) { Player.skipButton.style.display = 'none'; return; }
      Player.skipButton.textContent = Player.skipLabel(found) + '  ·  OK';
      Player.skipButton.style.display = '';
    },
    skipLabel: function (segment) {
      if (segment.type === 'outro') return Player.m.episode ? 'Épisode suivant' : 'Passer le générique';
      if (segment.type === 'recap') return 'Passer le récap';
      if (segment.type === 'preview') return 'Passer l’aperçu';
      return 'Passer l’intro';
    },
    skip: function () {
      var segment = Player.segment, video = Player.video;
      if (!segment || !video) return;
      segment.dismissed = true;
      Player.segment = null;
      Player.skipButton.style.display = 'none';
      var duration = video.duration && isFinite(video.duration) ? video.duration * 1000 : 0;
      // Générique de fin jusqu'au bout : fin du titre (épisode suivant proposé).
      if (segment.type === 'outro' && (Player.m.episode || !duration || segment.endMs >= duration - 10000)) { Player.finish(true, null, false, true); return; }
      Player.skipping = true;
      try { video.currentTime = segment.endMs / 1000; } catch (error) { /* position refusée */ }
      setTimeout(function () { Player.skipping = false; }, 1500);
      if (Player.report) Player.report.progress(segment.endMs, video.paused);
    },
    // Avance rapide de plus de 20 s dans les 10 premières minutes d'un épisode :
    // générique passé à la main, appris pour la série (bouton aux épisodes suivants).
    learnSkip: function (fromMs, toMs) {
      var m = Player.m;
      if (!m || !m.episode || !m.seriesId || Player.skipping) return;
      var now = Date.now();
      var learn = Player.skipLearn;
      if (toMs - fromMs > 20000 && fromMs < 10 * 60000) {
        if (learn && now - learn.at < 8000 && Math.abs(fromMs - learn.endMs) < 6000) learn.endMs = toMs;
        else { Player.flushSkip(); learn = Player.skipLearn = { startMs: fromMs, endMs: toMs }; }
        learn.at = now;
        clearTimeout(Player.learnTimer);
        Player.learnTimer = setTimeout(Player.flushSkip, 8000);
      }
    },
    flushSkip: function () {
      var learn = Player.skipLearn;
      Player.skipLearn = null;
      clearTimeout(Player.learnTimer);
      if (!learn || !Player.m) return;
      send({ type: 'playerEvent', event: 'introSkip', seriesId: Player.m.seriesId, startMs: learn.startMs, endMs: learn.endMs });
    },
    seekBy: function (deltaMs) {
      var video = Player.video;
      if (!video) return;
      if (Player.pendingSeek < 0) Player.pendingSeek = Player.position();
      var duration = video.duration && isFinite(video.duration) ? video.duration * 1000 : 0;
      Player.pendingSeek = Math.max(0, Player.pendingSeek + deltaMs);
      if (duration) Player.pendingSeek = Math.min(Player.pendingSeek, duration - 1000);
      Player.controls.classList.add('shown');
      Player.renderTime();
      clearTimeout(Player.seekTimer);
      Player.seekTimer = setTimeout(function () {
        var target = Player.pendingSeek;
        Player.pendingSeek = -1;
        if (target < 0) return;
        if (Player.m.sync) { Player.event('user', 'seek', target); Player.syncLabel('aller à ' + clock(target / 1000)); return; }
        Player.learnSkip(video.currentTime * 1000, target);
        try { video.currentTime = target / 1000; } catch (error) { /* position refusée */ }
        if (!Player.controlsOpen) setTimeout(function () { if (!Player.controlsOpen && Player.controls) Player.controls.classList.remove('shown'); }, 1500);
      }, 700);
    },

    // Panneaux : chaînes et serveurs (listes envoyées par l'accueil), pistes.
    openPanel: function (mode) {
      Player.hideControls();
      Player.panelMode = mode;
      Player.panelItems = [];
      Player.panelCurrent = -1;
      Player.panel.classList.add('shown');
      if (mode === 'channels' || mode === 'servers') {
        Player.panelTitle.textContent = mode === 'servers' ? 'Serveurs' : 'Chaînes';
        Player.panelList.innerHTML = '';
        Player.panelList.appendChild(el('p', { class: 'nw-muted', text: 'Chargement…' }));
        send({ type: 'playerEvent', event: mode });
        return;
      }
      var tracks = Player.m.tracks || {};
      var items = mode === 'audio'
        ? (tracks.audio || []).map(function (track) { return { name: track.label, value: track.index, language: track.language }; })
        : [{ name: 'Aucun', value: -1, language: 'none' }].concat((tracks.subtitles || []).map(function (track) { return { name: track.label, value: track.index, language: track.language || '' }; }));
      var current = mode === 'audio' ? tracks.audioIndex : tracks.subtitleIndex;
      Player.showList(mode === 'audio' ? 'Langue audio' : 'Sous-titres', items, items.map(function (item) { return item.value; }).indexOf(current));
    },
    showList: function (title, items, current) {
      Player.panelTitle.textContent = title;
      Player.panelItems = items;
      Player.panelCurrent = current;
      Player.panelList.innerHTML = '';
      items.forEach(function (item, index) {
        var now = item.now;
        var line = now && now.title ? (now.start ? hour(now.start) + (now.stop ? '–' + hour(now.stop) : '') + '  ' : '') + now.title : (item.sub || '');
        Player.panelList.appendChild(el('button', { class: 'nw-row-item' + (index === current ? ' current' : ''), onclick: function () { Player.pick(index); } },
          el('b', { text: (Player.panelMode === 'channels' ? (index + 1) + '   ' : '') + (index === current ? '▶ ' : '') + (item.name || '') }),
          line ? el('span', { text: line }) : null));
      });
      var target = Player.panelList.children[Math.max(0, current)];
      if (target) { target.focus(); listScroll(target); }
    },
    closePanel: function () {
      Player.panelMode = '';
      if (Player.panel) Player.panel.classList.remove('shown');
      if (document.activeElement && Player.panel && Player.panel.contains(document.activeElement)) document.activeElement.blur();
    },
    pick: function (index) {
      var mode = Player.panelMode;
      var item = Player.panelItems[index];
      Player.closePanel();
      if (!item) return;
      if (mode === 'channels') { if (index !== Player.panelCurrent) send({ type: 'playerEvent', event: 'zapTo', index: index }); }
      else if (mode === 'servers') send({ type: 'playerEvent', event: 'server', index: index });
      else if (mode === 'audio' || mode === 'subtitles') Player.switchTrack(mode, item);
    },
    // Piste changée pendant la lecture : même position, nouveau flux Jellyfin.
    switchTrack: function (mode, item) {
      var m = Player.m, tracks = m.tracks;
      if (mode === 'audio') { if (tracks.audioIndex === item.value) return; tracks.audioIndex = item.value; }
      else { if (tracks.subtitleIndex === item.value) return; tracks.subtitleIndex = item.value; }
      var subtitle = (tracks.subtitles || []).filter(function (track) { return track.index === tracks.subtitleIndex; })[0];
      var url = new URL(Player.currentUrl);
      url.searchParams.set('AudioStreamIndex', String(tracks.audioIndex));
      if (subtitle) {
        url.searchParams.set('SubtitleStreamIndex', String(subtitle.index));
        // Samsung 2014 : sous-titres incrustés par le serveur (pas de pistes WebVTT).
        url.searchParams.set('SubtitleMethod', subtitle.text && !ORSAY ? 'Hls' : 'Encode');
      } else {
        url.searchParams.delete('SubtitleStreamIndex');
        url.searchParams.delete('SubtitleMethod');
      }
      if (Player.report) Player.report.stopEncoding();
      Player.resumeAt = Player.video.currentTime || 0;
      Player.start(url.toString(), Player.currentMime);
      send({ type: 'playerEvent', event: 'tracks', audio: mode === 'audio' ? (item.language || '') : undefined, subtitles: mode === 'subtitles' ? item.language || '' : undefined });
    },
    showSubtitles: function () {
      var tracks = Player.video && Player.video.textTracks;
      var wanted = Player.m && Player.m.tracks && Player.m.tracks.subtitleIndex >= 0;
      for (var i = 0; tracks && i < tracks.length; i++) tracks[i].mode = wanted && i === 0 ? 'showing' : 'disabled';
      try { if (Player.engine && Player.engine.hls) { Player.engine.hls.subtitleDisplay = Boolean(wanted); if (wanted) Player.engine.hls.subtitleTrack = 0; } } catch (error) { /* sans sous-titres */ }
    },

    command: function (c) {
      if (!Player.node || Player.finished) return;
      var action = c.command, video = Player.video;
      var position = typeof c.positionMs === 'number' ? c.positionMs : -1;
      if (action === 'pause') { video.pause(); if (position >= 0) video.currentTime = position / 1000; }
      else if (action === 'unpause') { if (position >= 0) video.currentTime = position / 1000; var p = video.play(); if (p && p.catch) p.catch(function () { /* refus */ }); }
      else if (action === 'playpause') Player.togglePause();
      else if (action === 'seek') { if (c.pause) video.pause(); if (position >= 0) video.currentTime = position / 1000; }
      else if (action === 'stop') { Player.finish(true, null); return; }
      else if (action === 'zapping' && !Player.m.vod) {
        Player.title.textContent = c.title || '';
        Player.subtitle.textContent = c.subtitle || '';
        if (c.epg) Player.epg = c.epg;
        Player.setStatus(c.message || 'Connexion…');
        Player.showBanner();
      } else if (action === 'guide' && !Player.m.vod) {
        if (c.epg) { Player.epg = c.epg; Player.renderGuide(); }
      } else if (action === 'load' && !Player.m.vod) {
        clearTimeout(Player.failTimer);
        Player.failure = null;
        Player.played = false;
        Player.library = false;
        Player.reconnects = 0;
        if (c.playSessionId) Player.playSessionId = c.playSessionId;
        Player.m.headers = c.headers || null;
        Player.title.textContent = c.title || '';
        Player.subtitle.textContent = c.subtitle || '';
        if (c.epg) Player.epg = c.epg;
        Player.renderButtons();
        Player.start(c.url, c.mime);
        Player.showBanner();
      } else if ((action === 'channels' || action === 'servers') && !Player.m.vod) {
        if ((c.mode || 'channels') !== Player.panelMode) return;
        var selected = document.activeElement && Player.panelList.contains(document.activeElement)
          ? Array.prototype.indexOf.call(Player.panelList.children, document.activeElement) : -1;
        Player.showList(c.title || (action === 'servers' ? 'Serveurs' : 'Chaînes'), c.items || [], typeof c.current === 'number' ? c.current : -1);
        if (c.update && selected >= 0 && Player.panelList.children[selected]) Player.panelList.children[selected].focus();
      }
      if (c.status !== undefined && Player.sync) {
        Player.sync.textContent = c.status;
        Player.sync.style.display = c.status ? '' : 'none';
      }
    },

    key: function (event) {
      if (!Player.node) return false;
      var video = Player.video, m = Player.m;
      // Panneau ouvert : la liste reçoit ▲ ▼ et OK ; ◀ ▶ et Retour le ferment.
      if (Player.panelMode) {
        var rows = Array.prototype.slice.call(Player.panelList.children).filter(function (node) { return node.tagName === 'BUTTON'; });
        var at = rows.indexOf(document.activeElement);
        if (is(event, 'up')) { if (rows.length) { var up = rows[Math.max(0, at - 1)]; up.focus(); listScroll(up); } return true; }
        if (is(event, 'down')) { if (rows.length) { var down = rows[Math.min(rows.length - 1, at + 1)]; down.focus(); listScroll(down); } return true; }
        if (is(event, 'chUp') || is(event, 'chDown')) {
          if (rows.length) { var jump = rows[Math.max(0, Math.min(rows.length - 1, at + (is(event, 'chUp') ? -10 : 10)))]; jump.focus(); listScroll(jump); }
          return true;
        }
        if (is(event, 'enter')) { if (at >= 0) rows[at].click(); return true; }
        if (is(event, 'back') || is(event, 'left') || is(event, 'right') || is(event, 'menu')) { Player.closePanel(); return true; }
        return true;
      }
      if (is(event, 'stop')) { Player.finish(true, null); return true; }
      // Barre de commandes : ◀ ▶ entre les boutons, OK, Retour ou ▲ la ferment.
      if (Player.controlsOpen) {
        var buttons = Array.prototype.slice.call(Player.buttons.children);
        var index = buttons.indexOf(document.activeElement);
        if (is(event, 'left')) { if (index > 0) buttons[index - 1].focus(); else if (m.vod) Player.seekBy(-10000); return true; }
        if (is(event, 'right')) { if (index >= 0 && index < buttons.length - 1) buttons[index + 1].focus(); else if (m.vod) Player.seekBy(10000); return true; }
        if (is(event, 'enter')) { if (index >= 0) buttons[index].click(); else buttons[0].focus(); return true; }
        if (is(event, 'back') || is(event, 'up')) { Player.hideControls(); return true; }
        if (is(event, 'down')) return true;
      }
      if (is(event, 'enter') && Player.segment && !Player.segment.dismissed && Player.skipButton.style.display !== 'none') { Player.skip(); return true; }
      if (is(event, 'back')) { Player.finish(true, null); return true; }
      if (is(event, 'playPause') || is(event, 'play') || is(event, 'pause')) {
        if (is(event, 'play') && !video.paused && !m.sync) return true;
        if (is(event, 'pause') && video.paused && !m.sync) return true;
        Player.togglePause();
        return true;
      }
      if (is(event, 'forward') || is(event, 'rewind')) { if (m.vod) Player.seekBy(is(event, 'forward') ? 30000 : -30000); return true; }
      if (is(event, 'info')) { Player.showBanner(); return true; }
      if (Player.zappable()) {
        var delta = is(event, 'up') || is(event, 'chUp') ? -1 : is(event, 'down') || is(event, 'chDown') ? 1 : 0;
        if (delta) {
          // Appuis rapprochés cumulés : une seule demande (▼ ▼ ▼ = 3 chaînes plus loin).
          Player.zapDelta += delta;
          Player.setStatus(Player.zapDelta > 0 ? 'Chaîne suivante' + (Player.zapDelta > 1 ? ' (+' + Player.zapDelta + ')' : '') + '…'
            : 'Chaîne précédente' + (Player.zapDelta < -1 ? ' (' + Player.zapDelta + ')' : '') + '…');
          clearTimeout(Player.zapTimer);
          Player.zapTimer = setTimeout(function () {
            var value = Player.zapDelta;
            Player.zapDelta = 0;
            if (value) send({ type: 'playerEvent', event: 'zap', delta: value });
          }, 450);
          return true;
        }
        if (is(event, 'left') || is(event, 'menu')) { Player.openPanel('channels'); return true; }
        // Numéro de chaîne (0-9) : validé après 1,5 s ou par OK.
        var code = event.keyCode;
        var digit = code >= 48 && code <= 57 ? code - 48 : code >= 96 && code <= 105 ? code - 96 : -1;
        if (digit >= 0) {
          if (Player.typed.length < 4) Player.typed += String(digit);
          Player.setStatus('Chaîne ' + Player.typed + '…');
          clearTimeout(Player.numberTimer);
          Player.numberTimer = setTimeout(Player.sendNumber, 1500);
          return true;
        }
        if (Player.typed && is(event, 'enter')) { clearTimeout(Player.numberTimer); Player.sendNumber(); return true; }
      }
      if (Player.managed() && is(event, 'right')) { Player.openPanel('servers'); return true; }
      if (m.vod && (is(event, 'left') || is(event, 'right'))) { Player.seekBy(is(event, 'right') ? 10000 : -10000); return true; }
      if (is(event, 'enter') || is(event, 'up') || is(event, 'down')) { Player.showControls(); return true; }
      return true;
    },

    typed: '',
    numberTimer: 0,
    sendNumber: function () {
      var number = Number(Player.typed) || 0;
      Player.typed = '';
      var total = Number((/\/\s*(\d+)/.exec((Player.epg && Player.epg.position) || '') || [])[1]) || 0;
      if (number > 0 && (!total || number <= total)) { send({ type: 'playerEvent', event: 'zapTo', index: number - 1, number: true }); return; }
      Player.setStatus('Pas de chaîne n° ' + number + (total ? ' (' + total + ' chaînes)' : ''));
      setTimeout(function () { if (!Player.typed && Player.played) Player.setStatus(null); }, 2500);
    },

    finish: function (ok, error, silent, ended) {
      if (!Player.node || Player.finished) return;
      Player.finished = true;
      var m = Player.m, video = Player.video;
      var position = Player.position();
      if (ended && video && video.duration && isFinite(video.duration)) position = Math.floor(video.duration * 1000);
      [Player.stallTimer, Player.failTimer, Player.bannerTimer, Player.seekTimer, Player.zapTimer, Player.endTimer, Player.numberTimer].forEach(clearTimeout);
      Player.typed = '';
      Player.endTimer = 0;
      clearInterval(Player.progressTimer);
      if (Player.skipLearn) Player.flushSkip();
      if (Player.report) { Player.report.stop(position, Player.played); Player.report = null; }
      Player.engine.destroy();
      Player.node.remove();
      Player.node = null;
      Player.controlsOpen = false;
      Player.panelMode = '';
      keepScreenOn(false);
      if (!silent) {
        send({
          type: 'playerClosed', ok: ok, played: Player.played, vod: Boolean(m.vod), sync: Boolean(m.sync),
          playSessionId: Player.playSessionId, ended: Boolean(ended), positionMs: position, error: ok ? '' : (error || 'Lecture impossible.')
        });
      }
    }
  };
  handlers.push({ active: function () { return Boolean(Player.node); }, key: Player.key });
  // Touche Accueil, mise en veille ou appli fermée : la position est envoyée
  // tout de suite (« Continuer à regarder » à jour même sans arrêt du lecteur).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'hidden' || !Player.report || !Player.played) return;
    Player.report.progress(Player.position(), true);
  });

  // Suivi de lecture Jellyfin (reprise, « Vu », sessions du tableau de bord).
  function Report(m) {
    this.m = m;
    this.device = m.deviceId || deviceId();
    this.started = false;
  }
  Report.prototype.body = function (positionMs, paused, event) {
    var body = { ItemId: this.m.itemId, MediaSourceId: this.m.mediaSourceId, PlaySessionId: this.m.playSessionId,
      PositionTicks: Math.max(0, positionMs) * 10000, CanSeek: true, IsPaused: Boolean(paused), PlayMethod: 'Transcode' };
    if (event) body.EventName = event;
    return body;
  };
  Report.prototype.post = function (path, body) {
    if (!session) return;
    jellyfin('POST', path, body, session.token, this.device, true).catch(function () { /* suivi facultatif */ });
  };
  Report.prototype.start = function (positionMs) { this.started = true; this.post('/Sessions/Playing', this.body(positionMs, false)); };
  Report.prototype.progress = function (positionMs, paused) { if (this.started) this.post('/Sessions/Playing/Progress', this.body(positionMs, paused, 'timeupdate')); };
  Report.prototype.stopEncoding = function () {
    if (!session) return;
    jellyfin('DELETE', '/Videos/ActiveEncodings?deviceId=' + encodeURIComponent(this.device) + '&playSessionId=' + encodeURIComponent(this.m.playSessionId), undefined, session.token, this.device)
      .catch(function () { /* déjà arrêté */ });
  };
  Report.prototype.stop = function (positionMs, played) {
    if (played && !this.started) this.start(positionMs);
    if (this.started) this.post('/Sessions/Playing/Stopped', this.body(positionMs, false));
    this.stopEncoding();
  };

  // ── Multiview ─────────────────────────────────────────────────────────
  var MULTI_MAX = 12;
  var Multiview = {
    node: null, tiles: [], audio: null, featured: null, zoomed: null, menu: null, catalog: [],

    open: function (items, catalog) {
      // Samsung 2014 : un seul décodeur, mosaïque composée par le serveur.
      if (ORSAY) { ORSAY.multiview(items, catalog); return; }
      if (Multiview.node) Multiview.close();
      Multiview.catalog = (catalog || []).filter(function (channel) { return channel && (channel.stream || channel.resolver); });
      Multiview.node = el('div', { id: 'nw-multi', class: 'nw-overlay' });
      document.body.appendChild(Multiview.node);
      Multiview.tiles = [];
      items.slice(0, MULTI_MAX).forEach(function (item) {
        var options = (item.options || []).filter(function (option) { return option.url || option.resolve; });
        // Démarrages échelonnés : moins d'échecs au lancement sur les téléviseurs modestes.
        if (options.length) Multiview.add(item.title || '', item.subtitle || '', options, Multiview.tiles.length * 400);
      });
      if (!Multiview.tiles.length) { Multiview.close(); return; }
      Multiview.audio = Multiview.tiles[0];
      Multiview.arrange();
      Multiview.labels();
      Multiview.tiles[0].node.focus();
      keepScreenOn(true);
    },
    add: function (title, subtitle, options, delay) {
      var video = el('video', { autoplay: true, muted: true, playsinline: true });
      video.muted = true;
      var tile = { title: title, subtitle: subtitle, options: options, current: -1, failed: {}, generation: 0, video: video };
      tile.label = el('div', { class: 'nw-tile-label' });
      tile.status = el('div', { class: 'nw-tile-status' });
      tile.node = el('div', { class: 'nw-tile', tabindex: '0', onclick: function () { Multiview.openMenu(tile); } }, video, tile.label, tile.status);
      tile.engine = new Engine(video, function (message) { Multiview.failed(tile, message); });
      video.addEventListener('playing', function () {
        clearTimeout(tile.stallTimer);
        tile.status.textContent = '';
        tile.played = true;
        tile.retries = 0;
      });
      // Flux bloqué (mise en mémoire tampon sans fin) : serveur suivant après 20 s.
      video.addEventListener('waiting', function () {
        clearTimeout(tile.stallTimer);
        var generation = tile.generation;
        tile.stallTimer = setTimeout(function () {
          if (generation === tile.generation && Multiview.tiles.indexOf(tile) >= 0 && (video.paused || video.readyState < 3)) Multiview.failed(tile, 'Le flux ne répond plus.');
        }, 20000);
      });
      video.addEventListener('ended', function () { Multiview.failed(tile, 'Le direct s’est interrompu.'); });
      video.addEventListener('error', function () {
        if (!video.getAttribute('src') && !video.currentSrc) return;
        Multiview.failed(tile, 'Lecture impossible (code ' + (video.error ? video.error.code : '?') + ')');
      });
      Multiview.node.appendChild(tile.node);
      Multiview.tiles.push(tile);
      if (delay) {
        Multiview.status(tile, 'Connexion…');
        setTimeout(function () { if (Multiview.tiles.indexOf(tile) >= 0 && tile.current < 0) Multiview.play(tile, 0); }, delay);
      } else Multiview.play(tile, 0);
      return tile;
    },
    status: function (tile, text) { tile.status.textContent = text || ''; },
    labels: function () {
      Multiview.tiles.forEach(function (tile) {
        var option = tile.options[tile.current];
        tile.label.textContent = (tile === Multiview.audio ? '♪  ' : '') + tile.title + (tile.subtitle ? '  ·  ' + tile.subtitle : '')
          + (option && tile.options.length > 1 ? '  ·  ' + option.label : '');
        tile.video.muted = tile !== Multiview.audio;
        tile.node.classList.toggle('audio', tile === Multiview.audio);
      });
      Multiview.publish();
    },
    // État envoyé au téléphone qui pilote le multiview : chaînes, son, chaîne mise en avant.
    publish: function () {
      send({ type: 'multiviewState', state: {
        tiles: Multiview.tiles.map(function (tile) { return { title: tile.title, subtitle: tile.subtitle }; }),
        audio: Multiview.tiles.indexOf(Multiview.audio),
        featured: Multiview.featured ? Multiview.tiles.indexOf(Multiview.featured) : -1
      } });
    },
    // Commandes du téléphone : add (item {title, subtitle, options}), remove, audio, feature, solo, grid, state.
    remote: function (message) {
      if (ORSAY) { ORSAY.multiviewRemote(message); return; }
      var command = message.command;
      if (command === 'state') { Multiview.publish(); return; }
      if (!Multiview.node) return;
      var tile = Multiview.tiles[Number(message.index)];
      if (command === 'add') {
        var item = message.item || {};
        var options = (item.options || []).filter(function (option) { return option && (option.url || option.resolve); });
        if (!options.length || Multiview.tiles.length >= MULTI_MAX) return;
        Multiview.add(String(item.title || ''), String(item.subtitle || ''), options);
        Multiview.zoomed = null;
      } else if (command === 'close') {
        Multiview.close();
        return;
      } else if (command === 'grid') {
        Multiview.featured = null;
        Multiview.zoomed = null;
      } else if (!tile) {
        return;
      } else if (command === 'remove') {
        Multiview.remove(tile);
        return;
      } else if (command === 'audio') {
        Multiview.audio = tile;
      } else if (command === 'feature') {
        Multiview.featured = Multiview.tiles.length > 1 && Multiview.featured !== tile ? tile : null;
        Multiview.zoomed = null;
      } else if (command === 'solo') {
        Multiview.audio = tile;
        Multiview.featured = Multiview.tiles.length > 1 ? tile : null;
        Multiview.zoomed = null;
      }
      Multiview.arrange();
      Multiview.labels();
    },
    play: function (tile, index) {
      tile.current = index;
      clearTimeout(tile.stallTimer);
      clearTimeout(tile.retryTimer);
      var generation = ++tile.generation;
      var option = tile.options[index];
      Multiview.labels();
      if (option.url) { Multiview.start(tile, option.url, option.mime, false); return; }
      Multiview.status(tile, 'Connexion à ' + option.label + '…');
      noctraFetch(option.resolve).then(function (result) {
        if (generation !== tile.generation) return;
        var list = result && result.options ? result.options : [result];
        var found = list.filter(function (item) { return item && item.streamUrl && !item.manualOnly; })[0];
        if (!found) throw new Error('vide');
        option.url = new URL(found.streamUrl, option.resolve).toString();
        Multiview.start(tile, option.url, option.mime, false);
      }).catch(function () { if (generation === tile.generation) Multiview.failed(tile, 'Serveur indisponible'); });
    },
    start: function (tile, url, mime, library) {
      tile.library = library;
      Multiview.status(tile, 'Connexion…');
      tile.engine.load(url, mime, library).then(function () {
        var attempt = tile.video.play();
        if (attempt && attempt.catch) attempt.catch(function () { /* refus */ });
      }, function (error) { Multiview.failed(tile, error.message); });
    },
    failed: function (tile, message) {
      if (Multiview.tiles.indexOf(tile) < 0) return;
      var option = tile.options[tile.current];
      if (!tile.library && !tile.played && option && option.url && tile.engine.canFallback()) { Multiview.start(tile, option.url, option.mime, true); return; }
      clearTimeout(tile.stallTimer);
      // Coupure d'un flux qui fonctionnait : lien neuf du même serveur (au plus toutes les 2 min).
      if (tile.played && option && option.resolve && Date.now() - (tile.renewedAt || 0) > 120000) {
        tile.renewedAt = Date.now();
        tile.played = false;
        option.url = '';
        Multiview.status(tile, 'Reconnexion au serveur…');
        Multiview.play(tile, tile.current);
        return;
      }
      tile.failed[tile.current] = true;
      tile.played = false;
      for (var step = 1; step <= tile.options.length; step++) {
        var index = (tile.current + step) % tile.options.length;
        if (!tile.failed[index]) { Multiview.status(tile, 'Serveur indisponible · essai du suivant…'); Multiview.play(tile, index); return; }
      }
      if (/decod|MEDIA_ERR_DECODE|code 3|code 4/i.test(String(message))) { Multiview.status(tile, 'Le téléviseur ne peut pas décoder un flux de plus.'); return; }
      // Tous les serveurs en échec : nouvel essai de la liste après 20 s, 45 s, 1 min 30, 3 min.
      var delays = [20000, 45000, 90000, 180000];
      tile.retries = tile.retries || 0;
      if (tile.retries >= delays.length) { Multiview.status(tile, 'Flux indisponible · OK › Changer de serveur'); return; }
      var delay = delays[tile.retries++];
      var generation = tile.generation;
      Multiview.status(tile, 'Flux indisponible · nouvel essai dans ' + (delay / 1000) + ' s');
      clearTimeout(tile.retryTimer);
      tile.retryTimer = setTimeout(function () {
        if (generation !== tile.generation || Multiview.tiles.indexOf(tile) < 0) return;
        tile.failed = {};
        tile.options.forEach(function (item) { if (item.resolve) item.url = ''; });
        Multiview.play(tile, 0);
      }, delay);
    },
    arrange: function () {
      var tiles = Multiview.tiles, count = tiles.length;
      var others = count - 1, sideColumns = others > 4 ? 2 : 1, mainWidth = sideColumns === 2 ? 60 : 70;
      var columns = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
      var rows = Math.ceil(count / columns);
      tiles.forEach(function (tile, i) {
        var x, y, w, h, style = tile.node.style;
        tile.node.style.display = '';
        if (Multiview.zoomed) {
          if (tile !== Multiview.zoomed) { tile.node.style.display = 'none'; return; }
          x = 0; y = 0; w = 100; h = 100;
        } else if (Multiview.featured && count > 1) {
          if (tile === Multiview.featured) { x = 0; y = 0; w = mainWidth; h = 100; }
          else {
            var position = tiles.filter(function (other, j) { return j < i && other !== Multiview.featured; }).length;
            var sideRows = Math.ceil(others / sideColumns);
            w = (100 - mainWidth) / sideColumns; h = 100 / sideRows;
            x = mainWidth + (position % sideColumns) * w; y = Math.floor(position / sideColumns) * h;
          }
        } else {
          // Deux chaînes : côte à côte au format 16:9 (hauteur 50 %, centrées).
          w = 100 / columns; h = count === 2 ? 50 : 100 / rows;
          var row = Math.floor(i / columns), inRow = row === rows - 1 ? count - row * columns : columns;
          x = (columns - inRow) * w / 2 + (i % columns) * w; y = count === 2 ? 25 : row * h;
        }
        style.left = x + '%'; style.top = y + '%'; style.width = w + '%'; style.height = h + '%';
      });
    },
    move: function (event) {
      var current = document.activeElement;
      var tiles = Multiview.tiles.filter(function (tile) { return tile.node.style.display !== 'none'; });
      var from = tiles.filter(function (tile) { return tile.node === current; })[0];
      if (!from) { if (tiles[0]) tiles[0].node.focus(); return; }
      var a = from.node.getBoundingClientRect(), best = null, score = Infinity;
      var dir = is(event, 'left') ? 'left' : is(event, 'right') ? 'right' : is(event, 'up') ? 'up' : 'down';
      tiles.forEach(function (tile) {
        if (tile === from) return;
        var b = tile.node.getBoundingClientRect();
        var primary = dir === 'left' ? a.left - b.right : dir === 'right' ? b.left - a.right : dir === 'up' ? a.top - b.bottom : b.top - a.bottom;
        if (primary < -10) return;
        var secondary = dir === 'left' || dir === 'right' ? Math.abs((a.top + a.bottom) - (b.top + b.bottom)) / 2 : Math.abs((a.left + a.right) - (b.left + b.right)) / 2;
        var value = primary + secondary * 2;
        if (value < score) { score = value; best = tile; }
      });
      if (best) best.node.focus();
    },
    openMenu: function (tile) {
      var entries = [];
      if (tile !== Multiview.audio) entries.push(['♪  Écouter cette chaîne', function () { Multiview.audio = tile; Multiview.labels(); }]);
      if (Multiview.tiles.length > 1) entries.push([Multiview.featured === tile ? 'Revenir à la grille' : 'Mettre en avant', function () { Multiview.featured = Multiview.featured === tile ? null : tile; Multiview.arrange(); Multiview.publish(); }]);
      entries.push([Multiview.zoomed === tile ? 'Quitter le plein écran' : 'Plein écran', function () { Multiview.zoomed = Multiview.zoomed === tile ? null : tile; Multiview.arrange(); }]);
      if (tile.options.length > 1 || Object.keys(tile.failed).length) entries.push(['Changer de serveur (' + tile.options.length + ')', function () { Multiview.servers(tile); }]);
      if (Multiview.tiles.length < MULTI_MAX && Multiview.catalog.length) entries.push(['＋  Ajouter une chaîne (' + Multiview.tiles.length + '/' + MULTI_MAX + ')', function () { Multiview.addChannel(); }]);
      entries.push([Multiview.tiles.length > 1 ? '✕  Retirer cette chaîne' : '✕  Retirer cette chaîne et quitter', function () { Multiview.remove(tile); }]);
      Multiview.showMenu(tile.title, entries, tile);
    },
    showMenu: function (title, entries, back) {
      Multiview.hideMenu();
      var list = el('div', { class: 'nw-sheet nw-scroll' }, el('h2', { text: title }));
      entries.forEach(function (entry) {
        list.appendChild(el('button', { class: 'nw-f nw-btn', onclick: function () { var focus = back; Multiview.hideMenu(); entry[1](); if (focus && focus.node && focus.node.parentNode) focus.node.focus(); } }, entry[0]));
      });
      Multiview.menu = el('div', { class: 'nw-overlay nw-sheet-back' }, list);
      Multiview.menu._back = back;
      document.body.appendChild(Multiview.menu);
      var first = Multiview.menu.querySelector('.nw-f');
      if (first) first.focus();
    },
    hideMenu: function () {
      if (!Multiview.menu) return;
      var back = Multiview.menu._back;
      Multiview.menu.remove();
      Multiview.menu = null;
      if (back && back.node && back.node.parentNode) back.node.focus();
    },
    servers: function (tile) {
      Multiview.showMenu(tile.title + ' · serveurs', tile.options.map(function (option, index) {
        return [(index === tile.current ? '▶  ' : '') + option.label + (option.url ? '' : '  (automatique)') + (tile.failed[index] ? '  · échec' : ''), function () {
          delete tile.failed[index];
          tile.played = false;
          Multiview.play(tile, index);
        }];
      }), tile);
    },
    // Catalogue : d'abord le groupe (source, bouquet, catégorie), puis la chaîne.
    addChannel: function () {
      var groups = {}, order = [];
      Multiview.catalog.forEach(function (channel) {
        var present = Multiview.tiles.some(function (tile) { return tile.title === channel.title && tile.subtitle === channel.subtitle; });
        if (present) return;
        var group = channel.group || 'Chaînes';
        if (!groups[group]) { groups[group] = []; order.push(group); }
        groups[group].push(channel);
      });
      if (!order.length) { Multiview.showMenu('Toutes les chaînes disponibles sont affichées.', [['Fermer', function () { /* rien */ }]], null); return; }
      var pickChannel = function (group) {
        Multiview.showMenu(group, groups[group].map(function (channel) {
          return [channel.title, function () { Multiview.addTile(channel); }];
        }), null);
      };
      if (order.length === 1) { pickChannel(order[0]); return; }
      Multiview.showMenu('Ajouter une chaîne', order.map(function (group) {
        return [group + '  (' + groups[group].length + ')', function () { pickChannel(group); }];
      }), null);
    },
    addTile: function (channel) {
      if (Multiview.tiles.length >= MULTI_MAX) return;
      var ready = channel.stream
        ? Promise.resolve([{ label: 'Flux direct', url: channel.stream, mime: channel.mime || '' }])
        : noctraFetch(channel.resolver).then(function (result) {
          var list = result && result.options ? result.options : [result];
          var direct = [], automatic = [];
          list.forEach(function (item, i) {
            if (!item || item.manualOnly) return;
            if (item.streamUrl) direct.push({ label: item.label || 'Flux direct', url: new URL(item.streamUrl, channel.resolver).toString(), mime: /^(?:ts|mpegts|mpeg-ts)$/i.test(String(item.transport || '')) ? 'video/mp2t' : (channel.mime || '') });
            else if (item.resolveUrl && !item.url) automatic.push({ label: item.label || 'Serveur ' + (i + 1), resolve: new URL(item.resolveUrl, channel.resolver).toString(), mime: channel.mime || '' });
          });
          return direct.concat(automatic);
        });
      ready.then(function (options) {
        if (!Multiview.node) return;
        if (!options.length) { Multiview.showMenu(channel.title + ' : aucun flux direct (lecteur web seulement).', [['Fermer', function () { /* rien */ }]], null); return; }
        var tile = Multiview.add(channel.title, channel.subtitle || '', options);
        Multiview.zoomed = null;
        Multiview.arrange();
        Multiview.labels();
        tile.node.focus();
      }, function () { Multiview.showMenu(channel.title + ' : serveurs introuvables.', [['Fermer', function () { /* rien */ }]], null); });
    },
    remove: function (tile) {
      var index = Multiview.tiles.indexOf(tile);
      tile.generation++;
      tile.engine.destroy();
      tile.node.remove();
      Multiview.tiles.splice(index, 1);
      if (!Multiview.tiles.length) { Multiview.close(); return; }
      if (Multiview.featured === tile) Multiview.featured = null;
      if (Multiview.zoomed === tile) Multiview.zoomed = null;
      if (Multiview.audio === tile) Multiview.audio = Multiview.tiles[0];
      Multiview.arrange();
      Multiview.labels();
      Multiview.tiles[Math.max(0, Math.min(index, Multiview.tiles.length - 1))].node.focus();
    },
    key: function (event) {
      if (Multiview.menu) return listKeys(Multiview.menu, event, Multiview.hideMenu);
      if (is(event, 'left') || is(event, 'right') || is(event, 'up') || is(event, 'down')) { if (!Multiview.zoomed) Multiview.move(event); return true; }
      if (is(event, 'enter')) {
        var tile = Multiview.tiles.filter(function (item) { return item.node === document.activeElement; })[0] || Multiview.tiles[0];
        Multiview.openMenu(tile);
        return true;
      }
      if (is(event, 'back')) {
        if (Multiview.zoomed) { var zoomed = Multiview.zoomed; Multiview.zoomed = null; Multiview.arrange(); zoomed.node.focus(); return true; }
        Multiview.close();
        return true;
      }
      return true;
    },
    close: function () {
      Multiview.hideMenu();
      Multiview.tiles.forEach(function (tile) { tile.generation++; tile.engine.destroy(); });
      Multiview.tiles = [];
      Multiview.featured = null;
      Multiview.zoomed = null;
      if (Multiview.node) Multiview.node.remove();
      Multiview.node = null;
      Multiview.publish();
      keepScreenOn(false);
    }
  };
  handlers.push({ active: function () { return Boolean(Multiview.node); }, key: Multiview.key });

  // ── Démarrage ─────────────────────────────────────────────────────────
  session = read(STORE, null);
  if (ORSAY) {
    ORSAY.bridge({
      el: el, send: send, is: is, handlers: handlers, listKeys: listKeys, listScroll: listScroll, noctraFetch: noctraFetch,
      keepScreenOn: keepScreenOn, sniff: sniffStream, session: function () { return session; },
      BASE: BASE, JF: JF, SERVER_ORIGIN: SERVER_ORIGIN
    });
  }
  function start() {
    var channel = new MessageChannel();
    appPort = channel.port1;
    appPort.onmessage = function (event) {
      var message;
      try { message = JSON.parse(event.data); } catch (error) { return; }
      try { handle(message); } catch (error) { send({ type: 'nativeError', message: error.message }); }
    };
    // Session mémorisée encore valide ? Sinon, écran de connexion.
    var ready = session
      ? jellyfin('GET', '/Users/Me', undefined, session.token).then(function (user) {
        if (user && user.Name) session.userName = user.Name;
      }, function (error) {
        if (error.status === 401 || error.status === 403) { session = null; write(STORE, null); }
      })
      : Promise.resolve();
    ready.then(function () {
      // Samsung 2014 : liaison directe (ni MessageEvent ni vrai MessageChannel sur ce moteur).
      if (ORSAY && window.NoctraAttachHost) { window.NoctraAttachHost(channel.port2); return; }
      window.dispatchEvent(new MessageEvent('message', { data: 'noctra-host', ports: [channel.port2] }));
    });
  }
  // Samsung 2014 : l'interface est chargée après ce fichier ; l'hôte lance la liaison.
  if (ORSAY) window.NoctraHostStart = start;
  else document.addEventListener('DOMContentLoaded', start);
})();
