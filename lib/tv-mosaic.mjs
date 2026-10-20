import { spawn as spawnProcess, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Multiview diffusable partout : les chaînes sont composées par ffmpeg en une seule
// image (grille ou chaîne mise en avant, son d'une seule chaîne) publiée en HLS.
// Un Chromecast, un téléviseur AirPlay ou n'importe quel lecteur la lit comme une chaîne.

export const mosaicSize = { width: 1280, height: 720 };
export const mosaicMaxTiles = 9;

/** Cases de la mosaïque (pixels pairs, 1280 × 720) : grille, ou une grande chaîne et les autres autour. */
export function mosaicLayout(count, featured = -1, { width = mosaicSize.width, height = mosaicSize.height } = {}) {
  const even = value => Math.max(2, Math.floor(value / 2) * 2);
  const cells = [];
  if (count <= 0) return cells;
  if (featured >= 0 && featured < count && count > 1 && count <= 8) {
    // Grande chaîne (3/4) et les autres en 16:9 : à sa droite (centrées jusqu'à 3), puis en dessous.
    const small = { w: even(width / 4), h: even(height / 4) };
    const few = count - 1 <= 3;
    const big = { x: 0, y: few ? even((height - height * 0.75) / 2) : 0, w: even(width * 0.75), h: even(height * 0.75) };
    const slots = [];
    const top = few ? big.y + Math.floor(((3 - (count - 1)) * small.h) / 4) * 2 : 0;
    for (let row = 0; row < 3; row += 1) slots.push({ x: big.w, y: top + row * small.h });
    for (let column = 0; column < 4; column += 1) slots.push({ x: column * small.w, y: big.h });
    let next = 0;
    for (let index = 0; index < count; index += 1) {
      if (index === featured) cells.push(big);
      else { const slot = slots[next++]; cells.push({ x: slot.x, y: slot.y, w: small.w, h: small.h }); }
    }
    return cells;
  }
  const columns = count <= 1 ? 1 : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / columns);
  const w = even(width / columns);
  const h = even(height / rows);
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const inRow = row === rows - 1 ? count - row * columns : columns;
    // Dernière ligne incomplète centrée.
    const shift = Math.floor(((columns - inRow) * w) / 2 / 2) * 2;
    cells.push({ x: shift + (index % columns) * w, y: row * h, w, h });
  }
  return cells;
}

/** Arguments ffmpeg d'une mosaïque : entrées HLS, composition, son choisi, sortie HLS continue. */
export function mosaicArgs({ inputs, audio = 0, featured = -1, dir, generation = 1, preset = 'veryfast', bitrate = 3500 }) {
  const count = inputs.length;
  const cells = mosaicLayout(count, featured);
  const args = ['-hide_banner', '-loglevel', 'warning', '-nostdin'];
  for (const input of inputs) {
    args.push(
      '-fflags', '+genpts+discardcorrupt',
      '-analyzeduration', '4000000', '-probesize', '4000000',
      '-rw_timeout', '20000000',
      '-thread_queue_size', '512',
      '-i', input
    );
  }
  // Fond noir sans fin : la mosaïque continue même si une chaîne s'arrête (dernière image gardée).
  args.push('-f', 'lavfi', '-i', `color=c=black:s=${mosaicSize.width}x${mosaicSize.height}:r=25`);
  const filters = [];
  inputs.forEach((_, index) => {
    const cell = cells[index];
    filters.push(`[${index}:v:0]setpts=PTS-STARTPTS,fps=25,scale=${cell.w}:${cell.h}:force_original_aspect_ratio=decrease,pad=${cell.w}:${cell.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${index}]`);
  });
  let base = `[${count}:v]`;
  inputs.forEach((_, index) => {
    const cell = cells[index];
    const out = index === count - 1 ? '[vout]' : `[b${index}]`;
    filters.push(`${base}[v${index}]overlay=x=${cell.x}:y=${cell.y}:eof_action=repeat:repeatlast=1${out}`);
    base = `[b${index}]`;
  });
  const listened = Math.min(Math.max(0, Number(audio) || 0), count - 1);
  filters.push(`[${listened}:a:0]asetpts=PTS-STARTPTS,aresample=48000:async=1000,aformat=channel_layouts=stereo[aout]`);
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', preset, '-tune', 'zerolatency', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
    '-b:v', `${bitrate}k`, '-maxrate', `${Math.round(bitrate * 1.2)}k`, '-bufsize', `${bitrate * 2}k`,
    '-g', '50', '-keyint_min', '50', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000',
    '-f', 'hls', '-hls_time', '4', '-hls_list_size', '8',
    // Chaque relance (chaîne ajoutée, son changé…) continue la même liste avec une discontinuité.
    '-hls_flags', 'delete_segments+append_list+discont_start+omit_endlist+independent_segments',
    '-hls_segment_filename', join(dir, `s${generation}-%05d.ts`),
    join(dir, 'index.m3u8')
  );
  return args;
}

