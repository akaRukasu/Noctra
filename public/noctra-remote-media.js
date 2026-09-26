// Noctra 200.0.118 — lecteur films et séries (Jellyfin) :
// 1. Sous-titres dans le lecteur natif d'iOS et en image dans l'image.
//    Sur Safari, Jellyfin dessine les sous-titres dans un calque HTML (ou un
//    canvas pour ASS/PGS) posé sur la vidéo. Le lecteur plein écran d'iOS et
//    le PiP n'affichent que la vidéo : les sous-titres disparaissaient. À
//    l'entrée dans ces modes, la piste choisie est ajoutée à la vidéo en piste
//    native (WebVTT converti par Jellyfin), puis retirée au retour.
// 2. Bouton « Diffuser » : AirPlay (Safari) ou Remote Playback (Chrome
//    Android), affiché seulement quand un appareil est disponible.
// Aucun stockage ; seules requêtes : l'état de la session et la piste VTT,
// avec le jeton Jellyfin déjà ouvert par l'application.
(() => {
  'use strict';
  const BRIDGE = 'noctraBridge';
  const isPlayerVideo = node => node instanceof HTMLVideoElement && node.classList.contains('htmlvideoplayer');
  const log = (...args) => { try { console.debug('[Noctra media]', ...args); } catch {} };

  // ───────────── 1. Sous-titres natifs pour le lecteur iOS et le PiP ─────────────
  const vttCache = new Map();
  let activeVideo = null, mirror = null, generation = 0;

  const bridgeTrackElement = video => video.querySelector('track[data-noctra-bridge]');
  const nativeShowing = video => Array.from(video.textTracks || []).some(track =>
    track.mode === 'showing' && track.label !== 'Noctra' && track.cues && track.cues.length > 0);

  async function currentSubtitle() {
    const api = window.ApiClient;
    if (!api || typeof api.getSessions !== 'function') return null;
    const sessions = await api.getSessions({ deviceId: api.deviceId() });
    const session = (sessions || []).find(entry => entry?.NowPlayingItem) || null;
    const index = session?.PlayState?.SubtitleStreamIndex;
    if (!session || index === undefined || index === null || index < 0) return null;
    const item = session.NowPlayingItem;
    const stream = (item.MediaStreams || []).find(entry => entry.Type === 'Subtitle' && entry.Index === index);
    if (stream && stream.IsTextSubtitleStream === false) return { image: true };
    return {
      key: `${item.Id}/${session.PlayState.MediaSourceId || item.Id}/${index}`,
      url: api.getUrl(`Videos/${item.Id}/${session.PlayState.MediaSourceId || item.Id}/Subtitles/${index}/0/Stream.vtt`, { api_key: api.accessToken() }),
      language: String(stream?.Language || 'und').slice(0, 8),
      label: stream?.DisplayTitle || 'Sous-titres'
    };
  }

  async function vttFor(subtitle) {
    if (vttCache.has(subtitle.key)) return vttCache.get(subtitle.key);
    const response = await fetch(subtitle.url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`VTT ${response.status}`);
    const text = await response.text();
    if (!/^﻿?WEBVTT/.test(text)) throw new Error('VTT invalide');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
    vttCache.set(subtitle.key, url);
    if (vttCache.size > 6) {
      const [oldKey, oldUrl] = vttCache.entries().next().value;
      vttCache.delete(oldKey);
      URL.revokeObjectURL(oldUrl);
    }
    return url;
  }

  const showTrack = (video, track) => {
    for (const other of Array.from(video.textTracks || [])) if (other !== track && other.mode === 'showing') other.mode = 'hidden';
    track.mode = 'showing';
  };

  // Secours : recopie en direct du texte que Jellyfin affiche dans son calque.
  function startMirror(video) {
    const source = document.querySelector('.videoSubtitlesInner');
    if (!source || typeof video.addTextTrack !== 'function') return;
    const Cue = window.VTTCue || window.TextTrackCue;
    const track = Array.from(video.textTracks).find(entry => entry.label === 'Noctra') || video.addTextTrack('subtitles', 'Noctra', 'und');
    let cue = null, lastText = null;
    const sync = () => {
      const text = source.classList.contains('hide') ? '' : (source.innerText || source.textContent || '').trim();
      if (text === lastText) return; // Jellyfin réécrit la même réplique à chaque instant.
      lastText = text;
      if (cue) { try { track.removeCue(cue); } catch {} cue = null; }
      if (!text) return;
      cue = new Cue(video.currentTime, video.currentTime + 3600, text);
      try { track.addCue(cue); } catch {}
    };
    const observer = new MutationObserver(sync);
    observer.observe(source, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    showTrack(video, track);
    sync();
    mirror = { observer, track, clear: () => { if (cue) { try { track.removeCue(cue); } catch {} } track.mode = 'disabled'; } };
  }

  async function enterNativePresentation(video) {
    if (activeVideo === video) return;
    activeVideo = video;
    const run = ++generation;
    if (nativeShowing(video)) return; // Jellyfin utilise déjà une piste native.
    let subtitle = null;
    try { subtitle = await currentSubtitle(); } catch (error) { log('session', error); }
    if (run !== generation) return;
    if (subtitle?.image) { log('sous-titres image : non convertibles en piste native'); return; }
    if (subtitle) {
      try {
        const src = await vttFor(subtitle);
        if (run !== generation) return;
        bridgeTrackElement(video)?.remove();
        const element = document.createElement('track');
        element.kind = 'subtitles';
        element.label = subtitle.label;
        element.srclang = subtitle.language;
        element.src = src;
        element.dataset[BRIDGE] = 'true';
        element.default = true;
        video.append(element);
        showTrack(video, element.track);
        element.addEventListener('load', () => { if (run === generation) showTrack(video, element.track); }, { once: true });
        return;
      } catch (error) { log('vtt', error); }
    }
    if (run === generation) startMirror(video);
  }

  function leaveNativePresentation(video) {
    if (activeVideo !== video) return;
    activeVideo = null;
    generation++;
    const element = bridgeTrackElement(video);
    if (element) { try { element.track.mode = 'disabled'; } catch {} element.remove(); }
    if (mirror) { mirror.observer.disconnect(); mirror.clear(); mirror = null; }
  }

  // Lecteur natif iOS, PiP ou diffusion AirPlay : la vidéo est affichée sans
  // le calque de Jellyfin.
  const outsidePage = video => Boolean(video.webkitDisplayingFullscreen
    || (video.webkitPresentationMode && video.webkitPresentationMode !== 'inline')
    || document.pictureInPictureElement === video
    || video.webkitCurrentPlaybackTargetIsWireless);
  const evaluatePresentation = video => {
    if (!isPlayerVideo(video)) return;
    if (outsidePage(video)) enterNativePresentation(video);
    else leaveNativePresentation(video);
  };
  const presentationChanged = event => {
    const video = event.target;
    if (!isPlayerVideo(video)) return;
    if (event.type === 'webkitbeginfullscreen' || event.type === 'enterpictureinpicture') enterNativePresentation(video);
    else if (event.type === 'webkitendfullscreen' || event.type === 'leavepictureinpicture') {
      // Laisse le navigateur mettre à jour son état avant de vérifier (AirPlay en cours ?).
      window.setTimeout(() => evaluatePresentation(video), 0);
    } else evaluatePresentation(video);
  };
  for (const type of ['webkitbeginfullscreen', 'webkitendfullscreen', 'enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']) {
    document.addEventListener(type, presentationChanged, true);
  }
  document.addEventListener('emptied', event => { if (isPlayerVideo(event.target)) leaveNativePresentation(event.target); }, true);

  // ───────────── 2. Diffusion AirPlay / Remote Playback ─────────────
  const castIcon = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"/><path d="m12 15 5 6H7z"/></svg>';
  const watched = new WeakSet();
  const availability = new WeakMap();

  const castSupported = video => typeof video.webkitShowPlaybackTargetPicker === 'function'
    || Boolean(video.remote && typeof video.remote.prompt === 'function');

  function watchVideo(video) {
    if (watched.has(video) || !castSupported(video)) return;
    watched.add(video);
    if (typeof video.webkitShowPlaybackTargetPicker === 'function' && 'WebKitPlaybackTargetAvailabilityEvent' in window) {
      video.addEventListener('webkitplaybacktargetavailabilitychanged', event => {
        availability.set(video, event.availability === 'available');
        syncButton();
      });
      video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => { syncButton(); evaluatePresentation(video); });
    } else if (video.remote && typeof video.remote.watchAvailability === 'function') {
      video.remote.watchAvailability(available => { availability.set(video, Boolean(available)); syncButton(); })
        .catch(() => { availability.set(video, false); syncButton(); });
      for (const type of ['connecting', 'connect', 'disconnect']) video.remote.addEventListener?.(type, syncButton);
    }
  }

  function castButton() {
    const buttons = document.querySelector('.videoOsdBottom .buttons');
    if (!buttons) return null;
    let button = buttons.querySelector('.btnNoctraCast');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'btnNoctraCast autoSize paper-icon-button-light hide';
      button.title = 'Diffuser sur un appareil';
      button.setAttribute('aria-label', 'Diffuser sur un appareil (AirPlay)');
      button.innerHTML = `<span class="xlargePaperIconButton noctra-cast-icon">${castIcon}</span>`;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openPicker();
      });
      const anchor = buttons.querySelector('.btnFullscreen') || buttons.querySelector('.btnVideoOsdSettings');
      if (anchor) anchor.before(button); else buttons.append(button);
    }
    return button;
  }

  function syncButton() {
    const video = document.querySelector('video.htmlvideoplayer');
    const button = castButton();
    if (!button) return;
    const available = Boolean(video && availability.get(video));
    const wireless = Boolean(video && (video.webkitCurrentPlaybackTargetIsWireless || video.remote?.state === 'connected'));
    button.classList.toggle('hide', !(available || wireless));
    button.dataset.active = String(wireless);
  }

  async function openPicker() {
    const video = document.querySelector('video.htmlvideoplayer');
    if (!video) return;
    try {
      if (typeof video.webkitShowPlaybackTargetPicker === 'function') { video.webkitShowPlaybackTargetPicker(); return; }
      if (video.remote && typeof video.remote.prompt === 'function') await video.remote.prompt();
    } catch (error) {
      if (error?.name !== 'NotAllowedError' && error?.name !== 'AbortError') log('diffusion', error);
    }
  }

  const tick = () => {
    if (document.hidden) return;
    const video = document.querySelector('video.htmlvideoplayer');
    if (!video) return;
    watchVideo(video);
    syncButton();
  };
  try { window.setInterval(tick, 1500); } catch {}
})();
