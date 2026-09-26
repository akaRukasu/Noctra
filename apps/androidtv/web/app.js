/* Noctra TV : accueil Noctra de l'appli Android TV (servi par l'appli sous
   NOCTRA_URL/tv-app/, voir NoctraHomeActivity.java).
   JavaScript ES2017 sans dépendance : les WebView des téléviseurs et
   vidéoprojecteurs sont souvent anciennes. */
(function () {
  'use strict';

  // ── Outils ─────────────────────────────────────────────────────────
  var main = document.getElementById('main');
  var layer = document.getElementById('layer');
  var S = { token: '', userId: '', userName: '', noctra: '', jf: '', isAdmin: false, config: {}, ready: false };

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
    play: '<path d="M8 5v14l11-7z"/>',
    info: '<path d="M11 10h2v7h-2zm0-3h2v2h-2zM12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/>'
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
  function jfImage(id, type, tag, height) {
    if (!id) return '';
    return S.jf + '/Items/' + id + '/Images/' + (type || 'Primary') + '?maxHeight=' + (height || 420) + '&quality=85' + (tag ? '&tag=' + encodeURIComponent(tag) : '');
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
      else if (data.type === 'playerClosed') playerClosed(data);
    };
    native('hello');
  });

  // Hors de l'appli (essais dans un navigateur) : #token=…&user=…&jellyfin=…
  setTimeout(function () {
    if (S.ready || port) return;
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
    // Jellyfin sur la même origine que la page si possible (pas de CORS).
    var own = String(data.jellyfinUrl || '').replace(/\/+$/, '');
    var remote = String(data.serverAddress || '').replace(/\/+$/, '');
    S.jf = own.indexOf(location.origin) === 0 || !remote ? own : remote;
    if (S.ready && !changed) { renderNav(); return; }
    S.ready = true;
    cache = {};
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
    go('home', {}, true, true);
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
      h('h2', null, S.userName || 'Compte', h('small', { text: 'Noctra TV' })),
      h('button', { class: 'btn f', onclick: function () { closeLayer(); native('openSettings') || toast('Disponible dans l’appli Noctra TV.'); } }, icon('settings'), 'Paramètres de l’appli'),
      h('p', { class: 'hint-text', text: 'Changer de compte ou se déconnecter : Paramètres › Authentification.' }),
      h('button', { class: 'btn f', text: 'Fermer', onclick: closeLayer }));
    openLayer(h('div', { class: 'modal' }, list));
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
  function focus(node) {
    if (!node) return;
    try { node.focus({ preventScroll: true }); } catch (error) { node.focus(); }
    reveal(node);
  }
  function reveal(node) {
    var track = node.closest('.track');
    if (track) {
      var t = track.getBoundingClientRect(), r = node.getBoundingClientRect(), pad = t.width * 0.08;
      if (r.left < t.left + pad) track.scrollLeft -= t.left + pad - r.left;
      else if (r.right > t.right - pad) track.scrollLeft += r.right - (t.right - pad);
    }
    var scroller = node.closest('.scroll');
    if (!scroller || isMenu(node)) return;
    var box = node.closest('.row, .reveal-box') || node;
    if (box.getBoundingClientRect().height > scroller.clientHeight * 0.7) box = node;
    var s = scroller.getBoundingClientRect(), b = box.getBoundingClientRect();
    var top = scroller === main ? document.getElementById('top').offsetHeight + 8 : s.top + 20;
    if (b.top < top) scroller.scrollTop -= top - b.top;
    else if (b.bottom > s.bottom - 30) scroller.scrollTop += Math.min(b.bottom - (s.bottom - 30), b.top - top);
  }

  function scope() {
    var modal = layer.lastElementChild;
    return modal ? modal : document;
  }
  function visible(node) {
    var r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function move(direction) {
    var from = document.activeElement;
    var root = scope();
    if (!from || from === document.body || !root.contains(from) || !from.classList.contains('f')) {
      var start = root === document ? (main.querySelector('.f') || document.querySelector('#nav .f')) : root.querySelector('.f');
      focus(start);
      return;
    }
    var nodes = Array.prototype.filter.call(root.querySelectorAll('.f'), function (node) { return node !== from && !node.disabled && visible(node); });
    var a = from.getBoundingClientRect();
    var horizontal = direction === 'left' || direction === 'right';
    var best = null, bestScore = Infinity;
    var fromRow = from.closest('.track');
    nodes.forEach(function (node) {
      var b = node.getBoundingClientRect();
      var primary, secondary;
      if (direction === 'right') primary = b.left - a.right + 1;
      else if (direction === 'left') primary = a.left - b.right + 1;
      else if (direction === 'down') primary = b.top - a.bottom + 1;
      else primary = a.top - b.bottom + 1;
      if (primary < -Math.min(a.width, a.height) * 0.3) return;
      if (horizontal) {
        // Même rangée uniquement : chevauchement vertical requis.
        var overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlap < Math.min(a.height, b.height) * 0.35) return;
        secondary = Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
      } else {
        secondary = Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2);
      }
      var score = Math.max(primary, 0) * (horizontal ? 1 : 2.2) + secondary * (horizontal ? 2 : 1);
      if (score < bestScore) { bestScore = score; best = node; }
    });
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
      move(direction);
      return;
    }
    if ((key === 'Enter' || code === 13 || code === 23) && target && target.classList && target.classList.contains('f')) {
      if (typing) {
        // Pas de preventDefault : la touche OK ouvre aussi le clavier de l'écran.
        if (typeof target._onSubmit === 'function') target._onSubmit();
        return;
      }
      if (target.tagName !== 'BUTTON') { event.preventDefault(); target.click(); }
      return;
    }
    if (key === 'Escape' || key === 'GoBack' || key === 'BrowserBack' || code === 27) {
      if (back()) event.preventDefault();
    }
  });
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
  function image(src, alt) {
    var img = h('img', { src: src, alt: alt || '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', function () { img.style.visibility = 'hidden'; });
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

  // Rendu progressif des longues grilles (chaînes, médiathèques).
  function lazyGrid(grid, items, make, batch) {
    var index = 0;
    function more() {
      var end = Math.min(items.length, index + (batch || 60));
      var nodes = [];
      for (; index < end; index++) nodes.push(make(items[index], index));
      nodes.forEach(function (node) { grid.appendChild(node); });
      armTail(grid, index < items.length ? more : null);
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
  function openItem(id) {
    if (!native('openItem', { id: id })) toast('Fiche : disponible dans l’appli Noctra TV.');
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

  // ── Accueil ────────────────────────────────────────────────────────
  views.home = function (params, alive) {
    var hero = h('div');
    var rows = h('div', null, loading());
    main.appendChild(hero);
    main.appendChild(rows);
    var resume = api('/api/home/resume').then(function (data) { return (data && data.items) || []; }).catch(function () {
      return jf('/Users/{userId}/Items/Resume', { Limit: 12, MediaTypes: 'Video', Fields: 'PrimaryImageAspectRatio' }).then(function (d) { return d.Items || []; });
    });
    var libs = jf('/Users/{userId}/Views').then(function (d) { return d.Items || []; });
    return Promise.all([resume, libs]).then(function (result) {
      if (!alive()) return;
      var resumeItems = result[0], libraries = result[1];
      var media = libraries.filter(function (lib) { return ['movies', 'tvshows', 'homevideos', 'musicvideos', 'mixed', undefined].indexOf(lib.CollectionType) >= 0; }).slice(0, 6);
      return Promise.all(media.map(function (lib) {
        return jf('/Users/{userId}/Items/Latest', { ParentId: lib.Id, Limit: 16, Fields: 'PrimaryImageAspectRatio,ProductionYear,Overview', ImageTypeLimit: 1, EnableImageTypes: 'Primary,Backdrop,Thumb' })
          .then(function (items) { return { lib: lib, items: items || [] }; }, function () { return { lib: lib, items: [] }; });
      })).then(function (latest) {
        if (!alive()) return;
        clear(rows);
        var featured = resumeItems[0] || (latest[0] && latest[0].items[0]);
        if (featured) hero.appendChild(heroBanner(featured, Boolean(resumeItems[0])));
        add(rows, row('Reprendre', resumeItems.map(function (item) { return itemCard(item, 'wide'); })));
        latest.forEach(function (entry) {
          add(rows, row('Derniers ajouts', entry.items.map(function (item) { return itemCard(item); }), entry.lib.Name));
        });
        add(rows, row('Médiathèques', libraries.map(libraryCard)));
        if (!rows.firstChild) rows.appendChild(h('div', { class: 'empty', text: 'Rien à afficher pour le moment.' }));
      });
    }).catch(function (error) {
      if (!alive()) return;
      clear(rows);
      rows.appendChild(failure(error, function () { go('home', {}, true); }));
    });
  };
  function heroBanner(item, resuming) {
    var backdropId = item.BackdropImageTags && item.BackdropImageTags.length ? item.Id : (item.ParentBackdropItemId || item.SeriesId || item.Id);
    var backdropTag = item.BackdropImageTags && item.BackdropImageTags.length ? item.BackdropImageTags[0] : (item.ParentBackdropImageTags && item.ParentBackdropImageTags[0]);
    var backdrop = image(S.jf + '/Items/' + backdropId + '/Images/Backdrop?maxWidth=1280&quality=80' + (backdropTag ? '&tag=' + backdropTag : ''), '');
    backdrop.className = 'backdrop';
    return h('section', { class: 'hero reveal-box' },
      backdrop,
      h('div', { class: 'body' },
        h('div', { class: 'kicker', text: resuming ? 'Reprendre' : 'Nouveauté' }),
        h('h2', { text: itemTitle(item) }),
        item.Type === 'Episode' ? h('div', { class: 'sub', text: itemSub(item) }) : null,
        item.Overview ? h('p', { text: item.Overview }) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary f', 'data-start': true, onclick: function () { openItem(item.Id); } }, icon('play'), resuming ? 'Reprendre' : 'Voir la fiche'))));
  }

  // ── Médiathèques ───────────────────────────────────────────────────
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
    var grid = h('div', { class: 'grid wides' });
    var status = loading();
    main.appendChild(status);
    main.appendChild(grid);
    return jf('/Users/{userId}/Views').then(function (data) {
      if (!alive()) return;
      status.remove();
      (data.Items || []).forEach(function (lib) { grid.appendChild(libraryCard(lib)); });
      if (!grid.firstChild) main.appendChild(h('div', { class: 'empty', text: 'Aucune médiathèque.' }));
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
        items.forEach(function (item) { grid.appendChild(itemCard(item)); });
        armTail(grid, start < total ? page : null);
        if (!grid.firstChild) grid.appendChild(h('div', { class: 'empty', text: 'Aucun titre.' }));
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
  views.live = function (params, alive) {
    main.appendChild(head('TV en direct', 'Choisissez une source de chaînes. Multiview : jusqu’à 4 chaînes à l’écran.'));
    var status = loading();
    main.appendChild(status);
    renderMultiBar();
    return api('/api/tv/sources').then(function (data) {
      if (!alive()) return;
      status.remove();
      var sources = (data && data.sources) || [];
      var groups = {};
      sources.forEach(function (source) {
        var key = source.section || 'channels';
        (groups[key] = groups[key] || []).push(source);
      });
      var order = sourceSections.map(function (s) { return s.id; });
      Object.keys(groups).forEach(function (key) { if (order.indexOf(key) < 0) order.push(key); });
      order.forEach(function (key) {
        if (!groups[key]) return;
        var label = (sourceSections.filter(function (s) { return s.id === key; })[0] || { label: key }).label;
        var grid = h('div', { class: 'grid tiles' });
        groups[key].forEach(function (source) {
          grid.appendChild(h('button', { class: 'tile f', onclick: function () { go('liveSource', { section: 'live', source: source }); } },
            h('strong', { text: source.name }), h('span', { text: source.description || source.provider || '' })));
        });
        main.appendChild(h('section', { class: 'row' }, h('h2', { text: label }), grid));
      });
      if (!sources.length) main.appendChild(h('div', { class: 'empty', text: 'Aucune source TV configurée sur le serveur Noctra.' }));
    }, function (error) {
      if (!alive()) return;
      status.replaceWith(failure(error, function () { go('live', {}, true); }));
    });
  };

  views.liveSource = function (params, alive) {
    var source = params.source;
    var group = params.group || '';
    var query = params.query || '';
    var multiButton = h('button', { class: 'btn f' + (multi.on ? ' primary' : ''), onclick: function () {
      multi.on = !multi.on;
      multiButton.className = 'btn f' + (multi.on ? ' primary' : '');
      multiButton.lastChild.textContent = multi.on ? 'Multiview : choisissez les chaînes' : 'Multiview';
      renderMultiBar();
      if (multi.on) toast('OK ajoute ou retire une chaîne du multiview (4 au maximum).');
    } }, icon('grid'), multi.on ? 'Multiview : choisissez les chaînes' : 'Multiview');
    main.appendChild(head(source.name, source.description || '', multiButton));
    var status = loading('Chargement des chaînes…');
    main.appendChild(status);
    renderMultiBar();
    var key = 'tv:' + source.id;
    var load = cache[key] ? Promise.resolve(cache[key]) : api('/api/tv/catalog?source=' + encodeURIComponent(source.id), { timeout: 45000 }).then(function (data) {
      cache[key] = data;
      return data;
    });
    return load.then(function (data) {
      if (!alive()) return;
      status.remove();
      var channels = (data && data.channels) || [];
      if (data && data.warning) main.appendChild(h('div', { class: 'empty', text: data.warning }));
      var counts = {};
      channels.forEach(function (channel) { var g = channel.group || ''; if (g) counts[g] = (counts[g] || 0) + 1; });
      var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 24);
      var field = searchField('Rechercher une chaîne…', query, function (value) {
        if (value === query) return;
        current.params = { section: 'live', source: source, group: group, query: value };
        query = value;
        fill();
      });
      main.appendChild(field.node);
      if (names.length > 1) {
        var chips = h('div', { class: 'chips' });
        chips.appendChild(chip('Toutes', !group, function () { pickGroup(''); }));
        names.forEach(function (name) { chips.appendChild(chip(name, group === name, function () { pickGroup(name); })); });
        main.appendChild(chips);
      }
      var grid = h('div', { class: 'grid channels' });
      main.appendChild(grid);
      function pickGroup(name) {
        group = name;
        current.params = { section: 'live', source: source, group: group, query: query };
        Array.prototype.forEach.call(main.querySelectorAll('.chips .chip'), function (node) {
          node.classList.toggle('on', node.textContent === (name || 'Toutes'));
        });
        fill();
      }
      function fill() {
        clear(grid);
        var needle = normalize(query);
        var list = channels.filter(function (channel) {
          return (!group || channel.group === group) && (!needle || normalize(channel.name).indexOf(needle) >= 0);
        });
        if (!list.length) { grid.appendChild(h('div', { class: 'empty', text: channels.length ? 'Aucune chaîne ne correspond.' : 'Aucune chaîne disponible.' })); return; }
        lazyGrid(grid, list, function (channel) {
          var node = card({
            kind: 'channel', title: channel.name, sub: [channel.group, channel.provider].filter(Boolean).join(' · '),
            image: channel.logo ? absolute(channel.logo) : '',
            badge: channel.isLive ? 'LIVE' : '',
            onSelect: function () {
              if (multi.on) toggleMulti(channel, source);
              else launchChannel(channel, source);
            }
          });
          node.setAttribute('data-channel', channelKey(channel, source));
          markMulti(node);
          return node;
        }, 72);
      }
      fill();
    }, function (error) {
      if (!alive()) return;
      status.replaceWith(failure(error, function () { show(false); }));
    });
  };
  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function channelKey(channel, source) {
    return (source && source.id ? source.id : '') + ':' + channel.name;
  }

  // ── Serveurs d'une chaîne ──────────────────────────────────────────
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
  function channelOptions(channel) {
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
  function rankOptions(options, key) {
    var remembered = rememberedServer(key);
    var weight = { native: 0, resolve: 1, web: 2 };
    return options.map(function (option, index) { return { option: option, index: index }; }).sort(function (a, b) {
      function score(entry) {
        var option = entry.option;
        if (remembered && optionLabel(option, entry.index) === remembered) return -10;
        return weight[optionKind(option)] + (option.compatPage ? 3 : 0) + (option.manualOnly ? 4 : 0) + (option.fallback ? 0.5 : 0);
      }
      return score(a) - score(b) || a.index - b.index;
    }).map(function (entry) { return entry.option; });
  }

  var playback = null;
  function launchChannel(channel, source) {
    var key = channelKey(channel, source);
    var sheet = pickerSheet(channel, 'Recherche des serveurs…');
    openLayer(sheet.node);
    channelOptions(channel).then(function (list) {
      if (!document.body.contains(sheet.node)) return;
      if (!list.length) { sheet.status('Aucun flux disponible pour cette chaîne.', true); return; }
      playback = { channel: channel, source: source, key: key, options: rankOptions(list, key), index: 0, failed: {}, startedAt: 0, renewed: false };
      if (playback.options.length === 1) {
        closeLayer(true);
        playOption();
      } else {
        fillPicker(sheet, playback, 5);
      }
    }, function (error) {
      if (document.body.contains(sheet.node)) sheet.status(error.message, true);
    });
  }

  // Fenêtre de choix : serveurs classés (dernier serveur fonctionnel, puis
  // lecteur natif, puis lecteurs web), lancement automatique du premier.
  function pickerSheet(channel, text) {
    var list = h('div', { class: 'servers' });
    var note = h('div', { class: 'picker-status loading', text: text });
    var logo = channel.logo ? image(absolute(channel.logo), '') : null;
    var node = h('div', { class: 'modal' }, h('div', { class: 'picker' },
      h('div', { class: 'picker-head' },
        h('div', { class: 'picker-logo' }, logo),
        h('div', null, h('h2', { text: channel.name }), h('div', { class: 'sub', text: [channel.group, channel.provider].filter(Boolean).join(' · ') }))),
      note, list,
      h('button', { class: 'btn f picker-close', text: 'Annuler', onclick: function () { closeLayer(); } })));
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
      if (remembered && optionLabel(option, index) === remembered) tags.push(h('span', { class: 'tag ok', text: 'Dernier utilisé' }));
      else if (index === 0 && !failed) tags.push(h('span', { class: 'tag ok', text: 'Recommandé' }));
      if (failed) tags.push(h('span', { class: 'tag bad', text: 'Échec' }));
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
    else if (seconds) sheet.countdown(seconds, function () { if (document.body.contains(sheet.node)) target.click(); });
    else sheet.status('Choisissez un serveur.');
  }
  function showPicker(state, message, seconds) {
    var sheet = pickerSheet(state.channel, '');
    if (message) sheet.note.parentNode.insertBefore(h('div', { class: 'picker-status bad', text: message }), sheet.note);
    openLayer(sheet.node);
    fillPicker(sheet, state, seconds);
  }

  function playOption() {
    var state = playback;
    if (!state) return;
    var option = state.options[state.index];
    if (!option) { playback = null; return; }
    var label = [state.channel.provider, optionLabel(option, state.index)].filter(Boolean).join(' · ');
    if (optionKind(option) === 'resolve') {
      toast('Connexion à ' + optionLabel(option, state.index) + '…');
      resolveOptions(option.resolveUrl).then(function (list) {
        if (!list.length) throw new Error('Serveur vide');
        list.forEach(function (item) { item.renewUrl = option.resolveUrl; if (!item.label) item.label = option.label; });
        state.options.splice.apply(state.options, [state.index, 1].concat(list));
        playOption();
      }, function () { failOption(state, 'Ce serveur ne répond pas.'); });
      return;
    }
    state.startedAt = Date.now();
    if (option.streamUrl) {
      var mime = option.transport === 'ts' || state.channel.transport === 'ts' ? 'video/mp2t' : '';
      if (!native('play', { url: absolute(option.streamUrl), title: state.channel.name, subtitle: label, mime: mime })) {
        toast('Le lecteur natif est disponible dans l’appli Noctra TV.', true);
      }
      return;
    }
    openEmbed(state, option, label);
  }
  function failOption(state, message) {
    state.failed[state.index] = true;
    var next = -1;
    state.options.some(function (option, index) { if (!state.failed[index]) { next = index; return true; } return false; });
    if (next < 0) {
      playback = null;
      showPicker(state, '', 0);
      return;
    }
    showPicker(state, message, 4);
  }
  function succeeded(state) {
    var option = state.options[state.index];
    if (option) rememberServer(state.key, optionLabel(option, state.index));
  }
  function quickExit(state) {
    return state.options.length > 1 && Date.now() - state.startedAt < 25000;
  }
  function playerClosed(result) {
    var state = playback;
    if (!state) return;
    if (result.played) succeeded(state);
    if (result.ok) {
      playback = null;
      if (!result.played && quickExit(state)) showPicker(state, '', 0);
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
        state.options[state.index] = fresh;
        playOption();
      }, function () { failOption(state, result.error || 'Le flux s’est interrompu.'); });
      return;
    }
    failOption(state, result.error || 'Lecture impossible.');
  }

  // Lecteur web (page du fournisseur) : curseur piloté par les flèches.
  function openEmbed(state, option, label) {
    var url = absolute(option.url);
    var external = url.indexOf(location.origin + '/') !== 0;
    var hint = h('div', { class: 'hint' }, h('b', { text: state.channel.name }), ' · ' + label,
      h('div', { class: 'keys', text: '◀ ▲ ▼ ▶ déplacer le curseur · OK cliquer (lecture, plein écran) · Retour quitter' }));
    var frame = h('iframe', { src: url, allow: 'autoplay *; fullscreen *; encrypted-media *; picture-in-picture *', allowfullscreen: true, scrolling: option.compatPage ? 'auto' : 'no' });
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
    openLayer(node);
    native('cursor', { data: true });
    setTimeout(function () { hint.classList.add('gone'); }, 7000);
  }

  // ── Multiview ──────────────────────────────────────────────────────
  var multi = { on: false, items: [] };
  function toggleMulti(channel, source) {
    var key = channelKey(channel, source);
    var index = -1;
    multi.items.some(function (item, i) { if (item.key === key) { index = i; return true; } return false; });
    if (index >= 0) multi.items.splice(index, 1);
    else if (multi.items.length >= 4) { toast('4 chaînes au maximum dans le multiview.', true); return; }
    else multi.items.push({ key: key, channel: channel, source: source });
    Array.prototype.forEach.call(main.querySelectorAll('[data-channel]'), markMulti);
    renderMultiBar();
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
        : 'choisissez 2 à 4 chaînes avec OK')),
      h('button', { class: 'btn primary f', disabled: multi.items.length < 1, onclick: launchMulti }, icon('grid'), 'Lancer (' + multi.items.length + '/4)'),
      h('button', { class: 'btn f', text: 'Vider', onclick: function () {
        multi.items = [];
        Array.prototype.forEach.call(main.querySelectorAll('[data-channel]'), markMulti);
        renderMultiBar();
      } }));
    main.appendChild(bar);
  }
  // Seuls les flux directs peuvent partager l'écran (un lecteur natif par vignette).
  function nativeStream(channel) {
    return channelOptions(channel).then(function (options) {
      var direct = options.filter(function (option) { return option.streamUrl && !option.manualOnly; })[0];
      if (direct) return direct;
      var resolvable = options.filter(function (option) { return optionKind(option) === 'resolve'; });
      var chain = Promise.resolve(null);
      resolvable.slice(0, 3).forEach(function (option) {
        chain = chain.then(function (found) {
          if (found) return found;
          return resolveOptions(option.resolveUrl).then(function (list) {
            return list.filter(function (item) { return item.streamUrl; })[0] || null;
          }, function () { return null; });
        });
      });
      return chain;
    });
  }
  function launchMulti() {
    if (!multi.items.length) return;
    toast('Préparation du multiview…');
    var picked = multi.items.slice();
    Promise.all(picked.map(function (item) {
      return nativeStream(item.channel).catch(function () { return null; });
    })).then(function (streams) {
      var items = [];
      var skipped = [];
      streams.forEach(function (stream, i) {
        var channel = picked[i].channel;
        if (!stream) { skipped.push(channel.name); return; }
        items.push({ url: absolute(stream.streamUrl), title: channel.name, subtitle: channel.provider || '', mime: stream.transport === 'ts' ? 'video/mp2t' : '' });
      });
      if (skipped.length) toast('Sans flux direct, ignorées : ' + skipped.join(', '), true);
      if (!items.length) return;
      if (!native('multiview', { items: items })) toast('Le multiview est disponible dans l’appli Noctra TV.', true);
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
  var roulette = { library: '', count: 1, rating: 0, unplayed: true };
  try { var savedRoulette = JSON.parse(localStorage.getItem('noctra-tv-roulette') || 'null'); if (savedRoulette) roulette = savedRoulette; } catch (error) { /* réglages par défaut */ }
  views.roulette = function (params, alive) {
    var panel = h('aside', { class: 'roulette-panel' }, h('h1', { text: 'Roulette' }), h('p', { class: 'sub', text: 'Laissez Noctra choisir ce soir.' }));
    var stage = h('section', { class: 'roulette-stage' });
    var spin = h('button', { class: 'btn primary f roulette-go', 'data-start': true, onclick: draw }, icon('roulette'), 'Lancer la roulette');
    main.appendChild(h('div', { class: 'roulette reveal-box' }, panel, stage));
    idle();

    function setting(label, options, key) {
      var chips = h('div', { class: 'segments' });
      options.forEach(function (option) {
        chips.appendChild(h('button', { class: 'segment f' + (roulette[key] === option[0] ? ' on' : ''), text: option[1], onclick: function (event) {
          roulette[key] = option[0];
          try { localStorage.setItem('noctra-tv-roulette', JSON.stringify(roulette)); } catch (error) { /* stockage indisponible */ }
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
      var query = 'count=10&rating=' + roulette.rating + (roulette.library ? '&library=' + encodeURIComponent(roulette.library) : '') + (roulette.unplayed ? '&unplayed=1' : '');
      api('/api/roulette?' + query).then(function (data) {
        if (!alive()) return;
        var pool = (data && data.results) || [];
        if (!pool.length) {
          spin.disabled = false;
          clear(stage);
          stage.appendChild(h('div', { class: 'empty', text: 'Aucun titre ne correspond à ces réglages.' }));
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
          h('div', { class: 'others-row' }, winners.slice(1).map(function (other) {
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
      setting('Titres tirés', [[1, '1'], [3, '3'], [5, '5']], 'count');
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
