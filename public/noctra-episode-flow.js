/* Noctra 200.0.164 — génériques et enchaînement des épisodes, comme Noctra TV.
   - « Passer le générique », « Passer le générique de fin », « Passer le
     récap / l'aperçu » pendant le segment, jamais automatiques. Temps, dans
     l'ordre : segments du serveur Jellyfin (extension de détection, ex. Intro
     Skipper), puis chapitres nommés du fichier (« Opening », « Générique »,
     « Credits »…). Sans marqueur fiable : pas de bouton (plus de générique
     « appris » des avances manuelles). Le générique de fin passé, la scène
     après le générique reste visible.
   - « Épisode suivant » : bouton distinct (commandes affichées), et carte
     « À suivre » au générique de fin (ou 30 s avant la fin) : l'épisode
     suivant démarre seul après 10 s ; « Lire maintenant » ou « Plus tard »
     (la lecture s'arrête à la fin).
   - ±15 s : sauts du lecteur Jellyfin réglés à 15 s (si l'utilisateur ne les a
     pas déjà réglés), retour visuel cumulé des appuis répétés.
   - Transition : l'image et le titre de l'épisode suivant couvrent l'écran le
     temps du chargement, puis s'effacent dès la première image.
   Séries et animés (épisodes) ; films : « Passer le générique » seulement.
   Le lecteur Jellyfin reste celui qui lit : Noctra ne fait que commander
   (position, épisode suivant, arrêt) via son gestionnaire de lecture. */
