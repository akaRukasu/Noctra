/* Noctra TV : accueil Noctra de l'appli Android TV (servi par l'appli sous
   NOCTRA_URL/tv-app/, voir NoctraHomeActivity.java).
   JavaScript ES2017 sans dépendance : les WebView des téléviseurs et
   vidéoprojecteurs sont souvent anciennes. */
(function () {
  'use strict';

  // ── Outils ─────────────────────────────────────────────────────────
  var main = document.getElementById('main');
  var layer = document.getElementById('layer');
  var S = { token: '', userId: '', userName: '', noctra: '', jf: '', isAdmin: false, config: {}, ready: false, caps: {}, platform: 'androidtv' };

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === undefined || value === null || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }
  function add(node, child) {
    if (child === undefined || child === null || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { add(node, c); });
    else node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function year(value) { var m = String(value || '').match(/^(\d{4})/); return m ? m[1] : ''; }
  function absolute(url) { return new URL(url, S.noctra + '/').toString(); }
  // Origine du serveur Noctra : celle de la page sur Android TV (/tv-app/ du
  // serveur), différente quand l'interface est intégrée à l'appli LG ou Samsung.
  function serverOrigin() {
    try { return new URL(S.noctra + '/').origin; } catch (error) { return location.origin; }
  }
  function tmdb(path, size) { return path ? 'https://image.tmdb.org/t/p/' + (size || 'w342') + path : ''; }

  var icons = {
    home: '<path d="M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4z"/>',
    library: '<path d="M5 4h3v16H5zM10 4h3v16h-3zM15.2 4.8l2.9-.8 3.9 14.6-2.9.8z"/>',
    live: '<path d="M4 7h16v11H4zM9 3l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    discover: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.8 5.2-2.2 5.4-5.4 2.2 2.2-5.4z"/>',
    requests: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/>',
    roulette: '<path d="M12 3a9 9 0 1 0 9 9h-2.2A6.8 6.8 0 1 1 12 5.2V3zm0 5 5-4v8z"/>',
    search: '<path d="M10.5 4a6.5 6.5 0 0 1 5.2 10.4l4.4 4.4-1.4 1.4-4.4-4.4A6.5 6.5 0 1 1 10.5 4zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"/>',
    settings: '<path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/>',
    grid: '<path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/>',
    check: '<path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z"/>',
    heart: '<path d="M12 20.5 10.6 19.2C5.4 14.5 2 11.4 2 7.6 2 4.5 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1C13.1 2.8 14.8 2 16.5 2 19.6 2 22 4.5 22 7.6c0 3.8-3.4 6.9-8.6 11.6z"/>',
    audio: '<path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/>',
    subtitles: '<path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm2 7v2h4v-2zm6 0v2h6v-2zm-6-4v2h8V8zm10 0v2h2V8z"/>',
    restart: '<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/>',
    people: '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3.3 0-7 1.6-7 4v3h14v-3c0-2.4-3.7-4-7-4zm8 0c-.5 0-1 0-1.6.1 1.6 1 2.6 2.3 2.6 3.9v3h5v-3c0-2.4-3.2-4-6-4z"/>',
    close: '<path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/>',
    prev: '<path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z"/>',
    next: '<path d="M8.6 5.4 10 4l8 8-8 8-1.4-1.4 6.6-6.6z"/>',
    tag: '<path d="M3 3h8l10 10-8 8L3 11zm4.5 2.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    star: '<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    history: '<path d="M13 4a8 8 0 1 1-7.4 11h2.2A6 6 0 1 0 7 8.4L9.6 11H3V4.4l2.2 2.2A8 8 0 0 1 13 4zm-1 4h2v4.6l3.2 1.9-1 1.7L12 13.7z"/>',
    trophy: '<path d="M7 3h10v2h3v3a5 5 0 0 1-4.3 4.9A5 5 0 0 1 13 15.9V18h3v2H8v-2h3v-2.1a5 5 0 0 1-2.7-3A5 5 0 0 1 4 8V5h3zm0 4H6v1a3 3 0 0 0 1.4 2.5A5 5 0 0 1 7 9zm10 0v2c0 .5-.1 1-.2 1.5A3 3 0 0 0 18 8V7z"/>',
    antenna: '<path d="M3 8h18v12H3zm2 2v8h14v-8zM8 3l4 4 4-4 1.4 1.4L14.8 7h-5.6L6.6 4.4z"/>',
    info: '<path d="M11 10h2v7h-2zm0-3h2v2h-2zM12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/>',
    download: '<path d="M11 4h2v8.2l3.3-3.3 1.4 1.4-5.7 5.7-5.7-5.7 1.4-1.4 3.3 3.3zM5 18h14v2H5z"/>',
    guide: '<path d="M3 5h18v2H3zm0 6h4v2H3zm6 0h12v2H9zm-6 6h4v2H3zm6 0h12v2H9z"/>',
    globe: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm6.9 8h-3a14 14 0 0 0-1.2-5.3A7 7 0 0 1 18.9 11zM12 5.1c.9 1.2 1.7 3.3 1.9 5.9h-3.8c.2-2.6 1-4.7 1.9-5.9zM9.3 5.7A14 14 0 0 0 8.1 11h-3a7 7 0 0 1 4.2-5.3zM5.1 13h3a14 14 0 0 0 1.2 5.3A7 7 0 0 1 5.1 13zm6.9 5.9c-.9-1.2-1.7-3.3-1.9-5.9h3.8c-.2 2.6-1 4.7-1.9 5.9zm2.7-.6a14 14 0 0 0 1.2-5.3h3a7 7 0 0 1-4.2 5.3z"/>'
  };
  function icon(name) {
    return h('span', { html: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + icons[name] + '</svg>' }).firstChild;
  }

  var toastTimer = 0;
  function toast(message, bad) {
    var node = document.getElementById('toast');
    node.textContent = message;
    node.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.className = bad ? 'bad' : ''; }, bad ? 5200 : 3200);
  }

  // ── Accès serveur ──────────────────────────────────────────────────
  function request(url, options) {
    options = options || {};
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, options.timeout || 20000) : 0;
    return fetch(url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      credentials: 'same-origin',
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      clearTimeout(timer);
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
        if (!response.ok) {
          var error = new Error((data && (data.error || data.message)) || ('Erreur ' + response.status));
          error.status = response.status;
          throw error;
        }
        return data;
      });
    }, function (error) {
      clearTimeout(timer);
      throw new Error(error && error.name === 'AbortError' ? 'Le serveur ne répond pas.' : 'Serveur injoignable.');
    });
  }
  function api(path, options) {
    options = options || {};
    // Chemins /api/… relatifs au serveur Noctra, ou adresses complètes renvoyées par l'API.
    var url = path.indexOf('/api/') === 0 ? S.noctra + path : absolute(path);
    var headers = { 'x-noctra-token': S.token };
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      options.body = JSON.stringify(options.json);
    }
    options.headers = headers;
    return request(url, options);
  }
  function jf(path, params) {
    var url = S.jf + path.replace('{userId}', encodeURIComponent(S.userId));
    if (params) {
      var query = Object.keys(params).filter(function (key) { return params[key] !== undefined && params[key] !== ''; })
        .map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); }).join('&');
      if (query) url += (url.indexOf('?') < 0 ? '?' : '&') + query;
    }
    // Jellyfin 10.11+ refuse les anciens en-têtes (X-Emby-Token) : erreur 401.
    return request(url, { headers: { Authorization: 'MediaBrowser Client="Noctra TV", Device="Android TV", DeviceId="noctra-tv-' + S.userId + '", Version="1", Token="' + S.token + '"' } });
  }
  // Données mises en mémoire quelques instants : retour instantané sur une page.
  var memoStore = {};
  function memo(key, ttl, load) {
    var entry = memoStore[key];
    if (entry && Date.now() - entry.at < ttl) return entry.promise;
    var promise = load();
    memoStore[key] = { at: Date.now(), promise: promise };
    promise.catch(function () { if (memoStore[key] && memoStore[key].promise === promise) delete memoStore[key]; });
    return promise;
  }
  function forget(prefix) {
    Object.keys(memoStore).forEach(function (key) { if (key.indexOf(prefix) === 0) delete memoStore[key]; });
  }
  function jfImage(id, type, tag, height) {
    if (!id) return '';
    // Affichage allégé : images un peu plus petites (moins de mémoire et de décodage).
    var size = height || 420;
    if (LITE_UI) size = Math.round(size * 0.8);
    return S.jf + '/Items/' + id + '/Images/' + (type || 'Primary') + '?maxHeight=' + size + '&quality=' + (LITE_UI ? 80 : 85) + (tag ? '&tag=' + encodeURIComponent(tag) : '');
  }

  // ── Canal natif (NoctraHomeActivity) ───────────────────────────────
  var port = null;
  function native(action, data) {
    var message = { action: action };
    if (data) Object.keys(data).forEach(function (key) { message[key] = data[key]; });
    if (port) port.postMessage(JSON.stringify(message));
    return Boolean(port);
  }
  window.addEventListener('message', function (event) {
    // postWebMessage n'a pas de fenêtre d'origine ; un lecteur web (iframe) en a une.
    if (event.data !== 'noctra-host' || event.source !== null || !event.ports || !event.ports[0]) return;
    port = event.ports[0];
    port.onmessage = function (message) {
      var data;
      try { data = JSON.parse(message.data); } catch (error) { return; }
      if (data.type === 'session') startSession(data);
      else if (data.type === 'playerClosed') { if (data.vod) vodClosed(data); else playerClosed(data); }
      else if (data.type === 'resumed') appResumed(data);
      else if (data.type === 'speedTest') speedResults(data.results || []);
      else if (data.type === 'hidden') { if (data.hidden) sleepHome(Boolean(data.deep)); else wakeHome(); }
      else if (data.type === 'webPlayerClosed') webPlayerClosed(data);
      else if (data.type === 'remote') remoteCommand(data);
      else if (data.type === 'playerEvent') playerEvent(data);
      else if (data.type === 'nativeError') toast('Action impossible : ' + data.message, true);
    };
    native('hello');
  });

  // Hors de l'appli (essais dans un navigateur) : #token=…&user=…&jellyfin=…
  setTimeout(function () {
    // Pont web (webOS, Tizen) : la session arrive après l'écran de connexion.
    if (S.ready || port || document.documentElement.classList.contains('web-host')) return;
    var params = new URLSearchParams(location.hash.slice(1));
    if (!params.get('token')) {
      main.appendChild(h('div', { class: 'error', text: 'Session introuvable : ouvrez Noctra TV depuis le téléviseur.' }));
      return;
    }
    var base = location.pathname.replace(/\/tv-app\/.*$/, '');
    startSession({
      token: params.get('token'), userId: params.get('user') || '', userName: params.get('name') || '',
      noctraUrl: location.origin + base, jellyfinUrl: params.get('jellyfin') || location.origin + '/jellyfin', serverAddress: ''
    });
  }, 1500);

  function startSession(data) {
    var changed = S.ready && data.token !== S.token;
    S.token = data.token;
    S.userId = data.userId;
    S.userName = data.userName || '';
    S.noctra = String(data.noctraUrl || '').replace(/\/+$/, '');
    S.codecs = data.codecs || {};
    S.lowEnd = Boolean(data.lowEnd);
    // Version de l'appli (« 0.19.10-noctra.66 »), affichée dans le menu du compte.
    S.version = String(data.version || '');
    S.parallelLoading = data.parallelLoading !== false;
    applyDisplay();
    // Capacités de l'hôte : Android TV (lecteur Jellyfin, lecteur web séparé…)
    // ou pont web de LG webOS / Samsung Tizen (tv-native.js).
    S.caps = data.caps || {};
    // Moteur web du téléviseur (version de Chrome) : les lecteurs web récents en dépendent.
    S.engine = data.webEngine || null;
    S.platform = data.platform || 'androidtv';
    // Jellyfin sur la même origine que la page si possible (pas de CORS).
    var own = String(data.jellyfinUrl || '').replace(/\/+$/, '');
    var remote = String(data.serverAddress || '').replace(/\/+$/, '');
    S.jf = own.indexOf(location.origin) === 0 || !remote ? own : remote;
    if (S.ready && !changed) { renderNav(); return; }
    S.ready = true;
    cache = {};
    memoStore = {};
    // Cookie de session Noctra : nécessaire aux lecteurs web des chaînes (iframes).
    Promise.all([
      api('/api/session').then(function (session) {
        S.isAdmin = Boolean(session && session.isAdmin);
        if (session && session.user && !S.userName) { S.userName = session.user.name; renderNav(); }
      }),
      api('/api/config').then(function (config) { S.config = (config && config.configured) || {}; })
    ]).catch(function (error) {
      if (error.status === 401 || error.status === 403) toast('Session refusée par Noctra : reconnectez-vous depuis Compte › Paramètres.', true);
    });
    renderNav();
    // Canal temps réel Jellyfin : SyncPlay et « Lire sur Noctra TV ».
    reportCapabilities();
    connectSocket();
    go('home', {}, true, true);
    if (/recovered/.test(location.hash)) {
      toast('Le lecteur web a dû être fermé (mémoire du téléviseur saturée). Essayez un autre serveur.', true);
      try { history.replaceState(null, '', location.pathname); } catch (error) { /* adresse inchangée */ }
    }
  }

  // Retour depuis une fiche ou une lecture : reprises et « À suivre » à jour.
  function appResumed(data) {
    forget('resume'); forget('nextup'); forget('item:');
    // Retour du lecteur Jellyfin : génériques passés à la main appris, reprise gardée.
    var played = data && data.jellyfinPlayed;
    if (played && played.itemId) {
      (played.skips || []).forEach(function (skip) { learnIntro(skip.seriesId, skip.startMs, skip.endMs); });
      refreshAfterPlayback(ensureResume(played.itemId, played.positionMs, played.runtimeMs));
    }
    // Le lecteur Jellyfin ne s'est pas ouvert : lecture avec le lecteur Noctra.
    if (data && /^[0-9a-f]{32}$/i.test(String(data.jellyfinFailed || ''))) {
      toast('Le lecteur Jellyfin n’a pas démarré : lecture avec le lecteur Noctra.');
      playItem({ Id: data.jellyfinFailed }, typeof data.positionTicks === 'number' ? { startMs: Math.floor(data.positionTicks / 10000), noctraPlayer: true } : { noctraPlayer: true });
      return;
    }
    // Fiche aussi : position de reprise et « Vu » après le lecteur Jellyfin.
    if (current && (current.name === 'home' || current.name === 'item') && !layer.firstChild) {
      remember(current);
      show(false);
    }
  }

  // ── Horloge ────────────────────────────────────────────────────────
  function tick() {
    var now = new Date();
    document.getElementById('clock').textContent = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
  }
  tick();
  setInterval(tick, 15000);

  // ── Menu du haut ───────────────────────────────────────────────────
  var sections = [
    { name: 'home', label: 'Accueil', icon: 'home' },
    { name: 'libraries', label: 'Médiathèques', icon: 'library' },
    { name: 'live', label: 'TV en direct', icon: 'live' },
    { name: 'discover', label: 'Découvrir', icon: 'discover' },
    { name: 'requests', label: 'Demandes', icon: 'requests' },
    { name: 'roulette', label: 'Roulette', icon: 'roulette' },
    { name: 'search', label: 'Rechercher', icon: 'search', iconOnly: true }
  ];
  function renderNav() {
    var nav = document.getElementById('nav');
    clear(nav);
    sections.forEach(function (section) {
      nav.appendChild(h('button', { class: 'nav f' + (section.iconOnly ? ' icon-only' : ''), 'data-section': section.name, 'aria-label': section.label, onclick: function () { go(section.name, {}, true); } },
        icon(section.icon), section.iconOnly ? null : section.label));
    });
    var account = document.getElementById('user');
    clear(account);
    account.appendChild(h('button', { class: 'nav account f', 'aria-label': 'Compte', onclick: accountMenu },
      h('span', { class: 'avatar', text: (S.userName || '?').charAt(0).toUpperCase() }), S.userName || 'Compte'));
  }
  function accountMenu() {
    var list = h('div', { class: 'list scroll' },
      h('h2', null, S.userName || 'Compte', h('small', { text: 'Noctra TV' + (S.version ? ' · ' + S.version : '') })),
      h('button', { class: 'btn f', onclick: function () { closeLayer(); syncSheet(); } }, icon('people'), sync.group ? 'SyncPlay · ' + sync.group.name : 'SyncPlay · regarder ensemble'),
      S.caps.jellyfinPlayer !== false ? h('button', { class: 'btn f', onclick: function () {
        var next = vodPlayer() === 'noctra' ? 'jellyfin' : 'noctra';
        try { localStorage.setItem('noctra-tv-vod-player', next); } catch (error) { /* stockage indisponible */ }
        closeLayer();
        toast(next === 'noctra' ? 'Films et épisodes : lecteur Noctra (diagnostic de réception pendant une coupure).' : 'Films et épisodes : lecteur standard.');
      } }, icon('play'), 'Lecteur des films : ' + (vodPlayer() === 'noctra' ? 'Noctra' : 'standard')) : null,
      h('button', { class: 'btn f', onclick: function () {
        var next = VOD_QUALITIES[(VOD_QUALITIES.indexOf(vodQuality()) + 1) % VOD_QUALITIES.length];
        try { localStorage.setItem('noctra-tv-vod-quality', String(next)); } catch (error) { /* stockage indisponible */ }
        closeLayer();
        toast(next ? 'Films et épisodes (lecteur Noctra) : ' + next + ' Mb/s au plus, convertis par le serveur si besoin.' : 'Films et épisodes : qualité originale.');
      } }, icon('settings'), 'Qualité des films : ' + vodQualityLabel(vodQuality())),
      S.caps.jellyfinPlayer !== false && S.platform === 'androidtv' ? h('button', { class: 'btn f', onclick: function () {
        S.parallelLoading = !S.parallelLoading;
        native('parallelLoading', { on: S.parallelLoading });
        closeLayer();
        toast(S.parallelLoading ? 'Lecteur standard : film chargé sur 4 connexions à la fois.' : 'Lecteur standard : 1 connexion, exactement comme l’appli d’origine (pour comparer).');
      } }, icon('settings'), 'Lecteur standard : ' + (S.parallelLoading ? '4 connexions' : '1 connexion (d’origine)')) : null,
      S.caps.jellyfinPlayer !== false ? h('button', { class: 'btn f', onclick: function () { closeLayer(); speedTest(); } }, icon('live'), 'Tester la connexion') : null,
      document.documentElement.classList.contains('web-host') ? null : h('button', { class: 'btn f', onclick: function () {
        var order = ['auto', 'lite', 'full'];
        var next = order[(order.indexOf(displayMode()) + 1) % order.length];
        try { localStorage.setItem('noctra-tv-display', next); } catch (error) { /* stockage indisponible */ }
        applyDisplay();
        closeLayer();
        toast(next === 'auto' ? 'Affichage automatique : allégé sur les appareils modestes.' : next === 'lite' ? 'Affichage allégé : navigation plus fluide.' : 'Affichage complet : tous les effets.');
      } }, icon('settings'), 'Affichage : ' + (displayMode() === 'auto' ? 'automatique' + (S.lowEnd ? ' (allégé)' : '') : displayMode() === 'lite' ? 'allégé' : 'complet')),
      h('button', { class: 'btn f', onclick: function () { closeLayer(); native('openSettings') || toast('Disponible dans l’appli Noctra TV.'); } }, icon('settings'), 'Paramètres de l’appli'),
      h('p', { class: 'hint-text', text: 'Changer de compte ou se déconnecter : Paramètres › Authentification.' }),
      h('button', { class: 'btn f', text: 'Fermer', onclick: closeLayer }));
    openLayer(h('div', { class: 'modal' }, list));
  }
  // ── Test de connexion (Android TV) ─────────────────────────────────
  // Débit reçu par l'appareil lui-même depuis Internet et depuis le serveur
  // des films : dit si les coupures viennent du Wi-Fi de l'appareil ou du
  // chemin depuis le serveur.
  var speedSheet = null;
  function speedTest() {
    var note = h('p', { class: 'hint-text', text: 'Mesure en cours depuis cet appareil (environ 40 s)…' });
    speedSheet = h('div', { class: 'list scroll' }, h('h2', null, 'Test de connexion', h('small', { text: 'Débit reçu par cet appareil' })), note,
      h('button', { class: 'btn f', text: 'Fermer', onclick: closeLayer }));
    speedSheet._note = note;
    openLayer(h('div', { class: 'modal' }, speedSheet));
    jf('/Users/{userId}/Items', { IncludeItemTypes: 'Movie', Recursive: true, Limit: 1, SortBy: 'Random', Fields: 'MediaSources' }).then(function (data) {
      return (data && data.Items && data.Items[0]) || null;
    }, function () { return null; }).then(function (movie) {
      var targets = [{ label: 'Internet', url: 'https://speed.cloudflare.com/__down?bytes=50000000' }];
      var source = movie && (movie.MediaSources || [])[0];
      if (movie) {
        var address = S.jf + '/Videos/' + movie.Id + '/stream?static=true' + (source ? '&mediaSourceId=' + encodeURIComponent(source.Id) : '');
        targets.push({ label: 'Serveur des films (1 connexion)', url: address });
        // Même connexion unique, mais avec une plage d'octets (« Range ») : la
        // seedbox traite-t-elle autrement les demandes sans plage ?
        targets.push({ label: 'Serveur des films (1 connexion avec plage)', url: address, range: true });
        // Même fichier, 4 connexions à la fois : bridage par connexion ?
        targets.push({ label: 'Serveur des films (4 connexions)', url: address, parallel: 4, size: (source && source.Size) || 0 });
      }
      if (!native('speedTest', { targets: targets })) note.textContent = 'Disponible dans l’appli Noctra TV.';
    });
  }
  function speedResults(results) {
    if (!speedSheet || !document.body.contains(speedSheet)) return;
    var lines = results.map(function (result) {
      var value = result.error ? 'échec (' + result.error + ')' : (Math.round(result.mbps * 10) / 10).toString().replace('.', ',') + ' Mb/s'
        + ' (' + (Math.round((result.bytes || 0) / 104857.6) / 10).toString().replace('.', ',') + ' Mo en ' + Math.round(result.seconds || 0) + ' s)'
        + (result.ttfbMs >= 0 ? ' · réponse en ' + result.ttfbMs + ' ms' : '');
      return h('p', null, h('b', { text: result.label + ' : ' }), value);
    });
    var internet = results[0] && !results[0].error ? results[0].mbps : 0;
    var films = results[1] && !results[1].error ? results[1].mbps : 0;
    var ranged = results[2] && !results[2].error ? results[2].mbps : 0;
    var parallel = results[3] && !results[3].error ? results[3].mbps : 0;
    var verdict;
    // Une seule connexion tantôt rapide, tantôt bloquée : serveur irrégulier
    // (stockage distant ou disque chargé) ; plusieurs connexions passent.
    var single = Math.min(films || 0, ranged || 0), best = Math.max(films || 0, ranged || 0);
    if (internet >= 15 && results[2] && single < 5 && (best >= 15 || parallel >= 15)) verdict = 'Le serveur des films envoie de façon irrégulière : une même lecture est tantôt rapide (' + Math.round(Math.max(best, parallel)) + ' Mb/s), tantôt bloquée plusieurs secondes. C’est typique de films stockés à distance (Real-Debrid, Google Drive… montés sur la seedbox) ou d’un disque très chargé. Le lecteur Noctra (conversion par le serveur, 3 morceaux chargés d’avance, 1 min de réserve) absorbe ces blocages ; le lecteur standard, qui lit le fichier directement, coupe.';
    else if (internet >= 15 && films < 15 && parallel >= Math.max(8, films * 3)) verdict = 'Le serveur des films est bridé connexion par connexion : ' + Math.round(films * 10) / 10 + ' Mb/s avec une seule, ' + Math.round(parallel) + ' Mb/s avec quatre. Les lecteurs qui lisent le film d’un seul tenant coupent ; il faut lire en plusieurs morceaux (lecteur Noctra) ou lever ce bridage sur le serveur.';
    else if (internet && internet < 15) verdict = 'Cet appareil ne reçoit que ' + Math.round(internet) + ' Mb/s : son Wi-Fi est la cause des coupures (un film demande 5 à 25 Mb/s, une chaîne 3 à 8 Mb/s). Rapprochez la box ou le répéteur, préférez le Wi-Fi 5 GHz, ou un adaptateur Ethernet USB.';
    else if (internet && results[1] && films < 15) verdict = 'Internet arrive bien (' + Math.round(internet) + ' Mb/s), mais le serveur des films n’envoie que ' + Math.round(films) + ' Mb/s vers cet appareil : le ralentissement est du côté du serveur ou de sa route vers chez vous.';
    else if (internet) verdict = 'La connexion suffit (' + Math.round(internet) + ' Mb/s' + (films ? ', serveur ' + Math.round(films) + ' Mb/s' : '') + ') : les coupures ne viennent pas du débit de cet appareil.';
    else verdict = 'Mesure impossible : vérifiez la connexion de l’appareil.';
    speedSheet._note.textContent = verdict;
    lines.forEach(function (line) { speedSheet.insertBefore(line, speedSheet._note); });
  }
  function markNav(name) {
    Array.prototype.forEach.call(document.querySelectorAll('#nav .nav'), function (node) {
      node.classList.toggle('active', node.getAttribute('data-section') === name);
    });
  }

  // ── Navigation entre les vues ──────────────────────────────────────
  var views = {};
  var stack = [];
  var current = null;
  // Accueil caché par un lecteur (Android TV) : rien d'inutile pendant la vidéo.
  var appHidden = false;
  // Film ou épisode : la page est masquée pendant la lecture (plus rien à
  // dessiner ; le moteur web peut libérer les images décodées) et réaffichée
  // telle quelle au retour. Jamais vidée : rien à reconstruire, rien à perdre.
  function sleepHome(deep) {
    appHidden = true;
    if (deep) document.body.classList.add('asleep');
  }
  function wakeHome() {
    appHidden = false;
    document.body.classList.remove('asleep');
  }
  // Dernier appui de touche : pas de mise à jour de page pendant la navigation.
  var lastKeyAt = 0;
  document.addEventListener('keydown', function () { lastKeyAt = Date.now(); }, true);
  var cache = {};
  var renderToken = 0;

  // Chaque vue est redessinée à l'affichage ; au retour, l'élément choisi
  // auparavant est retrouvé par sa position dans la page.
  function go(name, params, reset, focusContent) {
    if (current) remember(current);
    if (reset) stack = [];
    else if (current) stack.push(current);
    current = { name: name, params: params || {}, focusIndex: -1 };
    show(reset && !focusContent);
  }
  function remember(view) {
    var nodes = Array.prototype.slice.call(main.querySelectorAll('.f'));
    view.focusIndex = nodes.indexOf(document.activeElement);
  }
  function show(focusMenu) {
    while (layer.lastElementChild) closeLayer(true);
    var view = current;
    var section = sections.some(function (s) { return s.name === view.name; }) ? view.name : (view.params.section || 'home');
    markNav(section);
    clear(main);
    main.classList.remove('with-multibar');
    main.scrollTop = 0;
    var token = ++renderToken;
    if (focusMenu) focus(document.querySelector('#nav .nav.active'));
    var done = views[view.name](view.params, function () { return token === renderToken; });
    Promise.resolve(done).then(function () {
      if (token !== renderToken || layer.firstChild) return;
      if (view.focusIndex >= 0) {
        var nodes = main.querySelectorAll('.f');
        if (nodes.length) focus(nodes[Math.min(view.focusIndex, nodes.length - 1)]);
        view.focusIndex = -1;
      } else if (!focusMenu && !main.contains(document.activeElement)) focusFirst();
    });
  }
  function back() {
    if (layer.firstChild) { closeLayer(); return true; }
    if (stack.length) {
      current = stack.pop();
      show(false);
      return true;
    }
    if (current && current.name !== 'home') { go('home', {}, true); return true; }
    if (!isMenu(document.activeElement)) { focus(document.querySelector('#nav .nav.active')); main.scrollTop = 0; return true; }
    return false;
  }
  window.NoctraTV = { back: function () { return back() ? 'handled' : 'exit'; } };

  function isMenu(node) { return Boolean(node && node.closest && node.closest('#top')); }
  function focusFirst() {
    var first = main.querySelector('[data-start]') || main.querySelector('.grid .f, .track .f, .draw .f') || main.querySelector('.f');
    if (first) focus(first);
    else focus(document.querySelector('#nav .nav.active'));
  }

  // ── Télécommande (navigation spatiale) ─────────────────────────────
  // Pensée pour les processeurs modestes des TV : voisins directs d'abord
  // (rangée, grille), recherche dans la page seulement aux bords ; une seule
  // mesure par élément ; au plus un déplacement par image affichée ; défilement
  // instantané quand une touche reste enfoncée.
  var repeating = false;
  function focus(node) {
    if (!node) return;
    try { node.focus({ preventScroll: true }); } catch (error) { node.focus(); }
    reveal(node);
  }
  // Défilement animé seulement pour un appui isolé : des animations qui se
  // chevauchent (appuis rapprochés, touche maintenue) font sauter l'affichage ;
  // pendant une rafale, chaque déplacement est immédiat.
  // LG webOS / Samsung Tizen (pont web) : affichage léger, défilement immédiat.
  var LITE_UI = document.documentElement.classList.contains('web-host');
  // Affichage allégé (classe « lite ») : LG / Samsung, appareils Android TV
  // modestes (2 Go de mémoire ou moins), ou choisi dans le menu du compte.
  // Mêmes animations de navigation, sans flou, dégradés plein écran ni
  // transitions de couleurs et d'ombres.
  function displayMode() {
    try { var mode = localStorage.getItem('noctra-tv-display'); return mode === 'lite' || mode === 'full' ? mode : 'auto'; } catch (error) { return 'auto'; }
  }
  function applyDisplay() {
    var mode = displayMode();
    var lite = document.documentElement.classList.contains('web-host') || mode === 'lite' || (mode === 'auto' && S.lowEnd);
    if (lite) document.documentElement.classList.add('lite'); else document.documentElement.classList.remove('lite');
    LITE_UI = lite;
  }
  function scrollTo(scroller, left, top) {
    var now = Date.now();
    // LG / Samsung : défilement doux pour un appui isolé aussi, mais jamais
    // pendant une rafale (touche maintenue).
    var smooth = !repeating && now - (scroller._movedAt || 0) > (LITE_UI ? 600 : 450);
    scroller._movedAt = now;
    var options = { behavior: smooth ? 'smooth' : 'auto' };
    if (left !== null) options.left = left;
    if (top !== null) options.top = top;
    try { scroller.scrollTo(options); } catch (error) {
      if (left !== null) scroller.scrollLeft = left;
      if (top !== null) scroller.scrollTop = top;
    }
  }
  function reveal(node) {
    var track = node.closest('.track');
    if (track) {
      var t = track.getBoundingClientRect(), r = node.getBoundingClientRect(), pad = t.width * 0.08;
      if (r.left < t.left + pad) scrollTo(track, track.scrollLeft - (t.left + pad - r.left), null);
      else if (r.right > t.right - pad) scrollTo(track, track.scrollLeft + r.right - (t.right - pad), null);
    }
    var scroller = node.closest('.scroll');
    if (!scroller || isMenu(node)) return;
    var box = node.closest('.row, .reveal-box') || node;
    var s = scroller.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (b.height > scroller.clientHeight * 0.7) { box = node; b = node.getBoundingClientRect(); }
    var top = scroller === main ? headerHeight() + 8 : s.top + 20;
    // Barre du multiview : les éléments choisis restent au-dessus d'elle.
    var bar = scroller === main && document.getElementById('multibar');
    var bottom = bar ? bar.getBoundingClientRect().top - 16 : s.bottom - 30;
    if (b.top < top) scrollTo(scroller, null, scroller.scrollTop - (top - b.top));
    else if (b.bottom > bottom) scrollTo(scroller, null, scroller.scrollTop + Math.min(b.bottom - bottom, b.top - top));
  }
  var headerCache = 0;
  function headerHeight() {
    if (!headerCache) headerCache = document.getElementById('top').offsetHeight;
    return headerCache;
  }
  window.addEventListener('resize', function () { headerCache = 0; });

  function scope() {
    var modal = layer.lastElementChild;
    return modal ? modal : document;
  }
  function visible(node) {
    var r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function focusable(node) {
    return node && node.classList && node.classList.contains('f') && !node.disabled;
  }
  // Meilleur candidat parmi une liste, selon la direction (distance principale
  // + écart latéral). Chaque élément n'est mesuré qu'une fois.
  function nearest(from, a, list, direction) {
    var horizontal = direction === 'left' || direction === 'right';
    var viewport = window.innerHeight;
    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var node = list[i];
      if (node === from || node.disabled) continue;
      var b = node.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (!horizontal && (b.bottom < -viewport * 1.5 || b.top > viewport * 2.5)) continue;
      var primary;
      if (direction === 'right') primary = b.left - a.right + 1;
      else if (direction === 'left') primary = a.left - b.right + 1;
      else if (direction === 'down') primary = b.top - a.bottom + 1;
      else primary = a.top - b.bottom + 1;
      if (primary < -Math.min(a.width, a.height) * 0.3) continue;
      var secondary;
      if (horizontal) {
        // Même rangée uniquement : chevauchement vertical requis.
        var overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlap < Math.min(a.height, b.height) * 0.35) continue;
        secondary = Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
      } else {
        secondary = Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2);
      }
      var score = Math.max(primary, 0) * (horizontal ? 1 : 2.2) + secondary * (horizontal ? 2 : 1);
      if (score < bestScore) { bestScore = score; best = node; }
    }
    return best;
  }
  // Grille : la case au-dessus ou au-dessous se calcule par le nombre de colonnes.
  function gridNeighbour(from, direction) {
    var grid = from.parentElement;
    if (!grid || !grid.classList.contains('grid') || (direction !== 'up' && direction !== 'down')) return null;
    var cells = grid.children;
    var index = Array.prototype.indexOf.call(cells, from);
    if (index < 0) return null;
    var firstTop = cells[0].offsetTop, columns = 0;
    while (columns < cells.length && cells[columns].offsetTop === firstTop) columns++;
    if (!columns) return null;
    var target = direction === 'down' ? index + columns : index - columns;
    if (target < 0) return null;
    if (target >= cells.length) {
      // Dernière rangée incomplète : dernière case, si elle est sur une rangée plus bas.
      var last = cells[cells.length - 1];
      return last.offsetTop > from.offsetTop && focusable(last) ? last : null;
    }
    return focusable(cells[target]) ? cells[target] : null;
  }
  function move(direction) {
    var from = document.activeElement;
    var root = scope();
    if (!from || from === document.body || !root.contains(from) || !from.classList.contains('f')) {
      var start = root === document ? (main.querySelector('.f') || document.querySelector('#nav .f')) : root.querySelector('.f');
      focus(start);
      return;
    }
    var horizontal = direction === 'left' || direction === 'right';
    var a = from.getBoundingClientRect();
    var fromRow = from.closest('.track');
    var best = gridNeighbour(from, direction);
    var grid = from.parentElement && from.parentElement.classList.contains('grid') ? from.parentElement : null;
    // Grille : case voisine dans la même rangée, sans mesurer toute la grille
    // (des centaines de chaînes : chaque mesure coûte sur un petit processeur).
    if (!best && horizontal && grid) {
      var side = direction === 'right' ? from.nextElementSibling : from.previousElementSibling;
      if (side && focusable(side) && side.offsetTop === from.offsetTop) best = side;
      else if (!side || side.offsetTop !== from.offsetTop) return;
    }
    // Rangée, groupe de boutons : on regarde d'abord les voisins immédiats.
    if (!best && horizontal && from.parentElement) best = nearest(from, a, from.parentElement.querySelectorAll('.f'), direction);
    // Dans la page, on reste dans la page : la barre d'onglets (fixe en haut de
    // l'écran) n'est atteinte qu'une fois arrivé tout en haut du contenu.
    var inPage = root === document && !isMenu(from) && main.contains(from);
    if (!best) {
      var candidates = (inPage ? main : root).querySelectorAll('.f');
      // Sortie d'une grille (▲ depuis la première rangée, ▼ depuis la dernière) :
      // ses cases ne sont pas mesurées.
      if (grid && !horizontal) candidates = Array.prototype.filter.call(candidates, function (node) { return node.parentElement !== grid; });
      best = nearest(from, a, candidates, direction);
    }
    if (!best && direction === 'up' && root === document && !isMenu(from)) best = document.querySelector('#nav .nav.active') || document.querySelector('#nav .f');
    if (!best) return;
    // Retour dans une rangée déjà parcourue : dernier élément choisi.
    var row = best.closest('.track');
    if (!horizontal && row && row !== fromRow && row._last && row.contains(row._last) && visible(row._last)) best = row._last;
    if (!horizontal && isMenu(best) && !isMenu(from)) best = document.querySelector('#nav .nav.active') || best;
    focus(best);
    if (row) row._last = best;
    if (typeof best._onReach === 'function') best._onReach();
  }

  var moveFrame = 0;
  var lastMove = 0;
  var pendingMove = '';
  function runMove(direction) {
    moveFrame = requestAnimationFrame(function () {
      moveFrame = 0;
      if (pendingMove) {
        var next = pendingMove;
        pendingMove = '';
        repeating = false;
        runMove(next);
      }
    });
    move(direction);
  }
  document.addEventListener('keydown', function (event) {
    var key = event.key;
    var code = event.keyCode;
    var target = event.target;
    var typing = target && target.tagName === 'INPUT';
    var direction = key === 'ArrowLeft' || code === 37 ? 'left' : key === 'ArrowRight' || code === 39 ? 'right'
      : key === 'ArrowUp' || code === 38 ? 'up' : key === 'ArrowDown' || code === 40 ? 'down' : '';
    if (direction) {
      if (typing && (direction === 'left' || direction === 'right')) {
        var atStart = target.selectionStart === 0 && target.selectionEnd === 0;
        var atEnd = target.selectionStart === target.value.length;
        if (!(direction === 'left' && atStart) && !(direction === 'right' && atEnd)) return;
      }
      event.preventDefault();
      // Touche maintenue : pas d'accumulation de déplacements en retard.
      // Un appui isolé n'est jamais perdu : il attend l'image suivante.
      var now = Date.now();
      if (event.repeat && (moveFrame || now - lastMove < 85)) return;
      if (moveFrame) { pendingMove = direction; return; }
      repeating = event.repeat;
      lastMove = now;
      runMove(direction);
      return;
    }
    if ((key === 'Enter' || code === 13 || code === 23) && target && target.classList && target.classList.contains('f')) {
      if (typing) {
        // Pas de preventDefault : la touche OK ouvre aussi le clavier de l'écran.
        if (typeof target._onSubmit === 'function') target._onSubmit();
        return;
      }
      if (event.repeat) { event.preventDefault(); return; }
      if (target.tagName !== 'BUTTON') { event.preventDefault(); target.click(); }
      return;
    }
    if (key === 'Escape' || key === 'GoBack' || key === 'BrowserBack' || code === 27) {
      if (back()) event.preventDefault();
    }
  });
  document.addEventListener('keyup', function () { repeating = false; });
  document.addEventListener('focusin', function (event) {
    var row = event.target.closest && event.target.closest('.track');
    if (row) row._last = event.target;
  });

  // ── Fenêtres ───────────────────────────────────────────────────────
  var layerReturn = [];
  function openLayer(node) {
    layerReturn.push(document.activeElement);
    layer.appendChild(node);
    var first = node.querySelector('.f[autofocus]:not([disabled])') || node.querySelector('.f:not([disabled])');
    if (first) focus(first);
  }
  function closeLayer(silent) {
    var node = layer.lastElementChild;
    if (!node) return;
    if (typeof node._onClose === 'function') node._onClose(silent);
    layer.removeChild(node);
    var previous = layerReturn.pop();
    if (previous && document.body.contains(previous)) focus(previous);
    else focusFirst();
  }

  // ── Éléments d'interface ───────────────────────────────────────────
  // src : une adresse, ou une liste d'adresses essayées dans l'ordre (logos).
  function image(src, alt) {
    var list = Array.isArray(src) ? src.filter(Boolean) : [src];
    var at = 0;
    var img = h('img', { alt: alt || '', loading: 'lazy', decoding: 'async' });
    // Adresse suivante ; « noctra-proxy:… » passe par le serveur Noctra.
    function load(url) {
      if (String(url).indexOf(PROXY_PREFIX) !== 0) { img.src = url; return; }
      proxyImage(url.slice(PROXY_PREFIX.length)).then(function (blob) { img.src = blob; }, function () { next(); });
    }
    function next() {
      if (++at < list.length) { load(list[at]); return; }
      img.style.visibility = 'hidden';
    }
    img.addEventListener('error', next);
    if (list.length) load(list[0]);
    // Monogramme du serveur Noctra (logo d'origine injoignable, 320 × 180) :
    // le logo suivant est essayé s'il y en a un.
    img.addEventListener('load', function (event) {
      if (at < list.length - 1 && img.naturalWidth === 320 && img.naturalHeight === 180 && /\/api\/tv\/image\//.test(img.src)) {
        event.stopImmediatePropagation();
        load(list[++at]);
      }
    });
    return img;
  }
  function card(options) {
    var picture = options.image ? image(options.image, options.title) : null;
    var art = h('div', { class: 'art' },
      h('div', { class: 'ph', text: options.title || '' }),
      picture,
      options.progress ? h('div', { class: 'progress' }, h('i', { style: 'width:' + Math.max(3, Math.min(100, options.progress)) + '%' })) : null);
    if (picture) picture.addEventListener('load', function () { art.classList.add('loaded'); });
    var node = h('button', { class: 'card f ' + (options.kind || ''), onclick: options.onSelect },
      options.badge ? h('span', { class: 'badge ' + (options.badgeClass || ''), text: options.badge }) : null,
      options.number ? h('span', { class: 'card-num', text: String(options.number) }) : null,
      art,
      options.noMeta ? null : h('div', { class: 'meta' },
        h('div', { class: 'title', text: options.title || '' }),
        options.sub ? h('div', { class: 'sub', text: options.sub }) : null));
    return node;
  }
  function row(title, cards, note) {
    if (!cards.length) return null;
    return h('section', { class: 'row' }, h('h2', null, title, note ? h('small', { text: note }) : null), h('div', { class: 'track' }, cards));
  }
  function head(title, text, extra) {
    return h('div', { class: 'page-head' }, h('h1', { text: title }), extra || null, text ? h('p', { text: text }) : null);
  }
  function loading(text) { return h('div', { class: 'loading', text: text || 'Chargement…' }); }
  function failure(error, retry) {
    return h('div', { class: 'error' }, (error && error.message) || String(error),
      retry ? h('div', { style: 'margin-top:.9rem' }, h('button', { class: 'btn f', text: 'Réessayer', onclick: retry })) : null);
  }
  function chip(label, on, action) {
    return h('button', { class: 'chip f' + (on ? ' on' : ''), text: label, onclick: action });
  }
  function searchField(placeholder, value, onSearch) {
    var input = h('input', { class: 'f', type: 'search', placeholder: placeholder, value: value || '', enterkeyhint: 'search', autocomplete: 'off' });
    var timer = 0;
    input._onSubmit = function () { clearTimeout(timer); onSearch(input.value.trim()); };
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { onSearch(input.value.trim()); }, 700);
    });
    return { node: h('label', { class: 'field' }, icon('search'), input), input: input };
  }

  // Ajout par petits paquets (une image affichée entre chaque) : la
  // télécommande reste réactive pendant qu'une page de 70 titres arrive.
  function appendChunked(container, items, make, done) {
    var index = 0;
    // Liste redessinée entre-temps (recherche, catégorie, mise à jour) : l'ancien
    // rendu s'arrête au lieu de mêler ses cartes aux nouvelles.
    var generation = container._generation;
    function chunk() {
      if (!document.body.contains(container) || container._generation !== generation) return;
      var fragment = document.createDocumentFragment();
      var end = Math.min(items.length, index + 18);
      for (; index < end; index++) fragment.appendChild(make(items[index], index));
      container.appendChild(fragment);
      if (index < items.length) requestAnimationFrame(chunk);
      else if (done) done();
    }
    chunk();
  }
  // Rendu progressif des longues grilles (chaînes, médiathèques).
  function lazyGrid(grid, items, make, batch) {
    var index = 0;
    grid._generation = (grid._generation || 0) + 1;
    function more() {
      var slice = items.slice(index, index + (batch || 60));
      index += slice.length;
      appendChunked(grid, slice, make, function () { armTail(grid, index < items.length ? more : null); });
    }
    more();
  }
  function armTail(grid, loadMore) {
    Array.prototype.forEach.call(grid.querySelectorAll('.f'), function (node) { node._onReach = null; });
    if (!loadMore) return;
    var nodes = grid.querySelectorAll('.f');
    var from = Math.max(0, nodes.length - 14);
    for (var i = from; i < nodes.length; i++) {
      nodes[i]._onReach = function () { armTail(grid, null); loadMore(); };
    }
  }

  // ── Fiches ─────────────────────────────────────────────────
  function itemTitle(item) {
    if (item.Type === 'Episode') return item.SeriesName || item.Name;
    return item.Name || 'Sans titre';
  }
  function itemSub(item) {
    if (item.Type === 'Episode') {
      var number = item.ParentIndexNumber !== undefined && item.IndexNumber !== undefined ? 'S' + item.ParentIndexNumber + ' · É' + item.IndexNumber + ' · ' : '';
      return number + (item.Name || '');
    }
    return [item.ProductionYear, item.Type === 'Series' ? 'Série' : item.Type === 'Movie' ? 'Film' : ''].filter(Boolean).join(' · ');
  }
  function wideImage(item) {
    if (item.ImageTags && item.ImageTags.Thumb) return jfImage(item.Id, 'Thumb', item.ImageTags.Thumb, 270);
    if (item.ParentThumbItemId) return jfImage(item.ParentThumbItemId, 'Thumb', item.ParentThumbImageTag, 270);
    if (item.BackdropImageTags && item.BackdropImageTags.length) return jfImage(item.Id, 'Backdrop', item.BackdropImageTags[0], 270);
    if (item.ParentBackdropItemId) return jfImage(item.ParentBackdropItemId, 'Backdrop', item.ParentBackdropImageTags && item.ParentBackdropImageTags[0], 270);
    return jfImage(item.Id, 'Primary', item.ImageTags && item.ImageTags.Primary, 270);
  }
  function posterImage(item) {
    if (item.Type === 'Episode' && item.SeriesId) return jfImage(item.SeriesId, 'Primary', item.SeriesPrimaryImageTag, 360);
    if (item.ImageTags && item.ImageTags.Primary) return jfImage(item.Id, 'Primary', item.ImageTags.Primary, 360);
    return '';
  }
  function itemCard(item, kind) {
    var wide = kind === 'wide';
    var progress = item.UserData && item.UserData.PlayedPercentage;
    return card({
      kind: wide ? 'wide' : '',
      title: itemTitle(item),
      sub: itemSub(item),
      image: wide ? wideImage(item) : posterImage(item),
      progress: progress,
      badge: item.UserData && item.UserData.Played ? 'VU' : (item.UserData && item.UserData.UnplayedItemCount ? String(item.UserData.UnplayedItemCount) : ''),
      onSelect: function () { openItem(item.Id); }
    });
  }

  // ── Fiches films et séries (comme sur PC, sans écran Jellyfin) ──────
  function openItem(id, extra) {
    var params = { section: current && current.params && current.params.section || (current && current.name) || 'home', id: id };
    if (extra) Object.keys(extra).forEach(function (key) { params[key] = extra[key]; });
    go('item', params);
  }
  function jfSend(method, path) {
    var url = S.jf + path.replace('{userId}', encodeURIComponent(S.userId));
    return request(url, { method: method, headers: { Authorization: jfAuthorization() } });
  }
  function jfJson(method, path, body) {
    var url = S.jf + path.replace('{userId}', encodeURIComponent(S.userId));
    return request(url, { method: method, headers: { Authorization: jfAuthorization(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function later(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  // ── Génériques (intro, récap, générique de fin) ────────────────────
  // Par ordre de préférence : segments du serveur Jellyfin (extension de
  // détection, ex. Intro Skipper), chapitres nommés du fichier, puis intro
  // apprise pour la série (générique passé à la main sur ce téléviseur).
  var INTRO_STORE = 'noctra-tv-intros';
  function learnedIntros() {
    try { var store = JSON.parse(localStorage.getItem(INTRO_STORE) || '{}'); return store && typeof store === 'object' ? store : {}; } catch (error) { return {}; }
  }
  function hexId(id) { return String(id || '').replace(/-/g, '').toLowerCase(); }
  function learnIntro(seriesId, startMs, endMs) {
    var key = hexId(seriesId);
    if (!/^[0-9a-f]{32}$/.test(key) || !(endMs - startMs >= 20000 && endMs - startMs <= 200000) || startMs > 10 * 60000) return;
    var store = learnedIntros();
    var old = store[key];
    // Même générique qu'avant (fin à moins de 30 s près) : moyenne ; sinon remplacé.
    if (old && Math.abs(old.endMs - endMs) < 30000) {
      var n = Math.min(old.n || 1, 4);
      store[key] = { startMs: Math.round((Math.min(old.startMs, startMs) * 2 + (old.startMs * n + startMs) / (n + 1)) / 3), endMs: Math.round((old.endMs * n + endMs) / (n + 1)), n: n + 1, at: Date.now() };
    } else store[key] = { startMs: Math.round(startMs), endMs: Math.round(endMs), n: 1, at: Date.now() };
    var keys = Object.keys(store);
    if (keys.length > 300) keys.sort(function (a, b) { return (store[a].at || 0) - (store[b].at || 0); }).slice(0, keys.length - 300).forEach(function (old) { delete store[old]; });
    try { localStorage.setItem(INTRO_STORE, JSON.stringify(store)); } catch (error) { /* stockage indisponible */ }
  }
  var SEGMENT_TYPES = { Intro: 'intro', Outro: 'outro', Recap: 'recap', Preview: 'preview' };
  function chapterSegments(item) {
    var chapters = (item.Chapters || []).filter(function (chapter) { return typeof chapter.StartPositionTicks === 'number'; })
      .sort(function (a, b) { return a.StartPositionTicks - b.StartPositionTicks; });
    var runtime = (item.RunTimeTicks || 0) / 10000;
    var out = [];
    chapters.forEach(function (chapter, index) {
      var name = String(chapter.Name || '').trim();
      var type = /(?:end ?credits|credits|crédits|ending|outro|générique de fin|generique de fin)/i.test(name) || /^ed\d*$/i.test(name) ? 'outro'
        : /(?:^intro|introduction|opening|générique|generique|ouverture)/i.test(name) || /^op\d*$/i.test(name) ? 'intro'
        : /(?:recap|récap|previously|précédemment)/i.test(name) ? 'recap'
        : /(?:preview|aperçu|prochainement|next time)/i.test(name) ? 'preview' : '';
      if (!type) return;
      var start = chapter.StartPositionTicks / 10000;
      var end = index + 1 < chapters.length ? chapters[index + 1].StartPositionTicks / 10000 : runtime;
      if (end - start >= 5000 && end - start <= 15 * 60000) out.push({ type: type, startMs: Math.round(start), endMs: Math.round(end), source: 'chapitres' });
    });
    return out;
  }
  function segmentsFor(item) {
    var fromServer = jf('/MediaSegments/' + item.Id).then(function (data) {
      return ((data && data.Items) || []).filter(function (segment) { return SEGMENT_TYPES[segment.Type] && segment.EndTicks > segment.StartTicks; })
        .map(function (segment) { return { type: SEGMENT_TYPES[segment.Type], startMs: Math.round(segment.StartTicks / 10000), endMs: Math.round(segment.EndTicks / 10000), source: 'jellyfin' }; });
    }, function () { return []; });
    var details = item.Chapters ? Promise.resolve(item) : jf('/Users/{userId}/Items/' + item.Id, { Fields: 'Chapters' }).catch(function () { return item; });
    var all = Promise.all([fromServer, details]).then(function (result) {
      if (result[0].length) return result[0];
      var chapters = chapterSegments(result[1]);
      if (chapters.length) return chapters;
      var learned = item.Type === 'Episode' && learnedIntros()[hexId(item.SeriesId)];
      return learned ? [{ type: 'intro', startMs: learned.startMs, endMs: learned.endMs, source: 'appris' }] : [];
    });
    // Jamais plus de 2,5 s d'attente avant la lecture.
    return Promise.race([all, later(2500).then(function () { return []; })]);
  }

  // ── Reprise ────────────────────────────────────────────────────────
  // Jellyfin efface la position d'un titre arrêté avant 5 % (réglage par
  // défaut du serveur) : il n'apparaît pas dans « Continuer à regarder ».
  // Après une minute de lecture, la position est remise par Noctra.
  function ensureResume(itemId, positionMs, runtimeMs) {
    if (!/^[0-9a-f]{32}$/i.test(hexId(itemId)) || !(positionMs >= 60000)) return Promise.resolve(false);
    if (runtimeMs > 0 && positionMs >= runtimeMs * 0.9) return Promise.resolve(false);
    // Le temps que Jellyfin traite l'arrêt de la lecture.
    return later(2500).then(function () { return jf('/Users/{userId}/Items/' + hexId(itemId)); }).then(function (item) {
      var data = (item && item.UserData) || {};
      if (data.Played || data.PlaybackPositionTicks > 0) return false;
      var runtime = item.RunTimeTicks ? item.RunTimeTicks / 10000 : runtimeMs;
      if (runtime && positionMs >= runtime * 0.9) return false;
      var body = { PlaybackPositionTicks: Math.round(positionMs) * 10000, LastPlayedDate: new Date().toISOString() };
      return jfJson('POST', '/UserItems/' + hexId(itemId) + '/UserData?userId=' + encodeURIComponent(S.userId), body)
        .catch(function () { return jfJson('POST', '/Users/{userId}/Items/' + hexId(itemId) + '/UserData', body); })
        .then(function () { return true; });
    }).catch(function () { return false; });
  }
  // Après une lecture : « Continuer à regarder » relu quand Jellyfin a fini
  // d'enregistrer (2,5 s puis 8 s), la page affichée est mise à jour si
  // l'utilisateur n'est pas en train de naviguer.
  var refreshTimers = [];
  function refreshAfterPlayback(extra) {
    refreshTimers.forEach(clearTimeout);
    refreshTimers = [2500, 8000].map(function (delay) {
      return setTimeout(function () {
        forget('resume'); forget('nextup'); forget('item:');
        if (!current || (current.name !== 'home' && current.name !== 'item') || layer.firstChild) return;
        if (Date.now() - lastKeyAt < 1500) return;
        remember(current);
        show(false);
      }, delay);
    });
    if (extra) extra.then(function (changed) { if (changed) refreshAfterPlayback(); });
  }
  function jfAuthorization() {
    return 'MediaBrowser Client="Noctra TV", Device="Android TV", DeviceId="' + deviceId() + '", Version="1", Token="' + S.token + '"';
  }
  function deviceId() { return 'noctra-tv-' + S.userId; }
  // Jellyfin récent (/UserPlayedItems) puis ancien chemin (/Users/…/PlayedItems).
  function toggleUserFlag(kind, id, on) {
    var method = on ? 'POST' : 'DELETE';
    var modern = kind === 'played' ? '/UserPlayedItems/' : '/UserFavoriteItems/';
    var legacy = kind === 'played' ? '/Users/{userId}/PlayedItems/' : '/Users/{userId}/FavoriteItems/';
    return jfSend(method, modern + id + '?userId=' + encodeURIComponent(S.userId)).catch(function () {
      return jfSend(method, legacy + id);
    });
  }
  function runtimeText(ticks) {
    var minutes = Math.round((ticks || 0) / 600000000);
    if (!minutes) return '';
    return minutes >= 60 ? Math.floor(minutes / 60) + ' h ' + ('0' + (minutes % 60)).slice(-2) : minutes + ' min';
  }
  function endsAt(ticks, positionTicks) {
    var remaining = ((ticks || 0) - (positionTicks || 0)) / 10000;
    if (remaining <= 0) return '';
    var end = new Date(Date.now() + remaining);
    return 'Fin vers ' + ('0' + end.getHours()).slice(-2) + ':' + ('0' + end.getMinutes()).slice(-2);
  }

  // Préférences de pistes : langue audio et sous-titres, réutilisées d'un épisode à l'autre.
  var trackPrefs = { audio: '', subtitles: '' };
  try { var savedTracks = JSON.parse(localStorage.getItem('noctra-tv-tracks') || 'null'); if (savedTracks) trackPrefs = savedTracks; } catch (error) { /* défaut */ }
  function saveTracks() { try { localStorage.setItem('noctra-tv-tracks', JSON.stringify(trackPrefs)); } catch (error) { /* stockage indisponible */ } }
  function streamsOf(item, type) {
    var source = (item.MediaSources || [])[0];
    return ((source && source.MediaStreams) || item.MediaStreams || []).filter(function (stream) { return stream.Type === type; });
  }
  function pickAudio(item) {
    var audio = streamsOf(item, 'Audio');
    var wanted = trackPrefs.audio && audio.filter(function (stream) { return stream.Language === trackPrefs.audio; })[0];
    return wanted || audio.filter(function (stream) { return stream.IsDefault; })[0] || audio[0] || null;
  }
  function pickSubtitle(item) {
    var subs = streamsOf(item, 'Subtitle');
    if (trackPrefs.subtitles === 'none') return null;
    // Sous-titres image (PGS, VobSub) : incrustés par le serveur, donc toute la
    // vidéo reconvertie (qualité moindre) ; texte préféré, image seulement si
    // la langue a été choisie et qu'il n'y a rien d'autre.
    var text = subs.filter(function (stream) { return stream.IsTextSubtitleStream; });
    if (trackPrefs.subtitles) {
      var chosen = function (stream) { return stream.Language === trackPrefs.subtitles; };
      return text.filter(chosen)[0] || subs.filter(chosen)[0] || null;
    }
    return text.filter(function (stream) { return stream.IsForced; })[0] || text.filter(function (stream) { return stream.IsDefault; })[0] || null;
  }
  function trackLabel(stream) {
    if (!stream) return 'Aucun';
    return stream.DisplayTitle || stream.Title || stream.Language || ('Piste ' + stream.Index);
  }

  // Lecture dans le lecteur de l'appli (ExoPlayer) : Jellyfin fournit un flux
  // HLS, en copiant ce que le téléviseur sait décoder et en convertissant le reste.
  var vodPlayback = null;
  function hlsUrl(item, source, playSessionId, audio, subtitle) {
    var codecs = S.codecs || {};
    var video = ['h264'].concat(codecs.hevc ? ['hevc'] : []);
    var audioCodecs = ['aac', 'mp3'].concat(codecs.ac3 ? ['ac3'] : [], codecs.eac3 ? ['eac3'] : []);
    var params = {
      MediaSourceId: source.Id, PlaySessionId: playSessionId, DeviceId: deviceId(),
      VideoCodec: video.join(','), AudioCodec: audioCodecs.join(','),
      AudioStreamIndex: audio ? audio.Index : '',
      SubtitleStreamIndex: subtitle ? subtitle.Index : '',
      SubtitleMethod: subtitle ? (subtitle.IsTextSubtitleStream ? 'Hls' : 'Encode') : '',
      MaxStreamingBitrate: vodQuality() ? vodQuality() * 1000000 : 80000000, TranscodingMaxAudioChannels: 6,
      // Qualité limitée : vidéo convertie par le serveur sous ce débit.
      // Sans débit demandé, une conversion part sur un débit bas (image floue).
      VideoBitrate: (vodQuality() ? vodQuality() * 1000000 : 80000000) - 400000,
      // Une seule qualité : pas de variantes réduites choisies par le lecteur.
      EnableAdaptiveBitrateStreaming: 'false', SegmentContainer: 'ts', MinSegments: 1,
      BreakOnNonKeyFrames: 'True', AllowVideoStreamCopy: 'true', AllowAudioStreamCopy: 'true', RequireAvc: 'false',
      'h264-profile': 'high,main,baseline,constrained baseline', 'h264-level': '51', 'hevc-profile': 'main,main10'
    };
    var query = Object.keys(params).filter(function (key) { return params[key] !== ''; })
      .map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); }).join('&');
    return S.jf + '/Videos/' + item.Id + '/master.m3u8?' + query;
  }
  // Fichier d'origine lu directement par le lecteur Noctra (Android TV) :
  // qualité d'origine, aucune préparation par le serveur (qui ne suit pas
  // toujours), morceaux lus 4 à la fois. Seulement si l'appareil décode la
  // vidéo et qu'aucune qualité réduite n'est choisie ; sinon (ou si la lecture
  // directe échoue) flux HLS préparé par le serveur.
  var DIRECT_CONTAINERS = ['mkv', 'webm', 'mp4', 'm4v', 'mov', 'ts', 'mpegts'];
  function directUrl(item, source, playSessionId, subtitle) {
    if (vodQuality() || S.platform !== 'androidtv') return '';
    var containers = String(source.Container || '').toLowerCase().split(',');
    if (!containers.some(function (name) { return DIRECT_CONTAINERS.indexOf(name.trim()) >= 0; })) return '';
    var video = streamsOf(item, 'Video')[0];
    var codec = String(video && video.Codec || '').toLowerCase();
    var codecs = S.codecs || {};
    if (!(codec === 'h264' || (codec === 'hevc' && codecs.hevc) || (codec === 'vp9' && codecs.vp9))) return '';
    // Sous-titres dans un fichier à part : seul le serveur les ajoute.
    if (subtitle && subtitle.IsExternal) return '';
    return S.jf + '/Videos/' + item.Id + '/stream?static=true&MediaSourceId=' + encodeURIComponent(source.Id)
      + '&DeviceId=' + encodeURIComponent(deviceId()) + '&PlaySessionId=' + encodeURIComponent(playSessionId);
  }
  // Lecteur des films et épisodes (Android TV) : Noctra par défaut (segments
  // chargés plusieurs à la fois, diagnostic pendant une coupure), ou le lecteur
  // standard (Jellyfin), qui lit d'un seul tenant sur une seule connexion.
  function vodPlayer() {
    try { return localStorage.getItem('noctra-tv-vod-player') === 'jellyfin' ? 'jellyfin' : 'noctra'; } catch (error) { return 'noctra'; }
  }
  // Qualité des films (lecteur Noctra) : originale, ou débit maximal en Mb/s
  // (conversion par le serveur) quand la réception ne suit pas le film.
  var VOD_QUALITIES = [0, 20, 12, 8, 4];
  function vodQuality() {
    try {
      var value = Number(localStorage.getItem('noctra-tv-vod-quality')) || 0;
      return VOD_QUALITIES.indexOf(value) >= 0 ? value : 0;
    } catch (error) { return 0; }
  }
  function vodQualityLabel(value) { return value ? value + ' Mb/s' : 'originale'; }
  function jellyfinPlayerUsed() { return S.caps.jellyfinPlayer !== false && vodPlayer() !== 'noctra'; }
  function playItem(item, options) {
    options = options || {};
    // En groupe SyncPlay : la lecture est lancée pour tout le groupe.
    if (sync.group && !options.sync) {
      var ticks = typeof options.startMs === 'number' ? options.startMs * 10000 : options.fromStart ? 0 : (item.UserData && item.UserData.PlaybackPositionTicks || 0);
      return syncPost('SetNewQueue', { PlayingQueue: [item.Id], PlayingItemPosition: 0, StartPositionTicks: ticks })
        .then(function () { toast('SyncPlay : lecture lancée pour le groupe.'); }, function (error) { toast(error.message, true); });
    }
    // Hors groupe : lecteur Jellyfin (langue audio, sous-titres, qualité…
    // modifiables pendant la lecture) ; à sa fermeture, retour ici.
    if (!options.sync && !options.noctraPlayer && jellyfinPlayerUsed()) {
      // Le lecteur standard n'affiche ni diagnostic ni réglage de qualité Noctra.
      if (!S.standardPlayerHint) {
        S.standardPlayerHint = true;
        toast('Lecteur standard : pas de diagnostic. Menu du compte › Lecteur des films : Noctra.');
      }
      var positionTicks = typeof options.startMs === 'number' ? Math.max(0, Math.round(options.startMs * 10000)) : options.fromStart ? 0 : null;
      // Génériques connus de Noctra (chapitres, intro apprise) : bouton « Passer »
      // du lecteur Jellyfin même sans détection sur le serveur.
      return segmentsFor(item).then(function (segments) {
        var series = hexId(item.Type === 'Series' ? item.Id : item.SeriesId);
        var intros = {};
        if (series && learnedIntros()[series]) intros[series] = learnedIntros()[series];
        if (native('jellyfinPlay', { itemId: item.Id, positionTicks: positionTicks, segments: segments, seriesIntros: intros })) return;
        var fallback = {};
        Object.keys(options).forEach(function (key) { fallback[key] = options[key]; });
        fallback.noctraPlayer = true;
        return playItem(item, fallback);
      });
    }
    var load = item.MediaSources ? Promise.resolve(item) : jf('/Users/{userId}/Items/' + item.Id);
    return load.then(function (full) {
      return segmentsFor(full).then(function (segments) { return { full: full, segments: segments }; });
    }).then(function (loaded) {
      var full = loaded.full;
      var source = (full.MediaSources || [])[0];
      if (!source) { toast('Aucune vidéo disponible pour ce titre.', true); return; }
      var playSessionId = (Date.now().toString(16) + Math.random().toString(16).slice(2)).slice(0, 32);
      var resumeTicks = full.UserData && full.UserData.PlaybackPositionTicks || 0;
      var startMs = typeof options.startMs === 'number' ? options.startMs : options.fromStart ? 0 : Math.floor(resumeTicks / 10000);
      var url = hlsUrl(full, source, playSessionId, pickAudio(full), pickSubtitle(full));
      vodPlayback = { item: full, playSessionId: playSessionId, sync: Boolean(options.sync) };
      var sent = native('play', {
        sync: Boolean(options.sync),
        url: url, mime: 'application/x-mpegURL', title: itemTitle(full), subtitle: full.Type === 'Episode' ? itemSub(full) : String(full.ProductionYear || ''),
        vod: true, jellyfin: S.jf, itemId: full.Id, mediaSourceId: source.Id, playSessionId: playSessionId, deviceId: deviceId(), startMs: startMs,
        // Débit du film, montré dans le diagnostic (limité si une qualité est choisie).
        bitrate: vodQuality() ? Math.min(source.Bitrate || 0, vodQuality() * 1000000) : (source.Bitrate || 0),
        directUrl: directUrl(full, source, playSessionId, pickSubtitle(full)),
        audioLanguage: (pickAudio(full) || {}).Language || '',
        textLanguage: pickSubtitle(full) ? (pickSubtitle(full).Language || 'und') : '',
        // Vidéo du fichier (« hevc 1920 800 ») : le lecteur dit si l'image reçue est d'origine ou convertie.
        sourceVideo: (function (video) { return video && video.Codec && video.Width ? video.Codec + ' ' + video.Width + ' ' + (video.Height || 0) : ''; })(streamsOf(full, 'Video')[0]),
        // Génériques : bouton « Passer » ; épisode : générique passé à la main appris pour la série.
        segments: loaded.segments, seriesId: full.Type === 'Episode' ? hexId(full.SeriesId) : '', episode: full.Type === 'Episode',
        // Pistes proposées dans le lecteur (pont web : changement pendant la lecture).
        tracks: {
          audio: streamsOf(full, 'Audio').map(function (stream) { return { index: stream.Index, label: trackLabel(stream), language: stream.Language || '' }; }),
          subtitles: streamsOf(full, 'Subtitle').map(function (stream) { return { index: stream.Index, label: trackLabel(stream), language: stream.Language || '', text: Boolean(stream.IsTextSubtitleStream) }; }),
          audioIndex: (pickAudio(full) || {}).Index, subtitleIndex: pickSubtitle(full) ? pickSubtitle(full).Index : -1
        }
      });
      if (!sent) toast('La lecture est disponible dans l’appli Noctra TV.', true);
    }, function (error) { toast(error.message, true); });
  }
  // « Lire sur… » depuis un téléphone ou un PC : lecteur Noctra ou fiche.
  function remoteCommand(data) {
    if (!/^[0-9a-f]{32}$/i.test(String(data.itemId || ''))) return;
    if (data.action === 'show') { openItem(data.itemId); return; }
    toast('Lecture demandée depuis un autre appareil…');
    playItem({ Id: data.itemId }, data.startMs >= 0 ? { startMs: data.startMs } : {});
  }
  function vodClosed(result) {
    var entry = vodPlayback;
    // Lecteur remplacé (nouveau titre du groupe) : ancienne fermeture ignorée.
    if (entry && result.playSessionId && entry.playSessionId !== result.playSessionId) return;
    vodPlayback = null;
    if (entry && entry.sync && sync.group) {
      forget('resume'); forget('nextup'); forget('item:');
      // Quitter le lecteur quitte le groupe : les autres ne l'attendent pas.
      if (!entry.stoppedByGroup && !result.ended) syncPost('Leave').then(function () { leaveLocalGroup('SyncPlay : vous avez quitté le groupe.'); }, function () { /* déjà sorti */ });
      return;
    }
    forget('resume'); forget('nextup'); forget('item:');
    if (!result.ok && result.error) toast(result.error, true);
    if (entry && result.ended && entry.item.Type === 'Episode') { nextEpisode(entry.item); return; }
    if (current && (current.name === 'item' || current.name === 'home') && !layer.firstChild) { remember(current); show(false); }
    // Reprise gardée même sous le seuil de Jellyfin, puis pages relues.
    refreshAfterPlayback(entry && !result.ended && result.played !== false ? ensureResume(entry.item.Id, result.positionMs, (entry.item.RunTimeTicks || 0) / 10000) : null);
  }
  // Fin d'épisode : le suivant est proposé, lancé seul après 10 s.
  function nextEpisode(episode) {
    jf('/Shows/' + episode.SeriesId + '/Episodes', { UserId: S.userId, StartItemId: episode.Id, Limit: 2, Fields: 'Overview' }).then(function (data) {
      var next = (data.Items || [])[1];
      if (!next) { if (current && current.name === 'item') { remember(current); show(false); } return; }
      var note = h('div', { class: 'picker-status', 'data-countdown': '1' });
      var left = 10;
      var timer = setInterval(function () {
        left--;
        if (left <= 0) { clearInterval(timer); if (document.body.contains(sheet)) { closeLayer(); playItem(next); } return; }
        note.textContent = 'Lecture automatique dans ' + left + ' s…';
      }, 1000);
      note.textContent = 'Lecture automatique dans 10 s…';
      var sheet = h('div', { class: 'list' },
        h('h2', null, 'Épisode suivant', h('small', { text: itemTitle(next) + ' · ' + itemSub(next) })),
        note,
        h('button', { class: 'btn primary f', autofocus: true, onclick: function () { clearInterval(timer); closeLayer(); playItem(next); } }, icon('play'), 'Lire maintenant'),
        h('button', { class: 'btn f', text: 'Plus tard', onclick: function () { clearInterval(timer); closeLayer(); } }));
      var modal = h('div', { class: 'modal' }, sheet);
      modal._onClose = function () { clearInterval(timer); };
      openLayer(modal);
    });
  }

  function trackChooser(title, streams, selected, onPick, allowNone) {
    var list = h('div', { class: 'list scroll' }, h('h2', { text: title }));
    if (allowNone) list.appendChild(h('button', { class: 'btn f' + (!selected ? ' primary' : ''), text: 'Aucun', onclick: function () { closeLayer(); onPick(null); } }));
    streams.forEach(function (stream) {
      list.appendChild(h('button', { class: 'btn f' + (selected && selected.Index === stream.Index ? ' primary' : ''), text: trackLabel(stream), onclick: function () { closeLayer(); onPick(stream); } }));
    });
    list.appendChild(h('button', { class: 'btn f', text: 'Fermer', onclick: closeLayer }));
    openLayer(h('div', { class: 'modal' }, list));
  }

  views.item = function (params, alive) {
    var status = loading();
    main.appendChild(status);
    return memo('item:' + params.id, 60000, function () { return jf('/Users/{userId}/Items/' + params.id); }).then(function (item) {
      if (!alive()) return;
      status.remove();
      if (item.Type === 'Series') return seriesPage(item, params, alive);
      if (item.Type === 'BoxSet' || item.Type === 'Season' || item.Type === 'Folder' || item.Type === 'CollectionFolder') return collectionPage(item, alive);
      if (item.Type === 'Person') { go('person', { section: params.section, person: item }); return; }
      return titlePage(item, alive);
    }, function (error) {
      if (!alive()) return;
      status.replaceWith(failure(error, function () { show(false); }));
    });
  };

  function detailHeader(item, actions, extra) {
    var seriesId = item.Type === 'Episode' ? item.SeriesId : null;
    var backdrop = image(backdropUrl(item.Type === 'Episode' ? { Id: seriesId, BackdropImageTags: item.ParentBackdropImageTags || [] , ParentBackdropItemId: item.ParentBackdropItemId } : item, 1280), '');
    backdrop.className = 'detail-backdrop';
    var poster = image(item.Type === 'Episode' ? jfImage(item.Id, 'Primary', item.ImageTags && item.ImageTags.Primary, 360) : posterImage(item) || jfImage(item.Id, 'Primary', '', 480), '');
    var user = item.UserData || {};
    var facts = [
      item.Type === 'Episode' ? itemSub(item) : '',
      item.ProductionYear ? String(item.ProductionYear) : '',
      item.Type === 'Series' ? (item.ChildCount ? item.ChildCount + ' saison' + (item.ChildCount > 1 ? 's' : '') : '') : runtimeText(item.RunTimeTicks),
      item.CommunityRating ? '★ ' + Number(item.CommunityRating).toFixed(1) : '',
      item.OfficialRating || '',
      item.RunTimeTicks && item.Type !== 'Series' ? endsAt(item.RunTimeTicks, user.PlaybackPositionTicks) : ''
    ].filter(Boolean);
    return h('section', { class: 'detail reveal-box' },
      backdrop, h('div', { class: 'detail-shade' }),
      h('div', { class: 'detail-body' },
        h('div', { class: 'detail-poster' + (item.Type === 'Episode' ? ' wide' : '') }, poster),
        h('div', { class: 'detail-info' },
          item.Type === 'Episode' ? h('p', { class: 'eyebrow', text: item.SeriesName || '' }) : h('p', { class: 'eyebrow', text: item.Type === 'Series' ? 'SÉRIE' : 'FILM' }),
          h('h1', { text: item.Name || 'Sans titre' }),
          h('div', { class: 'facts' }, facts.map(function (fact) { return h('span', { text: fact }); })),
          item.Genres && item.Genres.length ? h('div', { class: 'genres' }, item.Genres.slice(0, 5).map(function (genre) { return h('span', { text: genre }); })) : null,
          item.Taglines && item.Taglines[0] ? h('p', { class: 'tagline', text: item.Taglines[0] }) : null,
          item.Overview ? h('p', { class: 'overview', text: item.Overview }) : null,
          h('div', { class: 'actions' }, actions),
          extra || null)));
  }
  function flagButtons(item, refresh) {
    var user = item.UserData || {};
    var played = h('button', { class: 'btn f' + (user.Played ? ' on' : ''), onclick: function () {
      toggleUserFlag('played', item.Id, !user.Played).then(function () {
        user.Played = !user.Played;
        played.classList.toggle('on', user.Played);
        played.lastChild.textContent = user.Played ? 'Vu' : 'Marquer vu';
        forget('item:'); forget('resume'); forget('nextup');
        if (refresh) refresh();
      }, function (error) { toast(error.message, true); });
    } }, icon('check'), user.Played ? 'Vu' : 'Marquer vu');
    var favorite = h('button', { class: 'btn f' + (user.IsFavorite ? ' on' : ''), onclick: function () {
      toggleUserFlag('favorite', item.Id, !user.IsFavorite).then(function () {
        user.IsFavorite = !user.IsFavorite;
        favorite.classList.toggle('on', user.IsFavorite);
        favorite.lastChild.textContent = user.IsFavorite ? 'Favori' : 'Ajouter aux favoris';
        forget('item:');
      }, function (error) { toast(error.message, true); });
    } }, icon('heart'), user.IsFavorite ? 'Favori' : 'Ajouter aux favoris');
    return [played, favorite];
  }
  function trackButtons(item) {
    var audios = streamsOf(item, 'Audio');
    var subs = streamsOf(item, 'Subtitle');
    var buttons = [];
    if (audios.length > 1) {
      var audioButton = h('button', { class: 'btn f', onclick: function () {
        trackChooser('Langue audio', audios, pickAudio(item), function (stream) {
          trackPrefs.audio = stream && stream.Language || '';
          saveTracks();
          audioButton.lastChild.textContent = 'Audio : ' + trackLabel(pickAudio(item));
        }, false);
      } }, icon('audio'), 'Audio : ' + trackLabel(pickAudio(item)));
      buttons.push(audioButton);
    }
    if (subs.length) {
      var subButton = h('button', { class: 'btn f', onclick: function () {
        trackChooser('Sous-titres', subs, pickSubtitle(item), function (stream) {
          trackPrefs.subtitles = stream ? (stream.Language || '') : 'none';
          saveTracks();
          subButton.lastChild.textContent = 'Sous-titres : ' + trackLabel(pickSubtitle(item));
        }, true);
      } }, icon('subtitles'), 'Sous-titres : ' + trackLabel(pickSubtitle(item)));
      buttons.push(subButton);
    }
    return buttons;
  }
  function playButtons(item) {
    var user = item.UserData || {};
    var resume = user.PlaybackPositionTicks > 0 && !user.Played;
    var left = resume ? runtimeText((item.RunTimeTicks || 0) - user.PlaybackPositionTicks) : '';
    var buttons = [h('button', { class: 'btn primary f', 'data-start': true, onclick: function () { playItem(item); } }, icon('play'), resume ? 'Reprendre' + (left ? ' · ' + left + ' restantes' : '') : 'Lecture')];
    if (resume) buttons.push(h('button', { class: 'btn f', onclick: function () { playItem(item, { fromStart: true }); } }, icon('restart'), 'Depuis le début'));
    return buttons;
  }
  function peopleRow(item) {
    var people = (item.People || []).filter(function (person) { return person.Type === 'Actor' || person.Type === 'Director'; }).slice(0, 20);
    return row('Casting', people.map(function (person) {
      var node = card({ kind: 'person', title: person.Name, sub: person.Role || (person.Type === 'Director' ? 'Réalisation' : ''),
        image: person.PrimaryImageTag ? jfImage(person.Id, 'Primary', person.PrimaryImageTag, 240) : '',
        onSelect: function () { go('person', { section: current.params.section, person: person }); } });
      return node;
    }));
  }
  function similarRow(item, alive, container) {
    jf('/Items/' + item.Id + '/Similar', { UserId: S.userId, Limit: 16, Fields: 'PrimaryImageAspectRatio,ProductionYear' }).then(function (data) {
      if (!alive()) return;
      add(container, row('Titres similaires', (data.Items || []).map(function (similar) { return itemCard(similar); })));
    }, function () { /* facultatif */ });
  }

  function titlePage(item, alive) {
    // Pistes audio et sous-titres : choisies dans le lecteur Jellyfin
    // (trackButtons ne sert qu'hors de l'appli, avec le lecteur Noctra).
    var actions = playButtons(item).concat(port && jellyfinPlayerUsed() ? [] : trackButtons(item), flagButtons(item));
    if (item.Type === 'Episode' && item.SeriesId) actions.push(h('button', { class: 'btn f', onclick: function () { openItem(item.SeriesId); } }, icon('library'), 'Voir la série'));
    main.appendChild(detailHeader(item, actions));
    add(main, peopleRow(item));
    var more = h('div');
    main.appendChild(more);
    similarRow(item.Type === 'Episode' ? { Id: item.SeriesId } : item, alive, more);
  }

  function seriesPage(series, params, alive) {
    var playButton = h('button', { class: 'btn primary f', 'data-start': true, onclick: function () {
      if (nextUp) playItem(nextUp); else toast('Chargement des épisodes…');
    } }, icon('play'), 'Lecture');
    var nextUp = null;
    var actions = [playButton].concat(flagButtons(series));
    main.appendChild(detailHeader(series, actions));
    var seasonsBox = h('section', { class: 'row' }, h('h2', { text: 'Saisons' }));
    var seasonChips = h('div', { class: 'chips' });
    var episodes = h('div', { class: 'track episodes' });
    seasonsBox.appendChild(seasonChips);
    seasonsBox.appendChild(episodes);
    main.appendChild(seasonsBox);
    add(main, peopleRow(series));
    var more = h('div');
    main.appendChild(more);
    similarRow(series, alive, more);

    function showSeason(season, focusFirstEpisode) {
      Array.prototype.forEach.call(seasonChips.children, function (chipNode) { chipNode.classList.toggle('on', chipNode._season === season); });
      clear(episodes);
      episodes.appendChild(loading());
      jf('/Shows/' + series.Id + '/Episodes', { UserId: S.userId, SeasonId: season.Id, Fields: 'Overview,PrimaryImageAspectRatio' }).then(function (data) {
        if (!alive()) return;
        clear(episodes);
        var target = null;
        (data.Items || []).forEach(function (episode) {
          var user = episode.UserData || {};
          var node = card({
            kind: 'wide episode', title: 'É' + (episode.IndexNumber || '?') + ' · ' + (episode.Name || ''),
            sub: [runtimeText(episode.RunTimeTicks), user.Played ? 'Vu' : ''].filter(Boolean).join(' · '),
            image: jfImage(episode.Id, 'Primary', episode.ImageTags && episode.ImageTags.Primary, 270),
            progress: user.PlayedPercentage, badge: user.Played ? '✓' : '',
            onSelect: function () { playItem(episode); }
          });
          if (nextUp && nextUp.Id === episode.Id) target = node;
          episodes.appendChild(node);
        });
        if (focusFirstEpisode) focus(target || episodes.querySelector('.f'));
        else if (target) episodes._last = target;
      });
    }
    return Promise.all([
      jf('/Shows/' + series.Id + '/Seasons', { UserId: S.userId, Fields: 'PrimaryImageAspectRatio' }),
      jf('/Shows/NextUp', { UserId: S.userId, SeriesId: series.Id, Limit: 1, Fields: 'MediaSources' }).catch(function () { return { Items: [] }; })
    ]).then(function (result) {
      if (!alive()) return;
      var seasons = result[0].Items || [];
      nextUp = (result[1].Items || [])[0] || null;
      if (nextUp) {
        playButton.lastChild.textContent = 'Lecture · S' + (nextUp.ParentIndexNumber || 1) + ':É' + (nextUp.IndexNumber || 1);
      }
      seasons.forEach(function (season) {
        var node = chip(season.Name || ('Saison ' + season.IndexNumber), false, function () { showSeason(season, true); });
        node._season = season;
        seasonChips.appendChild(node);
      });
      var initial = nextUp && seasons.filter(function (season) { return season.Id === nextUp.SeasonId; })[0] || seasons[0];
      if (!nextUp && seasons[0]) {
        // Aucune reprise : premier épisode de la première saison.
        jf('/Shows/' + series.Id + '/Episodes', { UserId: S.userId, SeasonId: seasons[0].Id, Limit: 1 }).then(function (data) { nextUp = (data.Items || [])[0] || null; });
      }
      if (initial) showSeason(initial, false);
      else seasonsBox.remove();
    });
  }

  function collectionPage(item, alive) {
    main.appendChild(head(item.Name || 'Collection', item.Overview || ''));
    var grid = h('div', { class: 'grid posters' });
    main.appendChild(grid);
    return jf('/Users/{userId}/Items', { ParentId: item.Id, Fields: 'PrimaryImageAspectRatio,ProductionYear', SortBy: 'ProductionYear,SortName' }).then(function (data) {
      if (!alive()) return;
      appendChunked(grid, data.Items || [], function (child) { return itemCard(child); });
    });
  }

  views.person = function (params, alive) {
    var person = params.person;
    main.appendChild(head(person.Name, 'Films et séries de vos médiathèques'));
    var grid = h('div', { class: 'grid posters' });
    main.appendChild(grid);
    return jf('/Users/{userId}/Items', { PersonIds: person.Id, Recursive: 'true', IncludeItemTypes: 'Movie,Series', Fields: 'PrimaryImageAspectRatio,ProductionYear', SortBy: 'ProductionYear', SortOrder: 'Descending' }).then(function (data) {
      if (!alive()) return;
      var items = data.Items || [];
      if (!items.length) grid.appendChild(h('div', { class: 'empty', text: 'Aucun titre.' }));
      appendChunked(grid, items, function (child) { return itemCard(child); });
    });
  };

  // ── SyncPlay (regarder ensemble) et commandes à distance ──────────
  // Même protocole que Jellyfin Web : les groupes se rejoignent depuis le PC,
  // un téléphone ou la TV. Le serveur envoie ses ordres (lecture, pause,
  // avance) datés à son horloge ; la TV les applique au même instant.
  var sync = { socket: null, retry: 0, keepAlive: 0, ping: 0, group: null, offset: 0, rtt: 0, playlistItemId: '', lastCommand: '', timers: [], awaitReady: 0, joining: false };
  function serverIso() { return new Date(Date.now() + sync.offset).toISOString(); }
  function jfJson(method, path, body) {
    return request(S.jf + path, { method: method, headers: { Authorization: jfAuthorization(), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  function syncPost(path, body) { return jfJson('POST', '/SyncPlay/' + path, body || {}); }
  // Écart d'horloge avec le serveur : meilleur de 5 mesures (aller-retour le plus court).
  function syncClock() {
    var best = null;
    var chain = Promise.resolve();
    for (var i = 0; i < 5; i++) {
      chain = chain.then(function () {
        var sent = Date.now();
        return request(S.jf + '/GetUtcTime', { headers: { Authorization: jfAuthorization() } }).then(function (data) {
          var received = Date.now();
          var t1 = Date.parse(data.RequestReceptionTime), t2 = Date.parse(data.ResponseTransmissionTime);
          if (!t1 || !t2) return;
          var rtt = (received - sent) - (t2 - t1);
          var offset = ((t1 - sent) + (t2 - received)) / 2;
          if (!best || rtt < best.rtt) best = { rtt: rtt, offset: offset };
        });
      });
    }
    return chain.then(function () { if (best) { sync.offset = best.offset; sync.rtt = Math.max(0, best.rtt); } }).catch(function () { /* horloge locale */ });
  }
  function reportCapabilities() {
    jfJson('POST', '/Sessions/Capabilities/Full', { PlayableMediaTypes: ['Video'], SupportedCommands: ['DisplayMessage', 'PlayMediaSource'], SupportsMediaControl: true, SupportsPersistentIdentifier: true }).catch(function () { /* facultatif */ });
  }
  function connectSocket() {
    if (!S.jf || !S.token || !window.WebSocket) return;
    var old = sync.socket;
    sync.socket = null;
    if (old) { try { old.close(); } catch (error) { /* déjà fermée */ } }
    var address = S.jf.replace(/^http/i, 'ws') + '/socket?ApiKey=' + encodeURIComponent(S.token) + '&api_key=' + encodeURIComponent(S.token) + '&deviceId=' + encodeURIComponent(deviceId());
    var socket;
    try { socket = new WebSocket(address); } catch (error) { return; }
    sync.socket = socket;
    socket.onopen = function () { sync.retry = 0; };
    socket.onmessage = function (event) {
      var message;
      try { message = JSON.parse(event.data); } catch (error) { return; }
      try { socketMessage(message); } catch (error) { /* message inattendu */ }
    };
    socket.onclose = function () {
      if (sync.socket !== socket) return;
      clearInterval(sync.keepAlive);
      var delay = Math.min(30000, 2000 * Math.pow(2, sync.retry++));
      setTimeout(function () { if (sync.socket === socket) connectSocket(); }, delay);
    };
  }
  function socketSend(message) {
    try { if (sync.socket && sync.socket.readyState === 1) sync.socket.send(JSON.stringify(message)); } catch (error) { /* reconnexion en cours */ }
  }
  function socketMessage(message) {
    var data = message.Data;
    switch (message.MessageType) {
      case 'ForceKeepAlive':
        clearInterval(sync.keepAlive);
        sync.keepAlive = setInterval(function () { socketSend({ MessageType: 'KeepAlive' }); }, Math.max(10, Number(data) || 60) * 500);
        socketSend({ MessageType: 'KeepAlive' });
        break;
      case 'SyncPlayGroupUpdate': groupUpdate(data || {}); break;
      case 'SyncPlayCommand': groupCommand(data || {}); break;
      case 'Play':
        // « Lire sur Noctra TV » depuis un autre appareil.
        if (data && data.ItemIds && data.ItemIds[0]) playItem({ Id: String(data.ItemIds[0]).replace(/-/g, '') }, data.StartPositionTicks ? { startMs: Math.floor(data.StartPositionTicks / 10000) } : {});
        break;
      case 'Playstate':
        if (data && !sync.group) remotePlaystate(data);
        break;
      case 'GeneralCommand':
        if (data && data.Name === 'PlayMediaSource' && data.Arguments && data.Arguments.NoctraCommand === '1') { mobileRemoteCommand(data.Arguments); break; }
        if (data && data.Name === 'DisplayMessage' && data.Arguments) toast([data.Arguments.Header, data.Arguments.Text].filter(Boolean).join(' · '));
        break;
      default: break;
    }
  }
  var mobileRemoteState = { playing: true, positionMs: 0, volume: 100 };
  function mobileRemoteCommand(args) {
    if (args.action === 'state') {
      if (!/^[a-f0-9]{32}$/i.test(String(args.replyTo || '')) || !/^[a-f0-9]{32}$/i.test(String(args.targetId || ''))) return;
      native('playerCommand', { command: 'remoteState' });
      setTimeout(function () {
        var state = { live: Boolean(playback), title: playback ? playback.channel.name : '', playing: Boolean(mobileRemoteState.playing), position: (mobileRemoteState.positionMs || 0) / 1000, volume: mobileRemoteState.volume };
        jfJson('POST', '/Sessions/' + args.replyTo + '/Command', { Name: 'PlayMediaSource', Arguments: { NoctraRemoteState: '1', sessionId: args.targetId, state: JSON.stringify(state) } }).catch(function () { /* téléphone déconnecté */ });
      }, 200);
      return;
    }
    if (args.action === 'playLive') {
      var channel;
      try { channel = JSON.parse(String(args.channel || '')); } catch (error) { return; }
      if (!channel || typeof channel.name !== 'string' || !Array.isArray(channel._entries) || channel._entries.length > 200) return;
      if (!channel._entries.every(function (entry) { return entry && entry.channel && entry.source && typeof entry.source.name === 'string'; })) return;
      if (playback || vodPlayback) native('playerCommand', { command: 'stop' });
      playback = null;
      mobileRemoteState = { playing: true, positionMs: 0, volume: mobileRemoteState.volume };
      launchChannel(channel, { id: 'all', name: 'Toutes les chaînes' }, [channel]);
      // Le guide de la TV fournit le zapping même si le téléphone n'a envoyé qu'une chaîne.
      loadUnified().then(function (data) {
        if (!playback || playback.channel !== channel || !data || !data.channels) return;
        var list = data.channels.filter(function (entry) { return !channel.country || entry.country === channel.country; });
        var index = list.findIndex(function (entry) { return unifiedName(entry.name) === unifiedName(channel.name); });
        if (index >= 0) list[index] = channel; else list.unshift(channel);
        playback.list = list;
        native('playerCommand', { command: 'guide', epg: epgPayload(playback) });
      }).catch(function () { /* la chaîne reçue reste disponible */ });
      return;
    }
    if (!playback) return;
    if (args.action === 'next' || args.action === 'previous') { zap(args.action === 'next' ? 1 : -1); return; }
    if (args.action === 'volume') {
      var volume = Number(args.value);
      if (isFinite(volume)) native('playerCommand', { command: 'volume', value: Math.max(0, Math.min(100, volume)) });
      return;
    }
    var action = { toggle: 'playpause', pause: 'pause', play: 'unpause', stop: 'stop' }[args.action];
    if (action) { native('playerCommand', { command: action }); if (action === 'stop') playback = null; }
  }
  function remotePlaystate(data) {
    var map = { Pause: 'pause', Unpause: 'unpause', PlayPause: 'playpause', Stop: 'stop', Seek: 'seek' };
    var command = map[data.Command];
    if (!command) return;
    var payload = { command: command };
    if (command === 'seek' && data.SeekPositionTicks) payload.positionMs = Math.floor(data.SeekPositionTicks / 10000);
    native('playerCommand', payload);
  }

  function syncStatus(text) {
    native('playerCommand', { command: 'status', status: text });
    renderSyncBadge();
  }
  function renderSyncBadge() {
    var badge = document.getElementById('sync-badge');
    if (!sync.group) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = h('button', { id: 'sync-badge', class: 'nav sync-badge f', onclick: syncSheet });
      var user = document.getElementById('user');
      user.parentNode.insertBefore(badge, user);
    }
    badge.textContent = 'SyncPlay · ' + ((sync.group.participants || []).length || 1);
  }
  function leaveLocalGroup(message) {
    sync.group = null;
    sync.playlistItemId = '';
    sync.timers.forEach(clearTimeout);
    sync.timers = [];
    clearInterval(sync.ping);
    renderSyncBadge();
    if (message) toast(message);
  }
  function groupUpdate(update) {
    var data = update.Data;
    switch (update.Type) {
      case 'GroupJoined':
        sync.group = { id: update.GroupId, name: data && data.GroupName || 'Groupe', participants: data && data.Participants || [] };
        syncClock();
        clearInterval(sync.ping);
        sync.ping = setInterval(function () {
          syncClock().then(function () { syncPost('Ping', { Ping: Math.round(sync.rtt) }).catch(function () { /* réessai plus tard */ }); });
        }, 60000);
        toast('SyncPlay : vous avez rejoint « ' + sync.group.name + ' ».');
        renderSyncBadge();
        break;
      case 'UserJoined':
        if (sync.group && data) { sync.group.participants.push(data); renderSyncBadge(); toast('SyncPlay : ' + data + ' a rejoint le groupe.'); }
        break;
      case 'UserLeft':
        if (sync.group && data) {
          sync.group.participants = sync.group.participants.filter(function (name) { return name !== data; });
          renderSyncBadge();
          toast('SyncPlay : ' + data + ' a quitté le groupe.');
        }
        break;
      case 'GroupLeft': leaveLocalGroup('SyncPlay : vous avez quitté le groupe.'); break;
      case 'NotInGroup': case 'GroupDoesNotExist': case 'LibraryAccessDenied': case 'JoinGroupDenied': case 'CreateGroupDenied':
        leaveLocalGroup(update.Type === 'LibraryAccessDenied' ? 'SyncPlay : un titre du groupe n’est pas accessible à votre compte.' : update.Type === 'NotInGroup' ? '' : 'SyncPlay : action refusée par le serveur.');
        break;
      case 'StateUpdate':
        var state = data && data.State;
        syncStatus(state === 'Waiting' ? 'SyncPlay · en attente des autres…' : state === 'Paused' ? 'SyncPlay · en pause' : '');
        break;
      case 'PlayQueue':
        playQueue(data || {});
        break;
      default: break;
    }
  }
  function playQueue(queue) {
    var list = queue.Playlist || [];
    var entry = list[queue.PlayingItemIndex];
    if (!entry) {
      if (vodPlayback && vodPlayback.sync) { vodPlayback.stoppedByGroup = true; native('playerCommand', { command: 'stop' }); }
      sync.playlistItemId = '';
      return;
    }
    if (entry.PlaylistItemId === sync.playlistItemId && vodPlayback && vodPlayback.sync) return;
    sync.playlistItemId = entry.PlaylistItemId;
    playItem({ Id: String(entry.ItemId).replace(/-/g, '') }, { startMs: Math.floor((queue.StartPositionTicks || 0) / 10000), sync: true });
  }
  function atServerTime(when, action) {
    var local = Date.parse(when) - sync.offset;
    var delay = local - Date.now();
    if (!(delay > 0)) { action(0); return; }
    sync.timers.push(setTimeout(function () { action(Math.max(0, Date.now() - local)); }, delay));
  }
  function groupCommand(command) {
    var key = [command.Command, command.When, command.PositionTicks, command.PlaylistItemId].join('|');
    if (key === sync.lastCommand) return;
    sync.lastCommand = key;
    if (command.PlaylistItemId && sync.playlistItemId && command.PlaylistItemId !== sync.playlistItemId) return;
    var position = Math.floor((command.PositionTicks || 0) / 10000);
    switch (command.Command) {
      case 'Unpause':
        atServerTime(command.When, function (late) { native('playerCommand', { command: 'unpause', positionMs: position + late, status: '' }); });
        break;
      case 'Pause':
        atServerTime(command.When, function () { native('playerCommand', { command: 'pause', positionMs: position, status: 'SyncPlay · en pause' }); });
        break;
      case 'Seek':
        native('playerCommand', { command: 'seek', positionMs: position, pause: true, status: 'SyncPlay · synchronisation…' });
        // Déjà en mémoire : pas de chargement, donc prêt tout de suite.
        clearTimeout(sync.awaitReady);
        sync.awaitReady = setTimeout(function () { sendReady(position, false); }, 1500);
        break;
      case 'Stop':
        if (vodPlayback) vodPlayback.stoppedByGroup = true;
        native('playerCommand', { command: 'stop' });
        break;
      default: break;
    }
  }
  function sendReady(positionMs, playing) {
    clearTimeout(sync.awaitReady);
    sync.awaitReady = 0;
    if (!sync.group) return;
    syncPost('Ready', { When: serverIso(), PositionTicks: Math.floor(positionMs) * 10000, IsPlaying: Boolean(playing), PlaylistItemId: sync.playlistItemId }).catch(function () { /* réessai au prochain état */ });
  }
  // Événements du lecteur : état (prêt / chargement) et demandes de l'utilisateur.
  function playerEvent(event) {
    if (event.event === 'remoteState') { mobileRemoteState = event; return; }
    // Générique d'épisode passé à la main (avance rapide) : appris pour la série.
    if (event.event === 'introSkip') { learnIntro(event.seriesId, Number(event.startMs), Number(event.endMs)); return; }
    if (event.event === 'zap') { zap(Number(event.delta) || 0); return; }
    if (event.event === 'zapTo') {
      // Chaînes numérotées : numéro tapé → chaîne de ce numéro (dans la liste
      // affichée, sinon parmi toutes les chaînes du pays).
      if (event.number && playback && playback.list && playback.list._all) {
        var wanted = (Number(event.index) || 0) + 1;
        var all = playback.list._all;
        var found = null;
        for (var i = 0; i < all.length && !found; i++) if (all[i]._lcn === wanted) found = all[i];
        if (!found) return;
        if (playback.list.indexOf(found) < 0) { all._all = all; playback.list = all; }
        zapTo(playback.list.indexOf(found));
        return;
      }
      // Numéro tapé au-delà de la liste : ignoré (le lecteur l'indique).
      if (event.number && playback && playback.list && Number(event.index) >= playback.list.length) return;
      zapTo(Number(event.index) || 0);
      return;
    }
    if (event.event === 'channels') { sendChannels(false); return; }
    if (event.event === 'servers') { sendServers(); return; }
    if (event.event === 'server') { pickServer(Number(event.index) || 0); return; }
    if (event.event === 'failed') { playerFailed(event); return; }
    if (event.event === 'liveHealth') { if (playback && (!event.playSessionId || event.playSessionId === playback.playId)) recordSmooth(playback, playback.index, Number(event.stalls) || 0, Number(event.playedMs) || 0); return; }
    if (event.event === 'struggling') { if (playback && (!event.playSessionId || event.playSessionId === playback.playId)) struggling(playback); return; }
    // Direct lancé : serveur fiable pour cette chaîne (historique de santé).
    if (event.event === 'live') { if (playback && (!event.playSessionId || event.playSessionId === playback.playId)) succeeded(playback); return; }
    // Piste choisie dans le lecteur : retenue pour les épisodes suivants.
    if (event.event === 'tracks') {
      if (typeof event.audio === 'string') trackPrefs.audio = event.audio;
      if (typeof event.subtitles === 'string') trackPrefs.subtitles = event.subtitles;
      saveTracks();
      return;
    }
    if (!vodPlayback || !vodPlayback.sync || !sync.group) return;
    if (event.event === 'state') {
      if (event.action === 'ready') sendReady(event.positionMs, event.playing);
      else {
        clearTimeout(sync.awaitReady);
        syncPost('Buffering', { When: serverIso(), PositionTicks: Math.floor(event.positionMs) * 10000, IsPlaying: Boolean(event.playing), PlaylistItemId: sync.playlistItemId }).catch(function () { /* facultatif */ });
      }
    } else if (event.event === 'user') {
      if (event.action === 'pause') syncPost('Pause');
      else if (event.action === 'unpause') syncPost('Unpause');
      else if (event.action === 'seek') syncPost('Seek', { PositionTicks: Math.floor(event.positionMs) * 10000 });
    }
  }

  function syncSheet() {
    var list = h('div', { class: 'list scroll' },
      h('h2', null, 'SyncPlay', h('small', { text: sync.group ? 'Groupe : ' + sync.group.name + ' · ' + (sync.group.participants || []).join(', ') : 'Regarder ensemble, synchronisé avec le PC ou le téléphone' })));
    var groups = h('div', { class: 'sync-groups' }, loading('Recherche des groupes…'));
    list.appendChild(groups);
    if (sync.group) {
      list.appendChild(h('button', { class: 'btn f', onclick: function () {
        closeLayer();
        syncPost('Leave').then(function () { leaveLocalGroup('SyncPlay : vous avez quitté le groupe.'); }, function (error) { toast(error.message, true); });
      } }, icon('close'), 'Quitter le groupe'));
    } else {
      list.appendChild(h('button', { class: 'btn primary f', onclick: function () {
        closeLayer();
        syncPost('New', { GroupName: 'Noctra TV · ' + (S.userName || 'TV') }).catch(function (error) { toast(error.message, true); });
      } }, icon('people'), 'Créer un groupe'));
    }
    list.appendChild(h('button', { class: 'btn f', text: 'Fermer', onclick: closeLayer }));
    openLayer(h('div', { class: 'modal' }, list));
    jfJson('GET', '/SyncPlay/List').then(function (data) {
      if (!document.body.contains(list)) return;
      clear(groups);
      var available = (data || []).filter(function (group) { return !sync.group || group.GroupId !== sync.group.id; });
      if (!available.length) { groups.appendChild(h('p', { class: 'hint-text', text: sync.group ? 'Aucun autre groupe.' : 'Aucun groupe en cours. Créez-en un, ou lancez SyncPlay depuis le PC.' })); return; }
      available.forEach(function (group) {
        groups.appendChild(h('button', { class: 'btn f', onclick: function () {
          closeLayer();
          syncPost('Join', { GroupId: group.GroupId }).catch(function (error) { toast(error.message, true); });
        } }, icon('people'), 'Rejoindre « ' + (group.GroupName || 'Groupe') + ' » · ' + (group.Participants || []).join(', ')));
      });
    }, function (error) {
      if (!document.body.contains(list)) return;
      clear(groups);
      groups.appendChild(failure(error));
    });
  }

  // ── Accueil ────────────────────────────────────────────────────────
  // Comme sur PC : « À l'affiche chez vous », carrousel « Continuer à
  // regarder » (défilement toutes les 8 s, suspendu tant qu'il a le focus),
  // médiathèques en 2 × 2, puis « À suivre » et les derniers ajouts.
  views.home = function (params, alive) {
    main.appendChild(h('header', { class: 'home-heading' },
      h('div', null, h('p', { text: 'VOTRE SALLE DE CINÉMA' }), h('h1', null, 'À l’affiche chez vous', h('span', { text: '.' }))),
      h('span', { class: 'note', text: 'Votre collection. À votre rythme.' })));
    var hero = h('div', { class: 'premiere-slot' }, h('section', { class: 'premiere premiere-empty' }));
    var libs = h('div');
    var rows = h('div', null, loading());
    var nextUp = h('div');
    main.appendChild(hero);
    main.appendChild(rows);
    main.appendChild(nextUp);
    main.appendChild(libs);
    var resume = memo('resume', 30000, function () {
      return api('/api/home/resume').then(function (data) { return (data && data.items) || []; }).catch(function () {
        return jf('/Users/{userId}/Items/Resume', { Limit: 12, MediaTypes: 'Video', Fields: 'PrimaryImageAspectRatio,Overview' }).then(function (d) { return d.Items || []; });
      });
    });
    var noctraLibs = memo('noctraLibraries', 300000, function () { return api('/api/libraries').catch(function () { return {}; }); });
    var views_ = memo('views', 300000, function () { return jf('/Users/{userId}/Views').then(function (d) { return d.Items || []; }); });

    var heroDone = resume.then(function (items) {
      if (!alive()) return;
      clear(hero);
      hero.appendChild(premiere(items));
    }, function () { /* le carrousel reste vide */ });
    var libsDone = Promise.all([noctraLibs, views_]).then(function (result) {
      if (!alive()) return;
      add(libs, libraryBlock(result[0], result[1], false));
    }, function () { /* médiathèques affichées plus bas */ });
    var rowsDone = views_.then(function (libraries) {
      var media = libraries.filter(function (lib) { return ['movies', 'tvshows'].indexOf(lib.CollectionType) >= 0; }).slice(0, 6);
      return Promise.all([
        memo('nextup', 30000, function () {
          return jf('/Shows/NextUp', { UserId: S.userId, Limit: 16, Fields: 'PrimaryImageAspectRatio', ImageTypeLimit: 1, EnableImageTypes: 'Primary,Backdrop,Thumb' })
            .then(function (d) { return d.Items || []; }, function () { return []; });
        })
      ].concat(media.map(function (lib) {
        return memo('latest:' + lib.Id, 120000, function () {
          return jf('/Users/{userId}/Items/Latest', { ParentId: lib.Id, Limit: 16, Fields: 'PrimaryImageAspectRatio,ProductionYear', ImageTypeLimit: 1, EnableImageTypes: 'Primary' })
            .then(function (items) { return items || []; }, function () { return []; });
        }).then(function (items) { return { lib: lib, items: items }; });
      }))).then(function (result) {
        if (!alive()) return;
        clear(rows);
        add(nextUp, row('À suivre', result[0].map(function (item) { return itemCard(item, 'wide'); })));
        result.slice(1).forEach(function (entry) {
          add(rows, row('Derniers ajouts', entry.items.map(function (item) { return itemCard(item); }), entry.lib.Name));
        });
      });
    }).catch(function (error) {
      if (!alive()) return;
      clear(rows);
      rows.appendChild(failure(error, function () { go('home', {}, true); }));
    });
    return Promise.all([heroDone, libsDone, rowsDone]);
  };

  function backdropUrl(item, width) {
    if (LITE_UI) width = Math.min(width, 1280);
    if (item.BackdropImageTags && item.BackdropImageTags.length) return S.jf + '/Items/' + item.Id + '/Images/Backdrop?maxWidth=' + width + '&quality=90&tag=' + item.BackdropImageTags[0];
    if (item.ParentBackdropItemId) return S.jf + '/Items/' + item.ParentBackdropItemId + '/Images/Backdrop?maxWidth=' + width + '&quality=90' + (item.ParentBackdropImageTags && item.ParentBackdropImageTags[0] ? '&tag=' + item.ParentBackdropImageTags[0] : '');
    // Sans image large : affiche en bonne définition (présentée entière).
    return jfImage(item.Type === 'Episode' && item.SeriesId ? item.SeriesId : item.Id, 'Primary', item.Type === 'Episode' ? item.SeriesPrimaryImageTag : item.ImageTags && item.ImageTags.Primary, 720);
  }
  // Largeur réelle de l'écran (densité comprise) : image nette sur un
  // téléviseur 1080p sans télécharger plus que nécessaire.
  function premiereWidth() {
    var ratio = Math.min(Math.max(Number(window.devicePixelRatio) || 1, 1), 3);
    var width = Math.max(window.innerWidth || 0, (window.screen && window.screen.width) || 0) * ratio;
    return Math.max(1280, Math.min(1920, Math.round(width / 160) * 160));
  }
  function premiere(items) {
    items = items.slice(0, 12);
    var node = h('section', { class: 'premiere reveal-box' });
    if (!items.length) {
      node.className = 'premiere premiere-empty reveal-box';
      node.appendChild(h('div', { class: 'premiere-copy' },
        h('p', { class: 'eyebrow', text: 'CONTINUER À REGARDER' }),
        h('h2', { text: 'Tout est à jour' }),
        h('p', { class: 'premiere-sub', text: 'Vos films et épisodes commencés apparaîtront ici.' })));
      return node;
    }
    var index = 0;
    var timer = 0;
    var art = h('div', { class: 'premiere-art' });
    var label = h('span', { class: 'premiere-label' });
    var title = h('h2');
    var subtitle = h('p', { class: 'premiere-sub' });
    var count = h('span', { class: 'premiere-count' });
    var play = h('button', { class: 'btn primary f', 'data-start': true, onclick: function () { playItem(items[index]); } }, icon('play'), 'Reprendre');
    var details = h('button', { class: 'btn f', onclick: function () { openItem(items[index].Id); } }, 'Voir la fiche');
    var prev = h('button', { class: 'round f', 'aria-label': 'Titre précédent', onclick: function () { step(-1); } }, icon('prev'));
    var next = h('button', { class: 'round f', 'aria-label': 'Titre suivant', onclick: function () { step(1); } }, icon('next'));
    node.appendChild(art);
    node.appendChild(h('div', { class: 'premiere-shade' }));
    node.appendChild(h('div', { class: 'premiere-copy' },
      h('p', { class: 'eyebrow', text: 'CONTINUER À REGARDER' }), label, title, subtitle,
      h('div', { class: 'premiere-actions' }, play, details, items.length > 1 ? prev : null, items.length > 1 ? count : null, items.length > 1 ? next : null)));

    var copy = node.lastChild;
    // Image large et logo préparés ensemble (téléchargés et décodés), puis
    // affichés dans la même image que le texte : rien n'apparaît en décalé.
    // Le titre suivant est préparé à l'avance pour un changement immédiat.
    var prepared = {};
    function logoUrl(item) {
      var logoId = item.ImageTags && item.ImageTags.Logo ? item.Id : item.ParentLogoItemId;
      var logoTag = item.ImageTags && item.ImageTags.Logo ? item.ImageTags.Logo : item.ParentLogoImageTag;
      return logoId ? S.jf + '/Items/' + logoId + '/Images/Logo?maxHeight=160&quality=90' + (logoTag ? '&tag=' + encodeURIComponent(logoTag) : '') : '';
    }
    function loadImage(url, limit) {
      if (!url) return Promise.resolve(null);
      return new Promise(function (resolve) {
        var picture = new Image();
        var done = false;
        function finish(value) { if (!done) { done = true; resolve(value); } }
        picture.decoding = 'async';
        picture.onload = function () {
          if (picture.decode) picture.decode().then(function () { finish(picture); }, function () { finish(picture); });
          else finish(picture);
        };
        picture.onerror = function () { finish(null); };
        if (limit) setTimeout(function () { finish(null); }, limit);
        picture.src = url;
      });
    }
    function prepare(item) {
      var key = item.Id;
      if (!prepared[key]) {
        // Logo : attendu au plus 2,5 s, sinon le titre en texte.
        prepared[key] = Promise.all([loadImage(backdropUrl(item, premiereWidth()), 8000), loadImage(logoUrl(item), 2500)]);
        prepared[key].then(function (loaded) {
          // Une image en erreur sera redemandée au prochain passage.
          if (!loaded[0]) delete prepared[key];
        });
      }
      return prepared[key];
    }
    var generation = 0;
    function render() {
      var item = items[index];
      var turn = ++generation;
      count.textContent = (index + 1) + ' / ' + items.length;
      prepare(item).then(function (loaded) {
        if (turn !== generation || !document.body.contains(node)) return;
        show(item, loaded[0], loaded[1]);
        var following = items[(index + 1) % items.length];
        if (following && following !== item) prepare(following);
      });
    }
    function show(item, picture, logo) {
      label.textContent = item.Type === 'Episode' ? 'L’histoire continue' : 'Reprendre la lecture';
      subtitle.textContent = item.Type === 'Episode'
        ? 'S' + (item.ParentIndexNumber || 1) + ':E' + (item.IndexNumber || 1) + ' · ' + (item.Name || '')
        : String(item.ProductionYear || '');
      clear(title);
      title.classList.toggle('has-logo', Boolean(logo));
      if (logo) {
        // Élément déjà décodé, réutilisé tel quel (pas de nouveau décodage).
        logo.className = 'premiere-logo';
        logo.alt = itemTitle(item);
        title.appendChild(logo);
      } else {
        title.textContent = itemTitle(item);
      }
      copy.classList.remove('fresh');
      void copy.offsetWidth;
      copy.classList.add('fresh');
      if (!picture) return;
      var src = picture.src;
      if (art.getAttribute('data-src') === src) return;
      art.setAttribute('data-src', src);
      // Affiche verticale (pas d'image large) : entière, à droite, sur un
      // fond flouté d'elle-même, comme sur PC ; jamais recadrée en bandeau.
      var portrait = picture.naturalWidth && picture.naturalHeight && picture.naturalWidth / picture.naturalHeight < 1.25;
      var ambient = h('div', { class: 'premiere-ambient', style: 'background-image:url("' + src.replace(/maxWidth=\d+/, 'maxWidth=48').replace(/maxHeight=\d+/, 'maxHeight=64').replace(/quality=\d+/, 'quality=60').replace(/"/g, '%22') + '")' });
      picture.className = 'premiere-picture';
      var slide = h('div', { class: 'premiere-slide' + (portrait ? ' portrait' : '') }, ambient, picture);
      var previous = art.lastElementChild;
      art.appendChild(slide);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { slide.classList.add('shown'); });
        if (previous) setTimeout(function () { if (previous.parentNode) previous.parentNode.removeChild(previous); }, 750);
      });
    }
    function step(delta) {
      index = (index + delta + items.length) % items.length;
      render();
    }
    function sync() {
      clearTimeout(timer);
      if (items.length < 2) return;
      timer = setTimeout(function () {
        if (!document.body.contains(node)) return;
        if (node.contains(document.activeElement) || layer.firstChild) { sync(); return; }
        // Lecteur ouvert par-dessus : pas de nouvelle image (décodage qui
        // prenait du processeur à la vidéo, d'où des coupures régulières).
        if (appHidden || document.hidden) { sync(); return; }
        // LG / Samsung : pas de nouvelle image (décodage coûteux) pendant la
        // navigation ni quand le carrousel n'est plus à l'écran.
        if (LITE_UI && (Date.now() - lastMove < 4000 || main.scrollTop > node.offsetHeight / 2)) { sync(); return; }
        step(1);
        sync();
      }, LITE_UI ? 15000 : 8000);
    }
    render();
    sync();
    return node;
  }

  // ── Médiathèques ───────────────────────────────────────────────────
  // Les 4 médiathèques Noctra (Films, Séries, Films d'animation, Animes) en
  // 2 × 2 comme sur PC ; les autres médiathèques Jellyfin à la suite.
  function noctraLibraryList(catalog) {
    return Object.keys(catalog || {}).filter(function (label) { return catalog[label] && catalog[label].id; }).map(function (label) {
      var lib = catalog[label];
      return { Id: lib.id, Name: label, CollectionType: lib.type || 'movies', count: lib.count, image: lib.image };
    });
  }
  function libraryBlock(catalog, views, withOthers) {
    var noctra = noctraLibraryList(catalog);
    var ids = {};
    noctra.forEach(function (lib) { ids[lib.Id] = true; });
    var others = views.filter(function (lib) { return !ids[lib.Id]; });
    var block = h('div');
    var main4 = noctra.length ? noctra : views.slice(0, 4);
    if (main4.length) {
      var grid = h('div', { class: 'libs2' });
      main4.forEach(function (lib) { grid.appendChild(libraryTile(lib)); });
      block.appendChild(h('section', { class: 'row reveal-box' }, h('h2', { text: 'Médiathèques' }), grid));
    }
    if (withOthers && noctra.length && others.length) {
      var rest = h('div', { class: 'grid wides' });
      others.forEach(function (lib) { rest.appendChild(libraryCard(lib)); });
      block.appendChild(h('section', { class: 'row' }, h('h2', { text: 'Autres médiathèques' }), rest));
    }
    return block;
  }
  function libraryTile(lib) {
    var cover = lib.image ? absolute(lib.image) : jfImage(lib.Id, 'Primary', lib.ImageTags && lib.ImageTags.Primary, 360);
    var picture = image(cover, '');
    picture.className = 'lib-cover';
    var count = typeof lib.count === 'number' ? lib.count + (lib.count > 1 ? ' titres' : ' titre') : libraryKind(lib.CollectionType);
    return h('button', { class: 'lib-tile f', onclick: function () { openLibrary(lib); } },
      picture, h('span', { class: 'lib-shade' }),
      h('span', { class: 'lib-label' }, h('strong', { text: lib.Name }), h('small', { text: count })));
  }
  function libraryCard(lib) {
    var node = card({ kind: 'library wide', title: lib.Name, image: jfImage(lib.Id, 'Primary', lib.ImageTags && lib.ImageTags.Primary, 300), noMeta: true,
      onSelect: function () { openLibrary(lib); } });
    node.querySelector('.art').appendChild(h('div', { class: 'label' }, lib.Name, h('small', { text: libraryKind(lib.CollectionType) })));
    return node;
  }
  function libraryKind(type) {
    return { movies: 'Films', tvshows: 'Séries', music: 'Musique', boxsets: 'Collections', homevideos: 'Vidéos', photos: 'Photos', livetv: 'TV', playlists: 'Listes de lecture', musicvideos: 'Clips' }[type] || 'Médiathèque';
  }
  function openLibrary(lib) {
    if (['movies', 'tvshows', 'boxsets', 'homevideos', 'musicvideos', 'mixed', undefined].indexOf(lib.CollectionType) >= 0) {
      go('library', { section: 'libraries', lib: lib });
    } else if (!native('openLibrary', { id: lib.Id })) toast('Disponible dans l’appli Noctra TV.');
  }
  views.libraries = function (params, alive) {
    main.appendChild(head('Médiathèques', 'Parcourez vos films et séries.'));
    var status = loading();
    main.appendChild(status);
    return Promise.all([
      memo('noctraLibraries', 300000, function () { return api('/api/libraries').catch(function () { return {}; }); }),
      memo('views', 300000, function () { return jf('/Users/{userId}/Views').then(function (d) { return d.Items || []; }); })
    ]).then(function (result) {
      if (!alive()) return;
      status.remove();
      var block = libraryBlock(result[0], result[1], true);
      if (!block.firstChild) main.appendChild(h('div', { class: 'empty', text: 'Aucune médiathèque.' }));
      main.appendChild(block);
    }, function (error) {
      if (!alive()) return;
      status.replaceWith(failure(error, function () { go('libraries', {}, true); }));
    });
  };

  var librarySorts = [
    { id: 'recent', label: 'Ajouts récents', sort: 'DateCreated,SortName', order: 'Descending' },
    { id: 'title', label: 'Titre', sort: 'SortName', order: 'Ascending' },
    { id: 'rating', label: 'Note', sort: 'CommunityRating,SortName', order: 'Descending' },
    { id: 'year', label: 'Année', sort: 'ProductionYear,PremiereDate,SortName', order: 'Descending' },
    { id: 'random', label: 'Aléatoire', sort: 'Random', order: 'Ascending' }
  ];
  views.library = function (params, alive) {
    var lib = params.lib;
    var sort = params.sort || 'recent';
    var unplayed = Boolean(params.unplayed);
    var type = lib.CollectionType === 'movies' ? 'Movie' : lib.CollectionType === 'tvshows' ? 'Series' : lib.CollectionType === 'boxsets' ? 'BoxSet' : '';
    var count = h('span', { class: 'sub' });
    main.appendChild(head(lib.Name, ''));
    var chips = h('div', { class: 'chips' });
    librarySorts.forEach(function (option) {
      chips.appendChild(chip(option.label, option.id === sort, function () { reopen({ sort: option.id }); }));
    });
    if (type !== 'BoxSet') chips.appendChild(chip('Non vus', unplayed, function () { reopen({ unplayed: !unplayed }); }));
    main.appendChild(chips);
    main.appendChild(h('div', { style: 'padding:0 2.5rem;color:var(--muted);font-size:.85rem' }, count));
    var grid = h('div', { class: 'grid posters' });
    var status = loading();
    main.appendChild(grid);
    main.appendChild(status);
    var chosen = librarySorts.filter(function (option) { return option.id === sort; })[0];
    var start = 0, total = Infinity, busy = false;

    function reopen(change) {
      var next = { section: 'libraries', lib: lib, sort: sort, unplayed: unplayed };
      Object.keys(change).forEach(function (key) { next[key] = change[key]; });
      current.params = next;
      current.focusIndex = -1;
      show(false);
      setTimeout(function () {
        var active = main.querySelector('.chips .chip.on') || main.querySelector('.chips .chip');
        var label = change.sort ? librarySorts.filter(function (o) { return o.id === change.sort; })[0].label : 'Non vus';
        Array.prototype.forEach.call(main.querySelectorAll('.chips .chip'), function (node) { if (node.textContent === label) active = node; });
        focus(active);
      }, 0);
    }
    function page() {
      if (busy || start >= total) return Promise.resolve();
      busy = true;
      return jf('/Users/{userId}/Items', {
        ParentId: lib.Id, Recursive: type ? 'true' : 'false', IncludeItemTypes: type, SortBy: chosen.sort, SortOrder: chosen.order,
        Filters: unplayed ? 'IsUnplayed' : '', Fields: 'PrimaryImageAspectRatio,ProductionYear', ImageTypeLimit: 1, EnableImageTypes: 'Primary',
        StartIndex: start, Limit: 72, EnableTotalRecordCount: 'true'
      }).then(function (data) {
        busy = false;
        if (!alive()) return;
        status.style.display = 'none';
        total = data.TotalRecordCount || 0;
        count.textContent = total + (total > 1 ? ' titres' : ' titre');
        var items = data.Items || [];
        start += items.length;
        if (!items.length) total = start;
        if (!items.length && !grid.firstChild) grid.appendChild(h('div', { class: 'empty', text: 'Aucun titre.' }));
        appendChunked(grid, items, function (item) { return itemCard(item); }, function () { armTail(grid, start < total ? page : null); });
      }, function (error) {
        busy = false;
        if (!alive()) return;
        status.replaceWith(failure(error));
      });
    }
    return page();
  };

  // ── TV en direct ───────────────────────────────────────────────────
  var sourceSections = [
    { id: 'channels', label: 'Chaînes' },
    { id: 'sports', label: 'Sport' },
    { id: 'personal', label: 'Mes sources' }
  ];
  // Chaînes favorites et récemment regardées (mémorisées sur la TV, comme les
  // favoris du PC) : la source et le nom suffisent ; à l'ouverture, la chaîne
  // est retrouvée dans le catalogue du moment (liens toujours frais).
  var FAVORITES_KEY = 'noctra-tv-favorites-v1';
  var RECENTS_KEY = 'noctra-tv-recents-v1';
  function storedChannels(key) {
    try { var list = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(list) ? list.filter(function (item) { return item && item.sourceId && item.name; }) : []; } catch (error) { return []; }
  }
  function saveChannels(key, list) {
    delete storedIndex[key];
    try { localStorage.setItem(key, JSON.stringify(list.slice(0, key === RECENTS_KEY ? 16 : 300))); } catch (error) { /* stockage indisponible */ }
  }
  function channelRecord(channel, source, ctx) {
    return {
      key: channelKey(channel, source), sourceId: source.id, sourceName: source.name || '', ref: (ctx && ctx.ref) || '', refTitle: (ctx && ctx.title) || '',
      name: channel.name, logo: channel.logo || '', group: channel.group || '', provider: channel.provider || '',
      iptvOrgId: channel.iptvOrgId || '', epgId: channel.epgId || '', at: Date.now()
    };
  }
  // Favoris et chaînes récentes mémorisés (clés et noms rapprochés) : relus
  // une seule fois tant qu'ils ne changent pas (listes de milliers de chaînes).
  var storedIndex = {};
  function storedMatch(listKey, channel, source) {
    var index = storedIndex[listKey];
    if (!index) {
      index = { keys: {}, names: {} };
      storedChannels(listKey).forEach(function (item) { index.keys[item.key] = 1; index.names[unifiedName(item.name)] = 1; });
      storedIndex[listKey] = index;
    }
    if (index.keys[channelKey(channel, source)]) return true;
    // Chaîne réunie : favorite depuis n'importe quelle source.
    if (channel._entries) {
      if (index.names[unifiedName(channel.name)]) return true;
      return channel._entries.some(function (entry) { return index.keys[channelKey(entry.channel, entry.source)] || index.names[unifiedName(entry.channel.name)]; });
    }
    return false;
  }
  function isFavorite(channel, source) {
    return storedMatch(FAVORITES_KEY, channel, source);
  }
  function isRecent(channel, source) {
    return storedMatch(RECENTS_KEY, channel, source);
  }
  function toggleFavorite(channel, source, ctx) {
    var list = storedChannels(FAVORITES_KEY);
    var key = channelKey(channel, source);
    var index = -1;
    list.some(function (item, i) { if (item.key === key) { index = i; return true; } return false; });
    if (index >= 0) { list.splice(index, 1); toast(channel.name + ' retirée des favoris.'); }
    else { list.unshift(channelRecord(channel, source, ctx)); toast(channel.name + ' ajoutée aux favoris.'); }
    saveChannels(FAVORITES_KEY, list);
    return index < 0;
  }
  function rememberRecent(channel, source, ctx) {
    var key = channelKey(channel, source);
    var list = storedChannels(RECENTS_KEY).filter(function (item) { return item.key !== key; });
    list.unshift(channelRecord(channel, source, ctx));
    saveChannels(RECENTS_KEY, list);
  }
  // Catalogue d'une source ou d'un bouquet (mis en cache pour la session).
  function loadCatalog(source, ref, title, fresh) {
    var key = ref ? 'tv-ref:' + ref : 'tv:' + source.id;
    var path = ref ? '/api/tv/catalog?ref=' + encodeURIComponent(ref) : '/api/tv/catalog?source=' + encodeURIComponent(source.id);
    catalogSources[key] = { source: source, label: title ? source.name + ' · ' + title : source.name };
    return cache[key] && !fresh ? Promise.resolve(cache[key]) : api(path, { timeout: 45000 }).then(function (data) {
      cache[key] = data;
      return data;
    });
  }
  function sourcesList() {
    return memo('tv-sources', 300000, function () { return api('/api/tv/sources').then(function (data) { return (data && data.sources) || []; }); });
  }
  // ── Toutes les chaînes ─────────────────────────────────────────────
  // Beaucoup de sources proposent les mêmes chaînes : elles sont réunies en
  // une seule liste (une carte par chaîne). Au lancement, la fenêtre des
  // serveurs propose ceux de toutes les sources de la chaîne, classés par
  // fiabilité (historique de santé) : le plus stable démarre en premier.
  // ── Logos de secours ──
  // Collection libre tv-logo/tv-logos (chaînes françaises) et logos iptv-org :
  // listes embarquées (tv-data.js) ; image directe, puis par le serveur Noctra.
  var LOGO_BASE = 'https://cdn.jsdelivr.net/gh/tv-logo/tv-logos@main/countries/france/';
  var logoIndex = null;
  // Clé de logo : « canal-plus-sport-360 » → même clé que « Canal+ Sport 360 HD ».
  function logoIndexGet() {
    if (logoIndex) return logoIndex;
    logoIndex = {};
    var files = String((typeof TV_DATA !== 'undefined' && TV_DATA && TV_DATA.logos) || '').split(' ');
    files.forEach(function (file) {
      if (!file) return;
      var key = unifiedName(file.replace(/^hd\//, '').replace(/-french$/, '').replace(/-/g, ' '));
      if (key && !logoIndex[key]) logoIndex[key] = file + '-fr.png';
    });
    // Écritures courantes absentes des noms de fichiers.
    var aliases = { disneyjunior: 'disneyjr', nickelodeonjr: 'nickelodeonjunior', canalplusf1: 'canalplusformula1', automoto: 'automotolachaine',
      europe2: 'europe2pop', teletoon: 'teletoonplus', piwi: 'piwiplus', infosport: 'infosportplus', meteo: 'lachainemeteo' };
    Object.keys(aliases).forEach(function (key) { if (!logoIndex[key] && logoIndex[aliases[key]]) logoIndex[key] = logoIndex[aliases[key]]; });
    return logoIndex;
  }
  // Logos iptv-org des autres chaînes françaises (tv-data.js) : adresse complète.
  var iptvLogoIndex = null;
  function iptvLogo(name) {
    if (!iptvLogoIndex) {
      iptvLogoIndex = {};
      String((typeof TV_DATA !== 'undefined' && TV_DATA && TV_DATA.iptvLogos) || '').split('|').forEach(function (item) {
        var cut = item.indexOf(' ');
        if (cut > 0) iptvLogoIndex[item.slice(0, cut)] = item.slice(cut + 1).replace(/^i:/, 'https://i.imgur.com/');
      });
    }
    var key = unifiedName(name);
    return key ? iptvLogoIndex[key] || '' : '';
  }
  // Logo externe demandé par le serveur Noctra (mis en cache sur le serveur) :
  // utile quand le réseau du téléviseur n'atteint pas l'hébergeur du logo.
  var PROXY_PREFIX = 'noctra-proxy:';
  function viaServer(url) { return PROXY_PREFIX + url; }
  var proxyImages = {};
  var proxyCount = 0;
  function proxyImage(url) {
    if (proxyImages[url]) return proxyImages[url];
    if (++proxyCount > 400) { proxyImages = {}; proxyCount = 1; }
    var json = JSON.stringify({ u: url });
    var token = 'j' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    var promise = fetch(S.noctra + '/api/tv/image/' + token, { headers: { 'x-noctra-token': S.token }, credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('logo ' + response.status);
        return response.blob();
      })
      .then(function (blob) { return URL.createObjectURL(blob); });
    promise.catch(function () { delete proxyImages[url]; });
    return (proxyImages[url] = promise);
  }
  function logoFile(name) {
    var index = logoIndexGet();
    var key = unifiedName(name);
    if (!key) return '';
    return index[key] || index[key + 's'] || (/s$/.test(key) ? index[key.slice(0, -1)] : '') || '';
  }
  // Nom de fichier deviné (chaîne absente de la liste) : « canal-plus-sport-360-fr.png ».
  var LOGO_SLUG_FIXES = { cnews: 'c-news', cstar: 'c-star', bfm: 'bfm-tv', bfmtv: 'bfm-tv', 'france-info': 'franceinfo', 'lequipe-21': 'lequipe',
    'lequipe-tv': 'lequipe', eurosport: 'eurosport-1', 'la-chaine-lequipe': 'lequipe', 'd8': 'c8', 'd17': 'c-star',
    'nt1': 'tfx', 'hd1': 'tf1-series-films', 'numero-23': 'rmc-story', 'cine-plus': 'cine-plus-premier', 'bein-sport': 'bein-sports' };
  function logoSlugs(name) {
    var slug = normalize(cleanChannelName(name).replace(/\+/g, ' plus ').replace(/&/g, ' and ').replace(/['’]/g, ''))
      .replace(/\b(?:hd|fhd|uhd|sd|4k|tv hd)\b/g, ' ').replace(/\s+(?:france|fr|fra)$/, '').trim().replace(/\s+/g, '-');
    if (!slug) return [];
    slug = slug.replace(/^c-plus-/, 'canal-plus-').replace(/^bein-sport-/, 'bein-sports-').replace(/-sport-(\d)/, '-sport-$1');
    var fixed = LOGO_SLUG_FIXES[slug] || slug;
    var list = [];
    // beIN Sports 1/2/3 : fichiers « -french ».
    if (/^bein-sports-\d$/.test(fixed)) list.push(fixed + '-french');
    list.push(fixed);
    return list.map(function (item) { return LOGO_BASE + item + '-fr.png'; });
  }
  // Logo « monogramme » généré par le serveur Noctra quand la source n'en a pas
  // (adresse /api/tv/image/s<données>.<signature> sans adresse d'origine).
  function serverMonogram(url) {
    var match = /\/api\/tv\/image\/s([A-Za-z0-9_-]+)\./.exec(String(url || ''));
    if (!match) return false;
    try {
      var payload = match[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      return atob(payload).indexOf('"u":') < 0;
    } catch (error) { return false; }
  }
  // Logos essayés dans l'ordre jusqu'à ce qu'un s'affiche : logo officiel de la
  // collection tv-logos (chaîne française reconnue), logos des sources, puis
  // le monogramme du serveur en dernier recours.
  function channelLogo(channel) {
    var known = [];
    var sources = [];
    var monograms = [];
    var logos = [channel.logo];
    if (channel._entries) channel._entries.forEach(function (entry) { logos.push(entry.channel.logo); });
    logos.forEach(function (logo) {
      if (!logo) return;
      var url = absolute(logo);
      (serverMonogram(url) ? monograms : sources).push(url);
    });
    var country = channel._entries ? channel.country : channelCountry(channel);
    if (channel.name && (!country || country === 'fr')) {
      var names = [channel.iptvOrgName, channel.name];
      if (channel._entries) channel._entries.forEach(function (entry) { names.push(entry.channel.iptvOrgName, entry.channel.name); });
      var file = '';
      var other = '';
      for (var i = 0; i < names.length && !file; i++) if (names[i]) file = logoFile(names[i]);
      for (var j = 0; j < names.length && !file && !other; j++) if (names[j]) other = iptvLogo(names[j]);
      // Logo officiel, directement puis par le serveur Noctra.
      if (file) known.push(LOGO_BASE + file, viaServer(LOGO_BASE + file));
      else if (other) known.push(other, viaServer(other));
      var list = known.concat(sources.slice(0, 3));
      if (!file && !other && !sources.length) logoSlugs(channel.iptvOrgName || channel.name).forEach(function (url) { list.push(url); });
      list = list.concat(monograms.slice(0, 1));
      return list.filter(function (item, index) { return list.indexOf(item) === index; }).slice(0, 7);
    }
    var other = sources.slice(0, 4).concat(monograms.slice(0, 1));
    return other.length ? other : '';
  }

  var ALL_SOURCE = { id: 'all', name: 'Toutes les chaînes', description: 'Les chaînes de toutes les sources réunies · la source la plus stable est proposée d’abord' };
  var unifiedCache = null;
  var unifiedLoading = null;
  // ── Pays des chaînes ──
  var COUNTRY_CODES = { fr: 'fr', fra: 'fr', uk: 'uk', gb: 'uk', en: 'uk', us: 'us', usa: 'us', de: 'de', ger: 'de', es: 'es', spa: 'es', esp: 'es', it: 'it', ita: 'it',
    pt: 'pt', por: 'pt', br: 'br', ar: 'arab', ara: 'arab', nl: 'nl', be: 'be', ch: 'ch', ca: 'ca', au: 'au', tr: 'tr', pl: 'pl', ro: 'ro', ru: 'ru', mx: 'mx',
    gr: 'gr', se: 'se', dk: 'dk', no: 'no', fi: 'fi', hu: 'hu', cz: 'cz', sk: 'sk', rs: 'rs', hr: 'hr', al: 'al', bg: 'bg', ua: 'ua', il: 'il', in: 'in', pk: 'pk',
    za: 'za', ie: 'ie', at: 'at', lat: 'latam', latam: 'latam', ma: 'ma', dz: 'dz', tn: 'tn', qa: 'arab', sa: 'arab', ae: 'arab', eg: 'arab' };
  var COUNTRY_WORDS = { france: 'fr', french: 'fr', francais: 'fr', francaise: 'fr', 'united kingdom': 'uk', england: 'uk', britain: 'uk', usa: 'us', america: 'us',
    germany: 'de', deutschland: 'de', allemagne: 'de', spain: 'es', espana: 'es', espagne: 'es', italy: 'it', italia: 'it', italie: 'it', portugal: 'pt',
    brazil: 'br', brasil: 'br', bresil: 'br', arabic: 'arab', arab: 'arab', arabia: 'arab', mena: 'arab', netherlands: 'nl', holland: 'nl', belgium: 'be', belgique: 'be',
    switzerland: 'ch', suisse: 'ch', canada: 'ca', quebec: 'ca', australia: 'au', turkey: 'tr', turkiye: 'tr', poland: 'pl', polska: 'pl', romania: 'ro', russia: 'ru',
    mexico: 'mx', latino: 'latam', greece: 'gr', sweden: 'se', denmark: 'dk', norway: 'no', finland: 'fi', india: 'in', pakistan: 'pk', ireland: 'ie', austria: 'at',
    maroc: 'ma', morocco: 'ma', algerie: 'dz', algeria: 'dz', tunisie: 'tn', tunisia: 'tn', africa: 'afrique', afrique: 'afrique' };
  var COUNTRY_LABELS = { fr: 'France', uk: 'Royaume-Uni', us: 'États-Unis', de: 'Allemagne', es: 'Espagne', it: 'Italie', pt: 'Portugal', br: 'Brésil', arab: 'Monde arabe',
    nl: 'Pays-Bas', be: 'Belgique', ch: 'Suisse', ca: 'Canada', au: 'Australie', tr: 'Turquie', pl: 'Pologne', ro: 'Roumanie', ru: 'Russie', mx: 'Mexique', latam: 'Amérique latine',
    gr: 'Grèce', se: 'Suède', in: 'Inde', pk: 'Pakistan', ie: 'Irlande', at: 'Autriche', ma: 'Maroc', dz: 'Algérie', tn: 'Tunisie', za: 'Afrique du Sud',
    afrique: 'Afrique francophone', lu: 'Luxembourg', mc: 'Monaco', ht: 'Haïti' };
  // Chaînes françaises connues (reconnues même sans indication de pays).
  var FRENCH_BRANDS = /^(?:bein ?sports? (?:max ?)?(?:[1-9]|10)$|ligue ?1|tf1|tfx|tmc|france ?[2345]|france ?info|franceinfo|france ?24|m6|6ter|w9|arte|c8|cstar|nrj ?12|lcp|public senat|bfm|cnews|lci|gulli|l ?equipe|bfm ?tv|13 ?e?(?:me)? ?rue|ab ?[13]|rtl ?9|nrj ?hits|trace|rmc|cherie 25|canal ?plus|c ?plus|ocs|cine ?plus|paris premiere|teva|m6 music|mcm|game ?one|tiji|piwi|planete ?plus|ushuaia|histoire tv|toute l ?histoire|seasons|chasse ?(?:et|&) ?peche|equidia|infosport|tv5 ?monde|tv ?breizh|serie ?club|13e ?rue|comedie ?plus|polar ?plus|action ?(?:tv)?$|novelas|mangas|j ?one|automoto|kto|i24|b ?smart|bfm ?business|la chaine meteo|eurosport ?[12]? ?france|bein sports? .*france|rmc sport|dazn france|l ?equipe ?tv|olympia|melody|m6 boutique|tf1 series films|franceinfo tv|lcp an|t18|novo19|w ?9|6 ?ter)(?:\s|$)/;
  // Chaînes étrangères souvent rangées parmi les françaises (liste à la main,
  // prioritaire sur tout le reste : Africa 24 est enregistrée « FR » chez iptv-org).
  var FOREIGN_BRANDS = [
    [/^(?:al ?jazeera|al ?arabiya|al ?hadath|sky news arabia|mbc|rotana|dubai|abu dhabi|sharjah|al ?mayadeen|al ?manar|nile|france ?24 arab|bein sports? (?:arabia|mena|news))(?:\s|$)/, 'arab'],
    [/^(?:2m|al ?aoula|arryadia|medi ?1 ?tv|tamazight|assadissa)(?:\s|$)/, 'ma'],
    [/^(?:canal algerie|echorouk|ennahar|el ?bilad|beur ?tv|samira)(?:\s|$)/, 'dz'],
    [/^(?:watania|nessma|hannibal|el ?hiwar|attessia)(?:\s|$)/, 'tn'],
    [/^(?:la une|tipik|la trois|rtl ?tvi|club rtl|plug rtl|ln ?24|bx ?1|rtbf)(?:\s|$)/, 'be'],
    [/^(?:rts ?(?:un|deux|1 suisse)|leman bleu|la tele suisse)(?:\s|$)/, 'ch'],
    [/^(?:tva|tele ?quebec|noovo|lcn|rdi|ici (?:tele|rdi|artv|radio canada)|radio canada|rds|tva sports|canal vie|canal d|series ?plus|super ecran|vrak|yoopa|historia|evasion|unis)(?:\s|$)/, 'ca'],
    [/^(?:africa ?24|africable|a ?plus ?ivoire|trace africa|nollywood|rti ?[12]?|rts ?[12]?(?: senegal)?|ortm|crtv|ortb|rtnc|rtb|canal ?2 ?international|equinoxe|novelas tv afrique|canal plus afrique|life tv|nci|tele congo|rtg|tfm|2stv|sen ?tv|walf|vox africa|love world|kalac|bblack africa)(?:\s|$)/, 'afrique']
  ];
  var foreignIndex = null;
  function foreignCountry(name) {
    var raw = String(name || '');
    // Écriture arabe dans le nom.
    if (/[؀-ۿ]/.test(raw)) return 'arab';
    var brand = brandName(raw);
    for (var i = 0; i < FOREIGN_BRANDS.length; i++) if (FOREIGN_BRANDS[i][0].test(brand)) return FOREIGN_BRANDS[i][1];
    // Chaînes francophones hors de France (tv-data.js, d'après iptv-org).
    if (!foreignIndex) {
      foreignIndex = {};
      var data = (typeof TV_DATA !== 'undefined' && TV_DATA && TV_DATA.foreign) || {};
      Object.keys(data).forEach(function (country) { data[country].split(' ').forEach(function (key) { if (key) foreignIndex[key] = country; }); });
    }
    return foreignIndex[unifiedName(raw)] || '';
  }
  function countryOfCode(value) {
    var code = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
    return COUNTRY_CODES[code] || COUNTRY_WORDS[code] || '';
  }
  function countryOfWords(value) {
    var text = normalize(value);
    if (!text) return '';
    var words = text.split(' ');
    for (var i = 0; i < words.length; i++) {
      if (COUNTRY_WORDS[words[i]]) return COUNTRY_WORDS[words[i]];
      if (i < words.length - 1 && COUNTRY_WORDS[words[i] + ' ' + words[i + 1]]) return COUNTRY_WORDS[words[i] + ' ' + words[i + 1]];
    }
    return '';
  }
  // Pays : champ du fournisseur, « FR: », « [UK] », « … DE », « … France »,
  // identifiant du guide (« TF1.fr »), groupe, langue ; sinon source française.
  // Pays d'une chaîne : calculé une fois par chaîne (règles coûteuses sur un petit processeur).
  function channelCountry(channel) {
    if (channel._cc === undefined) channel._cc = computeCountry(channel);
    return channel._cc;
  }
  function computeCountry(channel) {
    var name = String(channel.name || '');
    // Chaînes francophones d'autres pays (Afrique, Belgique, Québec…) et chaînes
    // arabes, souvent rangées dans les listes « FR » des sources.
    var found = foreignCountry(name);
    if (found) return found;
    // 1. Ce que dit le nom : drapeau (🇫🇷, 🇬🇧…), code en tête (« AR: »), en
    //    fin (« (UK) ») ou pays en toutes lettres (« … Arabia »).
    var flag = /\uD83C([\uDDE6-\uDDFF])\uD83C([\uDDE6-\uDDFF])/.exec(name);
    if (flag) {
      found = countryOfCode(String.fromCharCode(97 + flag[1].charCodeAt(0) - 0xDDE6, 97 + flag[2].charCodeAt(0) - 0xDDE6));
      if (found) return found;
    }
    var prefix = leadingCode(name);
    if (prefix) return prefix.country;
    var suffix = /[\s(\[|\-]([A-Z]{2,3})[)\]]?\s*$/.exec(name);
    if (suffix) { found = countryOfCode(suffix[1]); if (found) return found; }
    var words = normalize(name).split(' ');
    var last = words[words.length - 1];
    if (words.length > 1 && COUNTRY_WORDS[last]) return COUNTRY_WORDS[last];
    // 2. La catégorie où la source range la chaîne (« Arabic », « 🇬🇧 UK »…).
    var group = String(channel.group || '');
    var groupFlag = /\uD83C([\uDDE6-\uDDFF])\uD83C([\uDDE6-\uDDFF])/.exec(group);
    if (groupFlag) {
      found = countryOfCode(String.fromCharCode(97 + groupFlag[1].charCodeAt(0) - 0xDDE6, 97 + groupFlag[2].charCodeAt(0) - 0xDDE6));
      if (found) return found;
    }
    var groupCode = /(?:^|[^A-Za-z])([A-Z]{2,3})(?:[^A-Za-z]|$)/.exec(group);
    found = countryOfWords(group) || (groupCode ? countryOfCode(groupCode[1]) : '');
    if (found) return found;
    // 3. Marque française sans autre indice : française, même si la source ou
    //    le référentiel iptv-org donne le pays du groupe (beIN Sports → Qatar,
    //    Canal+ → Pologne) ; sinon ses serveurs quittaient la chaîne française.
    if (FRENCH_BRANDS.test(brandName(name))) return 'fr';
    // 4. Pays fourni par la source ou le référentiel iptv-org.
    found = countryOfCode(channel.iptvOrgCountry) || countryOfCode(channel.country) || countryOfWords(channel.country);
    if (found) return found;
    var id = /\.([a-z]{2})(?:@|$)/i.exec(String(channel.iptvOrgId || channel.epgId || ''));
    if (id) { found = countryOfCode(id[1]); if (found) return found; }
    if (/^(?:fr|fra|fre|french|francais|français)$/i.test(String(channel.language || '').trim())) return 'fr';
    return '';
  }
  // Code pays en tête du nom : « FR: », « FR| », « [FR] », « (UK) », « FR - », « FR TF1 »…
  function leadingCode(name) {
    // Pays en toutes lettres : « FRANCE: TF1 », « France | TF1 ».
    var word = /^\s*[\[(|]?\s*([A-Za-z]{4,12})\s*[\])|]?\s*[:|\-–]\s*/.exec(String(name || ''));
    if (word && COUNTRY_WORDS[word[1].toLowerCase()]) return { country: COUNTRY_WORDS[word[1].toLowerCase()], length: word[0].length };
    var match = /^\s*[\[(|]?\s*([A-Za-z]{2,3})\s*[\])|]?\s*([^\w\sÀ-ɏ]+|\s)\s*/.exec(String(name || ''));
    if (!match) return null;
    var code = match[1];
    var country = countryOfCode(code);
    // Séparé par une simple espace : code en majuscules seulement (« FR TF1 », pas « RMC Sport »).
    if (!country || (/^\s$/.test(match[2]) && code !== code.toUpperCase())) return null;
    return { country: country, length: match[0].length };
  }
  // « FR: TF1 HD », « [FR] TF1 (backup) », « FR| TF1 ᴴᴰ 🇫🇷 » → « TF1 ».
  // Règles de noms appelées des milliers de fois à chaque chargement : résultats gardés.
  function remembered(fn) {
    var store = {};
    var size = 0;
    return function (value) {
      var key = String(value === undefined || value === null ? '' : value);
      if (Object.prototype.hasOwnProperty.call(store, key)) return store[key];
      if (++size > 40000) { store = {}; size = 1; }
      return (store[key] = fn(key));
    };
  }
  var cleanChannelName = remembered(function (name) {
    var raw = String(name || '')
      .replace(/\uD83C[\uDDE6-\uDDFF]/g, ' ')
      .replace(/[ʰ-˿ᴀ-ᶿ⁰-₟℀-⅏]/g, ' ')
      .replace(/[─-◿☀-➿]/g, ' ');
    // Lettres « stylisées » (𝗧𝗙𝟭, ＴＦ１…) ramenées aux lettres ordinaires.
    try { raw = raw.normalize('NFKC'); } catch (error) { /* moteur ancien */ }
    raw = raw.trim();
    var lead = leadingCode(raw);
    if (lead) raw = raw.slice(lead.length);
    var clean = raw
      .replace(/^\s*(?:\[[^\]]*\]|\([^)]*\))\s*/, '')
      .replace(/^\s*(?:VIP|4K|HD|FHD)\s*[:|\-–]\s*/i, '')
      .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
      // Numéro de lien : « BACKUP 2 », « Lien 3 », « BEIN SPORTS 1 · 2 », « … #2 ».
      .replace(/\b(?:backup|secours|alt|link|lien|source|server|serveur|mirror|option)\s*\d{1,2}\b/gi, ' ')
      .replace(/(\d)\s*(?:[·|•#–]|\s-)\s*\d{1,2}\s*$/, '$1')
      .replace(/\s#\d{1,2}\s*$/, ' ')
      .replace(/\b(?:UHD|FHD|FULL ?HD|HD|SD|4K|HEVC|H\.?265|1080[pi]?|720p|50 ?fps|backup|secours|raw|vip|multi ?audio)\b/gi, ' ')
      // Variantes LiveWatch : « TF1 · BASIC », « beIN SPORTS 1 · SAT · HD », « … · Flux 2 ».
      .replace(/(?:\s*·\s*(?:[A-Z0-9][A-Z0-9 +]{0,17}|Flux\s*\d+|Serveur\s*\d+|Variante\s+\S+)?)+\s*$/, '')
      .replace(/[|•·▎┃]+/g, ' ')
      // « CANAL + SPORT » = « Canal+ Sport » (le « + » détaché des marques connues).
      .replace(/(^|\s)(canal|c|cin[eé]|plan[eè]te|golf|piwi|teletoon|polar|com[eé]die|infosport|ligue 1)\s+\+(?=\s|$)/gi, '$1$2+')
      .replace(/(^|\s)\++(?=\s|$)/g, ' ')
      // Variantes d'une même chaîne dans certaines listes : « BEIN SPORTS 1 .b », « .c », « .s »…
      .replace(/\s+\.[A-Za-z0-9]{1,3}(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return clean || String(name || '').trim();
  });
  var brandName = remembered(function (name) {
    return normalize(cleanChannelName(name).replace(/\+/g, ' plus ')).replace(/\s+(?:france|fr|fra)$/, '').trim();
  });
  // Nom de rapprochement, tolérant aux écritures des sources :
  // « beIN Sport 1 » = « BEIN SPORTS 1 » = « beIN Sports 1 France »,
  // « BFM TV » = « BFMTV », « 13ème Rue » = « 13e rue », « C+ Sport » = « Canal+ Sport ».
  // Mots sans importance pour reconnaître une chaîne (qualité, variante, lien…).
  var NOISE_WORDS = { channel: 1, live: 1, direct: 1, officiel: 1, official: 1, hq: 1, lq: 1, h264: 1, h265: 1, x264: 1, x265: 1, fps: 1, '60fps': 1, '50fps': 1,
    '1080': 1, '1080p': 1, '720': 1, '720p': 1, '2160p': 1, premium: 1, multi: 1, audio: 1, vf: 1, vff: 1, vostfr: 1, stream: 1, server: 1, serveur: 1, source: 1,
    link: 1, lien: 1, alt: 1, backup: 1, secours: 1, mirror: 1, hevc: 1, uhd: 1, fhd: 1, hd: 1, sd: 1, '4k': 1, '8k': 1, tnt: 1 };
  // Anciens noms et écritures courantes → un seul nom.
  var NAME_ALIASES = { hd1: 'tf1seriesfilms', tf1seriefilm: 'tf1seriesfilms', nt1: 'tfx', numero23: 'rmcstory', d8: 'c8', d17: 'cstar', itele: 'cnews',
    lequipe21: 'lequipe', lequipetv: 'lequipe', franceinfotv: 'franceinfo', lcpan: 'lcp', lcpassembleenationale: 'lcp', artefrance: 'arte',
    canal: 'canalplus', canalplusfrance: 'canalplus', eurosport: 'eurosport1', beinsport: 'beinsport1', rmcsport: 'rmcsport1', tv5: 'tv5monde', france24fr: 'france24',
    // Abréviations, noms longs et anciens noms vus dans les listes.
    tf1sf: 'tf1seriesfilms', tcm: 'tcmcinema', canalplusfamily: 'canalpluskids', cineplusfamiz: 'cineplusfamily', cineplusclassique: 'cineplusclassic',
    cinepremier: 'cinepluspremier', natgeo: 'nationalgeographic', natgeowild: 'nationalgeographicwild', france3national: 'france3', okoofrance4: 'france4',
    canalplusfootball: 'canalplusfoot', canalplusdocumentaires: 'canalplusdocs', automotolachaine: 'automoto', lachaineinfo: 'lci',
    lachaineparlementaire: 'lcp', tv5mondefbs: 'tv5monde', tv5mondefrancebelgiquesuisse: 'tv5monde', disneyjr: 'disneyjunior', l1plus: 'ligue1plus',
    bfmgrandparis: 'bfmparis', i24newsfrancais: 'i24news' };
  var unifiedName = remembered(function (name) {
    var words = brandName(name).replace(/^la chaine (?=l ?equipe)/, '').split(' ').filter(Boolean).map(function (word, index) {
      if (word === 'sports') return 'sport';
      if (NOISE_WORDS[word]) return '';
      // « Chasse & Pêche » = « Chasse et Pêche », « Science & Vie » = « Science and Vie ».
      if (index && (word === 'et' || word === 'and')) return '';
      return word.replace(/^(\d+)(?:eme|e|er|ere)$/, '$1');
    }).filter(Boolean);
    if (words.length > 1 && words[words.length - 1] === 'tv') words.pop();
    // Lettre de variante après un numéro (« BEIN SPORTS 1 S »).
    if (words.length > 2 && /^[a-z]$/.test(words[words.length - 1]) && /^\d+$/.test(words[words.length - 2])) words.pop();
    var key = words.join('');
    if (key.length > 4 && /tv$/.test(key) && !/^(?:tv|mtv|btv)/.test(key)) key = key.slice(0, -2);
    key = key.replace(/^cplus/, 'canalplus').replace(/^beinsports?/, 'beinsport').replace(/^bein(?=max\d|\d)/, 'beinsport');
    // « OCS Ciné+ Frisson » : ancien nom des chaînes Ciné+.
    key = key.replace(/^ocs(?=cineplus)/, '');
    return NAME_ALIASES[key] || key;
  });
  // Clé de rapprochement : même nom et même pays (« DE: Eurosport 1 » n'est
  // pas la version française) ; une chaîne sans pays connu rejoint la française.
  function unifiedKey(name, country) {
    var base = unifiedName(name);
    if (country && country !== 'fr') {
      var words = normalize(cleanChannelName(name)).split(' ');
      var last = words[words.length - 1];
      if (words.length > 1 && (COUNTRY_CODES[last] || COUNTRY_WORDS[last])) base = unifiedName(words.slice(0, -1).join(' '));
      return country + ':' + base;
    }
    return base;
  }
  function playable(channel) {
    return Boolean((channel.playbackType === 'stream' && channel.streamUrl) || channel.resolverUrl || channel.embedUrl || channel.externalUrl || channel.vipFallbackUrl);
  }
  // Événements (matchs du jour) : pas des chaînes. Les catalogues de chaînes
  // (LiveWatch, NorthTV, FrameTV, Daddy TV…) donnent parfois une date ou un
  // identifiant à leurs chaînes : seules les sources sport sont jugées sur ces
  // champs, les autres seulement sur un vrai match (« A vs B »).
  function isEvent(channel, source) {
    var match = Boolean(channel.homeName && channel.awayName) || /\s(?:vs\.?|v\.?|contre)\s/i.test(channel.name);
    if (source && source.section && source.section !== 'sports') return match;
    return Boolean(match || channel.eventId || channel.startTime || /\s[x×]\s/i.test(channel.name) || /\b\d{1,2}[:h]\d{2}\b/.test(channel.name));
  }
  // Identité iptv-org (« BeINSports1.fr ») : même chaîne quel que soit son nom.
  function iptvKey(channel) {
    var id = String(channel.iptvOrgId || '').toLowerCase().replace(/@.*$/, '').trim();
    return id ? 'id:' + id : '';
  }
  // ── Numéros de chaînes ──
  // Chaînes françaises : numéros habituels de la TNT (1 TF1, 2 France 2…
  // 27 franceinfo), puis 30, 31… pour les autres ; ailleurs 1, 2, 3… Les
  // numéros ne changent pas avec la catégorie ou la recherche, et les touches
  // chiffrées de la télécommande les utilisent pendant la lecture.
  var TNT_NUMBERS = { tf1: 1, france2: 2, france3: 3, canalplus: 4, france5: 5, m6: 6, arte: 7, c8: 8, w9: 9, tmc: 10, tfx: 11, nrj12: 12,
    lcp: 13, lcppublicsenat: 13, publicsenat: 13, france4: 14, bfm: 15, cnews: 16, cstar: 17, gulli: 18, tf1seriesfilms: 20, lequipe: 21, '6ter': 22,
    rmcstory: 23, rmcdecouverte: 24, cherie25: 25, lci: 26, franceinfo: 27, t18: 28, novo19: 29 };
  function tntNumber(channel) {
    if (TNT_NUMBERS[channel._key]) return TNT_NUMBERS[channel._key];
    var entries = channel._entries || [];
    for (var i = 0; i < entries.length; i++) if (TNT_NUMBERS[entries[i].nameKey]) return TNT_NUMBERS[entries[i].nameKey];
    return TNT_NUMBERS[unifiedName(channel.name)] || 0;
  }
  function numberChannels(channels, french) {
    var list = channels.slice();
    if (french) {
      var used = {};
      list.forEach(function (channel) {
        var number = tntNumber(channel);
        channel._lcn = number && !used[number] ? number : 0;
        if (channel._lcn) used[number] = true;
      });
      list.sort(function (a, b) { return (a._lcn || 1000) - (b._lcn || 1000); });
      var next = 30;
      list.forEach(function (channel) { if (!channel._lcn) channel._lcn = next++; });
    } else {
      list.forEach(function (channel, index) { channel._lcn = index + 1; });
    }
    return list;
  }
  // ── Catégories de « TV en direct » ──
  // Les catégories des sources (« FR| FRANCE TV », « Haloule section 1.1 »…)
  // sont remplacées par quelques catégories claires, d'après le nom de la
  // chaîne, puis ses catégories dans les sources.
  var CATEGORIES = [
    ['Sport', /\bsports?\b|^(?:bein|rmc sport|eurosport|l ?equipe|dazn|ligue 1|golf|infosport|equidia|automoto|multisports|canal plus (?:foot|ligue|top|moto|formula|f1|premier|rugby)|foot|nba|nfl|ufc|f1|motors?v|tennis|trace sport|olympia|sport en france|premier sports|team ?tv|ol tv)|\b(?:foot|football|rugby|tennis|golf|racing|fight)\b/],
    ['Info', /^(?:bfm ?(?:tv|business)?|c ?news|europe ?1|la chaine meteo|b ?smart|rt$|lci|france ?info|franceinfo|france ?24|euronews|i24|lcp|public senat|tv5 ?monde info|rt france|africanews|bloomberg|cnn|bbc (?:world )?news|sky news|al jazeera|monaco info)(?:\s|$)|\b(?:news|info|infos)$/],
    ['Jeunesse', /^(?:disney|nickelodeon|nick|gulli|tiji|piwi|canal j|boomerang|cartoon|cartoonito|boing|teletoon|mangas|j ?one|game ?one|mgg|nolife|baby ?tv|duck ?tv|pitchoun|toonami|kids|mon nickelodeon)|\b(?:kids|junior|jr|jeunesse|enfants?|toons?)\b/],
    ['Cinéma', /^(?:cine ?plus|ocs|tcm|paramount|action|canal plus (?:cinemas?|box office|grand ecran|premier|decale)|tf1 series films|drive in|dreamsee|altice studio|film|movies?)|\b(?:cinemas?|cine|movies?|films?)\b/],
    ['Séries', /^(?:13 ?e?(?:me)? ?rue|syfy|warner|polar ?plus|comedie ?plus|novelas|crime district|serie club|ab ?1|rtl ?9|teva|canal plus series|elle girl|e ?!|comedy central|mtv|abxplore|tv breizh)|\bseries?\b/],
    ['Découverte', /^(?:planete|ushuaia|histoire|toute l ?histoire|national geographic|nat ?geo|discovery|animaux|science|trek|chasse|seasons|rmc decouverte|museum|ultra nature|love nature|canal plus docs|culturebox|crime ?\+? ?investigation|investigation discovery|explore)|\b(?:docs?|documentaires?|decouverte|nature|histoire|voyage)\b/],
    ['Musique', /^(?:mcm|nrj hits|trace|m6 music|melody|mezzo|rfm|stingray|mtv (?:hits|live)|clubbing|bet|cstar hits|europe 2|djazz|brava)|\b(?:music|musique|hits|radio)\b/],
    ['Généralistes', /^(?:tf1|france ?[2-5]|m6|arte|c8|w9|tmc|tfx|nrj ?12|c ?star|ab ?3|6 ?ter|rmc story|rmc life|cherie 25|paris premiere|canal plus|c ?plus|t18|novo ?19|l ?equipe|gulli|france ?3 .+|tv5 ?monde|kto|rtl|lci)(?:\s|$)/]
  ];
  var CATEGORY_ORDER = ['Généralistes', 'Info', 'Sport', 'Cinéma', 'Séries', 'Jeunesse', 'Découverte', 'Musique', 'Autres'];
  function channelCategory(channel) {
    var name = brandName(channel.iptvOrgName || channel.name);
    var i;
    for (i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i][1].test(name)) return CATEGORIES[i][0];
    // Catégories des sources (« Sport FR », « Cinéma », « Kids »…).
    var groups = Object.keys(channel._groups || {}).concat(channel.group ? [channel.group] : []).map(normalize);
    var rules = [['Sport', /\bsports?\b|foot|ligue|match/], ['Info', /\b(?:info|infos|news|actualite)/], ['Jeunesse', /kids|enfant|jeunesse|junior|cartoon|dessin/],
      ['Cinéma', /cinema|cine|film|movie/], ['Séries', /\bseries?\b/], ['Découverte', /docu|decouverte|nature|histoire/], ['Musique', /music|musique/],
      ['Généralistes', /general|tnt/]];
    for (i = 0; i < rules.length; i++) {
      for (var g = 0; g < groups.length; g++) if (rules[i][1].test(groups[g])) return rules[i][0];
    }
    return 'Autres';
  }
  // Deux mots égaux à une lettre près (ajoutée, retirée, remplacée ou inversée).
  function oneEdit(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0;
    while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) i++;
    if (a.length === b.length) {
      // Remplacée, ou deux lettres inversées (« premeir »).
      return a.slice(i + 1) === b.slice(i + 1) || (a.charAt(i) === b.charAt(i + 1) && a.charAt(i + 1) === b.charAt(i) && a.slice(i + 2) === b.slice(i + 2));
    }
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }
  // Chaîne réunie « unified » ajoutée à « twin » (sources, catégories, logo, guide).
  function absorb(twin, unified) {
    unified._entries.forEach(function (entry) { twin._entries.push(entry); });
    Object.keys(unified._groups).forEach(function (group) { twin._groups[group] = (twin._groups[group] || 0) + unified._groups[group]; });
    if (!twin.logo) twin.logo = unified.logo;
    if (!twin.iptvOrgId && unified.iptvOrgId) twin.iptvOrgId = unified.iptvOrgId;
    if (!twin.epgId && unified.epgId) twin.epgId = unified.epgId;
    if (!twin.now && unified.now) { twin.now = unified.now; twin.next = unified.next; }
    if (!twin.country) twin.country = unified.country;
    if (unified.isLive) twin.isLive = true;
  }
  function mergeChannels(loaded) {
    var byKey = {};
    var list = [];
    // 1. Liens nom ↔ identité iptv-org : les variantes de nom d'une même chaîne
    //    identifiée se rejoignent (ex. « BEIN SPORTS 1 .b » et « beIN Sports 1 France »).
    var parent = {};
    function root(key) {
      while (parent[key] && parent[key] !== key) key = parent[key] = parent[parent[key]] || parent[key];
      return key;
    }
    function union(a, b) {
      var ra = root(a), rb = root(b);
      if (!parent[ra]) parent[ra] = ra;
      if (!parent[rb]) parent[rb] = rb;
      if (ra !== rb) parent[rb] = ra;
    }
    var prepared = [];
    loaded.forEach(function (part) {
      part.channels.forEach(function (channel) {
        if (!channel || !channel.name || !playable(channel) || isEvent(channel, part.source)) return;
        var country = channelCountry(channel);
        var nameKey = unifiedKey(channel.name, country) || normalize(channel.name);
        var idKey = iptvKey(channel);
        if (!parent[nameKey]) parent[nameKey] = nameKey;
        if (idKey) {
          var idCountry = countryOfCode((/\.([a-z]{2})$/.exec(idKey) || [])[1]);
          // Jamais de lien entre pays différents (la version étrangère reste à part).
          if (!idCountry || idCountry === (country || 'fr')) union(idKey, nameKey);
        }
        prepared.push({ channel: channel, source: part.source, country: country, nameKey: nameKey, part: part });
      });
    });
    prepared.forEach(function (item) {
        var channel = item.channel;
        var country = item.country;
        var key = root(item.nameKey);
        var unified = byKey[key];
        if (!unified) {
          var display = channel.iptvOrgName ? String(channel.iptvOrgName) : cleanChannelName(channel.name);
          if (country && country.length === 2 && country !== 'fr' && !countryOfWords(display) && !/\s[A-Z]{2,3}$/.test(display)) display += ' ' + country.toUpperCase();
          unified = byKey[key] = { name: display, logo: channel.logo || '', group: '', _groups: {}, _entries: [], _key: key, country: country };
          list.push(unified);
        }
        if (!unified.country && country) unified.country = country;
        // Nom affiché : l'écriture la plus soignée (« beIN Sports 1 » plutôt que « BEIN SPORTS 1 »).
        var candidate = cleanChannelName(channel.name);
        if (!unified._official && unified.name === unified.name.toUpperCase() && candidate !== candidate.toUpperCase() && !(country && country !== 'fr')) unified.name = candidate;
        // Nom officiel iptv-org quand une des sources en fournit un.
        if (channel.iptvOrgName && !unified._official && !(country && country !== 'fr')) { unified.name = String(channel.iptvOrgName); unified._official = true; }
        unified._entries.push({ channel: channel, source: item.source, nameKey: item.nameKey, key: item.part.key, stale: Boolean(item.part.stale) });
        if (!unified.logo && channel.logo) unified.logo = channel.logo;
        if (!unified.iptvOrgId && channel.iptvOrgId) unified.iptvOrgId = channel.iptvOrgId;
        if (!unified.epgId && channel.epgId) unified.epgId = channel.epgId;
        if (!unified.now && channel.now && channel.now.title) { unified.now = channel.now; unified.next = channel.next; }
        if (channel.isLive) unified.isLive = true;
        if (channel.group) unified._groups[channel.group] = (unified._groups[channel.group] || 0) + 1;
    });
    // Même chaîne, mots dans un autre ordre (« Sport 360 Canal+ ») : réunies aussi.
    var byWords = {};
    list = list.filter(function (unified) {
      var parts = unified._key.split(':');
      var country = parts.length > 1 ? parts[0] + ':' : '';
      // Mots triés, nombres dans leur ordre (« France 2 3 » ≠ « France 3 2 »).
      var words = brandName(unified._entries[0].channel.name).split(' ').filter(function (word) { return word && !NOISE_WORDS[word]; })
        .map(function (word) { return word === 'sports' ? 'sport' : word; });
      var tokens = words.filter(function (word) { return !/^\d+$/.test(word); }).sort().join(' ') + '|' + words.filter(function (word) { return /^\d+$/.test(word); }).join(' ');
      if (tokens === '|') return true;
      var twin = byWords[country + tokens];
      if (!twin) { byWords[country + tokens] = unified; return true; }
      absorb(twin, unified);
      return false;
    });
    // Même chaîne à une lettre près (faute de frappe d'une source :
    // « Cinéplus Premeir ») : noms d'au moins 9 lettres, mêmes numéros.
    var buckets = {};
    list = list.filter(function (unified) {
      var parts = unified._key.split(':');
      var key = parts[parts.length - 1];
      if (key.replace(/\d/g, '').length < 9) return true;
      var bucket = (parts.length > 1 ? parts[0] : '') + '|' + key.replace(/\D/g, '') + '|' + key.slice(0, 2);
      var others = buckets[bucket] = buckets[bucket] || [];
      var letters = key.replace(/\d/g, '');
      for (var i = 0; i < others.length; i++) {
        if (oneEdit(others[i].letters, letters)) { absorb(others[i].unified, unified); return false; }
      }
      others.push({ unified: unified, letters: letters });
      return true;
    });
    list.forEach(function (unified) {
      // Nom affiché (chaîne française) : l'écriture la plus soignée et la plus
      // courante des sources (« beIN SPORTS 1 » plutôt que « bein sports 1 France »).
      if (!unified._official && (!unified.country || unified.country === 'fr')) {
        var scores = {};
        var seen = {};
        var keyDigits = unified._key.replace(/\D/g, '');
        unified._entries.forEach(function (entry) {
          var name = cleanChannelName(entry.channel.name);
          if (!name) return;
          if (scores[name] === undefined) {
            var letters = name.replace(/[^A-Za-zÀ-ÿ]/g, '');
            scores[name] = (letters && letters !== letters.toUpperCase() && letters !== letters.toLowerCase() ? 3 : letters === letters.toUpperCase() ? 1 : 0)
              - (/\s(?:france|fr|fra|french)$/i.test(name) ? 2 : 0)
              - (name.replace(/\D/g, '') !== keyDigits ? 2 : 0)
              + (/[A-Za-zÀ-ÿ+]\s\d/.test(name) ? 0.5 : 0) - name.length / 60;
            seen[name] = 0;
          }
          // Écriture la plus répandue : léger avantage.
          if (++seen[name] <= 3) scores[name] += 0.3;
        });
        var best = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a]; })[0];
        if (best) unified.name = best;
      }
      var groups = Object.keys(unified._groups);
      groups.sort(function (a, b) { return unified._groups[b] - unified._groups[a]; });
      unified.group = groups[0] || '';
      var names = [];
      unified._entries.forEach(function (entry) { if (names.indexOf(entry.source.name) < 0) names.push(entry.source.name); });
      unified._sources = names;
      unified.provider = names.length > 2 ? names.length + ' sources' : names.join(' · ');
      unified.category = channelCategory(unified);
    });
    // Ordre alphabétique (clé calculée une fois : localeCompare est très lent sur les TV).
    list.forEach(function (unified) { unified._sort = normalize(unified.name); });
    list.sort(function (a, b) { return a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0; });
    // Chaîne d'une source → sa chaîne réunie (serveurs des autres sources).
    var byName = {};
    list.forEach(function (unified) { unified._entries.forEach(function (entry) { if (entry.nameKey && !byName[entry.nameKey]) byName[entry.nameKey] = unified; }); });
    list._byName = byName;
    return list;
  }
  // Même chaîne dans les autres sources (catalogue réuni déjà chargé) : ou null.
  function unifiedTwin(channel) {
    if (!unifiedCache || !unifiedCache.data || !unifiedCache.data.channels._byName) return null;
    var key = unifiedKey(channel.name, channelCountry(channel)) || normalize(channel.name);
    var twin = unifiedCache.data.channels._byName[key];
    return twin && twin._sources && twin._sources.length > 1 ? twin : null;
  }
  // ── Catalogues gardés sur le téléviseur (IndexedDB) ──
  // À l'ouverture, « TV en direct » s'affiche tout de suite avec les catalogues
  // de la dernière fois, puis se met à jour en arrière-plan sans perdre la
  // place de la télécommande. Les liens des chaînes sont renouvelés au lancement.
  var STORE_MAX_AGE = 3 * 86400000;
  var storeDb = null;
  function catalogStore() {
    if (storeDb) return storeDb;
    storeDb = new Promise(function (resolve) {
      try {
        var open = indexedDB.open('noctra-tv', 1);
        open.onupgradeneeded = function () { open.result.createObjectStore('catalogs'); };
        open.onsuccess = function () { resolve(open.result); };
        open.onerror = function () { resolve(null); };
      } catch (error) { resolve(null); }
    });
    return storeDb;
  }
  function storeCatalog(key, value) {
    catalogStore().then(function (db) {
      if (!db) return;
      try { db.transaction('catalogs', 'readwrite').objectStore('catalogs').put(value, key); } catch (error) { /* stockage plein */ }
    });
  }
  function storedCatalogs() {
    return catalogStore().then(function (db) {
      if (!db) return {};
      return new Promise(function (resolve) {
        var all = {};
        try {
          var request = db.transaction('catalogs', 'readonly').objectStore('catalogs').openCursor();
          request.onsuccess = function () {
            var cursor = request.result;
            if (!cursor) { resolve(all); return; }
            if (cursor.value && Date.now() - cursor.value.at < STORE_MAX_AGE) all[cursor.key] = cursor.value;
            cursor.continue();
          };
          request.onerror = function () { resolve(all); };
        } catch (error) { resolve(all); }
      });
    });
  }
  // Mise à jour de la liste affichée (vue « TV en direct » ouverte).
  var unifiedListeners = [];
  function unifiedChanged(data) {
    unifiedListeners = unifiedListeners.filter(function (listener) { return listener(data) !== false; });
  }
  // Catalogues de toutes les sources (et de leurs bouquets), 6 à la fois ;
  // un catalogue en échec est redemandé une fois. Sans catalogues gardés, la
  // liste s'affiche au bout de 12 s avec ceux déjà reçus et se complète seule.
  // Gardée 10 min en mémoire.
  var UNIFIED_WAIT_MS = 12000;
  var catalogRefresh = {};
  function fetchUnified(sources, onProgress, onPart) {
    var results = [];
    var failed = [];
    var queue = [];
    var total = 0;
    var done = 0;
    var running = 0;
    function enqueue(source, ref, title, retry) {
      queue.push({ source: source, ref: ref || '', title: title || '', index: total++, retry: retry || 0 });
    }
    sources.forEach(function (source) { enqueue(source); });
    function build() {
      var parts = results.filter(Boolean);
      var channels = mergeChannels(parts);
      // Apport de chaque source (chaînes gardées, bouquets compris) et sources encore attendues.
      var counts = {};
      parts.forEach(function (part) {
        var kept = part.channels.filter(function (channel) { return channel && channel.name && playable(channel) && !isEvent(channel, part.source); }).length;
        counts[part.source.name] = (counts[part.source.name] || 0) + kept;
      });
      var pending = sources.filter(function (source) { return counts[source.name] === undefined && failed.indexOf(source.name) < 0; }).map(function (source) { return source.name; });
      return { channels: channels, count: channels.length, coverage: counts, pending: pending, failedSources: failed.slice() };
    }
    var finished = new Promise(function (resolve) {
      function pump() {
        if (!queue.length && !running) { resolve(); return; }
        while (running < 6 && queue.length) {
          (function (job) {
            running++;
            var key = job.ref ? 'tv-ref:' + job.ref : 'tv:' + job.source.id;
            var request = catalogRefresh[key] = loadCatalog(job.source, job.ref, job.title, true);
            request.then(function (data) {
              results[job.index] = { source: job.source, channels: (data && data.channels) || [], key: key };
              storeCatalog(key, { at: Date.now(), sourceId: job.source.id, ref: job.ref, title: job.title, data: data });
              if (onPart) onPart(key, data);
              // Source en bouquets : les chaînes de chaque bouquet (60 au plus).
              ((data && data.groups) || []).filter(function (group) { return group && group.ref; }).slice(0, 60)
                .forEach(function (group) { enqueue(job.source, group.ref, group.name); });
            }, function () {
              // Nouvel essai un peu plus tard (serveur ou source momentanément lents).
              if (!job.retry) { queue.push({ source: job.source, ref: job.ref, title: job.title, index: job.index, retry: 1 }); total++; }
              else if (!job.ref) failed.push(job.source.name);
            }).then(function () {
              running--;
              done++;
              if (onProgress) { try { onProgress(done, total); } catch (error) { /* affichage */ } }
              pump();
            });
          })(queue.shift());
        }
      }
      pump();
    });
    return { finished: finished.then(function () {
      var data = build();
      if (failed.length) data.warning = 'Sources indisponibles pour le moment : ' + failed.join(', ') + '.';
      return data;
    }), build: build };
  }
  function loadUnified(onProgress) {
    if (unifiedCache && Date.now() - unifiedCache.at < 600000) return Promise.resolve(unifiedCache.data);
    if (unifiedLoading) return unifiedLoading;
    unifiedLoading = Promise.all([sourcesList(), storedCatalogs()]).then(function (results) {
      var sources = results[0];
      var stored = results[1];
      catalogRefresh = {};
      var run = fetchUnified(sources, onProgress);
      var ids = {};
      sources.forEach(function (source) { ids[source.id] = source; });
      // Catalogues gardés : ceux des sources encore configurées.
      var parts = [];
      Object.keys(stored).forEach(function (key) {
        var item = stored[key];
        var source = ids[item.sourceId];
        if (source && item.data) parts.push({ source: source, channels: item.data.channels || [], key: key, stale: true });
      });
      run.finished.then(function (data) {
        unifiedCache = { at: Date.now(), data: data };
        unifiedChanged(data);
      });
      if (parts.length) {
        var channels = mergeChannels(parts);
        var counts = {};
        parts.forEach(function (part) { counts[part.source.name] = (counts[part.source.name] || 0) + part.channels.length; });
        var quick = { channels: channels, count: channels.length, coverage: counts, pending: [], failedSources: [], stale: true };
        unifiedCache = { at: 0, data: quick };
        return quick;
      }
      var deadline = new Promise(function (resolve) { setTimeout(function () { resolve('late'); }, UNIFIED_WAIT_MS); });
      return Promise.race([run.finished, deadline]).then(function (data) {
        if (data !== 'late') return data;
        var partial = run.build();
        partial.warning = 'Certaines sources répondent lentement : la liste se complète toute seule.';
        partial.partial = true;
        return partial;
      });
    });
    unifiedLoading.then(function () { unifiedLoading = null; }, function () { unifiedLoading = null; });
    return unifiedLoading;
  }
  // Chaîne d'un catalogue gardé : version à jour (liens neufs) si le
  // catalogue du moment arrive vite (3 s au plus), sinon celle gardée.
  function freshChannel(entry) {
    if (!entry.stale) return Promise.resolve(entry.channel);
    var request = catalogRefresh[entry.key];
    if (!request) return Promise.resolve(entry.channel);
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 3000); });
    return Promise.race([request.then(function (data) { return data; }, function () { return null; }), timeout]).then(function (data) {
      var list = (data && data.channels) || [];
      var name = entry.channel.name;
      return list.filter(function (channel) { return channel && channel.name === name; })[0] || entry.channel;
    });
  }
  // Serveurs d'une chaîne réunie : ceux de chaque source, préfixés du nom de
  // la source ; les serveurs « automatiques » ne sont demandés qu'au lancement.
  function unifiedOptions(channel) {
    // Plusieurs variantes d'une même source (« .b », « .c »…) : nom de source distinct pour chacune.
    var perSource = {};
    channel._entries.forEach(function (entry) { perSource[entry.source.name] = (perSource[entry.source.name] || 0) + 1; });
    var seen = {};
    return Promise.all(channel._entries.map(function (entry) {
      var sourceLabel = entry.source.name;
      if (perSource[entry.source.name] > 1) {
        var variant = /\.([A-Za-z0-9]{1,3})\s*$/.exec(String(entry.channel.name || '').trim());
        if (variant) sourceLabel += ' · variante ' + variant[1].toLowerCase();
        else {
          seen[entry.source.name] = (seen[entry.source.name] || 0) + 1;
          if (seen[entry.source.name] > 1) sourceLabel += ' · ' + seen[entry.source.name];
        }
      }
      // Catalogue gardé sur le téléviseur : liens renouvelés avant le lancement.
      return freshChannel(entry).then(function (channel) {
        return channel.resolverUrl && !(channel.playbackType === 'stream' && channel.streamUrl) && !liveWatchOfficial(channel, entry.source)
          ? [{ playbackType: 'resolver', resolveUrl: channel.resolverUrl, label: 'serveurs' }]
          : channelOptions(channel, entry.source);
      }).then(function (options) {
        return options.map(function (option) {
          var copy = {};
          Object.keys(option).forEach(function (key) { copy[key] = option[key]; });
          copy._prefix = sourceLabel;
          copy.label = sourceLabel + (option.label && option.label !== 'serveurs' ? ' · ' + option.label : optionKind(option) === 'resolve' ? ' · automatique' : '');
          copy.provider = option.provider || entry.channel.provider || entry.source.name;
          if (!copy.transport && entry.channel.transport) copy.transport = entry.channel.transport;
          if (entry.channel.noSandbox) copy.noSandbox = true;
          if (entry.channel.liveWatchDocsEmbed && !copy.referrer) copy.referrer = 'no-referrer';
          return copy;
        });
      }, function () { return []; });
    })).then(function (lists) {
      return lists.reduce(function (all, list) { return all.concat(list); }, []);
    });
  }
  // Chaîne réunie : les serveurs « automatiques » de chaque source sont
  // demandés tout de suite (2,5 s au plus chacun, la fenêtre s'ouvre sans les
  // attendre davantage) ; un serveur qui ne répond pas à temps reste proposé
  // et sera résolu puis testé pendant le compte à rebours.
  function expandOptions(options) {
    return Promise.all(options.map(function (option) {
      if (optionKind(option) !== 'resolve') return Promise.resolve([option]);
      var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 2500); });
      return Promise.race([resolveOptions(option.resolveUrl).then(function (list) { return list; }, function () { return null; }), timeout]).then(function (list) {
        if (!list || !list.length) return [option];
        return list.map(function (item) {
          item.renewUrl = option.resolveUrl;
          if (!item.label) item.label = option.label;
          return inheritSource(item, option);
        });
      });
    })).then(function (lists) { return lists.reduce(function (all, list) { return all.concat(list); }, []); });
  }
  function serverList(channel, source, key) {
    // Chaîne ouverte depuis une source : ses serveurs et ceux des autres sources
    // qui la proposent, le plus fiable en premier.
    var twin = !channel._entries && source && source.id !== ALL_SOURCE.id ? unifiedTwin(channel) : null;
    var target = twin || channel;
    return channelOptions(target, source).then(function (options) {
      return target._entries ? expandOptions(options) : options;
    }).then(function (options) { return rankOptions(options, key, channel.provider); });
  }
  // Serveurs obtenus d'un serveur « automatique » d'une source réunie : même préfixe.
  function inheritSource(item, parent) {
    if (!parent || !parent._prefix) return item;
    item._prefix = parent._prefix;
    if (!item.provider) item.provider = parent.provider;
    if (!item.transport && parent.transport) item.transport = parent.transport;
    var label = item.label || '';
    if (label.indexOf(parent._prefix + ' · ') !== 0) item.label = parent._prefix + ' · ' + (label || 'Serveur');
    return item;
  }

  // Favori ou chaîne récente : source, puis chaîne retrouvée par son nom.
  function openStoredChannel(entry) {
    toast('Ouverture de ' + entry.name + '…');
    if (entry.sourceId === ALL_SOURCE.id) {
      loadUnified().then(function (data) {
        var wanted = normalize(entry.name);
        var found = data.channels.filter(function (channel) { return normalize(channel.name) === wanted; })[0];
        if (!found) { toast(entry.name + ' n’est plus proposée par les sources.', true); return; }
        launchChannel(found, ALL_SOURCE, data.channels, {});
      }).catch(function (error) { toast(error.message || 'Chaîne indisponible.', true); });
      return;
    }
    sourcesList().then(function (sources) {
      var source = sources.filter(function (item) { return item.id === entry.sourceId; })[0];
      if (!source) throw new Error('La source « ' + (entry.sourceName || entry.sourceId) + ' » n’existe plus sur le serveur.');
      return loadCatalog(source, entry.ref, entry.refTitle).then(function (data) {
        var channels = (data && data.channels) || [];
        var wanted = normalize(entry.name);
        var found = channels.filter(function (channel) {
          return normalize(channel.name) === wanted && (!entry.provider || !channel.provider || normalize(channel.provider) === normalize(entry.provider));
        })[0] || channels.filter(function (channel) { return normalize(channel.name) === wanted; })[0];
        if (!found) {
          toast(entry.name + ' n’est plus proposée par ' + source.name + ' : voici ses chaînes.', true);
          go('liveSource', { section: 'live', source: source, ref: entry.ref, title: entry.refTitle || undefined });
          return;
        }
        launchChannel(found, source, channels, { ref: entry.ref, title: entry.refTitle });
      });
    }).catch(function (error) { toast(error.message || 'Chaîne indisponible.', true); });
  }

  var sourceSectionInfo = {
    channels: { icon: 'antenna', text: 'Chaînes françaises et internationales' },
    sports: { icon: 'trophy', text: 'Matchs et événements en direct' },
    personal: { icon: 'library', text: 'Listes M3U et sources ajoutées sur le serveur' },
    all: { icon: 'live', text: '' }
  };
  function sourceTile(source, sectionId) {
    var info = sourceSectionInfo[sectionId] || { icon: 'live' };
    var favorites = storedChannels(FAVORITES_KEY).filter(function (item) { return item.sourceId === source.id; }).length;
    return h('button', { class: 'tile source-tile f' + (source === ALL_SOURCE ? ' all-tile' : ''), onclick: function () { go('liveSource', { section: 'live', source: source }); } },
      h('span', { class: 'tile-icon' }, icon(info.icon)),
      h('span', { class: 'tile-text' },
        h('strong', { text: source.name }),
        h('span', { class: 'desc', text: source.description || source.provider || '' }),
        favorites ? h('span', { class: 'tile-tag', text: '★ ' + favorites + ' favori' + (favorites > 1 ? 's' : '') }) : null));
  }

  // Mode « Modifier les favoris » d'une source : OK ajoute ou retire la chaîne.
  var favoriteMode = false;
  // Étoile des chaînes affichées (grille, guide) après un changement de favori.
  function refreshFavoriteMarks(channel, source) {
    var key = channelKey(channel, source);
    var on = isFavorite(channel, source);
    Array.prototype.forEach.call(main.querySelectorAll('[data-channel]'), function (node) {
      if (node.getAttribute('data-channel') !== key) return;
      node.classList.toggle('favorite', on);
      var badge = node.querySelector('.badge');
      var text = [on ? '★' : '', channel.isLive ? 'LIVE' : ''].filter(Boolean).join(' ');
      if (!badge && text && node.classList.contains('card')) { badge = h('span', { class: 'badge' }); node.insertBefore(badge, node.firstChild); }
      if (badge) { badge.textContent = text; badge.style.display = text ? '' : 'none'; }
    });
  }

  // « TV en direct » s'ouvre directement sur les chaînes (toutes sources
  // réunies, françaises par défaut) ; « Sources » permet d'en choisir une.
  views.live = function (params, alive) {
    favoriteMode = false;
    var merged = {};
    Object.keys(params || {}).forEach(function (key) { merged[key] = params[key]; });
    merged.section = 'live';
    merged.source = ALL_SOURCE;
    merged.home = true;
    return views.liveSource(merged, alive);
  };
  function groupingDetails(channels) {
    var list = h('div', { class: 'list scroll grouping-list' }, h('h2', null, 'Détail des regroupements', h('small', { text: 'Chaînes françaises · noms réunis par source · ○ sans logo officiel' })));
    numberChannels(channels.filter(function (channel) { return channel.country === 'fr'; }), true).forEach(function (channel) {
      var names = [];
      channel._entries.forEach(function (entry) {
        var label = entry.source.name + ' : ' + entry.channel.name;
        if (names.indexOf(label) < 0) names.push(label);
      });
      var official = logoFile(channel.iptvOrgName || channel.name) || iptvLogo(channel.iptvOrgName || channel.name);
      list.appendChild(h('button', { class: 'btn f grouping-row' },
        h('b', { text: (channel._lcn ? channel._lcn + ' · ' : '') + channel.name + (official ? '' : ' ○') }),
        h('small', { text: names.slice(0, 12).join('  ·  ') + (names.length > 12 ? '  … +' + (names.length - 12) : '') })));
    });
    openLayer(h('div', { class: 'modal' }, list));
  }
  // Fenêtre « Sources » : une source précise, par univers.
  function sourcesSheet() {
    var box = h('div', { class: 'sources-sheet scroll' }, h('h2', null, 'Sources', h('small', { text: 'Choisissez une source pour voir ses chaînes' })));
    // Apport de chaque source à « TV en direct » (chaînes réunies).
    var data = unifiedCache && unifiedCache.data;
    if (data && data.coverage) {
      var names = Object.keys(data.coverage).sort(function (a, b) { return data.coverage[b] - data.coverage[a]; });
      box.appendChild(h('p', { class: 'sources-coverage', text: 'Réunies dans « TV en direct » : ' + names.map(function (name) { return name + ' ' + data.coverage[name]; }).join(' · ')
        + (data.pending && data.pending.length ? ' — en attente : ' + data.pending.join(', ') : '')
        + (data.failedSources && data.failedSources.length ? ' — indisponibles : ' + data.failedSources.join(', ') : '') }));
    }
    // Détail des regroupements : pour chaque chaîne française, les noms réunis
    // de chaque source et la présence d'un logo (pour repérer un doublon).
    if (data && data.channels) {
      box.appendChild(h('div', { class: 'actions sources-actions' }, h('button', { class: 'btn f', onclick: function () { groupingDetails(data.channels); } }, icon('info'), 'Détail des regroupements')));
    }
    var status = loading();
    box.appendChild(status);
    openLayer(h('div', { class: 'modal' }, box));
    sourcesList().then(function (sources) {
      status.remove();
      var groups = {};
      sources.forEach(function (source) { var key = source.section || 'channels'; (groups[key] = groups[key] || []).push(source); });
      var order = sourceSections.map(function (section) { return section.id; });
      Object.keys(groups).forEach(function (key) { if (order.indexOf(key) < 0) order.push(key); });
      order.forEach(function (key) {
        if (!groups[key]) return;
        var label = (sourceSections.filter(function (section) { return section.id === key; })[0] || { label: key }).label;
        var info = sourceSectionInfo[key];
        var grid = h('div', { class: 'grid tiles' });
        groups[key].forEach(function (source) {
          var tile = sourceTile(source, key);
          tile.addEventListener('click', function () { closeLayer(true); }, true);
          grid.appendChild(tile);
        });
        box.appendChild(h('section', { class: 'sources-group' },
          h('h3', null, label, h('small', { text: groups[key].length + ' source' + (groups[key].length > 1 ? 's' : '') + (info && info.text ? ' · ' + info.text : '') })), grid));
      });
      if (!sources.length) box.appendChild(h('div', { class: 'empty', text: 'Aucune source TV configurée sur le serveur Noctra.' }));
      var first = box.querySelector('.f');
      if (first) focus(first);
    }, function (error) { status.replaceWith(failure(error)); });
  }

  views.liveSource = function (params, alive) {
    var source = params.source;
    var ref = params.ref || '';
    var group = params.group || '';
    var query = params.query || '';
    var unifiedView = source.id === ALL_SOURCE.id;
    var multiButton = h('button', { class: 'btn f' + (multi.on ? ' primary' : ''), onclick: function () {
      multi.on = !multi.on;
      multiButton.className = 'btn f' + (multi.on ? ' primary' : '');
      multiButton.lastChild.textContent = multi.on ? 'Multiview : choisissez' : 'Multiview';
      renderMultiBar();
      if (multi.on) toast('OK ajoute ou retire une chaîne du multiview (' + MULTI_MAX + ' au maximum).');
    } }, icon('grid'), multi.on ? 'Multiview : choisissez' : 'Multiview');
    var guideButton = h('button', { class: 'btn f' + (guideMode ? ' primary' : ''), onclick: function () {
      guideMode = !guideMode;
      try { localStorage.setItem('noctra-tv-guide', guideMode ? '1' : ''); } catch (error) { /* préférence non mémorisée */ }
      guideButton.className = 'btn f' + (guideMode ? ' primary' : '');
      if (typeof refill === 'function') refill();
    } }, icon('guide'), 'Guide');
    var favButton = h('button', { class: 'btn f' + (favoriteMode ? ' primary' : ''), onclick: function () {
      favoriteMode = !favoriteMode;
      favButton.className = 'btn f' + (favoriteMode ? ' primary' : '');
      favButton.lastChild.textContent = favoriteMode ? 'Favoris : OK ajoute ou retire' : 'Favoris';
      if (favoriteMode) toast('OK ajoute ou retire une chaîne des favoris. Rappuyez sur « Favoris » pour terminer.');
    } }, icon('star'), favoriteMode ? 'Favoris : OK ajoute ou retire' : 'Favoris');
    var refill = null;
    var fillList = null;
    // En-tête : titre et nombre de chaînes, « Reprendre » la dernière chaîne.
    var resume = null;
    if (params.home) {
      var last = storedChannels(RECENTS_KEY)[0];
      if (last) resume = h('button', { class: 'btn primary f', onclick: function () { openStoredChannel(last); } }, icon('play'), 'Reprendre ' + last.name);
    }
    var heading = params.home
      ? head('TV en direct', '', resume)
      : head(params.title || source.name, params.title ? source.name : (source.description || ''), null);
    main.appendChild(heading);
    // Barre d'outils : recherche, pays, sources, guide, favoris, multiview.
    var field = searchField('Rechercher une chaîne…', query, function (value) {
      if (value === query) return;
      query = value;
      current.params = { section: 'live', source: source, ref: ref, title: params.title, group: group, query: value, country: params.country, home: params.home };
      if (fillList) fillList();
    });
    var toolbar = h('div', { class: 'live-toolbar' }, field.node);
    var countrySlot = h('span', { class: 'live-slot' });
    if (unifiedView) toolbar.appendChild(countrySlot);
    if (params.home) toolbar.appendChild(h('button', { class: 'btn f', onclick: sourcesSheet }, icon('antenna'), 'Sources'));
    toolbar.appendChild(guideButton);
    toolbar.appendChild(favButton);
    toolbar.appendChild(multiButton);
    main.appendChild(toolbar);
    // Contenu sous la barre d'outils : redessiné sur place quand la liste se
    // met à jour (catalogues gardés, puis catalogues du moment).
    var body = h('div', { class: 'live-body' });
    main.appendChild(body);
    var status = loading('Chargement des chaînes…');
    body.appendChild(status);
    var countNode = null;
    renderMultiBar();
    var ctx = { ref: ref, title: params.title };
    // Les bouquets (Northlive, Movix…) renvoient des groupes à ouvrir un par un (?ref=).
    var loadList = source.id === ALL_SOURCE.id
      ? loadUnified(function (done, total) { if (alive()) status.textContent = 'Réunion des chaînes de toutes les sources… ' + done + ' / ' + total; })
      : loadCatalog(source, ref, params.title);
    function render(data) {
      var channels = (data && data.channels) || [];
      // Toutes les chaînes : chaînes françaises par défaut, autres pays au choix
      // (bouton « Pays : France ▾ » de la barre d'outils).
      if (unifiedView) {
        var country = typeof params.country === 'string' ? params.country : 'fr';
        var allChannels = channels;
        var countryCounts = {};
        allChannels.forEach(function (channel) { var code = channel.country || '?'; countryCounts[code] = (countryCounts[code] || 0) + 1; });
        if (country) channels = allChannels.filter(function (channel) { return (channel.country || '?') === country; });
        // Ordre des numéros (TNT d'abord pour la France), stable quels que soient les filtres.
        channels = numberChannels(channels, country === 'fr');
        var countryLabel = function (code) { return code === '' ? 'Tous les pays' : code === '?' ? 'Pays non indiqué' : COUNTRY_LABELS[code] || code.toUpperCase(); };
        countrySlot.appendChild(h('button', { class: 'btn f', onclick: function () {
          var list = h('div', { class: 'list scroll' }, h('h2', { text: 'Pays' }));
          var codes = ['fr', ''].concat(Object.keys(countryCounts).filter(function (code) { return code !== 'fr' && code !== '?'; })
            .sort(function (a, b) { return countryCounts[b] - countryCounts[a]; }));
          if (countryCounts['?']) codes.push('?');
          codes.forEach(function (code) {
            list.appendChild(h('button', { class: 'btn f' + (country === code ? ' primary' : ''), onclick: function () {
              closeLayer(true);
              current.params = { section: 'live', source: source, country: code, home: params.home };
              show(false);
            } }, countryLabel(code) + ' · ' + (code === '' ? allChannels.length : countryCounts[code] || 0)));
          });
          openLayer(h('div', { class: 'modal' }, list));
        } }, icon('globe'), 'Pays : ' + countryLabel(country)));
      }
      if (channels.length) {
        countNode = h('small', { class: 'head-count', text: channels.length + ' chaîne' + (channels.length > 1 ? 's' : '') });
        heading.querySelector('h1').appendChild(countNode);
      }
      if (data && data.stale) body.appendChild(h('p', { class: 'live-note', text: 'Liste de la dernière ouverture · mise à jour en cours…' }));
      var bouquets = ((data && data.groups) || []).filter(function (item) { return item && item.ref; });
      if (data && data.warning) body.appendChild(h('p', { class: 'live-note', text: data.warning }));
      if (bouquets.length) {
        var tiles = h('div', { class: 'grid bouquets' });
        bouquets.forEach(function (bouquet) {
          tiles.appendChild(h('button', { class: 'bouquet f', onclick: function () {
            go('liveSource', { section: 'live', source: source, ref: bouquet.ref, title: bouquet.name });
          } }, h('span', { class: 'bouquet-logo' }, bouquet.image ? image(absolute(bouquet.image), '') : icon('live')),
            h('strong', { text: bouquet.name || 'Bouquet' }), h('small', { text: typeof bouquet.count === 'number' ? bouquet.count + ' chaînes' : 'Ouvrir les chaînes' })));
        });
        body.appendChild(h('section', { class: 'row' }, h('h2', { text: 'Bouquets' }), tiles));
        if (!channels.length) return;
      }
      // Catégories : claires pour les chaînes réunies, celles de la source sinon.
      var groupOf = unifiedView ? function (channel) { return channel.category || 'Autres'; } : function (channel) { return channel.group || ''; };
      var counts = {};
      channels.forEach(function (channel) { var g = groupOf(channel); if (g) counts[g] = (counts[g] || 0) + 1; });
      var allNames = unifiedView
        ? CATEGORY_ORDER.filter(function (name) { return counts[name]; })
        : Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b, 'fr'); });
      var names = unifiedView ? allNames : allNames.slice(0, 16);
      var FAVORITES_GROUP = '★';
      var favoriteCount = channels.filter(function (channel) { return isFavorite(channel, source); }).length;
      var RECENTS_GROUP = '⏱';
      var recentCount = unifiedView ? channels.filter(function (channel) { return isRecent(channel, source); }).length : 0;
      // Filtres : toutes, favoris, récentes, catégories (avec leur nombre de chaînes).
      if (names.length > 1 || favoriteCount || recentCount) {
        var chips = h('div', { class: 'chips live-chips' });
        var groupChip = function (value, label) {
          var node = chip(label, group === value, function () { pickGroup(value); });
          node.setAttribute('data-group', value);
          return node;
        };
        chips.appendChild(groupChip('', 'Toutes · ' + channels.length));
        if (favoriteCount) chips.appendChild(groupChip(FAVORITES_GROUP, '★ Favoris · ' + favoriteCount));
        if (recentCount) chips.appendChild(groupChip(RECENTS_GROUP, 'Récentes · ' + recentCount));
        if (names.length > 1) names.forEach(function (name) { chips.appendChild(groupChip(name, name + ' · ' + counts[name])); });
        if (group && group !== FAVORITES_GROUP && group !== RECENTS_GROUP && names.indexOf(group) < 0) chips.appendChild(groupChip(group, group + ' · ' + (counts[group] || 0)));
        if (allNames.length > names.length) {
          chips.appendChild(chip('Toutes les catégories (' + allNames.length + ')…', false, function () {
            var list = h('div', { class: 'list scroll' }, h('h2', { text: 'Catégories' }));
            allNames.forEach(function (name) {
              list.appendChild(h('button', { class: 'btn f' + (group === name ? ' primary' : ''), onclick: function () {
                closeLayer();
                if (!chips.querySelector('[data-group="' + name.replace(/"/g, '\\"') + '"]')) chips.insertBefore(groupChip(name, name + ' · ' + counts[name]), chips.lastChild);
                pickGroup(name);
              } }, name + ' · ' + counts[name]));
            });
            openLayer(h('div', { class: 'modal' }, list));
          }));
        }
        body.appendChild(chips);
      }
      var grid = h('div', { class: guideMode ? 'guide-list' : 'grid channels' });
      body.appendChild(grid);
      refill = function () { grid.className = guideMode ? 'guide-list' : 'grid channels'; fill(); };
      function pickGroup(name) {
        group = name;
        current.params = { section: 'live', source: source, ref: ref, title: params.title, group: group, query: query, country: params.country, home: params.home };
        Array.prototype.forEach.call(body.querySelectorAll('.chips .chip'), function (node) {
          node.classList.toggle('on', node.getAttribute('data-group') === name);
        });
        fill();
      }
      function fill(keepKey) {
        clear(grid);
        resetEpgQueue();
        var needle = normalize(query);
        var list = channels.filter(function (channel) {
          var inGroup = !group || (group === FAVORITES_GROUP ? isFavorite(channel, source) : group === RECENTS_GROUP ? isRecent(channel, source) : groupOf(channel) === group);
          return inGroup && (!needle || normalize(channel.name).indexOf(needle) >= 0);
        });
        if (!list.length) { grid.appendChild(h('div', { class: 'empty', text: channels.length ? 'Aucune chaîne ne correspond.' : 'Aucune chaîne disponible.' })); return; }
        lazyGrid(grid, list, function (channel) {
          function select() {
            if (favoriteMode) { toggleFavorite(channel, source, ctx); refreshFavoriteMarks(channel, source); }
            else if (multi.on) toggleMulti(channel, source);
            else { list._all = channels; launchChannel(channel, source, list, ctx); }
          }
          var node;
          if (guideMode) {
            node = guideRow(channel, select);
            // Numéro de la chaîne dans la liste affichée : à taper pendant la lecture.
            node._number = unifiedView && channel._lcn ? channel._lcn : list.indexOf(channel) + 1;
            fillGuideRow(node, channel);
          } else {
            var guide = epgLive(channel);
            node = card({
              kind: 'channel', title: channel.name,
              sub: guide.now ? hhmm(guide.now.start) + ' · ' + guide.now.title : [groupOf(channel), channel.provider].filter(Boolean).join(' · '),
              image: channelLogo(channel),
              badge: [isFavorite(channel, source) ? '★' : '', channel.isLive ? 'LIVE' : ''].filter(Boolean).join(' '),
              number: unifiedView ? channel._lcn : 0,
              progress: guide.now ? epgProgress(guide.now) : 0,
              onSelect: select
            });
          }
          node.setAttribute('data-channel', channelKey(channel, source));
          if (isFavorite(channel, source)) node.classList.add('favorite');
          markMulti(node);
          // Guide absent du catalogue : demandé au serveur quand la chaîne
          // apparaît à l'écran (quelques requêtes à la fois).
          if (needsEpg(channel)) {
            whenVisible(node, function () {
              loadEpg(channel).then(function () {
                if (!node.parentNode) return;
                if (node.classList.contains('guide-row')) { fillGuideRow(node, channel); markMulti(node); }
                else updateCardEpg(node, channel);
              });
            });
          }
          return node;
        }, Math.max(guideMode ? 40 : 72, keepAt(list, keepKey) + 18));
      }
      fillList = fill;
      fill(renderKeep);
    }
    // Chaîne à garder affichée après une mise à jour (place de la télécommande).
    var renderKeep = '';
    function keepAt(list, key) {
      if (!key) return 0;
      for (var i = 0; i < list.length; i++) if (channelKey(list[i], source) === key) return i;
      return 0;
    }
    function refresh(data) {
      var active = document.activeElement;
      var inBody = body.contains(active);
      var keep = inBody && active.getAttribute('data-channel');
      var chipGroup = inBody ? active.getAttribute('data-group') : null;
      var scroll = main.scrollTop;
      renderKeep = keep || '';
      clear(body);
      clear(countrySlot);
      if (countNode && countNode.parentNode) countNode.parentNode.removeChild(countNode);
      render(data);
      renderKeep = '';
      main.scrollTop = scroll;
      if (!inBody) return;
      var target = null;
      Array.prototype.some.call(body.querySelectorAll('.f'), function (node) {
        if ((keep && node.getAttribute('data-channel') === keep) || (!keep && chipGroup !== null && node.getAttribute('data-group') === chipGroup)) { target = node; return true; }
        return false;
      });
      focus(target || body.querySelector('.f'));
    }
    return loadList.then(function (data) {
      if (!alive()) return;
      status.remove();
      render(data);
      // Liste complétée ou mise à jour en arrière-plan : redessinée sur place
      // (après la fermeture d'une fenêtre ouverte entre-temps).
      if (unifiedView && (data.stale || data.partial)) {
        unifiedListeners.push(function apply(fresh) {
          if (!alive()) return false;
          if (layer.firstChild) { setTimeout(function () { if (alive()) apply(fresh); }, 1500); return false; }
          refresh(fresh);
          return false;
        });
      }
    }, function (error) {
      if (!alive()) return;
      status.replaceWith(failure(error, function () { show(false); }));
    });
  };
  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  // ── Guide des programmes (EPG) ─────────────────────────────────────
  // Le catalogue du serveur fournit le programme en cours et le suivant
  // (guide XMLTV) ; sinon il est demandé chaîne par chaîne (/api/tv/programme).
  var guideMode = false;
  try { guideMode = localStorage.getItem('noctra-tv-guide') === '1'; } catch (error) { /* mode grille */ }
  function hhmm(ms) {
    var date = new Date(Number(ms));
    return isNaN(date.getTime()) ? '' : ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
  }
  function epgLive(channel) {
    var now = channel.now && channel.now.title ? channel.now : null;
    var next = channel.next && channel.next.title ? channel.next : null;
    var time = Date.now();
    if (now && now.stop && now.stop <= time) { now = next && next.start <= time ? next : null; next = null; }
    return { now: now, next: next };
  }
  function epgProgress(programme) {
    if (!programme || !programme.start || !programme.stop || programme.stop <= programme.start) return 0;
    return Math.max(0, Math.min(100, (Date.now() - programme.start) / (programme.stop - programme.start) * 100));
  }
  var epgPending = [];
  var epgRunning = 0;
  // Guide à (re)demander : aucun programme en cours (absent du catalogue, ou
  // périmé si le catalogue a été chargé il y a longtemps), dernier essai
  // vieux de plus de 10 minutes.
  function needsEpg(channel) {
    if (epgLive(channel).now) return false;
    if (channel._epgAt && Date.now() - channel._epgAt < 600000) return false;
    return epgKeys(channel).length > 0;
  }
  // Clés essayées dans l'ordre : noms nettoyés (« FR: TF1 HD » → « TF1 »),
  // reconnus par les noms du guide XMLTV, puis identifiants iptv-org et EPG.
  function epgKeys(channel) {
    var keys = [];
    var seen = {};
    function push(value) {
      value = String(value || '').replace(/\s+/g, ' ').trim();
      // Écritures qui ne diffèrent que par la casse ou la ponctuation : une seule demande.
      var key = normalize(value.replace(/\+/g, ' plus '));
      if (value && value.length > 1 && !seen[key]) { seen[key] = 1; keys.push(value); }
    }
    function clean(name) {
      return cleanChannelName(name)
        .replace(/\b(?:live|direct)\b/gi, ' ')
        .replace(/\s+/g, ' ').trim();
    }
    // Chaîne réunie : identifiants et noms de toutes ses sources.
    var entries = channel._entries ? channel._entries.map(function (entry) { return entry.channel; }) : [channel];
    var names = [];
    [channel.iptvOrgName, channel.name].concat(entries.map(function (item) { return item.iptvOrgName; }), entries.map(function (item) { return item.name; }))
      .forEach(function (name) { var value = clean(name || ''); if (value && names.indexOf(value) < 0) names.push(value); });
    names.forEach(function (name) {
      push(name);
      push(name.replace(/\s+(?:France|FR|FRA)$/i, ''));
      // Écritures du guide XMLTV : « beIN SPORTS 1 », « Canal+ Sport ».
      if (/\bsport\b/i.test(name)) push(name.replace(/\bsport\b/i, 'sports'));
      if (/^C\+\s/i.test(name)) push(name.replace(/^C\+/i, 'Canal+'));
    });
    // Noms d'abord : le serveur les trouve tout de suite dans le guide XMLTV
    // déjà chargé ; les identifiants iptv-org peuvent demander d'autres guides.
    keys = keys.slice(0, 4);
    push(channel.iptvOrgId);
    entries.forEach(function (item) { push(item.iptvOrgId); push(item.epgId); });
    return keys.slice(0, 6);
  }
  // Action lancée quand l'élément entre à l'écran (ou tout de suite sur un
  // moteur sans IntersectionObserver).
  var visibleObserver = null;
  function whenVisible(node, action) {
    if (typeof IntersectionObserver !== 'function') { action(); return; }
    if (!visibleObserver) {
      visibleObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          visibleObserver.unobserve(entry.target);
          var run = entry.target._onVisible;
          entry.target._onVisible = null;
          if (run) run();
        });
      }, { rootMargin: '200px 0px' });
    }
    node._onVisible = action;
    visibleObserver.observe(node);
  }
  function loadEpg(channel) {
    if (!needsEpg(channel)) return Promise.resolve(channel);
    if (!channel._epg) {
      channel._epg = new Promise(function (resolve) { epgPending.push({ channel: channel, resolve: resolve }); });
      pumpEpg();
    }
    return channel._epg;
  }
  function fetchEpg(keys, index) {
    if (index >= keys.length) return Promise.resolve(null);
    return memo('epg:' + keys[index], 900000, function () {
      return api('/api/tv/programme?id=' + encodeURIComponent(keys[index]), { timeout: 12000 });
    }).then(function (data) {
      return data && (data.now || data.next) ? data : fetchEpg(keys, index + 1);
    }, function () { return fetchEpg(keys, index + 1); });
  }
  var epgWait = 0;
  function pumpEpg() {
    // Pendant la navigation à la télécommande, les demandes attendent : la
    // page reste fluide.
    if (Date.now() - lastMove < 700) {
      if (!epgWait) epgWait = setTimeout(function () { epgWait = 0; pumpEpg(); }, 700);
      return;
    }
    while (epgRunning < 3 && epgPending.length) {
      var job = epgPending.shift();
      epgRunning++;
      (function (job) {
        fetchEpg(epgKeys(job.channel), 0).then(function (data) {
          if (data && data.now) job.channel.now = data.now;
          if (data && data.next) job.channel.next = data.next;
        }).then(function () {
          epgRunning--;
          job.channel._epgDone = true;
          job.channel._epgAt = Date.now();
          delete job.channel._epg;
          job.resolve(job.channel);
          pumpEpg();
        });
      })(job);
    }
  }
  // Liste redessinée : les demandes des chaînes qui ne sont plus affichées sont abandonnées.
  function resetEpgQueue() {
    epgPending.splice(0).forEach(function (job) { delete job.channel._epg; job.resolve(job.channel); });
  }
  function updateCardEpg(node, channel) {
    var guide = epgLive(channel);
    if (!guide.now) return;
    var sub = node.querySelector('.sub');
    if (sub) sub.textContent = hhmm(guide.now.start) + ' · ' + guide.now.title;
    var art = node.querySelector('.art');
    var bar = node.querySelector('.progress i');
    if (!bar && art) { bar = h('i'); art.appendChild(h('div', { class: 'progress' }, bar)); }
    if (bar) bar.style.width = Math.max(3, epgProgress(guide.now)) + '%';
  }
  // Vue « Guide des programmes » : une ligne par chaîne, en cours et ensuite.
  function guideRow(channel, onSelect) {
    var node = h('button', { class: 'guide-row f', onclick: onSelect });
    fillGuideRow(node, channel);
    return node;
  }
  function fillGuideRow(node, channel) {
    var guide = epgLive(channel);
    clear(node);
    var logoUrl = channelLogo(channel);
    var logo = h('span', { class: 'guide-logo' }, logoUrl ? image(logoUrl, '') : h('b', { text: String(channel.name || '?').slice(0, 3) }));
    var now = guide.now
      ? h('span', { class: 'guide-now' },
        h('small', { text: 'En ce moment · ' + hhmm(guide.now.start) + (guide.now.stop ? ' – ' + hhmm(guide.now.stop) : '') }),
        h('strong', { text: guide.now.title }),
        h('span', { class: 'guide-bar' }, h('i', { style: 'width:' + Math.max(2, epgProgress(guide.now)) + '%' })))
      : h('span', { class: 'guide-now missing' }, h('small', { text: !channel._epgDone && epgKeys(channel).length ? 'Guide des programmes…' : 'Programme non communiqué' }), h('strong', { text: channel.description || [channel.group, channel.provider].filter(Boolean).join(' · ') }));
    var next = guide.next
      ? h('span', { class: 'guide-next' }, h('small', { text: 'Ensuite · ' + hhmm(guide.next.start) }), h('strong', { text: guide.next.title }))
      : h('span', { class: 'guide-next' });
    node.appendChild(logo);
    node.appendChild(h('span', { class: 'guide-channel' }, h('strong', null, node._number ? h('i', { class: 'guide-num', text: String(node._number) }) : null, channel.name), h('small', { text: [channel.group, channel.provider].filter(Boolean).join(' · ') })));
    node.appendChild(now);
    node.appendChild(next);
  }
  function epgPayload(state) {
    var guide = epgLive(state.channel);
    var list = state.list || [];
    var at = list.indexOf(state.channel);
    // Chaînes numérotées : « n° / plus grand numéro » (touches chiffrées du lecteur).
    var numbered = state.channel._lcn && list._all;
    var highest = 0;
    if (numbered) list._all.forEach(function (channel) { if (channel._lcn > highest) highest = channel._lcn; });
    var position = numbered ? state.channel._lcn + ' / ' + highest : at >= 0 ? (at + 1) + ' / ' + list.length : '';
    return { now: guide.now, next: guide.next, position: position, zap: list.length > 1, managed: true };
  }
  function playId() { return 'live-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // Zapping depuis le lecteur (▲ ▼) : chaîne voisine de la liste affichée,
  // serveur choisi comme au lancement, flux chargé dans le lecteur ouvert.
  function zap(delta) {
    var state = playback;
    if (!state || !state.list || state.list.length < 2) return;
    var at = Math.max(0, state.list.indexOf(state.channel));
    zapTo(at + delta);
  }
  // Panneau des chaînes du lecteur : liste affichée, programme en cours ;
  // le guide manquant des chaînes proches est demandé puis renvoyé.
  function sendChannels(update) {
    var state = playback;
    if (!state || !state.list) return;
    var list = state.list;
    native('playerCommand', {
      command: 'channels', mode: 'channels', update: Boolean(update), current: list.indexOf(state.channel),
      title: (state.source && state.source.name ? state.source.name + ' · ' : '') + list.length + ' chaîne' + (list.length > 1 ? 's' : ''),
      items: list.slice(0, 3000).map(function (channel) {
        return { name: (list._all && channel._lcn ? channel._lcn + '  ' : '') + channel.name, sub: [channel.category || channel.group, channel.provider].filter(Boolean).join(' · '), now: epgLive(channel).now };
      })
    });
    if (update) return;
    var at = Math.max(0, list.indexOf(state.channel));
    var around = list.slice(Math.max(0, at - 15), at + 30).filter(needsEpg);
    if (around.length) Promise.all(around.map(loadEpg)).then(function () { if (playback === state) sendChannels(true); });
  }
  function zapTo(target) {
    var state = playback;
    if (!state || !state.list || state.list.length < 2) return;
    var list = state.list;
    var channel = list[((target % list.length) + list.length) % list.length];
    if (channel === state.channel) return;
    var key = channelKey(channel, state.source);
    var next = { channel: channel, source: state.source, key: key, options: [], index: 0, failed: {}, startedAt: 0, renewed: false, list: list, playId: playId() };
    playback = next;
    native('playerCommand', { command: 'zapping', title: channel.name, subtitle: [channel.group, channel.provider].filter(Boolean).join(' · '), epg: epgPayload(next), message: 'Connexion à ' + channel.name + '…' });
    loadEpg(channel).then(function () {
      if (playback === next) native('playerCommand', { command: 'guide', epg: epgPayload(next) });
    });
    serverList(channel, state.source, key).then(function (options) {
      if (playback !== next) return;
      if (!options.length) throw new Error('Aucun flux disponible pour ' + channel.name + '.');
      next.options = options;
      playOption(true);
    }).catch(function (error) {
      if (playback !== next) return;
      native('playerCommand', { command: 'stop' });
      showPicker(next, error.message || '', 0);
    });
  }

  function channelKey(channel, source) {
    return (source && source.id ? source.id : '') + ':' + channel.name;
  }

  // ── Serveurs d'une chaîne ──────────────────────────────────────────
  // Flux MPEG-TS continu (« ts » des catalogues, « mpegts » de Northlive, Movix,
  // RénéVéo) : à lire comme tel, pas comme une liste HLS qui ne se termine jamais.
  function tsTransport(item) {
    return Boolean(item && (/^(?:ts|mpegts|mpeg-ts)$/i.test(String(item.transport || '')) || /^mpeg-ts$/i.test(String(item.streamKind || ''))));
  }
  function optionKind(option) {
    if (option.streamUrl || option.playbackType === 'stream') return 'native';
    if (option.resolveUrl && !option.url) return 'resolve';
    return 'web';
  }
  function optionLabel(option, index) {
    return option.label || (optionKind(option) === 'native' ? 'Flux direct' : 'Serveur ' + (index + 1));
  }
  function resolveOptions(url) {
    return api(url, { timeout: 30000 }).then(function (result) {
      var list = result && Array.isArray(result.options) ? result.options : (result && (result.streamUrl || result.url) ? [result] : []);
      return list.filter(function (option) { return option && (option.streamUrl || option.url || option.resolveUrl); })
        .map(function (option) { if (!option.resolveUrl && url) option.renewUrl = url; return option; });
    });
  }
  // Comme sur PC : les sources LiveWatch à lecteur officiel (Sports, Football
  // Live, BossTV, JackTV, Matchs du jour, NorthTV, FrameTV) ouvrent l'embed
  // officiel de la chaîne, sans référent ; NorthTV passe par le relais préparé
  // par le serveur quand le VIP est actif.
  var LIVEWATCH_OFFICIAL = ['livewatch-north', 'livewatch-frame', 'livewatch-sports', 'livewatch-football', 'livewatch-bosstv', 'livewatch-jacktv', 'livewatch-daily'];
  function liveWatchOfficial(channel, source) {
    var sourceId = String((source && source.id) || '');
    if (LIVEWATCH_OFFICIAL.indexOf(sourceId) < 0) return null;
    if (channel.playbackType === 'resolver' && channel.resolverUrl) return null;
    var official = [channel.vipFallbackUrl, channel.externalUrl, channel.embedUrl].filter(function (value) { return /^https?:\/\//i.test(String(value || '').trim()); })[0];
    if (!official) return null;
    official = String(official).trim();
    var provider = (source && source.name) || channel.provider || 'LiveWatch';
    var north = null;
    try {
      var parsed = new URL(official);
      var match = /^(?:www\.)?livewatch\.top$/i.test(parsed.hostname) && parsed.pathname.match(/^\/embed\/north\/([^/]+)\/?$/i);
      if (match && sourceId === 'livewatch-north' && channel.liveWatchSameOriginBridge) north = decodeURIComponent(match[1]);
    } catch (error) { /* adresse officielle telle quelle */ }
    var direct = { playbackType: 'embed', url: official, label: provider + ' · lecteur officiel', provider: provider, referrer: 'no-referrer' };
    if (!north) return Promise.resolve([direct]);
    return api('/api/tv/livewatch/prepare/north/' + encodeURIComponent(north), { timeout: 15000 }).then(function (prepared) {
      if (!prepared || !prepared.embedUrl) throw new Error('relais vide');
      return [{ playbackType: 'embed', url: prepared.embedUrl, label: provider + ' · relais officiel', provider: provider, compatPage: true }, direct];
    }, function () { return [direct]; });
  }
  function channelOptions(channel, source) {
    if (channel._entries) return unifiedOptions(channel);
    var official = liveWatchOfficial(channel, source);
    if (official) return official;
    if (channel.playbackType === 'stream' && channel.streamUrl) {
      return Promise.resolve([{ playbackType: 'stream', streamUrl: channel.streamUrl, label: 'Flux direct', transport: channel.transport }]);
    }
    if (channel.resolverUrl) return resolveOptions(channel.resolverUrl);
    if (channel.embedUrl) return Promise.resolve([{ playbackType: 'embed', url: channel.embedUrl, label: 'Lecteur web' }]);
    return Promise.resolve([]);
  }
  // Serveur qui a fonctionné en dernier pour cette chaîne (mémorisé sur la TV).
  function rememberedServer(key) {
    try { return localStorage.getItem('noctra-tv-server:' + key) || ''; } catch (error) { return ''; }
  }
  function rememberServer(key, label) {
    try { localStorage.setItem('noctra-tv-server:' + key, label); } catch (error) { /* stockage indisponible */ }
  }
  // ── Santé des serveurs ─────────────────────────────────────────────
  // Historique mémorisé sur la TV : réussites et échecs de chaque serveur
  // d'une chaîne, et de chaque famille de serveurs (fournisseur + type de
  // lecteur + hôte), toutes chaînes confondues. Un échec récent fait passer
  // le serveur après les autres ; un serveur fiable passe devant.
  // v2 : historique remis à zéro (échecs dus aux flux MPEG-TS mal reconnus
  // sur LG/Samsung, qui écartaient à tort Northlive, Movix et RénéVéo).
  var HEALTH_KEY = 'noctra-tv-health-v2';
  try { localStorage.removeItem('noctra-tv-health-v1'); } catch (error) { /* stockage indisponible */ }
  var HEALTH_RECENT_MS = 20 * 60000;
  var healthData = null;
  function healthStore() {
    if (healthData) return healthData;
    try { healthData = JSON.parse(localStorage.getItem(HEALTH_KEY) || '{}') || {}; } catch (error) { healthData = {}; }
    if (typeof healthData !== 'object' || Array.isArray(healthData)) healthData = {};
    return healthData;
  }
  function saveHealth() {
    var store = healthStore();
    var keys = Object.keys(store);
    // Au plus 600 entrées : les plus anciennes sont oubliées.
    if (keys.length > 600) {
      keys.sort(function (a, b) { return Math.max(store[a].o || 0, store[a].f || 0) - Math.max(store[b].o || 0, store[b].f || 0); });
      keys.slice(0, keys.length - 600).forEach(function (key) { delete store[key]; });
    }
    try { localStorage.setItem(HEALTH_KEY, JSON.stringify(store)); } catch (error) { /* stockage indisponible */ }
  }
  function optionHost(option) {
    var raw = option.streamUrl || option.url || option.resolveUrl || '';
    try {
      var url = new URL(absolute(raw), location.href);
      // Flux relayés par le serveur Noctra : l'hôte ne distingue rien.
      return url.origin === serverOrigin() ? 'noctra' : url.hostname.replace(/^www\./, '');
    } catch (error) { return ''; }
  }
  function healthIds(option, key, index, provider) {
    return [
      'c|' + key + '|' + optionLabel(option, index),
      'f|' + (option.provider || provider || '') + '|' + optionKind(option) + '|' + optionHost(option)
    ];
  }
  function recordHealth(state, index, ok) {
    var option = state && state.options[index];
    if (!option) return;
    var store = healthStore();
    var now = Date.now();
    healthIds(option, state.key, index, state.channel.provider).forEach(function (id) {
      var entry = store[id] || (store[id] = { ok: 0, fail: 0 });
      if (ok) { entry.ok = Math.min(50, entry.ok + 1); entry.o = now; }
      else { entry.fail = Math.min(50, entry.fail + 1); entry.f = now; }
      // Les vieux résultats comptent de moins en moins.
      if (entry.ok + entry.fail > 20) { entry.ok = Math.round(entry.ok * 0.7); entry.fail = Math.round(entry.fail * 0.7); }
    });
    saveHealth();
  }
  // Fluidité mesurée pendant la lecture (Android TV) : coupures pour 10 min
  // regardées, moyenne glissante par serveur et par famille de serveurs.
  // Un serveur qui démarre mais coupe sans cesse passe après les fluides.
  function recordSmooth(state, index, stalls, playedMs) {
    var option = state && state.options[index];
    if (!option || !(playedMs >= 30000)) return;
    var rate = Math.min(10, stalls / (playedMs / 600000));
    // Moins de 2 min regardées : la mesure compte moins.
    var weight = Math.min(0.4, 0.4 * playedMs / 120000);
    var store = healthStore();
    var now = Date.now();
    healthIds(option, state.key, index, state.channel.provider).forEach(function (id) {
      var entry = store[id] || (store[id] = { ok: 0, fail: 0 });
      entry.cut = typeof entry.cut === 'number' ? entry.cut * (1 - weight) + rate * weight : rate;
      entry.cut = Math.round(entry.cut * 100) / 100;
      entry.o = entry.o || now;
    });
    saveHealth();
  }
  function choppy(entry) { return Boolean(entry && typeof entry.cut === 'number' && entry.cut >= 2); }
  // Fiabilité estimée : 'good', 'recent-fail', 'unstable', 'choppy' ou '' (inconnue).
  function optionHealth(option, key, index, provider) {
    var store = healthStore();
    var ids = healthIds(option, key, index, provider);
    var own = store[ids[0]];
    var family = store[ids[1]];
    var now = Date.now();
    var score = 0;
    var verdict = '';
    [own, family].forEach(function (entry, level) {
      if (!entry) return;
      // La famille (toutes chaînes du même fournisseur) compte moins que le serveur lui-même.
      var weight = level === 0 ? 1 : 0.3;
      var rate = (entry.ok + 1) / (entry.ok + entry.fail + 2);
      score += (rate - 0.5) * 2 * weight;
      var failedRecently = entry.f && now - entry.f < HEALTH_RECENT_MS && (!entry.o || entry.f > entry.o);
      if (failedRecently) score -= 2 * weight;
      // Coupures fréquentes (2 ou plus pour 10 min) : jusqu'à 3 points.
      if (typeof entry.cut === 'number') score -= Math.min(3, entry.cut * 0.75) * weight;
      if (level === 0 && failedRecently) verdict = 'recent-fail';
      else if (!verdict && level === 0 && choppy(entry)) verdict = 'choppy';
      else if (!verdict && level === 0 && entry.fail >= 2 && rate < 0.45) verdict = 'unstable';
      else if (!verdict && level === 0 && entry.ok >= 2 && rate >= 0.75) verdict = 'good';
    });
    return { score: score, verdict: verdict };
  }
  // Fiabilité lisible : « Fiable · 9/10 », « Instable · 2/6 », « Jamais essayé ».
  function healthText(option, key, index, provider) {
    var store = healthStore();
    var ids = healthIds(option, key, index, provider);
    var own = store[ids[0]];
    var family = store[ids[1]];
    var health = optionHealth(option, key, index, provider);
    var label = health.verdict === 'good' ? 'Fiable' : health.verdict === 'unstable' ? 'Instable' : health.verdict === 'recent-fail' ? 'Échec récent' : health.verdict === 'choppy' ? 'Coupures fréquentes' : '';
    if (own && own.ok + own.fail) return (label || 'Essayé') + ' · ' + own.ok + '/' + (own.ok + own.fail) + ' réussites';
    if (family && family.ok + family.fail) return 'Même fournisseur · ' + family.ok + '/' + (family.ok + family.fail) + ' réussites';
    return 'Jamais essayé';
  }
  // Appli LG / Samsung avec l'interface intégrée (autre origine que le
  // serveur) : pas de cookie de session Noctra, donc les lecteurs web
  // préparés par le serveur (affichés en cadre) ne peuvent pas s'ouvrir.
  function tvBrowserHost() { return Boolean(S.caps && S.caps.webPlayer === false); }
  function unavailableHere(option) {
    if (!tvBrowserHost()) return false;
    var kind = optionKind(option);
    // Flux direct qui exige une identité (Referer, Origin, User-Agent, cookie) :
    // seul le lecteur Android l'envoie, un navigateur de téléviseur ne le peut pas.
    if (kind === 'native' && option.headers && typeof option.headers === 'object') {
      var needs = Object.keys(option.headers).some(function (name) { return /^(?:referr?er|origin|user-agent|cookie)$/i.test(name) && option.headers[name]; });
      var relayed = false;
      try { relayed = absolute(option.streamUrl).indexOf(serverOrigin() + '/') === 0; } catch (error) { relayed = false; }
      if (needs && !relayed) return true;
    }
    if (serverOrigin() === location.origin || kind !== 'web') return false;
    try { return absolute(option.url).indexOf(serverOrigin() + '/') === 0; } catch (error) { return false; }
  }
  function rankOptions(options, key, provider) {
    var remembered = rememberedServer(key);
    var weight = { native: 0, resolve: 1, web: 2 };
    // Moteur web trop ancien : les lecteurs web passent encore après.
    var oldEngine = engineOutdated();
    // LG / Samsung : pas de lecteur web allégé ni séparé (cadre dans la page) :
    // les flux directs d'abord, les lecteurs web ensuite.
    var host = tvBrowserHost();
    return options.map(function (option, index) { return { option: option, index: index }; }).sort(function (a, b) {
      function score(entry) {
        var option = entry.option;
        var health = optionHealth(option, key, entry.index, provider);
        var base = weight[optionKind(option)] + (option.compatPage ? 3 : 0) + (option.manualOnly ? 4 : 0) + (option.fallback ? 0.5 : 0)
          + (oldEngine && optionKind(option) === 'web' ? 1 : 0) + (host && optionKind(option) === 'web' ? 1.5 : 0)
          + (unavailableHere(option) ? 20 : 0) - health.score
          // Test du serveur : vérifié en ligne d'abord, hors ligne en dernier.
          + (option._probeState === 'up' ? -6 * probeTrust(option) + probePenalty(option) : option._probeState === 'down' ? 8 : 0);
        // Dernier serveur fonctionnel en tête, sauf s'il vient d'échouer.
        if (remembered && optionLabel(option, entry.index) === remembered && health.verdict !== 'recent-fail' && health.verdict !== 'choppy' && option._probeState !== 'down') return base - 10;
        return base;
      }
      return score(a) - score(b) || a.index - b.index;
    }).map(function (entry) { return entry.option; });
  }
  function engineOutdated() {
    return Boolean(S.engine && S.engine.major > 0 && S.engine.major < (S.engine.recommended || 110));
  }
  // Disponibilité vérifiée pendant le compte à rebours, comme le ferait le
  // lecteur : liste de lecture, sous-liste de qualité puis dernier segment
  // (seuls les en-têtes sont attendus). Flux continu (MPEG-TS) : la réponse
  // suffit. Résultat : 'up', 'down', ou '' (non testable ou trop lent : inconnu,
  // jamais compté comme un échec). Les serveurs « automatiques » sont résolus
  // puis leur premier flux est testé.
  var PROBE_MS = 9000;
  // Serveur en ligne mais lent à répondre (liste + segment) : un peu moins bien
  // classé que les rapides (0 à 2 points entre 0,8 s et 6 s), signe d'un relais
  // chargé qui coupera plus souvent.
  function probeKey(option) { return 'p|' + (option.provider || option._prefix || '') + '|' + optionHost(option); }
  // Confiance dans le test « En ligne » de ce fournisseur (1 : toujours juste,
  // jusqu'à 0,25 après plusieurs serveurs « en ligne » qui n'ont pas lu).
  function probeTrust(option) {
    var entry = healthStore()[probeKey(option)];
    if (!entry) return 1;
    return Math.max(0.25, (entry.ok + 2) / (entry.ok + entry.fail + 2));
  }
  function recordProbe(option, ok) {
    if (!option || option._probeState !== 'up') return;
    var store = healthStore();
    var entry = store[probeKey(option)] || (store[probeKey(option)] = { ok: 0, fail: 0 });
    if (ok) { entry.ok = Math.min(30, entry.ok + 1); entry.o = Date.now(); }
    else { entry.fail = Math.min(30, entry.fail + 1); entry.f = Date.now(); }
    if (entry.ok + entry.fail > 12) { entry.ok = Math.round(entry.ok * 0.7); entry.fail = Math.round(entry.fail * 0.7); }
    saveHealth();
  }
  function probePenalty(option) {
    // Marge mesurée sur un segment entier : 3 et plus, rien ; 1,5 : 1 point ;
    // 1 : 2,5 points ; en dessous, jusqu'à 5 (lecture à peine possible).
    if (option._probeMargin > 0) {
      var margin = option._probeMargin;
      return margin >= 3 ? 0 : margin >= 1 ? Math.min(2.5, (3 - margin) * 1.25) : Math.min(5, 2.5 + (1 - margin) * 5);
    }
    var ms = option._probeMs || 0;
    return ms > 800 ? Math.min(2, (ms - 800) / 2600) : 0;
  }
  // Premiers octets d'une réponse (null : lecture impossible ici, non vérifiable).
  function firstBytes(response, want) {
    return readBody(response, want, 0).then(function (body) { return body && body.head; });
  }
  // Réponse lue jusqu'à `limit` octets ou jusqu'à l'heure `until` (0 : sans
  // limite de temps) : ses 4 premiers Ko, la quantité lue et si elle est complète.
  function readBody(response, limit, until) {
    if (!response.body || !response.body.getReader || typeof Uint8Array === 'undefined') return Promise.resolve(null);
    var reader = response.body.getReader();
    var parts = [], kept = 0, size = 0, complete = false;
    function pump() {
      return reader.read().then(function (chunk) {
        if (chunk.done || !chunk.value) { complete = true; return; }
        if (kept < 4096) { parts.push(chunk.value); kept += chunk.value.length; }
        size += chunk.value.length;
        if (size < limit && (!until || Date.now() < until)) return pump();
      });
    }
    return pump().then(function () {
      if (!complete) { try { reader.cancel(); } catch (error) { /* déjà fermé */ } }
      var head = new Uint8Array(kept), offset = 0;
      parts.forEach(function (part) { head.set(part, offset); offset += part.length; });
      return { head: head, size: size, complete: complete };
    });
  }
  // Vraie vidéo ? MPEG-TS (synchro 0x47 tous les 188 octets, même après un faux
  // en-tête d'image), MP4 fragmenté, audio (ID3, ADTS) ; refusés : vide, page
  // HTML, JSON ou message d'erreur en texte servis avec un code 200.
  function looksLikeMedia(bytes) {
    if (!bytes) return true;
    if (!bytes.length) return false;
    var first = 0;
    while (first < bytes.length && (bytes[first] <= 0x20 || bytes[first] === 0xEF || bytes[first] === 0xBB || bytes[first] === 0xBF)) first++;
    if (bytes[first] === 0x3C || bytes[first] === 0x7B) return false;
    for (var i = 0; i < Math.min(bytes.length - 188, 1024); i++) if (bytes[i] === 0x47 && bytes[i + 188] === 0x47) return true;
    if (bytes.length >= 8 && /^(?:ftyp|styp|moof|sidx|moov|emsg|prft)$/.test(String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]))) return true;
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
    if (bytes[0] === 0xFF && (bytes[1] & 0xF0) === 0xF0) return true;
    // Que du texte lisible : message d'erreur. Autre contenu binaire : accepté.
    var n = Math.min(bytes.length, 256), printable = 0;
    for (i = 0; i < n; i++) if ((bytes[i] >= 0x20 && bytes[i] < 0x7F) || bytes[i] === 0x0A || bytes[i] === 0x0D || bytes[i] === 0x09) printable++;
    return printable < n * 0.9;
  }
  // Résultat : 'up', 'down', 'bad' (répond sans vidéo), 'stale' (direct figé),
  // ou '' (non testable ou trop lent : inconnu, jamais compté comme un échec).
  function probeOption(option) {
    var kind = optionKind(option);
    if (kind === 'resolve') return probeResolve(option);
    if (kind !== 'native' || option.headers) return Promise.resolve('');
    var url = absolute(option.streamUrl);
    if (url.indexOf(serverOrigin() + '/') !== 0) return Promise.resolve('');
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timedOut = false;
    var began = Date.now();
    var timer = setTimeout(function () { timedOut = true; if (controller) controller.abort(); }, PROBE_MS);
    function get(address) {
      var own = address.indexOf(serverOrigin() + '/') === 0;
      return fetch(address, { headers: own ? { 'x-noctra-token': S.token } : {}, credentials: 'omit', cache: 'no-store', signal: controller ? controller.signal : undefined });
    }
    function media(response) {
      if (!response.ok) return 'down';
      return firstBytes(response, 4096).then(function (bytes) { return looksLikeMedia(bytes) ? 'up' : 'bad'; });
    }
    // Segment d'un direct téléchargé en entier (4 Mo et 7 s au plus) : sa durée
    // divisée par son temps de chargement donne la marge de ce serveur sur
    // CETTE connexion (2 : deux fois plus vite que la lecture ; sous 1, le
    // flux arrive moins vite qu'il ne se lit). Un segment pas fini à temps
    // compte comme une marge inférieure à ce qui a été mesuré.
    function timedSegment(address, duration) {
      var sent = Date.now();
      return get(address).then(function (response) {
        if (!response.ok) return 'down';
        var until = Math.min(sent + 7000, began + PROBE_MS - 1500);
        return readBody(response, 4 * 1024 * 1024, until).then(function (body) {
          if (!body) return 'up';
          if (!looksLikeMedia(body.head)) return 'bad';
          var took = Math.max(1, Date.now() - sent);
          if (duration > 0 && body.size > 0) {
            var margin = duration * 1000 / took;
            option._probeMargin = body.complete ? margin : Math.min(margin, 0.9);
          }
          return 'up';
        });
      });
    }
    function lastDuration(text) {
      var all = text.match(/#EXTINF:\s*([\d.]+)/g);
      return all && all.length ? Number(all[all.length - 1].replace(/#EXTINF:\s*/, '')) || 0 : 0;
    }
    // Liste d'un direct : relue après une durée de segment ; inchangée (même
    // numéro de séquence, même dernier segment), le direct est figé.
    function moving(address, text) {
      if (/#EXT-X-ENDLIST/.test(text)) return Promise.resolve(true);
      var target = Number((/#EXT-X-TARGETDURATION:(\d+(?:\.\d+)?)/.exec(text) || [])[1]) || 0;
      if (!target || target > 6) return Promise.resolve(true);
      var wait = target * 1000 + 600 - (Date.now() - began);
      if (Date.now() - began + Math.max(0, wait) > PROBE_MS - 1500) return Promise.resolve(true);
      var signature = function (body) {
        var lines = body.split(/\r?\n/).filter(function (line) { return line && line.charAt(0) !== '#'; });
        return ((/#EXT-X-MEDIA-SEQUENCE:(\d+)/.exec(body) || [])[1] || '') + '|' + (lines[lines.length - 1] || '');
      };
      return later(Math.max(0, wait)).then(function () { return get(address); }).then(function (again) {
        if (!again.ok) return true;
        return again.text().then(function (body) { return signature(body) !== signature(text); });
      }, function () { return true; });
    }
    function playlist(address, depth) {
      return get(address).then(function (response) {
        if (!response.ok) return 'down';
        var type = String(response.headers.get('content-type') || '').toLowerCase();
        // Flux continu (MPEG-TS…) : ses premiers octets doivent être de la vidéo.
        if (!/mpegurl|text|json/.test(type)) return media(response);
        return response.text().then(function (text) {
          if (!/^\s*#EXTM3U/.test(text)) return 'down';
          var uris = text.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(function (line) { return line && line.charAt(0) !== '#'; });
          if (!uris.length) return 'down';
          var base = response.url || address;
          // Liste principale : première qualité ; liste de segments : le plus récent.
          if (/#EXT-X-STREAM-INF/.test(text)) {
            if (depth >= 2) return 'up';
            return playlist(new URL(uris[0], base).toString(), depth + 1);
          }
          var segment = new URL(uris[uris.length - 1], base).toString();
          // Segment chez un tiers : non vérifiable depuis la page (CORS), la liste suffit.
          var check = segment.indexOf(serverOrigin() + '/') !== 0 ? Promise.resolve('up') : timedSegment(segment, lastDuration(text));
          return check.then(function (result) {
            if (result !== 'up') return result;
            return moving(address, text).then(function (alive) { return alive ? 'up' : 'stale'; });
          });
        });
      });
    }
    return playlist(url, 0).then(function (result) { return result; }, function () { return timedOut ? '' : 'down'; })
      .then(function (result) { clearTimeout(timer); if (controller) controller.abort(); return result; });
  }
  function probeResolve(option) {
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 12000); });
    return Promise.race([resolveOptions(option.resolveUrl).then(null, function () { return []; }), timeout]).then(function (list) {
      if (!list) return '';
      if (!list.length) return 'down';
      list.forEach(function (item) {
        item.renewUrl = option.resolveUrl;
        if (!item.label) item.label = option.label;
        inheritSource(item, option);
      });
      // Gardés pour le lancement : pas de seconde résolution.
      option._resolved = list;
      option._resolvedAt = Date.now();
      var first = list.filter(function (item) { return optionKind(item) === 'native'; })[0];
      if (!first) return '';
      return probeOption(first).then(function (result) {
        first._probeState = result === 'bad' || result === 'stale' ? 'down' : result;
        if (first._probeMargin) option._probeMargin = first._probeMargin;
        return result;
      });
    });
  }

  var playback = null;
  function launchChannel(channel, source, list, ctx) {
    var key = channelKey(channel, source);
    loadEpg(channel);
    if (source && source.id) rememberRecent(channel, source, ctx);
    var sheet = pickerSheet(channel, 'Recherche des serveurs…', source, ctx);
    openLayer(sheet.node);
    if (channel._entries) sheet.status('Recherche des serveurs de ' + channel._sources.length + ' source' + (channel._sources.length > 1 ? 's' : '') + '…');
    serverList(channel, source, key).then(function (options) {
      if (!document.body.contains(sheet.node)) return;
      if (!options.length) { sheet.status('Aucun flux disponible pour cette chaîne.', true); return; }
      playback = { channel: channel, source: source, ctx: ctx || null, key: key, options: options, index: 0, failed: {}, startedAt: 0, renewed: false, list: list || null, playId: playId() };
      // Lancement immédiat quand le meilleur serveur est sûr (fiable, ou dernier
      // serveur qui a fonctionné pour cette chaîne) ; sinon 3 s pour en choisir un autre.
      var top = playback.options[0];
      var health = optionHealth(top, key, 0, channel.provider);
      var trusted = health.verdict === 'good' || (rememberedServer(key) === optionLabel(top, 0) && health.verdict !== 'recent-fail');
      // Serveurs affichés avec leur fiabilité ; le meilleur démarre tout seul
      // (2 s s'il est sûr, 3 s sinon), une touche arrête le compte à rebours.
      if (playback.options.length === 1 && !unavailableHere(top)) {
        closeLayer(true);
        playOption();
      } else {
        fillPicker(sheet, playback, trusted ? 2 : 3);
      }
    }, function (error) {
      if (document.body.contains(sheet.node)) sheet.status(error.message, true);
    });
  }

  // Fenêtre de choix : serveurs classés (dernier serveur fonctionnel, puis
  // lecteur natif, puis lecteurs web), lancement automatique du premier.
  function epgLines(channel) {
    var box = h('div', { class: 'picker-epg' });
    function render() {
      clear(box);
      var guide = epgLive(channel);
      if (guide.now) box.appendChild(h('div', { class: 'now' }, h('b', { text: hhmm(guide.now.start) + (guide.now.stop ? ' – ' + hhmm(guide.now.stop) : '') }), ' ' + guide.now.title,
        h('span', { class: 'guide-bar' }, h('i', { style: 'width:' + Math.max(2, epgProgress(guide.now)) + '%' }))));
      if (guide.next) box.appendChild(h('div', { class: 'next', text: 'Ensuite · ' + hhmm(guide.next.start) + ' · ' + guide.next.title }));
    }
    render();
    if (needsEpg(channel)) loadEpg(channel).then(render);
    return box;
  }
  function pickerSheet(channel, text, source, ctx) {
    var list = h('div', { class: 'servers' });
    var note = h('div', { class: 'picker-status loading', text: text });
    var logoUrl = channelLogo(channel);
    var logo = logoUrl ? image(logoUrl, '') : null;
    // Favori : la chaîne apparaît en tête de « TV en direct ».
    var favorite = null;
    if (source && source.id) {
      favorite = h('button', { class: 'btn f picker-fav', onclick: function () {
        var on = toggleFavorite(channel, source, ctx);
        favorite.lastChild.textContent = on ? 'Retirer des favoris' : 'Ajouter aux favoris';
        favorite.classList.toggle('on', on);
        refreshFavoriteMarks(channel, source);
      } }, icon('star'), isFavorite(channel, source) ? 'Retirer des favoris' : 'Ajouter aux favoris');
      if (isFavorite(channel, source)) favorite.classList.add('on');
    }
    var node = h('div', { class: 'modal' }, h('div', { class: 'picker scroll' },
      h('div', { class: 'picker-head' },
        h('div', { class: 'picker-logo' }, logo),
        h('div', null, h('h2', { text: channel.name }), h('div', { class: 'sub', text: [channel.group, channel.provider].filter(Boolean).join(' · ') }), epgLines(channel))),
      note, list,
      h('div', { class: 'picker-actions' },
        h('button', { class: 'btn f picker-close', text: 'Annuler', onclick: function () { closeLayer(); } }),
        favorite)));
    var timer = 0;
    function stopCountdown() {
      clearInterval(timer);
      timer = 0;
      document.removeEventListener('keydown', stopCountdown, true);
      if (note.getAttribute('data-countdown')) { note.removeAttribute('data-countdown'); note.textContent = 'Choisissez un serveur.'; }
    }
    node._onClose = function () { stopCountdown(); };
    return {
      node: node, list: list, note: note,
      status: function (message, bad) { note.className = 'picker-status' + (bad ? ' bad' : ''); note.textContent = message; },
      countdown: function (seconds, action) {
        var left = seconds;
        note.className = 'picker-status';
        note.setAttribute('data-countdown', '1');
        note.textContent = 'Lecture automatique du premier serveur dans ' + left + ' s…';
        // Toute touche interrompt le lancement automatique.
        setTimeout(function () { document.addEventListener('keydown', stopCountdown, true); }, 0);
        timer = setInterval(function () {
          left--;
          if (left <= 0) { stopCountdown(); action(); return; }
          note.textContent = 'Lecture automatique du premier serveur dans ' + left + ' s…';
        }, 1000);
      }
    };
  }
  function fillPicker(sheet, state, seconds) {
    clear(sheet.list);
    var remembered = rememberedServer(state.key);
    var first = -1;
    state.options.forEach(function (option, index) {
      var kind = optionKind(option);
      var failed = state.failed[index];
      if (!failed && first < 0) first = index;
      var tags = [h('span', { class: 'tag ' + kind, text: kind === 'native' ? 'Lecteur natif' : kind === 'resolve' ? 'Automatique' : option.compatPage ? 'Page web' : 'Lecteur web' })];
      var health = optionHealth(option, state.key, index, state.channel.provider);
      if (remembered && optionLabel(option, index) === remembered && health.verdict !== 'recent-fail') tags.push(h('span', { class: 'tag ok', text: 'Dernier utilisé' }));
      else if (index === 0 && !failed && !unavailableHere(option)) tags.push(h('span', { class: 'tag ok', text: 'Recommandé' }));
      if (unavailableHere(option)) tags.push(h('span', { class: 'tag bad', text: 'Indisponible ici' }));
      if (failed) tags.push(h('span', { class: 'tag bad', text: 'Échec' }));
      else if (health.verdict === 'recent-fail') tags.push(h('span', { class: 'tag warn', text: 'Échec récent' }));
      else if (health.verdict === 'unstable') tags.push(h('span', { class: 'tag warn', text: 'Instable' }));
      else if (health.verdict === 'good') tags.push(h('span', { class: 'tag good', text: 'Fiable' }));
      // Historique de ce serveur sur ce téléviseur.
      tags.push(h('span', { class: 'tag stat', text: healthText(option, state.key, index, state.channel.provider).replace(/^(?:Fiable|Instable|Échec récent|Essayé) · /, '') }));
      // Lecteur web sur un moteur web ancien : risque d'échec annoncé.
      if (kind === 'web' && engineOutdated()) tags.push(h('span', { class: 'tag warn', text: 'Moteur web ancien' }));
      var probe = h('span', { class: 'tag probe' });
      probe.style.display = 'none';
      tags.push(probe);
      option._probe = probe;
      sheet.list.appendChild(h('button', { class: 'server f' + (failed ? ' failed' : ''), 'data-index': index, onclick: function () {
        closeLayer(true);
        state.index = index;
        playback = state;
        playOption();
      } }, h('b', { text: String(index + 1) }), h('span', { class: 'name', text: optionLabel(option, index) }), h('span', { class: 'tags' }, tags)));
    });
    var target = sheet.list.children[Math.max(0, first)];
    if (target) focus(target);
    if (first < 0) sheet.status('Aucun serveur ne fonctionne pour cette chaîne en ce moment. Vous pouvez en réessayer un.', true);
    else if (state.options.every(function (option) { return unavailableHere(option); })) {
      sheet.status('Les lecteurs de cette chaîne passent par le serveur Noctra : ils s’ouvriront dans l’appli quand le serveur sera mis à jour. Essayez une autre chaîne.', true);
      return;
    }
    else if (seconds) {
      var probes = probeServers(sheet, state);
      sheet.countdown(seconds, function () {
        if (!document.body.contains(sheet.node)) return;
        // Serveur lancé : le premier vérifié « en ligne », sans attendre au-delà
        // de 6 s les tests en cours. Les serveurs placés avant lui doivent avoir
        // fini leur test (un meilleur serveur pourrait encore répondre).
        // Sans serveur vérifié : le premier qui n'est ni hors ligne ni en échec.
        var deadline = Date.now() + 6000;
        sheet.status('Vérification des serveurs…');
        function usable(option, index) { return !state.failed[index] && option._probeState !== 'down' && !unavailableHere(option); }
        // Parmi les serveurs vérifiés : le mieux classé (fiabilité, type, rapidité).
        function bestVerified() {
          var verified = state.options.filter(function (option, index) { return usable(option, index) && option._probeState === 'up'; });
          return state.options.indexOf(rankOptions(verified, state.key, state.channel.provider)[0]);
        }
        function decide(final) {
          var waiting = false;
          for (var index = 0; index < state.options.length; index++) {
            var option = state.options[index];
            if (!usable(option, index)) continue;
            if (option._probeState === 'up') return waiting && !final ? -1 : bestVerified();
            if (probes.pending[index]) waiting = true;
          }
          if (waiting && !final) return -1;
          // Aucun serveur vérifié : d'abord ceux qu'on ne peut pas tester ici,
          // puis ceux restés sans réponse au test (souvent en panne).
          for (index = 0; index < state.options.length; index++) if (usable(state.options[index], index) && !state.options[index]._probed) return index;
          for (index = 0; index < state.options.length; index++) if (usable(state.options[index], index)) return index;
          return -2;
        }
        function go(final) {
          if (!document.body.contains(sheet.node)) return true;
          var index = decide(final);
          if (index === -1) return false;
          launchBest(state, index >= 0 ? index : Math.max(0, first));
          return true;
        }
        if (go(false)) return;
        probes.onSettled = function () { if (Date.now() < deadline) { if (go(false)) probes.onSettled = null; } };
        setTimeout(function () { if (probes.onSettled) { probes.onSettled = null; go(true); } }, Math.max(0, deadline - Date.now()));
      });
    }
    else sheet.status('Choisissez un serveur.');
    if (engineOutdated() && S.engine.package && state.options.some(function (option) { return optionKind(option) === 'web'; })) addEngineButton(sheet.node);
  }
  // Vérification des serveurs dès l'ouverture de la fenêtre : les 12 premiers,
  // 6 à la fois, dans l'ordre de la liste.
  function probeServers(sheet, state) {
    var probes = { pending: {}, onSettled: null };
    var queue = [];
    state.options.slice(0, 12).forEach(function (option, index) {
      if (state.failed[index] || !option._probe || unavailableHere(option)) return;
      var kind = optionKind(option);
      if (kind === 'web' || (kind === 'native' && option.headers)) return;
      probes.pending[index] = true;
      queue.push(index);
    });
    function next() {
      var index = queue.shift();
      if (index === undefined) return;
      var option = state.options[index];
      option._probe.style.display = '';
      option._probe.className = 'tag probe';
      option._probe.textContent = 'Test…';
      var began = Date.now();
      probeOption(option).then(function (detail) {
        delete probes.pending[index];
        // « Pas de vidéo » et « Direct figé » : hors ligne pour le choix du serveur.
        var result = detail === 'bad' || detail === 'stale' ? 'down' : detail;
        option._probeState = result;
        option._probed = true;
        option._probeMs = Date.now() - began;
        if (document.body.contains(sheet.node)) {
          if (result === 'down') {
            // Hors ligne : compté comme un échec (classé plus bas la prochaine fois).
            recordHealth(state, index, false);
            var recommended = option._probe.parentNode && option._probe.parentNode.querySelector('.tag.ok');
            if (recommended) recommended.remove();
          }
          option._probe.className = 'tag ' + (result === 'up' ? (option._probeMargin > 0 && option._probeMargin < 1.2 ? 'warn' : 'good') : result === 'down' ? 'bad' : 'probe');
          option._probe.textContent = result === 'up' ? (option._probeMargin > 0 ? (option._probeMargin < 1.2 ? 'En ligne · trop lent ici' : option._probeMargin < 2 ? 'En ligne · juste' : 'En ligne') : option._probeMs > 3500 ? 'En ligne · lent' : 'En ligne')
            : detail === 'bad' ? 'Pas de vidéo' : detail === 'stale' ? 'Direct figé' : result === 'down' ? 'Hors ligne' : 'Sans réponse';
        }
        if (probes.onSettled) probes.onSettled();
        next();
      });
    }
    for (var worker = 0; worker < 6; worker++) next();
    return probes;
  }
  // Lancement automatique : les serveurs sont reclassés avec le résultat des
  // tests (vérifiés d'abord, hors ligne à la fin), pour que le changement de
  // serveur en cas d'échec suive le même ordre.
  function launchBest(state, index) {
    var chosen = state.options[index];
    var failed = state.options.filter(function (option, position) { return state.failed[position]; });
    var ranked = rankOptions(state.options.filter(function (option) { return option !== chosen; }), state.key, state.channel.provider);
    state.options = [chosen].concat(ranked);
    state.failed = {};
    state.options.forEach(function (option, position) { if (failed.indexOf(option) >= 0) state.failed[position] = true; });
    closeLayer(true);
    state.index = 0;
    playback = state;
    playOption();
  }
  // Moteur web trop ancien (Android TV) : mise à jour proposée (Play Store).
  function addEngineButton(node) {
    var actions = node.querySelector('.picker-actions');
    if (!actions || actions.querySelector('.engine-update')) return;
    actions.appendChild(h('button', { class: 'btn f engine-update', onclick: function () { native('updateWebEngine'); } },
      icon('download'), 'Mettre à jour le moteur web (Chrome ' + S.engine.major + ')'));
  }
  function showPicker(state, message, seconds) {
    var sheet = pickerSheet(state.channel, '', state.source, state.ctx);
    if (message) sheet.note.parentNode.insertBefore(h('div', { class: 'picker-status bad', text: message }), sheet.note);
    openLayer(sheet.node);
    fillPicker(sheet, state, seconds);
  }

  function playOption(load) {
    var state = playback;
    if (!state) return;
    var option = state.options[state.index];
    if (!option) { playback = null; return; }
    // Chaîne réunie : le nom du serveur contient déjà sa source.
    var label = state.channel._entries || option._prefix ? optionLabel(option, state.index) : [state.channel.provider, optionLabel(option, state.index)].filter(Boolean).join(' · ');
    if (optionKind(option) === 'resolve') {
      toast('Connexion à ' + optionLabel(option, state.index) + '…');
      var fresh = option._resolved && Date.now() - option._resolvedAt < 60000;
      (fresh ? Promise.resolve(option._resolved) : resolveOptions(option.resolveUrl)).then(function (list) {
        if (!list.length) throw new Error('Serveur vide');
        list.forEach(function (item) {
          item.renewUrl = option.resolveUrl;
          if (!item.label) item.label = option.label;
          inheritSource(item, option);
        });
        // Serveurs obtenus : le plus fiable d'abord.
        list = rankOptions(list, state.key, state.channel.provider);
        state.options.splice.apply(state.options, [state.index, 1].concat(list));
        if (playback === state) playOption(load);
      }, function () {
        if (load && playback === state) { playerFailed({ message: 'Ce serveur ne répond pas.' }); return; }
        failOption(state, 'Ce serveur ne répond pas.');
      });
      return;
    }
    state.startedAt = Date.now();
    if (option.streamUrl) {
      var mime = option.mime || (tsTransport(option) || tsTransport(state.channel) ? 'video/mp2t' : '');
      state.playId = playId();
      var request = { url: absolute(option.streamUrl), title: state.channel.name, subtitle: label, mime: mime, headers: option.headers || null, epg: epgPayload(state), playSessionId: state.playId };
      // Zapping : même lecteur, nouveau flux.
      if (load) { request.command = 'load'; native('playerCommand', request); return; }
      if (!native('play', request)) {
        toast('Le lecteur natif est disponible dans l’appli Noctra TV.', true);
      }
      return;
    }
    // Chaîne sans flux direct : le lecteur natif se ferme, le lecteur web s'ouvre.
    // (fermeture de ce lecteur ignorée : nouvel identifiant de lecture).
    if (load) { state.playId = playId(); native('playerCommand', { command: 'stop' }); }
    openEmbed(state, option, label);
  }
  function markFailed(state) {
    state.failed[state.index] = true;
    recordHealth(state, state.index, false);
    // Flux repéré mais illisible en natif : son lecteur web reste proposé, sans repérage.
    var failedOption = state.options[state.index];
    if (failedOption && failedOption.sniffedFrom) {
      failedOption.sniffedFrom.noSniff = true;
      // Relais vers le lecteur natif en échec pour ce site : évité les prochaines fois.
      rememberWebMode(failedOption.sniffedFrom.url, 'noSniff');
      state.options.forEach(function (option, index) { if (option === failedOption.sniffedFrom) delete state.failed[index]; });
    }
  }
  // Serveur tombé pendant la lecture : lien neuf du même serveur s'il avait
  // fonctionné, sinon serveur suivant, chargé dans le lecteur ouvert.
  function playerFailed(event) {
    var state = playback;
    if (!state) return;
    var option = state.options[state.index];
    if (event.played && option && option.renewUrl && !state.renewed) {
      state.renewed = true;
      native('playerCommand', { command: 'zapping', title: state.channel.name, subtitle: optionLabel(option, state.index), epg: epgPayload(state), message: 'Reconnexion au serveur…' });
      resolveOptions(option.renewUrl).then(function (list) {
        if (playback !== state) return;
        var fresh = list.filter(function (item) { return optionKind(item) === 'native'; })[0] || list[0];
        if (!fresh) throw new Error('vide');
        fresh.renewUrl = option.renewUrl;
        if (!fresh.label) fresh.label = option.label;
        inheritSource(fresh, option);
        state.options[state.index] = fresh;
        playOption(true);
      }).catch(function () { if (playback === state) playerFailed({ message: event.message }); });
      return;
    }
    // Serveur annoncé « en ligne » par le test mais qui n'a jamais lu : le test
    // de ce fournisseur comptera moins la prochaine fois.
    if (!event.played) recordProbe(option, false);
    markFailed(state);
    var next = -1;
    // Serveur suivant : d'abord ceux vérifiés en ligne, puis ceux ni « hors
    // ligne » au test ni impossibles ici, puis les autres.
    for (var pass = 0; pass < 3 && next < 0; pass++) {
      for (var step = 1; step <= state.options.length; step++) {
        var index = (state.index + step) % state.options.length;
        var candidate = state.options[index];
        if (state.failed[index]) continue;
        if (pass === 0 && !(candidate && candidate._probeState === 'up' && !unavailableHere(candidate))) continue;
        if (pass === 1 && candidate && (candidate._probeState === 'down' || unavailableHere(candidate))) continue;
        next = index;
        break;
      }
    }
    if (next < 0) {
      // Plus aucun serveur : le lecteur se ferme (fermeture ignorée) et la fenêtre des serveurs s'affiche.
      state.playId = playId();
      native('playerCommand', { command: 'stop' });
      playback = null;
      showPicker(state, event.message || 'Aucun serveur ne fonctionne pour cette chaîne en ce moment.', 0);
      return;
    }
    state.index = next;
    state.renewed = false;
    native('playerCommand', { command: 'zapping', title: state.channel.name, subtitle: optionLabel(state.options[next], next), epg: epgPayload(state), message: 'Serveur indisponible · essai de ' + optionLabel(state.options[next], next) + '…' });
    playOption(true);
  }
  // Panneau « Serveurs » du lecteur : serveurs de la chaîne en cours.
  function sendServers() {
    var state = playback;
    if (!state) return;
    native('playerCommand', {
      command: 'servers', mode: 'servers', current: state.index, title: state.channel.name + ' · serveurs',
      items: state.options.map(function (option, index) {
        var kind = optionKind(option);
        return {
          name: optionLabel(option, index),
          sub: [kind === 'native' ? 'Lecteur natif' : kind === 'resolve' ? 'Automatique' : option.compatPage ? 'Page web' : 'Lecteur web',
            index === state.index ? 'en cours' : '', state.failed[index] ? 'échec' : healthText(option, state.key, index, state.channel.provider)].filter(Boolean).join(' · ')
        };
      })
    });
  }
  function pickServer(index) {
    var state = playback;
    if (!state || !state.options[index] || index === state.index) return;
    state.index = index;
    state.renewed = false;
    delete state.failed[index];
    native('playerCommand', { command: 'zapping', title: state.channel.name, subtitle: optionLabel(state.options[index], index), epg: epgPayload(state), message: 'Connexion à ' + optionLabel(state.options[index], index) + '…' });
    playOption(true);
  }
  // Coupures répétées sur le serveur en cours (3 en 5 min) : passage sur un
  // serveur vérifié en ligne, plus rapide au test et sans coupures connues ;
  // au plus une fois toutes les 5 min. Sans meilleur candidat, on reste
  // (le lecteur garde alors plus de réserve à chaque coupure).
  function struggling(state) {
    var current = state.options[state.index];
    if (!current || (state.switchedAt && Date.now() - state.switchedAt < 300000)) return;
    var store = healthStore();
    var currentMargin = current._probeMargin || 0;
    var best = -1, bestScore = Infinity;
    state.options.forEach(function (option, index) {
      if (index === state.index || state.failed[index] || option._probeState !== 'up' || unavailableHere(option) || optionKind(option) !== 'native') return;
      var margin = option._probeMargin || 0;
      if (margin && margin < 1.5) return;
      if (margin && currentMargin && margin < currentMargin * 1.2) return;
      var own = store[healthIds(option, state.key, index, state.channel.provider)[0]];
      if (choppy(own)) return;
      var score = probePenalty(option) - optionHealth(option, state.key, index, state.channel.provider).score;
      if (score < bestScore) { bestScore = score; best = index; }
    });
    // Le serveur quitté garde la trace de ses coupures (3 en 5 min au moins).
    recordSmooth(state, state.index, 3, 300000);
    if (best < 0) return;
    state.switchedAt = Date.now();
    native('playerCommand', { command: 'zapping', title: state.channel.name, subtitle: optionLabel(state.options[best], best), epg: epgPayload(state), message: 'Coupures répétées · passage sur ' + optionLabel(state.options[best], best) + '…' });
    state.index = best;
    state.renewed = false;
    playOption(true);
  }
  function failOption(state, message) {
    markFailed(state);
    var next = -1;
    state.options.some(function (option, index) { if (!state.failed[index] && option._probeState === 'up' && !unavailableHere(option)) { next = index; return true; } return false; });
    if (next < 0) state.options.some(function (option, index) { if (!state.failed[index] && option._probeState !== 'down' && !unavailableHere(option)) { next = index; return true; } return false; });
    if (next < 0) state.options.some(function (option, index) { if (!state.failed[index]) { next = index; return true; } return false; });
    if (next < 0) {
      playback = null;
      // Dernier serveur en échec : sa raison reste affichée (photo utile au diagnostic).
      showPicker(state, message || '', 0);
      return;
    }
    showPicker(state, message, 4);
  }
  function succeeded(state) {
    var option = state.options[state.index];
    if (!option) return;
    rememberServer(state.key, optionLabel(option, state.index));
    // Une seule réussite comptée par serveur et par lecture.
    if (state.okIndex === state.index && state.okOption === option) return;
    state.okIndex = state.index;
    state.okOption = option;
    recordHealth(state, state.index, true);
    recordProbe(option, true);
  }
  function quickExit(state) {
    return state.options.length > 1 && Date.now() - state.startedAt < 25000;
  }
  // Retour du lecteur : la carte de la dernière chaîne regardée (après un
  // zapping aussi) reprend la sélection.
  function focusChannelCard(state) {
    if (!state || !state.channel || layer.firstChild) return;
    var key = channelKey(state.channel, state.source);
    var target = null;
    Array.prototype.some.call(main.querySelectorAll('[data-channel]'), function (node) {
      if (node.getAttribute('data-channel') === key) { target = node; return true; }
      return false;
    });
    if (target) focus(target);
  }
  function playerClosed(result) {
    var state = playback;
    if (!state) return;
    // Lecteur d'une chaîne quittée par zapping : fermeture sans conséquence.
    if (result.playSessionId && state.playId && result.playSessionId !== state.playId) return;
    if (result.played) succeeded(state);
    if (result.ok) {
      playback = null;
      if (!result.played && quickExit(state)) showPicker(state, '', 0);
      else focusChannelCard(state);
      return;
    }
    // Coupure après une lecture réussie : nouveau lien (jeton neuf) du même serveur.
    var option = state.options[state.index];
    if (result.played && option && option.renewUrl && !state.renewed) {
      state.renewed = true;
      toast('Reconnexion au serveur…');
      resolveOptions(option.renewUrl).then(function (list) {
        var fresh = list.filter(function (item) { return optionKind(item) === 'native'; })[0] || list[0];
        if (!fresh) throw new Error('vide');
        fresh.renewUrl = option.renewUrl;
        if (!fresh.label) fresh.label = option.label;
        inheritSource(fresh, option);
        state.options[state.index] = fresh;
        playOption();
      }, function () { failOption(state, result.error || 'Le flux s’est interrompu.'); });
      return;
    }
    failOption(state, result.error || 'Lecture impossible.');
  }

  // Lecteur web (page du fournisseur) : dans l'appli, écran natif séparé
  // (processus à part, curseur piloté par les flèches) ; un plantage de la
  // page ne ferme plus l'appli. Dans un navigateur (essais) : iframe.
  var webPlayback = null;
  // Cadre du lecteur web configuré exactement comme sur PC (configureTvIframe) :
  // certains lecteurs refusent tout bac à sable, d'autres n'acceptent pas de
  // référent ; les pages tierces préparées par Noctra restent isolées.
  var TRUSTED_EMBED_HOSTS = ['livewatch.top', 'www.livewatch.top', 'witv.football', 'www.witv.football', 'oha.cx', 'www.oha.cx', 'streamed.pk', 'www.streamed.pk', 'embed.st', 'www.embed.st', 'volkamax.club', 'www.volkamax.club', 'bzh-sport.lat', 'www.bzh-sport.lat', 'zonalive.click', 'www.zonalive.click', '178.239.115.119'];
  var DEFAULT_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation';
  function frameConfig(channel, option, url) {
    var provider = option.provider || channel.provider || '';
    var referrer = option.referrer || (channel.liveWatchDocsEmbed ? 'no-referrer' : 'strict-origin-when-cross-origin');
    var target = null;
    try { target = new URL(url, location.href); } catch (error) { return { sandbox: DEFAULT_SANDBOX, referrer: referrer }; }
    var local = target.origin === serverOrigin();
    if (['BrigitteTV', 'DLStreams', 'DaddyLive', 'Streamed', 'Volkamax', 'FCTV33', 'RénéVéo', 'BowdTV', 'Xtemus'].indexOf(provider) >= 0) {
      if (!local && /^https?:$/.test(target.protocol)) return { sandbox: null, referrer: referrer };
      if (local) return { sandbox: DEFAULT_SANDBOX, referrer: referrer };
    }
    if (channel.noSandbox || option.noSandbox || provider === 'Alternative') return { sandbox: null, referrer: referrer };
    if (local && /\/api\/tv\/(?:embed\/|oha\/embed\/|livewatch\/(?:embed\/|vip\/[^/]+\/embed(?:$|\/)))/.test(target.pathname)) {
      return { sandbox: 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation', referrer: referrer };
    }
    var trusted = TRUSTED_EMBED_HOSTS.indexOf(target.hostname.toLowerCase()) >= 0 || ['LiveWatch', 'WiTV', 'OHA', 'Streamed', 'Volkamax'].indexOf(provider) >= 0;
    return { sandbox: trusted ? null : DEFAULT_SANDBOX, referrer: referrer };
  }
  // Ce qui a marché pour chaque site de lecteur web, mémorisé sur la TV :
  // mode allégé (lecture réussie ainsi) et relais vers le lecteur natif
  // à éviter (échoué pour ce site). Retenu 14 jours.
  var WEB_MODE_KEY = 'noctra-tv-webmode-v1';
  function webHost(url) {
    try { return new URL(absolute(url), location.href).hostname.replace(/^www\./, ''); } catch (error) { return ''; }
  }
  function webModes() {
    try { return JSON.parse(localStorage.getItem(WEB_MODE_KEY) || '{}') || {}; } catch (error) { return {}; }
  }
  function webMode(url) {
    var entry = webModes()[webHost(url)] || {};
    var fresh = function (at) { return at && Date.now() - at < 14 * 86400000; };
    return { lite: fresh(entry.lite), noSniff: fresh(entry.noSniff) };
  }
  function rememberWebMode(url, key) {
    var host = webHost(url);
    if (!host) return;
    var modes = webModes();
    modes[host] = modes[host] || {};
    modes[host][key] = Date.now();
    try { localStorage.setItem(WEB_MODE_KEY, JSON.stringify(modes)); } catch (error) { /* stockage indisponible */ }
  }
  function openEmbed(state, option, label) {
    var url = absolute(option.url);
    var frame = frameConfig(state.channel, option, url);
    var mode = webMode(url);
    var provider = option.provider || state.channel.provider || '';
    // Moteur web ancien : ces lecteurs lourds ne tiennent qu'en mode allégé.
    var lite = Boolean(option.lite) || mode.lite || (engineOutdated() && /DLStreams|DaddyLive/i.test(provider));
    option._lite = lite;
    // Pages externes : la vidéo reste dans le lecteur web (le relais automatique
    // vers le lecteur natif échouait et faisait changer de lecteur trop vite).
    // Les lecteurs préparés par le serveur Noctra transmettent toujours leur flux.
    var sniff = Boolean(option.sniff) && !option.noSniff && !mode.noSniff;
    if (S.caps.webPlayer !== false && native('webPlayer', { url: url, title: state.channel.name, subtitle: label, compat: Boolean(option.compatPage), sandbox: frame.sandbox, referrer: frame.referrer, sniff: sniff, lite: lite })) {
      webPlayback = { state: state, option: option };
      return;
    }
    openEmbedFrame(state, option, label);
  }
  function webPlayerClosed(result) {
    var entry = webPlayback;
    webPlayback = null;
    if (!entry || playback !== entry.state) return;
    var state = entry.state;
    // Journal du lecteur affiché avec l'erreur : la cause exacte, visible à l'écran.
    var log = result.log ? '\nJournal du lecteur :\n' + result.log : '';
    // Script du lecteur illisible (SyntaxError) sur un moteur web ancien :
    // la cause réelle est expliquée en premier, avec son remède.
    // (« Unexpected token '<' » : une page reçue à la place d'un script, pas un problème de moteur.)
    if (!result.playing && engineOutdated() && /SyntaxError(?!: Unexpected token '<')|trop ancien/.test(String(result.log || '') + ' ' + String(result.error || ''))) {
      log = '\nCause probable : le moteur web du téléviseur (Chrome ' + S.engine.major + ') est trop ancien pour ce lecteur, malgré l’adaptation automatique de ses scripts. '
        + 'Choisissez un serveur « Lecteur natif »' + (S.engine.package ? ', ou mettez à jour « Android System WebView » (bouton ci-dessous) si le téléviseur le permet.' : '.') + log;
    }
    if (result.media) {
      // Flux trouvé (pont du serveur, ou liste HLS demandée par la page) :
      // lecture native avec les en-têtes de la page, plus stable.
      state.options.splice(state.index + 1, 0, { playbackType: 'stream', streamUrl: result.media, headers: result.headers || null, mime: result.mediaHls ? 'application/x-mpegURL' : '', sniffedFrom: entry.option, label: optionLabel(entry.option, state.index) + ' · direct', renewUrl: entry.option.renewUrl, provider: entry.option.provider, _prefix: entry.option._prefix });
      state.index++;
      playOption();
      return;
    }
    // Arrêt du lecteur (mémoire du téléviseur, moteur web dans le même processus
    // sur Android 7) : nouvel essai du même serveur en mode allégé, une fois.
    if (result.crashed && !entry.option._lite) {
      entry.option.lite = true;
      toast('Le lecteur web s’est arrêté : nouvel essai allégé (publicités bloquées)…');
      playOption();
      return;
    }
    if (result.crashed) { failOption(state, 'Le lecteur web s’est arrêté' + (result.error ? ' : ' + result.error : '.') + log); return; }
    if (!result.ok) { failOption(state, (result.error || 'Ce lecteur web ne répond pas.') + log); return; }
    // Regardé plus d'une minute puis quitté normalement : ce serveur fonctionne
    // (et, en mode allégé, ce mode est retenu pour ce site).
    var watched = result.ok && !result.error && Date.now() - state.startedAt > 60000;
    if (result.playing || watched) succeeded(state);
    if (watched && entry.option._lite) rememberWebMode(entry.option.url, 'lite');
    var quick = !result.playing && !watched && quickExit(state);
    playback = null;
    // Erreur constatée par le lecteur (réponse 403, serveur injoignable…) : affichée avec les autres serveurs.
    if (!result.playing && result.error) { state.failed[state.index] = true; showPicker(state, result.error + log, 0); return; }
    if (quick) showPicker(state, log ? log.slice(1) : '', 0);
  }
  function openEmbedFrame(state, option, label) {
    var url = absolute(option.url);
    var external = url.indexOf(serverOrigin() + '/') !== 0;
    var hint = h('div', { class: 'hint' }, h('b', { text: state.channel.name }), ' · ' + label,
      h('div', { class: 'keys', text: '◀ ▲ ▼ ▶ déplacer le curseur · OK cliquer (lecture, plein écran) · Retour quitter' }));
    var config = frameConfig(state.channel, option, url);
    var frame = h('iframe', { referrerpolicy: config.referrer, sandbox: config.sandbox, allow: 'autoplay *; fullscreen *; encrypted-media *; picture-in-picture *', allowfullscreen: true, scrolling: option.compatPage ? 'auto' : 'no' });
    frame.src = url;
    var node = h('div', { class: 'embed' }, frame, hint);
    var handedOff = false;
    function onState(event) {
      var data = event.data;
      if (!data || typeof data !== 'object' || event.source !== frame.contentWindow) return;
      if (!/^noctra-[a-z]+-state$/.test(String(data.type || ''))) return;
      if (data.state === 'playing' || data.state === 'ready') { hint.classList.add('gone'); succeeded(state); }
      // Le pont du serveur a trouvé le flux vidéo : lecteur natif, plus stable.
      if (data.state === 'media' && data.url && !handedOff && !external) {
        handedOff = true;
        state.options.splice(state.index + 1, 0, { playbackType: 'stream', streamUrl: data.url, label: optionLabel(option, state.index) + ' · direct', renewUrl: option.renewUrl });
        closeLayer(true);
        state.index++;
        playOption();
        return;
      }
      if (data.state === 'error' || data.state === 'stalled' || data.state === 'vip-missed') {
        closeLayer(true);
        failOption(state, data.message || 'Ce lecteur web ne répond pas.');
      }
    }
    window.addEventListener('message', onState);
    node._onClose = function (silent) {
      window.removeEventListener('message', onState);
      frame.src = 'about:blank';
      document.body.classList.remove('embed-open');
      native('cursor', { data: false });
      native('keepScreenOn', { data: false });
      if (playback === state && !silent) {
        var quick = quickExit(state);
        if (!quick) succeeded(state);
        playback = null;
        if (quick) setTimeout(function () { showPicker(state, '', 0); }, 0);
      }
    };
    native('keepScreenOn', { data: true });
    // Page d'accueil masquée pendant le lecteur web : moins de mémoire et de dessin.
    document.body.classList.add('embed-open');
    openLayer(node);
    native('cursor', { data: true });
    setTimeout(function () { hint.classList.add('gone'); }, 7000);
  }

  // ── Multiview ──────────────────────────────────────────────────────
  // Jusqu'à 12 chaînes : la définition de chaque vignette est réduite à sa
  // taille et un décodeur de secours prend le relais au-delà des décodeurs
  // matériels du téléviseur.
  var MULTI_MAX = 12;
  var multi = { on: false, items: [] };
  function toggleMulti(channel, source) {
    var key = channelKey(channel, source);
    var index = -1;
    multi.items.some(function (item, i) { if (item.key === key) { index = i; return true; } return false; });
    if (index >= 0) multi.items.splice(index, 1);
    else if (multi.items.length >= MULTI_MAX) { toast(MULTI_MAX + ' chaînes au maximum dans le multiview.', true); return; }
    else multi.items.push({ key: key, channel: channel, source: source });
    Array.prototype.forEach.call(main.querySelectorAll('[data-channel]'), markMulti);
    renderMultiBar();
    if (index < 0) multiSheet();
  }
  // Après chaque ajout : lancer tout de suite, sans devoir faire défiler
  // toute la liste jusqu'à la barre du bas.
  function multiSheet() {
    var full = multi.items.length >= MULTI_MAX;
    var list = h('div', { class: 'list scroll' },
      h('h2', null, 'Multiview · ' + multi.items.length + '/' + MULTI_MAX, h('small', { text: multi.items.map(function (item) { return item.channel.name; }).join(', ') })),
      h('button', { class: 'btn primary f', autofocus: full || null, onclick: function () { closeLayer(); launchMulti(); } }, icon('grid'), 'Lancer le multiview (' + multi.items.length + ' chaîne' + (multi.items.length > 1 ? 's' : '') + ')'),
      full ? null : h('button', { class: 'btn f', autofocus: true, onclick: function () { closeLayer(); } }, icon('requests'), 'Ajouter une autre chaîne'),
      h('button', { class: 'btn f', text: 'Vider la sélection', onclick: function () {
        closeLayer();
        multi.items = [];
        Array.prototype.forEach.call(main.querySelectorAll('[data-channel]'), markMulti);
        renderMultiBar();
      } }));
    openLayer(h('div', { class: 'modal' }, list));
  }
  function markMulti(node) {
    var key = node.getAttribute('data-channel');
    var position = -1;
    multi.items.some(function (item, i) { if (item.key === key) { position = i; return true; } return false; });
    var badge = node.querySelector('.multi-badge');
    if (position < 0) { if (badge) badge.remove(); node.classList.remove('picked'); return; }
    node.classList.add('picked');
    if (!badge) { badge = h('span', { class: 'multi-badge' }); node.appendChild(badge); }
    badge.textContent = String(position + 1);
  }
  function renderMultiBar() {
    var bar = document.getElementById('multibar');
    if (bar) bar.remove();
    main.classList.remove('with-multibar');
    if (!multi.on && !multi.items.length) return;
    if (!current || (current.name !== 'live' && current.name !== 'liveSource')) return;
    main.classList.add('with-multibar');
    bar = h('div', { id: 'multibar', class: 'multibar' },
      h('div', { class: 'multi-text' }, h('b', { text: 'Multiview' }), ' · ' + (multi.items.length
        ? multi.items.map(function (item) { return item.channel.name; }).join(', ')
        : 'choisissez 2 à ' + MULTI_MAX + ' chaînes avec OK')),
      h('button', { class: 'btn primary f', disabled: multi.items.length < 1, onclick: launchMulti }, icon('grid'), 'Lancer (' + multi.items.length + '/' + MULTI_MAX + ')'),
      h('button', { class: 'btn f', text: 'Vider', onclick: function () {
        multi.items = [];
        Array.prototype.forEach.call(main.querySelectorAll('[data-channel]'), markMulti);
        renderMultiBar();
      } }));
    main.appendChild(bar);
  }
  // Seuls les flux directs peuvent partager l'écran (un lecteur natif par
  // vignette). Chaque vignette reçoit tous les serveurs de sa chaîne : le
  // multiview passe seul au suivant, ou au choix depuis son menu (OK).
  function multiviewOptions(options, channel) {
    var list = [];
    options.forEach(function (option, index) {
      if (option.manualOnly) return;
      var label = optionLabel(option, index);
      if (option.streamUrl) list.push({ label: label, url: absolute(option.streamUrl), mime: tsTransport(option) || tsTransport(channel) ? 'video/mp2t' : '' });
      else if (optionKind(option) === 'resolve') list.push({ label: label, resolve: absolute(option.resolveUrl) });
    });
    // Serveurs directs d'abord.
    return list.filter(function (item) { return item.url; }).concat(list.filter(function (item) { return !item.url; }));
  }
  // Catalogue pour « Ajouter une chaîne » dans le multiview : chaînes des
  // sources déjà ouvertes (flux direct ou serveurs à demander au serveur Noctra).
  var catalogSources = {};
  function multiCatalog() {
    var list = [];
    Object.keys(catalogSources).forEach(function (key) {
      var data = cache[key];
      var entry = catalogSources[key];
      ((data && data.channels) || []).forEach(function (channel) {
        if (list.length >= 4000) return;
        var stream = channel.playbackType === 'stream' && channel.streamUrl ? absolute(channel.streamUrl) : '';
        var resolver = !stream && channel.resolverUrl ? absolute(channel.resolverUrl) : '';
        if (!stream && !resolver) return;
        list.push({
          title: channel.name, subtitle: channel.provider || '',
          group: entry.label + (channel.group ? ' · ' + channel.group : ''),
          stream: stream, resolver: resolver, mime: tsTransport(channel) ? 'video/mp2t' : ''
        });
      });
    });
    return list;
  }
  function launchMulti() {
    if (!multi.items.length) return;
    toast('Préparation du multiview…');
    var picked = multi.items.slice();
    Promise.all(picked.map(function (item) {
      // Serveurs classés par fiabilité (le multiview commence par le plus stable).
      return serverList(item.channel, item.source, item.key).then(function (options) {
        return multiviewOptions(options, item.channel);
      }, function () { return []; });
    })).then(function (lists) {
      var items = [];
      var skipped = [];
      lists.forEach(function (options, i) {
        var channel = picked[i].channel;
        if (!options.length) { skipped.push(channel.name); return; }
        items.push({ title: channel.name, subtitle: channel.provider || '', options: options });
      });
      if (skipped.length) toast('Sans flux direct, ignorées : ' + skipped.join(', '), true);
      if (!items.length) return;
      if (!native('multiview', { items: items, catalog: multiCatalog() })) toast('Le multiview est disponible dans l’appli Noctra TV.', true);
    });
  }

  // ── Demandes et découverte (Jellyseerr) ────────────────────────────
  var mediaStatus = { 2: ['En attente', 'pending'], 3: ['En cours', 'pending'], 4: ['Partiel', ''], 5: ['Disponible', ''] };
  function seerrCard(item) {
    var status = item.mediaInfo && mediaStatus[item.mediaInfo.status];
    var date = item.releaseDate || item.firstAirDate;
    return card({
      title: item.title || item.name || 'Sans titre',
      sub: [year(date), item.mediaType === 'tv' ? 'Série' : 'Film'].filter(Boolean).join(' · '),
      image: tmdb(item.posterPath),
      badge: status ? status[0] : '',
      badgeClass: status ? status[1] : '',
      onSelect: function () { mediaSheet(item); }
    });
  }
  function mediaSheet(item) {
    var title = item.title || item.name || 'Sans titre';
    var status = item.mediaInfo && item.mediaInfo.status;
    var jellyfinId = item.mediaInfo && item.mediaInfo.jellyfinMediaId;
    var note = h('div', { class: 'note' });
    var requestButton = h('button', { class: 'btn primary f', autofocus: true, onclick: function () {
      requestButton.disabled = true;
      note.textContent = 'Envoi de la demande…';
      api('/api/jellyseerr/request', { method: 'POST', json: { mediaType: item.mediaType === 'tv' ? 'tv' : 'movie', mediaId: item.id, title: title, year: year(item.releaseDate || item.firstAirDate) || null } })
        .then(function () {
          note.textContent = 'Demande envoyée. Elle apparaîtra dans « Mes demandes ».';
          toast('Demande envoyée : ' + title);
          delete cache.requests;
        }, function (error) {
          requestButton.disabled = false;
          note.textContent = error.message;
        });
    } }, icon('requests'), status >= 2 ? 'Déjà demandé' : 'Demander');
    if (status >= 2) requestButton.disabled = true;
    var actions = h('div', { class: 'actions' },
      jellyfinId ? h('button', { class: 'btn primary f', autofocus: true, onclick: function () { closeLayer(); openItem(jellyfinId); } }, icon('play'), 'Regarder') : null,
      status >= 5 ? null : requestButton,
      h('button', { class: 'btn f', onclick: function () { closeLayer(); go('search', { section: 'search', query: title }); } }, icon('search'), 'Chercher dans mes médiathèques'),
      h('button', { class: 'btn f', text: 'Fermer', onclick: closeLayer }));
    if (jellyfinId) requestButton.removeAttribute('autofocus');
    var facts = h('div', { class: 'facts' },
      h('span', null, h('b', { text: item.mediaType === 'tv' ? 'Série' : 'Film' })),
      year(item.releaseDate || item.firstAirDate) ? h('span', { text: year(item.releaseDate || item.firstAirDate) }) : null,
      item.voteAverage ? h('span', { text: '★ ' + Number(item.voteAverage).toFixed(1) }) : null,
      status && mediaStatus[status] ? h('span', { text: mediaStatus[status][0] }) : null,
      item.reason ? h('span', { text: item.reason }) : null);
    openLayer(h('div', { class: 'modal' }, h('div', { class: 'sheet' },
      item.posterPath ? h('img', { class: 'poster', src: tmdb(item.posterPath, 'w500'), alt: '' }) : h('div', { class: 'poster' }),
      h('div', { class: 'body scroll' }, h('h2', { text: title }), facts, item.overview ? h('p', { text: item.overview }) : null, actions, note))));
  }
  function seerrUnavailable() {
    return S.config && S.config.jellyseerr === false;
  }

  views.requests = function (params, alive) {
    main.appendChild(head('Demandes', 'Demandez un film ou une série : il sera ajouté automatiquement à la médiathèque.'));
    if (seerrUnavailable()) { main.appendChild(h('div', { class: 'empty', text: 'Jellyseerr n’est pas configuré sur le serveur Noctra.' })); return; }
    var results = h('div');
    var field = searchField('Titre d’un film ou d’une série…', params.query || '', function (value) {
      current.params = { query: value };
      search(value);
    });
    main.appendChild(field.node);
    main.appendChild(results);
    var mine = h('div', null, loading('Chargement de vos demandes…'));
    main.appendChild(mine);
    function search(value) {
      clear(results);
      if (!value) return;
      results.appendChild(loading('Recherche…'));
      api('/api/jellyseerr/search?q=' + encodeURIComponent(value)).then(function (data) {
        if (!alive() || field.input.value.trim() !== value) return;
        clear(results);
        var items = ((data && data.results) || []).filter(function (item) { return item.mediaType === 'movie' || item.mediaType === 'tv'; });
        add(results, row('Résultats', items.map(seerrCard), items.length + ' titres') || h('div', { class: 'empty', text: 'Aucun résultat pour « ' + value + ' ».' }));
      }, function (error) {
        if (!alive()) return;
        clear(results);
        results.appendChild(failure(error));
      });
    }
    if (params.query) search(params.query);
    var load = cache.requests ? Promise.resolve(cache.requests) : api('/api/jellyseerr/requests').then(function (data) { cache.requests = data; return data; });
    return load.then(function (data) {
      if (!alive()) return;
      clear(mine);
      var labels = { 1: ['En attente', 'pending'], 2: ['Approuvée', ''], 3: ['Refusée', 'declined'] };
      var cards = ((data && data.results) || []).slice(0, 40).map(function (request) {
        var media = request.media || {};
        var available = media.status === 5;
        var label = available ? ['Disponible', ''] : (labels[request.status] || ['', '']);
        return card({
          title: request.displayTitle || media.title || media.name || 'Demande',
          sub: [year(request.releaseDate), request.mediaType === 'tv' ? 'Série' : 'Film'].filter(Boolean).join(' · '),
          image: tmdb(request.posterPath),
          badge: label[0], badgeClass: label[1],
          onSelect: function () {
            if (media.jellyfinMediaId) openItem(media.jellyfinMediaId);
            else toast(label[0] ? 'Demande ' + label[0].toLowerCase() + '.' : 'Demande enregistrée.');
          }
        });
      });
      var quota = data && data.quota;
      var note = quota && quota.enforced && quota.remaining !== null ? quota.remaining + ' demande(s) possible(s) en attente' : '';
      add(mine, row('Mes demandes', cards, note) || h('div', { class: 'empty', text: 'Aucune demande pour le moment.' }));
    }, function (error) {
      if (!alive()) return;
      clear(mine);
      mine.appendChild(failure(error));
    });
  };

  var discoverCategories = [
    { id: 'smart', label: 'Pour toi' }, { id: 'trending', label: 'Tendances' }, { id: 'cinema', label: 'Au cinéma' },
    { id: 'streaming', label: 'Streaming' }, { id: 'series', label: 'Séries' }, { id: 'anime', label: 'Animes' },
    { id: 'animation', label: 'Animation' }, { id: 'year', label: 'Cette année' }, { id: 'classics', label: 'Classiques' },
    { id: 'gems', label: 'Pépites' }
  ];
  views.discover = function (params, alive) {
    var category = params.category || 'smart';
    main.appendChild(head('Découvrir', 'Sélections personnalisées et nouveautés, à demander en un clic.'));
    if (seerrUnavailable() && S.config.discovery === false) { main.appendChild(h('div', { class: 'empty', text: 'La découverte n’est pas configurée sur le serveur Noctra.' })); return; }
    var chips = h('div', { class: 'chips' });
    discoverCategories.forEach(function (option) {
      chips.appendChild(chip(option.label, option.id === category, function () {
        current.params = { category: option.id };
        current.focusIndex = -1;
        show(false);
        setTimeout(function () {
          Array.prototype.forEach.call(main.querySelectorAll('.chips .chip'), function (node) { if (node.textContent === option.label) focus(node); });
        }, 0);
      }));
    });
    main.appendChild(chips);
    var grid = h('div', { class: 'grid posters' });
    var status = loading();
    main.appendChild(grid);
    main.appendChild(status);
    var pageNumber = 1, more = true, busy = false, seen = {};
    function page() {
      if (busy || !more) return Promise.resolve();
      busy = true;
      return api('/api/discovery?category=' + category + '&mode=balanced&page=' + pageNumber, { timeout: 45000 }).then(function (data) {
        busy = false;
        if (!alive()) return;
        status.style.display = 'none';
        var items = ((data && data.results) || []).filter(function (item) {
          var key = item.mediaType + ':' + item.id;
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        });
        items.forEach(function (item) { grid.appendChild(seerrCard(item)); });
        more = Boolean(data && data.hasMore && items.length);
        pageNumber = (data && data.nextPage) || pageNumber + 1;
        armTail(grid, more ? page : null);
        if (!grid.firstChild) grid.appendChild(h('div', { class: 'empty', text: (data && data.warning) || 'Aucune suggestion pour le moment.' }));
      }, function (error) {
        busy = false;
        if (!alive()) return;
        status.replaceWith(failure(error, function () { show(false); }));
      });
    }
    return page();
  };

  // ── Roulette ───────────────────────────────────────────────────────
  // Rouleau d'affiches qui ralentit sur le titre tiré, puis grande révélation.
  var roulette = { library: '', genre: '', count: 1, rating: 0, unplayed: true };
  try {
    var savedRoulette = JSON.parse(localStorage.getItem('noctra-tv-roulette') || 'null');
    if (savedRoulette) Object.keys(roulette).forEach(function (key) { if (key in savedRoulette) roulette[key] = savedRoulette[key]; });
  } catch (error) { /* réglages par défaut */ }
  function saveRoulette() {
    try { localStorage.setItem('noctra-tv-roulette', JSON.stringify(roulette)); } catch (error) { /* stockage indisponible */ }
  }
  views.roulette = function (params, alive) {
    var panel = h('aside', { class: 'roulette-panel' }, h('h1', { text: 'Roulette' }), h('p', { class: 'sub', text: 'Laissez Noctra choisir ce soir.' }));
    var stage = h('section', { class: 'roulette-stage' });
    var spin = h('button', { class: 'btn primary f roulette-go', 'data-start': true, onclick: draw }, icon('roulette'), 'Lancer la roulette');
    var genreButton = h('button', { class: 'segment wide f', onclick: pickGenre }, icon('tag'), h('span', { text: roulette.genre || 'Tous les genres' }));
    function pickGenre() {
      var list = h('div', { class: 'genre-grid' }, loading('Chargement des genres…'));
      var sheet = h('div', { class: 'list genres-list scroll' }, h('h2', null, 'Genre', h('small', { text: roulette.library ? 'Dans la médiathèque choisie' : 'Dans toutes les médiathèques' })), list,
        h('button', { class: 'btn f', text: 'Fermer', onclick: closeLayer }));
      openLayer(h('div', { class: 'modal' }, sheet));
      memo('genres:' + roulette.library, 600000, function () {
        return jf('/Genres', { UserId: S.userId, ParentId: roulette.library, IncludeItemTypes: 'Movie,Series', Recursive: 'true', SortBy: 'SortName', EnableTotalRecordCount: 'false' })
          .then(function (data) { return (data.Items || []).map(function (genre) { return genre.Name; }).filter(Boolean); });
      }).then(function (genres) {
        if (!document.body.contains(sheet)) return;
        clear(list);
        [''].concat(genres).forEach(function (genre) {
          list.appendChild(h('button', { class: 'chip f' + (roulette.genre === genre ? ' on' : ''), text: genre || 'Tous les genres', onclick: function () {
            roulette.genre = genre;
            saveRoulette();
            genreButton.lastChild.textContent = genre || 'Tous les genres';
            closeLayer();
          } }));
        });
        focus(list.querySelector('.chip.on') || list.querySelector('.chip'));
      }, function (error) {
        if (!document.body.contains(sheet)) return;
        clear(list);
        list.appendChild(failure(error));
      });
    }
    main.appendChild(h('div', { class: 'roulette reveal-box' }, panel, stage));
    idle();

    function setting(label, options, key) {
      var chips = h('div', { class: 'segments' });
      options.forEach(function (option) {
        chips.appendChild(h('button', { class: 'segment f' + (roulette[key] === option[0] ? ' on' : ''), text: option[1], onclick: function (event) {
          roulette[key] = option[0];
          // Les genres dépendent de la médiathèque choisie.
          if (key === 'library' && roulette.genre) { roulette.genre = ''; genreButton.lastChild.textContent = 'Tous les genres'; }
          saveRoulette();
          Array.prototype.forEach.call(chips.children, function (node) { node.classList.toggle('on', node === event.currentTarget); });
        } }));
      });
      panel.appendChild(h('div', { class: 'setting' }, h('div', { class: 'label', text: label }), chips));
    }
    function idle() {
      clear(stage);
      stage.appendChild(h('div', { class: 'roulette-idle' },
        h('div', { class: 'wheel' }, h('div', { class: 'wheel-core' }, icon('roulette'))),
        h('h2', { text: 'Prêt pour le tirage ?' }),
        h('p', { text: 'Réglez vos envies à gauche puis lancez la roulette.' })));
    }
    function poster(pick, className) {
      var node = h('div', { class: className || 'reel-item' });
      node.appendChild(h('div', { class: 'ph', text: pick.title }));
      node.appendChild(image(jfImage(pick.id, 'Primary', '', 360), ''));
      return node;
    }

    function draw() {
      if (spin.disabled) return;
      spin.disabled = true;
      clear(stage);
      stage.appendChild(loading('Préparation du tirage…'));
      // Toujours 10 titres : de quoi remplir le rouleau ; les premiers sont tirés.
      var query = 'count=10&rating=' + roulette.rating + (roulette.library ? '&library=' + encodeURIComponent(roulette.library) : '')
        + (roulette.genre ? '&genre=' + encodeURIComponent(roulette.genre) : '') + (roulette.unplayed ? '&unplayed=1' : '');
      api('/api/roulette?' + query).then(function (data) {
        if (!alive()) return;
        var pool = (data && data.results) || [];
        if (!pool.length) {
          spin.disabled = false;
          clear(stage);
          stage.appendChild(h('div', { class: 'empty', text: 'Aucun titre ne correspond à ces réglages' + (roulette.genre ? ' (genre « ' + roulette.genre + ' »)' : '') + '.' }));
          return;
        }
        var winners = pool.slice(0, Math.min(roulette.count, pool.length));
        roll(pool, winners);
      }, function (error) {
        spin.disabled = false;
        if (!alive()) return;
        clear(stage);
        stage.appendChild(failure(error));
      });
    }
    function roll(pool, winners) {
      clear(stage);
      var strip = h('div', { class: 'reel-strip' });
      var landing = 26;
      for (var i = 0; i < landing + 4; i++) {
        var pick = i === landing ? winners[0] : pool[(i * 7 + 3) % pool.length];
        strip.appendChild(poster(pick));
      }
      var reel = h('div', { class: 'reel' }, strip, h('div', { class: 'reel-marker' }));
      stage.appendChild(h('div', { class: 'rolling' }, h('div', { class: 'kicker', text: 'La roulette tourne…' }), reel));
      var items = strip.children;
      var step = items[1].offsetLeft - items[0].offsetLeft;
      var target = reel.clientWidth / 2 - items[0].offsetWidth / 2 - landing * step;
      strip.style.transform = 'translate3d(0,0,0)';
      // Deux images plus tard pour que la transition parte bien de 0.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          strip.style.transition = 'transform 3.6s cubic-bezier(.08,.7,.12,1)';
          strip.style.transform = 'translate3d(' + Math.round(target) + 'px,0,0)';
        });
      });
      setTimeout(function () {
        if (!alive()) return;
        items[landing].classList.add('winner');
        setTimeout(function () { if (alive()) reveal(winners); }, 700);
      }, 3700);
    }
    function reveal(winners) {
      spin.disabled = false;
      clear(stage);
      var pick = winners[0];
      var backdrop = image(S.jf + '/Items/' + pick.id + '/Images/Backdrop?maxWidth=1280&quality=80', '');
      backdrop.className = 'reveal-backdrop';
      var watch = h('button', { class: 'btn primary f', onclick: function () { openItem(pick.id); } }, icon('play'), 'Voir la fiche');
      var card = h('div', { class: 'reveal' },
        backdrop,
        h('div', { class: 'reveal-body' },
          poster(pick, 'reveal-poster'),
          h('div', { class: 'reveal-info' },
            h('div', { class: 'kicker', text: 'Ce soir, on regarde' }),
            h('h2', { text: pick.title }),
            h('div', { class: 'facts' },
              [pick.year, pick.rating ? '★ ' + Number(pick.rating).toFixed(1) : '', pick.library].filter(Boolean).map(function (fact) { return h('span', { text: String(fact) }); })),
            pick.genres && pick.genres.length ? h('div', { class: 'genres' }, pick.genres.slice(0, 4).map(function (genre) { return h('span', { text: genre }); })) : null,
            pick.overview ? h('p', { text: pick.overview }) : null,
            h('div', { class: 'actions' }, watch, h('button', { class: 'btn f', onclick: draw }, icon('roulette'), 'Relancer')))));
      stage.appendChild(card);
      if (winners.length > 1) {
        stage.appendChild(h('div', { class: 'others' }, h('div', { class: 'label', text: 'Aussi tirés au sort' }),
          h('div', { class: 'others-row track' }, winners.slice(1).map(function (other) {
            var node = h('button', { class: 'other f', onclick: function () { openItem(other.id); } }, poster(other, 'other-poster'), h('span', { text: other.title }));
            return node;
          }))));
      }
      focus(watch);
    }

    var libraries = cache.rouletteLibraries ? Promise.resolve(cache.rouletteLibraries) : api('/api/libraries').then(function (data) {
      cache.rouletteLibraries = data || {};
      return cache.rouletteLibraries;
    }).catch(function () { return {}; });
    return libraries.then(function (catalog) {
      if (!alive()) return;
      var options = [['', 'Toutes']];
      Object.keys(catalog).forEach(function (label) { if (catalog[label] && catalog[label].id) options.push([catalog[label].id, label]); });
      if (roulette.library && !options.some(function (option) { return option[0] === roulette.library; })) roulette.library = '';
      setting('Médiathèque', options, 'library');
      panel.appendChild(h('div', { class: 'setting' }, h('div', { class: 'label', text: 'Genre' }), genreButton));
      setting('Titres tirés', [[1, '1'], [3, '3'], [5, '5'], [10, '10']], 'count');
      setting('Note minimale', [[0, 'Toutes'], [6, '6+'], [7, '7+'], [8, '8+']], 'rating');
      setting('Déjà vus', [[true, 'Non vus'], [false, 'Tout']], 'unplayed');
      panel.appendChild(spin);
    });
  };

  // ── Recherche ──────────────────────────────────────────────
  views.search = function (params, alive) {
    main.appendChild(head('Rechercher', 'Films, séries et épisodes de vos médiathèques.'));
    var results = h('div');
    var field = searchField('Rechercher…', params.query || '', function (value) {
      current.params = { query: value };
      run(value);
    });
    main.appendChild(field.node);
    main.appendChild(results);
    function run(value) {
      clear(results);
      if (!value) return;
      results.appendChild(loading('Recherche…'));
      jf('/Users/{userId}/Items', { searchTerm: value, IncludeItemTypes: 'Movie,Series,Episode,BoxSet', Recursive: 'true', Limit: 60, Fields: 'PrimaryImageAspectRatio,ProductionYear', ImageTypeLimit: 1 })
        .then(function (data) {
          if (!alive() || field.input.value.trim() !== value) return;
          clear(results);
          var items = data.Items || [];
          var titles = items.filter(function (item) { return item.Type !== 'Episode'; });
          var episodes = items.filter(function (item) { return item.Type === 'Episode'; });
          add(results, row('Titres', titles.map(function (item) { return itemCard(item); })));
          add(results, row('Épisodes', episodes.map(function (item) { return itemCard(item, 'wide'); })));
          results.appendChild(h('div', { style: 'padding:0 2.5rem' },
            h('button', { class: 'btn f', onclick: function () { go('requests', { query: value }, true); } }, icon('requests'), items.length ? 'Pas le bon titre ? Le demander' : 'Aucun résultat : le demander')));
        }, function (error) {
          if (!alive()) return;
          clear(results);
          results.appendChild(failure(error));
        });
    }
    if (params.query) run(params.query);
    else setTimeout(function () { if (alive()) focus(field.input); }, 0);
  };
})();

