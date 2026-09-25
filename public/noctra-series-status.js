(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const cache = new Map(), queued = new Set(), queue = [];
  let active = 0, scheduled = false;
  function paint(host, result) {
    if (result.state === 'not-series') return;
    let badge = host.querySelector(':scope > .noctra-series-status');
    if (badge?.dataset.state === result.state && badge.textContent === result.label && badge.title === result.description) return;
    if (!badge) { badge = document.createElement('span'); badge.className = 'noctra-series-status'; host.append(badge); }
    badge.dataset.state = result.state;
    badge.textContent = result.label;
    badge.title = result.description;
    badge.setAttribute('aria-label', `${result.label}. ${result.description}`);
  }
  async function pump() {
    while (active < 2 && queue.length) {
      const {id, host} = queue.shift();
      if (!host.isConnected) { queued.delete(id); continue; }
      active++;
      const token = window.ApiClient?.accessToken?.() || '';
      fetch(new URL(`api/library/series-status?id=${encodeURIComponent(id)}`, base), {headers:token ? {'x-noctra-token':token} : {},credentials:'same-origin', signal:AbortSignal.timeout(120000)})
        .then(r => {if (!r.ok) throw Error(); return r.json();})
        .then(result => {cache.set(id,result); if (host.isConnected) paint(host,result);})
        .catch(() => {if (host.isConnected) paint(host,{state:'unknown',label:'Non vérifié',description:'Vérification momentanément indisponible.'});})
        .finally(() => {active--;queued.delete(id);pump();schedule();});
    }
  }
  function request(host, id) {
    if (cache.has(id)) {paint(host,cache.get(id));return;}
    if (queued.has(id)) return;
    queued.add(id);queue.push({id,host});pump();
  }
  let observed = new WeakMap();
  const visible = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) {visible.unobserve(e.target);request(e.target,observed.get(e.target));}
  }, {rootMargin:'100px'});
  function update() {
    scheduled = false;
    for (const card of document.querySelectorAll('.card[data-type="Series" i][data-id]')) {
      const host = card.querySelector('.cardBox') || card;
      if (card.closest('.hide,[hidden]')) continue;
      if (cache.has(card.dataset.id)) {paint(host,cache.get(card.dataset.id));continue;}
      if (observed.get(host) !== card.dataset.id) {observed.set(host,card.dataset.id);visible.observe(host);}
    }
    // Jellyfin detail pages do not consistently expose their type in the DOM.
    const route = location.hash.split('?');
    if (/^#\/details(?:\.html)?$/.test(route[0])) {
      const id = new URLSearchParams(route[1]).get('id');
      const host = document.querySelector('.itemDetailPage:not(.hide) .nameContainer');
      if (host && id && observed.get(host) !== id) {host.querySelector('.noctra-series-status')?.remove();observed.set(host,id);request(host,id);}
    }
  }
  function schedule() {if (!scheduled) {scheduled=true;requestAnimationFrame(update);}}
  new MutationObserver(mutations => {
    if (mutations.some(m => !m.target.closest?.('.noctra-series-status') && [...m.addedNodes,...m.removedNodes].some(n=>n.nodeType===1 && !n.classList.contains('noctra-series-status')))) schedule();
  }).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  function refresh() {
    if (document.hidden) return;
    cache.clear(); observed = new WeakMap(); schedule();
  }
  // Refresh after library scans instead of keeping the first result until a reload.
  window.addEventListener('focus',refresh);
  setInterval(refresh, 5 * 60 * 1000);
  schedule();
})();
