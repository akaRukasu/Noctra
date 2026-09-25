/* Noctra Jellyfin VOD policy. Kept readable alongside the upstream player bundle. */
(() => {
  'use strict';
  const recoveries = new WeakMap();

  function hlsOptions(playOptions = {}, sourceUrl = '', environment = {}) {
    const nav = environment.navigator || (typeof navigator !== 'undefined' ? navigator : {});
    const mobile = /Android|iPhone|iPad|iPod/i.test(nav.userAgent || '') ||
      (/Macintosh/i.test(nav.userAgent || '') && Number(nav.maxTouchPoints) > 1);
    const memory = Number(nav.deviceMemory || 0);
    const modest = mobile || (memory > 0 && memory <= 4);
    const budget = (modest ? 64 : 96) * 1024 * 1024;
    let bitrate = Number(playOptions.mediaSource?.Bitrate || 0);
    try {
      const url = new URL(sourceUrl, 'http://local.invalid');
      const requested = Number(url.searchParams.get('VideoBitrate') || 0);
      if (requested > 0) bitrate = requested + Number(url.searchParams.get('AudioBitrate') || 256000);
    } catch { /* A malformed URL is handled by the native player. */ }
    if (!Number.isFinite(bitrate) || bitrate <= 0) bitrate = 8_000_000;
    const target = Math.max(12, Math.min(modest ? 45 : 75, Math.floor(budget * 8 / bitrate)));
    return {
      lowLatencyMode: false,
      maxBufferLength: target,
      maxMaxBufferLength: Math.max(target, Math.min(120, target + 30)),
      maxBufferSize: budget,
      backBufferLength: modest ? 15 : 30,
      liveBackBufferLength: 30,
      // Native startup does not wait for the full forward reserve.
      maxBufferHole: .3,
      // Keep headroom for throughput fluctuations; automatic variants only.
      abrBandWidthFactor: .75,
      abrBandWidthUpFactor: .6,
      maxStarvationDelay: 4,
      nudgeMaxRetry: 5
    };
  }

  function recoverNetworkError(hls, video, error) {
    if (!hls || !video || !error?.fatal || error.type !== 'networkError') return false;
    const status = Number(error.response?.code || error.response?.status || 0);
    if (![0,408,429].includes(status) && !(status >= 500 && status <= 599)) return false;
    // startLoad cannot reload an initial manifest; keep native failure handling.
    if (/^manifest/i.test(error.details || '')) return false;
    if (video.ended || !hls.media || hls.media !== video) return false;
    let state = recoveries.get(hls);
    if (!state) {
      state = {attempts:0,timer:null,destroyed:false};
      recoveries.set(hls,state);
      let lastPosition = Number(video.currentTime || 0), stableSeconds = 0;
      const progress = () => {
        const position = Number(video.currentTime || 0), delta = position - lastPosition;
        lastPosition = position;
        if (video.paused || video.seeking || delta < 0 || delta > 5) { stableSeconds = 0; return; }
        stableSeconds += delta;
        if (stableSeconds >= 60 && state.timer === null) { state.attempts = 0; stableSeconds = 0; }
      };
      const interrupted = () => { stableSeconds = 0; };
      video.addEventListener?.('timeupdate', progress);
      video.addEventListener?.('waiting', interrupted);
      hls.on('hlsDestroying', () => {
        video.removeEventListener?.('timeupdate', progress);
        video.removeEventListener?.('waiting', interrupted);
        state.destroyed = true;
        clearTimeout(state.timer);
        state.timer = null;
      });
    }
    if (state.destroyed) return false;
    if (state.timer !== null) return true;
    // Let HLS finish its own segment retries first; only two final restarts.
    // Authentication, missing files and media/codec errors keep native handling.
    if (state.attempts >= 2) return false;
    const delay = [1500,4000][state.attempts++];
    state.timer = setTimeout(() => {
      state.timer = null;
      if (!state.destroyed && hls.media === video && !video.ended) {
        // -1 resumes loading from the current position. Never force play/seek.
        hls.startLoad(-1);
      }
    }, delay);
    return true;
  }

  window.NoctraPlayback = Object.freeze({hlsOptions,recoverNetworkError});
})();
