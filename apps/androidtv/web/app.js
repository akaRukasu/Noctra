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
    jellyfin: '<path d="M12 3c-3 0-9.5 11.3-8 14 1.4 2.6 14.6 2.6 16 0 1.5-2.7-5-14-8-14zm0 5.2c1.6 0 4.5 5.2 3.8 6.4-.7 1.2-6.9 1.2-7.6 0-.7-1.2 2.2-6.4 3.8-6.4z"/>',
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
    return request(url, { headers: { 'X-Emby-Token': S.token } });
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
      main.appendChild(h('div', { class: 'error', text: 'Session Jellyfin introuvable : ouvrez Noctra TV depuis le téléviseur.' }));
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
    document.getElementById('user').textContent = S.userName;
    if (S.ready && !changed) return;
    S.ready = true;
    cache = {};
    // Cookie de session Noctra : nécessaire aux lecteurs web des chaînes (iframes).
    Promise.all([
      api('/api/session').then(function (session) { S.isAdmin = Boolean(session && session.isAdmin); if (session && session.user && !S.userName) document.getElementById('user').textContent = session.user.name; }),
      api('/api/config').then(function (config) { S.config = (config && config.configured) || {}; })
    ]).catch(function (error) {
      if (error.status === 401 || error.status === 403) toast('Session refusée par Noctra : reconnectez-vous dans Jellyfin.', true);
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
    nav.appendChild(h('button', { class: 'nav jellyfin f', onclick: function () { native('openJellyfin') || toast('Disponible dans l’appli Noctra TV.'); } },
      icon('jellyfin'), 'Jellyfin'));
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
    if (silent) return;
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

  // ── Fiches (Jellyfin) ──────────────────────────────────────────────
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
    if (!native('openItem', { id: id })) toast('Fiche Jellyfin : disponible dans l’appli Noctra TV.');
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
    main.appendChild(head('Médiathèques', 'Parcourez vos films et séries, ou ouvrez une médiathèque dans Jellyfin.'));
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
    main.appendChild(head(lib.Name, '', h('button', { class: 'btn f', onclick: function () { native('openLibrary', { id: lib.Id }) || toast('Disponible dans l’appli Noctra TV.'); } }, icon('jellyfin'), 'Ouvrir dans Jellyfin')));
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
    main.appendChild(head('TV en direct', 'Choisissez une source de chaînes. Lecture en plein écran avec le lecteur natif quand le flux le permet.'));
    var status = loading();
    main.appendChild(status);
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
    main.appendChild(head(source.name, source.description || ''));
    var status = loading('Chargement des chaînes…');
    main.appendChild(status);
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
          return card({
            kind: 'channel', title: channel.name, sub: [channel.group, channel.provider].filter(Boolean).join(' · '),
            image: channel.logo ? absolute(channel.logo) : '',
            badge: channel.isLive ? 'LIVE' : '',
            onSelect: function () { playChannel(channel, source); }
          });
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

  // Lecture d'une chaîne : flux direct → lecteur natif ; page de lecteur → iframe.
  var playback = null;
  function playChannel(channel, source) {
    var options;
    if (channel.playbackType === 'stream' && channel.streamUrl) {
      options = Promise.resolve([{ playbackType: 'stream', streamUrl: channel.streamUrl, label: 'Direct', transport: channel.transport }]);
    } else if (channel.resolverUrl) {
      toast('Recherche des serveurs de ' + channel.name + '…');
      options = resolveOptions(channel.resolverUrl);
    } else if (channel.embedUrl) {
      options = Promise.resolve([{ playbackType: 'embed', url: channel.embedUrl, label: 'Lecteur web' }]);
    } else {
      options = Promise.resolve([]);
    }
    options.then(function (list) {
      if (!list.length) { toast('Aucun flux disponible pour ' + channel.name + '.', true); return; }
      playback = { channel: channel, source: source, options: list, index: 0, startedAt: 0 };
      playOption();
    }, function (error) { toast(error.message, true); });
  }
  function resolveOptions(url) {
    return api(url, { timeout: 30000 }).then(function (result) {
      var list = result && Array.isArray(result.options) ? result.options : (result && (result.streamUrl || result.url) ? [result] : []);
      return list.filter(function (option) { return option && (option.streamUrl || option.url || option.resolveUrl); });
    });
  }
  function playOption() {
    var state = playback;
    if (!state) return;
    var option = state.options[state.index];
    if (!option) {
      playback = null;
      toast('Aucun serveur ne fonctionne pour ' + state.channel.name + ' en ce moment.', true);
      return;
    }
    var label = [state.channel.provider, option.label].filter(Boolean).join(' · ');
    if (option.resolveUrl && !option.streamUrl && !option.url) {
      resolveOptions(option.resolveUrl).then(function (list) {
        state.options.splice.apply(state.options, [state.index, 1].concat(list));
        playOption();
      }, function () { nextOption(); });
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
    openEmbed(state, absolute(option.url), label);
  }
  function nextOption() {
    if (!playback) return;
    playback.index++;
    if (playback.options[playback.index]) toast('Serveur suivant…');
    playOption();
  }
  // Sortie rapide du lecteur (image noire, mauvais flux…) : choix d'un autre serveur.
  function quickExit(state) {
    return state.options.length > 1 && Date.now() - state.startedAt < 25000;
  }
  function playerClosed(result) {
    var state = playback;
    if (!state) return;
    if (result.ok) {
      playback = null;
      if (quickExit(state)) serverPicker(state);
      return;
    }
    if (result.error) toast(result.error, true);
    nextOption();
  }

  function openEmbed(state, url, label) {
    var hint = h('div', { class: 'hint' }, h('b', { text: state.channel.name }), ' · ' + label + ' — Retour pour quitter',
      state.options.length > 1 ? ' · ' + state.options.length + ' serveurs' : '');
    var frame = h('iframe', { src: url, allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture', allowfullscreen: true, referrerpolicy: 'no-referrer-when-downgrade' });
    var node = h('div', { class: 'embed' }, frame, hint);
    function onState(event) {
      var data = event.data;
      if (!data || typeof data !== 'object' || event.source !== frame.contentWindow) return;
      if (!/^noctra-[a-z]+-state$/.test(String(data.type || ''))) return;
      if (data.state === 'playing' || data.state === 'ready') hint.classList.add('gone');
      if (data.state === 'error' || data.state === 'stalled' || data.state === 'vip-missed') {
        if (state.index + 1 < state.options.length) {
          closeLayer();
          nextOption();
        } else toast('Ce lecteur ne répond pas.', true);
      }
    }
    window.addEventListener('message', onState);
    node._onClose = function (silent) {
      window.removeEventListener('message', onState);
      frame.src = 'about:blank';
      native('keepScreenOn', { data: false });
      if (playback === state) {
        playback = null;
        if (!silent && quickExit(state)) setTimeout(function () { serverPicker(state); }, 0);
      }
    };
    native('keepScreenOn', { data: true });
    openLayer(node);
    setTimeout(function () { hint.classList.add('gone'); }, 6000);
    setTimeout(function () { try { frame.focus(); } catch (error) { /* lecteur externe */ } }, 400);
  }
  function serverPicker(state) {
    var list = h('div', { class: 'list scroll' }, h('h2', { text: state.channel.name + ' · autres serveurs' }));
    state.options.forEach(function (option, index) {
      list.appendChild(h('button', { class: 'btn f', onclick: function () {
        closeLayer();
        playback = { channel: state.channel, source: state.source, options: state.options, index: index, startedAt: 0 };
        playOption();
      } }, (index === state.index ? '▶ ' : '') + (option.label || ('Serveur ' + (index + 1))) + (option.streamUrl ? ' · direct' : '')));
    });
    list.appendChild(h('button', { class: 'btn f', text: 'Fermer', onclick: closeLayer }));
    openLayer(h('div', { class: 'modal' }, list));
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
      h('button', { class: 'btn f', onclick: function () { closeLayer(); go('search', { section: 'search', query: title }); } }, icon('search'), 'Chercher dans Jellyfin'),
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
  var roulette = { library: '', count: 3, rating: 0, unplayed: true };
  views.roulette = function (params, alive) {
    main.appendChild(head('Roulette', 'Laissez Noctra choisir quoi regarder ce soir.'));
    var filters = h('div', { class: 'filters' });
    var result = h('div', { class: 'draw' });
    main.appendChild(filters);
    var spin = h('button', { class: 'btn primary f spin', onclick: draw }, icon('roulette'), 'Lancer la roulette');
    main.appendChild(h('div', null, spin));
    main.appendChild(result);

    function group(label, options, key) {
      var chips = h('div', { class: 'chips' });
      options.forEach(function (option) {
        chips.appendChild(chip(option[1], roulette[key] === option[0], function (event) {
          roulette[key] = option[0];
          Array.prototype.forEach.call(chips.children, function (node) { node.classList.toggle('on', node === event.currentTarget); });
        }));
      });
      filters.appendChild(h('div', { class: 'label', text: label }));
      filters.appendChild(chips);
    }
    function draw() {
      clear(result);
      result.appendChild(loading('La roulette tourne…'));
      var query = 'count=' + roulette.count + '&rating=' + roulette.rating + (roulette.library ? '&library=' + encodeURIComponent(roulette.library) : '') + (roulette.unplayed ? '&unplayed=1' : '');
      api('/api/roulette?' + query).then(function (data) {
        if (!alive()) return;
        clear(result);
        var picks = (data && data.results) || [];
        if (!picks.length) { result.appendChild(h('div', { class: 'empty', text: 'Aucun titre ne correspond à ces filtres.' })); return; }
        picks.forEach(function (pick, index) {
          var node = h('button', { class: 'pick f', style: 'animation-delay:' + (index * 0.12) + 's', onclick: function () { openItem(pick.id); } },
            h('img', { src: jfImage(pick.id, 'Primary', '', 400), alt: '', onerror: function () { this.style.visibility = 'hidden'; } }),
            h('div', { class: 'info' },
              h('h3', { text: pick.title }),
              h('div', { class: 'facts', text: [pick.year, pick.rating ? '★ ' + Number(pick.rating).toFixed(1) : '', pick.library].filter(Boolean).join(' · ') }),
              pick.genres && pick.genres.length ? h('div', { class: 'sub', text: pick.genres.slice(0, 3).join(', ') }) : null,
              pick.overview ? h('p', { text: pick.overview }) : null));
          result.appendChild(node);
        });
        focus(result.querySelector('.f'));
      }, function (error) {
        if (!alive()) return;
        clear(result);
        result.appendChild(failure(error));
      });
    }

    var libraries = cache.rouletteLibraries ? Promise.resolve(cache.rouletteLibraries) : api('/api/libraries').then(function (data) {
      cache.rouletteLibraries = data || {};
      return cache.rouletteLibraries;
    }).catch(function () { return {}; });
    return libraries.then(function (catalog) {
      if (!alive()) return;
      var options = [['', 'Toutes']];
      Object.keys(catalog).forEach(function (label) { if (catalog[label] && catalog[label].id) options.push([catalog[label].id, label]); });
      group('Médiathèque', options, 'library');
      group('Nombre de titres', [[1, '1'], [3, '3'], [5, '5']], 'count');
      group('Note minimale', [[0, 'Toutes'], [6, '6+'], [7, '7+'], [8, '8+']], 'rating');
      group('Déjà vus', [[true, 'Non vus seulement'], [false, 'Tout']], 'unplayed');
    });
  };

  // ── Recherche (Jellyfin) ───────────────────────────────────────────
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
