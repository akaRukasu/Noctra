// Noctra 200.0.126 — « Aurora Chroma », planificateur unique. Effets purement décoratifs :
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
  // 200.0.121 : le reflet des cartes ne suit plus le pointeur. Il relisait
  // la position de la carte juste après avoir écrit son style, à chaque image
  // (recalcul forcé de la mise en page) : il s'allume désormais, fixe, au survol.

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
  // 200.0.119 : la parallaxe de l'affiche est calculée par le navigateur
  // quand il sait animer au défilement ; l'apparition des rangées reste au
  // script (animation jouée une fois, sans couche graphique permanente).
  let cssScroll = false;
  try { cssScroll = Boolean(window.CSS?.supports?.('animation-timeline: scroll()')); } catch {}
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
  // Positions mémorisées : aucune lecture de mise en page à chaque image tant
  // que rien ne défile ni ne change de taille.
  let rects = new WeakMap();
  const rectOf = element => {
    let rect = rects.get(element);
    if (!rect) { rect = element.getBoundingClientRect(); rects.set(element, rect); }
    return rect;
  };
  const forgetRects = () => { rects = new WeakMap(); };
  const resetTilt = element => { element?.style.removeProperty('--na-rx'); element?.style.removeProperty('--na-ry'); };
  const resetMagnet = element => { element?.style.removeProperty('--na-bx'); element?.style.removeProperty('--na-by'); };
  const paintPointer = () => {
    pointerFrame = 0;
    if (!pointer) return;
    const { x, y, target: element } = pointer;
    const card = element?.closest?.('.card') ? element.closest('.card').querySelector('.cardBox') : element?.closest?.('.noctra-library-card');
    if (card !== tilted) { resetTilt(tilted); tilted = card || null; }
    if (tilted) {
      const rect = rectOf(tilted.closest('.card') || tilted);
      if (rect.width && rect.height) {
        const px = (x - rect.left) / rect.width - 0.5, py = (y - rect.top) / rect.height - 0.5;
        tilted.style.setProperty('--na-rx', `${(-py * 7).toFixed(2)}deg`);
        tilted.style.setProperty('--na-ry', `${(px * 9).toFixed(2)}deg`);
      }
    }
    const button = element?.closest?.('.noctra-premiere-actions .noctra-button, #noctra-panel .noctra-button');
    if (button !== magnet) { resetMagnet(magnet); magnet = button || null; }
    if (magnet) {
      const rect = rectOf(magnet);
      magnet.style.setProperty('--na-bx', `${((x - rect.left - rect.width / 2) * 0.12).toFixed(1)}px`);
      magnet.style.setProperty('--na-by', `${((y - rect.top - rect.height / 2) * 0.2).toFixed(1)}px`);
    }
    // 9. Lumière de fond qui suit le pointeur.
    // 200.0.121 : position écrite sur la lumière elle-même. Posée en variables
    // sur <html>, elle faisait recalculer le style de toute la page à chaque image.
    if (cursorLight && perfDesktop()) {
      cursorLight.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
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
  let lastScroll = 0;
  window.addEventListener('resize', forgetRects, { passive: true });
  window.addEventListener('scroll', () => {
    lastScroll = performance.now();
    forgetRects();
    if (cssScroll || !perfDesktop() || !root.classList.contains('na-motion') || playing() || !document.body?.classList.contains('noctra-home')) return;
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(paintParallax);
  }, { passive: true, capture: true });

  const motionTick = () => {
    // Jellyfin peut réécrire la classe de <html> : l'état est réaffirmé.
    if (root.classList.contains('na-motion') !== motionAllowed()) syncMotionClass();
    if (!cursorLight.isConnected && document.body) document.body.prepend(cursorLight);
    scanReveal();
    watchPremiere();
  };

  // ───────────── 200.0.115 — Chroma : couleurs tirées de l'œuvre affichée ─────────────
  // L'image déjà chargée par l'affiche (ou l'arrière-plan d'une fiche) est
  // réduite à 24 × 24 px pour en extraire deux teintes vives. Aucune requête
  // supplémentaire hors cache ; une image non lisible est simplement ignorée.
  let chromaSource = '';
  const toHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  };
  const extractChroma = image => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 24;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 24, 24);
    const data = context.getImageData(0, 0, 24, 24).data;
    const buckets = Array.from({ length: 12 }, () => ({ weight: 0, x: 0, y: 0, s: 0 }));
    for (let index = 0; index < data.length; index += 4) {
      const [h, s, l] = toHsl(data[index], data[index + 1], data[index + 2]);
      const weight = s * s * Math.max(0, 1 - Math.abs(l - 0.52) * 1.9);
      if (weight <= 0.01) continue;
      const bucket = buckets[Math.floor(h / 30) % 12];
      bucket.weight += weight; bucket.s += s * weight;
      bucket.x += Math.cos(h * Math.PI / 180) * weight; bucket.y += Math.sin(h * Math.PI / 180) * weight;
    }
    const ranked = buckets.map(bucket => ({ ...bucket, h: (Math.atan2(bucket.y, bucket.x) * 180 / Math.PI + 360) % 360 }))
      .filter(bucket => bucket.weight > 0).sort((a, b) => b.weight - a.weight);
    if (!ranked.length) return null;
    const first = ranked[0];
    const second = ranked.find(bucket => Math.min(Math.abs(bucket.h - first.h), 360 - Math.abs(bucket.h - first.h)) > 40) || { h: (first.h + 150) % 360 };
    const color = hue => `hsl(${Math.round(hue)} 82% 62%)`;
    return [color(first.h), color(second.h)];
  };
  const applyChroma = url => {
    if (!url || url === chromaSource) return;
    chromaSource = url;
    try {
      const image = new Image();
      if (new URL(url, location.href).origin !== location.origin) image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => {
        if (chromaSource !== url) return;
        try {
          const colors = extractChroma(image);
          if (!colors) return;
          root.style.setProperty('--na-dyn-1', colors[0]);
          root.style.setProperty('--na-dyn-2', colors[1]);
        } catch { /* Image non lisible (origine différente) : teintes par défaut. */ }
      };
      image.src = url;
    } catch {}
  };
  const chromaTick = () => {
    const body = document.body;
    if (!body || document.hidden || playing()) return;
    let url = '';
    if (body.classList.contains('noctra-home')) url = document.querySelector('.noctra-premiere .noctra-premiere-art[data-image]')?.dataset.image || '';
    else {
      const backdrop = document.querySelector('.itemDetailPage:not(.hide) .itemBackdrop');
      const match = backdrop && /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(backdrop).backgroundImage);
      url = match?.[1] || '';
    }
    applyChroma(url);
  };

  // Reflet lumineux : balaie l'affiche à chaque changement de titre.
  const sweepPremiere = () => {
    const premiere = document.querySelector('.noctra-premiere');
    if (!premiere || !root.classList.contains('na-motion')) return;
    let glare = premiere.querySelector(':scope > .na-glare');
    if (!glare) { glare = document.createElement('span'); glare.className = 'na-glare'; glare.setAttribute('aria-hidden', 'true'); premiere.append(glare); }
    glare.classList.remove('na-sweep');
    void glare.offsetWidth;
    glare.classList.add('na-sweep');
  };
  let lastPremiereTitle = '';
  const glareTick = () => {
    const title = document.querySelector('.noctra-premiere .noctra-premiere-copy h1')?.textContent || '';
    if (title && title !== lastPremiereTitle) { if (lastPremiereTitle) sweepPremiere(); lastPremiereTitle = title; }
  };

  // 200.0.120 : l'intro est le seul écran de démarrage. Elle est posée dans
  // la page (index.html) pour s'afficher dès la première image, à la place du
  // logo de chargement de Jellyfin, puis s'efface quand l'application est
  // prête (au plus tôt 1,1 s à la première ouverture de la session, au plus
  // tard 10 s). Aucune interaction n'est interceptée.
  const playIntro = () => {
    let seen = false;
    try { seen = sessionStorage.getItem('noctra-intro') === '1'; sessionStorage.setItem('noctra-intro', '1'); } catch { seen = true; }
    let intro = document.getElementById('na-intro');
    if (!intro) {
      if (seen || !motionAllowed() || /video|playback/i.test(location.hash)) return;
      intro = document.createElement('div');
      intro.id = 'na-intro';
      intro.setAttribute('aria-hidden', 'true');
      const mark = document.querySelector('link[rel="icon"][type="image/svg+xml"]')?.getAttribute('href') || '../noctra-mark.svg';
      intro.innerHTML = `<div class="na-intro-mark"><img alt="" src="${mark.replace(/"/g, '')}"><b>NOCTRA</b></div>`;
      (document.body || document.documentElement).append(intro);
    }
    // 200.0.121 : intro un peu plus longue (2,2 s à la première ouverture de la
    // session, 1,2 s ensuite) ; toujours retirée dès que possible en mouvement réduit.
    // 200.0.126 : encore allongée (3,5 s à la première ouverture, 2,5 s ensuite).
    const minimum = !motionAllowed() ? 0 : seen ? 2500 : 3500;
    const leave = () => {
      intro.classList.add('na-intro-leave');
      window.setTimeout(() => intro.remove(), 750);
    };
    const check = () => {
      if (!intro.isConnected) return;
      const booting = document.querySelector('#reactRoot > .splashLogo');
      const now = performance.now();
      if (/video|playback/i.test(location.hash) || (!booting && now >= minimum) || now > 10000) leave();
      else window.setTimeout(check, 120);
    };
    check();
  };
  try {
    if (document.body) playIntro(); else document.addEventListener('DOMContentLoaded', playIntro, { once: true });
    // Un seul minuteur pour tous les effets. Pendant un défilement (et pendant
    // la lecture), seul l'état des animations est vérifié : aucune lecture du
    // DOM ne vient concurrencer les images du défilement.
    window.setInterval(() => {
      if (document.hidden) return;
      if (performance.now() - lastScroll < 300 || playing()) {
        if (root.classList.contains('na-motion') !== motionAllowed()) syncMotionClass();
        return;
      }
      motionTick();
      syncAmbient();
      chromaTick();
      glareTick();
    }, 800);
  } catch {
    // Effets optionnels.
  }
})();
