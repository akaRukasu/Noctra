// Noctra 200.0.113 — « Aurora Motion ». Effets purement décoratifs :
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

  // ───────────── 200.0.113 — Aurora Motion ─────────────
  // Rien n'est animé si l'utilisateur réduit les animations ; tout est coupé
  // en lecture. Les écouteurs sont passifs et limités à une mise à jour par image.
  const motionAllowed = () => !reducedMotion?.matches;
  const playing = () => document.body?.classList.contains('noctra-playing');
  const perfDesktop = () => root.classList.contains('noctra-performance-desktop') && finePointer?.matches;
  const syncMotionClass = () => root.classList.toggle('na-motion', motionAllowed());
  syncMotionClass();
  try { reducedMotion?.addEventListener?.('change', syncMotionClass); } catch {}

  // 1. Origine de la révélation des panneaux : le bouton du dock touché.
  document.addEventListener('click', event => {
    const trigger = event.target instanceof Element ? event.target.closest('#noctra-dock [data-noctra], #noctra-mobile-more [data-noctra], [data-noctra]') : null;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    root.style.setProperty('--na-ox', `${Math.round(rect.left + rect.width / 2)}px`);
    root.style.setProperty('--na-oy', `${Math.round(rect.top + rect.height / 2)}px`);
  }, { capture: true, passive: true });

  // 2. Apparition au défilement des rangées de l'accueil et des médiathèques.
  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.dataset.naReveal = 'in';
      revealObserver.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -40px 0px', threshold: 0 }) : null;
  const scanReveal = () => {
    if (!revealObserver || !root.classList.contains('na-motion') || playing()) return;
    for (const element of document.querySelectorAll('.homePage .homeSectionsContainer > .verticalSection:not([data-na-reveal]), #noctra-panel .noctra-library-showcase > :not([data-na-reveal])')) {
      const rect = element.getBoundingClientRect();
      // Ce qui est déjà à l'écran n'est jamais masqué.
      if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) { element.dataset.naReveal = 'shown'; continue; }
      element.dataset.naReveal = 'pending';
      revealObserver.observe(element);
    }
  };

  // 3. Affiche : rejoue l'entrée du texte à chaque changement de titre.
  let premiereTitle = null, titleObserver = null;
  const watchPremiere = () => {
    const title = document.querySelector('.noctra-premiere .noctra-premiere-copy h1');
    if (title === premiereTitle) return;
    titleObserver?.disconnect();
    premiereTitle = title;
    if (!title || !('MutationObserver' in window)) return;
    titleObserver = new MutationObserver(() => {
      const copy = title.closest('.noctra-premiere-copy');
      if (!copy || !root.classList.contains('na-motion')) return;
      copy.classList.remove('na-swap');
      void copy.offsetWidth;
      copy.classList.add('na-swap');
    });
    titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
  };

  // 4 & 5. Relief des cartes et boutons magnétiques (pointeur fin uniquement).
  let tilted = null, magnet = null, pointerFrame = 0, pointer = null;
  const resetTilt = element => { element?.style.removeProperty('--na-rx'); element?.style.removeProperty('--na-ry'); };
  const resetMagnet = element => { element?.style.removeProperty('--na-bx'); element?.style.removeProperty('--na-by'); };
  const paintPointer = () => {
    pointerFrame = 0;
    if (!pointer) return;
    const { x, y, target: element } = pointer;
    const card = element?.closest?.('.card') ? element.closest('.card').querySelector('.cardBox') : element?.closest?.('.noctra-library-card');
    if (card !== tilted) { resetTilt(tilted); tilted = card || null; }
    if (tilted) {
      const rect = (tilted.closest('.card') || tilted).getBoundingClientRect();
      if (rect.width && rect.height) {
        const px = (x - rect.left) / rect.width - 0.5, py = (y - rect.top) / rect.height - 0.5;
        tilted.style.setProperty('--na-rx', `${(-py * 7).toFixed(2)}deg`);
        tilted.style.setProperty('--na-ry', `${(px * 9).toFixed(2)}deg`);
      }
    }
    const button = element?.closest?.('.noctra-premiere-actions .noctra-button, #noctra-panel .noctra-button');
    if (button !== magnet) { resetMagnet(magnet); magnet = button || null; }
    if (magnet) {
      const rect = magnet.getBoundingClientRect();
      magnet.style.setProperty('--na-bx', `${((x - rect.left - rect.width / 2) * 0.12).toFixed(1)}px`);
      magnet.style.setProperty('--na-by', `${((y - rect.top - rect.height / 2) * 0.2).toFixed(1)}px`);
    }
    // 9. Lumière de fond qui suit le pointeur.
    if (cursorLight && perfDesktop()) {
      root.style.setProperty('--na-cx', `${Math.round(x)}px`);
      root.style.setProperty('--na-cy', `${Math.round(y)}px`);
    }
  };
  const cursorLight = document.createElement('div');
  cursorLight.id = 'na-cursor-light';
  cursorLight.setAttribute('aria-hidden', 'true');
  document.addEventListener('pointermove', event => {
    if (!finePointer?.matches || !root.classList.contains('na-motion') || playing()) return;
    pointer = { x: event.clientX, y: event.clientY, target: event.target instanceof Element ? event.target : null };
    if (!pointerFrame) pointerFrame = window.requestAnimationFrame(paintPointer);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { resetTilt(tilted); resetMagnet(magnet); tilted = magnet = null; }, { passive: true });

  // 8. Parallaxe de l'affiche au défilement.
  let scrollFrame = 0;
  const paintParallax = () => {
    scrollFrame = 0;
    const premiere = document.querySelector('.homePage .noctra-premiere');
    if (!premiere) return;
    const rect = premiere.getBoundingClientRect();
    const offset = Math.max(-80, Math.min(80, -rect.top * 0.18));
    premiere.style.setProperty('--na-parallax', `${offset.toFixed(1)}px`);
  };
  window.addEventListener('scroll', () => {
    if (!perfDesktop() || !root.classList.contains('na-motion') || playing() || !document.body?.classList.contains('noctra-home')) return;
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(paintParallax);
  }, { passive: true, capture: true });

  try {
    window.setInterval(() => {
      if (document.hidden) return;
      // Jellyfin peut réécrire la classe de <html> : l'état est réaffirmé.
      if (root.classList.contains('na-motion') !== motionAllowed()) syncMotionClass();
      if (!cursorLight.isConnected && document.body) document.body.prepend(cursorLight);
      scanReveal();
      watchPremiere();
    }, 700);
  } catch {
    // Effets optionnels.
  }
})();
