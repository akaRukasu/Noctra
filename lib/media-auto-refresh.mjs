import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

// Polling also works on network mounts where filesystem events are unreliable.
export function createMediaAutoRefresh({ roots, refresh, interval = 60000, log = () => {} }) {
  const known = new Map();
  const pending = new Map();
  let initialized = false, busy = false, stopped = false, timer;
  async function inventory() {
    const files = new Map();
    async function visit(path) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = join(path, entry.name);
        if (entry.isDirectory()) await visit(full);
        else if (entry.isFile() && /\.(mkv|mp4|avi|mov|m4v|ts|m2ts|webm|mp3|flac|m4a)$/i.test(extname(full))) {
          const info = await stat(full);
          files.set(full, `${info.size}:${info.mtimeMs}`);
        }
      }
    }
    for (const root of roots) {
      try { await visit(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return files;
  }
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      const files = await inventory();
      if (!initialized) {
        files.forEach((v,k) => known.set(k,v));
        initialized = true;
        return;
      }
      const ready = [];
      for (const [path, signature] of files) {
        if (known.get(path) === signature) { pending.delete(path); continue; }
        if (pending.get(path) === signature) ready.push([path,signature]);
        else pending.set(path,signature);
      }
      for (const path of pending.keys()) if (!files.has(path)) pending.delete(path);
      if (ready.length && await refresh() !== false) {
        ready.forEach(([path,signature]) => { known.set(path,signature);pending.delete(path); });
        log(`Analyse demandée après ${ready.length} fichier(s) nouveau(x) ou modifié(s).`);
      }
    } catch { log('Surveillance des médias : nouvelle tentative au prochain passage.'); }
    finally { busy = false; }
  }
  return { tick, start() { void tick();timer = setInterval(() => void tick(),interval);timer.unref?.(); }, stop() {stopped=true;clearInterval(timer);} };
}