(() => {
  'use strict';

  const COUNTDOWN_SECONDS = 10;
  const SEGMENT_TYPES = { Intro: 'intro', Outro: 'outro', Recap: 'recap', Preview: 'preview' };
  let webpackRequire = null;
  let video = null;
  let videoController = null;
  let state = null;
  let skipButton = null;
  let upNext = null;
  let transition = null;
  let transitionTimer = 0;
  let transitionItemId = '';

  // Gestionnaire de lecture Jellyfin (module du bundle principal).
  function requireJellyfin() {
    if (webpackRequire) return webpackRequire;
    const chunks = window.webpackChunk;
    if (!chunks?.push) return null;
    try {
      chunks.push([[930_000 + Math.floor(performance.now() % 60_000)], {}, require => { webpackRequire = require; }]);
    } catch {}
    return webpackRequire;
  }

  function playbackManager() {
    try {
      const manager = requireJellyfin()?.(39738)?.f;
      return manager && typeof manager.currentItem === 'function' && typeof manager.seek === 'function' ? manager : null;
    } catch {
      return null;
    }
  }

  function currentPlayer(manager = playbackManager()) {
    try { return manager?.getCurrentPlayer?.() || null; } catch { return null; }
  }

  function currentItem(manager = playbackManager()) {
    const player = currentPlayer(manager);
    if (!player) return null;
    try { return manager.currentItem(player) || null; } catch { return null; }
  }

  // Position et durée en millisecondes (décalage de transcodage compris).
  function positionMs(manager = playbackManager()) {
    const player = currentPlayer(manager);
    if (manager && player) {
      try {
        const value = Number(manager.currentTime(player));
        if (Number.isFinite(value)) return value;
      } catch {}
    }
    return Number(video?.currentTime || 0) * 1000;
  }

  function durationMs(item, manager = playbackManager()) {
    const player = currentPlayer(manager);
    if (manager && player) {
      try {
        const ticks = Number(manager.duration(player));
        if (Number.isFinite(ticks) && ticks > 0) return ticks / 10_000;
      } catch {}
    }
    if (item?.RunTimeTicks) return Number(item.RunTimeTicks) / 10_000;
    const seconds = Number(video?.duration || 0);
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  }


  function api() {
    const client = window.ApiClient;
    return client?.getJSON && client?.getUrl ? client : null;
  }

  function userId() {
    try { return String(window.ApiClient?.getCurrentUserId?.() || ''); } catch { return ''; }
  }

  // ── Génériques : chapitres nommés du fichier ──
  function chapterSegments(item) {
    const chapters = (item?.Chapters || []).filter(chapter => typeof chapter.StartPositionTicks === 'number')
      .sort((a, b) => a.StartPositionTicks - b.StartPositionTicks);
    const runtime = Number(item?.RunTimeTicks || 0) / 10_000;
    const out = [];
    chapters.forEach((chapter, index) => {
      const name = String(chapter.Name || '').trim();
      const type = /(?:end ?credits|credits|crédits|ending|outro|générique de fin|generique de fin)/i.test(name) || /^ed\d*$/i.test(name) ? 'outro'
        : /(?:^intro|introduction|opening|générique|generique|ouverture)/i.test(name) || /^op\d*$/i.test(name) ? 'intro'
          : /(?:recap|récap|previously|précédemment)/i.test(name) ? 'recap'
            : /(?:preview|aperçu|prochainement|next time)/i.test(name) ? 'preview' : '';
      if (!type) return;
      const start = chapter.StartPositionTicks / 10_000;
      const end = index + 1 < chapters.length ? chapters[index + 1].StartPositionTicks / 10_000 : runtime;
      if (end - start >= 5_000 && end - start <= 15 * 60_000) out.push({ type, startMs: Math.round(start), endMs: Math.round(end), source: 'chapitres' });
    });
    return out;
  }

  async function segmentsFor(item) {
    const client = api();
    if (!client || !item?.Id) return [];
    const fromServer = client.getJSON(client.getUrl(`MediaSegments/${item.Id}`)).then(data => (data?.Items || [])
      .filter(segment => SEGMENT_TYPES[segment.Type] && segment.EndTicks > segment.StartTicks)
      .map(segment => ({ type: SEGMENT_TYPES[segment.Type], startMs: Math.round(segment.StartTicks / 10_000), endMs: Math.round(segment.EndTicks / 10_000), source: 'jellyfin' })))
      .catch(() => []);
    const uid = userId();
    const details = item.Chapters || !uid ? Promise.resolve(item)
      : client.getJSON(client.getUrl(`Users/${uid}/Items/${item.Id}`, { Fields: 'Chapters' })).catch(() => item);
    const [server, full] = await Promise.all([fromServer, details]);
    if (server.length) return server;
    return chapterSegments(full);
  }

  // ── Épisode suivant ──
  async function fullItem(item) {
    const client = api();
    const uid = userId();
    if (!client || !uid || !item?.Id) return item;
    try { return await client.getJSON(client.getUrl(`Users/${uid}/Items/${item.Id}`)); } catch { return item; }
  }

  async function nextEpisodeOf(item, manager) {
    let queued = null;
    try { queued = manager?.getNextItem?.()?.item || null; } catch {}
    if (queued?.Id) return { item: await fullItem(queued), queued: true };
    const client = api();
    const uid = userId();
    if (!client || !uid || item?.Type !== 'Episode' || !item.SeriesId) return null;
    try {
      const data = await client.getJSON(client.getUrl(`Shows/${item.SeriesId}/Episodes`, { UserId: uid, StartItemId: item.Id, Limit: 2, Fields: 'Overview' }));
      const next = (data?.Items || [])[1];
      return next ? { item: next, queued: false } : null;
    } catch {
      return null;
    }
  }

  function imageUrl(id, options) {
    try { return id ? window.ApiClient.getImageUrl(id, options) : ''; } catch { return ''; }
  }

  function episodeVisuals(item) {
    if (!item) return { picture: '', backdrop: '', logo: '' };
    const picture = item.ImageTags?.Primary
      ? imageUrl(item.Id, { type: 'Primary', tag: item.ImageTags.Primary, maxWidth: 720, quality: 90 })
      : item.ParentThumbImageTag ? imageUrl(item.ParentThumbItemId || item.SeriesId, { type: 'Thumb', tag: item.ParentThumbImageTag, maxWidth: 720, quality: 90 }) : '';
    const backdropTag = item.ParentBackdropImageTags?.[0] || item.BackdropImageTags?.[0] || '';
    const backdrop = backdropTag
      ? imageUrl(item.BackdropImageTags?.[0] ? item.Id : item.ParentBackdropItemId || item.SeriesId, { type: 'Backdrop', index: 0, tag: backdropTag, maxWidth: 1920, quality: 85 })
      : picture;
    const logo = item.ParentLogoImageTag ? imageUrl(item.ParentLogoItemId || item.SeriesId, { type: 'Logo', tag: item.ParentLogoImageTag, maxWidth: 600, quality: 90 })
      : item.ImageTags?.Logo ? imageUrl(item.Id, { type: 'Logo', tag: item.ImageTags.Logo, maxWidth: 600, quality: 90 }) : '';
    return { picture, backdrop, logo };
  }

  function episodeLabel(item) {
    if (!item) return '';
    if (item.Type !== 'Episode') return item.Name || '';
    const season = Number(item.ParentIndexNumber);
    const number = Number(item.IndexNumber);
    const code = [Number.isFinite(season) ? `S${season}` : '', Number.isFinite(number) ? `É${number}` : ''].filter(Boolean).join(' · ');
    return [code, item.Name].filter(Boolean).join(' — ');
  }

  function preload(url) {
    if (!url) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // Au-dessus de l'OSD du lecteur Jellyfin (même niveau que son propre bouton).
  function host() {
    return document.body;
  }

  // ── Bouton « Passer » ──
  function skipLabel(segment) {
    if (segment.type === 'outro') return 'Passer le générique de fin';
    if (segment.type === 'recap') return 'Passer le récap';
    if (segment.type === 'preview') return 'Passer l’aperçu';
    return 'Passer le générique';
  }

  function hideSkip() {
    if (!skipButton) return;
    skipButton.dataset.visible = 'false';
    skipButton.tabIndex = -1;
  }

  function showSkip(segment) {
    if (!skipButton) {
      skipButton = element('button', 'noctra-skip-segment');
      skipButton.type = 'button';
      skipButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        skipCurrentSegment();
      });
    }
    if (skipButton.parentNode !== host()) host().appendChild(skipButton);
    skipButton.innerHTML = '';
    skipButton.appendChild(element('span', 'noctra-skip-segment-label', skipLabel(segment)));
    skipButton.appendChild(element('i', 'noctra-skip-segment-icon', '⏭'));
    skipButton.dataset.type = segment.type;
    skipButton.dataset.visible = 'true';
    skipButton.tabIndex = 0;
  }

  function skipCurrentSegment() {
    const segment = state?.segment;
    const manager = playbackManager();
    const player = currentPlayer(manager);
    if (!segment || !state) return;
    segment.dismissed = true;
    state.segment = null;
    hideSkip();
    // Fin du segment (générique de fin jusqu'au bout du fichier : fin du titre,
    // puis l'enchaînement habituel). Jamais l'épisode suivant directement.
    state.skipping = Date.now();
    state.skipTarget = segment.endMs;
    if (manager && player) {
      try { manager.seek(Math.round(segment.endMs * 10_000), player); return; } catch {}
    }
    if (video) video.currentTime = segment.endMs / 1000;
  }

  function updateSkip(at) {
    if (!state?.segments?.length) { if (state) state.segment = null; hideSkip(); return; }
    // « Passer le générique de fin » et « Épisode suivant » restent distincts :
    // les deux sont proposés au générique de fin.
    let found = null;
    for (const segment of state.segments) {
      if (segment.dismissed) continue;
      if (at >= segment.startMs - 500 && at < segment.endMs - 1_500) { found = segment; break; }
    }
    if (found === state.segment) return;
    state.segment = found;
    if (found) showSkip(found);
    else hideSkip();
  }

  // ── « Épisode suivant » (bouton distinct, avec les commandes du lecteur) ──
  let nextButton = null;
  function osdVisible() {
    const osd = document.querySelector('.videoOsdBottom');
    return Boolean(osd && !osd.classList.contains('videoOsdBottom-hidden') && !osd.classList.contains('hide'));
  }
  function updateNextButton() {
    const show = Boolean(state?.next && state.item?.Type === 'Episode' && !state.advancing && !upNext && osdVisible());
    if (!show) {
      if (nextButton) { nextButton.dataset.visible = 'false'; nextButton.tabIndex = -1; }
      return;
    }
    if (!nextButton) {
      nextButton = element('button', 'noctra-next-episode');
      nextButton.type = 'button';
      nextButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        playNext();
      });
    }
    if (nextButton.parentNode !== host()) host().appendChild(nextButton);
    const label = `Épisode suivant : ${episodeLabel(state.next)}`;
    if (nextButton.getAttribute('aria-label') !== label) {
      nextButton.innerHTML = '';
      nextButton.appendChild(element('span', '', 'Épisode suivant'));
      nextButton.appendChild(element('i', 'noctra-skip-segment-icon', '⏭'));
      nextButton.setAttribute('aria-label', label);
      nextButton.title = label;
    }
    nextButton.dataset.visible = 'true';
    nextButton.tabIndex = 0;
  }

  // ── ±15 s ──
  // Sauts du lecteur Jellyfin à 15 s, une fois par utilisateur et seulement
  // s'ils n'ont jamais été réglés (un choix de l'utilisateur est conservé).
  const SKIP_STEP_MS = 15_000;
  function applySkipLengths() {
    let settings = null;
    try { settings = requireJellyfin()?.(82885) || null; } catch { settings = null; }
    const uid = userId();
    if (!settings || typeof settings.get !== 'function' || typeof settings.skipForwardLength !== 'function' || !uid) return;
    const flag = `noctra-skip15-v1-${uid}`;
    try { if (localStorage.getItem(flag)) return; } catch { return; }
    try {
      const unset = value => value === undefined || value === null || value === '';
      if (unset(settings.get('skipForwardLength'))) settings.skipForwardLength(SKIP_STEP_MS);
      if (unset(settings.get('skipBackLength'))) settings.skipBackLength(SKIP_STEP_MS);
      localStorage.setItem(flag, '1');
    } catch {}
  }

  // Retour visuel des sauts (« ⟳ +45 s »), cumulé sur les appuis répétés.
  let seekNote = null;
  let seekNoteTimer = 0;
  let seekTotal = 0;
  let seekAt = 0;
  function noteSeek(fromMs, toMs) {
    const delta = toMs - fromMs;
    // Saut de « Passer le générique » : pas un saut de 15 s.
    if (state?.skipping && Date.now() - state.skipping < 2_000 && Math.abs(toMs - (state.skipTarget || 0)) < 1_500) return;
    // Sauts des boutons (pas de 15 s, ou réglage de l'utilisateur), pas la barre de progression.
    if (Math.abs(delta) < 1_000 || Math.abs(delta) > 61_000) return;
    const now = Date.now();
    seekTotal = now - seekAt < 1_500 && (seekTotal < 0) === (delta < 0) ? seekTotal + delta : delta;
    seekAt = now;
    if (!seekNote) {
      seekNote = element('div', 'noctra-seek-note');
      seekNote.setAttribute('aria-live', 'polite');
    }
    if (seekNote.parentNode !== host()) host().appendChild(seekNote);
    const seconds = Math.round(Math.abs(seekTotal) / 1000);
    seekNote.textContent = `${delta < 0 ? '⟲' : '⟳'} ${seekTotal < 0 ? '−' : '+'}${seconds} s`;
    seekNote.dataset.visible = 'true';
    window.clearTimeout(seekNoteTimer);
    seekNoteTimer = window.setTimeout(() => { if (seekNote) seekNote.dataset.visible = 'false'; }, 1_500);
  }

  // ── « À suivre » ──
  function closeUpNext() {
    if (!upNext) return;
    window.clearInterval(upNext.timer);
    document.body.classList.remove('noctra-up-next-open');
    upNext.node.dataset.visible = 'false';
    const node = upNext.node;
    window.setTimeout(() => node.remove(), 450);
    upNext = null;
  }

  function openUpNext() {
    if (!state?.next || upNext || state.upNextDone) return;
    state.upNextDone = true;
    const next = state.next;
    const visuals = episodeVisuals(next);
    const node = element('section', 'noctra-up-next');
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-label', 'Épisode suivant');
    const art = element('div', 'noctra-up-next-art');
    if (visuals.picture) {
      const picture = element('img');
      picture.alt = '';
      picture.decoding = 'async';
      picture.src = visuals.picture;
      art.appendChild(picture);
    }
    const ring = element('span', 'noctra-up-next-ring');
    ring.innerHTML = '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16"></circle><circle class="noctra-up-next-ring-value" cx="18" cy="18" r="16"></circle></svg><b></b>';
    art.appendChild(ring);
    const copy = element('div', 'noctra-up-next-copy');
    copy.appendChild(element('p', 'noctra-up-next-eyebrow', 'À SUIVRE'));
    if (visuals.logo) {
      const logo = element('img', 'noctra-up-next-logo');
      logo.alt = next.SeriesName || '';
      logo.decoding = 'async';
      logo.src = visuals.logo;
      copy.appendChild(logo);
    } else if (next.SeriesName) {
      copy.appendChild(element('strong', 'noctra-up-next-series', next.SeriesName));
    }
    copy.appendChild(element('h3', 'noctra-up-next-title', episodeLabel(next)));
    if (next.Overview) copy.appendChild(element('p', 'noctra-up-next-overview', next.Overview));
    const status = element('small', 'noctra-up-next-status');
    copy.appendChild(status);
    const actions = element('div', 'noctra-up-next-actions');
    const play = element('button', 'noctra-up-next-play');
    play.type = 'button';
    play.innerHTML = '<span class="noctra-up-next-fill" aria-hidden="true"></span><span>▶ Lire maintenant</span>';
    play.addEventListener('click', event => { event.stopPropagation(); playNext(); });
    const later = element('button', 'noctra-up-next-later', 'Plus tard');
    later.type = 'button';
    later.addEventListener('click', event => {
      event.stopPropagation();
      // Comme sur Noctra TV : pas d'enchaînement, la lecture s'arrête à la fin.
      if (state) state.stopAtEnd = true;
      closeUpNext();
    });
    actions.append(play, later);
    copy.appendChild(actions);
    node.append(art, copy);
    host().appendChild(node);
    let left = COUNTDOWN_SECONDS;
    const ringValue = ring.querySelector('.noctra-up-next-ring-value');
    const tick = () => {
      status.textContent = `Lecture automatique dans ${left} s`;
      ring.querySelector('b').textContent = String(left);
      const progress = 1 - left / COUNTDOWN_SECONDS;
      ringValue?.style.setProperty('stroke-dashoffset', String(100.5 * (1 - progress)));
      play.style.setProperty('--noctra-up-next-progress', String(progress));
    };
    tick();
    upNext = { node, timer: 0 };
    document.body.classList.add('noctra-up-next-open');
    updateNextButton();
    requestAnimationFrame(() => { node.dataset.visible = 'true'; play.focus({ preventScroll: true }); });
    upNext.timer = window.setInterval(() => {
      if (!video || video.paused) return;
      left -= 1;
      if (left <= 0) { playNext(); return; }
      tick();
    }, 1000);
  }

  function showTransition(next) {
    hideTransition(true);
    const visuals = episodeVisuals(next);
    const node = element('div', 'noctra-episode-transition');
    node.setAttribute('aria-hidden', 'true');
    if (visuals.backdrop) node.style.setProperty('--noctra-transition-image', `url("${visuals.backdrop.replace(/"/g, '%22')}")`);
    const copy = element('div', 'noctra-episode-transition-copy');
    if (visuals.logo) {
      const logo = element('img');
      logo.alt = '';
      logo.src = visuals.logo;
      copy.appendChild(logo);
    } else if (next.SeriesName) {
      copy.appendChild(element('strong', '', next.SeriesName));
    }
    copy.appendChild(element('span', '', episodeLabel(next)));
    copy.appendChild(element('i', 'noctra-episode-transition-bar'));
    node.appendChild(copy);
    document.body.appendChild(node);
    transition = node;
    transitionItemId = String(next.Id || '');
    requestAnimationFrame(() => { node.dataset.visible = 'true'; });
    // Jamais plus de 15 s, même si la première image tarde.
    transitionTimer = window.setTimeout(() => hideTransition(), 15_000);
  }

  function hideTransition(immediate = false) {
    window.clearTimeout(transitionTimer);
    transitionTimer = 0;
    const node = transition;
    transition = null;
    if (!node) return;
    if (immediate) { node.remove(); return; }
    node.dataset.visible = 'false';
    window.setTimeout(() => node.remove(), 700);
  }

  async function playNext() {
    if (!state?.next || state.advancing) return;
    const manager = playbackManager();
    const player = currentPlayer(manager);
    const next = state.next;
    state.advancing = true;
    closeUpNext();
    hideSkip();
    showTransition(next);
    try {
      if (state.nextQueued && manager && player) manager.nextTrack(player);
      else if (manager?.play) await manager.play({ items: [next], serverId: window.ApiClient?.serverId?.() });
      else throw new Error('lecteur indisponible');
    } catch {
      hideTransition(true);
      if (state) state.advancing = false;
    }
  }

  // ── Suivi du lecteur Jellyfin ──
  async function loadItem(item) {
    const manager = playbackManager();
    const token = Symbol('item');
    state = {
      token,
      item,
      segments: [],
      segment: null,
      next: null,
      nextQueued: false,
      upNextDone: false,
      stopAtEnd: false,
      advancing: false,
      skipping: 0,
      lastMs: 0
    };
    hideSkip();
    closeUpNext();
    const [segments, next] = await Promise.all([
      segmentsFor(item).catch(() => []),
      item.Type === 'Episode' ? nextEpisodeOf(item, manager).catch(() => null) : Promise.resolve(null)
    ]);
    if (!state || state.token !== token) return;
    state.segments = segments;
    if (next?.item) {
      state.next = next.item;
      state.nextQueued = next.queued;
      const visuals = episodeVisuals(next.item);
      preload(visuals.picture);
      preload(visuals.logo);
      preload(visuals.backdrop);
    }
    document.body.classList.toggle('noctra-episode-flow', Boolean(manager));
  }

  function onTime() {
    const manager = playbackManager();
    const item = currentItem(manager);
    if (!item?.Id) return;
    // Première image de l'épisode suivant : la transition s'efface.
    if (transition && item.Id === transitionItemId && video && !video.paused && video.readyState >= 3) hideTransition();
    if (!state || state.item?.Id !== item.Id) {
      void loadItem(item);
      return;
    }
    const at = positionMs(manager);
    if (!video?.seeking) state.lastMs = at;
    updateSkip(at);
    updateNextButton();
    if (state.item.Type !== 'Episode' || !state.next) return;
    const duration = durationMs(state.item, manager);
    if (!duration) return;
    const remaining = duration - at;
    if (state.stopAtEnd && remaining < 1_200) {
      state.stopAtEnd = false;
      try { manager?.stop?.(currentPlayer(manager)); } catch {}
      return;
    }
    if (state.upNextDone || state.advancing) return;
    // Générique de fin connu (dans les 4 dernières minutes) : « À suivre » à son
    // début ; sinon 30 s avant la fin (15 s pour un épisode de moins de 10 min).
    const outro = state.segments.find(segment => segment.type === 'outro' && segment.startMs > duration - 4 * 60_000);
    const trigger = outro ? outro.startMs : duration - (duration > 10 * 60_000 ? 30_000 : 15_000);
    if (at >= trigger && remaining > 1_500) openUpNext();
  }

  function attach(next) {
    videoController?.abort();
    videoController = null;
    video = next;
    if (!video) {
      hideSkip();
      updateNextButton();
      closeUpNext();
      document.body.classList.remove('noctra-episode-flow');
      state = null;
      updateNextButton();
      return;
    }
    videoController = new AbortController();
    const signal = videoController.signal;
    applySkipLengths();
    let seekFrom = 0;
    video.addEventListener('timeupdate', onTime, { signal });
    video.addEventListener('seeking', () => { seekFrom = state?.lastMs || 0; }, { signal });
    video.addEventListener('seeked', () => {
      const manager = playbackManager();
      const at = positionMs(manager);
      noteSeek(seekFrom, at);
      if (state) state.lastMs = at;
      // Retour en arrière avant le générique de fin : « À suivre » redevient possible.
      if (state && state.upNextDone && !upNext && !state.advancing) {
        const duration = durationMs(state.item, manager);
        if (duration && duration - at > 60_000) state.upNextDone = false;
      }
    }, { signal });
    video.addEventListener('playing', () => {
      if (transition) window.setTimeout(() => hideTransition(), 250);
    }, { signal });
    video.addEventListener('ended', () => {
      if (!state?.next || state.stopAtEnd || state.advancing) return;
      // Épisode de la file Jellyfin : Jellyfin enchaîne lui-même à la fin
      // (pas de second « suivant », qui sauterait un épisode) ; Noctra
      // affiche seulement la transition. Sinon, Noctra lance le suivant.
      if (state.nextQueued) {
        state.advancing = true;
        closeUpNext();
        hideSkip();
        showTransition(state.next);
      } else {
        playNext();
      }
    }, { signal });
  }

  function scan() {
    const next = document.querySelector('.videoPlayerContainer video.htmlvideoplayer');
    if (next !== video) attach(next || null);
    if (transition && !next && !document.querySelector('.videoPlayerContainer')) hideTransition();
  }

  window.setInterval(scan, 1000);
  document.addEventListener('visibilitychange', scan);

  // Accès pour les tests et le diagnostic.
  window.NoctraEpisodeFlow = { version: '200.0.164', chapterSegments, episodeLabel, skipLabel };
})();
