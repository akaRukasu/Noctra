/* Bounded channel-only checks. No stream URL or credential is persisted. */
(() => {
  const storageKey = 'noctra-tv-server-health-v1';
  let history = {};
  try { history = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
  let enabled = false, manual = false, scan = null;
  const hash = value => {
    let n = 2166136261;
    for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
    return (n >>> 0).toString(36);
  };
  const key = (channel, option) => hash(JSON.stringify([
    channel.sourceId || '', channel.provider, channel.id || channel.name || channel.title,
    option.serverIndex ?? option.index ?? '', option.label || ''
  ]));
  const save = () => {
    const cutoff = Date.now() - 7 * 86400000;
    history = Object.fromEntries(Object.entries(history).filter(([, v]) => v?.at > cutoff)
      .sort((a, b) => b[1].at - a[1].at).slice(0, 200));
    try { localStorage.setItem(storageKey, JSON.stringify(history)); } catch {}
  };
  const cancel = () => { scan?.abort(); scan = null; };
  const score = h => (h?.probeMs ?? 15000) + (h?.failed ? 30000 : 0)
    + Math.min(30000, (h?.stalls || 0) / Math.max(1, (h?.seconds || 0) / 60) * 3000);

  // Sample two distinct media segments, not just a successful HTML/playlist response.
  async function probe(url, signal) {
    const started = performance.now();
    const read = async (target, limit, sample = false) => {
      const response = await fetch(target, { signal, cache: 'no-store' });
      if (!response.ok || !response.body || /text\/html/i.test(response.headers.get('content-type') || '')) throw Error('unavailable');
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        while (size < limit) {
          const part = await reader.read();
          if (part.done) break;
          const bytes = part.value.subarray(0, limit - size);
          chunks.push(bytes); size += bytes.length;
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (!size) throw Error('empty');
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (sample) {
        const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
        if (size < 188 || /^(?:<|\{|#EXTM3U)/.test(head)) throw Error('not-media');
      }
      return { text: sample ? '' : new TextDecoder().decode(bytes), url: response.url || target };
    };
    let target = new URL(url, location.href).href;
    for (let depth = 0; depth < 3; depth++) {
      const result = await read(target, 128 * 1024);
      if (!result.text.trimStart().startsWith('#EXTM3U')) throw Error('not-hls');
      const lines = result.text.split(/\r?\n/).map(s => s.trim());
      const uris = lines.filter(s => s && !s.startsWith('#'));
      if (result.text.includes('#EXT-X-STREAM-INF')) {
        if (!uris.length) throw Error('empty-playlist');
        target = new URL(uris[0], result.url).href;
        continue;
      }
      const segments = [...new Set(uris)].slice(-3, -1);
      if (segments.length < 2) throw Error('short-playlist');
      const times = [];
      for (const segment of segments) {
        const t = performance.now();
        await read(new URL(segment, result.url).href, 128 * 1024, true);
        times.push(performance.now() - t);
      }
      return performance.now() - started + Math.abs(times[0] - times[1]);
    }
    throw Error('nested-playlist');
  }

  window.NoctraServerChoice = {
    begin(active) { cancel(); enabled = active; manual = false; },
    manual() { if (enabled) { manual = true; cancel(); } },
    isManual: () => enabled && manual,
    async choose(channel, options, fallback, { signal, resolve, normalize, current }) {
      if (!enabled || manual || options.length < 2) return fallback;
      cancel(); const controller = new AbortController(); scan = controller;
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const timer = setTimeout(abort, 12000);
      const candidates = options.map((option, index) => ({ option, index, id: key(channel, option) }))
        .filter(({ option }) => !option.manualOnly && (option.streamUrl || (option.resolveUrl && !option.url))
          && (!option.transport || option.transport === 'hls'))
        .sort((a, b) => score(history[a.id]) - score(history[b.id])).slice(0, 6);
      const results = []; let cursor = 0;
      const worker = async () => {
        while (!controller.signal.aborted && cursor < candidates.length) {
          const candidate = candidates[cursor++];
          const previous = history[candidate.id];
          if (previous?.checked > Date.now() - 600000 && !previous.failed) {
            results.push(candidate); continue;
          }
          const attempt = new AbortController();
          const stopAttempt = () => attempt.abort();
          controller.signal.addEventListener('abort', stopAttempt, { once: true });
          const deadline = setTimeout(stopAttempt, 4000);
          try {
            let option = candidate.option;
            if (!option.streamUrl) {
              const data = await resolve(option.resolveUrl, attempt.signal);
              const resolved = data?.options?.find(o => o.streamUrl) || (data?.streamUrl ? data : null);
              if (!resolved) throw Error('no-stream');
              option = { ...option, ...resolved, label: option.label || resolved.label };
            }
            const probeMs = await probe(normalize(option.streamUrl), attempt.signal);
            if (!current() || manual || controller.signal.aborted) return;
            options[candidate.index] = option;
            history[candidate.id] = { ...previous, probeMs, checked: Date.now(), at: Date.now(), failed: false };
            results.push(candidate);
          } catch {
            if (!controller.signal.aborted) history[candidate.id] = { ...previous, at: Date.now(), checked: Date.now(), failed: true };
          } finally {
            clearTimeout(deadline);
            controller.signal.removeEventListener('abort', stopAttempt);
          }
        }
      };
      try { await Promise.all([worker(), worker()]); }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (scan === controller) scan = null; save(); }
      if (!current() || manual || signal?.aborted) return fallback;
      return results.sort((a, b) => score(history[a.id]) - score(history[b.id]))[0]?.index ?? fallback;
    },
    track(channel, option, video, signal) {
      if (!enabled || !option) return;
      const id = key(channel, option);
      let last = video.currentTime, seconds = 0, stalls = 0, waiting = false, played = false;
      const flush = () => {
        if (!seconds && !stalls) return;
        const h = history[id] || {};
        history[id] = { ...h, at: Date.now(), seconds: (h.seconds || 0) + seconds,
          stalls: (h.stalls || 0) + stalls, failed: stalls ? true : seconds >= 30 ? false : h.failed };
        seconds = 0; stalls = 0; save();
      };
      video.addEventListener('timeupdate', () => {
        const delta = video.currentTime - last; last = video.currentTime;
        if (!video.seeking && !video.paused && delta > 0 && delta < 3) { seconds += delta; played = true; }
        if (seconds >= 30) flush();
      }, { signal });
      video.addEventListener('waiting', () => {
        if (played && !waiting && !video.seeking) { stalls++; waiting = true; flush(); }
      }, { signal });
      video.addEventListener('playing', () => { waiting = false; }, { signal });
      signal.addEventListener('abort', flush, { once: true });
    }
  };
})();
