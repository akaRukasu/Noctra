// Noctra 200.0.108 — « Aurora 2 ». Effets purement décoratifs :
// - reflet lumineux qui suit le pointeur sur les cartes (écouteur passif,
//   une mise à jour par image, inactif au tactile, en lecture, mouvement réduit) ;
// - lumière ambiante de l'accueil : l'affiche en cours est reprise en halo
//   flouté derrière la page (lecture seule du DOM, aucune requête nouvelle :
//   l'image est déjà chargée par l'affiche).
(() => {
  'use strict';
  const root = document.documentElement;
  if (root.dataset.noctraSkin !== 'aurora') return;
  const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const selector = '.card .cardImageContainer, .noctra-library-card';
  let target = null;
  let x = 0;
  let y = 0;
  let frame = 0;

  const paint = () => {
    frame = 0;
    if (!target?.isConnected) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    target.style.setProperty('--na-mx', `${Math.round(x - rect.left)}px`);
    target.style.setProperty('--na-my', `${Math.round(y - rect.top)}px`);
  };

  const onMove = event => {
    if (!finePointer?.matches || reducedMotion?.matches) return;
    if (document.body?.classList.contains('noctra-playing')) return;
    const element = event.target instanceof Element ? event.target : null;
    const card = element?.closest('.card') || element?.closest('.noctra-library-card');
    target = card ? (card.matches('.noctra-library-card') ? card : card.querySelector('.cardImageContainer')) : null;
    if (!target || !target.matches(selector)) { target = null; return; }
    x = event.clientX;
    y = event.clientY;
    if (!frame) frame = window.requestAnimationFrame(paint);
  };

  try {
    document.addEventListener('pointermove', onMove, { passive: true });
  } catch {
    // Effet optionnel : l'interface reste pleinement fonctionnelle sans lui.
  }

  // Lumière ambiante : deux calques en fondu enchaîné, mis à jour au plus
  // toutes les 1,2 s et uniquement sur l'accueil visible.
  const ambient = document.createElement('div');
  ambient.id = 'na-ambient';
  ambient.setAttribute('aria-hidden', 'true');
  ambient.innerHTML = '<i></i><i></i>';
  let ambientImage = '';
  let ambientLayer = 0;
  const cssUrl = value => `url("${String(value).replace(/["\\\n\r]/g, encodeURIComponent)}")`;
  const syncAmbient = () => {
    const body = document.body;
    if (!body || document.hidden) return;
    if (!ambient.isConnected) body.prepend(ambient);
    const art = body.classList.contains('noctra-home') && !body.classList.contains('noctra-playing')
      ? document.querySelector('.noctra-premiere .noctra-premiere-art[data-image]')
      : null;
    const image = art?.dataset.image || '';
    if (!image) { ambient.dataset.ready = 'false'; return; }
    if (image === ambientImage) { ambient.dataset.ready = 'true'; return; }
    ambientImage = image;
    const layers = ambient.children;
    ambientLayer = 1 - ambientLayer;
    layers[ambientLayer].style.backgroundImage = cssUrl(image);
    layers[ambientLayer].dataset.on = 'true';
    layers[1 - ambientLayer].dataset.on = 'false';
    ambient.dataset.ready = 'true';
  };
  try {
    window.setInterval(syncAmbient, 1200);
    document.addEventListener('visibilitychange', syncAmbient);
    if (document.readyState !== 'loading') syncAmbient();
    else document.addEventListener('DOMContentLoaded', syncAmbient, { once: true });
  } catch {
    // Effet optionnel.
  }
})();
