// Share work between polling/reopened dialogs; errors are never cached as zero results.
export function createInteractiveSearchCache({ ttlMs = 120000, limit = 40, now = Date.now } = {}) {
  const entries = new Map();
  return {
    clear() { for (const [key, job] of entries) if (job.done) entries.delete(key); },
    get(key, loader, force = false) {
      const cached = entries.get(key);
      if (cached && (!cached.done || (!force && cached.expiresAt > now()))) return cached;
      for (const [oldKey, job] of entries) if (job.done && job.expiresAt <= now()) entries.delete(oldKey);
      if (entries.size >= limit) {
        const oldest = [...entries].find(([, job]) => job.done);
        if (oldest) entries.delete(oldest[0]);
        else throw new Error('Trop de recherches en cours. Réessaie dans un instant.');
      }
      const job = { done: false, expiresAt: 0, value: { releases: [], running: true, completed: 0, total: 1, warnings: [] } };
      job.promise = Promise.resolve().then(() => loader(update => { job.value = { ...job.value, ...update }; }))
        .then(value => { job.value = { ...job.value, ...value, running: false }; return job.value; })
        .catch(error => { job.value = { ...job.value, running: false, error: error.message || 'Recherche indisponible.' }; return job.value; })
        .finally(() => { job.done = true; job.expiresAt = now() + (job.value.error || job.value.warnings?.length ? 10000 : ttlMs); });
      entries.set(key, job);
      return job;
    }
  };
}