/**
 * Relais d'une chaîne pour un téléviseur (AirPlay, Chromecast) : flux copié tel quel (aucun
 * réencodage, presque aucun calcul) dans une liste HLS locale qui garde 10 segments. Le
 * téléviseur lit des fichiers déjà sur le disque : plus d'attente à chaque segment, plus de lien
 * de la source qui expire sous ses pieds (ffmpeg se reconnecte de lui-même).
 */
export function relayArgs({ input, dir, generation = 1 }) {
  return [
    '-hide_banner', '-loglevel', 'warning', '-nostdin',
    '-fflags', '+genpts+discardcorrupt',
    '-analyzeduration', '4000000', '-probesize', '4000000',
    '-rw_timeout', '20000000',
    '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c', 'copy',
    '-f', 'hls', '-hls_time', '4', '-hls_list_size', '10',
    '-hls_flags', 'delete_segments+append_list+discont_start+omit_endlist+independent_segments',
    '-hls_segment_filename', join(dir, `s${generation}-%05d.ts`),
    join(dir, 'index.m3u8')
  ];
}

const exec = (file, args, timeout) => new Promise(resolve => {
  execFile(file, args, { timeout }, (error, stdout) => resolve(error ? null : String(stdout || '')));
});

/** ffmpeg disponible : réglage, PATH, ~/bin, applis de la seedbox, ffmpeg de Jellyfin. */
export async function findFfmpeg({ extra = [], run = exec } = {}) {
  const home = homedir();
  const candidates = [
    process.env.NOCTRA_FFMPEG, process.env.FFMPEG_PATH, ...extra,
    'ffmpeg', join(home, 'bin', 'ffmpeg'), join(home, '.local', 'bin', 'ffmpeg'),
    '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/lib/jellyfin-ffmpeg/ffmpeg', '/opt/homebrew/bin/ffmpeg'
  ];
  // Seedbox (Ultra.cc…) : ffmpeg livré avec une appli installée (~/.apps/<appli>/…).
  try {
    for (const app of await readdir(join(home, '.apps'))) {
      candidates.push(join(home, '.apps', app, 'ffmpeg'), join(home, '.apps', app, 'jellyfin-ffmpeg', 'ffmpeg'), join(home, '.apps', app, 'bin', 'ffmpeg'));
    }
  } catch {}
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const output = await run(candidate, ['-hide_banner', '-version'], 5_000);
    if (output && /ffmpeg version/i.test(output)) return { path: candidate, version: (output.match(/ffmpeg version (\S+)/i) || [])[1] || '' };
  }
  return null;
}

/**
 * Mosaïques en cours : une par compte au plus, arrêtée sans lecture pendant 90 s.
 * `inputFor(tile)` donne l'adresse lisible par ffmpeg d'une chaîne (relais Noctra local).
 */
