// Noctra 200.107h — « Aurora » : reflet lumineux qui suit le pointeur sur les
// cartes. Purement décoratif : un seul écouteur passif, limité à une mise à
// jour par image, inactif sur écran tactile, en lecture ou en mouvement réduit.
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
})();
