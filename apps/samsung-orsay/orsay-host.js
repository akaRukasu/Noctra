/* Noctra pour Samsung Smart TV 2014 (Orsay, série H : UE40H6400…).

   Hôte de l'interface Noctra TV sur ces téléviseurs, qui n'ont ni Tizen ni
   navigateur récent. Il remplace ce que tv-native.js attend d'un téléviseur
   récent :
     - API Samsung (Common.API : Widget, TVKeyValue, Plugin), écran de veille,
       touche Retour (sinon le téléviseur quitte l'appli), touches de volume
       laissées au téléviseur ;
     - touches de la télécommande traduites en touches standard (flèches 37-40,
       OK 13, chiffres 48-57…) : l'interface reste la même que partout ;
     - clavier à l'écran (le téléviseur n'en ouvre pas pour une page web) ;
     - lecteur vidéo matériel (webapis.avplay, sinon le module « Player ») présenté
       comme un élément <video> : la vidéo est dessinée sous la page, la page
       devient transparente pendant la lecture ;
     - flux : droit de lecture temporaire (/api/tv/cast, le lecteur du téléviseur
       ne sait pas envoyer d'en-tête), relais du serveur (/api/tv/mosaic, relay)
       pour les formats que le téléviseur ne lit pas tel quel ;
     - multiview : un seul décodeur vidéo sur ce modèle, donc mosaïque composée
       par le serveur (une seule image, son au choix) pilotée à la télécommande ;
     - réglages mémorisés aussi dans un fichier de l'appli (le stockage web de
       ces téléviseurs n'est pas toujours conservé) ;
     - écran de démarrage : choix du serveur, test de connexion et diagnostic
       (certificat HTTPS refusé, relais local…).
   Syntaxe ES5 stricte (moteur WebKit 537 de 2013). */
