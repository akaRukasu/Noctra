// Bounded, process-local read-ahead. Only completed finite segments are served.
// A miss keeps the existing streaming proxy; no disk, playlist or key cache.
// 200.0.109 : the speculative deadline follows the segment duration (long FHD
// segments of ~11 s could not finish within the former fixed 6 s), and a demand
// that finds a download still receiving bytes waits for it instead of aborting it
// and restarting the same segment from zero on the streaming path.
export function createTvSegmentCache({ maxBytes = 96 * 1024 * 1024, maxSegmentBytes = 20 * 1024 * 1024, ttl = 30_000, concurrency = 2, clock = Date.now, progressWindowMs = 1_500, maxDemandWaitMs = 5_000 } = {}) {
  const ready = new Map(), jobs = new Map(), queue = [];
  let bytes = 0, active = 0;
  const remove = key => { const value = ready.get(key); if (value) bytes -= value.body.length; ready.delete(key); };
  const prune = () => { for (const [key, value] of ready) if (value.expires <= clock()) remove(key); };
  const get = key => { prune(); return ready.get(key) || null; };
  const drain = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      if (job.controller.signal.aborted) { if (jobs.get(job.key) === job) jobs.delete(job.key); job.resolve(null); continue; }
      active++;
      const timer = setTimeout(() => job.controller.abort(), job.deadlineMs); timer.unref?.();
      job.startedAt = clock();
      (async () => {
        let response;
        try {
          response = await job.load(job.controller.signal);
          const type = response.headers.get('content-type') || '';
          if (response.status !== 200 || /html|json|mpegurl|text\//i.test(type) || Number(response.headers.get('content-length') || 0) > maxSegmentBytes) return null;
          const chunks = []; let size = 0;
          for await (const chunk of response.body || []) {
            if (job.controller.signal.aborted) return null;
            size += chunk.length; job.progressAt = clock(); if (size > maxSegmentBytes) return null;
            chunks.push(Buffer.from(chunk));
          }
          if (!size || job.controller.signal.aborted) return null;
          const body = Buffer.concat(chunks);
          if (/^\s*(?:<|\{|\[)/.test(body.subarray(0, 64).toString('utf8'))) return null;
          prune();
          while (ready.size && (bytes + size > maxBytes || ready.size >= 32)) remove(ready.keys().next().value);
          if (size > maxBytes) return null;
          const value = { body, type: type || 'application/octet-stream', expires: clock() + ttl };
          remove(job.key); ready.set(job.key, value); bytes += size;
          return value;
        } catch { return null; }
        finally { try { if (response?.body && !response.body.locked) await response.body.cancel(); } catch {} }
      })().then(job.resolve).finally(() => {
        clearTimeout(timer); active--; if (jobs.get(job.key) === job) jobs.delete(job.key); drain();
      });
    }
  };
  return {
    get,
    prime(key, load, { deadlineMs = 6_000 } = {}) {
      const cached = get(key); if (cached) return Promise.resolve(cached);
      if (jobs.has(key)) return jobs.get(key).promise;
      if (queue.length >= 6) return Promise.resolve(null);
      const job = { key, load, controller: new AbortController(), deadlineMs: Math.max(1_000, Math.min(25_000, Number(deadlineMs) || 6_000)), startedAt: 0, progressAt: 0 };
      job.promise = new Promise(resolve => job.resolve = resolve);
      jobs.set(key, job); queue.push(job); drain(); return job.promise;
    },
    async read(key, waitMs = 120) {
      const cached = get(key); if (cached) return cached;
      const job = jobs.get(key); if (!job) return null;
      // A transfer that is actively receiving bytes is worth finishing: the
      // demand waits for it, bounded, rather than downloading the segment twice.
      const receiving = () => job.progressAt > 0 && clock() - job.progressAt <= progressWindowMs;
      const deadline = clock() + maxDemandWaitMs;
      let timer;
      try {
        for (;;) {
          const result = await Promise.race([job.promise, new Promise(resolve => timer = setTimeout(() => resolve(undefined), waitMs))]);
          clearTimeout(timer);
          if (result !== undefined) return result;
          if (!receiving() || clock() >= deadline) return null;
        }
      } finally { clearTimeout(timer); if (!get(key)) job.controller.abort(); }
    },
    clear() { for (const job of jobs.values()) job.controller.abort(); for (const key of ready.keys()) remove(key); },
    stats() { prune(); return { bytes, entries: ready.size, active, queued: queue.length }; }
  };
}
