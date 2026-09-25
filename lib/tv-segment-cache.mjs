// Bounded, process-local read-ahead. Only completed finite segments are served.
// A miss keeps the existing streaming proxy; no disk, playlist or key cache.
// 200.0.109 : the speculative deadline follows the segment duration (long FHD
// segments of ~11 s could not finish within the former fixed 6 s), and a demand
// that finds a download still receiving bytes waits for it instead of aborting it
// and restarting the same segment from zero on the streaming path.
// 200.0.110 : a demand can attach to a read-ahead that already started and
// receive its bytes as they arrive (already received part first), instead of
// the segment being downloaded a second time from the provider.
import { Readable } from 'node:stream';

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
      job.timer = timer;
      job.startedAt = clock();
      (async () => {
        let response;
        try {
          response = await job.load(job.controller.signal);
          const type = response.headers.get('content-type') || '';
          if (response.status !== 200 || /html|json|mpegurl|text\//i.test(type) || Number(response.headers.get('content-length') || 0) > maxSegmentBytes) return null;
          job.type = type || 'application/octet-stream';
          const chunks = job.chunks; let size = 0;
          for await (const chunk of response.body || []) {
            if (job.controller.signal.aborted) return null;
            const buffer = Buffer.from(chunk);
            // An HTML/JSON error page is rejected before any byte is shared.
            if (!size && /^\s*(?:<|\{|\[)/.test(buffer.subarray(0, 64).toString('utf8'))) return null;
            size += buffer.length; job.progressAt = clock(); if (size > maxSegmentBytes) return null;
            chunks.push(buffer); job.notify();
          }
          if (!size || job.controller.signal.aborted) return null;
          const body = Buffer.concat(chunks);
          prune();
          while (ready.size && (bytes + size > maxBytes || ready.size >= 32)) remove(ready.keys().next().value);
          if (size > maxBytes) return null;
          const value = { body, type: type || 'application/octet-stream', expires: clock() + ttl };
          remove(job.key); ready.set(job.key, value); bytes += size;
          return value;
        } catch { return null; }
        finally { try { if (response?.body && !response.body.locked) await response.body.cancel(); } catch {} }
      })().then(value => { job.outcome = value ? 'done' : 'failed'; job.notify(); job.resolve(value); }).finally(() => {
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
      const job = { key, load, controller: new AbortController(), deadlineMs: Math.max(1_000, Math.min(25_000, Number(deadlineMs) || 6_000)), startedAt: 0, progressAt: 0,
        type: '', chunks: [], outcome: '', timer: 0, waiters: new Set(), notify() { for (const wake of [...this.waiters]) wake(); } };
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
    // Attach a demand to a read-ahead in progress. Waits (bounded) for the
    // provider headers, then streams the bytes already received followed by the
    // live ones. Returns null when there is nothing worth attaching to.
    async attach(key, { waitMs = 4_500 } = {}) {
      const job = jobs.get(key); if (!job || job.controller.signal.aborted) return null;
      const next = ms => new Promise(resolve => {
        let timer = 0;
        const wake = () => { clearTimeout(timer); job.waiters.delete(wake); resolve(); };
        job.waiters.add(wake);
        if (ms > 0) timer = setTimeout(wake, ms);
      });
      const deadline = clock() + waitMs;
      while (!job.chunks.length && !job.outcome && clock() < deadline) await next(Math.max(1, deadline - clock()));
      if (!job.chunks.length || job.outcome === 'failed' || job.controller.signal.aborted) return null;
      // The demand now depends on this transfer: no speculative deadline.
      clearTimeout(job.timer);
      async function* bytesOf() {
        let index = 0;
        for (;;) {
          while (index < job.chunks.length) yield job.chunks[index++];
          if (job.outcome === 'done') return;
          if (job.outcome === 'failed' || job.controller.signal.aborted) throw new Error('segment read-ahead interrupted');
          await next(15_000);
          if (index >= job.chunks.length && !job.outcome && clock() - job.progressAt > 15_000) throw new Error('segment read-ahead stalled');
        }
      }
      return { type: job.type, stream: Readable.from(bytesOf(), { objectMode: false }) };
    },
    clear() { for (const job of jobs.values()) job.controller.abort(); for (const key of ready.keys()) remove(key); },
    stats() { prune(); return { bytes, entries: ready.size, active, queued: queue.length }; }
  };
}