(function () {
  'use strict';

  var config = window.NOCTRA_ORSAY_CONFIG || {};
  var VERSION = config.version || '';
  var SERVER_KEY = 'noctra-orsay-server-v1';
  var samsung = Boolean(window.Common && window.Common.API);
  var widgetAPI = null, tvKey = null, pluginAPI = null;
  try { if (samsung) { widgetAPI = new Common.API.Widget(); tvKey = new Common.API.TVKeyValue(); pluginAPI = new Common.API.Plugin(); } } catch (error) { samsung = false; }

  var tools = null;     // outils de tv-native.js (voir bridge)
  var started = false;  // interface Noctra TV chargée

  function $(id) { return document.getElementById(id); }
  function node(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function log(line) { try { if (window.console && console.log) console.log('[Noctra] ' + line); } catch (error) { /* console absente */ } }

  // ── Mémoire des réglages ───────────────────────────────────────────
  // Copie des clés « noctra… » du stockage web dans un fichier de l'appli,
  // relue au démarrage si le téléviseur a vidé ce stockage.
  var Store = {
    timer: 0,
    path: function () { return ((window.curWidget && curWidget.id) || 'Noctra') + '/noctra-reglages.json'; },
    fs: function () { try { return typeof FileSystem === 'function' ? new FileSystem() : null; } catch (error) { return null; } },
    restore: function () {
      var fs = Store.fs();
      if (!fs || !window.localStorage) return;
      try {
        var file = fs.openCommonFile(Store.path(), 'r');
        if (!file) return;
        var text = file.readAll();
        fs.closeCommonFile(file);
        var data = JSON.parse(text || '{}');
        Object.keys(data).forEach(function (key) { if (localStorage.getItem(key) === null) localStorage.setItem(key, data[key]); });
      } catch (error) { /* premier lancement */ }
    },
    save: function () {
      clearTimeout(Store.timer);
      Store.timer = setTimeout(function () {
        var fs = Store.fs();
        if (!fs || !window.localStorage) return;
        try {
          var data = {};
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            var value = localStorage.getItem(key);
            // Réglages et session seulement : les grosses listes en cache se rechargent.
            if (/^noctra/.test(key) && value && value.length < 200000) data[key] = value;
          }
          var dir = ((window.curWidget && curWidget.id) || 'Noctra');
          if (fs.isValidCommonPath && !fs.isValidCommonPath(dir)) fs.createCommonDir(dir);
          var file = fs.openCommonFile(Store.path(), 'w');
          file.writeAll(JSON.stringify(data));
          fs.closeCommonFile(file);
        } catch (error) { log('réglages non enregistrés : ' + error.message); }
      }, 1500);
    },
    watch: function () {
      try {
        var proto = window.Storage && Storage.prototype;
        if (!proto) return;
        var set = proto.setItem, remove = proto.removeItem;
        proto.setItem = function (key, value) { set.call(this, key, value); if (this === window.localStorage) Store.save(); };
        proto.removeItem = function (key) { remove.call(this, key); if (this === window.localStorage) Store.save(); };
      } catch (error) { /* stockage non modifiable */ }
    }
  };
  // Stockage web absent : stockage en mémoire, enregistré dans le fichier.
  (function () {
    var works = false;
    try { localStorage.setItem('noctra-orsay-test', '1'); works = localStorage.getItem('noctra-orsay-test') === '1'; localStorage.removeItem('noctra-orsay-test'); } catch (error) { works = false; }
    if (works) return;
    var data = {};
    var memory = {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
      setItem: function (key, value) { data[key] = String(value); Store.save(); },
      removeItem: function (key) { delete data[key]; Store.save(); },
      clear: function () { data = {}; Store.save(); },
      key: function (index) { return Object.keys(data)[index] || null; }
    };
    try { Object.defineProperty(memory, 'length', { get: function () { return Object.keys(data).length; } }); } catch (error) { /* longueur indisponible */ }
    try { Object.defineProperty(window, 'localStorage', { value: memory, configurable: true }); } catch (error) { window.localStorage = memory; }
  })();
  Store.restore();
  Store.watch();

  // ── Télécommande ───────────────────────────────────────────────────
  // Codes Samsung (TVKeyValue.js) → touches standard de l'interface.
  // Attention : sur ces téléviseurs, 13 est la touche « 8 », 8 la touche « 4 »
  // et 27 la touche Muet : seules les touches Samsung sont donc traduites.
  var STANDARD = { left: 37, up: 38, right: 39, down: 40, enter: 13, back: 461, play: 415, pause: 19, stop: 413, forward: 417, rewind: 412, chUp: 427, chDown: 428, info: 457, menu: 93 };
  var KEYS = {};
  (function () {
    var t = tvKey || {};
    function map(value, fallback, target) { KEYS[value === undefined ? fallback : value] = target; }
    map(t.KEY_LEFT, 4, STANDARD.left);
    map(t.KEY_RIGHT, 5, STANDARD.right);
    map(t.KEY_UP, 29460, STANDARD.up);
    map(t.KEY_DOWN, 29461, STANDARD.down);
    map(t.KEY_ENTER, 29443, STANDARD.enter);
    map(t.KEY_PANEL_ENTER, 309, STANDARD.enter);
    map(t.KEY_RETURN, 88, STANDARD.back);
    map(t.KEY_PANEL_RETURN, 1051, STANDARD.back);
    map(t.KEY_PLAY, 71, STANDARD.play);
    map(t.KEY_PAUSE, 74, STANDARD.pause);
    map(t.KEY_STOP, 70, STANDARD.stop);
    map(t.KEY_FF, 72, STANDARD.forward);
    map(t.KEY_RW, 69, STANDARD.rewind);
    map(t.KEY_CH_UP, 68, STANDARD.chUp);
    map(t.KEY_CH_DOWN, 65, STANDARD.chDown);
    map(t.KEY_PANEL_CH_UP, 105, STANDARD.chUp);
    map(t.KEY_PANEL_CH_DOWN, 106, STANDARD.chDown);
    map(t.KEY_INFO, 31, STANDARD.info);
    map(t.KEY_TOOLS, 75, STANDARD.menu);
    map(t.KEY_CHLIST, 84, STANDARD.menu);
    var digits = [t.KEY_0, t.KEY_1, t.KEY_2, t.KEY_3, t.KEY_4, t.KEY_5, t.KEY_6, t.KEY_7, t.KEY_8, t.KEY_9];
    var fallback = [17, 101, 98, 6, 8, 9, 10, 12, 13, 14];
    for (var i = 0; i < 10; i++) map(digits[i], fallback[i], 48 + i);
  })();

  function typingTarget(target) {
    return target && target.tagName === 'INPUT' && /^(?:text|password|search|url|email|tel|number|)$/i.test(target.type || '');
  }
  // Événement « keydown » standard rejoué sur l'élément actif.
  function replay(code, original) {
    var target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    var event = document.createEvent('Event');
    event.initEvent('keydown', true, true);
    event.keyCode = code;
    event.which = code;
    event.noctraOrsay = true;
    event.repeat = false;
    event.key = code === 37 ? 'ArrowLeft' : code === 38 ? 'ArrowUp' : code === 39 ? 'ArrowRight' : code === 40 ? 'ArrowDown' : code === 13 ? 'Enter' : code >= 48 && code <= 57 ? String(code - 48) : '';
    event.original = original;
    target.dispatchEvent(event);
  }
  window.addEventListener('keydown', function (event) {
    if (event.noctraOrsay) return;
    var code = event.keyCode;
    var standard = samsung ? KEYS[code] : code;
    if (!samsung && code === 27) standard = STANDARD.back;
    if (standard === undefined) return;
    // Retour : bloqué, sinon le téléviseur ferme l'appli (Noctra décide).
    // L'événement d'origine s'arrête ici : seule sa traduction atteint l'interface.
    if (samsung) {
      if (standard === STANDARD.back && widgetAPI && widgetAPI.blockNavigation) { try { widgetAPI.blockNavigation(event); } catch (error) { /* ancienne API */ } }
      event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      event.stopPropagation();
    }
    if (Keyboard.node) { Keyboard.key(standard); if (!samsung) { event.preventDefault(); event.stopPropagation(); } return; }
    if (Boot.node) { Boot.key(standard); if (!samsung) { event.preventDefault(); event.stopPropagation(); } return; }
    var target = document.activeElement;
    if (typingTarget(target)) {
      // OK sur un champ : clavier à l'écran ; chiffres : saisis directement.
      if (standard === STANDARD.enter) { if (!samsung) { event.preventDefault(); event.stopPropagation(); } Keyboard.open(target); return; }
      if (standard >= 48 && standard <= 57) { insertText(target, String(standard - 48)); if (!samsung) { event.preventDefault(); event.stopPropagation(); } return; }
    }
    if (samsung) replay(standard, event);
  }, true);
  // Sans élément actif, les touches n'arrivent plus à la page : ancre de secours.
  function keepFocus() {
    var active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) {
      var anchor = $('anchor');
      if (anchor) try { anchor.focus(); } catch (error) { /* ancre absente */ }
    }
  }
  setInterval(keepFocus, 1500);

  function insertText(input, text) {
    var value = input.value || '';
    var max = Number(input.getAttribute('maxlength')) || 0;
    if (max && value.length >= max) return;
    input.value = value + text;
    fire(input, 'input');
  }
  function fire(target, type) {
    var event = document.createEvent('Event');
    event.initEvent(type, true, true);
    target.dispatchEvent(event);
  }

  // ── Clavier à l'écran ──────────────────────────────────────────────
  var LAYOUTS = {
    lower: ['1234567890', 'azertyuiop', 'qsdfghjklm', 'wxcvbn@.-_', '/:?=&#%+~!'],
    upper: ['1234567890', 'AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN@.-_', '/:?=&#%+~!'],
    accents: ['éèêëàâäîïô', 'öùûüçœæ€$£', '()[]{}<>;,', '"\'*^|\\`°§µ', '«»¿¡…·–—’…']
  };
  var Keyboard = {
    node: null, input: null, mode: 'lower', row: 0, col: 0, keys: [], preview: null,
    open: function (input) {
      Keyboard.close();
      Keyboard.input = input;
      Keyboard.mode = 'lower';
      Keyboard.node = node('div', 'ok-keyboard');
      Keyboard.preview = node('div', 'ok-preview');
      var help = node('p', 'ok-help', 'OK : saisir · chiffres de la télécommande : saisis directement · Retour : terminer');
      Keyboard.grid = node('div', 'ok-grid');
      Keyboard.node.appendChild(node('h3', '', input.getAttribute('placeholder') || 'Saisie'));
      Keyboard.node.appendChild(Keyboard.preview);
      Keyboard.node.appendChild(Keyboard.grid);
      Keyboard.node.appendChild(help);
      document.body.appendChild(Keyboard.node);
      Keyboard.row = 1;
      Keyboard.col = 0;
      Keyboard.render();
    },
    rows: function () {
      var rows = LAYOUTS[Keyboard.mode].map(function (line) { return line.split(''); });
      rows.push(['⇧ Maj', 'àé', 'Espace', '⌫ Effacer', 'Vider', '✓ Valider']);
      return rows;
    },
    render: function () {
      var rows = Keyboard.rows();
      Keyboard.grid.innerHTML = '';
      Keyboard.keys = rows;
      Keyboard.row = Math.min(Keyboard.row, rows.length - 1);
      Keyboard.col = Math.min(Keyboard.col, rows[Keyboard.row].length - 1);
      rows.forEach(function (row, r) {
        var line = node('div', 'ok-row' + (r === rows.length - 1 ? ' ok-actions' : ''));
        row.forEach(function (label, c) {
          var key = node('span', 'ok-key' + (r === Keyboard.row && c === Keyboard.col ? ' on' : '') + (label.length > 1 ? ' wide' : ''), label);
          line.appendChild(key);
        });
        Keyboard.grid.appendChild(line);
      });
      var value = Keyboard.input.value || '';
      Keyboard.preview.textContent = (Keyboard.input.type === 'password' ? value.replace(/./g, '•') : value) + '▏';
    },
    key: function (code) {
      var rows = Keyboard.keys;
      if (code === STANDARD.back) { Keyboard.done(false); return; }
      if (code === STANDARD.up) Keyboard.row = (Keyboard.row + rows.length - 1) % rows.length;
      else if (code === STANDARD.down) Keyboard.row = (Keyboard.row + 1) % rows.length;
      else if (code === STANDARD.left) Keyboard.col = (Keyboard.col + rows[Keyboard.row].length - 1) % rows[Keyboard.row].length;
      else if (code === STANDARD.right) Keyboard.col = (Keyboard.col + 1) % rows[Keyboard.row].length;
      else if (code >= 48 && code <= 57) insertText(Keyboard.input, String(code - 48));
      else if (code === STANDARD.enter) {
        Keyboard.col = Math.min(Keyboard.col, rows[Keyboard.row].length - 1);
        var label = rows[Keyboard.row][Keyboard.col];
        var input = Keyboard.input;
        if (label === '⇧ Maj') Keyboard.mode = Keyboard.mode === 'upper' ? 'lower' : 'upper';
        else if (label === 'àé') Keyboard.mode = Keyboard.mode === 'accents' ? 'lower' : 'accents';
        else if (label === 'Espace') insertText(input, ' ');
        else if (label === '⌫ Effacer') { input.value = String(input.value || '').slice(0, -1); fire(input, 'input'); }
        else if (label === 'Vider') { input.value = ''; fire(input, 'input'); }
        else if (label === '✓ Valider') { Keyboard.done(true); return; }
        else insertText(input, label);
      }
      Keyboard.render();
    },
    done: function (submit) {
      var input = Keyboard.input;
      Keyboard.close();
      if (!input) return;
      fire(input, 'change');
      try { input.focus(); } catch (error) { /* champ retiré */ }
      if (!submit) return;
      // Validation : comme la touche OK du clavier du téléviseur dans le champ.
      if (typeof input._submit === 'function') { input._submit(); return; }
      if (typeof input._onSubmit === 'function') { input._onSubmit(); return; }
      if (input.form) { fire(input.form, 'submit'); return; }
    },
    close: function () {
      if (Keyboard.node && Keyboard.node.parentNode) Keyboard.node.parentNode.removeChild(Keyboard.node);
      Keyboard.node = null;
      Keyboard.input = null;
    }
  };

  // ── Lecteur vidéo du téléviseur ────────────────────────────────────
  // Un seul lecteur matériel : AVPlay (webapis), sinon le module « Player »
  // (SAMSUNG-INFOLINK-PLAYER). Il dessine la vidéo sous la page, dans un
  // rectangle exprimé dans la résolution de l'appli (1280 × 720).
  var Hardware = { name: '', avplay: null, plugin: null, owner: null, pending: [], failed: false };
  function screenRect(element) {
    var width = window.innerWidth || 1280, height = window.innerHeight || 720;
    var box = element && element.getBoundingClientRect ? element.getBoundingClientRect() : null;
    if (!box || box.width < 2 || box.height < 2) return { left: 0, top: 0, width: 1280, height: 720 };
    var x = 1280 / width, y = 720 / height;
    return { left: Math.round(box.left * x), top: Math.round(box.top * y), width: Math.round(box.width * x), height: Math.round(box.height * y) };
  }
  function ownerEvent(name, data) { if (Hardware.owner) Hardware.owner._hardware(name, data); }
  function withHardware(done) {
    if (Hardware.name) { done(Hardware.name); return; }
    if (Hardware.failed) { done(''); return; }
    Hardware.pending.push(done);
    if (Hardware.pending.length > 1) return;
    function ready(name) {
      Hardware.name = name;
      Hardware.failed = !name;
      var list = Hardware.pending;
      Hardware.pending = [];
      list.forEach(function (callback) { callback(name); });
    }
    var avplay = window.webapis && webapis.avplay;
    if (avplay && typeof avplay.getAVPlay === 'function') {
      var answered = false;
      var timer = setTimeout(function () { if (!answered) { answered = true; ready(plugin()); } }, 4000);
      try {
        avplay.getAVPlay(function (player) {
          if (answered) return;
          answered = true;
          clearTimeout(timer);
          try {
            player.init({
              containerID: 'orsay-av', zIndex: 0, autoRatio: true,
              displayRect: { top: 0, left: 0, width: 1280, height: 720 },
              bufferingCallback: {
                onbufferingstart: function () { ownerEvent('bufferstart'); },
                onbufferingprogress: function (percent) { ownerEvent('bufferprogress', percent); },
                onbufferingcomplete: function () { ownerEvent('buffercomplete'); }
              },
              playCallback: {
                oncurrentplaytime: function (time) { ownerEvent('time', time && time.millisecond !== undefined ? time.millisecond : Number(time) || 0); },
                onresolutionchanged: function () { ownerEvent('resolution'); },
                onstreamcompleted: function () { ownerEvent('ended'); },
                onerror: function (error) { ownerEvent('error', error); }
              }
            });
            Hardware.avplay = player;
            ready('avplay');
          } catch (error) { log('AVPlay : ' + error.message); ready(plugin()); }
        }, function () { if (!answered) { answered = true; clearTimeout(timer); ready(plugin()); } });
      } catch (error) { if (!answered) { answered = true; clearTimeout(timer); ready(plugin()); } }
      return;
    }
    ready(plugin());
  }
  // Module « Player » (modèles 2010-2014) : rappels nommés en texte.
  function plugin() {
    if (!samsung) return '';
    try {
      var object = document.createElement('object');
      object.id = 'pluginPlayer';
      object.setAttribute('classid', 'clsid:SAMSUNG-INFOLINK-PLAYER');
      object.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;';
      document.body.insertBefore(object, document.body.firstChild);
      if (typeof object.Play !== 'function' && typeof object.InitPlayer !== 'function') return '';
      var names = { OnCurrentPlayTime: 'time', OnBufferingStart: 'bufferstart', OnBufferingProgress: 'bufferprogress', OnBufferingComplete: 'buffercomplete',
        OnRenderingComplete: 'ended', OnStreamInfoReady: 'info', OnConnectionFailed: 'neterror', OnNetworkDisconnected: 'neterror', OnStreamNotFound: 'notfound',
        OnRenderError: 'decodeerror', OnAuthenticationFailed: 'neterror' };
      window.NoctraOrsayPlayer = {};
      Object.keys(names).forEach(function (callback) {
        window.NoctraOrsayPlayer[callback] = function (value) {
          var name = names[callback];
          if (name === 'neterror' || name === 'notfound' || name === 'decodeerror') ownerEvent('error', { code: name === 'decodeerror' ? 3 : 19, name: callback });
          else ownerEvent(name, value);
        };
        object[callback] = 'NoctraOrsayPlayer.' + callback;
      });
      Hardware.plugin = object;
      return 'plugin';
    } catch (error) { return ''; }
  }
  var Device = {
    open: function (url, kind, rect, start) {
      var target = url + (kind === 'hls' && url.indexOf('|COMPONENT=') < 0 ? '|COMPONENT=HLS' : '');
      if (Hardware.name === 'avplay') {
        var player = Hardware.avplay;
        try { player.stop(); } catch (error) { /* rien en cours */ }
        try { if (player.setDisplayRect) player.setDisplayRect(rect); } catch (error) { /* ancien micrologiciel */ }
        try { if (player.show) player.show(); } catch (error) { /* toujours visible */ }
        player.open(target);
        player.play(function () { ownerEvent('started'); }, function (error) { ownerEvent('error', error); }, start > 0 ? Math.floor(start) : 0);
        return;
      }
      if (Hardware.name === 'plugin') {
        var object = Hardware.plugin;
        try { object.Stop(); } catch (error) { /* rien en cours */ }
        // Ce module compte en 960 × 540, quelle que soit la résolution de l'appli.
        try { object.SetDisplayArea(Math.round(rect.left * 0.75), Math.round(rect.top * 0.75), Math.round(rect.width * 0.75), Math.round(rect.height * 0.75)); } catch (error) { /* zone par défaut */ }
        var ok = start > 0 && typeof object.InitPlayer === 'function' ? (object.InitPlayer(target), object.StartPlayback(Math.floor(start))) : object.Play(target);
        if (ok === false || ok === 0) ownerEvent('error', { code: 4, name: 'Play' });
        else ownerEvent('started');
      }
    },
    stop: function () {
      try { if (Hardware.name === 'avplay') { Hardware.avplay.stop(); if (Hardware.avplay.hide) Hardware.avplay.hide(); } } catch (error) { /* déjà arrêté */ }
      try { if (Hardware.name === 'plugin') Hardware.plugin.Stop(); } catch (error) { /* déjà arrêté */ }
    },
    pause: function () {
      try { if (Hardware.name === 'avplay') Hardware.avplay.pause(); else if (Hardware.name === 'plugin') Hardware.plugin.Pause(); } catch (error) { /* direct sans pause */ }
    },
    resume: function () {
      try { if (Hardware.name === 'avplay') Hardware.avplay.resume(); else if (Hardware.name === 'plugin') Hardware.plugin.Resume(); } catch (error) { /* reprise refusée */ }
    },
    jump: function (seconds) {
      seconds = Math.round(seconds);
      if (!seconds) return;
      try {
        if (Hardware.name === 'avplay') { if (seconds > 0) Hardware.avplay.jumpForward(seconds); else Hardware.avplay.jumpBackward(-seconds); }
        else if (Hardware.name === 'plugin') { if (seconds > 0) Hardware.plugin.JumpForward(seconds); else Hardware.plugin.JumpBackward(-seconds); }
      } catch (error) { log('déplacement refusé : ' + error.message); }
    },
    duration: function () {
      try {
        if (Hardware.name === 'avplay') { var value = typeof Hardware.avplay.getDuration === 'function' ? Hardware.avplay.getDuration() : Hardware.avplay.duration; return Number(value) || 0; }
        if (Hardware.name === 'plugin') return Number(Hardware.plugin.GetDuration()) || 0;
      } catch (error) { /* direct */ }
      return 0;
    },
    rect: function (rect) {
      try { if (Hardware.name === 'avplay' && Hardware.avplay.setDisplayRect) Hardware.avplay.setDisplayRect(rect); } catch (error) { /* zone fixe */ }
      try { if (Hardware.name === 'plugin') Hardware.plugin.SetDisplayArea(Math.round(rect.left * 0.75), Math.round(rect.top * 0.75), Math.round(rect.width * 0.75), Math.round(rect.height * 0.75)); } catch (error) { /* zone fixe */ }
    }
  };
  function videoActive(on) {
    var root = document.documentElement;
    if (on) root.className = (' ' + root.className + ' ').replace(' orsay-video ', ' ').replace(/^\s+|\s+$/g, '') + ' orsay-video';
    else root.className = (' ' + root.className + ' ').replace(' orsay-video ', ' ').replace(/^\s+|\s+$/g, '');
    screenSaver(!on);
  }

  // Élément « vidéo » de l'interface : un <div> transparent qui se comporte
  // comme un <video> (src, play, pause, currentTime, événements…).
  function OrsayVideo() {
    var video = document.createElement('div');
    video.className = 'orsay-video';
    var state = { src: '', paused: true, readyState: 0, time: 0, duration: NaN, seeking: false, error: null, startAt: 0, started: false, ended: false, generation: 0, lastTimeEvent: 0 };
    video.noctraLog = null;
    video.orsayKind = '';
    video.textTracks = [];
    function say(line) { if (typeof video.noctraLog === 'function') video.noctraLog(line); else log(line); }
    function emit(type) {
      var event = document.createEvent('Event');
      event.initEvent(type, false, false);
      video.dispatchEvent(event);
    }
    function prop(name, get, set) {
      var descriptor = { get: get, configurable: true };
      if (set) descriptor.set = set;
      try { Object.defineProperty(video, name, descriptor); }
      catch (error) { video.__defineGetter__(name, get); if (set) video.__defineSetter__(name, set); }
    }
    prop('src', function () { return state.src; }, function (value) { open(String(value || '')); });
    prop('currentSrc', function () { return state.src; });
    prop('paused', function () { return state.paused; });
    prop('readyState', function () { return state.readyState; });
    prop('seeking', function () { return state.seeking; });
    prop('ended', function () { return state.ended; });
    prop('error', function () { return state.error; });
    prop('duration', function () { return state.duration; });
    prop('currentTime', function () { return state.time; }, function (value) {
      value = Math.max(0, Number(value) || 0);
      if (!state.started) { state.startAt = value; state.time = value; return; }
      var delta = value - state.time;
      if (Math.abs(delta) < 1) return;
      state.seeking = true;
      emit('seeking');
      Device.jump(delta);
      state.time = value;
    });
    prop('muted', function () { return false; }, function () { /* son géré par le téléviseur */ });
    video.canPlayType = function (type) { return /mpegurl|mp2t|mp4|mpeg/i.test(String(type)) ? 'maybe' : ''; };
    video.play = function () {
      if (!state.src) return undefined;
      if (state.paused && state.started) { Device.resume(); state.paused = false; emit('play'); emit('playing'); }
      return undefined;
    };
    video.pause = function () {
      if (!state.started || state.paused) return;
      Device.pause();
      state.paused = true;
      emit('pause');
    };
    video.load = function () { if (!state.src) stop(); };
    var removeAttribute = video.removeAttribute;
    video.removeAttribute = function (name) {
      if (String(name).toLowerCase() === 'src') { state.src = ''; stop(); }
      return removeAttribute.call(video, name);
    };
    video.orsayRect = function () { if (Hardware.owner === video && state.src) Device.rect(screenRect(video)); };
    function stop() {
      state.generation++;
      var wasOwner = Hardware.owner === video;
      state.started = false;
      state.paused = true;
      state.readyState = 0;
      state.time = 0;
      state.duration = NaN;
      if (wasOwner) { Hardware.owner = null; Device.stop(); videoActive(false); }
    }
    function open(url) {
      stop();
      state.src = url;
      state.error = null;
      state.ended = false;
      state.startAt = 0;
      if (!url) { video.removeAttribute('src'); return; }
      video.setAttribute('src', url);
      var generation = state.generation;
      var kind = video.orsayKind || (/\.m3u8(\?|$)|mpegurl/i.test(url) ? 'hls' : '');
      video.orsayKind = '';
      // Comme un <video> : métadonnées annoncées avant la lecture (position de reprise).
      setTimeout(function () {
        if (generation !== state.generation) return;
        state.readyState = 1;
        emit('loadstart');
        emit('loadedmetadata');
        withHardware(function (name) {
          if (generation !== state.generation) return;
          if (!name) { fail(4, 'aucun lecteur vidéo du téléviseur n’a répondu'); return; }
          if (Hardware.owner && Hardware.owner !== video) Hardware.owner._release();
          Hardware.owner = video;
          state.paused = false;
          videoActive(true);
          say('Lecteur du téléviseur (' + (name === 'avplay' ? 'AVPlay' : 'Player') + (kind === 'hls' ? ', HLS' : '') + ')');
          try { Device.open(url, kind, screenRect(video), state.startAt); }
          catch (error) { fail(4, error.message); }
        });
      }, 0);
    }
    function fail(code, detail) {
      state.error = { code: code, message: detail || '' };
      state.readyState = 0;
      say('Erreur du lecteur du téléviseur : ' + (detail || 'code ' + code));
      emit('error');
    }
    video._release = function () { state.generation++; state.started = false; state.paused = true; state.readyState = 0; };
    video._hardware = function (name, data) {
      if (name === 'started') { state.started = true; return; }
      if (name === 'bufferstart') { if (state.readyState > 2) state.readyState = 2; emit('waiting'); return; }
      if (name === 'buffercomplete' || (name === 'time' && state.readyState < 3)) {
        state.started = true;
        var first = state.readyState < 3;
        state.readyState = 4;
        state.seeking = false;
        var total = Device.duration();
        if (total > 0 && state.duration !== total / 1000) { state.duration = total / 1000; emit('durationchange'); }
        if (first && !state.paused) { emit('canplay'); emit('playing'); }
        if (name !== 'time') return;
      }
      if (name === 'time') {
        var seconds = (Number(data) || 0) / 1000;
        if (seconds > 0 || !state.time) state.time = seconds;
        if (state.seeking) { state.seeking = false; emit('seeked'); }
        var now = Date.now();
        if (now - state.lastTimeEvent >= 450) { state.lastTimeEvent = now; emit('timeupdate'); }
        return;
      }
      if (name === 'ended') { state.ended = true; state.paused = true; emit('ended'); return; }
      if (name === 'error') {
        var code = data && (data.code !== undefined ? data.code : data.errorCode);
        var label = data && (data.name || data.message) ? String(data.name || data.message) : '';
        // 19 / 8 : réseau ou flux introuvable ; 3 : décodage ; sinon format refusé.
        fail(code === 19 || code === 8 || /network|connect|notfound/i.test(label) ? 2 : code === 3 ? 3 : 4, 'code ' + code + (label ? ' · ' + label : ''));
      }
    };
    return video;
  }

  // ── Flux ───────────────────────────────────────────────────────────
  function api(method, path, body, timeout) {
    var token = tools && tools.session() ? tools.session().token : '';
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, tools.BASE + path, true);
      xhr.setRequestHeader('x-noctra-token', token);
      xhr.setRequestHeader('Accept', 'application/json');
      if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = timeout || 45000;
      xhr.onload = function () {
        var data = null;
        try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (error) { data = null; }
        if (xhr.status >= 200 && xhr.status < 300) { resolve(data); return; }
        var error = new Error((data && (data.error || data.message)) || 'Erreur ' + xhr.status);
        error.status = xhr.status;
        reject(error);
      };
      xhr.onerror = function () { reject(new Error('Serveur Noctra injoignable')); };
      xhr.ontimeout = function () { reject(new Error('Le serveur Noctra ne répond pas')); };
      xhr.send(body === undefined ? null : JSON.stringify(body));
    });
  }
  function absolute(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return tools.SERVER_ORIGIN + (path.charAt(0) === '/' ? '' : '/') + path;
  }
  function sameServer(url) { return url.indexOf(tools.BASE + '/') === 0 || url.indexOf(tools.SERVER_ORIGIN + '/') === 0; }
  function headersNeeded(headers) {
    return Boolean(headers && typeof headers === 'object' && Object.keys(headers).some(function (name) { return /^(?:referr?er|origin|user-agent)$/i.test(name) && headers[name]; }));
  }
  function kindOf(url, mime) {
    var hint = String(mime || '').toLowerCase();
    if (hint.indexOf('mp2t') >= 0 || /\.ts(\?|$)/i.test(url)) return 'ts';
    if (hint.indexOf('mpegurl') >= 0 || /\.m3u8(\?|$)/i.test(url)) return 'hls';
    if (/\.(mp4|m4v|mkv|mov)(\?|$)/i.test(url)) return 'file';
    return '';
  }
  // Adresse lisible par le lecteur du téléviseur : sans en-tête ni jeton à joindre.
  function directUrl(url, headers) {
    var jellyfin = tools.JF && url.indexOf(tools.JF + '/') === 0;
    if (jellyfin) return Promise.resolve(url);
    // Flux du serveur Noctra (jeton exigé) ou flux externe en HTTPS / avec en-têtes :
    // droit de lecture temporaire, le serveur relaie le flux.
    if ((sameServer(url) && url.indexOf('/api/tv/') >= 0) || (!sameServer(url) && (headersNeeded(headers) || /^https:/i.test(url)))) {
      var body = { url: url };
      if (headersNeeded(headers)) body.headers = headers;
      return api('POST', '/api/tv/cast', body, 20000).then(function (grant) {
        if (!grant || !grant.url) throw new Error('Droit de lecture refusé par le serveur');
        return absolute(grant.url);
      });
    }
    return Promise.resolve(url);
  }
  function stopRelay(engine) {
    var id = engine.orsayRelayId;
    engine.orsayRelayId = '';
    if (id) api('DELETE', '/api/tv/mosaic/' + id, undefined, 10000).then(null, function () { /* déjà terminé */ });
  }
  var Streams = {
    load: function (engine, url, mime, library, headers) {
      var video = engine.video;
      var load = ++engine.loads;
      var info = engine.onInfo || function () {};
      stopRelay(engine);
      try { video.removeAttribute('src'); } catch (error) { /* rien en cours */ }
      engine.orsayRelay = Boolean(library);
      if (library) {
        // Relais du serveur : flux copié dans une liste HLS (MPEG-TS) que le téléviseur lit.
        info('Relais du serveur Noctra (format adapté au téléviseur)…');
        var tile = { url: url, name: 'Noctra' };
        if (headersNeeded(headers)) tile.headers = headers;
        return api('POST', '/api/tv/mosaic', { relay: true, tiles: [tile] }, 50000).then(function (relay) {
          if (load !== engine.loads) { if (relay && relay.id) api('DELETE', '/api/tv/mosaic/' + relay.id).then(null, function () {}); return 'replaced'; }
          if (!relay || !relay.cast) throw new Error('Relais indisponible');
          engine.orsayRelayId = relay.id || '';
          if (relay.ready === false) info('Relais lancé, premiers segments en préparation…');
          video.orsayKind = 'hls';
          video.src = absolute(relay.cast);
          return 'relais';
        }, function (error) {
          if (error.status === 503) throw new Error('Relais impossible : ffmpeg est absent du serveur Noctra');
          throw new Error('Relais du serveur : ' + error.message);
        });
      }
      var kind = kindOf(url, mime);
      return directUrl(url, headers).then(function (target) {
        if (load !== engine.loads) return 'replaced';
        // Flux relayé de type inconnu : ses premiers octets disent HLS ou MPEG-TS.
        var known = kind || (target.indexOf('/api/tv/stream/') < 0 ? 'hls' : '');
        return (known ? Promise.resolve(known) : tools.sniff(target, '')).then(function (found) {
          if (load !== engine.loads) return 'replaced';
          var type = found || 'hls';
          info('Lecteur du téléviseur · ' + (type === 'ts' ? 'MPEG-TS' : type === 'file' ? 'fichier' : 'HLS') + (target !== url ? ' · droit de lecture du serveur' : ''));
          video.orsayKind = type === 'hls' ? 'hls' : '';
          video.src = target;
          return 'native';
        });
      });
    },
    release: function (engine) { stopRelay(engine); },
    canFallback: function (engine) { return !engine.orsayRelay; }
  };

  // ── Multiview : mosaïque composée par le serveur ───────────────────
  var MOSAIC_MAX = 9;
  function mosaicCells(count, featured) {
    var width = 1280, height = 720, cells = [];
    function even(value) { return Math.max(2, Math.floor(value / 2) * 2); }
    if (count <= 0) return cells;
    if (featured >= 0 && featured < count && count > 1 && count <= 8) {
      var small = { w: even(width / 4), h: even(height / 4) };
      var few = count - 1 <= 3;
      var big = { x: 0, y: few ? even((height - height * 0.75) / 2) : 0, w: even(width * 0.75), h: even(height * 0.75) };
      var slots = [], top = few ? big.y + Math.floor(((3 - (count - 1)) * small.h) / 4) * 2 : 0;
      for (var row = 0; row < 3; row++) slots.push({ x: big.w, y: top + row * small.h });
      for (var column = 0; column < 4; column++) slots.push({ x: column * small.w, y: big.h });
      var next = 0;
      for (var index = 0; index < count; index++) {
        if (index === featured) cells.push(big);
        else { var slot = slots[next++]; cells.push({ x: slot.x, y: slot.y, w: small.w, h: small.h }); }
      }
      return cells;
    }
    var columns = count <= 1 ? 1 : count <= 4 ? 2 : 3, rows = Math.ceil(count / columns);
    var w = even(width / columns), h = even(height / rows);
    for (var i = 0; i < count; i++) {
      var r = Math.floor(i / columns), inRow = r === rows - 1 ? count - r * columns : columns;
      var shift = Math.floor(((columns - inRow) * w) / 2 / 2) * 2;
      cells.push({ x: shift + (i % columns) * w, y: r * h, w: w, h: h });
    }
    return cells;
  }
  var Mosaic = {
    node: null, video: null, frame: null, status: null, tiles: [], audio: 0, featured: -1, focus: 0, id: '',
    menu: null, catalog: [], timer: 0, generation: 0, retries: 0, playing: false,

    open: function (items, catalog) {
      if (Mosaic.node) Mosaic.close();
      Mosaic.catalog = (catalog || []).filter(function (channel) { return channel && (channel.stream || channel.resolver); });
      Mosaic.tiles = [];
      (items || []).forEach(function (item) {
        var options = (item.options || []).filter(function (option) { return option && (option.url || option.resolve); });
        if (options.length && Mosaic.tiles.length < MOSAIC_MAX) Mosaic.tiles.push({ title: item.title || '', subtitle: item.subtitle || '', options: options, current: 0, failed: {}, url: '' });
      });
      if (!Mosaic.tiles.length) { tools.send({ type: 'nativeError', message: 'Aucune chaîne de ce multiview n’a de flux direct.' }); return; }
      Mosaic.audio = 0;
      Mosaic.featured = -1;
      Mosaic.focus = 0;
      Mosaic.id = '';
      Mosaic.video = OrsayVideo();
      Mosaic.frame = node('div', 'om-frame');
      Mosaic.status = node('div', 'om-status', 'Préparation du multiview par le serveur…');
      Mosaic.help = node('div', 'om-help', '◀ ▲ ▼ ▶ choisir une chaîne · OK : son, mise en avant, serveur, ajouter, retirer · Retour : quitter');
      Mosaic.node = node('div', 'nw-overlay orsay-mosaic');
      Mosaic.node.id = 'nw-multi';
      Mosaic.node.appendChild(Mosaic.video);
      Mosaic.node.appendChild(Mosaic.frame);
      Mosaic.node.appendChild(Mosaic.status);
      Mosaic.node.appendChild(Mosaic.help);
      document.body.appendChild(Mosaic.node);
      Mosaic.video.addEventListener('playing', function () { Mosaic.retries = 0; Mosaic.playing = true; Mosaic.say(''); });
      Mosaic.video.addEventListener('waiting', function () { Mosaic.say('Chargement…'); });
      Mosaic.video.addEventListener('error', function () {
        if (!Mosaic.node || !Mosaic.video.getAttribute('src')) return;
        // Liste pas encore prête ou coupure : nouvel essai (au plus 6, espacés).
        if (Mosaic.retries < 6) {
          var delay = 2000 + Mosaic.retries * 2000;
          Mosaic.retries++;
          Mosaic.say('Multiview en préparation… nouvel essai dans ' + Math.round(delay / 1000) + ' s');
          setTimeout(function () { if (Mosaic.node && Mosaic.cast) { Mosaic.video.orsayKind = 'hls'; Mosaic.video.src = Mosaic.cast; } }, delay);
        } else Mosaic.say('Le téléviseur ne parvient pas à lire le multiview. Retour : quitter.');
      });
      tools.keepScreenOn(true);
      Mosaic.render();
      Mosaic.apply(0);
    },
    say: function (text) { if (Mosaic.status) { Mosaic.status.textContent = text || ''; Mosaic.status.style.display = text ? '' : 'none'; } },
    // Chaînes réellement composées (les autres attendent un serveur).
    live: function () { return Mosaic.tiles.filter(function (tile) { return tile.url; }); },
    render: function () {
      if (!Mosaic.frame) return;
      var live = Mosaic.live();
      var cells = mosaicCells(live.length, Mosaic.featured >= 0 ? live.indexOf(Mosaic.tiles[Mosaic.featured]) : -1);
      Mosaic.frame.innerHTML = '';
      Mosaic.focus = Math.max(0, Math.min(Mosaic.focus, Mosaic.tiles.length - 1));
      Mosaic.tiles.forEach(function (tile, index) {
        var at = live.indexOf(tile);
        var box = node('div', 'om-box' + (index === Mosaic.focus ? ' on' : '') + (index === Mosaic.audio ? ' audio' : '') + (at < 0 ? ' waiting' : ''));
        if (at >= 0) {
          var cell = cells[at];
          box.style.left = (cell.x / 12.8) + '%'; box.style.top = (cell.y / 7.2) + '%';
          box.style.width = (cell.w / 12.8) + '%'; box.style.height = (cell.h / 7.2) + '%';
        } else {
          // Chaîne sans flux pour le moment : pastille en bas de l'écran.
          box.style.left = (2 + (index % 6) * 16) + '%'; box.style.top = '88%'; box.style.width = '15%'; box.style.height = '9%';
        }
        var option = tile.options[tile.current];
        box.appendChild(node('span', 'om-label', (index === Mosaic.audio ? '♪  ' : '') + tile.title + (tile.options.length > 1 && option ? '  ·  ' + option.label : '') + (at < 0 ? '  ·  ' + (tile.error || 'connexion…') : '')));
        Mosaic.frame.appendChild(box);
      });
    },
    // Changements rapprochés regroupés : une seule recomposition par le serveur.
    apply: function (delay) {
      clearTimeout(Mosaic.timer);
      Mosaic.timer = setTimeout(Mosaic.run, delay === undefined ? 700 : delay);
    },
    resolve: function (tile) {
      var option = tile.options[tile.current];
      if (!option) return Promise.reject(new Error('aucun serveur'));
      if (option.url) return Promise.resolve(option.url);
      return tools.noctraFetch(option.resolve).then(function (result) {
        var list = result && result.options ? result.options : [result];
        var found = list.filter(function (item) { return item && item.streamUrl && !item.manualOnly; })[0];
        if (!found) throw new Error('serveur vide');
        option.url = new URL(found.streamUrl, option.resolve).toString();
        return option.url;
      });
    },
    // Serveurs de la chaîne essayés dans l'ordre jusqu'à obtenir un flux.
    resolveTile: function (tile) {
      return Mosaic.resolve(tile).then(function (url) { tile.url = url; tile.error = ''; }, function () {
        tile.failed[tile.current] = true;
        for (var step = 1; step < tile.options.length; step++) {
          var index = (tile.current + step) % tile.options.length;
          if (!tile.failed[index]) { tile.current = index; return Mosaic.resolveTile(tile); }
        }
        tile.url = '';
        tile.error = 'serveurs indisponibles';
        return null;
      });
    },
    run: function () {
      if (!Mosaic.node) return;
      var generation = ++Mosaic.generation;
      Mosaic.say(Mosaic.playing ? 'Recomposition du multiview…' : 'Préparation du multiview par le serveur…');
      Promise.all(Mosaic.tiles.map(function (tile) { return tile.url ? null : Mosaic.resolveTile(tile); })).then(function () {
        if (generation !== Mosaic.generation || !Mosaic.node) return null;
        var live = Mosaic.live();
        Mosaic.render();
        if (!live.length) { Mosaic.say('Aucune chaîne disponible pour le moment. OK : changer de serveur · Retour : quitter.'); return null; }
        var audioTile = Mosaic.tiles[Mosaic.audio];
        var body = {
          id: Mosaic.id, tiles: live.map(function (tile) { return { url: tile.url, name: tile.title }; }),
          audio: Math.max(0, live.indexOf(audioTile)),
          featured: Mosaic.featured >= 0 ? live.indexOf(Mosaic.tiles[Mosaic.featured]) : -1
        };
        return api('POST', '/api/tv/mosaic', body, 50000).then(function (result) {
          if (generation !== Mosaic.generation || !Mosaic.node) return;
          if (!result || !result.cast) throw new Error('réponse incomplète');
          Mosaic.id = result.id || Mosaic.id;
          Mosaic.cast = absolute(result.cast);
          Mosaic.retries = 0;
          // Liste rouverte à chaque recomposition : discontinuité mal suivie par ce lecteur.
          Mosaic.video.orsayKind = 'hls';
          Mosaic.video.src = Mosaic.cast;
          Mosaic.publish();
        });
      }).then(null, function (error) {
        if (generation !== Mosaic.generation || !Mosaic.node) return;
        Mosaic.say(error.status === 503 ? 'Multiview impossible : ffmpeg est absent du serveur Noctra (voir le guide).' : 'Multiview indisponible : ' + error.message + '. Retour : quitter.');
      });
    },
    publish: function () {
      tools.send({ type: 'multiviewState', state: {
        tiles: Mosaic.tiles.map(function (tile) { return { title: tile.title, subtitle: tile.subtitle }; }),
        audio: Mosaic.node ? Mosaic.audio : -1,
        featured: Mosaic.featured
      } });
    },
    remote: function (message) {
      var command = message.command;
      if (command === 'state') { Mosaic.publish(); return; }
      if (!Mosaic.node) return;
      var index = Number(message.index);
      if (command === 'close') { Mosaic.close(); return; }
      if (command === 'add') {
        var item = message.item || {};
        var options = (item.options || []).filter(function (option) { return option && (option.url || option.resolve); });
        if (options.length) Mosaic.addTile({ title: String(item.title || ''), subtitle: String(item.subtitle || ''), options: options });
        return;
      }
      if (command === 'grid') { Mosaic.featured = -1; Mosaic.render(); Mosaic.apply(); return; }
      if (!Mosaic.tiles[index]) return;
      if (command === 'remove') Mosaic.remove(index);
      else if (command === 'audio') Mosaic.listen(index);
      else if (command === 'feature') Mosaic.feature(Mosaic.featured === index ? -1 : index);
      else if (command === 'solo') { Mosaic.audio = index; Mosaic.feature(index); }
    },
    listen: function (index) { if (Mosaic.audio === index) return; Mosaic.audio = index; Mosaic.render(); Mosaic.apply(); },
    feature: function (index) { Mosaic.featured = Mosaic.tiles.length > 1 ? index : -1; Mosaic.render(); Mosaic.apply(); },
    addTile: function (item) {
      if (Mosaic.tiles.length >= MOSAIC_MAX) { Mosaic.say('Ce téléviseur affiche ' + MOSAIC_MAX + ' chaînes au plus.'); return; }
      Mosaic.tiles.push({ title: item.title, subtitle: item.subtitle || '', options: item.options, current: 0, failed: {}, url: '' });
      Mosaic.focus = Mosaic.tiles.length - 1;
      Mosaic.render();
      Mosaic.apply();
    },
    remove: function (index) {
      Mosaic.tiles.splice(index, 1);
      if (!Mosaic.tiles.length) { Mosaic.close(); return; }
      if (Mosaic.audio === index) Mosaic.audio = 0; else if (Mosaic.audio > index) Mosaic.audio--;
      if (Mosaic.featured === index) Mosaic.featured = -1; else if (Mosaic.featured > index) Mosaic.featured--;
      Mosaic.render();
      Mosaic.apply();
    },
    nextServer: function (index) {
      var tile = Mosaic.tiles[index];
      tile.failed = {};
      tile.current = (tile.current + 1) % tile.options.length;
      if (tile.options[tile.current].resolve) tile.options[tile.current].url = '';
      tile.url = '';
      Mosaic.render();
      Mosaic.apply();
    },
    pickServer: function (index) {
      var tile = Mosaic.tiles[index];
      Mosaic.showMenu(tile.title + ' · serveurs', tile.options.map(function (option, at) {
        return [(at === tile.current ? '▶  ' : '') + option.label, function () {
          tile.current = at;
          tile.failed = {};
          if (option.resolve) option.url = '';
          tile.url = '';
          Mosaic.render();
          Mosaic.apply();
        }];
      }));
    },
    openMenu: function () {
      var index = Mosaic.focus, tile = Mosaic.tiles[index];
      if (!tile) return;
      var entries = [];
      if (index !== Mosaic.audio) entries.push(['♪  Écouter cette chaîne', function () { Mosaic.listen(index); }]);
      if (Mosaic.tiles.length > 1) entries.push([Mosaic.featured === index ? 'Revenir à la grille' : 'Mettre en avant', function () { Mosaic.feature(Mosaic.featured === index ? -1 : index); }]);
      if (tile.options.length > 1) entries.push(['Changer de serveur (' + tile.options.length + ')', function () { Mosaic.pickServer(index); }]);
      else entries.push(['Relancer cette chaîne', function () { Mosaic.nextServer(index); }]);
      if (Mosaic.tiles.length < MOSAIC_MAX && Mosaic.catalog.length) entries.push(['＋  Ajouter une chaîne (' + Mosaic.tiles.length + '/' + MOSAIC_MAX + ')', function () { Mosaic.addChannel(); }]);
      entries.push([Mosaic.tiles.length > 1 ? '✕  Retirer cette chaîne' : '✕  Retirer cette chaîne et quitter', function () { Mosaic.remove(index); }]);
      entries.push(['Quitter le multiview', function () { Mosaic.close(); }]);
      Mosaic.showMenu(tile.title, entries);
    },
    showMenu: function (title, entries) {
      Mosaic.hideMenu();
      var el = tools.el;
      var list = el('div', { class: 'nw-sheet nw-scroll' }, el('h2', { text: title }));
      entries.forEach(function (entry) {
        list.appendChild(el('button', { class: 'nw-f nw-btn', onclick: function () { Mosaic.hideMenu(); entry[1](); } }, entry[0]));
      });
      Mosaic.menu = el('div', { class: 'nw-overlay nw-sheet-back' }, list);
      document.body.appendChild(Mosaic.menu);
      var first = Mosaic.menu.querySelector('.nw-f');
      if (first) first.focus();
    },
    hideMenu: function () {
      if (Mosaic.menu && Mosaic.menu.parentNode) Mosaic.menu.parentNode.removeChild(Mosaic.menu);
      Mosaic.menu = null;
    },
    addChannel: function () {
      var groups = {}, order = [];
      Mosaic.catalog.forEach(function (channel) {
        if (Mosaic.tiles.some(function (tile) { return tile.title === channel.title && tile.subtitle === (channel.subtitle || ''); })) return;
        var group = channel.group || 'Chaînes';
        if (!groups[group]) { groups[group] = []; order.push(group); }
        groups[group].push(channel);
      });
      if (!order.length) { Mosaic.showMenu('Toutes les chaînes disponibles sont affichées.', [['Fermer', function () {}]]); return; }
      function pick(group) {
        Mosaic.showMenu(group, groups[group].slice(0, 300).map(function (channel) {
          return [channel.title, function () { Mosaic.addFromCatalog(channel); }];
        }));
      }
      if (order.length === 1) { pick(order[0]); return; }
      Mosaic.showMenu('Ajouter une chaîne', order.map(function (group) { return [group + '  (' + groups[group].length + ')', function () { pick(group); }]; }));
    },
    addFromCatalog: function (channel) {
      var ready = channel.stream
        ? Promise.resolve([{ label: 'Flux direct', url: channel.stream, mime: channel.mime || '' }])
        : tools.noctraFetch(channel.resolver).then(function (result) {
          var list = result && result.options ? result.options : [result], direct = [], automatic = [];
          list.forEach(function (item, i) {
            if (!item || item.manualOnly) return;
            if (item.streamUrl) direct.push({ label: item.label || 'Flux direct', url: new URL(item.streamUrl, channel.resolver).toString() });
            else if (item.resolveUrl && !item.url) automatic.push({ label: item.label || 'Serveur ' + (i + 1), resolve: new URL(item.resolveUrl, channel.resolver).toString() });
          });
          return direct.concat(automatic);
        });
      ready.then(function (options) {
        if (!Mosaic.node) return;
        if (!options.length) { Mosaic.showMenu(channel.title + ' : aucun flux direct (lecteur du site seulement, non disponible sur ce téléviseur).', [['Fermer', function () {}]]); return; }
        Mosaic.addTile({ title: channel.title, subtitle: channel.subtitle || '', options: options });
      }, function () { Mosaic.showMenu(channel.title + ' : serveurs introuvables.', [['Fermer', function () {}]]); });
    },
    move: function (code) {
      var boxes = Mosaic.frame ? Mosaic.frame.children : [];
      var from = boxes[Mosaic.focus];
      if (!from) return;
      var a = from.getBoundingClientRect(), best = -1, score = Infinity;
      for (var i = 0; i < boxes.length; i++) {
        if (i === Mosaic.focus) continue;
        var b = boxes[i].getBoundingClientRect();
        var primary = code === STANDARD.left ? a.left - b.right : code === STANDARD.right ? b.left - a.right : code === STANDARD.up ? a.top - b.bottom : b.top - a.bottom;
        if (primary < -10) continue;
        var secondary = code === STANDARD.left || code === STANDARD.right ? Math.abs((a.top + a.bottom) - (b.top + b.bottom)) / 2 : Math.abs((a.left + a.right) - (b.left + b.right)) / 2;
        if (primary + secondary * 2 < score) { score = primary + secondary * 2; best = i; }
      }
      if (best >= 0) { Mosaic.focus = best; Mosaic.render(); }
    },
    key: function (event) {
      if (Mosaic.menu) return tools.listKeys(Mosaic.menu, event, Mosaic.hideMenu);
      var code = event.keyCode;
      if (code === STANDARD.left || code === STANDARD.right || code === STANDARD.up || code === STANDARD.down) { Mosaic.move(code); return true; }
      if (tools.is(event, 'enter')) { Mosaic.openMenu(); return true; }
      if (tools.is(event, 'back') || tools.is(event, 'stop')) { Mosaic.close(); return true; }
      if (tools.is(event, 'info')) { Mosaic.help.style.display = Mosaic.help.style.display === 'none' ? '' : 'none'; return true; }
      return true;
    },
    close: function () {
      clearTimeout(Mosaic.timer);
      Mosaic.generation++;
      Mosaic.hideMenu();
      if (Mosaic.id) api('DELETE', '/api/tv/mosaic/' + Mosaic.id, undefined, 10000).then(null, function () { /* déjà terminé */ });
      Mosaic.id = '';
      Mosaic.cast = '';
      Mosaic.playing = false;
      if (Mosaic.video) Mosaic.video.removeAttribute('src');
      if (Mosaic.node && Mosaic.node.parentNode) Mosaic.node.parentNode.removeChild(Mosaic.node);
      Mosaic.node = null;
      Mosaic.tiles = [];
      Mosaic.publish();
      tools.keepScreenOn(false);
    }
  };

  // ── Écran de veille, sortie ────────────────────────────────────────
  function screenSaver(on) {
    try { if (pluginAPI) { if (on) pluginAPI.setOnScreenSaver(); else pluginAPI.setOffScreenSaver(); } } catch (error) { /* réglage indisponible */ }
  }
  function exit() {
    Device.stop();
    try { if (widgetAPI) { widgetAPI.sendReturnEvent(); return; } } catch (error) { /* hors téléviseur */ }
    window.close();
  }

  // ── Serveur Noctra : choix, test, diagnostic ───────────────────────
  function normalize(value) {
    var url = String(value || '').replace(/^\s+|\s+$/g, '');
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(url) ? 'http://' : 'https://') + url;
    return url.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\/(client(\/index\.html)?|health|tv-app(\/index\.html)?)$/i, '');
  }
  function loadServer() {
    try {
      var saved = JSON.parse(localStorage.getItem(SERVER_KEY) || 'null');
      if (saved && saved.url) return saved;
    } catch (error) { /* rien d'enregistré */ }
    return { url: config.defaultServerUrl || '', relay: '' };
  }
  function saveServer(entry) { try { localStorage.setItem(SERVER_KEY, JSON.stringify(entry)); } catch (error) { /* stockage plein */ } }
  // Adresse utilisée : le relais local (s'il est indiqué), sinon le serveur.
  function activeBase(entry) {
    // Connexion non chiffrée acceptée (HTTPS refusé par le téléviseur, serveur joignable en HTTP).
    if (!entry.relay) return entry.insecure ? entry.url.replace(/^https:/i, 'http:') : entry.url;
    var path = '';
    try { path = new URL(entry.url).pathname.replace(/\/+$/, ''); } catch (error) { path = ''; }
    return normalize(entry.relay).replace(/\/+$/, '') + path;
  }
  // /health du serveur : 0 = connexion refusée par le téléviseur (certificat,
  // réseau), sinon la réponse dit si c'est bien un serveur Noctra.
  function probe(base, done) {
    var finished = false;
    function finish(result) { if (!finished) { finished = true; done(result); } }
    var xhr = new XMLHttpRequest();
    try {
      xhr.open('GET', base + '/health?orsay=' + Date.now(), true);
      xhr.timeout = 12000;
      xhr.onload = function () {
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (error) { data = null; }
        if (xhr.status >= 200 && xhr.status < 300 && data && data.client === 'Noctra') finish({ ok: true, version: data.version || '' });
        else if (xhr.status) finish({ ok: false, status: xhr.status, error: xhr.status === 404 ? 'Aucun serveur Noctra à cette adresse (erreur 404).' : 'Le serveur a répondu avec l’erreur ' + xhr.status + '.' });
        else finish({ ok: false, status: 0 });
      };
      xhr.onerror = function () { finish({ ok: false, status: 0 }); };
      xhr.ontimeout = function () { finish({ ok: false, status: -1, error: 'Le serveur ne répond pas (délai dépassé).' }); };
      xhr.send();
    } catch (error) { finish({ ok: false, status: 0, error: error.message }); }
  }
  function explain(entry, result) {
    if (result.error) return result.error;
    var https = /^https:/i.test(activeBase(entry));
    return https
      ? 'Le téléviseur n’a pas pu ouvrir la connexion sécurisée (HTTPS) vers le serveur. Sur un modèle de 2014, la cause la plus probable est le certificat du serveur, plus récent que les autorités connues du téléviseur (il n’accepte plus les certificats actuels). Solution : le relais Noctra, installé sur la seedbox (toujours allumée, rien à laisser allumé chez vous) ou sur un appareil de la maison (voir le guide, « Relais »), puis « Utiliser un relais local ». Vérifiez aussi la connexion Internet du téléviseur (Menu › Réseau › État du réseau).'
      : 'Le téléviseur ne joint pas ' + activeBase(entry).replace(/^https?:\/\//, '') + '. Vérifiez que l’appareil du relais est allumé, que le relais est lancé, et que le téléviseur et cet appareil sont sur le même réseau.';
  }

  var Boot = {
    node: null, items: [], at: 0, input: null,
    show: function (title, message, actions, field) {
      Boot.hide();
      var box = node('div', 'ob-card');
      var brand = node('div', 'ob-brand');
      var mark = document.createElement('img');
      mark.src = 'noctra-mark.svg';
      mark.alt = '';
      brand.appendChild(mark);
      brand.appendChild(node('span', '', 'Noctra'));
      box.appendChild(brand);
      box.appendChild(node('h1', '', title));
      if (message) message.split('\n').forEach(function (line) { box.appendChild(node('p', 'ob-text', line)); });
      Boot.input = null;
      Boot.items = [];
      if (field) {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'ob-input';
        input.value = field.value || '';
        input.setAttribute('placeholder', field.placeholder || '');
        input._submit = field.submit;
        box.appendChild(input);
        Boot.input = input;
        Boot.items.push(input);
      }
      var row = node('div', 'ob-actions');
      (actions || []).forEach(function (action) {
        var button = node('button', 'ob-btn' + (action.primary ? ' primary' : ''), action.label);
        button.onclick = action.run;
        row.appendChild(button);
        Boot.items.push(button);
      });
      box.appendChild(row);
      box.appendChild(node('p', 'ob-foot', 'Noctra pour Samsung Smart TV 2014 · ' + VERSION + (Hardware.name ? ' · lecteur ' + Hardware.name : '')));
      Boot.node = node('div', 'ob-screen');
      Boot.node.id = 'orsay-boot';
      Boot.node.appendChild(box);
      document.body.appendChild(Boot.node);
      Boot.at = 0;
      Boot.focus();
    },
    focus: function () {
      Boot.items.forEach(function (item, index) { item.className = item.className.replace(/\s*\bon\b/g, '') + (index === Boot.at ? ' on' : ''); });
      var item = Boot.items[Boot.at];
      if (item) try { item.focus(); } catch (error) { /* élément masqué */ }
    },
    busy: function (text) { Boot.show('Connexion', text, [{ label: 'Annuler', run: function () { Boot.cancelled = true; Boot.menu(''); } }]); },
    key: function (code) {
      if (!Boot.items.length) return;
      if (code === STANDARD.up || code === STANDARD.left) { Boot.at = Math.max(0, Boot.at - 1); Boot.focus(); return; }
      if (code === STANDARD.down || code === STANDARD.right) { Boot.at = Math.min(Boot.items.length - 1, Boot.at + 1); Boot.focus(); return; }
      if (code >= 48 && code <= 57 && Boot.input) { insertText(Boot.input, String(code - 48)); return; }
      if (code === STANDARD.enter) {
        var item = Boot.items[Boot.at];
        if (item === Boot.input) { Keyboard.open(Boot.input); return; }
        if (item && item.onclick) item.onclick();
        return;
      }
      if (code === STANDARD.back) { if (started) Boot.hide(); else exit(); }
    },
    hide: function () {
      if (Boot.node && Boot.node.parentNode) Boot.node.parentNode.removeChild(Boot.node);
      Boot.node = null;
      Boot.items = [];
    },
    // Écran principal des réglages de connexion (diagnostic éventuel).
    menu: function (problem) {
      var entry = loadServer();
      var lines = (problem ? problem + '\n' : '') + 'Serveur : ' + (entry.url || 'non défini') + (entry.insecure && !entry.relay ? ' (en HTTP non chiffré)' : '')
        + '\nRelais : ' + (entry.relay || 'aucun (connexion directe au serveur)');
      var actions = [
        { label: 'Réessayer', primary: true, run: function () { Boot.connect(); } },
        { label: 'Utiliser un relais local', run: function () { Boot.askRelay(); } },
        { label: 'Adresse du serveur', run: function () { Boot.askServer(); } }
      ];
      if (entry.relay) actions.push({ label: 'Connexion directe (sans relais)', run: function () { entry.relay = ''; saveServer(entry); Boot.connect(); } });
      if (entry.insecure && !entry.relay) actions.push({ label: 'Revenir au HTTPS', run: function () { entry.insecure = false; saveServer(entry); Boot.connect(); } });
      if (started) actions.push({ label: 'Fermer', run: function () { Boot.hide(); } });
      else actions.push({ label: 'Quitter', run: exit });
      Boot.show(problem ? 'Connexion impossible' : 'Connexion au serveur', lines, actions);
    },
    askServer: function () {
      var entry = loadServer();
      var submit = function () {
        var url = normalize(Boot.input.value);
        if (!/^https?:\/\/[^\s\/?#]+/i.test(url)) { Boot.menu('Adresse invalide. Exemple : https://mon-serveur.fr/noctra'); return; }
        entry.url = url;
        entry.insecure = false;
        saveServer(entry);
        Boot.connect();
      };
      Boot.show('Adresse du serveur Noctra', 'Exemple : https://mon-serveur.fr/noctra\nOK sur le champ : clavier à l’écran.',
        [{ label: 'Valider', primary: true, run: submit }, { label: 'Retour', run: function () { Boot.menu(''); } }],
        { value: entry.url || config.defaultServerUrl || '', placeholder: 'https://…/noctra', submit: submit });
    },
    askRelay: function () {
      var entry = loadServer();
      var submit = function () {
        // Relais : toujours en HTTP (c'est tout son intérêt), sauf adresse complète saisie.
        var typed = String(Boot.input.value || '').replace(/^\s+|\s+$/g, '');
        var relay = typed ? normalize(/^https?:\/\//i.test(typed) ? typed : 'http://' + typed) : '';
        if (relay && !/^https?:\/\/[^\s\/?#]+/i.test(relay)) { Boot.menu('Adresse du relais invalide. Exemple : 192.168.1.20:8095'); return; }
        // Origine seule (http://192.168.1.20:8095) : le chemin du serveur (/noctra) est ajouté.
        entry.relay = relay ? relay.replace(/^(https?:\/\/[^\/]+).*$/i, '$1') : '';
        saveServer(entry);
        Boot.connect();
      };
      Boot.show('Relais Noctra', 'Adresse affichée par le relais : celui de la seedbox (par exemple 169.150.243.3:12345, voir le guide) ou celui d’un PC, NAS ou Raspberry Pi de la maison (par exemple 192.168.1.20:8095).\nLaissez vide pour ne plus l’utiliser.',
        [{ label: 'Valider', primary: true, run: submit }, { label: 'Retour', run: function () { Boot.menu(''); } }],
        { value: (entry.relay || '').replace(/^http:\/\//, ''), placeholder: '192.168.1.20:8095', submit: submit });
    },
    // HTTPS refusé : le même serveur répond-il en HTTP simple ? (pas de redirection
    // vers HTTPS chez l'hébergeur). Proposé, jamais imposé : rien n'est chiffré.
    tryHttp: function (entry, base, failure) {
      var plain = base.replace(/^https:/i, 'http:');
      Boot.busy('Connexion sécurisée refusée par le téléviseur. Essai de ' + plain.replace(/^http:\/\//, '') + ' en HTTP…');
      probe(plain, function (result) {
        if (Boot.cancelled) return;
        if (!result.ok) { Boot.menu(explain(entry, failure)); return; }
        Boot.show('Connexion sécurisée impossible',
          'Le téléviseur refuse le certificat HTTPS du serveur (trop récent pour un modèle de 2014), mais le serveur répond aussi en HTTP simple.\n'
          + 'En HTTP, les échanges avec le serveur ne sont pas chiffrés : sur Internet, votre jeton de session pourrait être lu. Connectez-vous de préférence avec Quick Connect (le mot de passe ne passe pas par le téléviseur).\n'
          + 'Solution chiffrée : le relais local (voir le guide).',
          [{ label: 'Utiliser HTTP', primary: true, run: function () { entry.insecure = true; saveServer(entry); Boot.connect(); } },
            { label: 'Utiliser un relais local', run: function () { Boot.askRelay(); } },
            { label: 'Retour', run: function () { Boot.menu(explain(entry, failure)); } }]);
      });
    },
    connect: function () {
      var entry = loadServer();
      if (!entry.url) { Boot.askServer(); return; }
      var base = activeBase(entry);
      Boot.cancelled = false;
      Boot.busy('Vérification de ' + base.replace(/^https?:\/\//, '') + '…');
      probe(base, function (result) {
        if (Boot.cancelled) return;
        if (!result.ok && result.status === 0 && /^https:/i.test(base)) { Boot.tryHttp(entry, base, result); return; }
        if (!result.ok) { Boot.menu(explain(entry, result)); return; }
        Boot.hide();
        if (started) { location.reload(); return; }
        launch(base);
      });
    }
  };

  // ── Interface Noctra TV ────────────────────────────────────────────
  // Chargée après le choix du serveur (elle lit son adresse au démarrage).
  function launch(base) {
    window.NOCTRA_HOST_QUERY = '?platform=orsay&server=' + encodeURIComponent(base);
    var scripts = ['tv-native.js', 'tv-data.js', 'app.js'];
    var loading = node('div', 'ob-loading', 'Ouverture de Noctra…');
    document.body.appendChild(loading);
    (function next(index) {
      if (index >= scripts.length) {
        started = true;
        if (loading.parentNode) loading.parentNode.removeChild(loading);
        if (typeof window.NoctraHostStart === 'function') window.NoctraHostStart();
        return;
      }
      var script = document.createElement('script');
      script.src = scripts[index] + (VERSION ? '?v=' + encodeURIComponent(VERSION) : '');
      script.onload = function () { next(index + 1); };
      script.onerror = function () { loading.textContent = 'Fichier manquant dans l’appli : ' + scripts[index] + '. Réinstallez Noctra (voir le guide).'; };
      document.body.appendChild(script);
    })(0);
  }

  // ── API pour tv-native.js ──────────────────────────────────────────
  window.NoctraOrsay = {
    deviceName: 'Samsung Smart TV 2014',
    version: VERSION,
    bridge: function (value) {
      tools = value;
      tools.handlers.push({ active: function () { return Boolean(Mosaic.node); }, key: Mosaic.key });
    },
    video: OrsayVideo,
    load: Streams.load,
    release: Streams.release,
    canFallback: Streams.canFallback,
    // Ce que le téléviseur décode d'un flux Jellyfin : H.264 (High 4.1) et AAC / MP3 stéréo.
    codecs: function () { return { hevc: false, vp9: false, ac3: false, eac3: false, dts: false }; },
    engine: function () { return { version: 'WebKit 537 (Samsung 2014)', major: 0, package: '', recommended: 0 }; },
    keepScreenOn: function (on) { screenSaver(!on); },
    exit: exit,
    multiview: Mosaic.open,
    multiviewRemote: Mosaic.remote,
    settings: function () {
      return [['Serveur et relais local (Samsung 2014)', function () { Boot.menu(''); }]];
    },
    onLoad: function () {
      try { if (widgetAPI) widgetAPI.sendReadyEvent(); } catch (error) { /* hors téléviseur */ }
      keepFocus();
      Boot.connect();
    },
    onShow: function () {
      try {
        var nnavi = $('pluginObjectNNavi');
        if (nnavi && nnavi.SetBannerState) nnavi.SetBannerState(1);
        if (pluginAPI && tvKey) {
          // Volume et Muet : gérés par le téléviseur (bandeau de volume habituel).
          pluginAPI.unregistKey(tvKey.KEY_VOL_UP);
          pluginAPI.unregistKey(tvKey.KEY_VOL_DOWN);
          pluginAPI.unregistKey(tvKey.KEY_MUTE);
        }
      } catch (error) { /* hors téléviseur */ }
    },
    onUnload: function () {
      // Décodeur libéré et relais du serveur arrêtés avant la fermeture.
      Device.stop();
      if (Mosaic.node) Mosaic.close();
      try { if (window.localStorage) Store.save(); } catch (error) { /* rien à enregistrer */ }
    },
    // Pour les tests automatiques (navigateur) : état interne en lecture.
    debug: { keys: KEYS, hardware: Hardware, mosaic: Mosaic, boot: Boot, keyboard: Keyboard, normalize: normalize, activeBase: activeBase, mosaicCells: mosaicCells }
  };
  window.onShow = window.NoctraOrsay.onShow;
})();