export function createTvMosaic({ root, locate = findFfmpeg, spawn = spawnProcess, now = Date.now, idleMs = 90_000, preset = '', bitrate = 0 } = {}) {
  const mosaics = new Map();
  let ffmpeg = null;
  let located = 0;

  async function binary() {
    if (ffmpeg || now() - located < 60_000) return ffmpeg;
    located = now();
    ffmpeg = await locate();
    return ffmpeg;
  }

  function launch(mosaic) {
    if (mosaic.process) { try { mosaic.process.kill('SIGTERM'); } catch {} }
    mosaic.generation += 1;
    mosaic.error = '';
    mosaic.startedAt = now();
    const args = mosaic.relay
      ? relayArgs({ input: mosaic.inputs[0], dir: mosaic.dir, generation: mosaic.generation })
      : mosaicArgs({
        inputs: mosaic.inputs, audio: mosaic.audio, featured: mosaic.featured, dir: mosaic.dir, generation: mosaic.generation,
        preset: preset || process.env.NOCTRA_MOSAIC_PRESET || 'veryfast',
        bitrate: bitrate || Number(process.env.NOCTRA_MOSAIC_BITRATE) || 3500
      });
    const child = spawn(mosaic.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const generation = mosaic.generation;
    let log = '';
    child.stderr?.on('data', chunk => { log = (log + chunk).slice(-4000); });
    child.on('error', error => { if (mosaic.generation === generation) mosaic.error = String(error?.message || error); });
    child.on('exit', code => {
      if (mosaic.generation !== generation || mosaic.stopped) return;
      mosaic.process = null;
      mosaic.error = (log.trim().split('\n').slice(-3).join(' · ') || `ffmpeg arrêté (${code})`).slice(0, 600);
      // Arrêt inattendu (chaîne coupée, lien de la source expiré…) : relance tant que le téléviseur lit,
      // au plus 3 fois en 2 minutes pour une mosaïque, 20 fois en 10 minutes pour un relais.
      const windowMs = mosaic.relay ? 600_000 : 120_000;
      mosaic.restarts = mosaic.restarts.filter(at => now() - at < windowMs);
      if (mosaic.restarts.length < (mosaic.relay ? 20 : 3) && now() - mosaic.lastRead < idleMs) {
        mosaic.restarts.push(now());
        setTimeout(() => { if (!mosaic.stopped && mosaic.generation === generation) launch(mosaic); }, 2_000);
      }
    });
    mosaic.process = child;
  }

  function stop(id) {
    const mosaic = mosaics.get(id);
    if (!mosaic) return false;
    mosaic.stopped = true;
    mosaics.delete(id);
    if (mosaic.process) { try { mosaic.process.kill('SIGTERM'); } catch {} }
    rm(mosaic.dir, { recursive: true, force: true }).catch(() => {});
    return true;
  }

  const reaper = setInterval(() => {
    for (const [id, mosaic] of mosaics) if (now() - mosaic.lastRead > idleMs) stop(id);
  }, 20_000);
  reaper.unref?.();

  function describe(mosaic) {
    return {
      id: mosaic.id,
      playlist: `/api/tv/mosaic/${mosaic.id}/index.m3u8`,
      running: Boolean(mosaic.process),
      error: mosaic.error || '',
      tiles: mosaic.names,
      relay: Boolean(mosaic.relay),
      audio: mosaic.audio,
      featured: mosaic.featured
    };
  }

  /** Liste prête : au moins `minSegments` segments écrits (un relais attend une réserve avant la diffusion). */
  async function waitForPlaylist(mosaic, timeoutMs, minSegments = 1) {
    const deadline = now() + timeoutMs;
    while (now() < deadline && !mosaic.stopped) {
      try {
        const path = join(mosaic.dir, 'index.m3u8');
        const info = await stat(path);
        if (info.size > 0 && info.mtimeMs >= mosaic.startedAt - 1_000) {
          const text = await readFile(path, 'utf8');
          if ((text.match(/#EXTINF:/g) || []).length >= minSegments) return true;
        }
      } catch {}
      if (!mosaic.process && mosaic.error) return false;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    return false;
  }

  return {
    binary,
    get(id) { return mosaics.get(String(id || '')) || null; },
    describe,
    /** Nouvelle mosaïque ou mise à jour de celle du compte (même adresse de lecture). */
    async start({ owner, id = '', inputs, names = [], audio = 0, featured = -1, wait = 25_000, relay = false }) {
      if (!Array.isArray(inputs) || inputs.length < 1) throw Object.assign(new Error('Aucune chaîne à composer.'), { status: 400 });
      if (relay && inputs.length !== 1) throw Object.assign(new Error('Un relais ne transmet qu’une chaîne.'), { status: 400 });
      if (inputs.length > mosaicMaxTiles) throw Object.assign(new Error(`Au plus ${mosaicMaxTiles} chaînes.`), { status: 400 });
      const found = await binary();
      if (!found) throw Object.assign(new Error('ffmpeg est introuvable sur le serveur : installez-le ou indiquez son chemin dans NOCTRA_FFMPEG pour diffuser le multiview sur Chromecast et AirPlay.'), { status: 503 });
      let mosaic = id ? mosaics.get(id) : null;
      if (mosaic && mosaic.owner !== owner) mosaic = null;
      // Une seule mosaïque par compte : l'ancienne est remplacée.
      for (const [key, other] of mosaics) if (other.owner === owner && other !== mosaic) stop(key);
      if (!mosaic) {
        const newId = randomBytes(12).toString('hex');
        const dir = join(root, newId);
        await mkdir(dir, { recursive: true });
        mosaic = { id: newId, owner, dir, generation: 0, restarts: [], lastRead: now(), process: null, error: '', stopped: false, relay: Boolean(relay) };
        mosaics.set(newId, mosaic);
      }
      Object.assign(mosaic, {
        ffmpeg: found.path,
        inputs: inputs.slice(0, mosaicMaxTiles),
        names: names.slice(0, mosaicMaxTiles).map(name => String(name || '').slice(0, 80)),
        audio: Math.min(Math.max(0, Number(audio) || 0), inputs.length - 1),
        featured: Number.isInteger(featured) && featured >= 0 && featured < inputs.length ? featured : -1,
        lastRead: now(),
        restarts: []
      });
      launch(mosaic);
      const ready = wait > 0 ? await waitForPlaylist(mosaic, wait, mosaic.relay ? 3 : 1) : false;
      return { ...describe(mosaic), ready };
    },
    stop(id, owner) {
      const mosaic = mosaics.get(String(id || ''));
      if (!mosaic || (owner && mosaic.owner !== owner)) return false;
      return stop(mosaic.id);
    },
    /** Fichier de la mosaïque (liste ou segment) ; la lecture la garde en vie. */
    file(id, name) {
      const mosaic = mosaics.get(String(id || ''));
      if (!mosaic || !/^(?:index\.m3u8|s\d+-\d{5}\.ts)$/.test(String(name || ''))) return null;
      mosaic.lastRead = now();
      return join(mosaic.dir, name);
    },
    stopAll() { for (const id of [...mosaics.keys()]) stop(id); clearInterval(reaper); }
  };
}
