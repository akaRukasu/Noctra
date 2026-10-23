/* Noctra pour Samsung Smart TV 2014 (plateforme « Orsay », série H, ex. UE40H6400).

   Compléments du moteur web du téléviseur (WebKit 537 « Maple », année 2013),
   chargés avant l'interface Noctra TV. Ils n'agissent que si la fonction manque :
     - Promise, fetch (sur XMLHttpRequest, lecture progressive des réponses),
       Headers, AbortController, URL, URLSearchParams, MessageChannel ;
     - Object.assign, Array.from/find/findIndex/includes/fill,
       String includes/startsWith/endsWith/padStart/repeat/normalize,
       Number.isFinite/isNaN/isInteger, Math.trunc/sign, Function.bind ;
     - Element closest/matches/remove/replaceWith/before/after/append,
       classList (ajout multiple, toggle forcé), click(), requestAnimationFrame.
   Syntaxe ES5 stricte. */
(function () {
  'use strict';

  var global = window;
  // Fonctions présentes d'origine sur ce moteur (journal de diagnostic).
  global.NOCTRA_ENGINE = {
    Promise: typeof global.Promise === 'function', fetch: typeof global.fetch === 'function', URL: typeof global.URL === 'function',
    URLSearchParams: typeof global.URLSearchParams === 'function', MessageChannel: typeof global.MessageChannel === 'function',
    Map: typeof global.Map === 'function', requestAnimationFrame: typeof global.requestAnimationFrame === 'function',
    MutationObserver: typeof (global.MutationObserver || global.WebKitMutationObserver) === 'function',
    closest: Boolean(global.Element && Element.prototype.closest), classList: 'classList' in document.documentElement,
    Uint8Array: typeof global.Uint8Array === 'function', Blob: typeof global.Blob === 'function'
  };
  var slice = Array.prototype.slice;
  function define(target, name, value) {
    if (!target || typeof target[name] === 'function') return;
    try { Object.defineProperty(target, name, { value: value, configurable: true, writable: true, enumerable: false }); }
    catch (error) { target[name] = value; }
  }

  // ── Langage ────────────────────────────────────────────────────────
  define(Function.prototype, 'bind', function (scope) {
    var fn = this, bound = slice.call(arguments, 1);
    return function () { return fn.apply(scope, bound.concat(slice.call(arguments))); };
  });
  define(Object, 'assign', function (target) {
    var to = Object(target);
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      if (source === null || source === undefined) continue;
      for (var key in source) if (Object.prototype.hasOwnProperty.call(source, key)) to[key] = source[key];
    }
    return to;
  });
  define(Object, 'values', function (object) { return Object.keys(object).map(function (key) { return object[key]; }); });
  define(Object, 'entries', function (object) { return Object.keys(object).map(function (key) { return [key, object[key]]; }); });
  define(Array, 'from', function (list, map) {
    var result = [];
    if (list === null || list === undefined) return result;
    if (typeof list === 'string') list = list.split('');
    else if (typeof list.forEach === 'function' && typeof list.length !== 'number') { list.forEach(function (value) { result.push(value); }); list = result; result = []; }
    for (var i = 0; i < (list.length >>> 0); i++) result.push(map ? map(list[i], i) : list[i]);
    return result;
  });
  define(Array, 'of', function () { return slice.call(arguments); });
  define(Array.prototype, 'find', function (test, scope) {
    for (var i = 0; i < this.length; i++) if (test.call(scope, this[i], i, this)) return this[i];
    return undefined;
  });
  define(Array.prototype, 'findIndex', function (test, scope) {
    for (var i = 0; i < this.length; i++) if (test.call(scope, this[i], i, this)) return i;
    return -1;
  });
  define(Array.prototype, 'includes', function (value, from) {
    for (var i = Math.max(0, from || 0); i < this.length; i++) if (this[i] === value || (value !== value && this[i] !== this[i])) return true;
    return false;
  });
  define(Array.prototype, 'fill', function (value, start, end) {
    var length = this.length;
    start = start === undefined ? 0 : start < 0 ? Math.max(length + start, 0) : Math.min(start, length);
    end = end === undefined ? length : end < 0 ? Math.max(length + end, 0) : Math.min(end, length);
    for (var i = start; i < end; i++) this[i] = value;
    return this;
  });
  define(String.prototype, 'includes', function (search, from) { return this.indexOf(search, from || 0) >= 0; });
  define(String.prototype, 'startsWith', function (search, from) { from = from || 0; return this.substr(from, String(search).length) === String(search); });
  define(String.prototype, 'endsWith', function (search, end) {
    var text = String(this), value = String(search);
    end = end === undefined ? text.length : Math.min(end, text.length);
    return text.slice(end - value.length, end) === value;
  });
  define(String.prototype, 'repeat', function (count) {
    var result = '', text = String(this);
    for (var i = 0; i < (count | 0); i++) result += text;
    return result;
  });
  function pad(text, length, filler, atStart) {
    text = String(text);
    filler = filler === undefined ? ' ' : String(filler);
    if (text.length >= length || !filler) return text;
    var fill = '';
    while (fill.length < length - text.length) fill += filler;
    fill = fill.slice(0, length - text.length);
    return atStart ? fill + text : text + fill;
  }
  define(String.prototype, 'padStart', function (length, filler) { return pad(this, length, filler, true); });
  define(String.prototype, 'padEnd', function (length, filler) { return pad(this, length, filler, false); });
  define(String.prototype, 'trimStart', function () { return String(this).replace(/^\s+/, ''); });
  define(String.prototype, 'trimEnd', function () { return String(this).replace(/\s+$/, ''); });
  // normalize : l'interface ne s'en sert que pour retirer les accents (recherche,
  // rapprochement des noms de chaînes) : décomposition des lettres latines courantes.
  if (typeof String.prototype.normalize !== 'function') {
    var accents = {
      a: 'àáâãäåāăą', c: 'çćĉċč', e: 'èéêëēĕėęě', i: 'ìíîïĩīĭįı', n: 'ñńņňŉ', o: 'òóôõöøōŏő', u: 'ùúûüũūŭůűų', y: 'ýÿŷ', z: 'źżž', s: 'śŝşš', g: 'ĝğġģ', d: 'ď', l: 'ĺļľł', r: 'ŕŗř', t: 'ţť', w: 'ŵ', h: 'ĥ', j: 'ĵ', k: 'ķ',
      A: 'ÀÁÂÃÄÅĀĂĄ', C: 'ÇĆĈĊČ', E: 'ÈÉÊËĒĔĖĘĚ', I: 'ÌÍÎÏĨĪĬĮİ', N: 'ÑŃŅŇ', O: 'ÒÓÔÕÖØŌŎŐ', U: 'ÙÚÛÜŨŪŬŮŰŲ', Y: 'ÝŸŶ', Z: 'ŹŻŽ', S: 'ŚŜŞŠ', G: 'ĜĞĠĢ', D: 'Ď', L: 'ĹĻĽŁ', R: 'ŔŖŘ', T: 'ŢŤ', W: 'Ŵ', H: 'Ĥ', J: 'Ĵ', K: 'Ķ'
    };
    var decompose = {};
    Object.keys(accents).forEach(function (base) { accents[base].split('').forEach(function (letter) { decompose[letter] = base + '́'; }); });
    define(String.prototype, 'normalize', function (form) {
      var text = String(this);
      if (form !== 'NFD' && form !== 'NFKD') return text;
      return text.replace(/[À-ſ]/g, function (letter) { return decompose[letter] || letter; });
    });
  }
  define(Number, 'isFinite', function (value) { return typeof value === 'number' && isFinite(value); });
  define(Number, 'isNaN', function (value) { return typeof value === 'number' && value !== value; });
  define(Number, 'isInteger', function (value) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value; });
  define(Math, 'trunc', function (value) { return value < 0 ? Math.ceil(value) : Math.floor(value); });
  define(Math, 'sign', function (value) { value = +value; return value > 0 ? 1 : value < 0 ? -1 : value; });
  if (!Date.now) Date.now = function () { return new Date().getTime(); };

  // ── Tâches asynchrones (Promise) ───────────────────────────────────
  // File d'exécution rapide : MutationObserver (WebKit) plutôt que setTimeout,
  // bridé à 4 ms par appel imbriqué sur ce moteur.
  var asap = (function () {
    var queue = [], Observer = global.MutationObserver || global.WebKitMutationObserver;
    function flush() {
      var list = queue;
      queue = [];
      for (var i = 0; i < list.length; i++) { try { list[i](); } catch (error) { setTimeout(function () { throw error; }, 0); } }
    }
    if (Observer) {
      var node = document.createTextNode(''), toggle = 0;
      new Observer(flush).observe(node, { characterData: true });
      return function (fn) { queue.push(fn); if (queue.length === 1) node.data = String(toggle = 1 - toggle); };
    }
    return function (fn) { queue.push(fn); if (queue.length === 1) setTimeout(flush, 0); };
  })();

  if (typeof global.Promise !== 'function') {
    var PENDING = 0, FULFILLED = 1, REJECTED = 2;
    var PromisePolyfill = function (executor) {
      if (!(this instanceof PromisePolyfill)) throw new TypeError('Promise doit être appelée avec new');
      this._state = PENDING;
      this._value = undefined;
      this._handlers = [];
      var self = this, done = false;
      function resolve(value) { if (!done) { done = true; settle(self, value); } }
      function reject(reason) { if (!done) { done = true; finish(self, REJECTED, reason); } }
      try { executor(resolve, reject); } catch (error) { reject(error); }
    };
    var finish = function (promise, state, value) {
      if (promise._state !== PENDING) return;
      promise._state = state;
      promise._value = value;
      var handlers = promise._handlers;
      promise._handlers = null;
      for (var i = 0; i < handlers.length; i++) handle(promise, handlers[i]);
    };
    var settle = function (promise, value) {
      if (value === promise) { finish(promise, REJECTED, new TypeError('Promise résolue par elle-même')); return; }
      if (value && (typeof value === 'object' || typeof value === 'function')) {
        var then;
        try { then = value.then; } catch (error) { finish(promise, REJECTED, error); return; }
        if (typeof then === 'function') {
          var called = false;
          try {
            then.call(value, function (next) { if (!called) { called = true; settle(promise, next); } },
              function (reason) { if (!called) { called = true; finish(promise, REJECTED, reason); } });
          } catch (error) { if (!called) { called = true; finish(promise, REJECTED, error); } }
          return;
        }
      }
      finish(promise, FULFILLED, value);
    };
    var handle = function (promise, handler) {
      if (promise._state === PENDING) { promise._handlers.push(handler); return; }
      asap(function () {
        var callback = promise._state === FULFILLED ? handler.onFulfilled : handler.onRejected;
        if (typeof callback !== 'function') {
          if (promise._state === FULFILLED) settle(handler.next, promise._value);
          else finish(handler.next, REJECTED, promise._value);
          return;
        }
        var result;
        try { result = callback(promise._value); } catch (error) { finish(handler.next, REJECTED, error); return; }
        settle(handler.next, result);
      });
    };
    PromisePolyfill.prototype.then = function (onFulfilled, onRejected) {
      var next = new PromisePolyfill(function () {});
      handle(this, { onFulfilled: onFulfilled, onRejected: onRejected, next: next });
      return next;
    };
    PromisePolyfill.prototype['catch'] = function (onRejected) { return this.then(null, onRejected); };
    PromisePolyfill.prototype['finally'] = function (fn) {
      return this.then(function (value) { return PromisePolyfill.resolve(fn()).then(function () { return value; }); },
        function (reason) { return PromisePolyfill.resolve(fn()).then(function () { throw reason; }); });
    };
    PromisePolyfill.resolve = function (value) {
      if (value instanceof PromisePolyfill) return value;
      return new PromisePolyfill(function (resolve) { resolve(value); });
    };
    PromisePolyfill.reject = function (reason) { return new PromisePolyfill(function (resolve, reject) { reject(reason); }); };
    PromisePolyfill.all = function (list) {
      return new PromisePolyfill(function (resolve, reject) {
        var items = slice.call(list), results = new Array(items.length), left = items.length;
        if (!left) { resolve(results); return; }
        items.forEach(function (item, index) {
          PromisePolyfill.resolve(item).then(function (value) { results[index] = value; if (--left === 0) resolve(results); }, reject);
        });
      });
    };
    PromisePolyfill.race = function (list) {
      return new PromisePolyfill(function (resolve, reject) { slice.call(list).forEach(function (item) { PromisePolyfill.resolve(item).then(resolve, reject); }); });
    };
    PromisePolyfill.allSettled = function (list) {
      return PromisePolyfill.all(slice.call(list).map(function (item) {
        return PromisePolyfill.resolve(item).then(function (value) { return { status: 'fulfilled', value: value }; },
          function (reason) { return { status: 'rejected', reason: reason }; });
      }));
    };
    global.Promise = PromisePolyfill;
  }

  // ── DOM ────────────────────────────────────────────────────────────
  var ElementProto = global.Element && Element.prototype;
  if (ElementProto) {
    define(ElementProto, 'matches', ElementProto.webkitMatchesSelector || ElementProto.msMatchesSelector || function (selector) {
      var list = (this.ownerDocument || document).querySelectorAll(selector);
      for (var i = 0; i < list.length; i++) if (list[i] === this) return true;
      return false;
    });
    define(ElementProto, 'closest', function (selector) {
      var node = this;
      while (node && node.nodeType === 1) { if (node.matches(selector)) return node; node = node.parentNode; }
      return null;
    });
  }
  function toNode(value) { return value && value.nodeType ? value : document.createTextNode(String(value)); }
  function fragmentOf(args) {
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < args.length; i++) fragment.appendChild(toNode(args[i]));
    return fragment;
  }
  [global.Element, global.CharacterData, global.DocumentType].forEach(function (type) {
    if (!type) return;
    var proto = type.prototype;
    define(proto, 'remove', function () { if (this.parentNode) this.parentNode.removeChild(this); });
    define(proto, 'replaceWith', function () { if (this.parentNode) this.parentNode.replaceChild(fragmentOf(arguments), this); });
    define(proto, 'before', function () { if (this.parentNode) this.parentNode.insertBefore(fragmentOf(arguments), this); });
    define(proto, 'after', function () { if (this.parentNode) this.parentNode.insertBefore(fragmentOf(arguments), this.nextSibling); });
  });
  [global.Element, global.Document, global.DocumentFragment].forEach(function (type) {
    if (!type) return;
    define(type.prototype, 'append', function () { this.appendChild(fragmentOf(arguments)); });
    define(type.prototype, 'prepend', function () { this.insertBefore(fragmentOf(arguments), this.firstChild); });
  });
  if (global.HTMLElement && typeof HTMLElement.prototype.click !== 'function') {
    HTMLElement.prototype.click = function () {
      var event = document.createEvent('MouseEvents');
      event.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
      this.dispatchEvent(event);
    };
  }
  // classList : présent sur ce moteur, mais sans ajout multiple ni toggle forcé.
  (function () {
    var probe = document.createElement('div');
    if (!('classList' in probe)) {
      var ClassList = function (node) { this.node = node; };
      var names = function (node) { return String(node.className || '').split(/\s+/).filter(Boolean); };
      ClassList.prototype = {
        contains: function (name) { return names(this.node).indexOf(name) >= 0; },
        add: function () { var list = names(this.node); for (var i = 0; i < arguments.length; i++) if (list.indexOf(arguments[i]) < 0) list.push(arguments[i]); this.node.className = list.join(' '); },
        remove: function () { var removed = slice.call(arguments); this.node.className = names(this.node).filter(function (name) { return removed.indexOf(name) < 0; }).join(' '); },
        toggle: function (name, force) { var on = force === undefined ? !this.contains(name) : Boolean(force); if (on) this.add(name); else this.remove(name); return on; }
      };
      try { Object.defineProperty(ElementProto, 'classList', { get: function () { return new ClassList(this); }, configurable: true }); } catch (error) { /* moteur trop ancien */ }
      return;
    }
    var TokenList = probe.classList.constructor;
    var proto = TokenList && TokenList.prototype;
    if (!proto) return;
    probe.classList.add('a', 'b');
    if (!probe.classList.contains('b')) {
      var add = proto.add, remove = proto.remove;
      proto.add = function () { for (var i = 0; i < arguments.length; i++) add.call(this, arguments[i]); };
      proto.remove = function () { for (var i = 0; i < arguments.length; i++) remove.call(this, arguments[i]); };
    }
    probe.classList.toggle('c', false);
    if (probe.classList.contains('c')) {
      var toggle = proto.toggle;
      proto.toggle = function (name, force) {
        if (force === undefined) return toggle.call(this, name);
        if (force) this.add(name); else this.remove(name);
        return Boolean(force);
      };
    }
  })();
  if (!global.requestAnimationFrame) {
    global.requestAnimationFrame = global.webkitRequestAnimationFrame || function (callback) {
      return setTimeout(function () { callback(Date.now()); }, 16);
    };
    global.cancelAnimationFrame = global.webkitCancelAnimationFrame || global.webkitCancelRequestAnimationFrame || function (id) { clearTimeout(id); };
  }
  if (document.visibilityState === undefined && document.webkitVisibilityState !== undefined) {
    try { Object.defineProperty(document, 'visibilityState', { get: function () { return document.webkitVisibilityState; } }); } catch (error) { /* lecture seule */ }
    document.addEventListener('webkitvisibilitychange', function () {
      var event = document.createEvent('Event');
      event.initEvent('visibilitychange', false, false);
      document.dispatchEvent(event);
    });
  }

  // ── URL et URLSearchParams ─────────────────────────────────────────
  var nativeURL = global.URL || global.webkitURL;
  var urlWorks = false;
  try { urlWorks = typeof global.URL === 'function' && new global.URL('b?c=1', 'http://a.b/d/').href === 'http://a.b/d/b?c=1' && new global.URL('http://a.b').origin === 'http://a.b'; } catch (error) { urlWorks = false; }
  var paramsWork = false;
  try { paramsWork = typeof global.URLSearchParams === 'function' && new global.URLSearchParams('?a=1&b=x%20y').get('b') === 'x y'; } catch (error) { paramsWork = false; }

  function decode(text) {
    try { return decodeURIComponent(String(text).replace(/\+/g, ' ')); } catch (error) { return String(text); }
  }
  function encode(text) {
    return encodeURIComponent(String(text)).replace(/%20/g, '+').replace(/[!'()~]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); });
  }
  function SearchParams(init) {
    this._list = [];
    this._url = null;
    if (init === undefined || init === null) return;
    if (typeof init === 'object' && init._list) { this._list = init._list.slice(); return; }
    if (typeof init === 'object') {
      for (var key in init) if (Object.prototype.hasOwnProperty.call(init, key)) this._list.push([String(key), String(init[key])]);
      return;
    }
    this._parse(String(init));
  }
  SearchParams.prototype = {
    _parse: function (text) {
      this._list = [];
      var self = this;
      text.replace(/^\?/, '').split('&').forEach(function (part) {
        if (!part) return;
        var index = part.indexOf('=');
        self._list.push(index < 0 ? [decode(part), ''] : [decode(part.slice(0, index)), decode(part.slice(index + 1))]);
      });
    },
    _changed: function () { if (this._url) this._url._search = this._list.length ? '?' + this.toString() : ''; },
    get: function (name) { for (var i = 0; i < this._list.length; i++) if (this._list[i][0] === String(name)) return this._list[i][1]; return null; },
    getAll: function (name) { return this._list.filter(function (pair) { return pair[0] === String(name); }).map(function (pair) { return pair[1]; }); },
    has: function (name) { return this.get(name) !== null; },
    append: function (name, value) { this._list.push([String(name), String(value)]); this._changed(); },
    set: function (name, value) {
      name = String(name);
      var found = false;
      this._list = this._list.filter(function (pair) {
        if (pair[0] !== name) return true;
        if (found) return false;
        found = true;
        pair[1] = String(value);
        return true;
      });
      if (!found) this._list.push([name, String(value)]);
      this._changed();
    },
    'delete': function (name) { this._list = this._list.filter(function (pair) { return pair[0] !== String(name); }); this._changed(); },
    forEach: function (callback, scope) { var list = this._list.slice(); for (var i = 0; i < list.length; i++) callback.call(scope, list[i][1], list[i][0], this); },
    keys: function () { return this._list.map(function (pair) { return pair[0]; }); },
    toString: function () { return this._list.map(function (pair) { return encode(pair[0]) + '=' + encode(pair[1]); }).join('&'); }
  };
  if (!paramsWork) global.URLSearchParams = SearchParams;

  // Résolution d'une adresse relative (RFC 3986, cas utiles ici).
  function removeDots(path) {
    var output = [];
    path.split('/').forEach(function (segment, index, list) {
      if (segment === '..') { if (output.length > 1) output.pop(); if (index === list.length - 1) output.push(''); }
      else if (segment === '.') { if (index === list.length - 1) output.push(''); }
      else output.push(segment);
    });
    return output.join('/');
  }
  var URL_PATTERN = /^([a-z][a-z0-9+.\-]*:)(?:\/\/([^\/?#]*))?([^?#]*)(\?[^#]*)?(#[\s\S]*)?$/i;
  function URLPolyfill(url, base) {
    if (!(this instanceof URLPolyfill)) throw new TypeError('URL doit être appelée avec new');
    url = String(url).replace(/^\s+|\s+$/g, '');
    var match = URL_PATTERN.exec(url);
    if (!match || (match[2] === undefined && /^(?:https?|ftp|wss?):$/i.test(match[1]))) {
      if (base === undefined) throw new TypeError('Adresse invalide : ' + url);
      var root = base instanceof URLPolyfill ? base : new URLPolyfill(base);
      var resolved;
      if (/^\/\//.test(url)) resolved = root.protocol + url;
      else if (url.charAt(0) === '/') resolved = root.protocol + '//' + root.host + url;
      else if (url.charAt(0) === '?') resolved = root.protocol + '//' + root.host + root.pathname + url;
      else if (url.charAt(0) === '#') resolved = root.protocol + '//' + root.host + root.pathname + root.search + url;
      else if (!url) resolved = root.protocol + '//' + root.host + root.pathname + root.search;
      else resolved = root.protocol + '//' + root.host + root.pathname.replace(/[^\/]*$/, '') + url;
      match = URL_PATTERN.exec(resolved);
      if (!match) throw new TypeError('Adresse invalide : ' + url);
    }
    this.protocol = match[1].toLowerCase();
    var authority = match[2] || '';
    var at = authority.lastIndexOf('@');
    if (at >= 0) authority = authority.slice(at + 1);
    var portMatch = /:(\d*)$/.exec(authority);
    this.hostname = (portMatch ? authority.slice(0, portMatch.index) : authority).toLowerCase();
    var port = portMatch ? portMatch[1] : '';
    if ((this.protocol === 'http:' && port === '80') || (this.protocol === 'https:' && port === '443')) port = '';
    this.port = port;
    var path = match[3] || '';
    if (match[2] !== undefined) path = removeDots(path || '/');
    this.pathname = path;
    this._search = match[4] && match[4] !== '?' ? match[4] : '';
    this.hash = match[5] && match[5] !== '#' ? match[5] : '';
    this.searchParams = new SearchParams(this._search);
    this.searchParams._url = this;
  }
  function urlGetter(name, get, set) {
    var descriptor = { get: get, configurable: true, enumerable: true };
    if (set) descriptor.set = set;
    Object.defineProperty(URLPolyfill.prototype, name, descriptor);
  }
  urlGetter('host', function () { return this.hostname + (this.port ? ':' + this.port : ''); });
  urlGetter('origin', function () { return this.protocol + '//' + this.host; });
  urlGetter('search', function () { return this._search; }, function (value) {
    value = String(value);
    this._search = value && value !== '?' ? (value.charAt(0) === '?' ? value : '?' + value) : '';
    this.searchParams._parse(this._search);
  });
  urlGetter('href', function () { return this.protocol + (this.hostname || /^(?:https?|ftp|wss?|file):$/.test(this.protocol) ? '//' + this.host : '') + this.pathname + this._search + this.hash; });
  URLPolyfill.prototype.toString = function () { return this.href; };
  URLPolyfill.prototype.toJSON = function () { return this.href; };
  if (!urlWorks) {
    URLPolyfill.createObjectURL = nativeURL && nativeURL.createObjectURL ? function (blob) { return nativeURL.createObjectURL(blob); } : function () { throw new Error('createObjectURL indisponible'); };
    URLPolyfill.revokeObjectURL = nativeURL && nativeURL.revokeObjectURL ? function (url) { return nativeURL.revokeObjectURL(url); } : function () {};
    global.URL = URLPolyfill;
  }

  // ── AbortController ────────────────────────────────────────────────
  if (typeof global.AbortController !== 'function') {
    var AbortSignalPolyfill = function () { this.aborted = false; this.onabort = null; this._listeners = []; };
    AbortSignalPolyfill.prototype.addEventListener = function (type, listener) { if (type === 'abort') this._listeners.push(listener); };
    AbortSignalPolyfill.prototype.removeEventListener = function (type, listener) { this._listeners = this._listeners.filter(function (item) { return item !== listener; }); };
    var AbortControllerPolyfill = function () { this.signal = new AbortSignalPolyfill(); };
    AbortControllerPolyfill.prototype.abort = function () {
      var signal = this.signal;
      if (signal.aborted) return;
      signal.aborted = true;
      var event = { type: 'abort', target: signal };
      if (typeof signal.onabort === 'function') signal.onabort(event);
      signal._listeners.slice().forEach(function (listener) { listener(event); });
    };
    global.AbortController = AbortControllerPolyfill;
    global.AbortSignal = AbortSignalPolyfill;
  }

  // ── fetch ──────────────────────────────────────────────────────────
  if (typeof global.fetch !== 'function') {
    var Headers = function (init) {
      this._map = {};
      var self = this;
      if (!init) return;
      if (init instanceof Headers) init.forEach(function (value, name) { self.append(name, value); });
      else if (Array.isArray(init)) init.forEach(function (pair) { self.append(pair[0], pair[1]); });
      else Object.keys(init).forEach(function (name) { if (init[name] !== undefined) self.append(name, init[name]); });
    };
    Headers.prototype = {
      append: function (name, value) { name = String(name).toLowerCase(); this._map[name] = this._map[name] ? this._map[name] + ', ' + value : String(value); },
      set: function (name, value) { this._map[String(name).toLowerCase()] = String(value); },
      get: function (name) { var value = this._map[String(name).toLowerCase()]; return value === undefined ? null : value; },
      has: function (name) { return Object.prototype.hasOwnProperty.call(this._map, String(name).toLowerCase()); },
      'delete': function (name) { delete this._map[String(name).toLowerCase()]; },
      forEach: function (callback, scope) { for (var name in this._map) if (Object.prototype.hasOwnProperty.call(this._map, name)) callback.call(scope, this._map[name], name, this); }
    };
    var parseHeaders = function (raw) {
      var headers = new Headers();
      String(raw || '').split(/\r?\n/).forEach(function (line) {
        var index = line.indexOf(':');
        if (index > 0) headers.append(line.slice(0, index).replace(/^\s+|\s+$/g, ''), line.slice(index + 1).replace(/^\s+|\s+$/g, ''));
      });
      return headers;
    };
    // Corps lu en octets (jeu « x-user-defined ») : texte, JSON, image ou lecture
    // progressive (getReader) d'un flux vidéo, comme le fetch des navigateurs récents.
    // Octets réels jusqu'à `limit` (au-delà : seule la taille sert, aux tests de
    // débit des serveurs TV ; pas de conversion octet par octet, très lente ici).
    var bytesOf = function (text, from, limit) {
      from = from || 0;
      var length = Math.max(0, text.length - from);
      var bytes = typeof Uint8Array === 'function' ? new Uint8Array(length) : [];
      var real = limit === undefined ? length : Math.max(0, Math.min(length, limit - from));
      for (var i = 0; i < real; i++) bytes[i] = text.charCodeAt(i + from) & 0xff;
      if (!bytes.buffer) for (var j = real; j < length; j++) bytes[j] = 0;
      return bytes;
    };
    // Jeu « x-user-defined » : octets 0x80-0xFF reçus en U+F780-U+F7FF. Remise en
    // octets par une expression régulière (native), puis décodage UTF-8 natif.
    var decodeUtf8 = function (text) {
      var binary = text.replace(/[\uf780-\uf7ff]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xf700); });
      if (!/[\u0080-\u00ff]/.test(binary)) return binary;
      try { return decodeURIComponent(escape(binary)); } catch (error) { return binary; }
    };
    var abortError = function () { var error = new Error('Requête annulée'); error.name = 'AbortError'; return error; };
    global.Headers = global.Headers || Headers;
    global.fetch = function (input, init) {
      init = init || {};
      var url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        var response = null, settled = false, finished = false, failure = null, waiters = [];
        function notify() { var list = waiters; waiters = []; for (var i = 0; i < list.length; i++) list[i](); }
        function text() { try { return xhr.responseText || ''; } catch (error) { return ''; } }
        function whenDone(read) {
          return new Promise(function (ok, ko) {
            function check() {
              if (failure) { ko(failure); return; }
              if (finished) { try { ok(read(text())); } catch (error) { ko(error); } return; }
              waiters.push(check);
            }
            check();
          });
        }
        function make() {
          var used = false;
          var result = {
            status: xhr.status, statusText: xhr.statusText || '', ok: xhr.status >= 200 && xhr.status < 300,
            url: url, redirected: false, type: 'cors', headers: parseHeaders(xhr.getAllResponseHeaders()),
            text: function () { used = true; return whenDone(decodeUtf8); },
            json: function () { used = true; return whenDone(function (body) { return JSON.parse(decodeUtf8(body)); }); },
            arrayBuffer: function () { used = true; return whenDone(function (body) { var bytes = bytesOf(body); return bytes.buffer || bytes; }); },
            blob: function () {
              used = true;
              return whenDone(function (body) {
                var type = result.headers.get('content-type') || '';
                if (typeof Blob === 'function') return new Blob([bytesOf(body)], { type: type });
                throw new Error('Blob indisponible sur ce téléviseur');
              });
            },
            clone: function () { return result; }
          };
          result.body = {
            getReader: function () {
              var offset = 0;
              return {
                read: function () {
                  return new Promise(function (ok, ko) {
                    function check() {
                      var body = text();
                      if (body.length > offset) { var chunk = bytesOf(body, offset, 16384); offset = body.length; ok({ value: chunk, done: false }); return; }
                      if (finished) { ok({ value: undefined, done: true }); return; }
                      if (failure) { ko(failure); return; }
                      waiters.push(check);
                    }
                    check();
                  });
                },
                cancel: function () { failure = failure || abortError(); try { xhr.abort(); } catch (error) { /* déjà fermé */ } notify(); return Promise.resolve(); },
                releaseLock: function () {}
              };
            }
          };
          Object.defineProperty(result, 'bodyUsed', { get: function () { return used; } });
          return result;
        }
        function fail(error) {
          failure = failure || error;
          if (!settled) { settled = true; reject(failure); }
          notify();
        }
        xhr.onreadystatechange = function () {
          if (xhr.readyState >= 2 && !settled && xhr.status) { settled = true; response = make(); resolve(response); }
          if (xhr.readyState === 4) {
            if (!settled) { if (xhr.status) { settled = true; resolve(make()); } else { fail(failure || new TypeError('Serveur injoignable')); return; } }
            finished = true;
          }
          notify();
        };
        xhr.onprogress = notify;
        xhr.onerror = function () { fail(new TypeError('Serveur injoignable')); };
        xhr.ontimeout = function () { fail(new TypeError('Délai dépassé')); };
        xhr.onabort = function () { fail(abortError()); };
        try {
          xhr.open(String(init.method || 'GET').toUpperCase(), url, true);
          var headers = new Headers(init.headers);
          headers.forEach(function (value, name) { xhr.setRequestHeader(name, value); });
          if (init.credentials === 'include') xhr.withCredentials = true;
          if (xhr.overrideMimeType) xhr.overrideMimeType('text/plain; charset=x-user-defined');
          var signal = init.signal;
          if (signal) {
            if (signal.aborted) { fail(abortError()); return; }
            signal.addEventListener('abort', function () { try { xhr.abort(); } catch (error) { /* déjà fermé */ } fail(abortError()); });
          }
          xhr.send(init.body === undefined || init.body === null ? null : init.body);
        } catch (error) {
          fail(new TypeError('Requête impossible : ' + error.message));
        }
      });
    };
  }

  // ── MessageChannel ─────────────────────────────────────────────────
  // L'hôte Samsung 2014 relie l'interface directement (NoctraAttachHost) :
  // deux « ports » qui se transmettent les messages hors de la pile d'appel.
  if (typeof global.MessageChannel !== 'function') {
    var Port = function () { this.onmessage = null; this.other = null; };
    Port.prototype.postMessage = function (data) {
      var other = this.other;
      setTimeout(function () { if (other && typeof other.onmessage === 'function') other.onmessage({ data: data, target: other }); }, 0);
    };
    Port.prototype.start = function () {};
    Port.prototype.close = function () { this.other = null; };
    global.MessageChannel = function () {
      this.port1 = new Port();
      this.port2 = new Port();
      this.port1.other = this.port2;
      this.port2.other = this.port1;
    };
  }
})();
