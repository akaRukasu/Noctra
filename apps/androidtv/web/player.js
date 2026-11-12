/* Page du lecteur web (NoctraWebPlayerActivity, processus séparé) : ouvre la
   page du fournisseur dans une iframe et relaie ses états à l'appli. */
(function () {
  'use strict';
  var params = new URLSearchParams(location.hash.slice(1));
  var src = params.get('src') || '';
  var token = params.get('token') || '';
  var base = (params.get('base') || '').replace(/\/+$/, '');
  var frame = document.getElementById('frame');
  var wait = document.getElementById('wait');
  var port = null;
  var queue = [];
  var sameOrigin = false;
  try { sameOrigin = new URL(src, location.href).origin === location.origin; } catch (error) { sameOrigin = false; }
  if (params.get('compat') === '1') frame.setAttribute('scrolling', 'auto');
  // Cadre identique à celui du PC : référent (LiveWatch : aucun) et bac à
  // sable propres au fournisseur (absent pour les lecteurs qui le refusent).
  frame.referrerPolicy = params.get('referrer') || 'strict-origin-when-cross-origin';
  if (params.has('sandbox')) frame.setAttribute('sandbox', params.get('sandbox'));

  function send(message) {
    if (port) port.postMessage(JSON.stringify(message));
    else if (queue.length < 20) queue.push(message);
  }
  window.addEventListener('message', function (event) {
    if (event.data === 'noctra-host' && event.source === null && event.ports && event.ports[0]) {
      port = event.ports[0];
      queue.splice(0).forEach(send);
      return;
    }
    var data = event.data;
    if (event.source !== frame.contentWindow || !data || typeof data !== 'object') return;
    if (!/^noctra-[a-z]+-state$/.test(String(data.type || ''))) return;
    if (data.state === 'playing' || data.state === 'ready') {
      wait.style.display = 'none';
      send({ state: 'playing' });
    } else if (data.state === 'media' && data.url && sameOrigin) {
      // Flux trouvé par le pont du serveur : lecture native, plus stable.
      send({ state: 'media', url: new URL(data.url, location.href).href });
    } else if (data.state === 'error' || data.state === 'stalled' || data.state === 'vip-missed') {
      send({ state: 'error', message: data.message || 'Ce lecteur web ne répond pas.' });
    }
  });
  frame.addEventListener('load', function () {
    wait.style.display = 'none';
    if (frame.getAttribute('src')) send({ state: 'loaded' });
  });

  // Lecteurs préparés par le serveur Noctra : cookie de session nécessaire.
  var ready = sameOrigin && token
    ? fetch(base + '/api/session', { headers: { 'x-noctra-token': token }, credentials: 'same-origin' }).catch(function () { return null; })
    : Promise.resolve(null);
  ready.then(function () { frame.src = src; });
})();
