import { createMediaAutoRefresh } from './lib/media-auto-refresh.mjs';
import { parseBrigittePlayers, parseBrigitteNativeDocument } from './lib/brigitte-players.mjs';
import { normalizeProviders, providerFilter, regionalOffers, verifyProviderItems } from './lib/legal-catalog.mjs';
import { additionalTvSources, createAdditionalTvProviders } from './lib/tv-additional-providers.mjs';
import { rouletteFilters, drawRoulette } from './lib/roulette.mjs';
import { createTvSegmentCache } from './lib/tv-segment-cache.mjs';
import { createServer } from 'node:http';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { pipeline, Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { chmod, link, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, symlink, writeFile, unlink } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import { createGunzip, gzipSync } from 'node:zlib';
import { matchTorrentMediaFiles, recoverRelinkByPieces, describeUnmatchedFiles } from './lib/torrent-relink.mjs';
import { trackerSearchIdentity, searchTrackerReleases } from './lib/tracker-search.mjs';
import { summarizeReleaseLanguages } from './lib/release-language.mjs';
import { discoveryPageNumber, discoveryCatalogPage } from './lib/discovery-pagination.mjs';
import { seriesStatus } from './lib/series-status.mjs';
import { createLibraryAudit } from './lib/library-completeness.mjs';
import { libraryRefreshState } from './lib/library-refresh.mjs';
import { createInteractiveSearchCache } from './lib/interactive-search.mjs';
import { publicIndexer, updateIndexer } from './lib/prowlarr-indexers.mjs';
import { compareReleaseSize, sonarrPackKind, collectSeriesPacks } from './lib/release-search.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(projectRoot, 'public');
const runtimeRoot = join(projectRoot, 'runtime');
const pidPath = join(runtimeRoot, 'noctra.pid');
const tvSourcesPath = join(runtimeRoot, 'tv-sources.json');
const liveWatchSessionPath = join(runtimeRoot, 'livewatch-session.json');
const liveWatchCatalogCachePath = join(runtimeRoot, 'livewatch-catalog-cache.json');
const tvLogoCacheRoot = join(runtimeRoot, 'tv-logo-cache');
const tvLogoIndexCachePath = join(runtimeRoot, 'tv-logo-index.json');
const discoveryFeedbackPath = join(runtimeRoot, 'discovery-feedback.json');
const defaultTvEpgUrl = 'https://xmltvfr.fr/xmltv/xmltv_fr.xml.gz';

const envPath = process.env.CONFIG_FILE || join(projectRoot, '.env');
const envText = await readFile(envPath, 'utf8').catch(() => '');
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const tvImageTokenSecret = createHash('sha256').update([
  'noctra-tv-image-v1',
  process.env.NOCTRA_TV_IMAGE_SECRET || process.env.JELLYFIN_API_KEY || process.env.JELLYFIN_URL || projectRoot
].join('\0')).digest();

// V90 : bootstrap de la clé TMDB pour les installations qui remplacent les
// fichiers sans passer par ultra/update-noctra.sh. La clé de release n'est
// jamais servie : elle est persistée dans le .env serveur (0600), chargée en
// mémoire puis supprimée du dossier applicatif dès le premier démarrage.
const releaseTmdbKeyPath = join(projectRoot, 'ultra', '.release-tmdb-key');
const releaseTmdbKey = String(await readFile(releaseTmdbKeyPath, 'utf8').catch(() => '')).trim();
if (/^[a-fA-F0-9]{32}$/.test(releaseTmdbKey)) {
  if (!process.env.TMDB_BEARER_TOKEN && !process.env.TMDB_API_KEY) {
    const cleaned = envText
      .split(/\r?\n/)
      .filter(line => !/^\s*TMDB_API_KEY\s*=/.test(line))
      .join('\n')
      .replace(/\s*$/, '');
    const nextEnv = `${cleaned}${cleaned ? '\n' : ''}TMDB_API_KEY=${releaseTmdbKey}\n`;
    await writeFile(envPath, nextEnv, { mode: 0o600 });
    await chmod(envPath, 0o600).catch(() => {});
    process.env.TMDB_API_KEY = releaseTmdbKey;
  }
  await unlink(releaseTmdbKeyPath).catch(() => {});
}

const port = Number(process.env.PORT || 3000);
const host = String(process.env.HOST || '127.0.0.1').trim() || '127.0.0.1';
const normalizedBasePath = value => {
  const source = String(value || '').trim();
  if (!source || source === '/') return '';
  const normalized = `/${source}`
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
  if (!/^\/[a-z0-9._~!$&'()*+,;=:@%/-]+$/i.test(normalized) || normalized.includes('..')) {
    throw new Error('BASE_URL invalide. Utilise par exemple /noctra.');
  }
  return normalized;
};
const basePath = normalizedBasePath(process.env.BASE_URL || '');
const publicPath = value => `${basePath}${String(value || '').startsWith('/') ? value : `/${value}`}`;
const cookiePath = basePath || '/';
const withoutSlash = value => String(value || '').replace(/\/+$/, '');
const jellyfinUrl = withoutSlash(process.env.JELLYFIN_URL);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const libraryRefreshMonitor = {
  requestedAt: 0,
  observedRunning: false,
  finishedAt: 0
};

async function mapWithConcurrency(items, concurrency, worker) {
  const list = Array.from(items || []);
  const output = new Array(list.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(Number(concurrency) || 1, list.length || 1)) }, async () => {
    while (cursor < list.length) {
      const index = cursor++;
      output[index] = await worker(list[index], index);
    }
  });
  await Promise.all(runners);
  return output;
}
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function json(res, status, data, extraHeaders = {}) {
  const raw = JSON.stringify(data);
  const acceptsGzip = /(?:^|,|\s)gzip(?:\s|,|$)/i.test(String(res.req?.headers?.['accept-encoding'] || ''));
  const compress = acceptsGzip && Buffer.byteLength(raw) >= 24 * 1024;
  const body = compress ? gzipSync(raw, { level: 4 }) : raw;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'vary': 'accept-encoding',
    ...(compress ? { 'content-encoding': 'gzip' } : {}),
    'content-length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function cleanError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'Le service distant a mis trop de temps à répondre.';
  return error?.message || 'Service indisponible.';
}

function pipeRemoteResponseBody(response, res) {
  if (!response.body) {
    res.end();
    return;
  }
  const body = Readable.fromWeb(response.body);
  pipeline(body, res, error => {
    // Les fournisseurs TV ferment parfois un segment en cours d'envoi. Pipeline
    // absorbe cette erreur de flux afin qu'elle ne redémarre pas le serveur.
    if (error && !res.destroyed) res.destroy();
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sessionCache = new Map();
const sessionTtl = 60_000;
const sessionLifetime = 12 * 60 * 60_000;
const identificationJobs = new Map();
const identificationJobLifetime = 15 * 60_000;

function requestCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const index = cookie.indexOf('=');
    if (index < 0) continue;
    if (cookie.slice(0, index).trim() === name) return decodeURIComponent(cookie.slice(index + 1).trim());
  }
  return '';
}

function directRequestToken(req) {
  const token = String(req.headers['x-noctra-token'] || '').trim();
  return token.length >= 16 && token.length <= 1024 ? token : '';
}

function publicUser(user) {
  const administrator = Boolean(user?.Policy?.IsAdministrator);
  return {
    id: user.Id,
    name: user.Name || 'Utilisateur',
    role: administrator ? 'administrator' : 'user',
    isAdmin: administrator,
    primaryImageTag: user.PrimaryImageTag || null,
    permissions: administrator
      ? ['media', 'requests', 'discovery', 'tv', 'downloads', 'automation', 'dashboard', 'libraries.refresh', 'files.manage', 'users.manage']
      : ['media', 'requests', 'discovery', 'tv']
  };
}

async function authenticateRequest(req) {
  const suppliedToken = directRequestToken(req);
  const suppliedCookie = requestCookie(req, 'noctra_session');
  const cookieEntry = /^[a-f0-9]{64}$/i.test(suppliedCookie) ? sessionCache.get(suppliedCookie) : null;
  const token = suppliedToken || (
    cookieEntry?.expiresAt > Date.now() ? cookieEntry.token : ''
  );
  if (!token) throw new HttpError(401, 'Connexion Jellyfin requise.');

  const cacheKey = createHash('sha256').update(token).digest('hex');
  const cached = sessionCache.get(cacheKey);
  if (cached && cached.validationExpiresAt > Date.now()) {
    return { token, cacheKey, user: cached.user, ...publicUser(cached.user) };
  }

  let response;
  try {
    response = await fetch(`${jellyfinUrl}/Users/Me`, {
      headers: jellyfinHeaders({}, token),
      signal: AbortSignal.timeout(8_000)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new HttpError(503, 'Jellyfin ne répond pas pour le moment.');
    }
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, 'La session Jellyfin a expiré.');
  }
  if (!response.ok) throw new HttpError(503, `Validation Jellyfin indisponible (${response.status}).`);

  const user = await response.json();
  if (!user?.Id) throw new HttpError(401, 'Utilisateur Jellyfin introuvable.');
  sessionCache.set(cacheKey, {
    token,
    user,
    validationExpiresAt: Date.now() + sessionTtl,
    expiresAt: Date.now() + sessionLifetime
  });
  if (sessionCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of sessionCache) {
      if (value.expiresAt <= now) sessionCache.delete(key);
    }
  }
  return { token, cacheKey, user, ...publicUser(user) };
}

function requireAdministrator(session) {
  if (!session?.isAdmin) throw new HttpError(403, 'Cette fonction est réservée aux administrateurs Noctra.');
}

function administratorRoute(path, method) {
  if (path === '/api/libraries/refresh') return true;
  if (path === '/api/discovery/grab' || path === '/api/discovery/download-options') return true;
  if (path === '/api/tv/sources' && method !== 'GET') return true;
  if (path.startsWith('/api/tv/sources/') && method !== 'GET') return true;
  if (path === '/api/tv/livewatch/session' && method !== 'GET') return true;
  if (path === '/api/tv/livewatch/diagnostics') return true;
  return [
    '/api/downloads',
    '/api/jellyfin/identify',
    '/api/sonarr',
    '/api/radarr',
    '/api/prowlarr',
    '/api/servarr',
    '/api/files'
  ].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

function normalizedIdentifier(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLocaleLowerCase('fr')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizedTitle(value) {
  return normalizedIdentifier(value)
    .replace(/^(the|a|an|le|la|les|l|un|une|des)\s+/, '')
    .trim();
}

function yearFrom(value) {
  const match = String(value || '').match(/\b(?:19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(normalizedTitle(left).split(' ').filter(token => token.length > 1));
  const rightTokens = new Set(normalizedTitle(right).split(' ').filter(token => token.length > 1));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function cleanMediaPathName(value) {
  const source = String(value || '')
    .replace(extname(String(value || '')), '')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const year = yearFrom(source);
  const name = source
    .replace(/\s*[\[(](?:19|20)\d{2}[\])]\s*/g, ' ')
    .replace(/\b(?:2160p|1080p|720p|480p|uhd|hdr10|hdr|dv|dolby[ ._-]*vision|bluray|blu[ ._-]*ray|brrip|webrip|web[ ._-]*dl|hdtv)\b.*$/i, '')
    .replace(/\b(?:multi|truefrench|french|vff|vfq|vof|vostfr|subfrench)\b.*$/i, '')
    .replace(/\s+-\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { name, year };
}

function mediaPathSuggestion(pathValue) {
  const segments = String(pathValue || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (!segments.length) return { name: '', year: null };
  const leaf = segments.at(-1);
  const leafIsFile = Boolean(extname(leaf));
  const candidates = leafIsFile
    ? [segments.at(-2), leaf]
    : [leaf, segments.at(-2)];
  const genericFolders = new Set([
    'film',
    'films',
    'movie',
    'movies',
    'serie',
    'series',
    'anime',
    'animes',
    'animation',
    'films d animation',
    'media'
  ]);
  for (const candidate of candidates.filter(Boolean)) {
    const cleaned = cleanMediaPathName(basename(candidate));
    if (
      cleaned.name.length >= 2
      && !genericFolders.has(normalizedTitle(cleaned.name))
    ) {
      return cleaned;
    }
  }
  return { name: '', year: null };
}

async function remote(url, options = {}) {
  const { timeoutMs = 20_000, ...requestOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...requestOptions, signal: controller.signal });
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(`API ${response.status}${message ? ` — ${message.slice(0, 180)}` : ''}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function jellyfinHeaders(extra = {}, token = process.env.JELLYFIN_API_KEY || '') {
  // Jellyfin 12 disables legacy token headers, including on upgraded servers.
  return { Authorization: `MediaBrowser Token="${encodeURIComponent(token)}"`, ...extra };
}

let cachedUser;
async function jellyfinUser() {
  if (cachedUser) return cachedUser;
  const users = await (await remote(`${jellyfinUrl}/Users`, { headers: jellyfinHeaders() })).json();
  cachedUser = users[0];
  if (!cachedUser?.Id) throw new Error('Aucun utilisateur Jellyfin accessible avec cette clé API.');
  return cachedUser;
}

async function jellyfinItems(path, params = {}, session = null) {
  const user = session?.user || await jellyfinUser();
  const target = new URL(`${jellyfinUrl}${path.replace('{userId}', user.Id)}`);
  Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, String(value)));
  const payload = await (await remote(target, {
    headers: jellyfinHeaders({}, session?.token)
  })).json();
  return payload.Items || payload;
}

function strictResumeItems(items, limit = 12) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item => {
    const id = String(item?.Id || '');
    const userData = item?.UserData || {};
    const position = Number(userData.PlaybackPositionTicks || 0);
    const runtime = Number(item?.RunTimeTicks || 0);
    const playedPercentage = Number(userData.PlayedPercentage);
    if (!id || seen.has(id) || userData.Played === true || !(position > 0)) return false;
    if (Number.isFinite(playedPercentage) && playedPercentage >= 99) return false;
    if (runtime > 0 && position >= runtime * .99) return false;
    seen.add(id);
    return true;
  }).slice(0, Math.max(0, Number(limit) || 0));
}

async function jellyfinCount(parentId, includeItemTypes, session = null) {
  const user = session?.user || await jellyfinUser();
  const target = new URL(`${jellyfinUrl}/Users/${user.Id}/Items`);
  target.searchParams.set('ParentId', parentId);
  target.searchParams.set('Recursive', 'true');
  target.searchParams.set('IncludeItemTypes', includeItemTypes);
  target.searchParams.set('Limit', '0');
  target.searchParams.set('EnableTotalRecordCount', 'true');
  const response = await fetch(target, {
    headers: jellyfinHeaders({}, session?.token),
    signal: AbortSignal.timeout(3_000)
  });
  if (!response.ok) throw new Error(`Comptage Jellyfin indisponible (${response.status}).`);
  const payload = await response.json();
  return Number.isInteger(payload.TotalRecordCount) ? payload.TotalRecordCount : (payload.Items || []).length;
}

async function jellyfinLibraryImage(view, includeItemTypes, session = null) {
  if (!view?.Id) return null;
  if (view.ImageTags?.Primary) {
    return publicPath(`/api/jellyfin/image/${view.Id}?tag=${encodeURIComponent(view.ImageTags.Primary)}`);
  }
  const user = session?.user || await jellyfinUser();
  const target = new URL(`${jellyfinUrl}/Users/${user.Id}/Items`);
  target.searchParams.set('ParentId', view.Id);
  target.searchParams.set('Recursive', 'true');
  target.searchParams.set('IncludeItemTypes', includeItemTypes);
  target.searchParams.set('Fields', 'ImageTags,PrimaryImageAspectRatio,DateCreated');
  target.searchParams.set('SortBy', 'DateCreated');
  target.searchParams.set('SortOrder', 'Descending');
  target.searchParams.set('Limit', '24');
  target.searchParams.set('EnableTotalRecordCount', 'false');
  const response = await fetch(target, {
    headers: jellyfinHeaders({}, session?.token),
    signal: AbortSignal.timeout(4_000)
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const item = (payload.Items || []).find(candidate => candidate?.Id && candidate?.ImageTags?.Primary);
  return item?.ImageTags?.Primary
    ? publicPath(`/api/jellyfin/image/${item.Id}?tag=${encodeURIComponent(item.ImageTags.Primary)}`)
    : null;
}

function validJellyfinItemId(value) {
  return /^[a-f0-9]{32}$/i.test(String(value || ''));
}

function identificationSearchInfo(value) {
  const source = value && typeof value === 'object' ? value : {};
  const providerIds = source.ProviderIds && typeof source.ProviderIds === 'object'
    ? Object.fromEntries(Object.entries(source.ProviderIds)
      .filter(([key, providerValue]) => (
        /^[a-z0-9._-]{1,64}$/i.test(key)
        && typeof providerValue === 'string'
        && providerValue.trim().length <= 160
      ))
      .map(([key, providerValue]) => [key, providerValue.trim()]))
    : {};
  const result = { ProviderIds: providerIds };
  const name = String(source.Name || '').trim().slice(0, 300);
  if (name) result.Name = name;
  const year = Number(source.Year);
  if (Number.isInteger(year) && year >= 1800 && year <= 2200) result.Year = year;
  return result;
}

async function jellyfinItem(itemId, session) {
  const userId = session.user.Id;
  const target = `${jellyfinUrl}/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}`;
  return (await remote(target, {
    headers: jellyfinHeaders({}, session.token)
  })).json();
}

async function jellyfinIdentificationContext(itemId, session) {
  const item = await jellyfinItem(itemId, session);
  if (!item?.Id || !item?.Type) throw new Error('Le média Jellyfin est introuvable.');
  const pathSuggestion = mediaPathSuggestion(item.Path);
  const providerIds = item.ProviderIds && typeof item.ProviderIds === 'object'
    ? item.ProviderIds
    : {};
  const currentYear = Number(item.ProductionYear) || null;
  const yearConflict = Boolean(pathSuggestion.year && currentYear && pathSuggestion.year !== currentYear);
  const missingProviders = Object.keys(providerIds).length === 0;
  const titleConflict = Boolean(
    pathSuggestion.name
    && missingProviders
    && tokenSimilarity(pathSuggestion.name, item.Name || item.OriginalTitle) < .18
  );
  const metadataMismatch = yearConflict || titleConflict;
  return {
    itemId: item.Id,
    name: item.Name || item.OriginalTitle || '',
    originalTitle: item.OriginalTitle || '',
    year: currentYear,
    type: item.Type,
    path: item.Path || '',
    providerIds,
    suggestedName: metadataMismatch ? pathSuggestion.name : (item.Name || item.OriginalTitle || pathSuggestion.name),
    suggestedYear: metadataMismatch
      ? (pathSuggestion.year || currentYear)
      : (currentYear || pathSuggestion.year),
    recommendedProviderIds: metadataMismatch ? {} : providerIds,
    metadataMismatch
  };
}

async function searchJellyfinIdentification(itemId, searchInfo, session) {
  const item = await jellyfinItem(itemId, session);
  if (!item?.Type) throw new Error('Le type du média Jellyfin est introuvable.');

  // Jellyfin attend parfois plus d'une minute qu'un fournisseur de métadonnées
  // réponde, puis renvoie 504. Jellyseerr dispose déjà du catalogue TMDB :
  // l'utiliser d'abord donne les mêmes identifiants de référence, sans figer
  // l'interface. Le moteur natif Jellyfin reste le repli.
  const catalogResults = await jellyseerrIdentificationResults(searchInfo, item.Type)
    .catch(() => []);
  if (catalogResults.length) {
    return {
      itemId,
      itemType: item.Type,
      source: 'jellyseerr-tmdb',
      results: catalogResults
    };
  }

  let response;
  try {
    response = await remote(`${jellyfinUrl}/Items/RemoteSearch/${encodeURIComponent(item.Type)}`, {
      method: 'POST',
      headers: jellyfinHeaders(
        { 'content-type': 'application/json' },
        process.env.JELLYFIN_API_KEY || session.token
      ),
      body: JSON.stringify({
        SearchInfo: identificationSearchInfo(searchInfo),
        ItemId: itemId
      }),
      timeoutMs: Math.max(
        250,
        Math.min(15_000, Number(process.env.NOCTRA_IDENTIFY_TIMEOUT_MS) || 6_000)
      )
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new HttpError(
        504,
        'Les fournisseurs de métadonnées Jellyfin ne répondent pas. Réessaie ou indique un identifiant TMDB.'
      );
    }
    throw error;
  }
  const results = await response.json();
  return {
    itemId,
    itemType: item.Type,
    source: 'jellyfin',
    results: Array.isArray(results) ? results.slice(0, 120) : []
  };
}

function jellyseerrIdentificationResult(item) {
  const name = item.title || item.name || item.originalTitle || item.originalName || '';
  const date = item.releaseDate || item.firstAirDate || '';
  const posterPath = item.posterPath || item.backdropPath || '';
  return {
    Name: name,
    OriginalTitle: item.originalTitle || item.originalName || name,
    ...(yearFrom(date) ? { ProductionYear: yearFrom(date) } : {}),
    SearchProviderName: 'TheMovieDb',
    ProviderIds: { Tmdb: String(item.id) },
    ...(item.overview ? { Overview: item.overview } : {}),
    ...(posterPath
      ? { ImageUrl: `https://image.tmdb.org/t/p/w500${posterPath}` }
      : {})
  };
}

async function jellyseerrIdentificationResults(searchInfo, itemType) {
  if (!process.env.JELLYSEERR_URL || !process.env.JELLYSEERR_API_KEY) return [];
  const cleaned = identificationSearchInfo(searchInfo);
  const mediaType = itemType === 'Series' || itemType === 'Season' || itemType === 'Episode'
    ? 'tv'
    : 'movie';
  const tmdbId = positiveInteger(cleaned.ProviderIds?.Tmdb);
  let candidates = [];

  if (tmdbId) {
    const detail = await jellyseerr(`/api/v1/${mediaType}/${tmdbId}`, {
      timeoutMs: 5_000
    });
    if (detail?.id) candidates = [{ ...detail, mediaType }];
  } else if (cleaned.Name) {
    const payload = await jellyseerr(
      `/api/v1/search?query=${encodeURIComponent(cleaned.Name)}&page=1&language=fr`,
      { timeoutMs: 5_000 }
    );
    candidates = Array.isArray(payload?.results)
      ? payload.results.filter(candidate => candidate.mediaType === mediaType)
      : [];
  }

  const expectedTitle = normalizedTitle(cleaned.Name);
  const expectedYear = yearFrom(cleaned.Year);
  return candidates
    .map(candidate => {
      const title = candidate.title || candidate.name || candidate.originalTitle || candidate.originalName;
      const candidateYear = yearFrom(candidate.releaseDate || candidate.firstAirDate);
      const similarity = expectedTitle
        ? tokenSimilarity(expectedTitle, normalizedTitle(title))
        : 1;
      const yearDistance = expectedYear && candidateYear
        ? Math.abs(expectedYear - candidateYear)
        : null;
      const score = similarity * 100
        + (yearDistance === 0 ? 24 : yearDistance === 1 ? 8 : yearDistance !== null ? -20 : 0);
      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 40)
    .map(({ candidate }) => jellyseerrIdentificationResult(candidate));
}

async function applyJellyfinIdentification(itemId, result, replaceAllImages, session) {
  const current = await jellyfinItem(itemId, session);
  await remote(`${jellyfinUrl}/Items/${encodeURIComponent(itemId)}`, {
    method:'POST', headers:jellyfinHeaders({'content-type':'application/json'},session.token),
    body:JSON.stringify({...current,PreferredMetadataLanguage:'fr',PreferredMetadataCountryCode:'FR'})
  });
  const target = new URL(`${jellyfinUrl}/Items/RemoteSearch/Apply/${encodeURIComponent(itemId)}`);
  target.searchParams.set('ReplaceAllImages', String(Boolean(replaceAllImages)));
  await remote(target, {
    method: 'POST',
    headers: jellyfinHeaders(
      { 'content-type': 'application/json' },
      process.env.JELLYFIN_API_KEY || session.token
    ),
    body: JSON.stringify(result),
    timeoutMs: 90_000
  });
  const updated = await jellyfinItem(itemId, session);
  const tmdbId = updated.ProviderIds?.Tmdb;
  if (tmdbId && ['Movie','Series'].includes(updated.Type)) {
    const french = await tmdb(`/${updated.Type === 'Movie' ? 'movie' : 'tv'}/${tmdbId}`, {language:'fr-FR'}).catch(()=>null);
    if (french?.overview) await remote(`${jellyfinUrl}/Items/${encodeURIComponent(itemId)}`, {
      method:'POST',headers:jellyfinHeaders({'content-type':'application/json'},session.token),
      body:JSON.stringify({...updated,PreferredMetadataLanguage:'fr',PreferredMetadataCountryCode:'FR',Overview:french.overview})
    });
  }
  seriesStatusCache.clear();
  return { ok: true };
}

function publicIdentificationJob(job) {
  return {
    jobId: job.jobId,
    itemId: job.itemId,
    status: job.status,
    message: job.message,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null
  };
}

function pruneIdentificationJobs() {
  const oldest = Date.now() - identificationJobLifetime;
  for (const [jobId, job] of identificationJobs) {
    if ((job.finishedAt || job.startedAt) < oldest) identificationJobs.delete(jobId);
  }
}

async function identificationWasApplied(itemId, result, session) {
  const current = await jellyfinItem(itemId, session);
  const expectedProviders = Object.entries(result?.ProviderIds || {})
    .filter(([, value]) => String(value || '').trim());
  const providerMatch = expectedProviders.length > 0 && expectedProviders.every(
    ([provider, value]) => String(current?.ProviderIds?.[provider] || '') === String(value)
  );
  if (providerMatch) return true;

  const expectedName = normalizedTitle(result?.Name || result?.OriginalTitle);
  const currentName = normalizedTitle(current?.Name || current?.OriginalTitle);
  const expectedYear = yearFrom(result?.ProductionYear);
  const currentYear = yearFrom(current?.ProductionYear);
  const yearMatches = !expectedYear || !currentYear || expectedYear === currentYear;
  return Boolean(
    expectedName
    && currentName
    && yearMatches
    && tokenSimilarity(expectedName, currentName) >= .86
  );
}

async function verifyIdentificationEventually(itemId, result, session) {
  const interval = Math.max(
    25,
    Math.min(5_000, Number(process.env.NOCTRA_IDENTIFY_VERIFY_INTERVAL_MS) || 1_500)
  );
  for (const wait of [0, interval, interval * 2, interval * 3, interval * 5]) {
    if (wait) await delay(wait);
    if (await identificationWasApplied(itemId, result, session).catch(() => false)) return true;
  }
  return false;
}

function startIdentificationJob(itemId, result, replaceAllImages, session) {
  pruneIdentificationJobs();
  const job = {
    jobId: randomUUID(),
    itemId,
    ownerId: session.user.Id,
    status: 'processing',
    message: 'Jellyfin met à jour les métadonnées en arrière-plan.',
    startedAt: Date.now(),
    finishedAt: null
  };
  identificationJobs.set(job.jobId, job);

  void (async () => {
    try {
      await applyJellyfinIdentification(itemId, result, replaceAllImages, session);
      job.status = 'completed';
      job.message = 'Identification appliquée.';
    } catch (error) {
      const applied = await verifyIdentificationEventually(itemId, result, session);
      if (applied) {
        job.status = 'completed';
        job.message = 'Identification appliquée malgré la réponse tardive de Jellyfin.';
      } else {
        job.status = 'failed';
        job.message = cleanError(error);
      }
    } finally {
      job.finishedAt = Date.now();
    }
  })();

  return publicIdentificationJob(job);
}

async function libraries(session = null) {
  const views = await jellyfinItems('/Users/{userId}/Views', {}, session);
  const definitions = [
    {
      label: 'Films',
      aliases: ['Films', 'Film', 'Movies', 'Cinéma', 'Cinema'],
      keywords: ['film', 'films', 'movie', 'movies', 'cinema'],
      exclusions: ['animation', 'animations', 'anime', 'animes', 'japanimation'],
      collectionType: 'movies'
    },
    {
      label: 'Séries',
      aliases: ['Séries', 'Series', 'Séries TV', 'TV Shows', 'Shows'],
      keywords: ['serie', 'series', 'show', 'shows', 'tv'],
      exclusions: ['anime', 'animes', 'japanimation'],
      collectionType: 'tvshows'
    },
    {
      label: 'Films D’animations',
      aliases: [
        "Films D'animations",
        'Films D’animations',
        "Films d'animation",
        'Films Animation',
        'Animation Movies',
        'Films animés'
      ],
      keywords: ['animation', 'animations', 'anime', 'animes', 'animated'],
      exclusions: ['japanimation'],
      collectionType: 'movies'
    },
    {
      label: 'Animes',
      aliases: ['Animes', 'Anime', 'Japanimation', 'Mangas', 'Manga'],
      keywords: ['anime', 'animes', 'japanimation', 'manga', 'mangas'],
      exclusions: [],
      collectionType: 'tvshows'
    }
  ];

  const candidates = definitions.flatMap((definition, definitionIndex) => views.map((view, viewIndex) => {
    const name = normalizedIdentifier(view.Name);
    const aliases = definition.aliases.map(normalizedIdentifier);
    const exact = aliases.includes(name);
    const contained = aliases.some(alias => alias.length > 3 && (name.includes(alias) || alias.includes(name)));
    const keywordScore = definition.keywords.filter(keyword => name.split(' ').includes(keyword)).length * 22;
    const exclusionScore = definition.exclusions.some(keyword => name.includes(keyword)) ? 95 : 0;
    const typeScore = view.CollectionType === definition.collectionType ? 18 : (view.CollectionType ? -18 : 0);
    const score = (exact ? 1000 : 0) + (contained ? 180 : 0) + keywordScore + typeScore - exclusionScore;
    return { definition, definitionIndex, view, viewIndex, score };
  })).sort((left, right) => right.score - left.score);

  const identified = new Map();
  const usedViews = new Set();
  for (const candidate of candidates) {
    if (candidate.score < 22 || identified.has(candidate.definitionIndex) || usedViews.has(candidate.viewIndex)) continue;
    identified.set(candidate.definitionIndex, candidate.view);
    usedViews.add(candidate.viewIndex);
  }

  const entries = await Promise.all(definitions.map(async (definition, index) => {
    const view = identified.get(index);
    const label = definition.label;
    if (!view) return [label, null];
    const resolvedType = view.CollectionType || definition.collectionType;
    const mediaType = resolvedType === 'tvshows' ? 'Series' : 'Movie';
    const count = await jellyfinCount(view.Id, mediaType, session).catch(() => null);
    const image = await jellyfinLibraryImage(view, mediaType, session).catch(() => null);
    return [label, {
      id: view.Id,
      name: view.Name,
      type: resolvedType,
      count,
      image
    }];
  }));
  return Object.fromEntries(entries);
}

async function jellyfinLibraryRefreshStatus(session = null) {
  const response = await remote(`${jellyfinUrl}/ScheduledTasks`, {
    headers: jellyfinHeaders({}, session?.token)
  });
  const tasks = await response.json();
  const task = (Array.isArray(tasks) ? tasks : []).find(candidate => (
    String(candidate?.Key || '').toLowerCase() === 'refreshlibrary'
    || /(?:analyser|scan|refresh).*(?:médiathèque|bibliothèque|library)/i.test(String(candidate?.Name || ''))
  ));
  return libraryRefreshState(task, libraryRefreshMonitor);
}

function arrHeaders(apiKey) {
  return { 'X-Api-Key': apiKey || '', accept: 'application/json' };
}

function looksLikeHtml(text, contentType = '') {
  const trimmed = String(text || '').trimStart();
  return /text\/html|application\/xhtml/i.test(contentType)
    || /^<!doctype\s+html/i.test(trimmed)
    || /^<html[\s>]/i.test(trimmed)
    || /^<(?:head|body|script|title)[\s>]/i.test(trimmed);
}

function arrServiceHint(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
      ? parsed.host
      : parsed.hostname;
  } catch {
    return String(url || 'service Arr');
  }
}

async function arrRequest(url, apiKey, path, options = {}) {
  const headers = {
    ...arrHeaders(apiKey),
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const response = await remote(`${withoutSlash(url)}${path}`, { ...options, headers });
  const text = await response.text();
  if (!text) return {};
  const contentType = response.headers.get('content-type') || '';
  if (looksLikeHtml(text, contentType)) {
    throw new HttpError(502, `${arrServiceHint(url)} a renvoyé une page HTML au lieu de son API JSON. Utilise l’URL interne du service dans le .env lorsque le proxy web impose une connexion.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, `${arrServiceHint(url)} a renvoyé une réponse non JSON (${contentType || 'type inconnu'}).`);
  }
}

async function arr(url, apiKey, path) {
  return arrRequest(url, apiKey, path);
}

const arrCatalogCache = new Map();
const arrCatalogPending = new Map();

async function getArrCatalog(type, force = false) {
  const cached = arrCatalogCache.get(type);
  if (!force && cached && Date.now() - cached.updatedAt < 60_000) return cached.items;
  if (!force && arrCatalogPending.has(type)) return arrCatalogPending.get(type);
  const isSonarr = type === 'sonarr';
  const pending = arr(
    isSonarr ? process.env.SONARR_URL : process.env.RADARR_URL,
    isSonarr ? process.env.SONARR_API_KEY : process.env.RADARR_API_KEY,
    isSonarr ? '/api/v3/series' : '/api/v3/movie'
  ).then(items => {
    arrCatalogCache.set(type, { items, updatedAt: Date.now() });
    return items;
  }).finally(() => {
    if (arrCatalogPending.get(type) === pending) arrCatalogPending.delete(type);
  });
  if (!force) arrCatalogPending.set(type, pending);
  return pending;
}

function mediaIdentity(source = {}) {
  return {
    serviceId: positiveInteger(source.externalServiceId ?? source.mediaInfo?.externalServiceId),
    tmdbId: positiveInteger(source.tmdbId),
    tvdbId: positiveInteger(source.tvdbId),
    imdbId: String(source.imdbId || '').trim().toLocaleLowerCase('en'),
    title: source.title || source.name || source.originalTitle || source.originalName || '',
    year: yearFrom(source.year || source.releaseDate || source.firstAirDate || source.airDate)
  };
}

function resolveArrContent(type, source, items) {
  const target = mediaIdentity(source);
  const byServiceId = target.serviceId && items.find(item => positiveInteger(item.id) === target.serviceId);
  if (byServiceId) return { item: byServiceId, method: 'service', confidence: 1 };

  const idMatches = [
    ['tmdb', target.tmdbId, 'tmdbId'],
    ['tvdb', target.tvdbId, 'tvdbId'],
    ['imdb', target.imdbId, 'imdbId']
  ];
  for (const [method, expected, field] of idMatches) {
    if (!expected) continue;
    const item = items.find(candidate => String(candidate[field] || '').toLocaleLowerCase('en') === String(expected).toLocaleLowerCase('en'));
    if (item) return { item, method, confidence: .99 };
  }

  const expectedTitle = normalizedTitle(target.title);
  if (!expectedTitle) return null;
  const scored = items.map(item => {
    const candidateTitle = item.title || item.originalTitle || item.sortTitle || '';
    const candidateNormalized = normalizedTitle(candidateTitle);
    const candidateYear = yearFrom(item.year || item.firstAired || item.digitalRelease || item.inCinemas);
    const exact = candidateNormalized === expectedTitle;
    const similarity = tokenSimilarity(expectedTitle, candidateNormalized);
    const yearDistance = target.year && candidateYear ? Math.abs(target.year - candidateYear) : null;
    const score = (exact ? 76 : similarity * 62)
      + (yearDistance === 0 ? 18 : yearDistance === 1 ? 8 : yearDistance !== null ? -24 : 0);
    return { item, score, exact, similarity, yearDistance };
  }).sort((left, right) => right.score - left.score)[0];

  if (!scored || scored.score < 58 || (!scored.exact && scored.similarity < .72)) return null;
  return {
    item: scored.item,
    method: scored.yearDistance === 0 ? 'title-year' : 'title',
    confidence: Math.min(.96, Math.max(.58, scored.score / 100))
  };
}

function identifiedPayload(resolved) {
  if (!resolved) return { resolvedServiceId: null, identification: null };
  return {
    resolvedServiceId: positiveInteger(resolved.item.id),
    identification: {
      method: resolved.method,
      confidence: Number(resolved.confidence.toFixed(2))
    }
  };
}

async function enrichJellyseerrResults(payload) {
  const results = payload?.results || [];
  if (!results.length) return payload;
  const needsSonarr = results.some(item => item.mediaType === 'tv');
  const needsRadarr = results.some(item => item.mediaType !== 'tv');
  const [sonarrItems, radarrItems] = await Promise.all([
    needsSonarr ? getArrCatalog('sonarr').catch(() => []) : [],
    needsRadarr ? getArrCatalog('radarr').catch(() => []) : []
  ]);
  return {
    ...payload,
    results: results.map(item => {
      const type = item.mediaType === 'tv' ? 'sonarr' : 'radarr';
      const source = {
        ...item,
        tmdbId: item.tmdbId || item.id,
        externalServiceId: item.mediaInfo?.externalServiceId
      };
      const resolved = resolveArrContent(type, source, type === 'sonarr' ? sonarrItems : radarrItems);
      return { ...item, ...identifiedPayload(resolved) };
    })
  };
}

async function identifyRequestedContent(mediaType, source) {
  const type = mediaType === 'tv' ? 'sonarr' : 'radarr';
  const immediateId = positiveInteger(source.externalServiceId ?? source.media?.externalServiceId);
  if (immediateId) {
    return {
      resolvedServiceId: immediateId,
      identification: { method: 'service', confidence: 1 }
    };
  }

  const waits = [0, 350, 650, 1000, 1400];
  for (const wait of waits) {
    if (wait) await delay(wait);
    const items = await getArrCatalog(type, true).catch(() => []);
    const resolved = resolveArrContent(type, source, items);
    if (resolved) return identifiedPayload(resolved);
  }
  return identifiedPayload(null);
}

async function jellyseerr(path, options = {}) {
  const headers = {
    'X-Api-Key': process.env.JELLYSEERR_API_KEY || '',
    ...(options.body ? { 'content-type': 'application/json' } : {})
  };
  const response = await remote(`${withoutSlash(process.env.JELLYSEERR_URL)}${path}`, { ...options, headers });
  const text = await response.text();
  if (!text.trim()) return { ok: true };
  try { return JSON.parse(text); }
  catch { return { ok: true, text }; }
}

const noctraPendingRequestLimit = 10;

function requestBelongsToJellyseerrUser(item, owner, session) {
  const requestedBy = item?.requestedBy || item?.requester || {};
  return Boolean(owner) && (
    Number(requestedBy.id) === Number(owner.id)
    || String(requestedBy.jellyfinUserId || '').toLocaleLowerCase('en') === String(session?.user?.Id || '').toLocaleLowerCase('en')
  );
}

async function jellyseerrPendingQuota(session, owner = null) {
  if (session?.isAdmin) return { limit: noctraPendingRequestLimit, pending: 0, remaining: noctraPendingRequestLimit, enforced: false };
  const requester = owner || await jellyseerrUserFor(session, true);
  const requesterId = Number(requester?.id);
  if (!Number.isInteger(requesterId) || requesterId < 1) {
    return { limit: noctraPendingRequestLimit, pending: 0, remaining: noctraPendingRequestLimit, enforced: true };
  }
  const payload = await jellyseerr(`/api/v1/request?take=100&skip=0&filter=pending&sort=added&requestedBy=${requesterId}`);
  const pending = (payload?.results || []).filter(item => Number(item?.status) === 1 && requestBelongsToJellyseerrUser(item, requester, session)).length;
  return {
    limit: noctraPendingRequestLimit,
    pending,
    remaining: Math.max(0, noctraPendingRequestLimit - pending),
    enforced: true
  };
}

let jellyseerrUsersCache = { expiresAt: 0, users: [] };
async function jellyseerrUserFor(session, force = false) {
  if (force || jellyseerrUsersCache.expiresAt <= Date.now()) {
    const payload = await jellyseerr('/api/v1/user?take=100&skip=0&sort=displayname');
    jellyseerrUsersCache = {
      expiresAt: Date.now() + 60_000,
      users: Array.isArray(payload) ? payload : (payload.results || [])
    };
  }
  const jellyfinId = String(session?.user?.Id || '').toLocaleLowerCase('en');
  const jellyfinName = normalizedIdentifier(session?.user?.Name);
  return jellyseerrUsersCache.users.find(user => {
    const linkedIds = [
      user.jellyfinUserId,
      user.mediaServerUserId,
      user.settings?.jellyfinUserId
    ].filter(Boolean).map(value => String(value).toLocaleLowerCase('en'));
    if (jellyfinId && linkedIds.includes(jellyfinId)) return true;
    const names = [user.displayName, user.username, user.email?.split('@')[0]].map(normalizedIdentifier);
    return Boolean(jellyfinName && names.includes(jellyfinName));
  }) || null;
}

function normalizedJellyseerrDestination(server, details, service) {
  const rawProfiles = Array.isArray(details?.profiles)
    ? details.profiles
    : Array.isArray(details?.server?.profiles)
      ? details.server.profiles
      : [];
  const rawRootFolders = Array.isArray(details?.rootFolders)
    ? details.rootFolders
    : Array.isArray(details?.server?.rootFolders)
      ? details.server.rootFolders
      : [];
  const profiles = rawProfiles.map(profile => ({
    id: Number(profile.id),
    name: String(profile.name || `Profil ${profile.id || ''}`).trim()
  })).filter(profile => Number.isInteger(profile.id) && profile.id > 0);
  const rootFolders = rawRootFolders.map(folder => ({
    path: String(folder.path || '').trim(),
    freeSpace: Number(folder.freeSpace || 0)
  })).filter(folder => folder.path);
  const configuredProfileId = Number(
    details?.server?.activeProfileId
    || details?.activeProfileId
    || server?.activeProfileId
    || 0
  );
  const configuredRootFolder = String(
    details?.server?.activeDirectory
    || details?.activeDirectory
    || server?.activeDirectory
    || ''
  ).trim();
  const defaultProfileId = profiles.some(profile => profile.id === configuredProfileId)
    ? configuredProfileId
    : Number(profiles[0]?.id || 0);
  const defaultRootFolder = rootFolders.some(folder => folder.path === configuredRootFolder)
    ? configuredRootFolder
    : String(rootFolders[0]?.path || '');
  return {
    id: Number(server.id),
    name: server.name || (service === 'sonarr' ? 'Sonarr' : 'Radarr'),
    isDefault: Boolean(server.isDefault),
    is4k: Boolean(server.is4k),
    preventSearch: Boolean(
      details?.server?.preventSearch
      ?? details?.preventSearch
      ?? server?.preventSearch
      ?? false
    ),
    defaultProfileId,
    defaultRootFolder,
    profiles,
    rootFolders,
    ready: Boolean(defaultProfileId && defaultRootFolder)
  };
}

async function jellyseerrDestinations(mediaType) {
  const service = mediaType === 'tv' ? 'sonarr' : 'radarr';
  const configuredPayload = await jellyseerr(`/api/v1/service/${service}`);
  const configuredServers = Array.isArray(configuredPayload)
    ? configuredPayload
    : Array.isArray(configuredPayload?.results)
      ? configuredPayload.results
      : Array.isArray(configuredPayload?.servers)
        ? configuredPayload.servers
        : [];
  const inspectedServers = await Promise.all(configuredServers.map(async server => {
    const details = await jellyseerr(`/api/v1/service/${service}/${server.id}`);
    return normalizedJellyseerrDestination(server, details, service);
  }));
  // Jellyseerr/Seerr numérote couramment la première instance Radarr ou
  // Sonarr avec l'identifiant 0. Il s'agit d'un identifiant valide, pas d'une
  // absence de serveur.
  const servers = inspectedServers.filter(server => Number.isInteger(server.id) && server.id >= 0 && server.ready);
  return {
    mediaType,
    service,
    servers,
    unavailableServers: inspectedServers.filter(server => !server.ready).map(server => ({
      id: server.id,
      name: server.name,
      missing: [!server.profiles.length ? 'profil qualité' : '', !server.rootFolders.length ? 'dossier racine' : ''].filter(Boolean)
    }))
  };
}

let cachedQbitCookie = '';
let cachedQbitCookieUntil = 0;

async function qbitCookie() {
  if (cachedQbitCookie && cachedQbitCookieUntil > Date.now()) return cachedQbitCookie;
  const response = await remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: process.env.QBITTORRENT_USERNAME || '',
      password: process.env.QBITTORRENT_PASSWORD || ''
    })
  });
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error('Authentification qBittorrent refusée.');
  cachedQbitCookie = cookie.split(';')[0];
  cachedQbitCookieUntil = Date.now() + 10 * 60_000;
  return cachedQbitCookie;
}

function qbitStateLabel(state) {
  const labels = {
    error: 'Erreur', missingFiles: 'Fichiers manquants', uploading: 'Partage', pausedUP: 'Partage en pause',
    queuedUP: 'Partage en attente', stalledUP: 'Partage ralenti', checkingUP: 'Vérification', forcedUP: 'Partage forcé',
    allocating: 'Allocation', downloading: 'Téléchargement', metaDL: 'Métadonnées', pausedDL: 'En pause',
    queuedDL: 'En attente', stalledDL: 'Bloqué', checkingDL: 'Vérification', forcedDL: 'Téléchargement forcé',
    checkingResumeData: 'Contrôle des données', moving: 'Déplacement', unknown: 'État inconnu',
    stoppedDL: 'En pause', stoppedUP: 'Partage arrêté'
  };
  return labels[state] || state || 'État inconnu';
}

function qbitTorrentSummary(item) {
  const size = Number(item.total_size || item.size || 0);
  const downloaded = Number(item.downloaded || 0);
  const uploaded = Number(item.uploaded || 0);
  const progress = Math.max(0, Math.min(1, Number(item.progress || 0)));
  return {
    hash: item.hash,
    name: item.name,
    progress,
    state: item.state,
    stateLabel: qbitStateLabel(item.state),
    size,
    downloaded,
    uploaded,
    remaining: Math.max(0, Number(item.amount_left ?? (size * (1 - progress)))),
    eta: Number(item.eta ?? 8640000),
    downloadSpeed: Number(item.dlspeed || 0),
    uploadSpeed: Number(item.upspeed || 0),
    ratio: Number(item.ratio || 0),
    seeds: Number(item.num_seeds || 0),
    seedsTotal: Number(item.num_complete || 0),
    peers: Number(item.num_leechs || 0),
    peersTotal: Number(item.num_incomplete || 0),
    availability: Number(item.availability ?? -1),
    priority: Number(item.priority || 0),
    category: item.category || '',
    tags: item.tags || '',
    savePath: item.save_path || '',
    contentPath: item.content_path || '',
    tracker: item.tracker || '',
    addedOn: Number(item.added_on || 0),
    completionOn: Number(item.completion_on || 0),
    lastActivity: Number(item.last_activity || 0),
    activeTime: Number(item.time_active || 0),
    seedingTime: Number(item.seeding_time || 0),
    completed: progress === 1 && (item.amount_left == null || Number(item.amount_left) === 0) && !/checking|moving/i.test(String(item.state || '')),
    active: !['pausedDL', 'pausedUP', 'stoppedDL', 'stoppedUP'].includes(item.state),
    errored: ['error', 'missingFiles'].includes(item.state)
  };
}

async function qbitAllTorrents(cookie = '', hashes = '') {
  const sessionCookie = cookie || await qbitCookie();
  const response = await remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/torrents/info?filter=all&sort=added_on&reverse=true${hashes ? `&hashes=${encodeURIComponent(hashes)}` : ''}`, {
    headers: { cookie: sessionCookie }
  });
  const items = await response.json();
  return (Array.isArray(items) ? items : []).map(qbitTorrentSummary);
}

function normalizedQbitDestination(value) {
  const source = String(value || '').trim().replace(/\\/g, '/');
  if (!source || /[\0\r\n]/.test(source)) return '';
  if (!source.startsWith('/') && !/^[a-z]:\//i.test(source)) return '';
  const segments = source.split('/');
  if (segments.includes('..')) return '';
  const normalized = source.replace(/\/{2,}/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}

function qbitDestinationOptions(preferences = {}, torrents = []) {
  const configured = String(process.env.QBITTORRENT_SAVE_PATHS || '')
    .split('|')
    .map(normalizedQbitDestination)
    .filter(Boolean);
  const configuredSet = new Set(configured);
  const defaultPath = normalizedQbitDestination(preferences.save_path);
  const usage = new Map();
  for (const torrent of torrents) {
    const path = normalizedQbitDestination(torrent.savePath);
    if (path) usage.set(path, (usage.get(path) || 0) + 1);
  }
  const usefulPaths = [...usage.keys()].filter(path => {
    if (/(^|\/)\.noctra-seed(?:\/|$)/i.test(path)) return false;
    if ((usage.get(path) || 0) >= 2) return true;
    return /\/(?:media|downloads)(?:\/[^/]+)?$/i.test(path);
  });
  return [...new Set([defaultPath, ...configured, ...usefulPaths].filter(Boolean))]
    .map(path => ({
      path,
      isDefault: path === defaultPath,
      isConfigured: configuredSet.has(path),
      torrents: usage.get(path) || 0
    }))
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault)
      || Number(right.isConfigured) - Number(left.isConfigured)
      || right.torrents - left.torrents
      || left.path.localeCompare(right.path, 'fr'))
    .slice(0, 32);
}

async function qbitAllowedDestinations(cookie = '') {
  const sessionCookie = cookie || await qbitCookie();
  const headers = { cookie: sessionCookie };
  const [preferencesResponse, torrents] = await Promise.all([
    remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/app/preferences`, { headers }),
    qbitAllTorrents(sessionCookie)
  ]);
  return qbitDestinationOptions(await preferencesResponse.json().catch(() => ({})), torrents);
}

let cachedQbitAppInfo = null;
let cachedQbitAppInfoUntil = 0;

async function qbitAppInfo(cookie) {
  if (cachedQbitAppInfo && cachedQbitAppInfoUntil > Date.now()) return cachedQbitAppInfo;
  const base = withoutSlash(process.env.QBITTORRENT_URL);
  const headers = { cookie };
  const [versionResponse, webApiResponse, buildResponse] = await Promise.all([
    remote(`${base}/api/v2/app/version`, { headers }).catch(() => null),
    remote(`${base}/api/v2/app/webapiVersion`, { headers }).catch(() => null),
    remote(`${base}/api/v2/app/buildInfo`, { headers }).catch(() => null)
  ]);
  cachedQbitAppInfo = {
    version: versionResponse ? String(await versionResponse.text().catch(() => '')).trim() : '',
    webApiVersion: webApiResponse ? String(await webApiResponse.text().catch(() => '')).trim() : '',
    build: buildResponse ? await buildResponse.json().catch(() => ({})) : {}
  };
  cachedQbitAppInfoUntil = Date.now() + 10 * 60_000;
  return cachedQbitAppInfo;
}

function qbitTrackerHost(value) {
  const source = String(value || '').trim();
  if (!source) return 'Sans tracker';
  try { return new URL(source).hostname || source; }
  catch { return source.replace(/^[a-z]+:\/\//i, '').split(/[/:]/, 1)[0] || 'Sans tracker'; }
}

function qbitDashboardSummary(torrents, transfer = {}, syncPayload = {}, appInfo = {}) {
  const trackers = new Map();
  let totalSize = 0;
  let activeSize = 0;
  let activePeers = 0;
  for (const torrent of torrents) {
    const size = Number(torrent.size || 0);
    totalSize += size;
    if (torrent.completed && torrent.active && !torrent.errored) activeSize += size;
    if (torrent.active && !torrent.errored) activePeers += Math.max(0, Number(torrent.peers || 0));
    const host = qbitTrackerHost(torrent.tracker);
    const entry = trackers.get(host) || { host, uploaded: 0, downloaded: 0, size: 0, torrents: 0, active: 0, peers: 0 };
    entry.uploaded += Math.max(0, Number(torrent.uploaded || 0));
    entry.downloaded += Math.max(0, Number(torrent.downloaded || 0));
    entry.size += size;
    entry.torrents += 1;
    if (torrent.completed && torrent.active && !torrent.errored) entry.active += 1;
    entry.peers += Math.max(0, Number(torrent.peers || 0));
    trackers.set(host, entry);
  }
  const trackerRows = [...trackers.values()].map(entry => ({
    ...entry,
    ratio: entry.downloaded > 0 ? entry.uploaded / entry.downloaded : (entry.uploaded > 0 ? -1 : 0),
    balance: entry.uploaded - entry.downloaded
  })).sort((left, right) => right.uploaded - left.uploaded || right.torrents - left.torrents || left.host.localeCompare(right.host));
  const serverState = syncPayload?.server_state || {};
  const allTimeDownloaded = Number(transfer.alltime_dl ?? serverState.alltime_dl ?? 0);
  const allTimeUploaded = Number(transfer.alltime_ul ?? serverState.alltime_ul ?? 0);
  return {
    allTimeDownloaded,
    allTimeUploaded,
    globalRatio: allTimeDownloaded > 0 ? allTimeUploaded / allTimeDownloaded : 0,
    totalSize,
    activeSize,
    activePeers,
    freeSpace: Number(transfer.free_space_on_disk || serverState.free_space_on_disk || 0),
    trackerCount: trackerRows.length,
    trackers: trackerRows,
    app: {
      version: appInfo.version || '',
      webApiVersion: appInfo.webApiVersion || '',
      libtorrent: appInfo.build?.libtorrent || '',
      bitness: Number(appInfo.build?.bitness || 0)
    }
  };
}

async function qbitTorrentFiles(hash, cookie = '') {
  const sessionCookie = cookie || await qbitCookie();
  const response = await remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/torrents/files?hash=${encodeURIComponent(hash)}`, {
    headers: { cookie: sessionCookie }
  });
  const files = await response.json();
  return (Array.isArray(files) ? files : []).map((item, index) => ({
    index: Number(item.index ?? index),
    name: String(item.name || ''),
    size: Number(item.size || 0),
    progress: Number(item.progress || 0),
    priority: Number(item.priority ?? 1),
    pieceRange: Array.isArray(item.piece_range) ? item.piece_range.map(Number) : null,
    availability: Number(item.availability ?? -1)
  }));
}

async function qbitSetLocation(hash, location) {
  const cookie = await qbitCookie();
  await remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/torrents/setLocation`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ hashes: hash, location })
  });
}

async function qbitSetFilePriorities(hash, indexes, priority = 0) {
  const ids = [...new Set((indexes || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return;
  const cookie = await qbitCookie();
  await remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/torrents/filePrio`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ hash, id: ids.join('|'), priority: String(priority) })
  });
}

async function downloadState() {
  const cookie = await qbitCookie();
  const headers = { cookie };
  const [transferResponse, torrentsResponse, preferencesResponse, syncResponse, appInfo] = await Promise.all([
    remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/transfer/info`, { headers }),
    qbitAllTorrents(cookie),
    remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/app/preferences`, { headers }).catch(() => null),
    remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/sync/maindata?rid=0`, { headers }).catch(() => null),
    qbitAppInfo(cookie).catch(() => ({}))
  ]);
  const transfer = await transferResponse.json();
  const torrents = await torrentsResponse;
  const preferences = preferencesResponse ? await preferencesResponse.json().catch(() => ({})) : {};
  const syncPayload = syncResponse ? await syncResponse.json().catch(() => ({})) : {};
  const dashboard = qbitDashboardSummary(torrents, transfer, syncPayload, appInfo);
  const counts = torrents.reduce((result, item) => {
    result.total += 1;
    if (item.errored) result.error += 1;
    else if (!item.active) result.paused += 1;
    else if (item.completed) result.seeding += 1;
    else result.downloading += 1;
    return result;
  }, { total: 0, downloading: 0, seeding: 0, paused: 0, error: 0 });
  return {
    downloadSpeed: Number(transfer.dl_info_speed || 0),
    uploadSpeed: Number(transfer.up_info_speed || 0),
    downloaded: Number(transfer.dl_info_data || 0),
    uploaded: Number(transfer.up_info_data || 0),
    downloadLimit: Number(transfer.dl_rate_limit || preferences.dl_limit || 0),
    uploadLimit: Number(transfer.up_rate_limit || preferences.up_limit || 0),
    connectionStatus: transfer.connection_status || '',
    freeSpace: dashboard.freeSpace,
    counts,
    dashboard,
    relink: publicDownloadRelinkJob(),
    categories: [...new Set(torrents.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    destinations: qbitDestinationOptions(preferences, torrents),
    torrents: torrents.slice(0, 120)
  };
}

async function qbitTorrentDetails(hash) {
  const cookie = await qbitCookie();
  const headers = { cookie };
  const base = withoutSlash(process.env.QBITTORRENT_URL);
  const [propertiesResponse, trackersResponse, filesResponse] = await Promise.all([
    remote(`${base}/api/v2/torrents/properties?hash=${encodeURIComponent(hash)}`, { headers }),
    remote(`${base}/api/v2/torrents/trackers?hash=${encodeURIComponent(hash)}`, { headers }).catch(() => null),
    qbitTorrentFiles(hash, cookie).catch(() => null)
  ]);
  const properties = await propertiesResponse.json();
  const trackers = trackersResponse ? await trackersResponse.json().catch(() => []) : [];
  const files = filesResponse || [];
  return {
    properties: {
      savePath: properties.save_path || '',
      creationDate: Number(properties.creation_date || 0),
      pieceSize: Number(properties.piece_size || 0),
      piecesHave: Number(properties.pieces_have || 0),
      piecesNum: Number(properties.pieces_num || 0),
      totalDownloaded: Number(properties.total_downloaded || 0),
      totalUploaded: Number(properties.total_uploaded || 0),
      totalWasted: Number(properties.total_wasted || 0),
      timeElapsed: Number(properties.time_elapsed || 0),
      seedingTime: Number(properties.seeding_time || 0),
      shareRatio: Number(properties.share_ratio || 0),
      additionDate: Number(properties.addition_date || 0),
      completionDate: Number(properties.completion_date || 0),
      comment: properties.comment || ''
    },
    trackers: (trackers || []).filter(item => item.url && !String(item.url).startsWith('**')).map(item => ({
      url: item.url,
      status: Number(item.status || 0),
      message: item.msg || '',
      peers: Number(item.num_peers || 0),
      seeds: Number(item.num_seeds || 0),
      leeches: Number(item.num_leeches || 0)
    })),
    files: (files || []).slice(0, 300).map(item => ({
      name: item.name,
      size: Number(item.size || 0),
      progress: Number(item.progress || 0),
      priority: Number(item.priority || 0),
      availability: Number(item.availability ?? -1)
    }))
  };
}

async function qbitAction(hash, action) {
  const cookie = await qbitCookie();
  const headers = { cookie, 'content-type': 'application/x-www-form-urlencoded' };
  const endpoints = action === 'pause' ? ['stop', 'pause'] : ['start', 'resume'];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      await remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/torrents/${endpoint}`, {
        method: 'POST',
        headers,
        body: new URLSearchParams({ hashes: hash })
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function qbitMaintenanceAction(hash, action) {
  const endpoints = { recheck: 'recheck', reannounce: 'reannounce', top: 'topPrio', bottom: 'bottomPrio' };
  const endpoint = endpoints[action];
  if (!endpoint) throw new HttpError(400, 'Action qBittorrent invalide.');
  const cookie = await qbitCookie();
  await remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/torrents/${endpoint}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ hashes: hash })
  });
}

async function qbitDelete(hash, deleteFiles) {
  const cookie = await qbitCookie();
  await remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/torrents/delete`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      hashes: hash,
      deleteFiles: deleteFiles ? 'true' : 'false'
    })
  });
}

function torrentInfoHashes(torrent) {
  let cursor = 0;
  const length = torrent.length;
  const readString = () => {
    const start = cursor;
    while (cursor < length && torrent[cursor] >= 0x30 && torrent[cursor] <= 0x39) cursor += 1;
    if (cursor === start || torrent[cursor] !== 0x3a) throw new Error('Chaîne bencode invalide.');
    const size = Number(torrent.subarray(start, cursor).toString('ascii'));
    cursor += 1;
    if (!Number.isSafeInteger(size) || size < 0 || cursor + size > length) throw new Error('Taille bencode invalide.');
    const value = torrent.subarray(cursor, cursor + size);
    cursor += size;
    return value;
  };
  const skipValue = () => {
    if (cursor >= length) throw new Error('Valeur bencode absente.');
    const marker = torrent[cursor];
    if (marker >= 0x30 && marker <= 0x39) { readString(); return; }
    if (marker === 0x69) {
      cursor += 1;
      while (cursor < length && torrent[cursor] !== 0x65) cursor += 1;
      if (cursor >= length) throw new Error('Entier bencode invalide.');
      cursor += 1;
      return;
    }
    if (marker === 0x6c || marker === 0x64) {
      cursor += 1;
      while (cursor < length && torrent[cursor] !== 0x65) {
        if (marker === 0x64) readString();
        skipValue();
      }
      if (cursor >= length) throw new Error('Collection bencode invalide.');
      cursor += 1;
      return;
    }
    throw new Error('Marqueur bencode invalide.');
  };
  if (torrent[cursor] !== 0x64) return [];
  cursor += 1;
  while (cursor < length && torrent[cursor] !== 0x65) {
    const key = readString().toString('utf8');
    if (key !== 'info') { skipValue(); continue; }
    const start = cursor;
    skipValue();
    const info = torrent.subarray(start, cursor);
    return [createHash('sha1').update(info).digest('hex'), createHash('sha256').update(info).digest('hex')];
  }
  return [];
}

async function qbitAddTorrent(payload) {
  const originalName = basename(String(payload?.name || '').trim());
  if (!/\.torrent$/i.test(originalName) || originalName.length > 180) {
    throw new HttpError(400, 'Sélectionne un fichier .torrent valide.');
  }
  const encoded = String(payload?.dataBase64 || '').trim();
  if (!encoded || encoded.length > 12 * 1024 * 1024 || !/^[a-z0-9+/]+=*$/i.test(encoded)) {
    throw new HttpError(400, 'Le contenu du fichier .torrent est invalide.');
  }
  const torrent = Buffer.from(encoded, 'base64');
  if (torrent.length < 16 || torrent.length > 8 * 1024 * 1024 || torrent[0] !== 0x64 || !torrent.includes(Buffer.from('4:info'))) {
    throw new HttpError(400, 'Ce fichier ne contient pas de métadonnées torrent valides.');
  }
  const category = String(payload?.category || '').replace(/[\r\n\0]/g, '').trim().slice(0, 64);
  const startPaused = Boolean(payload?.startPaused);
  const requestedSavePath = normalizedQbitDestination(payload?.savePath);
  if (payload?.savePath && !requestedSavePath) throw new HttpError(400, 'La destination qBittorrent est invalide.');
  const cookie = await qbitCookie();
  if (requestedSavePath) {
    const allowed = await qbitAllowedDestinations(cookie);
    if (!allowed.some(destination => destination.path === requestedSavePath)) {
      throw new HttpError(400, 'Cette destination n’est pas autorisée par qBittorrent.');
    }
  }
  const body = new FormData();
  body.append('torrents', new Blob([torrent], { type: 'application/x-bittorrent' }), originalName);
  if (category) body.append('category', category);
  if (requestedSavePath) body.append('savepath', requestedSavePath);
  body.append('paused', startPaused ? 'true' : 'false');
  body.append('stopped', startPaused ? 'true' : 'false');
  const response = await remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/torrents/add`, {
    method: 'POST',
    headers: { cookie },
    body,
    timeoutMs: 15_000
  });
  const result = String(await response.text().catch(() => '')).trim();
  if (/^fails?\.?$/i.test(result)) {
    const hashes = torrentInfoHashes(torrent);
    const existing = hashes.length
      ? (await qbitAllTorrents(cookie).catch(() => [])).find(item => hashes.includes(String(item.hash || '').toLowerCase()))
      : null;
    if (existing) {
      return { ok: true, alreadyPresent: true, hash: existing.hash, name: originalName, category, savePath: existing.savePath || requestedSavePath, startPaused };
    }
    throw new HttpError(409, 'qBittorrent a refusé ce torrent. Il peut déjà être présent ou ne plus être accepté par le tracker.');
  }
  return { ok: true, alreadyPresent: false, name: originalName, category, savePath: requestedSavePath, startPaused };
}

function releaseSummary(item) {
  const packKind = sonarrPackKind(item);
  const seriesPack = Boolean(packKind);
  return {
    guid: item.guid,
    indexerId: item.indexerId,
    indexer: item.indexer || 'Indexeur',
    title: item.title,
    quality: item.quality?.quality?.name || item.quality?.name || 'Qualité inconnue',
    size: item.size || 0,
    ageHours: item.ageHours ?? null,
    languages: (item.languages || []).map(language => language.name || language).filter(Boolean),
    seeders: item.seeders ?? null,
    leechers: item.leechers ?? item.peers ?? null,
    protocol: item.protocol || '',
    approved: Boolean(item.approved),
    rejected: Boolean(item.rejected || item.temporarilyRejected),
    customFormatScore: item.customFormatScore ?? null,
    fullSeason: Boolean(item.fullSeason),
    seriesPack,
    packKind,
    seasonNumber: item.seasonNumber ?? null,
    requestedSeason: item.requestedSeason ?? null,
    episodeNumbers: item.episodeNumbers || []
  };
}

function sortReleaseSummaries(releases) {
  return releases.sort(compareReleaseSize);
}


const mediaRootDefaults = [
  ['films', 'Films', join(process.env.HOME || '/home/akarukasu', 'media', 'Films')],
  ['series', 'Séries', join(process.env.HOME || '/home/akarukasu', 'media', 'Séries')],
  ['animation', "Films d'animation", join(process.env.HOME || '/home/akarukasu', 'media', 'Films_D_Animation')],
  ['animes', 'Animes', join(process.env.HOME || '/home/akarukasu', 'media', 'Animes')],
  ['trash', 'Trash', join(process.env.HOME || '/home/akarukasu', 'media', 'Trash')]
];

function slugIdentifier(value, fallback = 'media') {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function configuredMediaRoots() {
  const raw = String(process.env.MEDIA_ROOTS || '').trim();
  const entries = raw
    ? raw.split('|').map((entry, index) => {
      const separator = entry.indexOf(':');
      const label = separator > 0 ? entry.slice(0, separator).trim() : `Média ${index + 1}`;
      const path = separator > 0 ? entry.slice(separator + 1).trim() : entry.trim();
      return [slugIdentifier(label, `media-${index + 1}`), label, path];
    })
    : [...mediaRootDefaults];
  const trashDefault = mediaRootDefaults.find(([id]) => id === 'trash');
  const hasTrash = entries.some(([id, label, path]) => (
    id === 'trash'
    || normalizedIdentifier(label) === 'trash'
    || normalize(String(path || '')).replace(/\\/g, '/').endsWith('/media/Trash')
  ));
  if (!hasTrash && trashDefault) entries.push(trashDefault);
  const used = new Set();
  return entries
    .filter(([, , path]) => Boolean(path))
    .map(([suggestedId, label, path], index) => {
      let id = suggestedId;
      while (used.has(id)) id = `${suggestedId}-${index + 1}`;
      used.add(id);
      return { id, label, path };
    });
}

const mediaRoots = configuredMediaRoots();

async function completenessInventory(session) {
  const items = new Map();
  let offset = 0;
  while (true) {
    const user = session?.user || await jellyfinUser();
    const target = new URL(`${jellyfinUrl}/Users/${user.Id}/Items`);
    const params = { Recursive: true, IncludeItemTypes: 'Movie,Series,Episode', Fields: 'ProviderIds,Path',
      SortBy: 'SortName', SortOrder: 'Ascending', StartIndex: offset, Limit: 500, EnableTotalRecordCount: true,
      EnableImages: false, EnableUserData: false };
    Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, String(value)));
    const payload = await (await remote(target, { headers: jellyfinHeaders({}, session?.token) })).json();
    if (!Array.isArray(payload.Items)) throw new HttpError(502, 'Inventaire Jellyfin invalide.');
    for (const item of payload.Items) {
      const { Id, Type, Name, ProviderIds, Path, IsMissing, IsVirtualItem, LocationType, SeriesId, IndexNumber, IndexNumberEnd, ParentIndexNumber } = item;
      items.set(Id, { Id, Type, Name, ProviderIds, Path, IsMissing, IsVirtualItem, LocationType, SeriesId, IndexNumber, IndexNumberEnd, ParentIndexNumber });
    }
    offset += payload.Items.length;
    const total = Number(payload.TotalRecordCount);
    if (Number.isFinite(total) && offset >= total) break;
    if (!payload.Items.length) {
      if (Number.isFinite(total) && offset < total) throw new HttpError(502, 'Inventaire Jellyfin incomplet. Relance la vérification.');
      break;
    }
    if (offset >= 200_000) throw new HttpError(413, 'Inventaire trop volumineux pour une vérification complète.');
  }
  return [...items.values()];
}

async function completenessFileState(item) {
  if (item.IsMissing || item.IsVirtualItem || item.LocationType === 'Virtual') return 'missing';
  if (!item.Path || !isAbsolute(item.Path)) return 'unverified';
  try {
    const info = await stat(item.Path);
    return info.isFile() ? (info.size > 0 ? 'present' : 'missing') : 'unverified';
  } catch (error) {
    return ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'missing' : 'unverified';
  }
}

const completenessMetadataRoot = join(runtimeRoot, 'completeness-metadata');
async function completenessMetadata(path) {
  const cachePath = join(completenessMetadataRoot, `${createHash('sha256').update(path).digest('hex')}.json`);
  const cached = await readFile(cachePath, 'utf8').then(JSON.parse).catch(() => null);
  const seasonPath = /^\/tv\/\d+\/season\/\d+$/.test(path);
  const hasDurations = value => !seasonPath || value?.episodes?.every(e => Object.hasOwn(e, 'runtime'));
  if (cached?.expiresAt > Date.now() && hasDurations(cached.value)) return cached.value;
  let value;
  try {
    // Jellyseerr strips episode durations needed to recognize bundled cartoon segments.
    value = seasonPath || path.startsWith('/find/') ? await tmdb(path) : await jellyseerr(`/api/v1${path}?language=fr`);
    if (!value?.id && !Array.isArray(value?.tv_episode_results)) throw new Error('Métadonnées indisponibles');
  } catch {
    value = await tmdb(path);
  }
  if (!(value?.id || (path.startsWith('/find/') && Array.isArray(value?.tv_episode_results))) || (path.startsWith('/collection/') && !Array.isArray(value.parts))) {
    throw new HttpError(502, 'Métadonnées de collection incomplètes.');
  }
  await mkdir(completenessMetadataRoot, { recursive: true });
  await writeFile(cachePath, JSON.stringify({ expiresAt: Date.now() + 24 * 60 * 60_000, value }), { mode: 0o600 }).catch(() => {});
  return value;
}

const seriesStatusCache = new Map();

const libraryCompletenessAudit = createLibraryAudit({
  inventory: completenessInventory,
  fileState: completenessFileState,
  metadata: completenessMetadata,
  arrCatalog: type => getArrCatalog(type, true),
  sonarrEpisodes: id => arr(process.env.SONARR_URL, process.env.SONARR_API_KEY, `/api/v3/episode?seriesId=${id}`)
});

function safeRelativeMediaPath(value) {
  const source = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (source.includes('\0')) throw new HttpError(400, 'Chemin invalide.');
  const normalized = normalize(source || '.').replace(/\\/g, '/');
  if (!normalized || normalized === '.') return '';
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new HttpError(400, 'Le chemin doit rester dans la médiathèque.');
  }
  return normalized.replace(/^\.\//, '');
}

function mediaRootById(id) {
  const root = mediaRoots.find(item => item.id === String(id || ''));
  if (!root) throw new HttpError(404, 'Médiathèque de fichiers introuvable.');
  return root;
}

function pathIsInside(rootPath, candidatePath) {
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${sep}`);
}

async function mediaRootRealPath(root) {
  const resolved = await realpath(root.path).catch(() => null);
  if (!resolved) throw new HttpError(503, `Le dossier ${root.label} est inaccessible sur le serveur.`);
  return resolved;
}

async function existingMediaPath(rootId, relativePath = '') {
  const root = mediaRootById(rootId);
  const rootReal = await mediaRootRealPath(root);
  const clean = safeRelativeMediaPath(relativePath);
  const candidate = clean ? join(rootReal, clean) : rootReal;
  const candidateReal = await realpath(candidate).catch(() => null);
  if (!candidateReal || !pathIsInside(rootReal, candidateReal)) {
    throw new HttpError(404, 'Fichier ou dossier introuvable.');
  }
  return { root, rootReal, clean, absolute: candidateReal };
}

function validMediaName(value) {
  const name = String(value || '').trim();
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new HttpError(400, 'Nom de fichier ou de dossier invalide.');
  }
  return name;
}

function relativeMediaPath(rootReal, absolutePath) {
  const value = relative(rootReal, absolutePath).split(sep).join('/');
  return value === '.' ? '' : value;
}

async function mediaDirectoryListing(rootId, relativePath = '') {
  const context = await existingMediaPath(rootId, relativePath);
  const info = await lstat(context.absolute);
  if (!info.isDirectory()) throw new HttpError(400, 'Ce chemin ne correspond pas à un dossier.');
  const children = await readdir(context.absolute, { withFileTypes: true });
  const items = [];
  for (const child of children.slice(0, 1000)) {
    if (child.name === '.noctra-trash') continue;
    const absolute = join(context.absolute, child.name);
    const childInfo = await lstat(absolute).catch(() => null);
    if (!childInfo) continue;
    const type = child.isDirectory() ? 'directory' : child.isFile() ? 'file' : child.isSymbolicLink() ? 'link' : 'other';
    items.push({
      name: child.name,
      path: relativeMediaPath(context.rootReal, absolute),
      type,
      size: childInfo.size,
      modifiedAt: childInfo.mtime.toISOString(),
      extension: type === 'file' ? extname(child.name).toLowerCase().replace(/^\./, '') : '',
      manageable: type === 'directory' || type === 'file'
    });
  }
  items.sort((left, right) => {
    if (left.type === 'directory' && right.type !== 'directory') return -1;
    if (right.type === 'directory' && left.type !== 'directory') return 1;
    return left.name.localeCompare(right.name, 'fr', { numeric: true, sensitivity: 'base' });
  });
  return {
    root: { id: context.root.id, label: context.root.label },
    path: context.clean,
    parent: context.clean ? context.clean.split('/').slice(0, -1).join('/') : null,
    items,
    truncated: children.length > 1000
  };
}

async function createMediaDirectory(rootId, parentPath, name) {
  const parent = await existingMediaPath(rootId, parentPath);
  const parentInfo = await lstat(parent.absolute);
  if (!parentInfo.isDirectory()) throw new HttpError(400, 'Le dossier parent est invalide.');
  const target = join(parent.absolute, validMediaName(name));
  if (!pathIsInside(parent.rootReal, target)) throw new HttpError(400, 'Destination invalide.');
  await mkdir(target, { recursive: false });
  return { ok: true, path: relativeMediaPath(parent.rootReal, target) };
}

async function renameMediaEntry(rootId, relativePath, newName) {
  const source = await existingMediaPath(rootId, relativePath);
  if (!source.clean) throw new HttpError(400, 'La racine ne peut pas être renommée.');
  const target = join(dirname(source.absolute), validMediaName(newName));
  if (!pathIsInside(source.rootReal, target)) throw new HttpError(400, 'Destination invalide.');
  if (await stat(target).catch(() => null)) throw new HttpError(409, 'Un élément porte déjà ce nom.');
  await rename(source.absolute, target);
  return { ok: true, path: relativeMediaPath(source.rootReal, target) };
}

async function trashMediaEntry(rootId, relativePath) {
  const source = await existingMediaPath(rootId, relativePath);
  if (!source.clean) throw new HttpError(400, 'La racine ne peut pas être supprimée.');
  const trashRoot = join(source.rootReal, '.noctra-trash');
  await mkdir(trashRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(trashRoot, `${stamp}-${randomUUID().slice(0, 8)}-${basename(source.absolute)}`);
  await rename(source.absolute, target);
  return { ok: true, message: 'Élément déplacé dans la corbeille Noctra.' };
}

async function emptyMediaTrash(rootId = 'trash') {
  const root = mediaRootById(rootId);
  if (root.id !== 'trash' && normalizedIdentifier(root.label) !== 'trash') {
    throw new HttpError(400, 'Seul le dossier Trash peut être vidé directement.');
  }
  const rootReal = await mediaRootRealPath(root);
  const children = await readdir(rootReal, { withFileTypes: true });
  let removed = 0;
  let bytes = 0;
  for (const child of children) {
    const target = join(rootReal, child.name);
    if (!pathIsInside(rootReal, target)) continue;
    const info = await lstat(target).catch(() => null);
    if (!info) continue;
    bytes += Number(info.size || 0);
    await rm(target, { recursive: true, force: true });
    removed += 1;
  }
  return {
    ok: true,
    removed,
    bytes,
    message: removed
      ? `${removed} élément${removed > 1 ? 's' : ''} supprimé${removed > 1 ? 's' : ''} définitivement du dossier Trash.`
      : 'Le dossier Trash est déjà vide.'
  };
}

function newDuplicateScanJob(overrides = {}) {
  return {
    running: false,
    phase: 'idle',
    scannedFiles: 0,
    hashedFiles: 0,
    candidateFiles: 0,
    duplicateFiles: 0,
    reclaimableBytes: 0,
    current: '',
    message: '',
    startedAt: null,
    finishedAt: null,
    groups: [],
    ...overrides
  };
}

let duplicateScanJob = newDuplicateScanJob();

function publicDuplicateScanJob() {
  return {
    ...duplicateScanJob,
    groups: duplicateScanJob.groups.slice(0, 500).map(group => ({
      hash: group.hash,
      size: group.size,
      keep: group.keep,
      duplicates: group.duplicates
    }))
  };
}

async function sha256MediaFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path, { highWaterMark: 4 * 1024 * 1024 })) hash.update(chunk);
  return hash.digest('hex');
}

async function duplicateScanRoots() {
  const roots = [];
  for (const root of mediaRoots) {
    if (root.id === 'trash' || normalizedIdentifier(root.label) === 'trash') continue;
    const realPath = await realpath(root.path).catch(() => null);
    const info = realPath ? await lstat(realPath).catch(() => null) : null;
    if (info?.isDirectory()) roots.push({ ...root, realPath });
  }
  if (!roots.length) throw new HttpError(503, 'Aucune médiathèque accessible pour rechercher les doublons.');
  return roots;
}

async function runDuplicateScanJob() {
  duplicateScanJob = newDuplicateScanJob({
    running: true,
    phase: 'scan',
    message: 'Inventaire des médiathèques…',
    startedAt: new Date().toISOString()
  });
  try {
    const roots = await duplicateScanRoots();
    const minimumSize = Math.max(64 * 1024, Math.min(1024 * 1024 * 1024, Number(process.env.NOCTRA_DUPLICATE_MIN_SIZE || 1024 * 1024)));
    const scanLimit = Math.max(1_000, Math.min(500_000, Number(process.env.NOCTRA_DUPLICATE_SCAN_LIMIT || 200_000)));
    const bySize = new Map();
    const stack = roots.map(root => ({ root, directory: root.realPath }));
    while (stack.length && duplicateScanJob.scannedFiles < scanLimit) {
      const current = stack.pop();
      const children = await readdir(current.directory, { withFileTypes: true }).catch(() => []);
      for (const child of children) {
        if (child.name.startsWith('.') || child.isSymbolicLink()) continue;
        const absolute = join(current.directory, child.name);
        if (child.isDirectory()) {
          stack.push({ root: current.root, directory: absolute });
          continue;
        }
        if (!child.isFile()) continue;
        const info = await lstat(absolute).catch(() => null);
        if (!info?.isFile()) continue;
        duplicateScanJob.scannedFiles += 1;
        if (Number(info.size || 0) < minimumSize) continue;
        const item = {
          root: current.root.id,
          rootLabel: current.root.label,
          path: relativeMediaPath(current.root.realPath, absolute),
          absolute,
          size: Number(info.size || 0),
          modifiedAt: info.mtime.toISOString(),
          links: Number(info.nlink || 1),
          physicalKey: `${info.dev || 0}:${info.ino || absolute}`
        };
        if (!bySize.has(item.size)) bySize.set(item.size, []);
        bySize.get(item.size).push(item);
      }
      duplicateScanJob.message = `${duplicateScanJob.scannedFiles.toLocaleString('fr-FR')} fichiers inventoriés`;
    }

    const sizeCandidates = [...bySize.values()].flatMap(items => {
      const unique = new Map(items.map(item => [item.physicalKey, item]));
      return unique.size > 1 ? [...unique.values()] : [];
    });
    duplicateScanJob.phase = 'hash';
    duplicateScanJob.candidateFiles = sizeCandidates.length;
    duplicateScanJob.message = 'Confirmation cryptographique des fichiers de même taille…';
    const inspected = await mapWithConcurrency(sizeCandidates, 2, async item => {
      duplicateScanJob.current = `${item.rootLabel} / ${item.path}`;
      try { return { ...item, hash: await sha256MediaFile(item.absolute) }; }
      finally {
        duplicateScanJob.hashedFiles += 1;
        duplicateScanJob.message = `${duplicateScanJob.hashedFiles}/${duplicateScanJob.candidateFiles} empreintes calculées`;
      }
    });
    const byHash = new Map();
    for (const item of inspected) {
      const key = `${item.size}:${item.hash}`;
      if (!byHash.has(key)) byHash.set(key, []);
      byHash.get(key).push(item);
    }
    const groups = [...byHash.values()].filter(items => items.length > 1).map(items => {
      items.sort((left, right) => left.path.split('/').length - right.path.split('/').length
        || String(left.modifiedAt).localeCompare(String(right.modifiedAt))
        || left.path.localeCompare(right.path, 'fr'));
      const publicItem = item => ({
        root: item.root,
        rootLabel: item.rootLabel,
        path: item.path,
        size: item.size,
        modifiedAt: item.modifiedAt,
        links: item.links
      });
      return {
        hash: items[0].hash,
        size: items[0].size,
        keep: publicItem(items[0]),
        duplicates: items.slice(1).map(publicItem)
      };
    }).sort((left, right) => (right.size * right.duplicates.length) - (left.size * left.duplicates.length));
    duplicateScanJob = {
      ...duplicateScanJob,
      running: false,
      phase: 'complete',
      current: '',
      duplicateFiles: groups.reduce((total, group) => total + group.duplicates.length, 0),
      reclaimableBytes: groups.reduce((total, group) => total + group.size * group.duplicates.length, 0),
      groups,
      message: groups.length ? `${groups.length} groupe${groups.length > 1 ? 's' : ''} de doublons confirmé${groups.length > 1 ? 's' : ''}.` : 'Aucun doublon confirmé.',
      finishedAt: new Date().toISOString()
    };
  } catch (error) {
    duplicateScanJob = {
      ...duplicateScanJob,
      running: false,
      phase: 'failed',
      current: '',
      message: error?.message || 'La recherche de doublons a échoué.',
      finishedAt: new Date().toISOString()
    };
  }
}

function startDuplicateScanJob() {
  if (duplicateScanJob.running) throw new HttpError(409, 'Une recherche de doublons est déjà en cours.');
  void runDuplicateScanJob();
  return publicDuplicateScanJob();
}

async function deleteConfirmedDuplicates(payload) {
  const items = Array.isArray(payload?.items) ? payload.items.slice(0, 500) : [];
  if (!items.length) throw new HttpError(400, 'Sélectionne au moins un doublon à supprimer.');
  let removed = 0;
  let bytes = 0;
  const errors = [];
  for (const item of items) {
    try {
      const expectedHash = String(item?.hash || '').toLowerCase();
      const expectedSize = Number(item?.size || 0);
      if (!/^[a-f0-9]{64}$/.test(expectedHash) || expectedSize <= 0) throw new Error('Empreinte de doublon invalide.');
      const [target, keep] = await Promise.all([
        existingMediaPath(item.root, item.path),
        existingMediaPath(item.keepRoot, item.keepPath)
      ]);
      if (!target.clean || !keep.clean || target.absolute === keep.absolute) throw new Error('Sélection de doublon invalide.');
      const [targetInfo, keepInfo] = await Promise.all([lstat(target.absolute), lstat(keep.absolute)]);
      if (!targetInfo.isFile() || !keepInfo.isFile() || Number(targetInfo.size) !== expectedSize || Number(keepInfo.size) !== expectedSize) {
        throw new Error('Un fichier a changé depuis l’analyse.');
      }
      if (Number(targetInfo.dev) === Number(keepInfo.dev) && Number(targetInfo.ino) === Number(keepInfo.ino)) {
        throw new Error('Ces chemins sont déjà des liens vers le même fichier physique.');
      }
      const [targetHash, keepHash] = await Promise.all([sha256MediaFile(target.absolute), sha256MediaFile(keep.absolute)]);
      if (targetHash !== expectedHash || keepHash !== expectedHash) throw new Error('Le contenu ne correspond plus au doublon analysé.');
      await unlink(target.absolute);
      removed += 1;
      bytes += expectedSize;
    } catch (error) {
      errors.push({ path: String(item?.path || ''), message: error?.message || 'Suppression impossible.' });
    }
  }
  return {
    ok: errors.length === 0,
    removed,
    bytes,
    errors: errors.slice(0, 50),
    message: `${removed} doublon${removed > 1 ? 's' : ''} supprimé${removed > 1 ? 's' : ''} après revérification.`
  };
}

function normalizedAbsolutePath(value) {
  const absolute = resolve(String(value || ''));
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function configuredTrashRoot() {
  return mediaRoots.find(root => root.id === 'trash' || normalizedIdentifier(root.label) === 'trash') || null;
}

function qbitPathIsInTrash(value) {
  const trash = configuredTrashRoot();
  if (!trash || !value) return false;
  const rootPath = normalizedAbsolutePath(trash.path);
  const candidatePath = normalizedAbsolutePath(value);
  return pathIsInside(rootPath, candidatePath);
}

function qbitTorrentWasCompleted(torrent) {
  const size = Number(torrent?.size || 0);
  const downloaded = Number(torrent?.downloaded || 0);
  return Boolean(torrent?.completed || Number(torrent?.completionOn || 0) > 0 || (size > 0 && downloaded >= size * .98));
}

function qbitTorrentNeedsRelink(torrent) {
  const safeToInspect = qbitTorrentWasCompleted(torrent) || !torrent.active;
  return Number(torrent?.size || 0) > 0 && safeToInspect && (
    torrent.errored
    || qbitPathIsInTrash(torrent.savePath)
    || qbitPathIsInTrash(torrent.contentPath)
    || (!torrent.completed && !torrent.active)
  );
}

function qbitRelinkSeedRoot() {
  const trash = configuredTrashRoot();
  if (!trash) throw new HttpError(503, 'Le dossier Trash doit être configuré avant la relocalisation.');
  const trashPath = resolve(trash.path);
  const configured = String(process.env.NOCTRA_SEED_ROOT || '').trim();
  const seedRoot = resolve(configured && isAbsolute(configured) ? configured : (configured ? join(dirname(trashPath), configured) : join(dirname(trashPath), '.noctra-seed')));
  if (seedRoot === trashPath || pathIsInside(trashPath, seedRoot)) {
    throw new HttpError(503, 'Le dossier de seed Noctra doit rester en dehors de Trash.');
  }
  if (mediaRoots.some(root => resolve(root.path) === seedRoot)) {
    throw new HttpError(503, 'Le dossier de seed Noctra ne peut pas remplacer une racine de médiathèque.');
  }
  return seedRoot;
}

function newDownloadRelinkJob(overrides = {}) {
  return {
    running: false,
    phase: 'idle',
    total: 0,
    processed: 0,
    relinked: 0,
    verified: 0,
    reseeded: 0,
    verificationFailed: 0,
    verificationPending: 0,
    skipped: 0,
    failed: 0,
    scannedFiles: 0,
    current: '',
    message: '',
    startedAt: null,
    finishedAt: null,
    seedRoot: '',
    results: [],
    ...overrides
  };
}

let downloadRelinkJob = newDownloadRelinkJob();
let relinkVerificationLedger = {};
const relinkVerificationPath = join(runtimeRoot, 'relink-verification.json');

async function persistRelinkVerification() {
  const entries = Object.entries(relinkVerificationLedger).sort((a, b) => Number(b[1].updatedAt || 0) - Number(a[1].updatedAt || 0)).slice(0, 10000);
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(`${relinkVerificationPath}.tmp`, JSON.stringify(Object.fromEntries(entries)), { mode: 0o600 });
  await rename(`${relinkVerificationPath}.tmp`, relinkVerificationPath);
}

async function relinkFingerprint(matching) {
  const inputs = [];
  for (const match of matching.matches) {
    const info = await stat(match.source.path);
    inputs.push([match.file.index, match.file.size, info.dev, info.ino, info.size, info.mtimeMs]);
  }
  inputs.sort((a, b) => a[0] - b[0]);
  return createHash('sha256').update(JSON.stringify([inputs, matching.ignored.map(file => file.index)])).digest('hex');
}

function publicDownloadRelinkJob() {
  return {
    ...downloadRelinkJob,
    results: downloadRelinkJob.results.slice(-80).map(item => ({
      name: item.name,
      status: item.status,
      message: item.message
    }))
  };
}

async function qbitRelinkCandidates() {
  const torrents = await qbitAllTorrents();
  return torrents.filter(qbitTorrentNeedsRelink);
}

function qbitTorrentReadyToReseed(torrent) {
  return torrent.completed
    && !torrent.active
    && !torrent.errored
    && !qbitPathIsInTrash(torrent.savePath)
    && !qbitPathIsInTrash(torrent.contentPath);
}

async function downloadRelinkPreview() {
  const torrents = await qbitAllTorrents();
  const completed = torrents.filter(qbitTorrentWasCompleted);
  const relinkCandidates = torrents.filter(qbitTorrentNeedsRelink);
  const readyToReseed = torrents.filter(qbitTorrentReadyToReseed);
  return {
    total: torrents.length,
    completed: completed.length,
    candidates: relinkCandidates.length + readyToReseed.length,
    relinkCandidates: relinkCandidates.length,
    readyToReseed: readyToReseed.length,
    missing: relinkCandidates.filter(torrent => torrent.errored).length,
    pausedIncomplete: relinkCandidates.filter(torrent => !torrent.completed && !torrent.active).length,
    inTrash: relinkCandidates.filter(torrent => qbitPathIsInTrash(torrent.savePath) || qbitPathIsInTrash(torrent.contentPath)).length,
    seedRoot: qbitRelinkSeedRoot(),
    running: downloadRelinkJob.running
  };
}

async function arrImportHistory(url, apiKey) {
  if (!url || !apiKey) return [];
  const output = [];
  const pageSize = 1000;
  const maxPages = Math.max(1, Math.min(25, Number(process.env.NOCTRA_RELINK_HISTORY_PAGES || 25)));
  for (let page = 1; page <= maxPages; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortKey: 'date',
      sortDirection: 'descending',
      eventType: 'downloadFolderImported'
    });
    const payload = await arr(url, apiKey, `/api/v3/history?${query}`);
    const records = Array.isArray(payload?.records) ? payload.records : [];
    output.push(...records);
    const totalRecords = Number(payload?.totalRecords || output.length);
    if (!records.length || output.length >= totalRecords || records.length < pageSize) break;
  }
  return output;
}

function historyImportedPaths(record) {
  const data = record?.data && typeof record.data === 'object' ? record.data : {};
  const values = [data.importedPath, data.importedPaths, record?.importedPath].flatMap(value => Array.isArray(value) ? value : [value]);
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function historyDownloadIds(record) {
  const data = record?.data && typeof record.data === 'object' ? record.data : {};
  return [...new Set([record?.downloadId, data.downloadId, data.downloadClientId]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)))];
}

async function relinkLibraryRoots() {
  const trash = configuredTrashRoot();
  const output = [];
  const seen = new Set();
  for (const root of mediaRoots) {
    if (root === trash || root.id === 'trash' || normalizedIdentifier(root.label) === 'trash') continue;
    const rootReal = await realpath(root.path).catch(() => null);
    if (!rootReal || seen.has(rootReal)) continue;
    const info = await lstat(rootReal).catch(() => null);
    if (!info?.isDirectory()) continue;
    seen.add(rootReal);
    output.push({ ...root, realPath: rootReal });
  }
  if (!output.length) throw new HttpError(503, 'Aucune médiathèque Radarr/Sonarr accessible pour retrouver les fichiers.');
  return output;
}

async function relinkSourceRoots(libraryRoots, seedRootReal, torrents = []) {
  const output = libraryRoots.map(root => ({ ...root, sourceKind: 'library' }));
  const seen = new Set(output.map(root => root.realPath));
  const seedInfo = await lstat(seedRootReal).catch(() => null);
  if (seedInfo?.isDirectory() && !seen.has(seedRootReal)) {
    output.push({ id: 'noctra-seed', label: 'Seed Noctra', realPath: seedRootReal, sourceKind: 'seed' });
    seen.add(seedRootReal);
  }
  const cookie = await qbitCookie();
  const preferences = await remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/app/preferences`, { headers: { cookie } })
    .then(response => response.json()).catch(() => ({}));
  const mediaParent = await realpath(dirname(configuredTrashRoot().path)).catch(() => '');
  const defaultDownload = await realpath(preferences.save_path || '').catch(() => '');
  const allowed = [mediaParent, defaultDownload, ...libraryRoots.map(root => root.realPath)].filter(Boolean);
  const paths = [preferences.save_path, ...torrents.map(torrent => torrent.savePath), ...String(process.env.QBITTORRENT_SAVE_PATHS || '').split('|')];
  for (const path of paths.filter(Boolean)) {
    const source = await realpath(path).catch(() => '');
    if (!source || source === resolve('/') || source === resolve(process.env.HOME || '.') || seen.has(source) || qbitPathIsInTrash(source)) continue;
    if (!allowed.some(root => source === root || pathIsInside(root, source))) continue;
    const info = await lstat(source).catch(() => null);
    if (!info?.isDirectory()) continue;
    seen.add(source);
    output.push({ id: 'existing-downloads', label: 'Fichiers existants', realPath: source, sourceKind: 'download' });
  }
  return output;
}

function pathIsInRelinkLibraries(roots, candidatePath) {
  const normalizedCandidate = normalizedAbsolutePath(candidatePath);
  return roots.some(root => pathIsInside(normalizedAbsolutePath(root.realPath), normalizedCandidate));
}

async function relinkHistoryIndex(roots) {
  const histories = await Promise.all([
    arrImportHistory(process.env.RADARR_URL, process.env.RADARR_API_KEY).catch(() => []),
    arrImportHistory(process.env.SONARR_URL, process.env.SONARR_API_KEY).catch(() => [])
  ]);
  const entries = histories.flat().flatMap(record => {
    const ids = historyDownloadIds(record);
    const paths = historyImportedPaths(record);
    return ids.flatMap(hash => paths.map(path => ({ hash, path })));
  });
  const inspected = await mapWithConcurrency(entries, 16, async entry => {
    const sourceReal = await realpath(entry.path).catch(() => null);
    if (!sourceReal || qbitPathIsInTrash(sourceReal) || !pathIsInRelinkLibraries(roots, sourceReal)) return null;
    const info = await lstat(sourceReal).catch(() => null);
    if (!info?.isFile()) return null;
    return { hash: entry.hash, path: sourceReal, size: Number(info.size || 0), history: true };
  });
  const byHash = new Map();
  const seen = new Set();
  for (const entry of inspected.filter(Boolean)) {
    const key = `${entry.hash}|${entry.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byHash.has(entry.hash)) byHash.set(entry.hash, []);
    byHash.get(entry.hash).push(entry);
  }
  return byHash;
}

async function scanRelinkLibraries(roots, targetSizes) {
  const bySize = new Map();
  const physicalFiles = new Map();
  const visited = new Set();
  const stack = roots.map(root => root.realPath);
  const scanLimit = Math.max(1000, Math.min(250000, Number(process.env.NOCTRA_RELINK_SCAN_LIMIT || 100000)));
  let scanned = 0;
  while (stack.length && scanned < scanLimit) {
    const directory = stack.pop();
    if (!directory || visited.has(directory)) continue;
    visited.add(directory);
    const children = await readdir(directory, { withFileTypes: true }).catch(() => { downloadRelinkJob.scanWarnings = (downloadRelinkJob.scanWarnings || 0) + 1; return []; });
    const inspected = await mapWithConcurrency(children, 8, async child => {
      if (child.name.startsWith('.')) return null;
      let absolute = join(directory, child.name);
      if (qbitPathIsInTrash(absolute)) return null;
      if (child.isSymbolicLink()) {
        absolute = await realpath(absolute).catch(() => '');
        if (!absolute || qbitPathIsInTrash(absolute) || !pathIsInRelinkLibraries(roots, absolute)) return null;
      }
      if (child.isDirectory()) return { directory: absolute };
      if (!child.isFile() && !child.isSymbolicLink()) return null;
      const info = await lstat(absolute).catch(() => null);
      if (info?.isDirectory()) return { directory: absolute };
      return info?.isFile() ? {
        path: absolute,
        size: Number(info.size || 0),
        physicalKey: `${info.dev || 0}:${info.ino || absolute}`
      } : null;
    });
    for (const item of inspected.filter(Boolean)) {
      if (item.directory) {
        stack.push(item.directory);
        continue;
      }
      scanned += 1;
      if (!targetSizes.has(item.size)) continue;
      const previous = physicalFiles.get(item.physicalKey);
      if (previous) {
        if (previous.aliases.length < 12) previous.aliases.push(item.path);
        continue;
      }
      item.aliases = [];
      physicalFiles.set(item.physicalKey, item);
      if (!bySize.has(item.size)) bySize.set(item.size, []);
      bySize.get(item.size).push(item);
    }
    downloadRelinkJob.scannedFiles = scanned;
    downloadRelinkJob.message = `${scanned.toLocaleString('fr-FR')} fichiers de médiathèque analysés`;
  }
  downloadRelinkJob.scanLimited = Boolean(stack.length);
  return bySize;
}

async function prepareRelinkTarget(seedRootReal, torrentHash, match, sourceRoots) {
  const relativeFile = safeRelativeMediaPath(match.file.name);
  if (!relativeFile) throw new Error('Nom de fichier torrent vide.');
  const torrentRoot = join(seedRootReal, String(torrentHash).toLowerCase());
  await mkdir(torrentRoot, { recursive: true });
  const torrentRootReal = await realpath(torrentRoot);
  if (!pathIsInside(seedRootReal, torrentRootReal)) throw new Error('Destination de seed invalide.');
  const target = join(torrentRootReal, relativeFile);
  if (!pathIsInside(torrentRootReal, target)) throw new Error('Chemin torrent hors du dossier de seed.');
  await mkdir(dirname(target), { recursive: true });
  const targetParentReal = await realpath(dirname(target));
  if (!pathIsInside(torrentRootReal, targetParentReal)) throw new Error('Dossier de destination invalide.');

  const sourceReal = await realpath(match.source.path);
  if (qbitPathIsInTrash(sourceReal) || !pathIsInRelinkLibraries(sourceRoots, sourceReal)) throw new Error('Le fichier source n’appartient plus à une source de seed autorisée.');
  const sourceInfo = await lstat(sourceReal);
  if (!sourceInfo.isFile() || Number(sourceInfo.size) !== Number(match.file.size)) throw new Error('Le fichier source a changé depuis son analyse.');

  const existing = await lstat(target).catch(() => null);
  if (existing?.isSymbolicLink() && await realpath(target).catch(() => '') === sourceReal) {
    return { torrentRoot: torrentRootReal, reused: true };
  }
  if (existing?.isFile()
    && Number(existing.size) === Number(match.file.size)
    && Number(existing.dev) === Number(sourceInfo.dev)
    && Number(existing.ino) === Number(sourceInfo.ino)) {
    return { torrentRoot: torrentRootReal, reused: true };
  }
  if (existing?.isDirectory()) throw new Error('Un dossier occupe le chemin attendu par qBittorrent.');
  if (existing) throw new Error('Un fichier existe deja a cette destination. Il est conserve sans remplacement.');
  try {
    await link(sourceReal, target);
  } catch (error) {
    if (!['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) throw error;
    await symlink(sourceReal, target, 'file');
  }
  return { torrentRoot: torrentRootReal, reused: false };
}

function relinkBatches(items, size = 40) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function qbitTorrentIsChecking(torrent) {
  return /checking/i.test(String(torrent?.state || ''));
}

async function verifyRelinkedTorrents(hashes) {
  const batches = relinkBatches(hashes, 2);
  const totals = { verified: downloadRelinkJob.verified, failed: downloadRelinkJob.verificationFailed };
  const verified = [];
  const invalid = [];
  const pendingAtTimeout = [];
  const timeoutMs = Math.max(60_000, Math.min(30 * 60_000, Number(process.env.NOCTRA_RELINK_VERIFY_TIMEOUT_MS || 12 * 60_000)));
  for (const batch of batches) {
    const pending = new Map(batch.map(hash => [hash, { seenChecking: false }]));
    const startedAt = Date.now();
    await qbitAction(batch.join('|'), 'pause');
    await qbitMaintenanceAction(batch.join('|'), 'recheck');
    while (pending.size && Date.now() - startedAt < timeoutMs) {
      await delay(1500);
      const current = new Map((await qbitAllTorrents('', [...pending.keys()].join('|'))).map(torrent => [String(torrent.hash || '').toLowerCase(), torrent]));
      for (const [hash, state] of pending) {
        const torrent = current.get(String(hash).toLowerCase());
        if (!torrent) {
          invalid.push(hash);
          pending.delete(hash);
          continue;
        }
        if (qbitTorrentIsChecking(torrent)) {
          state.seenChecking = true;
          continue;
        }
        const verificationHadTime = state.seenChecking || Date.now() - startedAt >= 3_000;
        if (!verificationHadTime) continue;
        const result = downloadRelinkJob.results.find(item => item.hash === hash);
        if (torrent.completed && !torrent.errored) {
          verified.push(hash);
          await qbitAction(hash, 'resume');
          downloadRelinkJob.reseeded += 1;
          if (result) { result.status = 'verified'; result.message = 'Vérifié à 100 % et remis en partage.'; }
          relinkVerificationLedger[hash] = { ...relinkVerificationLedger[hash], status: 'verified', updatedAt: Date.now() };
        } else {
          invalid.push(hash);
          await qbitAction(hash, 'pause');
          const percent = Math.floor(Number(torrent.progress || 0) * 10000) / 100;
          const message = `Vérification à ${percent} % : pièces absentes ou différentes${percent > 99 ? ', parfois à la jonction avec une annexe manquante' : ''}. Conservé arrêté.`;
          if (result) { result.status = 'unverified'; result.message = message; }
          relinkVerificationLedger[hash] = { ...relinkVerificationLedger[hash], status: 'invalid', message, updatedAt: Date.now() };
        }
        await persistRelinkVerification();
        pending.delete(hash);
      }
      downloadRelinkJob.verified = totals.verified + verified.length;
      downloadRelinkJob.verificationFailed = totals.failed + invalid.length;
      downloadRelinkJob.verificationPending = pending.size + batches.slice(batches.indexOf(batch) + 1).flat().length;
      downloadRelinkJob.message = `${downloadRelinkJob.verified} vérifié${downloadRelinkJob.verified > 1 ? 's' : ''}, ${downloadRelinkJob.verificationPending} en attente`;
    }
    pendingAtTimeout.push(...pending.keys());
    const unsafe = [...invalid.filter(hash => batch.includes(hash)), ...pending.keys()];
    if (unsafe.length) await qbitAction(unsafe.join('|'), 'pause').catch(() => {});
    for (const hash of pending.keys()) {
      relinkVerificationLedger[hash] = { ...relinkVerificationLedger[hash], status: 'pending', updatedAt: Date.now() };
      const result = downloadRelinkJob.results.find(item => item.hash === hash);
      if (result) { result.status = 'pending'; result.message = 'Vérification encore en attente. Le prochain passage reprendra ce torrent.'; }
    }
    await persistRelinkVerification();
  }
  downloadRelinkJob.verified = totals.verified + verified.length;
  downloadRelinkJob.verificationFailed = totals.failed + invalid.length;
  downloadRelinkJob.verificationPending = pendingAtTimeout.length;
  return { verified, invalid, pending: pendingAtTimeout };
}

async function runDownloadRelinkJob() {
  downloadRelinkJob = newDownloadRelinkJob({
    running: true,
    phase: 'catalog',
    message: 'Lecture de la liste complète qBittorrent…',
    startedAt: new Date().toISOString(),
    seedRoot: qbitRelinkSeedRoot()
  });
  try {
    relinkVerificationLedger = await readFile(relinkVerificationPath, 'utf8').then(JSON.parse).catch(() => ({}));
    if (!relinkVerificationLedger || Array.isArray(relinkVerificationLedger) || typeof relinkVerificationLedger !== 'object') relinkVerificationLedger = {};
    const allTorrents = await qbitAllTorrents();
    const candidates = allTorrents.filter(qbitTorrentNeedsRelink);
    const readyToReseed = allTorrents.filter(qbitTorrentReadyToReseed);
    downloadRelinkJob.total = candidates.length + readyToReseed.length;
    if (!candidates.length && !readyToReseed.length) {
      downloadRelinkJob = { ...downloadRelinkJob, running: false, phase: 'complete', message: 'Aucun torrent à relocaliser ou à remettre en partage.', finishedAt: new Date().toISOString() };
      return;
    }

    downloadRelinkJob.phase = 'torrents';
    downloadRelinkJob.message = 'Lecture des fichiers attendus par qBittorrent…';
    const cookie = await qbitCookie();
    const bundles = await mapWithConcurrency(candidates, 6, async torrent => {
      try {
        return { torrent, files: await qbitTorrentFiles(torrent.hash, cookie) };
      } catch (error) {
        return { torrent, files: [], error: error?.message || 'Liste des fichiers inaccessible.' };
      }
    });
    const targetSizes = new Set(bundles.flatMap(bundle => bundle.files)
      .filter(file => Number(file.size || 0) > 0)
      .map(file => Number(file.size)));

    downloadRelinkJob.phase = 'history';
    downloadRelinkJob.message = 'Croisement avec les imports Radarr et Sonarr…';
    const libraryRoots = await relinkLibraryRoots();
    await mkdir(downloadRelinkJob.seedRoot, { recursive: true });
    const seedRootReal = await realpath(downloadRelinkJob.seedRoot);
    const sourceRoots = await relinkSourceRoots(libraryRoots, seedRootReal, allTorrents);
    const historyByHash = await relinkHistoryIndex(sourceRoots);
    downloadRelinkJob.phase = 'scan';
    downloadRelinkJob.message = 'Indexation des médiathèques et des seeds existants sans modifier les fichiers…';
    const libraryBySize = await scanRelinkLibraries(sourceRoots, targetSizes);
    const relinkedHashes = [];
    downloadRelinkJob.phase = 'relink';
    for (const bundle of bundles) {
      const { torrent, files, error } = bundle;
      downloadRelinkJob.current = torrent.name;
      try {
        if (error) throw new Error(error);
        const matching = matchTorrentMediaFiles(files, historyByHash.get(String(torrent.hash).toLowerCase()) || [], libraryBySize);
        if (matching.matches.length || matching.unmatched.some(file => libraryBySize.has(Number(file.size)))) {
          const proofHeaders = { cookie: await qbitCookie() };
          const proof = await Promise.all([
            remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/torrents/properties?hash=${encodeURIComponent(torrent.hash)}`, { headers: proofHeaders }).then(response => response.json()),
            remote(`${withoutSlash(process.env.QBITTORRENT_URL)}/api/v2/torrents/pieceHashes?hash=${encodeURIComponent(torrent.hash)}`, { headers: proofHeaders }).then(response => response.json())
          ]).catch(() => null);
          if (proof) await recoverRelinkByPieces(matching, files, libraryBySize, { pieceSize: Number(proof[0]?.piece_size), hashes: proof[1], validateMatched: true });
        }
        if (!matching.wanted.length) {
          downloadRelinkJob.skipped += 1;
          downloadRelinkJob.results.push({ name: torrent.name, status: 'skipped', message: 'Aucun fichier sélectionné dans ce torrent.' });
        } else if (matching.unmatched.length) {
          downloadRelinkJob.skipped += 1;
          downloadRelinkJob.results.push({
            name: torrent.name,
            status: 'skipped',
            message: describeUnmatchedFiles(matching, libraryBySize)
          });
        } else {
          const fingerprint = await relinkFingerprint(matching);
          const previous = relinkVerificationLedger[torrent.hash];
          if (previous?.status === 'invalid' && previous.fingerprint === fingerprint) {
            downloadRelinkJob.skipped += 1;
            downloadRelinkJob.results.push({ name: torrent.name, status: 'unverified', message: previous.message || 'Fichiers inchangés depuis la vérification incomplète. Conservé arrêté.' });
            continue;
          }
          await qbitAction(torrent.hash, 'pause');
          if (matching.ignored.length) {
            await qbitSetFilePriorities(torrent.hash, matching.ignored.map(file => file.index), 0);
          }
          let torrentRoot = '';
          for (const match of matching.matches) {
            const prepared = await prepareRelinkTarget(seedRootReal, torrent.hash, match, sourceRoots);
            torrentRoot = prepared.torrentRoot;
          }
          await qbitSetLocation(torrent.hash, torrentRoot);
          relinkVerificationLedger[torrent.hash] = { fingerprint, status: 'pending', updatedAt: Date.now() };
          relinkedHashes.push(torrent.hash);
          downloadRelinkJob.relinked += 1;
          downloadRelinkJob.results.push({ hash: torrent.hash, name: torrent.name, status: 'relinked', message: `${matching.matches.length} média${matching.matches.length > 1 ? 's' : ''} rattaché${matching.matches.length > 1 ? 's' : ''}${matching.ignored.length ? `, ${matching.ignored.length} annexe${matching.ignored.length > 1 ? 's' : ''} absente${matching.ignored.length > 1 ? 's' : ''} ignorée${matching.ignored.length > 1 ? 's' : ''}` : ''}.` });
        }
      } catch (error) {
        downloadRelinkJob.failed += 1;
        downloadRelinkJob.results.push({ name: torrent.name, status: 'failed', message: error?.message || 'Relocalisation impossible.' });
        // Un torrent non rattaché doit rester arrêté. Le reprendre ici pouvait
        // redémarrer un ancien téléchargement dont le tracker n'existe plus.
        await qbitAction(torrent.hash, 'pause').catch(() => {});
      } finally { downloadRelinkJob.processed += 1; }
      if (downloadRelinkJob.processed % 20 === 0) await persistRelinkVerification();
      downloadRelinkJob.message = `${downloadRelinkJob.processed}/${downloadRelinkJob.total} torrents traités`;
    }

    downloadRelinkJob.phase = 'verify';
    await persistRelinkVerification();
    downloadRelinkJob.current = '';
    downloadRelinkJob.verificationPending = relinkedHashes.length;
    downloadRelinkJob.message = 'Revérification sans téléchargement ; seuls les torrents confirmés à 100 % seront remis en partage…';
    await verifyRelinkedTorrents(relinkedHashes);
    const readyNow = new Map((await qbitAllTorrents()).map(torrent => [torrent.hash, torrent]));
    const stillReadyToReseed = readyToReseed.filter(torrent => qbitTorrentReadyToReseed(readyNow.get(torrent.hash) || {}));
    if (stillReadyToReseed.length) {
      downloadRelinkJob.phase = 'reseed';
      downloadRelinkJob.message = `Vérification de ${stillReadyToReseed.length} torrent${stillReadyToReseed.length > 1 ? 's' : ''} arrêté${stillReadyToReseed.length > 1 ? 's' : ''} avant remise en partage…`;
      await verifyRelinkedTorrents(stillReadyToReseed.map(torrent => torrent.hash));
    }
    downloadRelinkJob.processed += readyToReseed.length;
    downloadRelinkJob = {
      ...downloadRelinkJob,
      running: false,
      phase: 'complete',
      current: '',
      message: `${downloadRelinkJob.relinked} relocalisé${downloadRelinkJob.relinked > 1 ? 's' : ''}, ${downloadRelinkJob.reseeded} remis en partage après vérification, ${downloadRelinkJob.skipped} ignoré${downloadRelinkJob.skipped > 1 ? 's' : ''}.`,
      finishedAt: new Date().toISOString()
    };
  } catch (error) {
    downloadRelinkJob = {
      ...downloadRelinkJob,
      running: false,
      phase: 'failed',
      current: '',
      message: error?.message || 'La relocalisation globale a échoué.',
      finishedAt: new Date().toISOString()
    };
  }
}

function startDownloadRelinkJob() {
  if (downloadRelinkJob.running) throw new HttpError(409, 'Une relocalisation est déjà en cours.');
  void runDownloadRelinkJob();
  return publicDownloadRelinkJob();
}

const discoveryCache = new Map();
const discoveryCacheTtl = 10 * 60_000;
const discoveryRegion = String(process.env.DISCOVERY_REGION || 'FR').toUpperCase();
const discoveryLanguage = String(process.env.DISCOVERY_LANGUAGE || 'fr-FR');

function tmdbConfigured() {
  return Boolean(process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY);
}

function seerrDiscoveryConfigured() {
  return Boolean(process.env.JELLYSEERR_URL && process.env.JELLYSEERR_API_KEY);
}

function discoveryMetadataConfigured() {
  return tmdbConfigured() || seerrDiscoveryConfigured();
}

const discoverySeerrLanguage = String(discoveryLanguage || 'fr-FR').split('-')[0] || 'fr';
const discoverySeedCache = new Map();
const discoveryStatusCache = new Map();
const requestMetadataCache = new Map();
const discoveryCatalogCache = new Map();
const tasteProfileInFlight = new Map();
let seerrTrendCache = { expiresAt: 0, value: [] };

function normalizedDiscoveryMode(value) {
  return ['precise', 'balanced', 'explore'].includes(String(value || '').toLowerCase())
    ? String(value).toLowerCase()
    : 'balanced';
}

async function tmdb(pathname, parameters = {}) {
  if (!tmdbConfigured()) throw new HttpError(503, 'Ajoute TMDB_API_KEY ou TMDB_BEARER_TOKEN dans le fichier .env pour activer toutes les découvertes.');
  const url = new URL(`https://api.themoviedb.org/3${pathname}`);
  Object.entries({ language: discoveryLanguage, ...parameters }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  if (!process.env.TMDB_BEARER_TOKEN) url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      ...(process.env.TMDB_BEARER_TOKEN ? { authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}` } : {})
    },
    signal: AbortSignal.timeout(5_500)
  });
  if (!response.ok) throw new HttpError(response.status === 401 ? 503 : response.status, `TMDB indisponible (${response.status}).`);
  return response.json();
}

function discoveryDate(item) {
  return item.release_date || item.releaseDate || item.first_air_date || item.firstAirDate || '';
}

function discoveryScore(item, source) {
  const date = discoveryDate(item);
  const timestamp = Date.parse(date || '') || Date.now() - 365 * 86_400_000;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  const recency = Math.max(0, 34 - Math.min(34, ageDays / 5));
  const rating = Math.max(0, Number(item.vote_average ?? item.voteAverage ?? 0)) * 4.5;
  const popularity = Math.min(34, Math.log1p(Math.max(0, Number(item.popularity || 0))) * 6.5);
  const sourceBoost = source === 'recommended' ? 17
    : source === 'similar' ? 13
      : source === 'seerr-day' ? 12
        : source === 'seerr-week' ? 8
          : source === 'cinema' ? 10
            : source === 'upcoming' ? 9
              : source === 'streaming' ? 8
                : source === 'series' ? 7
                  : source === 'anime' ? 10
                    : source === 'animation' ? 9
                      : source === 'classics' ? 11
                        : source === 'genre' ? 8
                  : String(source || '').startsWith('annual-') ? 11
                : source === 'quality' ? 9
                  : 5;
  return Math.round(recency + rating + popularity + sourceBoost);
}

function normalizedDiscoveryItem(item, forcedType, source) {
  const mediaType = forcedType || item.media_type;
  if (!['movie', 'tv'].includes(mediaType) || !item?.id) return null;
  const score = discoveryScore(item, source);
  const date = discoveryDate(item);
  return {
    id: item.id,
    mediaType,
    title: item.title || item.name || 'Sans titre',
    name: item.name || item.title || 'Sans titre',
    releaseDate: mediaType === 'movie' ? date : undefined,
    firstAirDate: mediaType === 'tv' ? date : undefined,
    posterPath: item.poster_path || item.posterPath || null,
    backdropPath: item.backdrop_path || item.backdropPath || null,
    overview: item.overview || '',
    voteAverage: Number(item.vote_average || item.voteAverage || 0),
    voteCount: Number(item.vote_count || item.voteCount || 0),
    popularity: Number(item.popularity || 0),
    originalLanguage: item.original_language || item.originalLanguage || '',
    genreIds: (Array.isArray(item.genre_ids) ? item.genre_ids : Array.isArray(item.genreIds) ? item.genreIds : []).map(Number).filter(Number.isInteger),
    score,
    source,
    reason: source === 'cinema'
      ? 'Sortie cinéma récente'
      : source === 'annual-cinema'
        ? `Meilleure sortie cinéma ${new Date().getFullYear()}`
        : source === 'annual-movie-streaming'
          ? `Film streaming tendance ${new Date().getFullYear()}`
          : source === 'annual-tv'
            ? `Série TV tendance ${new Date().getFullYear()}`
            : source === 'annual-tv-streaming'
              ? `Série streaming tendance ${new Date().getFullYear()}`
      : source === 'upcoming'
        ? 'Prochaine sortie cinéma'
        : source === 'streaming'
        ? 'Disponible sur une plateforme en France'
          : source === 'series'
          ? 'Nouvel épisode ou nouvelle série en diffusion'
          : source === 'anime'
            ? 'Anime populaire et bien noté'
            : source === 'animation'
              ? 'Film d’animation recommandé'
              : source === 'classics'
                ? 'Grand classique à redécouvrir'
                : source === 'genre'
                  ? 'Sélection par genre'
          : source === 'recommended'
            ? 'Recommandation proche de tes contenus préférés'
            : source === 'similar'
              ? 'Très proche d’un titre que tu apprécies'
              : source === 'seerr-day'
                ? 'Monte fortement aujourd’hui'
                : source === 'seerr-week'
                  ? 'Tendance forte cette semaine'
                  : source === 'quality'
                    ? 'Pépite très bien notée avec suffisamment de votes'
                    : 'Très tendance actuellement'
  };
}

function jellyseerrAvailabilityState(detail = {}) {
  const mediaInfo = detail.mediaInfo || null;
  const status = Number(mediaInfo?.status || 1);
  const requests = Array.isArray(detail.requests)
    ? detail.requests
    : Array.isArray(mediaInfo?.requests)
      ? mediaInfo.requests
      : [];
  const latestRequest = [...requests].sort((left, right) => Number(right.id || 0) - Number(left.id || 0))[0] || null;
  if (status === 5) return { key: 'present', label: 'Déjà présent', disabled: true, status, requestId: latestRequest?.id || null };
  if (status === 4) return { key: 'partial', label: 'Partiellement présent', disabled: true, status, requestId: latestRequest?.id || null };
  if (status === 3) return { key: 'downloading', label: 'Téléchargement en cours', disabled: true, status, requestId: latestRequest?.id || null };
  if (status === 2 || latestRequest) {
    const requestStatus = Number(latestRequest?.status || 0);
    const label = requestStatus === 1 ? 'Demande en attente' : requestStatus === 3 ? 'Demande refusée' : 'Déjà demandé';
    return { key: requestStatus === 1 ? 'pending' : 'requested', label, disabled: requestStatus !== 3, status, requestId: latestRequest?.id || null };
  }
  return { key: 'requestable', label: 'Ajouter à Noctra', disabled: false, status, requestId: null };
}

function torrentAwareRequestState(requestState, availability) {
  if (availability?.configured === false || availability?.status === 'error') return requestState;
  const preferredCount = Math.max(0, Number(availability?.preferredCount ?? availability?.count ?? 0));
  if (preferredCount > 0 || ['present', 'partial'].includes(String(requestState?.key || ''))) return requestState;
  if (requestState?.disabled === false) {
    return {
      ...requestState,
      key: 'upcoming_requestable',
      label: 'Ajouter quand même',
      disabled: false
    };
  }
  return {
    ...requestState,
    key: 'upcoming',
    label: 'Bientôt disponible',
    disabled: true
  };
}

async function discoveryStatusFor(item) {
  const mediaType = item?.mediaType === 'tv' ? 'tv' : 'movie';
  const id = positiveInteger(item?.id);
  if (!id) return { ...item, requestState: jellyseerrAvailabilityState(), legalPlatforms: [] };
  const key = `${mediaType}:${id}`;
  const cached = discoveryStatusCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...item, ...cached.value };

  const [detail, legalPlatforms] = await Promise.all([
    process.env.JELLYSEERR_URL && process.env.JELLYSEERR_API_KEY
      ? jellyseerr(`/api/v1/${mediaType}/${id}`, { timeoutMs: 5_000 }).catch(() => null)
      : Promise.resolve(null),
    tmdbLegalPlatforms(mediaType, id).catch(() => [])
  ]);
  const value = {
    mediaInfo: detail?.mediaInfo || null,
    requestState: jellyseerrAvailabilityState(detail || {}),
    resolvedServiceId: detail?.mediaInfo?.externalServiceId || null,
    legalPlatforms: Array.isArray(legalPlatforms) ? legalPlatforms : []
  };
  discoveryStatusCache.set(key, { expiresAt: Date.now() + 2 * 60_000, value });
  return { ...item, ...value };
}

async function enrichDiscoveryStatuses(items) {
  return mapWithConcurrency(items, 8, discoveryStatusFor);
}


async function requestMetadataDetail(mediaType, tmdbId) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const id = positiveInteger(tmdbId);
  if (!id) return null;
  const key = `${type}:${id}`;
  const cached = requestMetadataCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await jellyseerr(`/api/v1/${type}/${id}`, { timeoutMs: 4_000 }).catch(() => null);
  requestMetadataCache.set(key, { expiresAt: Date.now() + (value ? 6 * 60 * 60_000 : 30_000), value });
  return value;
}


function seriesRequestPolicy(detail = {}) {
  const status = String(detail?.status || detail?.mediaInfo?.status || '').trim();
  const normalized = status.toLocaleLowerCase('en');
  const ongoingStates = new Set(['returning series', 'in production', 'planned', 'pilot']);
  const completedStates = new Set(['ended', 'canceled', 'cancelled']);
  const forceAutomatic = ongoingStates.has(normalized);
  return {
    status: status || null,
    forceAutomatic,
    completed: completedStates.has(normalized),
    reason: forceAutomatic
      ? 'Cette série est encore en cours : Sonarr reste en automatique pour récupérer les épisodes manquants et futurs.'
      : completedStates.has(normalized)
        ? 'Cette série est terminée : tu peux laisser Sonarr choisir ou passer en sélection manuelle.'
        : 'État de la série non bloquant : le choix automatique ou manuel reste disponible.'
  };
}



async function seriesRequestPolicyFor(tmdbId) {
  const id = positiveInteger(tmdbId);
  if (!id) return seriesRequestPolicy();
  const seerrDetail = await requestMetadataDetail('tv', id).catch(() => null);
  const fromSeerr = seriesRequestPolicy(seerrDetail || {});
  if (fromSeerr.status || !discoveryMetadataConfigured()) return fromSeerr;
  const tmdbDetail = await tmdb(`/tv/${id}`).catch(() => null);
  return seriesRequestPolicy(tmdbDetail || {});
}

function noctraDetailCertification(type, detail = {}) {
  const preferredRegions = [...new Set([discoveryRegion, 'FR', 'US'].filter(Boolean))];
  if (type === 'tv') {
    const rows = Array.isArray(detail?.content_ratings?.results) ? detail.content_ratings.results : [];
    for (const region of preferredRegions) {
      const hit = rows.find(item => String(item?.iso_3166_1 || '').toUpperCase() === region && String(item?.rating || '').trim());
      if (hit) return String(hit.rating).trim();
    }
    return String(rows.find(item => String(item?.rating || '').trim())?.rating || '').trim();
  }

  const groups = Array.isArray(detail?.release_dates?.results) ? detail.release_dates.results : [];
  for (const region of preferredRegions) {
    const group = groups.find(item => String(item?.iso_3166_1 || '').toUpperCase() === region);
    const releases = Array.isArray(group?.release_dates) ? group.release_dates : [];
    const theatrical = releases.find(item => Number(item?.type) === 3 && String(item?.certification || '').trim());
    const any = theatrical || releases.find(item => String(item?.certification || '').trim());
    if (any) return String(any.certification).trim();
  }
  for (const group of groups) {
    const hit = (Array.isArray(group?.release_dates) ? group.release_dates : []).find(item => String(item?.certification || '').trim());
    if (hit) return String(hit.certification).trim();
  }
  return '';
}

function noctraDetailTrailer(detail = {}) {
  const videos = Array.isArray(detail?.videos?.results) ? detail.videos.results : [];
  const candidates = videos.filter(item => String(item?.site || '').toLowerCase() === 'youtube' && String(item?.key || '').trim());
  if (!candidates.length) return null;
  const languageRank = value => {
    const lang = String(value?.iso_639_1 || '').toLowerCase();
    if (lang === 'fr') return 0;
    if (lang === 'en') return 1;
    return 2;
  };
  candidates.sort((left, right) => {
    const official = Number(Boolean(right?.official)) - Number(Boolean(left?.official));
    if (official) return official;
    const trailer = Number(String(right?.type || '').toLowerCase() === 'trailer') - Number(String(left?.type || '').toLowerCase() === 'trailer');
    if (trailer) return trailer;
    const language = languageRank(left) - languageRank(right);
    if (language) return language;
    return Number(right?.size || 0) - Number(left?.size || 0);
  });
  const video = candidates[0];
  return {
    name: String(video?.name || 'Bande-annonce'),
    key: String(video?.key || ''),
    site: 'YouTube',
    type: String(video?.type || ''),
    official: Boolean(video?.official)
  };
}

function noctraEpisodeSummary(episode = null) {
  if (!episode || typeof episode !== 'object') return null;
  return {
    id: positiveInteger(episode.id) || null,
    name: String(episode.name || ''),
    overview: String(episode.overview || ''),
    airDate: episode.air_date || episode.airDate || null,
    seasonNumber: Number.isFinite(Number(episode.season_number)) ? Number(episode.season_number) : null,
    episodeNumber: Number.isFinite(Number(episode.episode_number)) ? Number(episode.episode_number) : null,
    runtime: Number(episode.runtime || 0) || null,
    stillPath: episode.still_path || null,
    voteAverage: Number(episode.vote_average || 0) || null
  };
}

async function noctraMediaDetail(mediaType, tmdbId, fallbackTitle = '', fallbackYear = '', forceTrackers = false) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const id = positiveInteger(tmdbId);
  if (!id) throw new HttpError(400, 'Identifiant TMDB invalide.');

  const appendToResponse = type === 'tv'
    ? 'credits,videos,content_ratings,keywords,external_ids'
    : 'credits,videos,release_dates,keywords,external_ids';
  const trackerFailure = error => ({
    configured: true,
    status: 'error',
    count: 0,
    preferredCount: 0,
    alternateCount: 0,
    alternateLanguages: [],
    trackers: [],
    releases: [],
    message: cleanError(error)
  });
  const fallbackAvailabilityTitle = String(fallbackTitle || '').trim();
  // Resolve the release identity by TMDB id, including original titles and rereleases.
  const earlyAvailability = fallbackAvailabilityTitle
    ? prowlarrAvailability(type, fallbackAvailabilityTitle, fallbackYear, {
        force: Boolean(forceTrackers),
        tmdbId: id,
        limit: 24
      }).catch(trackerFailure)
    : null;
  const [seerrDetail, tmdbDetail, legalPlatforms] = await Promise.all([
    requestMetadataDetail(type, id).catch(() => null),
    discoveryMetadataConfigured()
      ? tmdb(`/${type}/${id}`, { append_to_response: appendToResponse }).catch(() => null)
      : Promise.resolve(null),
    tmdbLegalPlatforms(type, id).catch(() => [])
  ]);
  const detail = tmdbDetail || seerrDetail || {};
  const title = String(
    detail.title || detail.name || seerrDetail?.title || seerrDetail?.name || fallbackTitle || `TMDB ${id}`
  ).trim();
  const rawDate = detail.release_date || detail.releaseDate || detail.first_air_date || detail.firstAirDate
    || seerrDetail?.releaseDate || seerrDetail?.firstAirDate || '';
  const year = trackerSearchIdentity(title, fallbackYear, seerrDetail || detail).year;
  const credits = detail.credits || {};
  const cast = Array.isArray(credits.cast)
    ? credits.cast.slice(0, 14).map(person => ({
        name: String(person?.name || '').trim(),
        character: String(person?.character || '').trim(),
        profilePath: person?.profile_path || person?.profilePath || null,
        order: Number(person?.order || 0)
      })).filter(person => person.name)
    : [];
  const crew = Array.isArray(credits.crew) ? credits.crew : [];
  const creators = type === 'tv'
    ? (Array.isArray(detail.created_by) ? detail.created_by.map(person => String(person?.name || '')).filter(Boolean) : [])
    : crew.filter(person => person?.job === 'Director').slice(0, 4).map(person => String(person?.name || '')).filter(Boolean);
  const writers = type === 'movie'
    ? crew.filter(person => ['Screenplay', 'Writer', 'Story'].includes(String(person?.job || ''))).slice(0, 5).map(person => String(person?.name || '')).filter(Boolean)
    : [];
  const runtimes = type === 'tv'
    ? [
        ...(Array.isArray(detail.episode_run_time) ? detail.episode_run_time : []),
        detail.last_episode_to_air?.runtime,
        detail.next_episode_to_air?.runtime
      ]
    : [detail.runtime];
  const runtime = Number(runtimes.find(value => Number(value) > 0) || 0);
  const initialRequestState = jellyseerrAvailabilityState(seerrDetail || {});
  const resolvedServiceId = positiveInteger(seerrDetail?.mediaInfo?.externalServiceId) || null;
  const availability = await (earlyAvailability || prowlarrAvailability(type, title, year, {
    force: Boolean(forceTrackers),
    tmdbId: id,
    limit: 24
  }).catch(trackerFailure));
  const requestState = torrentAwareRequestState(initialRequestState, availability);
  const keywordRows = type === 'tv'
    ? (Array.isArray(detail?.keywords?.results) ? detail.keywords.results : [])
    : (Array.isArray(detail?.keywords?.keywords) ? detail.keywords.keywords : []);

  return {
    id,
    mediaType: type,
    title,
    originalTitle: String(detail.original_title || detail.original_name || ''),
    tagline: String(detail.tagline || ''),
    overview: String(detail.overview || seerrDetail?.overview || ''),
    releaseDate: rawDate || null,
    firstAirDate: detail.first_air_date || detail.firstAirDate || (type === 'tv' ? rawDate || null : null),
    lastAirDate: detail.last_air_date || detail.lastAirDate || null,
    year: year || null,
    runtime: runtime || null,
    status: String(detail.status || ''),
    originalLanguage: String(detail.original_language || ''),
    originCountries: (Array.isArray(detail.origin_country) ? detail.origin_country : []).map(value => String(value || '')).filter(Boolean),
    spokenLanguages: (Array.isArray(detail.spoken_languages) ? detail.spoken_languages : []).map(item => String(item?.english_name || item?.name || item?.iso_639_1 || '')).filter(Boolean),
    voteAverage: Number(detail.vote_average || detail.voteAverage || 0),
    voteCount: Number(detail.vote_count || detail.voteCount || 0),
    popularity: Number(detail.popularity || 0),
    genres: (Array.isArray(detail.genres) ? detail.genres : []).map(genre => String(genre?.name || genre || '')).filter(Boolean),
    keywords: keywordRows.slice(0, 12).map(item => String(item?.name || item || '')).filter(Boolean),
    cast,
    creators,
    writers,
    posterPath: detail.poster_path || detail.posterPath || seerrDetail?.posterPath || null,
    backdropPath: detail.backdrop_path || detail.backdropPath || seerrDetail?.backdropPath || null,
    certification: noctraDetailCertification(type, detail),
    trailer: noctraDetailTrailer(detail),
    homepage: String(detail.homepage || ''),
    imdbId: String(detail?.external_ids?.imdb_id || detail.imdb_id || ''),
    productionCompanies: (Array.isArray(detail.production_companies) ? detail.production_companies : []).slice(0, 8).map(item => ({
      name: String(item?.name || '').trim(),
      logoPath: item?.logo_path || null,
      country: String(item?.origin_country || '')
    })).filter(item => item.name),
    productionCountries: (Array.isArray(detail.production_countries) ? detail.production_countries : []).map(item => ({
      code: String(item?.iso_3166_1 || ''),
      name: String(item?.name || item?.iso_3166_1 || '')
    })).filter(item => item.name),
    networks: (Array.isArray(detail.networks) ? detail.networks : []).slice(0, 6).map(item => ({
      name: String(item?.name || '').trim(),
      logoPath: item?.logo_path || null,
      country: String(item?.origin_country || '')
    })).filter(item => item.name),
    collection: String(detail?.belongs_to_collection?.name || ''),
    budget: Number(detail.budget || 0),
    revenue: Number(detail.revenue || 0),
    numberOfSeasons: Number(detail.number_of_seasons || 0) || null,
    numberOfEpisodes: Number(detail.number_of_episodes || 0) || null,
    inProduction: typeof detail.in_production === 'boolean' ? detail.in_production : null,
    nextEpisode: noctraEpisodeSummary(detail.next_episode_to_air),
    lastEpisode: noctraEpisodeSummary(detail.last_episode_to_air),
    legalPlatforms: Array.isArray(legalPlatforms) ? legalPlatforms : [],
    requestState,
    resolvedServiceId,
    availability
  };
}


const tasteProfileCache = new Map();
const tmdbGenreCache = { expiresAt: 0, movie: new Map(), tv: new Map() };
const trackerAvailabilityCache = new Map();
const trackerAvailabilityInFlight = new Map();
const discoveryGrabReleases = new Map();
const interactiveSearches = createInteractiveSearchCache();
let prowlarrIndexerCache = { expiresAt: 0, items: [], fastIds: [] };

async function jellyfinTasteProfile(session) {
  const key = session?.user?.Id || 'default';
  const cached = tasteProfileCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (tasteProfileInFlight.has(key)) return tasteProfileInFlight.get(key);

  const loading = (async () => {
    const pages = await mapWithConcurrency([0, 200, 400, 600], 2, StartIndex => jellyfinItems('/Users/{userId}/Items', {
    Recursive: true,
    IncludeItemTypes: 'Movie,Series',
    Fields: 'Genres,ProviderIds,Studios,OriginalTitle',
    SortBy: 'DateCreated',
    SortOrder: 'Descending',
    StartIndex,
    Limit: 200,
    EnableTotalRecordCount: false,
    EnableUserData: true
  }, session));
  const items = [...new Map(pages.flat().map(item => [item.Id, item])).values()];
  const genres = new Map();
  const studios = new Map();
  const people = new Map();
  const years = new Map();
  const existingTmdb = new Set();
  const existingTvdb = new Set();
  const existingTitles = new Set();
  const seeds = [];
  let movies = 0;
  let series = 0;
  let playedCount = 0;
  let favoriteCount = 0;
  const now = Date.now();
  for (const item of items) {
    const favorite = Boolean(item.UserData?.IsFavorite);
    const played = Boolean(item.UserData?.Played);
    const datePlayed = Date.parse(item.UserData?.LastPlayedDate || item.DatePlayed || '') || 0;
    const recentPlayBoost = datePlayed ? Math.max(0, 2.5 - ((now - datePlayed) / 86_400_000) / 80) : 0;
    const ratingBoost = Math.min(1.6, Number(item.CommunityRating || 0) / 7);
    const weight = 1 + (favorite ? 4.5 : 0) + (played ? 1.8 : 0) + recentPlayBoost + ratingBoost;
    if (favorite) favoriteCount += 1;
    if (played) playedCount += 1;
    (item.Genres || []).forEach(genre => genres.set(genre, (genres.get(genre) || 0) + weight));
    (item.Studios || []).slice(0, 4).forEach(studio => {
      const name = typeof studio === 'string' ? studio : studio?.Name;
      if (name) studios.set(name, (studios.get(name) || 0) + weight * .7);
    });
    (item.People || []).slice(0, 12).forEach(person => {
      const type = normalizedIdentifier(person.Type || person.Role || 'personne');
      const multiplier = /director|realisateur/.test(type) ? 1.15 : /writer|scenariste/.test(type) ? .8 : .55;
      if (person.Name) people.set(person.Name, (people.get(person.Name) || 0) + weight * multiplier);
    });
    if (Number(item.ProductionYear)) years.set(Number(item.ProductionYear), (years.get(Number(item.ProductionYear)) || 0) + weight);
    const providerIds = item.ProviderIds || {};
    const tmdbId = positiveInteger(providerIds.Tmdb);
    const tvdbId = positiveInteger(providerIds.Tvdb);
    if (tmdbId) existingTmdb.add(`${item.Type === 'Series' ? 'tv' : 'movie'}:${tmdbId}`);
    if (tvdbId) existingTvdb.add(tvdbId);
    existingTitles.add(`${normalizedTitle(item.Name || item.OriginalTitle)}:${Number(item.ProductionYear) || ''}`);
    if (item.Type === 'Movie') movies += 1;
    if (item.Type === 'Series') series += 1;
    if (tmdbId && (favorite || played || recentPlayBoost > 0)) {
      seeds.push({
        id: tmdbId,
        mediaType: item.Type === 'Series' ? 'tv' : 'movie',
        title: item.Name || item.OriginalTitle || 'Contenu apprécié',
        weight,
        favorite,
        played,
        datePlayed
      });
    }
  }
  seeds.sort((left, right) => right.weight - left.weight || right.datePlayed - left.datePlayed);
  const value = {
    genres: [...genres.entries()].sort((a, b) => b[1] - a[1]),
    studios: [...studios.entries()].sort((a, b) => b[1] - a[1]),
    people: [...people.entries()].sort((a, b) => b[1] - a[1]),
    years: [...years.entries()].sort((a, b) => b[1] - a[1]),
    seeds: seeds.slice(0, 18),
    existingTmdb,
    existingTvdb,
    existingTitles,
    movies,
    series,
    playedCount,
    favoriteCount,
    sampleSize: items.length
  };
    tasteProfileCache.set(key, { expiresAt: Date.now() + 5 * 60_000, value });
    return value;
  })();
  tasteProfileInFlight.set(key, loading);
  try {
    return await loading;
  } finally {
    tasteProfileInFlight.delete(key);
  }
}

async function tmdbGenreMaps() {
  if (tmdbGenreCache.expiresAt > Date.now()) return tmdbGenreCache;
  let movieRows = [];
  let tvRows = [];
  if (tmdbConfigured()) {
    const [movie, tv] = await Promise.all([
      tmdb('/genre/movie/list'),
      tmdb('/genre/tv/list')
    ]);
    movieRows = movie.genres || [];
    tvRows = tv.genres || [];
  } else if (seerrDiscoveryConfigured()) {
    // Seerr expose déjà les genres TMDB avec sa propre clé serveur. Noctra
    // n'a donc besoin d'aucun TMDB_BEARER_TOKEN supplémentaire.
    const [movie, tv] = await Promise.all([
      jellyseerr(`/api/v1/genres/movie?language=${encodeURIComponent(discoverySeerrLanguage)}`),
      jellyseerr(`/api/v1/genres/tv?language=${encodeURIComponent(discoverySeerrLanguage)}`)
    ]);
    movieRows = Array.isArray(movie) ? movie : movie?.genres || [];
    tvRows = Array.isArray(tv) ? tv : tv?.genres || [];
  }
  tmdbGenreCache.movie = new Map(movieRows.map(item => [Number(item.id), item.name]).filter(([id, name]) => Number.isInteger(id) && name));
  tmdbGenreCache.tv = new Map(tvRows.map(item => [Number(item.id), item.name]).filter(([id, name]) => Number.isInteger(id) && name));
  tmdbGenreCache.expiresAt = Date.now() + 24 * 60 * 60_000;
  return tmdbGenreCache;
}

async function seerrTrendCandidates() {
  if (!process.env.JELLYSEERR_URL || !process.env.JELLYSEERR_API_KEY) return [];
  if (seerrTrendCache.expiresAt > Date.now()) return seerrTrendCache.value;
  const [daily, weekly] = await Promise.all([
    jellyseerr('/api/v1/discover/trending?mediaType=all&timeWindow=day&page=1&language=fr').catch(() => ({ results: [] })),
    jellyseerr('/api/v1/discover/trending?mediaType=all&timeWindow=week&page=1&language=fr').catch(() => ({ results: [] }))
  ]);
  const merged = new Map();
  const ingest = (payload, source) => {
    (payload?.results || []).forEach((raw, rank) => {
      const item = normalizedDiscoveryItem(raw, raw.mediaType, source);
      if (!item) return;
      const key = `${item.mediaType}:${item.id}`;
      const previous = merged.get(key) || { ...item, signals: [], signalCount: 0, trendRank: 999 };
      previous.signals = [...new Set([...(previous.signals || []), source])];
      previous.signalCount = previous.signals.length;
      previous.trendRank = Math.min(previous.trendRank ?? 999, rank + 1);
      previous.score = Math.max(Number(previous.score || 0), Number(item.score || 0)) + (source === 'seerr-day' ? Math.max(2, 14 - rank * .35) : Math.max(1, 9 - rank * .2));
      if (source === 'seerr-day') previous.reason = 'Tendance Seerr aujourd’hui';
      merged.set(key, previous);
    });
  };
  ingest(daily, 'seerr-day');
  ingest(weekly, 'seerr-week');
  const value = [...merged.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 40);
  seerrTrendCache = { expiresAt: Date.now() + 5 * 60_000, value };
  return value;
}

async function discoveryRecommendationsForSeed(seed) {
  const cacheKey = `${seed.mediaType}:${seed.id}:${tmdbConfigured() ? 'tmdb' : 'seerr'}`;
  const cached = discoverySeedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value = { recommended: [], similar: [] };
  if (tmdbConfigured()) {
    const [recommended, similar] = await Promise.all([
      tmdb(`/${seed.mediaType}/${seed.id}/recommendations`, { page: 1 }).catch(() => ({ results: [] })),
      tmdb(`/${seed.mediaType}/${seed.id}/similar`, { page: 1 }).catch(() => ({ results: [] }))
    ]);
    value = { recommended: recommended.results || [], similar: similar.results || [] };
  } else if (seerrDiscoveryConfigured()) {
    const base = `/api/v1/${seed.mediaType}/${seed.id}`;
    const [recommended, similar] = await Promise.all([
      jellyseerr(`${base}/recommendations?page=1&language=${encodeURIComponent(discoverySeerrLanguage)}`).catch(() => ({ results: [] })),
      jellyseerr(`${base}/similar?page=1&language=${encodeURIComponent(discoverySeerrLanguage)}`).catch(() => ({ results: [] }))
    ]);
    value = { recommended: recommended.results || [], similar: similar.results || [] };
  }
  discoverySeedCache.set(cacheKey, { expiresAt: Date.now() + 6 * 60 * 60_000, value });
  return value;
}

async function discoveryGenreCandidates(profile, mediaType, genreIds) {
  if (!genreIds.length) return [];
  if (tmdbConfigured()) {
    const today = new Date().toISOString().slice(0, 10);
    const recent = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10);
    const payload = await tmdb(`/discover/${mediaType}`, mediaType === 'movie' ? {
      with_genres: genreIds.join('|'), sort_by: 'vote_average.desc', 'vote_count.gte': 120,
      'primary_release_date.gte': recent, 'primary_release_date.lte': today, page: 1
    } : {
      with_genres: genreIds.join('|'), sort_by: 'vote_average.desc', 'vote_count.gte': 80,
      'first_air_date.gte': recent, 'first_air_date.lte': today, page: 1
    }).catch(() => ({ results: [] }));
    return payload.results || [];
  }
  if (seerrDiscoveryConfigured()) {
    // Le endpoint Discover de Seerr accepte les filtres TMDB utiles (genre,
    // notes, dates, plateformes) en camelCase et les exécute avec la clé TMDB
    // déjà détenue par Seerr.
    const endpoint = mediaType === 'movie' ? 'movies' : 'tv';
    const params = new URLSearchParams({
      page: '1', language: discoverySeerrLanguage,
      genre: String(genreIds[0]), sortBy: 'vote_average.desc',
      voteAverageGte: '6.3', voteCountGte: mediaType === 'movie' ? '100' : '60'
    });
    const payload = await jellyseerr(`/api/v1/discover/${endpoint}?${params.toString()}`).catch(() => ({ results: [] }));
    return payload.results || [];
  }
  return [];
}

async function tmdbTasteCandidates(session) {
  if (!session || !discoveryMetadataConfigured()) return [];
  const profile = await jellyfinTasteProfile(session);
  if (!profile.sampleSize) return [];
  const genreMaps = await tmdbGenreMaps().catch(() => tmdbGenreCache);
  const genreNameToIds = mediaType => {
    const map = mediaType === 'tv' ? genreMaps.tv : genreMaps.movie;
    const reverse = new Map([...map.entries()].map(([id, name]) => [normalizedIdentifier(name), id]));
    return profile.genres.slice(0, 7).map(([name]) => reverse.get(normalizedIdentifier(name))).filter(Boolean).slice(0, 4);
  };
  const seedCandidates = new Map();
  // V90 : recommandations proches ET profils de genres partent dans la même
  // vague réseau. Les anciennes vagues successives rendaient surtout le premier
  // affichage PC perceptiblement plus lent.
  const selectedSeeds = profile.seeds.slice(0, 6);
  const movieGenreIds = genreNameToIds('movie');
  const tvGenreIds = genreNameToIds('tv');
  const [results, movieDiscover, tvDiscover] = await Promise.all([
    mapWithConcurrency(selectedSeeds, 6, async seed => ({ seed, ...(await discoveryRecommendationsForSeed(seed)) })),
    discoveryGenreCandidates(profile, 'movie', movieGenreIds),
    discoveryGenreCandidates(profile, 'tv', tvGenreIds)
  ]);
  for (const { seed, recommended, similar } of results) {
    const ingest = (rows, source, multiplier) => rows.slice(0, source === 'recommended' ? 16 : 12).forEach(raw => {
      const item = normalizedDiscoveryItem(raw, seed.mediaType, source);
      if (!item) return;
      const key = `${item.mediaType}:${item.id}`;
      const previous = seedCandidates.get(key) || { ...item, recommendedBy: [], recommendationWeight: 0, similarityWeight: 0, signals: [] };
      if (!previous.recommendedBy.includes(seed.title)) previous.recommendedBy.push(seed.title);
      previous.signals = [...new Set([...(previous.signals || []), source])];
      if (source === 'recommended') previous.recommendationWeight += seed.weight * multiplier;
      else previous.similarityWeight += seed.weight * multiplier;
      previous.score = Math.max(previous.score, item.score) + Math.min(source === 'recommended' ? 24 : 16, seed.weight * multiplier);
      seedCandidates.set(key, previous);
    });
    ingest(recommended, 'recommended', 1.8);
    ingest(similar, 'similar', 1.1);
  }
  [['movie', movieDiscover], ['tv', tvDiscover]].forEach(([mediaType, rows]) => {
    (rows || []).slice(0, 20).forEach(raw => {
      const item = normalizedDiscoveryItem(raw, mediaType, 'recommended');
      if (!item) return;
      const key = `${item.mediaType}:${item.id}`;
      if (!seedCandidates.has(key)) seedCandidates.set(key, { ...item, recommendedBy: [], recommendationWeight: 0, similarityWeight: 0, signals: ['genre-profile'] });
    });
  });
  return [...seedCandidates.values()].sort((a, b) => b.score - a.score).slice(0, 52);
}

function diversifyPersonalizedDiscovery(items, mode = 'balanced') {
  const pool = [...items];
  const selected = [];
  const genreUse = new Map();
  const franchiseUse = new Map();
  while (pool.length) {
    let bestIndex = 0;
    let bestAdjustedScore = -Infinity;
    for (let index = 0; index < pool.length; index += 1) {
      const item = pool[index];
      const franchise = normalizedTitle(item.title).split(' ').slice(0, 2).join(' ');
      const genreFactor = mode === 'explore' ? 3.1 : mode === 'precise' ? 1.25 : 1.8;
      const franchiseFactor = mode === 'explore' ? 25 : mode === 'precise' ? 15 : 18;
      const genrePenalty = (item.genreIds || []).reduce((sum, id) => sum + Math.min(3, genreUse.get(Number(id)) || 0) * genreFactor, 0);
      const franchisePenalty = (franchiseUse.get(franchise) || 0) * franchiseFactor;
      const lastTwo = selected.slice(-2);
      const formatPenalty = lastTwo.length === 2 && lastTwo.every(entry => entry.mediaType === item.mediaType) ? (mode === 'explore' ? 11 : 7) : 0;
      const discoveryBonus = item.personalized ? 0 : Math.min(mode === 'explore' ? 13 : 5, Math.floor(selected.length / (mode === 'explore' ? 3 : 8)));
      const adjustedScore = Number(item.score || 0) - genrePenalty - franchisePenalty - formatPenalty + discoveryBonus;
      if (adjustedScore > bestAdjustedScore) {
        bestAdjustedScore = adjustedScore;
        bestIndex = index;
      }
    }
    const [picked] = pool.splice(bestIndex, 1);
    selected.push(picked);
    const franchise = normalizedTitle(picked.title).split(' ').slice(0, 2).join(' ');
    franchiseUse.set(franchise, (franchiseUse.get(franchise) || 0) + 1);
    (picked.genreIds || []).forEach(id => genreUse.set(Number(id), (genreUse.get(Number(id)) || 0) + 1));
  }
  return selected;
}


let discoveryFeedbackCache = null;
async function discoveryFeedbackStore() {
  if (discoveryFeedbackCache) return discoveryFeedbackCache;
  const raw = await readFile(discoveryFeedbackPath, 'utf8').catch(() => '{"users":{}}');
  try { discoveryFeedbackCache = JSON.parse(raw); } catch { discoveryFeedbackCache = { users: {} }; }
  if (!discoveryFeedbackCache || typeof discoveryFeedbackCache !== 'object') discoveryFeedbackCache = { users: {} };
  if (!discoveryFeedbackCache.users || typeof discoveryFeedbackCache.users !== 'object') discoveryFeedbackCache.users = {};
  return discoveryFeedbackCache;
}

async function discoveryFeedbackFor(session) {
  const store = await discoveryFeedbackStore();
  const key = String(session?.user?.Id || 'guest');
  return store.users[key] || { items: {} };
}

async function saveDiscoveryFeedback(session, payload = {}) {
  const mediaType = payload.mediaType === 'tv' ? 'tv' : 'movie';
  const id = positiveInteger(payload.id);
  const action = ['more', 'less', 'dismiss'].includes(payload.action) ? payload.action : '';
  if (!id || !action) throw new HttpError(400, 'Feedback de recommandation invalide.');
  const store = await discoveryFeedbackStore();
  const userKey = String(session?.user?.Id || 'guest');
  const user = store.users[userKey] || { items: {} };
  user.items ||= {};
  const key = `${mediaType}:${id}`;
  user.items[key] = {
    id,
    mediaType,
    action,
    title: String(payload.title || '').slice(0, 180),
    genreIds: Array.isArray(payload.genreIds) ? payload.genreIds.map(Number).filter(Number.isInteger).slice(0, 12) : [],
    updatedAt: new Date().toISOString()
  };
  // Évite une croissance infinie du runtime : on conserve les 250 retours les plus récents.
  const recent = Object.entries(user.items).sort((a, b) => String(b[1]?.updatedAt || '').localeCompare(String(a[1]?.updatedAt || ''))).slice(0, 250);
  user.items = Object.fromEntries(recent);
  store.users[userKey] = user;
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(discoveryFeedbackPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  [...discoveryCache.keys()].filter(cacheKey => cacheKey.endsWith(`:${userKey}`)).forEach(cacheKey => discoveryCache.delete(cacheKey));
  tasteProfileCache.delete(userKey);
  return { ok: true, action, id, mediaType };
}

async function personalizeDiscovery(items, session, mode = 'balanced') {
  if (!session || !discoveryMetadataConfigured()) return items;
  mode = normalizedDiscoveryMode(mode);
  const [profile, genreMaps] = await Promise.all([
    jellyfinTasteProfile(session),
    tmdbGenreMaps().catch(() => tmdbGenreCache)
  ]);
  const feedback = await discoveryFeedbackFor(session).catch(() => ({ items: {} }));
  const feedbackItems = Object.values(feedback?.items || {});
  const feedbackGenres = new Map();
  feedbackItems.forEach(entry => {
    const factor = entry.action === 'more' ? 1 : entry.action === 'less' ? -1 : 0;
    (entry.genreIds || []).forEach(id => feedbackGenres.set(Number(id), (feedbackGenres.get(Number(id)) || 0) + factor));
  });
  const preferredGenres = new Map(profile.genres.slice(0, 14).map(([name, score], index) => [normalizedIdentifier(name), { score, index, name }]));
  const maxWeight = Math.max(1, profile.genres[0]?.[1] || 1);
  const franchiseSeen = new Map();
  const ranked = items
    .filter(item => !profile.existingTmdb.has(`${item.mediaType}:${item.id}`))
    .filter(item => feedback?.items?.[`${item.mediaType}:${item.id}`]?.action !== 'dismiss' && feedback?.items?.[`${item.mediaType}:${item.id}`]?.action !== 'less')
    .map(item => {
      const genreMap = item.mediaType === 'tv' ? genreMaps.tv : genreMaps.movie;
      const names = (item.genreIds || []).map(id => genreMap.get(Number(id))).filter(Boolean);
      const matches = names
        .map(name => preferredGenres.get(normalizedIdentifier(name)))
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
      const affinity = matches.reduce((sum, match) => sum + (match.score / maxWeight) * 10, 0);
      const recommendationBoost = Math.min(38,
        Number(item.recommendationWeight || 0) * 1.9
        + Number(item.similarityWeight || 0) * 1.25
        + (item.recommendedBy?.length || 0) * 5
      );
      const balanceBoost = item.mediaType === 'tv'
        ? (profile.series < profile.movies ? 5 : 0)
        : (profile.movies < profile.series ? 5 : 0);
      const feedbackBoost = (item.genreIds || []).reduce((sum, id) => sum + Math.max(-4, Math.min(4, feedbackGenres.get(Number(id)) || 0)) * 3.2, 0);
      const titleRoot = normalizedTitle(item.title).split(' ').slice(0, 2).join(' ');
      const duplicateIndex = franchiseSeen.get(titleRoot) || 0;
      franchiseSeen.set(titleRoot, duplicateIndex + 1);
      const diversityPenalty = duplicateIndex * 7;
      const base = Number(item.score || 0);
      const affinityWeight = mode === 'precise' ? 1.28 : mode === 'explore' ? .68 : 1;
      const recommendationWeight = mode === 'precise' ? 1.2 : mode === 'explore' ? .72 : 1;
      const feedbackWeight = mode === 'precise' ? 1.18 : mode === 'explore' ? .82 : 1;
      const noveltyBoost = mode === 'explore' && matches.length === 0 ? 17 : 0;
      const qualityBoost = mode === 'explore' && Number(item.voteAverage || 0) >= 7.2 && Number(item.voteCount || 0) >= 80 ? 8 : 0;
      // Un contrôle Prowlarr déjà effectué (badge ou fenêtre Torrents live) devient
      // un signal de ranking sans déclencher la moindre requête réseau pendant le
      // calcul des suggestions. Cela rend les prochains recalculs plus pertinents
      // tout en gardant le premier affichage aussi fluide qu'avant.
      const releaseYear = String(item.releaseDate || '').slice(0, 4);
      const availabilityCacheEntry = trackerAvailabilityCache.get(trackerSearchKey(item.mediaType, item.title, releaseYear, item.id));
      const cachedAvailability = availabilityCacheEntry?.expiresAt > Date.now() ? availabilityCacheEntry.value : null;
      const trackerBoost = cachedAvailability?.status === 'available'
        ? Math.min(10, 3 + Math.log2(1 + Number(cachedAvailability.bestSeeders || 0)) + Math.min(3, Number(cachedAvailability.count || 0) / 8))
        : 0;
      const personalizedScore = Math.max(1, Math.round(
        base
        + Math.min(40, affinity * affinityWeight)
        + recommendationBoost * recommendationWeight
        + balanceBoost
        + feedbackBoost * feedbackWeight
        + noveltyBoost
        + qualityBoost
        + trackerBoost
        - diversityPenalty
      ));
      const signals = [];
      if (item.recommendedBy?.length) signals.push(`proche de ${item.recommendedBy.slice(0, 2).join(' et ')}`);
      if (matches.length) signals.push(`genres ${matches.slice(0, 3).map(match => match.name).join(' · ')}`);
      if (Number(item.voteAverage || 0) >= 7.5 && Number(item.voteCount || 0) >= 80) signals.push(`note solide ${Number(item.voteAverage).toFixed(1)}/10`);
      if (feedbackBoost >= 5) signals.push('renforcé par tes retours');
      if (trackerBoost > 0) signals.push(`disponible maintenant sur ${Math.max(1, Number(cachedAvailability?.trackers?.length || 0))} tracker${Number(cachedAvailability?.trackers?.length || 0) > 1 ? 's' : ''}`);
      if ((item.signals || []).includes('seerr-day')) signals.push('tendance forte aujourd’hui');
      else if ((item.signals || []).includes('seerr-week')) signals.push('tendance cette semaine');
      if (item.source === 'cinema' || item.source === 'upcoming' || item.source === 'streaming' || item.source === 'quality') signals.push(item.reason.toLocaleLowerCase('fr'));
      if (mode === 'explore' && noveltyBoost) signals.push('exploration volontaire hors de tes genres dominants');
      const reason = mode === 'explore' && noveltyBoost
        ? `Exploration contrôlée · ${item.reason}`
        : item.recommendedBy?.length
        ? `Parce que tu regardes ${item.recommendedBy.slice(0, 2).join(' · ')}`
        : matches.length
          ? `Adapté à tes goûts : ${matches.slice(0, 2).map(match => match.name).join(' · ')}`
          : item.reason;
      return {
        ...item,
        score: personalizedScore,
        reason,
        personalized: Boolean(matches.length || item.recommendedBy?.length),
        explanation: {
          confidence: Math.min(99, Math.round(42 + Math.min(28, affinity) + Math.min(22, recommendationBoost) + Math.min(7, Number(item.signalCount || 0) * 2))),
          signals: signals.slice(0, 5),
          breakdown: {
            base: Math.round(base),
            genres: Math.round(Math.min(34, affinity)),
            similarities: Math.round(recommendationBoost),
            balance: balanceBoost,
            feedback: Math.round(feedbackBoost),
            trackers: Math.round(trackerBoost),
            diversity: -diversityPenalty,
            novelty: noveltyBoost + qualityBoost
          }
        }
      };
    })
    .sort((left, right) => right.score - left.score);
  return diversifyPersonalizedDiscovery(ranked, mode);
}

function trackerSearchKey(mediaType, title, year, tmdbId = '') {
  const id = positiveInteger(tmdbId);
  return id
    ? `${mediaType}:tmdb:${id}`
    : `${mediaType}:${normalizedTitle(title)}:${year || ''}`;
}

function prowlarrBaseCandidates() {
  const values = [process.env.PROWLARR_INTERNAL_URL]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  if (process.env.PROWLARR_URL && process.env.PROWLARR_DISABLE_LOCAL_FALLBACK !== 'true') {
    values.push(`http://127.0.0.1:${Number(process.env.PROWLARR_INTERNAL_PORT || 15524)}`);
  }
  values.push(String(process.env.PROWLARR_URL || '').trim());
  return [...new Set(values.map(withoutSlash).filter(Boolean))];
}

async function prowlarrRequest(path, options = {}) {
  const candidates = prowlarrBaseCandidates();
  if (!candidates.length || !process.env.PROWLARR_API_KEY) throw new HttpError(503, 'Prowlarr n’est pas configuré.');
  const errors = [];
  const deadline = Date.now() + Math.max(1, Number(options.timeoutMs || 20_000));
  for (const base of candidates) {
    if (Date.now() >= deadline) break;
    try {
      const payload = await arrRequest(base, process.env.PROWLARR_API_KEY, path, { ...options, timeoutMs: Math.max(1, deadline - Date.now()) });
      return { payload, base };
    } catch (error) {
      errors.push(`${arrServiceHint(base)} : ${cleanError(error)}`);
    }
  }
  if (errors.length) console.warn(`[Prowlarr] ${errors.join(' | ')}`);
  throw new HttpError(502, 'Prowlarr tarde à répondre. Réessaie dans un instant.');
}

async function enabledProwlarrIndexers() {
  if (prowlarrIndexerCache.expiresAt > Date.now()) return prowlarrIndexerCache.items;
  const stale = prowlarrIndexerCache;
  try {
    const { payload, base } = await prowlarrRequest('/api/v1/indexer');
    const items = (Array.isArray(payload) ? payload : payload?.records || [])
      .filter(item => item.enable !== false && item.id)
      .map(item => ({ id: Number(item.id), name: item.name || `Indexer ${item.id}` }));
    const stats = await prowlarrRequest('/api/v1/indexerstats', { timeoutMs: 6_000 })
      .then(result => Array.isArray(result.payload?.indexers) ? result.payload.indexers : [])
      .catch(() => []);
    const responseTimes = new Map(stats.map(item => [Number(item.indexerId || item.id), Number(item.averageResponseTime || item.averageGrabResponseTime || Number.POSITIVE_INFINITY)]));
    const fastIds = items
      .map(item => item.id)
      .sort((left, right) => (responseTimes.get(left) ?? Number.POSITIVE_INFINITY) - (responseTimes.get(right) ?? Number.POSITIVE_INFINITY))
      .slice(0, 2);
    prowlarrIndexerCache = { expiresAt: Date.now() + 10 * 60_000, items, fastIds, base };
    return items;
  } catch (error) {
    if (!stale.items?.length) throw error;
    prowlarrIndexerCache = { ...stale, expiresAt: Date.now() + 60_000 };
    return stale.items;
  }
}

function prowlarrRows(payload) {
  return Array.isArray(payload) ? payload : (payload?.records || payload?.results || payload?.data || []);
}

function registerDiscoveryRelease(release) {
  if (String(release.protocol).toLowerCase() !== 'torrent' || !release.downloadUrl) return null;
  const id = createHash('sha256').update(`${release.indexerId}:${release.guid || release.downloadUrl}`).digest('hex');
  for (const [key, value] of discoveryGrabReleases) if (value.expiresAt < Date.now() && !value.pending) discoveryGrabReleases.delete(key);
  if (discoveryGrabReleases.size >= 4000 && !discoveryGrabReleases.has(id)) discoveryGrabReleases.delete(discoveryGrabReleases.keys().next().value);
  const entry = discoveryGrabReleases.get(id) || {};
  Object.assign(entry, { release, expiresAt: Date.now() + 25 * 60_000 });
  discoveryGrabReleases.set(id, entry);
  return id;
}

async function grabDiscoveryTorrent(body) {
  const entry = discoveryGrabReleases.get(String(body.downloadId || ''));
  if (!entry || entry.expiresAt < Date.now()) throw new HttpError(409, 'Cette liste a expiré. Actualise les torrents avant de réessayer.');
  if (entry.result) return { ...entry.result, alreadyPresent: true };
  if (entry.pending) return entry.pending;
  entry.pending = (async () => {
    const deadline = Date.now() + 15_000;
    const original = new URL(entry.release.downloadUrl);
    const allowed = prowlarrBaseCandidates().some(base => new URL(base).origin === original.origin);
    if (!allowed) throw new HttpError(502, 'Le tracker n’a pas fourni de lien de téléchargement Prowlarr valide.');
    let url = original;
    let response;
    for (let hop = 0; hop < 5; hop++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new HttpError(504, 'Le tracker a mis trop de temps à fournir le torrent. Réessaie dans un instant.');
      response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(remaining), headers: url.origin === original.origin ? arrHeaders(process.env.PROWLARR_API_KEY) : {} });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new HttpError(502, 'Redirection du tracker invalide.');
      url = new URL(location, url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new HttpError(502, 'Redirection du tracker non prise en charge.');
    }
    if (!response.ok) { await response.body?.cancel(); throw new HttpError(502, `Le tracker a refusé le fichier (${response.status}). Actualise la recherche.`); }
    if (Number(response.headers.get('content-length') || 0) > 8 * 1024 * 1024) { await response.body?.cancel(); throw new HttpError(413, 'Fichier .torrent trop volumineux.'); }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) throw new HttpError(413, 'Fichier .torrent trop volumineux.');
      chunks.push(chunk);
    }
    const name = `${String(entry.release.title || 'torrent').replace(/[\\/:*?"<>|]/g, '_').slice(0, 160)}.torrent`;
    if (Date.now() >= deadline) throw new HttpError(504, 'Le tracker a mis trop de temps à fournir le torrent. Réessaie dans un instant.');
    entry.result = await qbitAddTorrent({ name, dataBase64: Buffer.concat(chunks).toString('base64'), category: body.category, savePath: body.savePath, startPaused: body.startPaused !== false });
    return entry.result;
  })();
  try { return await entry.pending; } finally { entry.pending = null; }
}

let indexerSchemaCache = null;
async function prowlarrIndexerSchemas() {
  if (indexerSchemaCache?.expiresAt > Date.now()) return indexerSchemaCache.items;
  const { payload } = await prowlarrRequest('/api/v1/indexer/schema');
  const items = payload.map(item => ({ item, key: createHash('sha256').update(`${item.implementation}:${item.definitionName || item.name}`).digest('hex') }));
  indexerSchemaCache = { items, expiresAt: Date.now() + 60 * 60_000 };
  return items;
}

async function saveProwlarrIndexer(body, testOnly = false) {
  const id = positiveInteger(body.id);
  const original = id ? (await prowlarrRequest(`/api/v1/indexer/${id}`)).payload
    : (await prowlarrIndexerSchemas()).find(schema => schema.key === body.schemaId)?.item;
  if (!original) throw new HttpError(400, 'Type d’indexeur inconnu.');
  let updated;
  try { updated = updateIndexer(original, body); } catch (error) { throw new HttpError(400, error.message); }
  const [profiles, clients] = await Promise.all([prowlarrRequest('/api/v1/appprofile'), prowlarrRequest('/api/v1/downloadclient')]);
  if (!profiles.payload.some(profile => profile.id === updated.appProfileId)) throw new HttpError(400, 'Profil de synchronisation invalide.');
  if (updated.downloadClientId && !clients.payload.some(client => client.id === updated.downloadClientId)) throw new HttpError(400, 'Client de téléchargement invalide.');
  try {
    const result = await prowlarrRequest(testOnly ? '/api/v1/indexer/test' : `/api/v1/indexer${id ? `/${id}` : ''}`, {
      method: testOnly || !id ? 'POST' : 'PUT', body: JSON.stringify(updated), timeoutMs: 30000
    });
    if (!testOnly) { prowlarrIndexerCache.expiresAt = 0; trackerAvailabilityCache.clear(); interactiveSearches.clear(); }
    return { ok: true, tested: testOnly, id: result.payload?.id || id };
  } catch {
    // Provider validation responses can echo credential fields. Never send them to the browser.
    throw new HttpError(400, 'Prowlarr a refusé la configuration ou le test. Vérifie les champs requis, l’adresse et les identifiants.');
  }
}

async function prowlarrAvailability(mediaType, title, year = '', options = {}) {
  const key = trackerSearchKey(mediaType, title, year, options.tmdbId || '');
  const limit = Math.max(1, Math.min(40, Number(options.limit) || 8));
  if (trackerAvailabilityInFlight.has(key)) {
    const value = await trackerAvailabilityInFlight.get(key);
    return { ...value, releases: (value.releases || []).slice(0, limit) };
  }
  const pending = loadProwlarrAvailability(mediaType, title, year, { ...options, limit: 40 });
  trackerAvailabilityInFlight.set(key, pending);
  try {
    const value = await pending;
    return { ...value, releases: (value.releases || []).slice(0, limit) };
  } finally { trackerAvailabilityInFlight.delete(key); }
}

async function loadProwlarrAvailability(mediaType, title, year = '', options = {}) {
  if (!(process.env.PROWLARR_INTERNAL_URL || process.env.PROWLARR_URL) || !process.env.PROWLARR_API_KEY) {
    return { configured: false, status: 'unavailable', count: 0, preferredCount: 0, alternateCount: 0, alternateLanguages: [], trackers: [], releases: [], message: 'Prowlarr n’est pas configuré.' };
  }
  const safeTitle = String(title || '').trim().slice(0, 240);
  if (!safeTitle) throw new HttpError(400, 'Titre requis pour vérifier les trackers.');
  const safeYear = /^\d{4}$/.test(String(year || '')) ? String(year) : '';
  const tmdbId = positiveInteger(options.tmdbId) || '';
  const key = trackerSearchKey(mediaType, safeTitle, safeYear, tmdbId);
  const force = Boolean(options?.force);
  const releaseLimit = Math.max(1, Math.min(40, Number(options?.limit || 8)));
  const cached = trackerAvailabilityCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return { ...cached.value, releases: cached.value.releases.slice(0, releaseLimit) };
  const metadata = tmdbId
    ? (await requestMetadataDetail(mediaType, tmdbId).catch(() => null)
      || (tmdbConfigured() ? await tmdb(`/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}`).catch(() => null) : null))
    : null;
  const identity = trackerSearchIdentity(safeTitle, safeYear, metadata || {});
  let indexers;
  try {
    indexers = await enabledProwlarrIndexers();
  } catch (error) {
    const value = {
      configured: true,
      status: 'deferred',
      count: 0,
      preferredCount: 0,
      alternateCount: 0,
      alternateLanguages: [],
      trackers: [],
      releases: [],
      message: 'Vérification automatique reportée. Relance-la dans un instant.'
    };
    trackerAvailabilityCache.set(key, { expiresAt: Date.now() + 30_000, value });
    return value;
  }
  if (!indexers.length) {
    const value = {
      configured: true,
      status: 'deferred',
      count: 0,
      preferredCount: 0,
      alternateCount: 0,
      alternateLanguages: [],
      trackers: [],
      releases: [],
      message: 'Aucun indexeur Prowlarr actif pour cette vérification.'
    };
    trackerAvailabilityCache.set(key, { expiresAt: Date.now() + 30_000, value });
    return value;
  }
  const indexerIds = indexers.map(item => item.id).filter(Number.isInteger);
  const preferredIndexerIds = force
    ? indexerIds
    : (prowlarrIndexerCache.fastIds?.filter(id => indexerIds.includes(id)) || []).slice(0, 2);
  const { rows, rejectedRows, query, error: searchError, checkedIndexerIds } = await searchTrackerReleases({
    mediaType, identity, indexerIds, preferredIndexerIds, exhaustive: force,
    request: async (path, requestOptions) => (await prowlarrRequest(path, requestOptions)).payload
  });
  const lastError = searchError || (tmdbId && !metadata ? new Error('Métadonnées du titre indisponibles. Relance la vérification.') : null);
  if (!rows.length && lastError) {
    const value = {
      configured: true,
      status: 'error',
      count: 0,
      preferredCount: 0,
      alternateCount: 0,
      alternateLanguages: [],
      trackers: [],
      releases: [],
      query,
      message: cleanError(lastError)
    };
    trackerAvailabilityCache.set(key, { expiresAt: Date.now() + 15_000, value });
    return value;
  }
  const normalizedCandidates = rows
    .filter(item => item?.title)
    .sort(compareReleaseSize)
    .slice(0, 80)
    .map(item => ({
      title: item.title,
      indexer: item.indexer || item.indexerName || indexers.find(indexer => indexer.id === Number(item.indexerId))?.name || 'Tracker',
      indexerId: Number(item.indexerId || 0) || null,
      downloadId: registerDiscoveryRelease(item),
      protocol: item.protocol || '',
      size: Number(item.size || 0),
      seeders: item.seeders ?? null,
      leechers: item.leechers ?? item.peers ?? null,
      ageHours: item.ageHours ?? null,
      publishDate: item.publishDate || null,
      categories: item.categories || []
    }));
  const languageSummary = summarizeReleaseLanguages(normalizedCandidates);
  const normalized = languageSummary.releases;
  const trackers = [...new Set(normalized.map(item => item.indexer).filter(Boolean))];
  const value = {
    configured: true,
    status: languageSummary.preferredCount > 0 ? 'available' : (normalized.length ? 'alternate' : 'missing'),
    count: normalized.length,
    preferredCount: languageSummary.preferredCount,
    alternateCount: languageSummary.alternateCount,
    alternateLanguages: languageSummary.alternateLanguages,
    trackers,
    checkedIndexers: checkedIndexerIds?.length || indexers.length,
    endpoint: prowlarrIndexerCache.base || null,
    bestSeeders: Math.max(0, ...normalized.map(item => Number(item.seeders || 0))),
    releases: normalized,
    query,
    searchedYear: identity.year,
    searchedTitles: identity.titles,
    message: languageSummary.preferredCount > 0
      ? `${languageSummary.preferredCount} release${languageSummary.preferredCount > 1 ? 's' : ''} VFF ou MULTI VFF sur ${trackers.length} tracker${trackers.length > 1 ? 's' : ''}.`
      : normalized.length
        ? `Bientôt disponible en VFF. Déjà disponible en ${languageSummary.alternateLanguages.join(', ')}.`
      : rejectedRows
        ? `Aucun torrent correspondant précisément au titre et à l’année (${rejectedRows} résultat${rejectedRows > 1 ? 's' : ''} non pertinent${rejectedRows > 1 ? 's' : ''} écarté${rejectedRows > 1 ? 's' : ''}).`
        : `Aucun résultat sur ${indexers.length || 'les'} indexeur${indexers.length > 1 ? 's' : ''} actif${indexers.length > 1 ? 's' : ''}.`
  };
  trackerAvailabilityCache.set(key, { expiresAt: Date.now() + (normalized.length ? 20 * 60_000 : 2 * 60_000), value });
  return { ...value, releases: normalized.slice(0, releaseLimit) };
}

const discoveryPlatformCache = new Map();
const discoveryPlatformPending = new Map();
async function discoveryLegalOffers(mediaType, id) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const key = type + ':' + id + ':' + discoveryRegion;
  const cached = discoveryPlatformCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (discoveryPlatformPending.has(key)) return discoveryPlatformPending.get(key);
  const pending = (async () => {
    const payload = tmdbConfigured()
      ? await tmdb('/' + type + '/' + Number(id) + '/watch/providers')
      : await jellyseerr('/api/v1/' + type + '/' + Number(id) + '?language=' + encodeURIComponent(discoverySeerrLanguage));
    const offers = regionalOffers(payload, discoveryRegion);
    if (discoveryPlatformCache.size > 3000) discoveryPlatformCache.delete(discoveryPlatformCache.keys().next().value);
    discoveryPlatformCache.set(key, {expiresAt: Date.now() + 30 * 60_000, value: offers});
    return offers;
  })().finally(() => discoveryPlatformPending.delete(key));
  discoveryPlatformPending.set(key,pending);
  return pending;
}
async function tmdbLegalPlatforms(mediaType, id) {
  try { return [...new Set((await discoveryLegalOffers(mediaType,id)).map(p=>p.name))]; }
  catch { return []; }
}

async function providerDiscovery(category, provider, genre, page) {
  const groups = await Promise.all(['movie','tv'].map(async type => {
    const genreId = discoveryGenreId(genre,type);
    let payload;
    if (tmdbConfigured()) {
      payload = await tmdb('/discover/' + type, {
        watch_region: discoveryRegion, with_watch_providers: provider,
        with_watch_monetization_types: 'flatrate|free|ads', sort_by: 'popularity.desc',
        ...(genreId ? {with_genres:genreId} : {}), page
      });
    } else {
      const params = new URLSearchParams({watchRegion:discoveryRegion,watchProviders:provider,
        sortBy:'popularity.desc',language:discoverySeerrLanguage,page:String(page)});
      if (genreId) params.set('genre',String(genreId));
      payload = await jellyseerr('/api/v1/discover/' + (type === 'movie' ? 'movies' : 'tv') + '?' + params);
    }
    return [type,'streaming',payload];
  }));
  const items = groups.flatMap(([type,source,payload]) => (payload.results || [])
    .map(raw=>normalizedDiscoveryItem(raw,type,source)).filter(Boolean));
  const verified = await verifyProviderItems(filterDiscoveryCatalog(items,category,genre),provider,discoveryLegalOffers,discoveryRegion);
  return discoveryCatalogPage(verified,groups,page);
}

async function enrichDiscoveryLegalPlatforms(items, limit = 18) {
  const list = Array.isArray(items) ? items : [];
  const head = list.slice(0, Math.max(0, Number(limit) || 0));
  const platforms = await Promise.all(head.map(item => tmdbLegalPlatforms(item.mediaType, item.id)));
  return list.map((item, index) => index < head.length ? { ...item, legalPlatforms: platforms[index] || [] } : item);
}

function discoveryProviderFilter(provider) {
  const value = String(provider || '').trim();
  return providerFilter(value);
}

const discoveryGenreIds = Object.freeze({
  action: { movie: 28, tv: 10759 },
  adventure: { movie: 12, tv: 10759 },
  animation: { movie: 16, tv: 16 },
  comedy: { movie: 35, tv: 35 },
  crime: { movie: 80, tv: 80 },
  documentary: { movie: 99, tv: 99 },
  drama: { movie: 18, tv: 18 },
  family: { movie: 10751, tv: 10751 },
  fantasy: { movie: 14, tv: 10765 },
  history: { movie: 36, tv: 36 },
  horror: { movie: 27, tv: 9648 },
  music: { movie: 10402, tv: 10402 },
  mystery: { movie: 9648, tv: 9648 },
  romance: { movie: 10749, tv: 10749 },
  scifi: { movie: 878, tv: 10765 },
  thriller: { movie: 53, tv: 9648 },
  war: { movie: 10752, tv: 10768 },
  western: { movie: 37, tv: 37 }
});

function normalizedDiscoveryGenre(value) {
  const slug = String(value || '').trim().toLowerCase();
  return Object.hasOwn(discoveryGenreIds, slug) ? slug : '';
}

function discoveryGenreId(value, mediaType) {
  return discoveryGenreIds[normalizedDiscoveryGenre(value)]?.[mediaType === 'tv' ? 'tv' : 'movie'] || 0;
}

function filterDiscoveryCatalog(items, category, genre = '') {
  const currentYear = new Date().getFullYear();
  const genreSlug = normalizedDiscoveryGenre(genre);
  return (Array.isArray(items) ? items : []).filter(item => {
    const genreIds = Array.isArray(item.genreIds) ? item.genreIds.map(Number) : [];
    if (category === 'anime' && !(item.mediaType === 'tv' && genreIds.includes(16) && item.originalLanguage === 'ja')) return false;
    if (category === 'animation' && !(item.mediaType === 'movie' && genreIds.includes(16) && item.originalLanguage !== 'ja')) return false;
    if (category === 'classics') {
      const year = Number(String(item.releaseDate || item.firstAirDate || '').slice(0, 4));
      if (item.mediaType !== 'movie' || !year || year > currentYear - 20) return false;
    }
    if (genreSlug) {
      const expected = discoveryGenreId(genreSlug, item.mediaType);
      if (expected && !genreIds.includes(expected)) return false;
    }
    return true;
  });
}

async function seerrDiscovery(category, provider = '', genre = '', page = 1) {
  if (!seerrDiscoveryConfigured()) return discoveryCatalogPage([], [], page);
  const providerId = discoveryProviderFilter(provider);
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;
  const recent = new Date(Date.now() - 150 * 86_400_000).toISOString().slice(0, 10);
  const classicCutoff = `${currentYear - 20}-12-31`;
  const rotationPage = 1 + (Math.floor(Date.now() / (7 * 86_400_000)) % 4);
  const query = (path, params = {}) => {
    const search = new URLSearchParams({ page: String(page), language: discoverySeerrLanguage });
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    });
    return jellyseerr(`/api/v1${path}?${search.toString()}`).catch(error => {
      if (page > 1) throw error;
      return { results: [] };
    });
  };
  const streaming = {
    watchRegion: discoveryRegion,
    ...(providerId ? { watchProviders: providerId } : {})
  };
  let groups = [];
  if (category === 'year') {
    const [cinema, streamingMovies, television, streamingTv] = await Promise.all([
      query('/discover/movies', { sortBy: 'popularity.desc', primaryReleaseDateGte: yearStart, primaryReleaseDateLte: yearEnd, voteCountGte: 20 }),
      query('/discover/movies', { ...streaming, sortBy: 'popularity.desc', primaryReleaseDateGte: yearStart, primaryReleaseDateLte: yearEnd }),
      query('/discover/tv', { sortBy: 'popularity.desc', firstAirDateGte: yearStart, firstAirDateLte: yearEnd, voteCountGte: 15 }),
      query('/discover/tv', { ...streaming, sortBy: 'popularity.desc', firstAirDateGte: yearStart, firstAirDateLte: yearEnd })
    ]);
    groups = [
      ['movie', 'annual-cinema', cinema],
      ['movie', 'annual-movie-streaming', streamingMovies],
      ['tv', 'annual-tv', television],
      ['tv', 'annual-tv-streaming', streamingTv]
    ];
  } else if (category === 'cinema') {
    const [recentMovies, upcoming, trend] = await Promise.all([
      query('/discover/movies', { sortBy: 'primary_release_date.desc', primaryReleaseDateGte: recent, primaryReleaseDateLte: today, voteCountGte: 20 }),
      query('/discover/movies/upcoming'),
      query('/discover/trending', { mediaType: 'movie', timeWindow: 'day' })
    ]);
    groups = [['movie', 'cinema', recentMovies], ['movie', 'upcoming', upcoming], ['movie', 'trending', trend]];
  } else if (category === 'streaming') {
    const [movies, tv] = await Promise.all([
      query('/discover/movies', { ...streaming, sortBy: 'popularity.desc', primaryReleaseDateLte: today }),
      query('/discover/tv', { ...streaming, sortBy: 'popularity.desc', firstAirDateLte: today })
    ]);
    groups = [['movie', 'streaming', movies], ['tv', 'streaming', tv]];
  } else if (category === 'series') {
    const [newSeries, daily] = await Promise.all([
      query('/discover/tv', { sortBy: 'first_air_date.desc', firstAirDateGte: recent, firstAirDateLte: today, voteCountGte: 15 }),
      query('/discover/trending', { mediaType: 'tv', timeWindow: 'day' })
    ]);
    groups = [['tv', 'series', newSeries], ['tv', 'trending', daily]];
  } else if (category === 'anime') {
    const [popular, secondPage] = await Promise.all([
      query('/discover/tv', { sortBy: 'popularity.desc', genre: 16, withOriginalLanguage: 'ja', voteCountGte: 20 }),
      query('/discover/tv', { sortBy: 'vote_average.desc', genre: 16, withOriginalLanguage: 'ja', voteCountGte: 100, page: Math.min(500, page + 1) })
    ]);
    groups = [['tv', 'anime', popular], ['tv', 'anime', secondPage]];
  } else if (category === 'animation') {
    const [popular, acclaimed] = await Promise.all([
      query('/discover/movies', { sortBy: 'popularity.desc', genre: 16, voteCountGte: 40 }),
      query('/discover/movies', { sortBy: 'vote_average.desc', genre: 16, voteCountGte: 180, page: Math.min(500, page + 1) })
    ]);
    groups = [['movie', 'animation', popular], ['movie', 'animation', acclaimed]];
  } else if (category === 'classics') {
    const classics = await query('/discover/movies', {
      sortBy: 'vote_average.desc', primaryReleaseDateLte: classicCutoff,
      voteCountGte: 600, page: Math.min(500, rotationPage + page - 1)
    });
    groups = [['movie', 'classics', classics]];
  } else if (category === 'gems') {
    const [movies, tv] = await Promise.all([
      query('/discover/movies', { sortBy: 'vote_average.desc', voteAverageGte: '7.2', voteCountGte: '160' }),
      query('/discover/tv', { sortBy: 'vote_average.desc', voteAverageGte: '7.3', voteCountGte: '100' })
    ]);
    groups = [['movie', 'quality', movies], ['tv', 'quality', tv]];
  } else if (category === 'trending') {
    const [daily, weekly] = await Promise.all([
      query('/discover/trending', { mediaType: 'all', timeWindow: 'day' }),
      query('/discover/trending', { mediaType: 'all', timeWindow: 'week' })
    ]);
    groups = [[null, 'trending', daily], [null, 'trending-week', weekly]];
  } else {
    const [cinema, upcoming, streamingMovies, streamingTv, series, daily, weekly, qualityMovies, qualityTv] = await Promise.all([
      query('/discover/movies', { sortBy: 'primary_release_date.desc', primaryReleaseDateGte: recent, primaryReleaseDateLte: today, voteCountGte: 20 }),
      query('/discover/movies/upcoming'),
      query('/discover/movies', { ...streaming, sortBy: 'popularity.desc', primaryReleaseDateGte: recent, primaryReleaseDateLte: today }),
      query('/discover/tv', { ...streaming, sortBy: 'popularity.desc', firstAirDateGte: recent, firstAirDateLte: today }),
      query('/discover/tv', { sortBy: 'first_air_date.desc', firstAirDateGte: recent, firstAirDateLte: today, voteCountGte: 15 }),
      query('/discover/trending', { mediaType: 'all', timeWindow: 'day' }),
      query('/discover/trending', { mediaType: 'all', timeWindow: 'week' }),
      query('/discover/movies', { sortBy: 'vote_average.desc', voteAverageGte: '7.2', voteCountGte: '160' }),
      query('/discover/tv', { sortBy: 'vote_average.desc', voteAverageGte: '7.3', voteCountGte: '100' })
    ]);
    groups = [
      ['movie', 'cinema', cinema], ['movie', 'upcoming', upcoming],
      ['movie', 'streaming', streamingMovies], ['tv', 'streaming', streamingTv],
      ['tv', 'series', series], [null, 'trending', daily], [null, 'trending-week', weekly],
      ['movie', 'quality', qualityMovies], ['tv', 'quality', qualityTv]
    ];
  }
  const genreSlug = normalizedDiscoveryGenre(genre);
  if (genreSlug) {
    const movieGenre = discoveryGenreId(genreSlug, 'movie');
    const tvGenre = discoveryGenreId(genreSlug, 'tv');
    const genreGroups = await Promise.all([
      category === 'series' || category === 'anime' ? null : query('/discover/movies', { ...(category === 'streaming' ? streaming : {}), sortBy: 'popularity.desc', genre: movieGenre, voteCountGte: 30 }),
      ['cinema', 'animation', 'classics'].includes(category) ? null : query('/discover/tv', { ...(category === 'streaming' ? streaming : {}), sortBy: 'popularity.desc', genre: tvGenre, voteCountGte: 20 })
    ]);
    if (genreGroups[0]) groups.push(['movie', 'genre', genreGroups[0]]);
    if (genreGroups[1]) groups.push(['tv', 'genre', genreGroups[1]]);
  }
  const unique = new Map();
  groups.forEach(([type, source, payload]) => {
    (payload?.results || []).forEach(raw => {
      const normalizedSource = source === 'trending-week' ? 'trending' : source;
      const item = normalizedDiscoveryItem(raw, type || raw.mediaType, normalizedSource);
      if (!item) return;
      const key = category === 'year' ? `${source}:${item.mediaType}:${item.id}` : `${item.mediaType}:${item.id}`;
      const previous = unique.get(key);
      if (!previous) return unique.set(key, { ...item, signals: [source], signalCount: 1 });
      const signals = [...new Set([...(previous.signals || []), source])];
      const winner = Number(item.score || 0) > Number(previous.score || 0) ? item : previous;
      unique.set(key, { ...winner, signals, signalCount: signals.length, score: Math.max(Number(previous.score || 0), Number(item.score || 0)) + Math.min(18, (signals.length - 1) * 5) });
    });
  });
  return discoveryCatalogPage(filterDiscoveryCatalog([...unique.values()], category, genre)
    .sort((a, b) => b.score - a.score), groups, page);
}

async function tmdbDiscovery(category, provider = '', genre = '', page = 1) {
  const selectedProvider = discoveryProviderFilter(provider);
  if (selectedProvider) return providerDiscovery(category, selectedProvider, genre, page);
  if (!tmdbConfigured()) return seerrDiscovery(category, provider, genre, page);
  const providerId = discoveryProviderFilter(provider);
  const commonStreaming = {
    watch_region: discoveryRegion,
    with_watch_monetization_types: 'flatrate|free|ads',
    ...(providerId ? { with_watch_providers: providerId } : {})
  };
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;
  const recent = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const classicCutoff = `${currentYear - 20}-12-31`;
  const rotationPage = 1 + (Math.floor(Date.now() / (7 * 86_400_000)) % 4);
  let groups = [];
  if (category === 'year') {
    const [cinema, streamingMovies, television, streamingTv] = await Promise.all([
      tmdb('/discover/movie', {
        region: discoveryRegion, sort_by: 'popularity.desc', with_release_type: '2|3',
        'primary_release_date.gte': yearStart, 'primary_release_date.lte': yearEnd, 'vote_count.gte': 20, page
      }),
      tmdb('/discover/movie', {
        ...commonStreaming, sort_by: 'popularity.desc',
        'primary_release_date.gte': yearStart, 'primary_release_date.lte': yearEnd, page
      }),
      tmdb('/discover/tv', {
        sort_by: 'popularity.desc', 'first_air_date.gte': yearStart, 'first_air_date.lte': yearEnd,
        'vote_count.gte': 15, page
      }),
      tmdb('/discover/tv', {
        ...commonStreaming, sort_by: 'popularity.desc',
        'first_air_date.gte': yearStart, 'first_air_date.lte': yearEnd, page
      })
    ]);
    groups = [
      ['movie', 'annual-cinema', cinema],
      ['movie', 'annual-movie-streaming', streamingMovies],
      ['tv', 'annual-tv', television],
      ['tv', 'annual-tv-streaming', streamingTv]
    ];
  } else if (category === 'cinema') {
    const [now, upcoming, trend] = await Promise.all([
      tmdb('/movie/now_playing', { region: discoveryRegion, page }),
      tmdb('/movie/upcoming', { region: discoveryRegion, page }),
      tmdb('/trending/movie/day', { page })
    ]);
    groups = [['movie', 'cinema', now], ['movie', 'upcoming', upcoming], ['movie', 'trending', trend]];
  } else if (category === 'streaming') {
    groups = [
      ['movie', 'streaming', await tmdb('/discover/movie', {
        ...commonStreaming,
        sort_by: 'popularity.desc',
        'primary_release_date.lte': today,
        page
      })],
      ['tv', 'streaming', await tmdb('/discover/tv', {
        ...commonStreaming,
        sort_by: 'popularity.desc',
        'first_air_date.lte': today,
        page
      })]
    ];
  } else if (category === 'series') {
    const [airing, daily] = await Promise.all([
      tmdb('/tv/on_the_air', { timezone: 'Europe/Paris', page }),
      tmdb('/trending/tv/day', { page })
    ]);
    groups = [['tv', 'series', airing], ['tv', 'trending', daily]];
  } else if (category === 'anime') {
    const [popular, acclaimed] = await Promise.all([
      tmdb('/discover/tv', { sort_by: 'popularity.desc', with_genres: 16, with_original_language: 'ja', 'vote_count.gte': 20, page }),
      tmdb('/discover/tv', { sort_by: 'vote_average.desc', with_genres: 16, with_original_language: 'ja', 'vote_count.gte': 100, page: Math.min(500, page + 1) })
    ]);
    groups = [['tv', 'anime', popular], ['tv', 'anime', acclaimed]];
  } else if (category === 'animation') {
    const [popular, acclaimed] = await Promise.all([
      tmdb('/discover/movie', { sort_by: 'popularity.desc', with_genres: 16, 'vote_count.gte': 40, page }),
      tmdb('/discover/movie', { sort_by: 'vote_average.desc', with_genres: 16, 'vote_count.gte': 180, page: Math.min(500, page + 1) })
    ]);
    groups = [['movie', 'animation', popular], ['movie', 'animation', acclaimed]];
  } else if (category === 'classics') {
    const classics = await tmdb('/discover/movie', {
      sort_by: 'vote_average.desc', 'primary_release_date.lte': classicCutoff,
      'vote_count.gte': 600, page: Math.min(500, rotationPage + page - 1)
    });
    groups = [['movie', 'classics', classics]];
  } else if (category === 'gems') {
    const [movies, tv] = await Promise.all([
      tmdb('/discover/movie', { sort_by: 'vote_average.desc', 'vote_average.gte': 7.2, 'vote_count.gte': 160, page }),
      tmdb('/discover/tv', { sort_by: 'vote_average.desc', 'vote_average.gte': 7.3, 'vote_count.gte': 100, page })
    ]);
    groups = [['movie', 'quality', movies], ['tv', 'quality', tv]];
  } else if (category === 'trending') {
    const [daily, weekly] = await Promise.all([
      tmdb('/trending/all/day', { page }),
      tmdb('/trending/all/week', { page })
    ]);
    groups = [[null, 'trending', daily], [null, 'trending-week', weekly]];
  } else {
    const [cinema, upcoming, streamingMovies, streamingTv, series, daily, weekly, qualityMovies, qualityTv] = await Promise.all([
      tmdb('/movie/now_playing', { region: discoveryRegion, page }),
      tmdb('/movie/upcoming', { region: discoveryRegion, page }),
      tmdb('/discover/movie', {
        ...commonStreaming,
        sort_by: 'popularity.desc',
        'primary_release_date.gte': recent,
        'primary_release_date.lte': today,
        page
      }),
      tmdb('/discover/tv', {
        ...commonStreaming,
        sort_by: 'popularity.desc',
        'first_air_date.gte': recent,
        'first_air_date.lte': today,
        page
      }),
      tmdb('/tv/on_the_air', { timezone: 'Europe/Paris', page }),
      tmdb('/trending/all/day', { page }),
      tmdb('/trending/all/week', { page }),
      tmdb('/discover/movie', { sort_by: 'vote_average.desc', 'vote_average.gte': 7.2, 'vote_count.gte': 160, page }),
      tmdb('/discover/tv', { sort_by: 'vote_average.desc', 'vote_average.gte': 7.3, 'vote_count.gte': 100, page })
    ]);
    groups = [
      ['movie', 'cinema', cinema],
      ['movie', 'upcoming', upcoming],
      ['movie', 'streaming', streamingMovies],
      ['tv', 'streaming', streamingTv],
      ['tv', 'series', series],
      [null, 'trending', daily],
      [null, 'trending-week', weekly],
      ['movie', 'quality', qualityMovies],
      ['tv', 'quality', qualityTv]
    ];
  }
  const genreSlug = normalizedDiscoveryGenre(genre);
  if (genreSlug) {
    const movieGenre = discoveryGenreId(genreSlug, 'movie');
    const tvGenre = discoveryGenreId(genreSlug, 'tv');
    const genreGroups = await Promise.all([
      category === 'series' || category === 'anime' ? null : tmdb('/discover/movie', {
        ...(category === 'streaming' ? commonStreaming : {}), sort_by: 'popularity.desc', with_genres: movieGenre, 'vote_count.gte': 30, page
      }),
      ['cinema', 'animation', 'classics'].includes(category) ? null : tmdb('/discover/tv', {
        ...(category === 'streaming' ? commonStreaming : {}), sort_by: 'popularity.desc', with_genres: tvGenre, 'vote_count.gte': 20, page
      })
    ]);
    if (genreGroups[0]) groups.push(['movie', 'genre', genreGroups[0]]);
    if (genreGroups[1]) groups.push(['tv', 'genre', genreGroups[1]]);
  }
  const unique = new Map();
  groups.forEach(([type, source, payload]) => {
    (payload?.results || []).forEach(raw => {
      const normalizedSource = source === 'trending-week' ? 'trending' : source;
      const item = normalizedDiscoveryItem(raw, type, normalizedSource);
      if (!item) return;
      const key = category === 'year' ? `${source}:${item.mediaType}:${item.id}` : `${item.mediaType}:${item.id}`;
      const previous = unique.get(key);
      if (!previous) {
        unique.set(key, { ...item, signals: [source], signalCount: 1 });
        return;
      }
      const signals = [...new Set([...(previous.signals || []), source])];
      const winner = Number(item.score || 0) > Number(previous.score || 0) ? item : previous;
      unique.set(key, {
        ...winner,
        signals,
        signalCount: signals.length,
        score: Math.max(Number(previous.score || 0), Number(item.score || 0)) + Math.min(18, Math.max(0, signals.length - 1) * 5)
      });
    });
  });
  return discoveryCatalogPage(filterDiscoveryCatalog([...unique.values()], category, genre)
    .sort((left, right) => right.score - left.score), groups, page);
}

async function discoveryResults(category, provider = '', session = null, mode = 'balanced', genre = '', requestedPage = 1) {
  // Catégories historiques : ['smart', 'cinema', 'streaming', 'series', 'trending', 'gems'].
  // La vue annuelle s'ajoute à cette liste sans retirer les parcours existants.
  const normalizedCategory = ['smart', 'year', 'cinema', 'streaming', 'series', 'anime', 'animation', 'classics', 'trending', 'gems'].includes(category) ? category : 'smart';
  const normalizedMode = normalizedDiscoveryMode(mode);
  const normalizedGenre = normalizedDiscoveryGenre(genre);
  const page = discoveryPageNumber(requestedPage);
  const cacheKey = `${normalizedCategory}:${provider}:${normalizedMode}:${normalizedGenre}:${discoveryRegion}:${page}:${normalizedCategory === 'smart' ? (session?.user?.Id || 'guest') : 'shared'}`;
  const cached = discoveryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!discoveryMetadataConfigured()) throw new HttpError(503, 'Configure Jellyseerr/Seerr pour activer les découvertes Noctra.');

  const source = tmdbConfigured() ? 'tmdb' : 'seerr';
  const catalogKey = `${source}:${normalizedCategory}:${provider}:${normalizedGenre}:${discoveryRegion}:${page}`;
  const catalogCached = discoveryCatalogCache.get(catalogKey);
  const catalogPromise = catalogCached && catalogCached.expiresAt > Date.now()
    ? Promise.resolve(catalogCached.value)
    : tmdbDiscovery(normalizedCategory, provider, normalizedGenre, page).then(value => {
        discoveryCatalogCache.set(catalogKey, { expiresAt: Date.now() + 5 * 60_000, value });
        return value;
      });

  // V90 : le catalogue général, le profil Jellyfin, les recommandations de
  // proximité et les tendances sont lancés ensemble. Le premier affichage ne
  // paie donc plus plusieurs vagues réseau les unes après les autres.
  let smartProfile = null;
  let items = [];
  let tasteCandidates = [];
  let seerrTrends = [];
  let catalog;
  if (normalizedCategory === 'smart' && !discoveryProviderFilter(provider) && session && page === 1) {
    [catalog, smartProfile, tasteCandidates, seerrTrends] = await Promise.all([
      catalogPromise,
      jellyfinTasteProfile(session).catch(() => null),
      tmdbTasteCandidates(session).catch(() => []),
      seerrTrendCandidates().catch(() => [])
    ]);
    items = catalog.results;
    const merged = new Map();
    [...tasteCandidates, ...seerrTrends, ...items].forEach(item => {
      const key = `${item.mediaType}:${item.id}`;
      const previous = merged.get(key);
      if (!previous || Number(item.score || 0) > Number(previous.score || 0)) merged.set(key, { ...item });
      else {
        previous.signals = [...new Set([...(previous.signals || []), ...(item.signals || [])])];
        previous.signalCount = previous.signals.length;
        if (item.recommendedBy?.length) previous.recommendedBy = [...new Set([...(previous.recommendedBy || []), ...item.recommendedBy])];
        previous.recommendationWeight = Number(previous.recommendationWeight || 0) + Number(item.recommendationWeight || 0);
        previous.similarityWeight = Number(previous.similarityWeight || 0) + Number(item.similarityWeight || 0);
      }
    });
    items = [...merged.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  } else {
    catalog = await catalogPromise;
    items = catalog.results;
  }
  const personalizedSource = normalizedCategory === 'smart' ? await personalizeDiscovery(items, session, normalizedMode) : items;
  const personalizedItems = filterDiscoveryCatalog(personalizedSource, normalizedCategory, normalizedGenre);
  const profile = smartProfile ? {
    sampleSize: smartProfile.sampleSize || 0,
    playedCount: smartProfile.playedCount || 0,
    favoriteCount: smartProfile.favoriteCount || 0,
    topGenres: smartProfile.genres.slice(0, 6).map(([name]) => name),
    topPeople: smartProfile.people.slice(0, 5).map(([name]) => name),
    topStudios: smartProfile.studios.slice(0, 4).map(([name]) => name),
    movieShare: smartProfile.movies + smartProfile.series ? Math.round((smartProfile.movies / (smartProfile.movies + smartProfile.series)) * 100) : 50,
    seriesShare: smartProfile.movies + smartProfile.series ? Math.round((smartProfile.series / (smartProfile.movies + smartProfile.series)) * 100) : 50
  } : null;
  const value = {
    category: normalizedCategory,
    genre: normalizedGenre,
    mode: normalizedMode,
    source,
    warning: '',
    region: discoveryRegion,
    currentYear: new Date().getFullYear(),
    updatedAt: new Date().toISOString(),
    page,
    hasMore: catalog.hasMore,
    nextPage: catalog.nextPage,
    profile,
    engine: {
      metadata: tmdbConfigured() ? 'TMDB direct' : 'Seerr/TMDB intégré',
      personalized: Boolean(session && profile?.sampleSize),
      trackerCheck: Boolean(process.env.PROWLARR_URL && process.env.PROWLARR_API_KEY),
      requiresExternalTmdbToken: false
    },
    // V90 : ne bloque plus l'affichage initial sur 20+ appels Seerr/TMDB.
    // Les statuts de demande et plateformes légales sont enrichis paresseusement
    // côté client uniquement pour les cartes visibles.
    results: personalizedItems
  };
  discoveryCache.set(cacheKey, { expiresAt: Date.now() + (normalizedCategory === 'year' ? 5 * 60_000 : discoveryCacheTtl), value });
  return value;
}

const discoveryProviderListCache = new Map();
async function discoveryProviders(type = 'all') {
  const mediaTypes = type === 'all' ? ['movie','tv'] : [type === 'tv' ? 'tv' : 'movie'];
  const cacheKey = mediaTypes.join(':') + ':' + discoveryRegion;
  const cached = discoveryProviderListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const lists = await Promise.all(mediaTypes.map(async mediaType => {
    if (tmdbConfigured()) {
      const payload = await tmdb('/watch/providers/' + mediaType, {watch_region:discoveryRegion});
      return payload.results || [];
    }
    if (seerrDiscoveryConfigured()) {
      const payload = await jellyseerr('/api/v1/watchproviders/' + (mediaType === 'tv' ? 'tv' : 'movies') + '?watchRegion=' + encodeURIComponent(discoveryRegion));
      return Array.isArray(payload) ? payload : payload?.results || [];
    }
    return [];
  }));
  const value = {region:discoveryRegion,results:normalizeProviders(lists.flat(),discoveryRegion)};
  discoveryProviderListCache.set(cacheKey,{value,expiresAt:Date.now()+60*60_000});
  return value;
}


function arrService(type) {
  const isSonarr = type === 'sonarr';
  if (!['sonarr', 'radarr'].includes(type)) throw new HttpError(400, 'Service Arr invalide.');
  const url = isSonarr ? process.env.SONARR_URL : process.env.RADARR_URL;
  const apiKey = isSonarr ? process.env.SONARR_API_KEY : process.env.RADARR_API_KEY;
  if (!url || !apiKey) throw new HttpError(503, `${isSonarr ? 'Sonarr' : 'Radarr'} n’est pas configuré.`);
  return { type, isSonarr, url, apiKey, label: isSonarr ? 'Sonarr' : 'Radarr' };
}

function arrPoster(item) {
  const images = Array.isArray(item?.images) ? item.images : [];
  const selected = images.find(image => image.coverType === 'poster') || images[0] || {};
  return selected.remoteUrl || (/^https?:\/\//i.test(String(selected.url || '')) ? selected.url : '');
}

function normalizedArrItem(item, type) {
  const isSonarr = type === 'sonarr';
  const statistics = item.statistics || {};
  const episodeCount = Number(statistics.episodeCount || 0);
  const episodeFileCount = Number(statistics.episodeFileCount || 0);
  return {
    id: item.id,
    title: item.title || 'Sans titre',
    year: item.year || String(item.firstAired || '').slice(0, 4) || '',
    status: item.status || '',
    monitored: Boolean(item.monitored),
    path: item.path || '',
    poster: arrPoster(item),
    qualityProfileId: item.qualityProfileId || null,
    hasFile: isSonarr ? episodeFileCount > 0 : Boolean(item.hasFile),
    missing: isSonarr ? Math.max(0, episodeCount - episodeFileCount) : (item.hasFile ? 0 : 1),
    progress: isSonarr && episodeCount ? Math.round((episodeFileCount / episodeCount) * 100) : (item.hasFile ? 100 : 0),
    sizeOnDisk: Number(item.sizeOnDisk || statistics.sizeOnDisk || 0),
    tmdbId: item.tmdbId || null,
    tvdbId: item.tvdbId || null,
    nextAiring: item.nextAiring || null,
    added: item.added || null,
    seasonCount: isSonarr ? (item.seasons || []).filter(season => season.seasonNumber > 0).length : null
  };
}

function arrQueueRecord(item, type) {
  return {
    id: item.id,
    title: item.title || item.series?.title || item.movie?.title || 'Téléchargement',
    status: item.status || item.trackedDownloadStatus || '',
    protocol: item.protocol || '',
    size: Number(item.size || 0),
    sizeleft: Number(item.sizeleft || 0),
    timeleft: item.timeleft || '',
    indexer: item.indexer || '',
    downloadClient: item.downloadClient || '',
    errorMessage: item.errorMessage || '',
    seriesId: item.seriesId || item.series?.id || null,
    movieId: item.movieId || item.movie?.id || null,
    episodeId: item.episodeId || item.episode?.id || null,
    type
  };
}

function arrCalendarItem(item, type) {
  return {
    id: item.id,
    title: type === 'sonarr'
      ? `${item.series?.title || 'Série'} · S${String(item.seasonNumber || 0).padStart(2, '0')}E${String(item.episodeNumber || 0).padStart(2, '0')} ${item.title || ''}`
      : item.title || 'Film',
    date: type === 'sonarr' ? (item.airDateUtc || item.airDate) : (item.digitalRelease || item.physicalRelease || item.inCinemas),
    monitored: Boolean(item.monitored),
    hasFile: Boolean(item.hasFile),
    poster: arrPoster(type === 'sonarr' ? item.series : item),
    serviceId: type === 'sonarr' ? item.seriesId : item.id,
    episodeId: type === 'sonarr' ? item.id : null
  };
}

function arrHistoryRecord(item, type) {
  const data = item.data || {};
  return {
    id: item.id,
    date: item.date,
    eventType: item.eventType || '',
    sourceTitle: item.sourceTitle || data.sourceTitle || '',
    title: type === 'sonarr'
      ? `${item.series?.title || 'Série'}${item.episode?.title ? ` · ${item.episode.title}` : ''}`
      : item.movie?.title || item.sourceTitle || 'Film',
    quality: item.quality?.quality?.name || '',
    indexer: data.indexer || '',
    downloadClient: data.downloadClientName || data.downloadClient || ''
  };
}

async function arrSettings(type) {
  const service = arrService(type);
  const [rootFolders, qualityProfiles, tags] = await Promise.all([
    arr(service.url, service.apiKey, '/api/v3/rootfolder').catch(() => []),
    arr(service.url, service.apiKey, '/api/v3/qualityprofile').catch(() => []),
    arr(service.url, service.apiKey, '/api/v3/tag').catch(() => [])
  ]);
  return {
    rootFolders: (rootFolders || []).map(folder => ({
      id: folder.id,
      path: folder.path,
      freeSpace: Number(folder.freeSpace || 0),
      accessible: folder.accessible !== false
    })),
    qualityProfiles: (qualityProfiles || []).map(profile => ({ id: profile.id, name: profile.name })),
    tags: (tags || []).map(tag => ({ id: tag.id, label: tag.label }))
  };
}

async function arrCenter(type, view, searchParams) {
  const service = arrService(type);
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get('pageSize') || 40)));
  const query = String(searchParams.get('q') || '').trim();
  const normalizedView = ['overview', 'library', 'wanted', 'calendar', 'queue', 'history', 'add'].includes(view) ? view : 'overview';
  const today = new Date();
  const start = String(searchParams.get('start') || today.toISOString().slice(0, 10));
  const end = String(searchParams.get('end') || new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10));
  if (normalizedView === 'overview') {
    const [status, health, diskspace, queue, calendar, catalog] = await Promise.all([
      arr(service.url, service.apiKey, '/api/v3/system/status'),
      arr(service.url, service.apiKey, '/api/v3/health').catch(() => []),
      arr(service.url, service.apiKey, '/api/v3/diskspace').catch(() => []),
      arr(service.url, service.apiKey, '/api/v3/queue?page=1&pageSize=20&includeUnknownMovieItems=true&includeUnknownSeriesItems=true').catch(() => ({ records: [] })),
      arr(service.url, service.apiKey, `/api/v3/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&includeSeries=true&includeEpisodeFile=true`).catch(() => []),
      getArrCatalog(type)
    ]);
    const normalizedCatalog = catalog.map(item => normalizedArrItem(item, type));
    return {
      type, view: normalizedView, version: status.version, label: service.label,
      metrics: {
        total: normalizedCatalog.length,
        monitored: normalizedCatalog.filter(item => item.monitored).length,
        missing: normalizedCatalog.reduce((sum, item) => sum + Number(item.missing || 0), 0),
        queue: (queue.records || []).length,
        health: (health || []).length,
        freeSpace: (diskspace || []).reduce((sum, disk) => sum + Number(disk.freeSpace || 0), 0)
      },
      health,
      queue: (queue.records || []).map(item => arrQueueRecord(item, type)),
      calendar: (calendar || []).slice(0, 20).map(item => arrCalendarItem(item, type)),
      recent: normalizedCatalog.sort((a, b) => String(b.added || '').localeCompare(String(a.added || ''))).slice(0, 12)
    };
  }
  if (normalizedView === 'library' || normalizedView === 'wanted') {
    let items;
    let totalRecords;
    if (normalizedView === 'wanted' && type === 'sonarr') {
      const payload = await arr(service.url, service.apiKey,
        `/api/v3/wanted/missing?page=${page}&pageSize=${pageSize}&sortKey=airDateUtc&sortDirection=descending&includeSeries=true`);
      items = (payload.records || []).map(record => ({
        id: record.id,
        title: `${record.series?.title || 'Série'} · S${String(record.seasonNumber || 0).padStart(2, '0')}E${String(record.episodeNumber || 0).padStart(2, '0')} ${record.title || ''}`,
        year: String(record.airDate || record.airDateUtc || '').slice(0, 4),
        monitored: Boolean(record.monitored),
        hasFile: Boolean(record.hasFile),
        missing: 1,
        poster: arrPoster(record.series),
        serviceId: record.seriesId,
        episodeId: record.id,
        date: record.airDateUtc || record.airDate || null
      }));
      totalRecords = Number(payload.totalRecords || items.length);
    } else {
      const catalog = (await getArrCatalog(type)).map(item => normalizedArrItem(item, type));
      const filtered = catalog.filter(item => {
        if (normalizedView === 'wanted' && item.missing < 1) return false;
        return !query || normalizedIdentifier(item.title).includes(normalizedIdentifier(query));
      });
      totalRecords = filtered.length;
      items = filtered
        .sort((a, b) => a.title.localeCompare(b.title, 'fr', { numeric: true, sensitivity: 'base' }))
        .slice((page - 1) * pageSize, page * pageSize);
    }
    return { type, view: normalizedView, page, pageSize, totalRecords, query, items };
  }
  if (normalizedView === 'calendar') {
    const payload = await arr(service.url, service.apiKey,
      `/api/v3/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&includeSeries=true&includeEpisodeFile=true`);
    return { type, view: normalizedView, start, end, items: (payload || []).map(item => arrCalendarItem(item, type)) };
  }
  if (normalizedView === 'queue') {
    const payload = await arr(service.url, service.apiKey,
      `/api/v3/queue?page=${page}&pageSize=${pageSize}&includeUnknownMovieItems=true&includeUnknownSeriesItems=true`);
    return { type, view: normalizedView, page, pageSize, totalRecords: payload.totalRecords || 0, items: (payload.records || []).map(item => arrQueueRecord(item, type)) };
  }
  if (normalizedView === 'history') {
    const payload = await arr(service.url, service.apiKey,
      `/api/v3/history?page=${page}&pageSize=${pageSize}&sortKey=date&sortDirection=descending&includeSeries=true&includeMovie=true`);
    return { type, view: normalizedView, page, pageSize, totalRecords: payload.totalRecords || 0, items: (payload.records || []).map(item => arrHistoryRecord(item, type)) };
  }
  return { type, view: normalizedView, settings: await arrSettings(type) };
}

async function arrLookup(type, term) {
  const service = arrService(type);
  const query = String(term || '').trim();
  if (query.length < 2) throw new HttpError(400, 'Saisis au moins deux caractères.');
  const payload = await arr(service.url, service.apiKey,
    `/api/v3/${service.isSonarr ? 'series' : 'movie'}/lookup?term=${encodeURIComponent(query)}`);
  return (payload || []).slice(0, 30).map(item => ({
    key: service.isSonarr ? `tvdb:${item.tvdbId || item.titleSlug}` : `tmdb:${item.tmdbId || item.titleSlug}`,
    title: item.title,
    year: item.year || String(item.firstAired || '').slice(0, 4) || '',
    overview: item.overview || '',
    poster: arrPoster(item),
    status: item.status || '',
    network: item.network || '',
    studio: item.studio || '',
    raw: item
  }));
}

async function addArrItem(type, body) {
  const service = arrService(type);
  const lookup = body.item && typeof body.item === 'object' ? body.item : null;
  if (!lookup?.title) throw new HttpError(400, 'Élément Arr invalide.');
  const qualityProfileId = positiveInteger(body.qualityProfileId);
  const rootFolderPath = String(body.rootFolderPath || '').trim();
  if (!qualityProfileId || !rootFolderPath) throw new HttpError(400, 'Choisis un profil qualité et un dossier racine.');
  const payload = {
    ...lookup,
    qualityProfileId,
    rootFolderPath,
    monitored: body.monitored !== false,
    tags: Array.isArray(body.tags) ? body.tags.map(Number).filter(Number.isInteger) : []
  };
  if (service.isSonarr) {
    payload.seasonFolder = body.seasonFolder !== false;
    payload.monitorNewItems = 'all';
    payload.addOptions = { monitor: body.monitor || 'all', searchForMissingEpisodes: body.search !== false };
  } else {
    payload.minimumAvailability = body.minimumAvailability || lookup.minimumAvailability || 'released';
    payload.addOptions = { searchForMovie: body.search !== false };
  }
  const result = await arrRequest(service.url, service.apiKey,
    `/api/v3/${service.isSonarr ? 'series' : 'movie'}`, { method: 'POST', body: JSON.stringify(payload) });
  arrCatalogCache.delete(type);
  return result;
}

async function setArrMonitored(type, id, monitored) {
  const service = arrService(type);
  const item = await arr(service.url, service.apiKey, `/api/v3/${service.isSonarr ? 'series' : 'movie'}/${id}`);
  item.monitored = Boolean(monitored);
  const result = await arrRequest(service.url, service.apiKey,
    `/api/v3/${service.isSonarr ? 'series' : 'movie'}/${id}`, { method: 'PUT', body: JSON.stringify(item) });
  arrCatalogCache.delete(type);
  return result;
}

async function runArrCommand(type, body) {
  const service = arrService(type);
  const allowed = new Set([
    'RssSync', 'RefreshMonitoredDownloads',
    'RefreshSeries', 'RescanSeries', 'SeriesSearch',
    'RefreshMovie', 'RescanMovie', 'MoviesSearch'
  ]);
  const name = String(body.name || '');
  if (!allowed.has(name)) throw new HttpError(400, 'Commande Arr non autorisée.');
  const payload = { name };
  if (positiveInteger(body.seriesId)) payload.seriesId = Number(body.seriesId);
  if (positiveInteger(body.movieId)) payload.movieIds = [Number(body.movieId)];
  return arrRequest(service.url, service.apiKey, '/api/v3/command', { method: 'POST', body: JSON.stringify(payload) });
}


const tvCatalogCache = new Map();
const tvCatalogFetchPromises = new Map();
const tvLogoFetchPromises = new Map();
const tvEpgCache = new Map();
const tvEpgPromises = new Map();
const tvReferences = new Map();
const tvReferenceLifetime = 8 * 60 * 60_000;
const tvLogoIndexSchemaVersion = 2;
let iptvOrgLogoCache = { expiresAt: 0, map: null, guides: null, promise: null, schemaVersion: 0 };
let iptvOrgLogoDiskChecked = false;
const liveWatchVipDirectCache = new Map();
let liveWatchCuratedDiskCachePromise = null;
let liveWatchCuratedRefreshPromise = null;
// V94 : LiveWatch et OHA utilisent des playlists HLS qui se rafraîchissent
// fréquemment. Réutiliser la même référence locale pour une même ressource
// évite de fabriquer une nouvelle URL Noctra à chaque refresh de playlist.
// Cela réduit le churn côté HLS.js et les requêtes redondantes sans toucher à WiTV.
const tvProviderChildReferenceCache = new Map();
// V104 : les segments LiveWatch reçoivent eux aussi une identité stable liée
// à la chaîne + variante + media-sequence. Une URL CDN signée peut ainsi être
// renouvelée sans que HLS.js change de ressource locale en plein direct.
const liveWatchStableMediaResourceCache = new Map();

function tvLogoIdentityKeys(value) {
  const raw = String(value || '')
    .replace(/\s*\.(?:b|c|s)\s*$/i, ' ')
    .replace(/\b(?:hd|fhd|uhd|4k|sd|backup|live during events only|fr|us)\b/gi, ' ')
    .replace(/[._-]+/g, ' ');
  const base = normalizedIdentifier(raw)
    .replace(/\b(\d+)\s+(?:eme|ieme|e)\b/g, '$1eme')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return [];
  const keys = new Set([base]);
  const addVariants = candidate => {
    const normalized = String(candidate || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    keys.add(normalized);
    const withoutMedium = normalized.replace(/\b(?:tv|television|channel|chaine|network)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (withoutMedium) keys.add(withoutMedium);
    const compactOrdinal = normalized.replace(/\b(\d+)\s*eme\b/g, '$1eme').replace(/\s+/g, ' ').trim();
    if (compactOrdinal) keys.add(compactOrdinal);
  };
  addVariants(base);
  // Variantes éditoriales fréquentes dans les catalogues TV. Elles restent
  // strictes pour éviter d'attribuer le mauvais logo à deux chaînes proches.
  addVariants(base.replace(/\bbe\s*in\b/g, 'bein'));
  addVariants(base.replace(/\b(?:la|le)\s+chaine\b/g, ''));
  const compactBase = base.replace(/[^a-z0-9+]+/g, '');
  if (compactBase) keys.add(`compact:${compactBase}`);
  // Les catalogues LiveWatch suffixent souvent les noms avec le pays alors que
  // les référentiels de logos utilisent le nom éditorial seul (ex. « beIN
  // SPORTS 1 France » vs « beIN Sports 1 »). Ajouter une clé sans indication
  // géographique améliore fortement le taux de correspondance sans modifier le
  // nom affiché à l'utilisateur.
  const withoutCountry = base
    .replace(/\b(?:france|french|francais|belgique|belgium|suisse|switzerland|canada|quebec|luxembourg|monaco|usa|united states|america|american)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  addVariants(withoutCountry);
  const compactCountryless = withoutCountry.replace(/[^a-z0-9+]+/g, '');
  if (compactCountryless) keys.add(`compact:${compactCountryless}`);
  return [...keys];
}

function tvLogoChannelIdKey(value) {
  const id = String(value || '').trim().toLowerCase();
  return id ? `channel-id:${id}` : '';
}

function shareTvLogosAcrossDuplicateNames(channels) {
  const source = Array.isArray(channels) ? channels : [];
  const bestByKey = new Map();
  for (const channel of source) {
    if (!channel?.logo) continue;
    for (const key of tvLogoIdentityKeys(channel.name)) {
      if (!bestByKey.has(key)) bestByKey.set(key, { logo: channel.logo, secondaryLogo: channel.secondaryLogo || '' });
    }
  }
  return source.map(channel => {
    if (!channel || channel.logo) return channel;
    let match = null;
    for (const key of tvLogoIdentityKeys(channel.name)) {
      match = bestByKey.get(key);
      if (match) break;
    }
    return match ? { ...channel, logo: match.logo, secondaryLogo: channel.secondaryLogo || match.secondaryLogo || '' } : channel;
  });
}

async function readPersistedTvLogoIndex() {
  try {
    const payload = JSON.parse(await readFile(tvLogoIndexCachePath, 'utf8'));
    const schemaVersion = Number(payload?.version || 0);
    if (![1, tvLogoIndexSchemaVersion].includes(schemaVersion) || !Array.isArray(payload?.entries)) return null;
    const entries = payload.entries.filter(entry => Array.isArray(entry) && entry.length === 2 && entry[0] && entry[1]?.logo);
    if (!entries.length) return null;
    const map = new Map(entries);
    for (const [, entry] of entries) {
      const idKey = tvLogoChannelIdKey(entry?.channelId);
      if (idKey && !map.has(idKey)) map.set(idKey, entry);
    }
    return {
      expiresAt: Number(payload.expiresAt || 0),
      map,
      guides: new Map(),
      promise: null,
      schemaVersion
    };
  } catch {
    return null;
  }
}

async function persistTvLogoIndex(index, expiresAt) {
  if (!(index instanceof Map) || !index.size) return;
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(tvLogoIndexCachePath, JSON.stringify({
    version: tvLogoIndexSchemaVersion,
    savedAt: Date.now(),
    expiresAt,
    entries: [...index.entries()]
  })).catch(() => undefined);
}

function scheduleTvLogoIndexRefresh() {
  const timer = setTimeout(() => {
    iptvOrgLogoCache.expiresAt = 0;
    void iptvOrgLogoIndex().catch(() => undefined);
  }, 120);
  timer.unref?.();
}

async function iptvOrgLogoIndex(waitForRefresh = false) {
  if (!iptvOrgLogoDiskChecked) {
    iptvOrgLogoDiskChecked = true;
    const persisted = await readPersistedTvLogoIndex();
    if (persisted?.map?.size) {
      iptvOrgLogoCache = persisted;
      const staleSchema = persisted.schemaVersion < tvLogoIndexSchemaVersion;
      if (!persisted.guides?.size || persisted.expiresAt <= Date.now() || staleSchema) scheduleTvLogoIndexRefresh();
      if (!waitForRefresh || !staleSchema) return iptvOrgLogoCache;
      iptvOrgLogoCache.expiresAt = 0;
    }
  }
  if (iptvOrgLogoCache.map
    && iptvOrgLogoCache.schemaVersion >= tvLogoIndexSchemaVersion
    && iptvOrgLogoCache.expiresAt > Date.now()) return iptvOrgLogoCache;
  // Une revalidation réseau en arrière-plan ne doit jamais retenir le premier
  // affichage : l'index disque reste exploitable jusqu'à son remplacement.
  if (iptvOrgLogoCache.promise) return waitForRefresh || !iptvOrgLogoCache.map
    ? iptvOrgLogoCache.promise
    : iptvOrgLogoCache;
  const previousMap = iptvOrgLogoCache.map;
  const previousGuides = iptvOrgLogoCache.guides;
  iptvOrgLogoCache.promise = (async () => {
    // Les index officiels dépassent désormais plusieurs mégaoctets. Le délai
    // historique de 5,5 s interrompait leur téléchargement avant le premier
    // affichage ; le résultat compact est maintenant conservé sur disque.
    const [channelsResponse, logosResponse, guidesResponse] = await Promise.all([
      fetchTvRemote('https://iptv-org.github.io/api/channels.json', { signal: AbortSignal.timeout(25_000), headers: { accept: 'application/json', 'user-agent': 'Noctra-Media-Client/139' } }),
      fetchTvRemote('https://iptv-org.github.io/api/logos.json', { signal: AbortSignal.timeout(25_000), headers: { accept: 'application/json', 'user-agent': 'Noctra-Media-Client/139' } }),
      fetchTvRemote('https://iptv-org.github.io/api/guides.json', { signal: AbortSignal.timeout(25_000), headers: { accept: 'application/json', 'user-agent': 'Noctra-Media-Client/139' } }).catch(() => null)
    ]);
    if (!channelsResponse.ok || !logosResponse.ok) throw new Error('Catalogue de logos iptv-org indisponible.');
    const [channels, logos, guides] = await Promise.all([
      channelsResponse.json(), logosResponse.json(), guidesResponse?.ok ? guidesResponse.json() : Promise.resolve([])
    ]);
    const bestLogoByChannel = new Map();
    for (const logo of Array.isArray(logos) ? logos : []) {
      if (!logo?.channel || !logo?.url) continue;
      const current = bestLogoByChannel.get(logo.channel);
      const score = (logo.in_use ? 100000 : 0) + Number(logo.width || 0) + (/horizontal/i.test((logo.tags || []).join(' ')) ? 1000 : 0);
      if (!current || score > current.score) bestLogoByChannel.set(logo.channel, { url: String(logo.url), score });
    }
    const guidesByChannel = new Map();
    for (const guide of Array.isArray(guides) ? guides : []) {
      if (!guide?.channel || !Array.isArray(guide.sources) || !guide.sources.length) continue;
      const list = guidesByChannel.get(guide.channel) || [];
      list.push({
        siteId: String(guide.site_id || '').trim(),
        siteName: String(guide.site_name || '').trim(),
        lang: String(guide.lang || '').trim(),
        site: String(guide.site || '').trim(),
        sources: guide.sources.filter(item => item?.url).map(item => String(item.url))
      });
      guidesByChannel.set(guide.channel, list);
    }
    const preferredCountries = new Set(['FR','BE','CH','CA','LU','MC','US']);
    const index = new Map();
    const indexedChannels = (Array.isArray(channels) ? channels : []).filter(channel => channel?.id);
    for (const channel of indexedChannels) {
      const logo = bestLogoByChannel.get(channel.id)?.url || '';
      if (!logo) continue;
      const entry = { logo, channelId: channel.id, country: channel.country || '' };
      index.set(tvLogoChannelIdKey(channel.id), entry);
    }
    // Les identifiants EPG sont fiables dans tous les pays. Pour les recherches
    // par nom, les chaînes francophones et nord-américaines gardent la priorité
    // afin d'éviter qu'un homonyme international remplace leur identité visuelle.
    const channelsByNamePriority = [...indexedChannels].sort((left, right) => {
      const score = channel => preferredCountries.has(String(channel.country || '').toUpperCase()) ? 0 : 1;
      return score(left) - score(right);
    });
    for (const channel of channelsByNamePriority) {
      const logo = bestLogoByChannel.get(channel.id)?.url || '';
      if (!logo) continue;
      const names = [channel.name, ...(Array.isArray(channel.alt_names) ? channel.alt_names : [])].filter(Boolean);
      const entry = { logo, channelId: channel.id, country: channel.country || '' };
      for (const name of names) {
        for (const key of tvLogoIdentityKeys(name)) {
          if (key && !index.has(key)) index.set(key, entry);
        }
      }
    }
    const expiresAt = Date.now() + 24 * 60 * 60_000;
    const result = { expiresAt, map: index, guides: guidesByChannel, promise: null, schemaVersion: tvLogoIndexSchemaVersion };
    iptvOrgLogoCache = result;
    void persistTvLogoIndex(index, expiresAt);
    return result;
  })().catch(error => {
    iptvOrgLogoCache = {
      expiresAt: Date.now() + 10 * 60_000,
      map: previousMap instanceof Map ? previousMap : new Map(),
      guides: previousGuides instanceof Map ? previousGuides : new Map(),
      promise: null,
      schemaVersion: Number(iptvOrgLogoCache.schemaVersion || 0)
    };
    console.warn('Noctra TV : enrichissement iptv-org indisponible.', error?.message || error);
    return iptvOrgLogoCache;
  });
  return waitForRefresh || !previousMap ? iptvOrgLogoCache.promise : iptvOrgLogoCache;
}

async function enrichTvLogosFromIptvOrg(channels, preferFresh = false, waitForRefresh = false) {
  const metadata = await iptvOrgLogoIndex(waitForRefresh);
  const index = metadata?.map;
  if (!index?.size) return channels;
  return (channels || []).map(channel => {
    let match = [channel?.iptvOrgId, channel?.epgId]
      .map(tvLogoChannelIdKey)
      .filter(Boolean)
      .map(key => index.get(key))
      .find(Boolean) || null;
    for (const key of tvLogoIdentityKeys(channel?.name)) {
      if (match) break;
      match = index.get(key);
      if (match) break;
    }
    if (!match) return channel;
    const fallbackLogo = match.logo || '';
    const primaryLogo = preferFresh && fallbackLogo ? fallbackLogo : (channel.logo || fallbackLogo);
    const secondaryLogo = preferFresh && fallbackLogo && channel.logo && channel.logo !== fallbackLogo
      ? channel.logo
      : (channel.logo && fallbackLogo && channel.logo !== fallbackLogo ? (channel.secondaryLogo || fallbackLogo) : channel.secondaryLogo);
    return {
      ...channel,
      logo: primaryLogo,
      secondaryLogo,
      iptvOrgId: match.channelId || channel.iptvOrgId || ''
    };
  });
}

async function iptvOrgProgramme(channelId) {
  const id = String(channelId || '').trim();
  if (!id) return { now: null, next: null, available: false };
  const metadata = await iptvOrgLogoIndex();
  const candidates = metadata?.guides?.get(id) || [];
  const sorted = [...candidates].sort((left, right) => {
    const score = item => (/^fr$/i.test(item.lang) ? 0 : /^en$/i.test(item.lang) ? 1 : 2) + (item.sources?.length ? 0 : 10);
    return score(left) - score(right);
  });
  for (const candidate of sorted.slice(0, 4)) {
    for (const sourceUrl of (candidate.sources || []).slice(0, 2)) {
      try {
        const guide = await tvEpg(sourceUrl);
        if (!guide?.size) continue;
        const keys = [candidate.siteId, candidate.siteName, id].filter(Boolean);
        let programmes = [];
        for (const key of keys) {
          programmes = guide.get(key) || guide.get(normalizedIdentifier(key)) || [];
          if (programmes.length) break;
        }
        if (!programmes.length) continue;
        const nowMs = Date.now();
        const now = programmes.find(item => item.start <= nowMs && item.stop > nowMs) || null;
        const next = programmes.find(item => item.start > nowMs) || null;
        if (now || next) return { now, next, available: true, provider: candidate.siteName || candidate.site || 'iptv-org EPG' };
      } catch {}
    }
  }
  try {
    const guide = await tvEpg(defaultTvEpgUrl);
    const baseId = id.replace(/@.*$/, '');
    const programmes = guide.get(id)
      || guide.get(baseId)
      || guide.get(normalizedIdentifier(id))
      || guide.get(normalizedIdentifier(baseId))
      || [];
    const nowMs = Date.now();
    const now = programmes.find(item => item.start <= nowMs && item.stop > nowMs) || null;
    const next = programmes.find(item => item.start > nowMs) || null;
    if (now || next) return { now, next, available: true, provider: 'XML TV Fr' };
  } catch {}
  return { now: null, next: null, available: false };
}

function tvSourceId(name, url) {
  return createHash('sha256').update(`${name}\n${url}`).digest('hex').slice(0, 16);
}

function safeTvRemoteUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new HttpError(400, 'URL TV invalide.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'Seules les sources TV HTTP et HTTPS sont acceptées.');
  if (url.username || url.password) throw new HttpError(400, 'Les identifiants intégrés dans une URL ne sont pas acceptés.');
  const host = url.hostname.toLocaleLowerCase('en').replace(/^\[|\]$/g, '');
  const privateHost = host === 'localhost'
    || host === '::1'
    || host.endsWith('.local')
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (privateHost) throw new HttpError(400, 'Les adresses réseau privées ne peuvent pas être utilisées comme source TV.');
  return url;
}

function tvLikelyMediaUrl(value) {
  try {
    const url = safeTvRemoteUrl(value);
    const text = `${url.pathname}${url.search}`.toLowerCase();
    return /\.(?:m3u8?|mpd|m4s|ts|aac|m4a|mp4|webm|mkv|key)(?:$|[?#&])/i.test(text)
      || /(?:^|\/)(?:hls|dash|manifest|playlist|segments?|chunks?|stream|live)(?:\/|$|[?._-])/i.test(url.pathname)
      || /(?:manifest|playlist|m3u8|mpd|segment|chunk|stream)=/i.test(url.search);
  } catch { return false; }
}

function tvBridgeMediaResponseAllowed(urlValue, contentTypeValue = '') {
  if (tvLikelyMediaUrl(urlValue)) return true;
  const type = String(contentTypeValue || '').split(';', 1)[0].trim().toLowerCase();
  return type.startsWith('video/')
    || type.startsWith('audio/')
    || /^(?:application\/(?:vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))$/.test(type);
}

function privateTvAddress(address) {
  const value = String(address || '').toLowerCase();
  return value === '::1'
    || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')
    || /^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(value)
    || /^0\./.test(value)
    || /^::ffff:(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value);
}

async function assertPublicTvUrl(urlValue) {
  const url = safeTvRemoteUrl(urlValue);
  const results = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
  if (results.some(result => privateTvAddress(result.address))) throw new HttpError(400, 'Cette source TV pointe vers une adresse réseau privée.');
  return url;
}

async function fetchTvRemote(urlValue, options = {}, maxRedirects = 7) {
  let url = await assertPublicTvUrl(urlValue);
  let requestOptions = { ...options, headers: { ...(options.headers || {}) } };
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await fetch(url, { ...requestOptions, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    if (redirect === maxRedirects) throw new HttpError(508, 'La source TV effectue trop de redirections.');
    const nextUrl = await assertPublicTvUrl(new URL(location, url).toString());
    if (nextUrl.origin !== url.origin) {
      const nextHeaders = { ...(requestOptions.headers || {}) };
      // Même règle qu'un navigateur : un redirect vers un CDN tiers ne doit
      // jamais emporter le bearer/cookies/API key. Les signatures OHA sont en
      // revanche conservées lors d'une redirection strictement OHA -> OHA
      // (www/oha.cx), sinon un redirect canonique casserait l'appel
      // signé avant même que le client officiel puisse recevoir sa réponse.
      const trustedOhaRedirect = /^(?:www\.)?oha\.(?:to|cx)$/i.test(url.hostname)
        && /^(?:www\.)?oha\.(?:to|cx)$/i.test(nextUrl.hostname);
      const trustedLiveWatchRedirect = /^(?:www\.)?livewatch\.top$/i.test(url.hostname)
        && /^(?:www\.)?livewatch\.top$/i.test(nextUrl.hostname);
      const trustedProviderRedirect = trustedOhaRedirect || trustedLiveWatchRedirect;
      const strip = [
        ...(trustedLiveWatchRedirect ? [] : ['authorization', 'apikey']),
        ...(trustedProviderRedirect ? [] : ['cookie']),
        ...(trustedOhaRedirect ? [] : ['mediahubmx-signature', 'mediaurl-signature'])
      ];
      for (const name of strip) {
        delete nextHeaders[name];
        delete nextHeaders[name.toLowerCase()];
        delete nextHeaders[name.toUpperCase()];
      }
      if (trustedProviderRedirect) {
        const receivedCookie = tvResponseCookieHeader(response);
        if (receivedCookie) nextHeaders.cookie = mergeTvCookieHeaders(nextHeaders.cookie || '', receivedCookie);
      }
      requestOptions = { ...requestOptions, headers: nextHeaders };
    }
    if (response.status === 303 && !['GET', 'HEAD'].includes(String(requestOptions.method || 'GET').toUpperCase())) {
      requestOptions = { ...requestOptions, method: 'GET' };
      delete requestOptions.body;
    }
    try { await response.body?.cancel?.(); } catch {}
    url = nextUrl;
  }
  throw new HttpError(508, 'Redirection TV invalide.');
}


async function fetchTvRemoteUntilHeaders(urlValue, options = {}, timeoutMs = 18_000) {
  // AbortSignal.timeout() reste actif pendant la lecture du body. Sur un flux
  // long-lived, cela peut couper une vidéo parfaitement saine après N secondes.
  // Ici le délai ne protège que l'établissement de la réponse (DNS/TLS/headers),
  // puis le body peut continuer à être relayé sans timer artificiel.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Délai de connexion TV dépassé.')), Math.max(2_500, Number(timeoutMs) || 18_000));
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  try {
    // Une seule reprise transparente, avant d'envoyer le moindre octet au
    // lecteur. Pas de retry des refus d'accès/429 ni des requêtes mutantes.
    const retryableMethod = /^(?:GET|HEAD)$/i.test(options.method || 'GET');
    for (let attempt = 0; ; attempt += 1) {
      let response;
      try {
        response = await fetchTvRemote(urlValue, { ...options, signal });
      } catch (error) {
        const transportFailure = error instanceof TypeError || /^(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR_SOCKET)$/.test(String(error?.cause?.code || error?.code || ''));
        if (attempt || !retryableMethod || signal.aborted || !transportFailure) throw error;
        await delay(200);
        signal.throwIfAborted();
        continue;
      }
      if (attempt || !retryableMethod || ![502, 503, 504].includes(response.status) || response.headers.get('retry-after')) return response;
      try { await response.body?.cancel?.(); } catch {}
      await delay(200);
      signal.throwIfAborted();
    }
  } finally {
    clearTimeout(timer);
  }
}

async function readTvPlaylistBody(response, timeoutMs = 12_000) {
  const reader = response.body?.getReader?.();
  let timer;
  try {
    const read = async () => {
      if (!reader) return response.text();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) throw new HttpError(413, 'Playlist TV trop volumineuse.');
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks).toString('utf8');
    };
    const text = await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(504, 'La playlist TV ne termine pas sa réponse.')), timeoutMs);
    })]);
    if (!/^\s*#EXTM3U(?:\s|$)/i.test(text)) throw new HttpError(415, 'Le fournisseur a renvoyé une page ou une réponse invalide à la place de la playlist.');
    return text;
  } finally {
    clearTimeout(timer);
    try { await reader?.cancel?.(); } catch {}
  }
}

function decodeTvWrappedUrl(value) {
  const initial = safeTvRemoteUrl(value);
  const encoded = initial.searchParams.get('q');
  if (encoded && /(?:rebrand\.ly|rcut\.in)$/i.test(initial.hostname)) {
    try {
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
      const decoded = Buffer.from(normalized, 'base64').toString('utf8').trim();
      if (/^https?:\/\//i.test(decoded)) return safeTvRemoteUrl(decoded);
    } catch {
      // La source courte sera utilisée telle quelle si elle n’encode pas une URL.
    }
  }
  return initial;
}

function normalizeTvSourceType(value) {
  const type = String(value || 'auto').toLocaleLowerCase('en');
  return ['auto', 'playlist', 'json', 'livewatch', 'witv', 'oha', 'fstv', 'dlstreams', 'streamsports99', 'streamed', 'volkamax', 'alternative', 'daddylive', 'brigitte', 'portal'].includes(type) ? type : 'auto';
}

function optionalTvRemoteUrl(value) {
  const source = String(value || '').trim();
  return source ? safeTvRemoteUrl(source).toString() : '';
}

const liveWatchChannelCatalogUrls = [
  ['LiveWatch', 'https://livewatch.top/api/v1/public/all'],
  ['NorthTV', 'https://livewatch.top/api/v1/public/north/channels'],
  ['FrameTV', 'https://livewatch.top/api/v1/public/frame/channels']
];

const liveWatchBuiltInSources = [
  { id: 'livewatch-curated', name: 'LiveWatch', section: 'channels', description: 'Catalogue LiveWatch officiel · sources alternatives séparées', url: liveWatchChannelCatalogUrls[0][1], curated: true },
  // Les familles fonctionnelles restent distinctes de LiveWatch principal.
  { id: 'livewatch-daddy', name: 'Daddy TV', section: 'channels', description: 'Catalogue Daddy TV · accès LiveWatch VIP', url: 'https://livewatch.top/api/v1/public/daddy/channels', family: 'daddy' },
  { id: 'livewatch-north', name: 'NorthTV', section: 'channels', description: 'NorthTV · direct HLS officiel LiveWatch', url: liveWatchChannelCatalogUrls[1][1], family: 'north' },
  { id: 'livewatch-frame', name: 'FrameTV', section: 'channels', description: 'FrameTV · direct HLS résolu par LiveWatch', url: liveWatchChannelCatalogUrls[2][1], family: 'frame' },
  { id: 'livewatch-sports', name: 'Sports', section: 'sports', description: 'Événements sportifs du jour', url: 'https://livewatch.top/api/v1/public/sports' },
  { id: 'livewatch-football', name: 'Football Live', section: 'sports', description: 'Football Live · embeds multi-serveurs opaques LiveWatch', url: 'https://livewatch.top/api/v1/public/football' },
  { id: 'livewatch-bosstv', name: 'BossTV', section: 'sports', description: 'BossTV · embeds multi-serveurs opaques LiveWatch', url: 'https://livewatch.top/api/v1/public/bosstv' },
  { id: 'livewatch-jacktv', name: 'JackTV', section: 'sports', description: 'Matchs, scores et informations JackTV', url: 'https://livewatch.top/api/v1/public/jacktv/matches' },
  { id: 'livewatch-daily', name: 'Matchs du jour', section: 'sports', description: 'Programme sportif quotidien', url: 'https://livewatch.top/api/v1/public/sports/daily' }
].map(source => ({ ...source, type: 'livewatch', provider: 'LiveWatch', origin: 'builtin', editable: false }));

const liveWatchOrigin = 'https://livewatch.top';
// V75: the v74 bundle accidentally changed the payload of the public Supabase
// anon JWT without re-signing it (iss=HS256 instead of iss=supabase). Supabase
// correctly rejected it as "Invalid API key". Keep the last known-good public
// client key as a fallback, and rediscover the current public frontend config
// from LiveWatch itself if the provider rotates project/key again.
const liveWatchSupabaseUrl = withoutSlash(process.env.LIVEWATCH_SUPABASE_URL || 'https://atrhxsizjjqjdhjafgei.supabase.co');
const liveWatchSupabaseAnonKey = String(process.env.LIVEWATCH_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cmh4c2l6ampxamRoamFmZ2VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMzQ3NzAsImV4cCI6MjA4MzcxMDc3MH0.Mc_XTxmG8zwX34WrLIasHp5C1mydTRJfaOibFtwLOb8').trim();
const liveWatchSupabaseProjectRef = (() => { try { return new URL(liveWatchSupabaseUrl).hostname.split('.')[0] || 'atrhxsizjjqjdhjafgei'; } catch { return 'atrhxsizjjqjdhjafgei'; } })();
let liveWatchPublicConfigCache = null;
let liveWatchRefreshPromise = null;

function liveWatchAnonKeyPayload(value) {
  try {
    const parts = String(value || '').split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { return null; }
}

function liveWatchValidPublicKey(value, projectRef = '') {
  const key = String(value || '').trim();
  if (!key) return false;
  if (/^sb_publishable_[A-Za-z0-9._-]+$/.test(key)) return true;
  const payload = liveWatchAnonKeyPayload(key);
  if (!payload || String(payload.role || '') !== 'anon') return false;
  if (projectRef && payload.ref && String(payload.ref) !== String(projectRef)) return false;
  return true;
}

function liveWatchConfigFromText(textValue, fallbackUrl = liveWatchSupabaseUrl) {
  const text = String(textValue || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
  const urls = [...text.matchAll(/https:\/\/([a-z0-9-]+)\.supabase\.co/gi)].map(match => `https://${match[1]}.supabase.co`);
  const keys = [
    ...text.matchAll(/sb_publishable_[A-Za-z0-9._-]+/g),
    ...text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g)
  ].map(match => match[0]);
  const urlCandidates = [...new Set([...urls, fallbackUrl].filter(Boolean))];
  for (const url of urlCandidates) {
    let ref = '';
    try { ref = new URL(url).hostname.split('.')[0] || ''; } catch {}
    const key = keys.find(candidate => liveWatchValidPublicKey(candidate, ref));
    if (key) return { url: withoutSlash(url), anonKey: key, projectRef: ref || liveWatchSupabaseProjectRef };
  }
  return null;
}

async function discoverLiveWatchPublicConfig(force = false) {
  if (!force && liveWatchPublicConfigCache?.expiresAt > Date.now()) return liveWatchPublicConfigCache.value;
  const fallback = { url: liveWatchSupabaseUrl, anonKey: liveWatchSupabaseAnonKey, projectRef: liveWatchSupabaseProjectRef };
  // Explicit administrator configuration always wins.
  if (process.env.LIVEWATCH_SUPABASE_URL || process.env.LIVEWATCH_SUPABASE_ANON_KEY) {
    liveWatchPublicConfigCache = { expiresAt: Date.now() + 60 * 60_000, value: fallback };
    return fallback;
  }
  const pages = [`${liveWatchOrigin}/`, `${liveWatchOrigin}/embed/`];
  const scripts = new Set();
  let combined = '';
  for (const pageUrl of pages) {
    try {
      const response = await fetchTvRemote(pageUrl, {
        signal: AbortSignal.timeout(8_000),
        headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'user-agent': 'Mozilla/5.0 Noctra/84' }
      });
      if (!response.ok) continue;
      const html = await response.text();
      if (html.length > 2 * 1024 * 1024) continue;
      combined += `
${html}`;
      let match;
      const re = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
      while ((match = re.exec(html)) && scripts.size < 12) {
        try {
          const url = new URL(match[1], response.url || pageUrl);
          if (['livewatch.top', 'www.livewatch.top'].includes(url.hostname.toLowerCase())) scripts.add(url.toString());
        } catch {}
      }
    } catch {}
  }
  let found = liveWatchConfigFromText(combined, fallback.url);
  if (!found) {
    for (const scriptUrl of [...scripts].slice(0, 10)) {
      try {
        const response = await fetchTvRemote(scriptUrl, {
          signal: AbortSignal.timeout(8_000),
          headers: { accept: 'application/javascript,text/javascript,*/*;q=0.5', 'user-agent': 'Mozilla/5.0 Noctra/84' }
        });
        if (!response.ok) continue;
        const length = Number(response.headers.get('content-length') || 0);
        if (length > 5 * 1024 * 1024) continue;
        const body = await response.text();
        found = liveWatchConfigFromText(body, fallback.url);
        if (found) break;
      } catch {}
    }
  }
  const value = found || fallback;
  liveWatchPublicConfigCache = { expiresAt: Date.now() + (found ? 6 * 60 * 60_000 : 10 * 60_000), value };
  return value;
}

async function readLiveWatchSession() {
  try {
    const value = JSON.parse(await readFile(liveWatchSessionPath, 'utf8'));
    return value?.accessToken && value?.refreshToken ? value : null;
  } catch {
    return null;
  }
}

async function writeLiveWatchSession(session) {
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(liveWatchSessionPath, `${JSON.stringify(session, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(liveWatchSessionPath, 0o600).catch(() => undefined);
}

async function liveWatchSupabaseJson(path, options = {}, retryPublicConfig = true) {
  const config = await discoverLiveWatchPublicConfig(false);
  const suppliedHeaders = options.headers || {};
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: {
      apikey: config.anonKey,
      'content-type': 'application/json',
      ...(String(path || '').startsWith('/auth/v1/') && !suppliedHeaders.authorization ? { authorization: `Bearer ${config.anonKey}` } : {}),
      ...suppliedHeaders
    },
    signal: AbortSignal.timeout(18_000)
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) {
    const detail = payload?.msg || payload?.message || payload?.error_description || payload?.error || `HTTP ${response.status}`;
    if (retryPublicConfig && /invalid api key|api key.*invalid/i.test(String(detail))) {
      liveWatchPublicConfigCache = null;
      await discoverLiveWatchPublicConfig(true);
      return liveWatchSupabaseJson(path, options, false);
    }
    throw new HttpError(response.status === 400 ? 401 : response.status, `Connexion LiveWatch refusée : ${detail}`);
  }
  return payload;
}

async function liveWatchProfile(accessToken, userId) {
  const query = `/rest/v1/user_profiles?select=id,email,role,is_vip,vip_granted_at&id=eq.${encodeURIComponent(userId)}`;
  const rows = await liveWatchSupabaseJson(query, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function normalizedLiveWatchSession(payload, profile, fallbackEmail = '') {
  const expiresAt = Number(payload.expires_at || 0) || Math.floor(Date.now() / 1000) + Math.max(60, Number(payload.expires_in || 3600));
  return {
    accessToken: String(payload.access_token || ''),
    refreshToken: String(payload.refresh_token || ''),
    expiresAt,
    userId: String(payload.user?.id || profile?.id || ''),
    email: String(payload.user?.email || profile?.email || fallbackEmail || '').trim(),
    role: String(profile?.role || ''),
    isVip: Boolean(profile?.is_vip || profile?.role === 'vip' || profile?.role === 'admin'),
    vipGrantedAt: profile?.vip_granted_at || null,
    updatedAt: new Date().toISOString()
  };
}

async function connectLiveWatchVip(emailValue, passwordValue) {
  const email = String(emailValue || '').trim().toLowerCase().slice(0, 254);
  const password = String(passwordValue || '');
  if (!email.includes('@') || password.length < 6 || password.length > 512) throw new HttpError(400, 'Indique les identifiants du compte LiveWatch VIP.');
  const payload = await liveWatchSupabaseJson('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  const userId = String(payload.user?.id || '');
  if (!payload.access_token || !payload.refresh_token || !userId) throw new HttpError(502, 'LiveWatch n’a pas renvoyé de session exploitable.');
  const profile = await liveWatchProfile(payload.access_token, userId);
  const session = normalizedLiveWatchSession(payload, profile, email);
  if (!session.isVip) throw new HttpError(403, 'Ce compte LiveWatch est connecté, mais son statut VIP Premium n’est pas actif.');
  await writeLiveWatchSession(session);
  return session;
}

async function refreshLiveWatchVip(session) {
  const payload = await liveWatchSupabaseJson('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: session.refreshToken })
  });
  const userId = String(payload.user?.id || session.userId || '');
  const profile = await liveWatchProfile(payload.access_token, userId);
  const refreshed = normalizedLiveWatchSession(payload, profile, session.email);
  if (!refreshed.isVip) throw new HttpError(403, 'Le statut VIP Premium de cette session LiveWatch n’est plus actif.');
  await writeLiveWatchSession(refreshed);
  return refreshed;
}

async function liveWatchAccessSession(forceRefresh = false) {
  const session = await readLiveWatchSession();
  if (!session) throw new HttpError(409, 'Aucun compte LiveWatch VIP n’est connecté dans Noctra.');
  if (!session.isVip) throw new HttpError(403, 'La session LiveWatch enregistrée n’est pas VIP Premium.');
  if (!forceRefresh && Number(session.expiresAt || 0) > Math.floor(Date.now() / 1000) + 120) return session;
  if (!liveWatchRefreshPromise) {
    liveWatchRefreshPromise = refreshLiveWatchVip(session).finally(() => { liveWatchRefreshPromise = null; });
  }
  return liveWatchRefreshPromise;
}

function maskedLiveWatchEmail(value) {
  const [name = '', domain = ''] = String(value || '').split('@');
  if (!domain) return '';
  return `${name.slice(0, 2)}${name.length > 2 ? '•••' : ''}@${domain}`;
}

async function liveWatchVipStatus(includeDetails = false) {
  const stored = await readLiveWatchSession();
  if (!stored) return { configured: false, active: false, isVip: false };
  try {
    const session = await liveWatchAccessSession();
    return {
      configured: true,
      active: true,
      isVip: true,
      ...(includeDetails ? { account: maskedLiveWatchEmail(session.email), vipGrantedAt: session.vipGrantedAt || null } : {})
    };
  } catch (error) {
    return {
      configured: true,
      active: false,
      isVip: Boolean(stored.isVip),
      ...(includeDetails ? { account: maskedLiveWatchEmail(stored.email), message: cleanError(error) } : {})
    };
  }
}

async function disconnectLiveWatchVip() {
  await unlink(liveWatchSessionPath).catch(error => {
    if (error?.code !== 'ENOENT') throw error;
  });
  liveWatchRefreshPromise = null;
  return { ok: true };
}

const liveWatchBridgeCookies = new Map();

function liveWatchBridgeKey(kindValue, idValue) {
  const { kind, id } = validLiveWatchChannelReference(kindValue, idValue);
  return `${kind}:${id}`;
}

function liveWatchFakeJwt(session) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  // Session virtuelle uniquement locale au lecteur sandboxé. On reprend les
  // claims non secrets du JWT réel afin que supabase-js retrouve exactement la
  // forme qu'il attend, mais le vrai bearer/refresh restent exclusivement côté
  // serveur Noctra et sont substitués au moment des requêtes amont.
  let realClaims = {};
  try {
    const payload = String(session.accessToken || '').split('.')[1] || '';
    if (payload) realClaims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) || {};
  } catch {}
  const profileRole = String(session.role || (session.isVip ? 'vip' : ''));
  const claims = {
    ...realClaims,
    aud: realClaims.aud || 'authenticated',
    role: 'authenticated',
    sub: session.userId || realClaims.sub || 'noctra-vip',
    email: session.email || realClaims.email || '',
    is_vip: Boolean(session.isVip),
    profile_role: profileRole,
    user_metadata: { ...(realClaims.user_metadata || {}), is_vip: Boolean(session.isVip), role: profileRole },
    app_metadata: { provider: 'email', providers: ['email'], ...(realClaims.app_metadata || {}) },
    iat: now,
    exp: now + 6 * 3600
  };
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.noctra`;
}

function liveWatchVirtualSession(session) {
  const accessToken = liveWatchFakeJwt(session);
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 6 * 3600,
    expires_at: now + 6 * 3600,
    refresh_token: 'noctra-vip-proxy',
    user: {
      id: session.userId || 'noctra-vip',
      aud: 'authenticated',
      role: 'authenticated',
      email: session.email || '',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { is_vip: Boolean(session.isVip), role: String(session.role || (session.isVip ? 'vip' : '')) },
      is_vip: Boolean(session.isVip),
      profile_role: String(session.role || (session.isVip ? 'vip' : '')),
      created_at: session.updatedAt || new Date().toISOString()
    }
  };
}

function liveWatchAllowedBridgeHost(value, publicConfig = null) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    const supabaseHost = new URL(publicConfig?.url || liveWatchSupabaseUrl).hostname.toLowerCase();
    return ['livewatch.top', 'www.livewatch.top', supabaseHost].includes(host);
  } catch { return false; }
}

function sanitizeLiveWatchPlayerHtml(htmlValue, pageUrl, kind, id, session, publicConfig = null) {
  const page = new URL(pageUrl);
  const encodedKind = encodeURIComponent(kind);
  const encodedId = encodeURIComponent(id);
  const siteRoot = publicPath(`/api/tv/livewatch/site/${encodedKind}/${encodedId}`);
  const tunnel = publicPath(`/api/tv/livewatch/http/${encodedKind}/${encodedId}`);
  const supabaseUrl = withoutSlash(publicConfig?.url || liveWatchSupabaseUrl);
  const supabaseOrigin = new URL(supabaseUrl).origin;
  const projectRef = String(publicConfig?.projectRef || (() => { try { return new URL(supabaseUrl).hostname.split('.')[0] || liveWatchSupabaseProjectRef; } catch { return liveWatchSupabaseProjectRef; } })());
  // Le client LiveWatch courant utilise une clé explicite. Conserver son nom
  // exact permet à Supabase de restaurer la session virtuelle VIP dès le
  // premier rendu, avant que la barrière publicitaire ne soit montée.
  const storageKey = 'livewatch-auth';
  const legacySessionMarker = `<meta name="noctra-legacy-auth-key" content="sb-${projectRef.replace(/[^a-z0-9_-]/gi, '')}-auth-token">`;
  const virtualSession = liveWatchVirtualSession(session);
  let html = String(htmlValue || '')
    .replace(/<meta\b[^>]*http-equiv=["']?(?:content-security-policy|x-frame-options)["']?[^>]*>/gi, '');
  const proxiedAsset = value => {
    try {
      const target = new URL(String(value || ''), page);
      if (!['livewatch.top', 'www.livewatch.top'].includes(target.hostname.toLowerCase())) return String(value || '');
      return `${siteRoot}${target.pathname}${target.search}`;
    } catch { return String(value || ''); }
  };
  const stripBridgeIntegrity = tag => String(tag || '')
    .replace(/\s+integrity\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+crossorigin(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
  // Les embeds Daddy/North sont documentés comme des iframes uniquement et
  // peuvent livrer leur <video>/<source> directement dans le HTML initial.
  // Les setters JS injectés plus bas ne voient pas les attributs créés par le
  // parseur HTML : on les réécrit donc aussi côté serveur avant exécution.
  const proxiedMedia = value => {
    try {
      const target = new URL(String(value || ''), page);
      if (['livewatch.top', 'www.livewatch.top'].includes(target.hostname.toLowerCase())) return `${siteRoot}${target.pathname}${target.search}`;
      return `${tunnel}?media=1&url=${encodeURIComponent(target.toString())}`;
    } catch { return String(value || ''); }
  };
  html = html.replace(/(<script\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_, a, value, b) => {
    const target = proxiedAsset(value);
    const tag = `${a}${target}${b}`;
    return target !== String(value || '') ? stripBridgeIntegrity(tag) : tag;
  });
  html = html.replace(/(<link\b[^>]*\bhref\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_, a, value, b) => {
    const target = proxiedAsset(value);
    const tag = `${a}${target}${b}`;
    return target !== String(value || '') ? stripBridgeIntegrity(tag) : tag;
  });
  html = html.replace(/(<(?:video|audio|source)\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_, a, value, b) => `${a}${proxiedMedia(value)}${b}`);
  html = html.replace(/(<iframe\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_, a, value, b) => `${a}${proxiedAsset(value)}${b}`);
  const siteBase = `${siteRoot}${page.pathname.replace(/[^/]*$/, '')}`;
  // V116 : DaddyTV/NorthTV/FrameTV sont eux aussi des routes de l'application
  // LiveWatch. Leur catalogue n'expose que des embed_url : le routeur officiel
  // doit donc voir /embed/daddy|north|frame/<id>, et non le pathname interne
  // /api/tv/livewatch/embed/... de Noctra. Le routeur React principal exige
  // lui aussi sa vraie route /embed/<id> : sans elle il affiche « Chaîne
  // introuvable » alors que l'identifiant et la session VIP sont valides.
  const remoteRoute = `${page.pathname || '/'}${page.search || ''}${page.hash || ''}`;
  const bridge = String.raw`<base href="${siteBase.replace(/"/g, '&quot;')}"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body,#root{width:100%;min-height:100%;margin:0;background:#000}video{max-width:100%}</style><script>(function(){const K=${JSON.stringify(storageKey)},V=${JSON.stringify(JSON.stringify(virtualSession))},T=${JSON.stringify(tunnel)},S=${JSON.stringify(siteRoot)},O=${JSON.stringify(page.toString())},LO=${JSON.stringify(page.origin)},R=${JSON.stringify(remoteRoute)},NativeURL=window.URL,NO=new NativeURL(location.href).origin,SU=${JSON.stringify(supabaseOrigin)},F=window.fetch.bind(window),XO=XMLHttpRequest.prototype.open;try{if(R)history.replaceState(history.state,'',R)}catch{};try{window.URL=new Proxy(NativeURL,{construct(Target,args,newTarget){const a=[...args];if(a.length>1&&(String(a[1])==='null'||String(a[1])==='null/'))a[1]=LO;return Reflect.construct(Target,a,newTarget)},apply(Target,thisArg,args){const a=[...args];if(a.length>1&&(String(a[1])==='null'||String(a[1])==='null/'))a[1]=LO;return Reflect.apply(Target,thisArg,a)}})}catch{};const mem=new Map([[K,V]]),store={getItem:k=>{const x=String(k);return mem.has(x)?mem.get(x):(/^sb-[a-z0-9_-]+-auth-token$/i.test(x)?V:null)},setItem:(k,v)=>mem.set(String(k),String(v)),removeItem:k=>mem.delete(String(k)),clear:()=>mem.clear(),key:i=>Array.from(mem.keys())[i]||null,get length(){return mem.size}};for(const n of ['localStorage','sessionStorage']){try{Object.defineProperty(window,n,{configurable:true,value:store})}catch{}}function mediaLike(u){const x=(u.pathname+u.search).toLowerCase();return /\.(?:m3u8?|mpd|m4s|ts|aac|m4a|mp4|webm|mkv|key)(?:$|[?#&])/.test(x)||/(?:^|\/)(?:hls|dash|manifest|playlist|segments?|chunks?|stream|live)(?:\/|$|[?._-])/.test(u.pathname.toLowerCase())||/(?:manifest|playlist|m3u8|mpd|segment|chunk|stream)=/.test(u.search.toLowerCase())}function map(v,media){try{const raw=String(v),fixed=/^null\//i.test(raw)?LO+raw.slice(4):raw,u=new URL(fixed,O);if(u.origin===NO&&u.pathname.includes('/api/tv/livewatch/'))return raw;if(media){const m=u.origin===LO?S+u.pathname+u.search:(u.origin===SU?T+'?url='+encodeURIComponent(u.href):T+'?media=1&url='+encodeURIComponent(u.href));try{parent.postMessage({type:'noctra-livewatch-state',state:'media',url:m},'*')}catch{}return m}if(u.origin===LO)return S+u.pathname+u.search;if(u.origin===SU)return T+'?url='+encodeURIComponent(u.href);if(u.origin===NO&&!u.pathname.includes('/api/tv/livewatch/'))return S+u.pathname+u.search;if(mediaLike(u)){const m=T+'?media=1&url='+encodeURIComponent(u.href);try{parent.postMessage({type:'noctra-livewatch-state',state:'media',url:m},'*')}catch{}return m}return String(v)}catch{return v}}window.fetch=async function(input,init){try{if(typeof input==='string'||input instanceof URL)return F(map(input,false),Object.assign({credentials:'omit'},init||{}));if(input instanceof Request){const mapped=map(input.url,false);if(mapped!==input.url){const clone=input.clone(),cfg={method:clone.method,headers:new Headers(clone.headers),redirect:clone.redirect,cache:clone.cache,credentials:'omit'};if(!/^(?:GET|HEAD)$/i.test(clone.method))cfg.body=await clone.arrayBuffer();return F(mapped,Object.assign(cfg,init||{},{credentials:'omit'}));}}}catch{}return F(input,init)};XMLHttpRequest.prototype.open=function(method,url){const args=[...arguments];args[1]=map(url,false);return XO.apply(this,args)};function patchSrc(proto,media){try{const d=Object.getOwnPropertyDescriptor(proto,'src');if(!d||!d.set||!d.get)return;Object.defineProperty(proto,'src',{configurable:d.configurable,enumerable:d.enumerable,get:d.get,set:function(v){return d.set.call(this,map(v,!!media))}})}catch{}}patchSrc(HTMLMediaElement.prototype,true);if(window.HTMLSourceElement)patchSrc(HTMLSourceElement.prototype,true);if(window.HTMLScriptElement)patchSrc(HTMLScriptElement.prototype,false);if(window.HTMLIFrameElement)patchSrc(HTMLIFrameElement.prototype,false);if(window.HTMLImageElement)patchSrc(HTMLImageElement.prototype,false);try{const lh=Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype,'href');if(lh?.set&&lh?.get)Object.defineProperty(HTMLLinkElement.prototype,'href',{configurable:lh.configurable,enumerable:lh.enumerable,get:lh.get,set:function(v){return lh.set.call(this,map(v,false))}})}catch{}const SA=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){const k=String(n||'').toLowerCase(),tag=String(this.tagName||'').toLowerCase(),media=k==='poster'||(k==='src'&&['video','audio','source'].includes(tag));if(['src','href','poster','action'].includes(k))v=map(v,media);return SA.call(this,n,v)};function bind(v){if(!v||v.dataset.noctraBound)return;v.dataset.noctraBound='1';try{const src=v.getAttribute('src');if(src){const mapped=map(src,true);if(mapped!==src)v.setAttribute('src',mapped)}v.querySelectorAll?.('source[src]').forEach(s=>{const src=s.getAttribute('src');if(!src)return;const mapped=map(src,true);if(mapped!==src)s.setAttribute('src',mapped)})}catch{}v.addEventListener('loadedmetadata',()=>parent.postMessage({type:'noctra-livewatch-state',state:'ready'},'*'));v.addEventListener('playing',()=>parent.postMessage({type:'noctra-livewatch-state',state:'playing'},'*'));v.addEventListener('error',()=>parent.postMessage({type:'noctra-livewatch-state',state:'error',message:'Le média LiveWatch a signalé une erreur.'},'*'));}let gateReported=false;function inspect(){document.querySelectorAll('video').forEach(bind);if(gateReported)return;const text=(document.body?.innerText||'').replace(/\s+/g,' ');if(/Débloquer (?:la chaîne|le direct)|Pub\s*1|ÉTAPE\s*1\s*\/\s*2/i.test(text)){gateReported=true;parent.postMessage({type:'noctra-livewatch-state',state:'vip-missed',message:'LiveWatch affiche encore son écran publicitaire malgré la session VIP transmise.'},'*')}}new MutationObserver(inspect).observe(document.documentElement,{childList:true,subtree:true,characterData:true});addEventListener('DOMContentLoaded',()=>{parent.postMessage({type:'noctra-livewatch-state',state:'vip-ready'},'*');inspect()});})();</script>`;
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, match => `${match}${legacySessionMarker}${bridge}`);
  else html = `<!doctype html><html><head>${legacySessionMarker}${bridge}</head><body>${html}</body></html>`;
  return html;
}

// V118 : un iframe LiveWatch préparé est volontairement sandboxé sans
// allow-same-origin. Ses sous-requêtes ne transportent donc pas le cookie de
// session Noctra. On remplace les anciennes routes kind/id par une référence
// aléatoire, courte et limitée à CE lecteur. Elle autorise uniquement le bridge
// LiveWatch et ne donne jamais accès aux autres API Noctra.
function liveWatchTokenizePreparedHtml(htmlValue, kind, id, bridgeToken) {
  const token = String(bridgeToken || '');
  if (!token) return String(htmlValue || '');
  const oldSite = publicPath(`/api/tv/livewatch/site/${encodeURIComponent(String(kind))}/${encodeURIComponent(String(id))}`);
  const oldHttp = publicPath(`/api/tv/livewatch/http/${encodeURIComponent(String(kind))}/${encodeURIComponent(String(id))}`);
  const newSite = publicPath(`/api/tv/livewatch/vip/${encodeURIComponent(token)}/site`);
  const newHttp = publicPath(`/api/tv/livewatch/vip/${encodeURIComponent(token)}/http`);
  return String(htmlValue || '').split(oldSite).join(newSite).split(oldHttp).join(newHttp);
}

function rewriteLiveWatchBridgeAssetText(textValue, kind, id, contentType = '') {
  const text = String(textValue || '');
  const siteRoot = publicPath(`/api/tv/livewatch/site/${encodeURIComponent(String(kind))}/${encodeURIComponent(String(id))}`);
  const type = String(contentType || '').toLowerCase();
  let output = text;
  if (/javascript|ecmascript|text\/plain/.test(type)) {
    output = output.replace(/https:\/\/(?:www\.)?livewatch\.top(?=\/|["'`])/gi, siteRoot);
    output = output.replace(/(["'`])\/(?!\/)((?:assets|static|_next|build|dist|chunks?|js|css|fonts?|images?|icons?|workers?|manifest|favicon)\/[^"'`\\\r\n]{1,500})\1/gi, (_m, q, path) => `${q}${siteRoot}/${path}${q}`);
  }
  if (/text\/css/.test(type)) {
    output = output.replace(/url\(\s*(["']?)\/(?!\/)([^)"']+)\1\s*\)/gi, (_m, q, path) => `url(${q}${siteRoot}/${path}${q})`);
    output = output.replace(/@import\s+(["'])\/(?!\/)([^"']+)\1/gi, (_m, q, path) => `@import ${q}${siteRoot}/${path}${q}`);
  }
  return output;
}

async function liveWatchBridgeRequest(kindValue, idValue, targetValue, req, res, { html = false, allowExternalMedia = false, bridgeToken = '' } = {}) {
  const { kind, id } = validLiveWatchChannelReference(kindValue, idValue);
  const target = safeTvRemoteUrl(targetValue);
  const publicConfig = await discoverLiveWatchPublicConfig(false);
  const officialTarget = liveWatchAllowedBridgeHost(target.toString(), publicConfig);
  const externalMedia = !officialTarget && allowExternalMedia;
  if (!officialTarget && !externalMedia) throw new HttpError(403, 'Le relais LiveWatch est limité au lecteur officiel et aux ressources média qu’il a résolues.');
  let session = await liveWatchAccessSession();
  const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req?.method) ? req.method : 'GET';
  const body = req && !['GET', 'HEAD'].includes(method) ? await readTvProxyBody(req) : undefined;
  const isSupabase = officialTarget && target.origin === new URL(publicConfig.url).origin;
  const isLiveWatch = officialTarget && ['livewatch.top', 'www.livewatch.top'].includes(target.hostname.toLowerCase());
  const key = liveWatchBridgeKey(kind, id);
  const cookies = liveWatchBridgeCookies.get(key)?.value || '';
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': req?.headers?.['access-control-request-headers'] || 'authorization,apikey,content-type,accept,range,x-client-info,prefer',
    'access-control-expose-headers': 'content-length,content-range,accept-ranges',
    'cache-control': 'no-store'
  };

  // Le player officiel n'a jamais besoin de voir le vrai bearer LiveWatch pour
  // connaître l'état VIP. Ces deux réponses Supabase sont reproduites à partir
  // de la session que Noctra a déjà vérifiée côté serveur. Cela évite qu'une
  // politique RLS ou une évolution de supabase-js fasse retomber le lecteur sur
  // le mode anonyme alors que l'administrateur est bien VIP.
  if (isSupabase && method === 'GET' && /\/auth\/v1\/user\/?$/i.test(target.pathname)) {
    const virtual = liveWatchVirtualSession(session);
    res.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(virtual.user));
  }
  if (isSupabase && method === 'GET' && /\/rest\/v1\/user_profiles\/?$/i.test(target.pathname)) {
    const role = String(session.role || (session.isVip ? 'vip' : ''));
    const profile = {
      id: session.userId || 'noctra-vip',
      email: session.email || '',
      role,
      is_vip: Boolean(session.isVip),
      vip_granted_at: session.vipGrantedAt || null
    };
    const wantsObject = /application\/vnd\.pgrst\.object\+json/i.test(String(req?.headers?.accept || ''));
    res.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8', ...(wantsObject ? { 'content-range': '0-0/1' } : {}) });
    return res.end(JSON.stringify(wantsObject ? profile : [profile]));
  }
  if (isSupabase && method === 'POST' && /\/auth\/v1\/token$/i.test(target.pathname) && target.searchParams.get('grant_type') === 'refresh_token') {
    // Le refresh token visible dans l'iframe est volontairement factice. Le
    // renouvellement réel est effectué ici avec la session serveur, puis seule
    // une nouvelle session virtuelle est renvoyée au player.
    session = await liveWatchAccessSession(true).catch(() => session);
    const virtual = liveWatchVirtualSession(session);
    res.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(virtual));
  }

  const makeHeaders = activeSession => {
    const headers = {
      accept: req?.headers?.accept || (html ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' : '*/*'),
      'accept-language': req?.headers?.['accept-language'] || 'fr-FR,fr;q=0.9,en;q=0.6',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
      origin: isSupabase || externalMedia ? liveWatchOrigin : target.origin,
      referer: liveWatchOfficialPlayerUrl(kind, id),
      ...(officialTarget ? { authorization: `Bearer ${activeSession.accessToken}` } : {}),
      ...(isSupabase ? { apikey: publicConfig.anonKey } : {}),
      ...(isLiveWatch && liveWatchBridgeCookies.get(key)?.value ? { cookie: liveWatchBridgeCookies.get(key).value } : {}),
      ...(req?.headers?.['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
      ...(req?.headers?.range ? { range: req.headers.range } : {})
    };
    // Conserver les en-têtes applicatifs non sensibles produits par le client
    // officiel (Supabase et LiveWatch utilisent notamment x-client-info/prefer).
    for (const [name, value] of Object.entries(req?.headers || {})) {
      const lower = String(name || '').toLowerCase();
      if (!value || lower in headers) continue;
      if (lower === 'prefer' || lower.startsWith('x-client-') || lower.startsWith('x-supabase-') || lower.startsWith('x-livewatch-')) headers[lower] = String(value).slice(0, 4096);
    }
    return headers;
  };
  let headers = makeHeaders(session);
  let response = externalMedia
    ? await fetchTvRemoteUntilHeaders(target.toString(), {
      method,
      headers,
      ...(body ? { body } : {})
    }, 18_000)
    : await fetchTvRemote(target.toString(), {
      method,
      headers,
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(30_000)
    });
  // Une session peut expirer entre l'ouverture du catalogue et le clic. Une
  // unique actualisation serveur évite de faire croire au player qu'il est
  // anonyme, sans jamais transmettre le refresh token au navigateur.
  if (officialTarget && (response.status === 401 || response.status === 403)) {
    try {
      await response.body?.cancel?.();
      session = await liveWatchAccessSession(true);
      headers = makeHeaders(session);
      response = await fetchTvRemote(target.toString(), {
        method,
        headers,
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(30_000)
      });
    } catch {}
  }
  if (isLiveWatch) {
    const received = tvResponseCookieHeader(response);
    if (received) liveWatchBridgeCookies.set(key, { value: mergeTvCookieHeaders(cookies, received), updatedAt: Date.now() });
  }
  if (method === 'HEAD') {
    res.writeHead(response.status, { ...cors, 'content-type': response.headers.get('content-type') || 'application/octet-stream' });
    return res.end();
  }
  const contentType = response.headers.get('content-type') || '';
  const finalUrl = response.url || target.toString();
  if (externalMedia && !tvBridgeMediaResponseAllowed(finalUrl, contentType)) {
    throw new HttpError(415, 'La ressource externe résolue par LiveWatch n’est pas un média compatible.');
  }
  if (html || /text\/html|application\/xhtml/i.test(contentType)) {
    const raw = await response.text();
    const prepared = liveWatchTokenizePreparedHtml(sanitizeLiveWatchPlayerHtml(raw, finalUrl, kind, id, session, publicConfig), kind, id, bridgeToken);
    res.writeHead(response.status, { ...cors, 'content-type': 'text/html; charset=utf-8', 'referrer-policy': 'origin-when-cross-origin', 'x-content-type-options': 'nosniff' });
    return res.end(prepared);
  }
  const playlist = /(?:mpegurl|m3u8)/i.test(contentType) || /\.m3u8?(?:$|[?#])/i.test(finalUrl);
  if (playlist) {
    const text = await readTvPlaylistBody(response);
    const playlistCookie = tvResponseCookieHeader(response);
    const inherited = {
      referer: headers.referer,
      'user-agent': headers['user-agent'],
      ...(externalMedia && playlistCookie ? { cookie: playlistCookie } : {}),
      ...(['livewatch.top', 'www.livewatch.top'].includes(new URL(finalUrl).hostname.toLowerCase()) ? { authorization: `Bearer ${session.accessToken}`, ...(liveWatchBridgeCookies.get(key)?.value ? { cookie: liveWatchBridgeCookies.get(key).value } : {}) } : {})
    };
    const rewritten = rewriteTvPlaylist(text, finalUrl, inherited, { provider: 'LiveWatch' });
    res.writeHead(response.status, { ...cors, 'content-type': 'application/vnd.apple.mpegurl; charset=utf-8', 'x-accel-buffering': 'no' });
    return res.end(rewritten);
  }
  const textual = isLiveWatch && /(?:javascript|ecmascript|text\/css|text\/plain)/i.test(contentType);
  if (textual) {
    const text = liveWatchTokenizePreparedHtml(rewriteLiveWatchBridgeAssetText(await response.text(), kind, id, contentType), kind, id, bridgeToken);
    const buffer = Buffer.from(text, 'utf8');
    const responseHeaders = { ...cors, 'content-type': contentType || 'text/plain; charset=utf-8', 'content-length': String(buffer.length) };
    res.writeHead(response.status, responseHeaders);
    return res.end(buffer);
  }
  if (externalMedia || tvBridgeMediaResponseAllowed(finalUrl, contentType)) {
    const responseHeaders = { ...cors, 'content-type': contentType || 'application/octet-stream', 'x-accel-buffering': 'no' };
    for (const h of ['content-length', 'content-range', 'accept-ranges']) { const v = response.headers.get(h); if (v) responseHeaders[h] = v; }
    try { res.socket?.setNoDelay?.(true); } catch {}
    try { res.socket?.setKeepAlive?.(true, 15_000); } catch {}
    res.writeHead(response.status, responseHeaders);
    res.flushHeaders?.();
    pipeRemoteResponseBody(response, res);
    return;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const responseHeaders = { ...cors, 'content-type': contentType || 'application/octet-stream', 'content-length': String(buffer.length) };
  for (const h of ['content-range', 'accept-ranges']) { const v = response.headers.get(h); if (v) responseHeaders[h] = v; }
  res.writeHead(response.status, responseHeaders);
  res.end(buffer);
}

function sendTvBridgeFailure(res, messageType, providerLabel, error) {
  if (res.headersSent) throw error;
  const message = cleanError(error) || `${providerLabel} indisponible.`;
  const status = Number(error?.status) >= 400 && Number(error?.status) <= 599 ? Number(error.status) : 503;
  const event = JSON.stringify({ type: messageType, state: 'error', message });
  const visible = JSON.stringify(message);
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:100%;margin:0;background:#070911;color:#d9deee;font:14px system-ui;display:grid;place-items:center}main{max-width:680px;padding:24px;text-align:center}strong{display:block;margin-bottom:8px;color:#fff}</style></head><body><main><strong>${providerLabel.replace(/</g, '&lt;')}</strong><span id="m"></span></main><script>const m=${visible};document.getElementById('m').textContent=m;try{parent.postMessage(${event},'*')}catch{}</script></body></html>`);
}

async function proxyLiveWatchVipEmbed(kind, id, res) {
  try {
    const { kind: safeKind, id: safeId } = validLiveWatchChannelReference(kind, id);
    await liveWatchAccessSession();
    const page = liveWatchOfficialPlayerUrl(safeKind, safeId);
    // Synthetic request object: the bridge substitue la session VIP côté
    // serveur sans exposer le vrai bearer/refresh dans l'iframe.
    await liveWatchBridgeRequest(safeKind, safeId, page, { method: 'GET', headers: {} }, res, { html: true });
  } catch (error) {
    sendTvBridgeFailure(res, 'noctra-livewatch-state', 'LiveWatch VIP', error);
  }
}

async function proxyLiveWatchVipSite(kind, id, req, res, requestUrl, path) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,accept,range,x-client-info',
      'access-control-max-age': '600'
    });
    return res.end();
  }
  const prefix = `/api/tv/livewatch/site/${encodeURIComponent(String(kind))}/${encodeURIComponent(String(id))}`;
  const suffix = path.startsWith(prefix) ? path.slice(prefix.length) : '';
  const target = new URL(`${suffix || '/'}${requestUrl.search || ''}`, `${liveWatchOrigin}/`).toString();
  await liveWatchBridgeRequest(kind, id, target, req, res);
}

async function proxyLiveWatchVipHttp(kind, id, req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,accept,range,x-client-info',
      'access-control-max-age': '600'
    });
    return res.end();
  }
  const raw = requestUrl.searchParams.get('url') || '';
  if (!raw) throw new HttpError(400, 'Requête LiveWatch invalide.');
  const allowExternalMedia = requestUrl.searchParams.get('media') === '1';
  await liveWatchBridgeRequest(kind, id, raw, req, res, { allowExternalMedia });
}


async function proxyLiveWatchVipTokenEmbed(tokenValue, res) {
  const bridge = liveWatchBridgeReference(tokenValue);
  if (!bridge) throw new HttpError(410, 'Le lecteur LiveWatch VIP a expiré. Recharge la chaîne.');
  try {
    await liveWatchAccessSession();
    await liveWatchBridgeRequest(bridge.kind, bridge.id, bridge.url, { method: 'GET', headers: {} }, res, {
      html: true,
      bridgeToken: bridge.token
    });
  } catch (error) {
    sendTvBridgeFailure(res, 'noctra-livewatch-state', 'LiveWatch VIP', error);
  }
}

async function proxyLiveWatchVipTokenSite(tokenValue, req, res, requestUrl, path) {
  const bridge = liveWatchBridgeReference(tokenValue);
  if (!bridge) throw new HttpError(410, 'Le lecteur LiveWatch VIP a expiré.');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,accept,range,x-client-info',
      'access-control-max-age': '600'
    });
    return res.end();
  }
  const prefix = `/api/tv/livewatch/vip/${encodeURIComponent(bridge.token)}/site`;
  const suffix = path.startsWith(prefix) ? path.slice(prefix.length) : '';
  const target = new URL(`${suffix || '/'}${requestUrl.search || ''}`, `${liveWatchOrigin}/`).toString();
  await liveWatchBridgeRequest(bridge.kind, bridge.id, target, req, res, { bridgeToken: bridge.token });
}

async function proxyLiveWatchVipTokenHttp(tokenValue, req, res, requestUrl) {
  const bridge = liveWatchBridgeReference(tokenValue);
  if (!bridge) throw new HttpError(410, 'Le lecteur LiveWatch VIP a expiré.');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,accept,range,x-client-info',
      'access-control-max-age': '600'
    });
    return res.end();
  }
  const raw = requestUrl.searchParams.get('url') || '';
  if (!raw) throw new HttpError(400, 'Requête LiveWatch invalide.');
  const allowExternalMedia = requestUrl.searchParams.get('media') === '1';
  await liveWatchBridgeRequest(bridge.kind, bridge.id, raw, req, res, {
    allowExternalMedia,
    bridgeToken: bridge.token
  });
}

const complementaryTvBuiltInSources = [
  { id: 'fstv-public', name: 'FSTV', section: 'channels', description: 'French Stream TV · catalogue public de chaînes', url: 'https://fstv.rest/', type: 'fstv', provider: 'FSTV' },
  { id: 'witv-public', name: 'WiTV', section: 'channels', description: 'Catalogue public WiTV classé par catégories', url: 'https://witv.football/', type: 'witv', provider: 'WiTV' },
  { id: 'oha-live', name: 'OHA / Kool', section: 'channels', description: 'Live TV · France · A–Z · source Kool actuelle', url: 'https://kool.ws/live', type: 'oha', provider: 'OHA' },
  { id: 'streamsports99-live-tv', name: 'StreamSports99 TV', section: 'channels', description: 'Chaînes internationales · pays et programmes Live TV', url: 'https://streamsports99.su/live-tv', type: 'streamsports99', provider: 'StreamSports99' },
  { id: 'dlstreams-sports', name: 'DLStreams', section: 'sports', description: 'Programme sportif public · lecteurs intégrés DLStreams', url: 'https://dlstreams.st/', type: 'dlstreams', provider: 'DLStreams' },
  { id: 'streamed-sports', name: 'Streamed', section: 'sports', description: 'Événements sportifs publics · streamed.pk', url: 'https://streamed.pk/', type: 'streamed', provider: 'Streamed' },
  { id: 'volkamax-sports', name: 'Volkamax', section: 'sports', description: 'BZH-Sport / Volkamax · catégories et chaînes sportives', url: 'https://bzh-sport.lat/', type: 'volkamax', provider: 'Volkamax' },
  { id: 'daddylive-sports', name: 'DaddyLive', section: 'sports', description: 'Programme sportif · lecteurs DaddyLive intégrés', url: 'https://dlive.sx/', type: 'daddylive', provider: 'DaddyLive' },
  { id: 'brigitte-sports', name: 'BrigitteTV', section: 'sports', description: 'Programme QuelleFrappe · lecteur du fournisseur', url: 'https://quellefrappe.click/prog.php', type: 'brigitte', provider: 'BrigitteTV' },
  { id: 'xtemus-box', name: 'Xtemus · Ma sélection', section: 'personal', description: 'Playlist Xtemus · portail du fournisseur', url: 'https://box.xtemus.com/?playlist=u256y494u21596x2', type: 'portal', provider: 'Xtemus' },
  { id: 'haloule-alternatives', name: 'Alternative', section: 'alternatives', description: 'Chaînes et variantes · Haloule section 1.1', url: 'https://www.haloule.com/2024/01/meilleurs-sites-applications-android-PC-regarder-live-tv-gratuitement.html', type: 'alternative', provider: 'Haloule' }
].map(source => ({ ...source, origin: 'builtin', editable: false }));

function builtInTvSources() {
  const disabled = /^(?:0|false|off|no)$/i.test(String(process.env.LIVEWATCH_BUILTINS || 'true').trim());
  const sources = disabled ? [...complementaryTvBuiltInSources] : [...liveWatchBuiltInSources, ...complementaryTvBuiltInSources];
  // V114 : ordre explicite demandé dans l'univers Chaînes. Les sources Sports
  // conservent leur ordre relatif et les sources personnelles restent ensuite
  // gérées séparément par tvSources().
  const channelPriority = new Map([
    ['livewatch-curated', 0],
    ['fstv-public', 1],
    ['oha-live', 2],
    ['livewatch-north', 3],
    ['witv-public', 4],
    ['livewatch-frame', 5],
    ['streamsports99-live-tv', 6]
  ]);
  return sources
    .map((source, index) => ({ source, index }))
    .sort((a, b) => {
      const ap = channelPriority.has(a.source.id) ? channelPriority.get(a.source.id) : 100;
      const bp = channelPriority.has(b.source.id) ? channelPriority.get(b.source.id) : 100;
      return ap - bp || a.index - b.index;
    })
    .map(entry => entry.source);
}

function tvSourceSection(source) {
  if (source?.section) return source.section;
  return source?.origin === 'builtin' ? 'channels' : 'personal';
}

function tvChannelSortIdentity(channel = {}) {
  return String(channel?.name || '')
    .replace(/\s*\.(?:b|c|s)\s*$/i, '')
    .replace(/\s*\[(?:backup|live during events only)\]\s*$/i, '')
    .trim();
}

function tvChannelPlaybackPriority(channel = {}) {
  if (channel.playbackType === 'resolver' && channel.resolverUrl) return 0;
  if (channel.streamUrl) return 1;
  if (channel.playbackType === 'embed' || channel.embedUrl) return 2;
  return 3;
}

function tvChannelVariantPriority(channel = {}, source = {}) {
  if (String(source?.family || '').toLowerCase() !== 'frame') return 0;
  const variant = String(channel?.name || '').match(/\.([bcs])\s*$/i)?.[1]?.toLowerCase() || '';
  return ({ c: 0, s: 1, b: 2 })[variant] ?? 3;
}

function sortTvChannelsAlphabetically(channels = [], source = {}) {
  return [...(Array.isArray(channels) ? channels : [])]
    .map((channel, index) => ({ channel, index }))
    .sort((left, right) => {
      const identityOrder = tvChannelSortIdentity(left.channel).localeCompare(tvChannelSortIdentity(right.channel), 'fr', {
        numeric: true,
        sensitivity: 'base'
      });
      if (identityOrder) return identityOrder;
      const playbackOrder = tvChannelPlaybackPriority(left.channel) - tvChannelPlaybackPriority(right.channel);
      if (playbackOrder) return playbackOrder;
      const variantOrder = tvChannelVariantPriority(left.channel, source) - tvChannelVariantPriority(right.channel, source);
      if (variantOrder) return variantOrder;
      const nameOrder = String(left.channel?.name || '').localeCompare(String(right.channel?.name || ''), 'fr', {
        numeric: true,
        sensitivity: 'base'
      });
      return nameOrder || left.index - right.index;
    })
    .map(entry => entry.channel);
}

function tvSourcesFromEnv() {
  const raw = String(process.env.TV_PLAYLISTS || '').trim();
  if (!raw) return [];
  return raw.split('||').map((entry, index) => {
    const separator = entry.indexOf('::');
    const name = separator > 0 ? entry.slice(0, separator).trim() : `Source TV ${index + 1}`;
    const url = separator > 0 ? entry.slice(separator + 2).trim() : entry.trim();
    if (!url) return null;
    try {
      const normalized = safeTvRemoteUrl(url).toString();
      return { id: tvSourceId(name, normalized), name, url: normalized, type: 'auto', epgUrl: '', section: 'personal', origin: 'env', editable: false };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

async function readTvRuntimeSources() {
  const payload = JSON.parse(await readFile(tvSourcesPath, 'utf8').catch(() => '{"sources":[]}'));
  return Array.isArray(payload?.sources) ? payload.sources.filter(item => item?.name && item?.url) : [];
}

async function writeTvRuntimeSources(sources) {
  await mkdir(runtimeRoot, { recursive: true });
  const previous = JSON.parse(await readFile(tvSourcesPath, 'utf8').catch(() => '{}'));
  await writeFile(tvSourcesPath, `${JSON.stringify({ sources, hiddenSourceIds: previous.hiddenSourceIds || [] }, null, 2)}\n`, 'utf8');
}

async function tvSources() {
  const runtime = (await readTvRuntimeSources()).flatMap(item => {
    try {
      const name = String(item.name || '').trim().slice(0, 80);
      const url = safeTvRemoteUrl(item.url).toString();
      if (!name) return [];
      return [{
        id: item.id || tvSourceId(name, url),
        name,
        url,
        type: normalizeTvSourceType(item.type),
        epgUrl: optionalTvRemoteUrl(item.epgUrl),
        section: 'personal',
        description: String(item.description || '').trim().slice(0, 180),
        origin: 'runtime',
        editable: true
      }];
    } catch {
      // Une ancienne source personnelle mal formée ne doit pas empêcher les
      // sources intégrées LiveWatch, WiTV et OHA de s'afficher.
      return [];
    }
  });
  const unique = new Map();
  [...builtInTvSources(), ...additionalTvSources, ...tvSourcesFromEnv(), ...runtime].forEach(item => unique.set(item.id, { ...item, section: tvSourceSection(item) }));
  const settings = JSON.parse(await readFile(tvSourcesPath, 'utf8').catch(() => '{}'));
  const hidden = new Set(settings.hiddenSourceIds || []);
  return [...unique.values()].filter(item => !hidden.has(item.id)).map(item => ({...item, editable:item.editable || (item.origin === 'builtin' && item.section === 'personal')}));
}

async function addTvSource(nameValue, urlValue, typeValue = 'auto', epgUrlValue = '') {
  const url = safeTvRemoteUrl(urlValue).toString();
  let name = String(nameValue || '').trim().slice(0, 80);
  if (!name) {
    const parsed = new URL(url);
    name = parsed.hostname.replace(/^www\./i, '').split('.')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()).slice(0, 80) || 'Ma source TV';
  }
  if (name.length < 2) throw new HttpError(400, 'Le nom de la source TV est trop court.');
  const requestedType = normalizeTvSourceType(typeValue);
  const type = requestedType === 'auto' && new URL(url).hostname === 'box.xtemus.com' ? 'portal' : requestedType;
  const epgUrl = optionalTvRemoteUrl(epgUrlValue);
  const sources = await readTvRuntimeSources();
  const id = tvSourceId(name, url);
  const source = { id, name, url, type, epgUrl, section: 'personal', description: type === 'portal' ? 'Portail web intégré' : '', createdAt: new Date().toISOString() };
  const existingIndex = sources.findIndex(item => item.id === id);
  if (existingIndex >= 0) sources[existingIndex] = source;
  else sources.push(source);
  await writeTvRuntimeSources(sources.slice(-30));
  tvCatalogCache.clear();
  tvEpgCache.clear();
  return { ok: true, source: { id, name, url, type, epgUrl, section: 'personal', editable: true } };
}

async function removeTvSource(id) {
  const sources = await readTvRuntimeSources();
  const filtered = sources.filter(item => (item.id || tvSourceId(item.name, safeTvRemoteUrl(item.url).toString())) !== id);
  if (filtered.length === sources.length) {
    const builtin = builtInTvSources().find(item => item.id === id && item.section === 'personal');
    if (!builtin) throw new HttpError(404, 'Source TV introuvable ou gérée par le fichier .env.');
    const settings = JSON.parse(await readFile(tvSourcesPath, 'utf8').catch(() => '{"sources":[]}'));
    settings.hiddenSourceIds = [...new Set([...(settings.hiddenSourceIds || []), id])];
    await mkdir(runtimeRoot, {recursive:true});
    await writeFile(tvSourcesPath, JSON.stringify(settings, null, 2)+'\n', 'utf8');
    tvCatalogCache.clear();
    return {ok:true};
  }
  await writeTvRuntimeSources(filtered);
  tvCatalogCache.clear();
  return { ok: true };
}

function issueTvReference(urlValue, headers = {}, meta = null) {
  const url = safeTvRemoteUrl(urlValue).toString();
  const token = randomUUID().replace(/-/g, '');
  tvReferences.set(token, {
    url,
    headers: Object.fromEntries(Object.entries(headers || {}).filter(([, value]) => value).map(([key, value]) => [key.toLowerCase(), String(value)])),
    meta: meta && typeof meta === 'object' ? meta : null,
    expiresAt: Date.now() + tvReferenceLifetime
  });
  if (tvReferences.size > 4000) {
    const now = Date.now();
    for (const [key, value] of tvReferences) if (value.expiresAt <= now) tvReferences.delete(key);
  }
  return token;
}

function encodeTvStateReference(kindValue, payloadValue = {}) {
  const kind = String(kindValue || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,24}$/.test(kind)) throw new HttpError(400, 'Référence TV invalide.');
  const payload = { v: 1, kind, ...payloadValue };
  const text = JSON.stringify(payload);
  if (Buffer.byteLength(text, 'utf8') > 8 * 1024) throw new HttpError(413, 'Référence TV trop volumineuse.');
  return `s.${Buffer.from(text, 'utf8').toString('base64url')}`;
}

function decodeTvStateReference(tokenValue, expectedKind = '') {
  const token = String(tokenValue || '');
  if (!token.startsWith('s.') || token.length > 16 * 1024) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.slice(2), 'base64url').toString('utf8'));
    if (!payload || payload.v !== 1 || !payload.kind) return null;
    if (expectedKind && payload.kind !== expectedKind) return null;
    return payload;
  } catch {
    return null;
  }
}

function tvPublicStreamUrl(token) {
  return publicPath(`/api/tv/stream/${token}`);
}

function tvPublicEmbedUrl(token) {
  return publicPath(`/api/tv/embed/${token}`);
}

function tvPublicOhaEmbedUrl(token) {
  return publicPath(`/api/tv/oha/embed/${token}`);
}


function ohaBridgeTokenFromPath(pathValue) {
  const path = String(pathValue || '');
  for (const prefix of ['/api/tv/oha/embed/', '/api/tv/oha/site/', '/api/tv/oha/http/']) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    return decodeURIComponent(rest.split('/')[0] || '');
  }
  return '';
}

function validOhaBridgeToken(tokenValue) {
  const token = String(tokenValue || '');
  // Les anciens tokens stateless restent lisibles uniquement via une session
  // Noctra normale. Le bypass de session est réservé aux références aléatoires
  // émises après un clic authentifié sur une chaîne OHA.
  if (!token || token.startsWith('s.')) return false;
  const reference = tvReferences.get(token);
  return Boolean(reference && reference.expiresAt > Date.now() && reference.meta?.kind === 'oha-bridge');
}


function issueLiveWatchBridgeReference(kindValue, idValue, officialUrlValue) {
  const { kind, id } = validLiveWatchChannelReference(kindValue, idValue);
  const officialUrl = liveWatchOfficialPlayerUrl(kind, id);
  const requested = String(officialUrlValue || '').trim();
  if (requested && safeTvRemoteUrl(requested).toString() !== safeTvRemoteUrl(officialUrl).toString()) {
    throw new HttpError(400, 'Lecteur LiveWatch incohérent.');
  }
  return issueTvReference(officialUrl, {}, {
    kind: 'livewatch-bridge',
    liveWatchKind: kind,
    liveWatchId: id
  });
}

async function prepareLiveWatchVipEmbed(kindValue, idValue) {
  const { kind, id } = validLiveWatchChannelReference(kindValue, idValue);
  await liveWatchAccessSession();
  const token = issueLiveWatchBridgeReference(kind, id, liveWatchOfficialPlayerUrl(kind, id));
  return {
    embedUrl: publicPath(`/api/tv/livewatch/vip/${encodeURIComponent(token)}/embed`),
    expiresIn: Math.floor(tvReferenceLifetime / 1000)
  };
}

function liveWatchBridgeReference(tokenValue) {
  const token = String(tokenValue || '');
  if (!token || token.startsWith('s.')) return null;
  const reference = tvReferences.get(token);
  if (!reference || reference.expiresAt <= Date.now() || reference.meta?.kind !== 'livewatch-bridge') return null;
  const kind = String(reference.meta?.liveWatchKind || '').toLowerCase();
  const id = String(reference.meta?.liveWatchId || '');
  if (!['main', 'daddy', 'north', 'frame', 'page'].includes(kind) || !id) return null;
  try {
    const url = safeTvRemoteUrl(reference.url);
    if (!['livewatch.top', 'www.livewatch.top'].includes(url.hostname.toLowerCase())) return null;
    return { token, kind, id, url: url.toString(), reference };
  } catch {
    return null;
  }
}

function liveWatchBridgeTokenFromPath(pathValue) {
  const path = String(pathValue || '');
  const prefix = '/api/tv/livewatch/vip/';
  if (!path.startsWith(prefix)) return '';
  return decodeURIComponent(path.slice(prefix.length).split('/')[0] || '');
}

function validLiveWatchBridgeToken(tokenValue) {
  return Boolean(liveWatchBridgeReference(tokenValue));
}

function signedTvImageToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', tvImageTokenSecret).update(encoded).digest('base64url').slice(0, 32);
  return `s${encoded}.${signature}`;
}

function signedTvImagePayload(tokenValue) {
  const match = String(tokenValue || '').match(/^s([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]{32})$/);
  if (!match) return null;
  const expected = createHmac('sha256', tvImageTokenSecret).update(match[1]).digest('base64url').slice(0, 32);
  const suppliedBuffer = Buffer.from(match[2], 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function tvFallbackImageUrl(labelValue) {
  const label = String(labelValue || '').trim().slice(0, 120);
  if (!label) return '';
  const token = signedTvImageToken({ n: label });
  return publicPath(`/api/tv/image/${token}`);
}

function tvPublicImageUrl(urlValue, labelValue = '') {
  const raw = String(urlValue || '').trim();
  if (!raw) return tvFallbackImageUrl(labelValue);
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    const normalized = safeTvRemoteUrl(raw).toString();
    // Référence stateless : elle survit aux redémarrages du processus et
    // produit toujours la même URL, ce qui rend enfin le cache navigateur
    // réellement efficace pour les grands catalogues.
    const token = signedTvImageToken({ u: normalized, n: String(labelValue || '').trim().slice(0, 120) });
    return publicPath(`/api/tv/image/${token}`);
  } catch {
    return tvFallbackImageUrl(labelValue);
  }
}

function decorateTvCatalogImages(catalog) {
  if (!catalog || typeof catalog !== 'object') return catalog;
  const decorate = item => item && typeof item === 'object' ? {
    ...item,
    // Lorsqu'une seconde source existe, laisser le premier <img> echouer permet
    // au client de tenter ce vrai logo au lieu de figer un SVG genere prioritaire.
    logo: tvPublicImageUrl(item.logo, item.secondaryLogo ? '' : item.name),
    secondaryLogo: tvPublicImageUrl(item.secondaryLogo),
    image: tvPublicImageUrl(item.image)
  } : item;
  return {
    ...catalog,
    channels: Array.isArray(catalog.channels) ? catalog.channels.map(decorate) : catalog.channels,
    groups: Array.isArray(catalog.groups) ? catalog.groups.map(decorate) : catalog.groups
  };
}

async function fetchTvCatalog(urlValue, timeoutMs = 25_000) {
  const url = decodeTvWrappedUrl(urlValue);
  const cacheKey = url.toString();
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const inFlight = tvCatalogFetchPromises.get(cacheKey);
  if (inFlight) return inFlight;
  const request = (async () => {
    const response = await fetchTvRemote(url, {
      signal: AbortSignal.timeout(Math.max(3_000, Number(timeoutMs) || 25_000)),
      headers: {
        accept: 'application/json, application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, text/tab-separated-values, */*',
        'user-agent': 'Noctra-Media-Client/87'
      }
    });
    if (!response.ok) throw new HttpError(response.status, `Source TV indisponible (${response.status}).`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 12 * 1024 * 1024) throw new HttpError(413, 'La source TV est trop volumineuse.');
    const text = await response.text();
    if (text.length > 12 * 1024 * 1024) throw new HttpError(413, 'La source TV est trop volumineuse.');
    const value = { text, finalUrl: response.url || url.toString(), contentType: response.headers.get('content-type') || '' };
    tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, value });
    return value;
  })();
  tvCatalogFetchPromises.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (tvCatalogFetchPromises.get(cacheKey) === request) tvCatalogFetchPromises.delete(cacheKey);
  }
}

function parseExtInfAttributes(line) {
  const attributes = {};
  const expression = /([\w-]+)="([^"]*)"/g;
  let match;
  while ((match = expression.exec(line))) attributes[match[1].toLocaleLowerCase('en')] = match[2];
  let comma = -1;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"' && line[index - 1] !== '\\') quoted = !quoted;
    if (line[index] === ',' && !quoted) {
      comma = index;
      break;
    }
  }
  return { attributes, title: comma >= 0 ? line.slice(comma + 1).trim() : '' };
}

function resolveTvUrl(value, baseUrl) {
  return safeTvRemoteUrl(new URL(String(value || '').trim(), baseUrl).toString()).toString();
}

function normalizeTvChannel(raw, baseUrl, fallbackGroup = 'Chaînes') {
  const name = String(raw.name || raw.title || raw.channel || raw['tvg-name'] || '').trim();
  const stream = raw.url || raw.stream || raw.link || raw.src || raw.stream_url || raw.streamUrl;
  const explicitEmbed = raw.embed_url || raw.embedUrl || raw.iframe || '';
  const hosted = raw.embed === true || raw.embed === 'true' || raw.isHost === true || raw.isHost === 'true' || raw.isEmbed === true || raw.isEmbed === 'true';
  const embed = explicitEmbed || (hosted ? stream : (typeof raw.embed === 'string' && !/^(?:true|false)$/i.test(raw.embed) ? raw.embed : ''));
  if (!name || (!stream && !embed)) return null;
  const group = String(raw.group || raw.category || raw.competition || raw.league || raw['group-title'] || fallbackGroup || 'Chaînes').trim() || 'Chaînes';
  const rawLogo = String(raw.logo || raw.image || raw.icon || raw.poster || raw.thumbnail || raw.home_logo || raw.home_badge || raw.league_logo || raw['tvg-logo'] || '').trim();
  const rawSecondaryLogo = String(raw.secondaryLogo || raw.away_logo || raw.away_badge || '').trim();
  let resolvedLogo = '';
  let resolvedSecondaryLogo = '';
  if (rawLogo) { try { resolvedLogo = resolveTvUrl(rawLogo, baseUrl); } catch {} }
  if (rawSecondaryLogo) { try { resolvedSecondaryLogo = resolveTvUrl(rawSecondaryLogo, baseUrl); } catch {} }
  const base = {
    name,
    group,
    logo: resolvedLogo,
    secondaryLogo: resolvedSecondaryLogo,
    epgId: String(raw.epgId || raw['tvg-id'] || raw.channel_id || '').trim(),
    description: String(raw.description || raw.summary || raw.subtitle || raw.time_label || raw.time || '').trim(),
    language: String(raw.language || raw.lang || '').trim(),
    country: String(raw.country || raw.league?.country || '').trim(),
    category: String(Array.isArray(raw.categories) ? raw.categories.join(' · ') : raw.category || raw.sport || '').trim(),
    quality: String(raw.quality || raw.resolution || raw.definition || '').trim(),
    sourceLabel: String(raw.source_label || raw.sourceLabel || raw.source || '').trim(),
    status: String(raw.status_label || raw.status_kind || raw.status || '').trim(),
    provider: String(raw.provider || raw.source || '').trim(),
    eventId: String(raw.eventId || raw.event_id || raw.mid || '').trim(),
    leagueName: String(raw.league?.name || raw.league || raw.competition || '').trim(),
    homeName: String(raw.home?.name || raw.home || raw.home_name || '').trim(),
    awayName: String(raw.away?.name || raw.away || raw.away_name || '').trim(),
    isLive: Boolean(raw.is_live || raw.live),
    startTime: raw.kick_off_iso || raw.kick_off || raw.timestamp || raw.kick_off_ts || null,
    score: raw.home_score !== undefined || raw.away_score !== undefined
      ? `${raw.home_score ?? '–'} - ${raw.away_score ?? '–'}`
      : raw.home_goals !== undefined || raw.away_goals !== undefined
        ? `${raw.home_goals ?? '–'} - ${raw.away_goals ?? '–'}`
        : ''
  };
  if (stream && !embed) {
    let url;
    try { url = resolveTvUrl(stream, baseUrl); } catch { return null; }
    const headers = {
      referer: raw.referer || raw.referrer || raw['http-referrer'] || '',
      'user-agent': raw.userAgent || raw['user-agent'] || raw['http-user-agent'] || ''
    };
    const token = issueTvReference(url, headers);
    return {
      ...base,
      id: createHash('sha1').update(`${name}\n${url}`).digest('hex').slice(0, 16),
      playbackType: 'stream',
      streamUrl: tvPublicStreamUrl(token),
      streamKind: /\.m3u8?(?:\?|$)/i.test(url) ? 'HLS' : /\.mpd(?:\?|$)/i.test(url) ? 'DASH' : 'Flux direct'
    };
  }
  let embedUrl;
  try { embedUrl = resolveTvUrl(embed, baseUrl); } catch { return null; }
  return {
    ...base,
    id: createHash('sha1').update(`${name}\n${embedUrl}`).digest('hex').slice(0, 16),
    playbackType: 'embed',
    embedUrl,
    streamKind: 'Lecteur intégré'
  };
}

function parseM3uHeader(text, baseUrl) {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  if (!/^#EXTM3U/i.test(first)) return { epgUrl: '' };
  const { attributes } = parseExtInfAttributes(first);
  const raw = attributes['x-tvg-url'] || attributes['url-tvg'] || attributes['tvg-url'] || '';
  if (!raw) return { epgUrl: '' };
  const candidate = raw.split(',')[0].trim();
  try { return { epgUrl: resolveTvUrl(candidate, baseUrl) }; } catch { return { epgUrl: '' }; }
}

function parseM3uCatalog(text, baseUrl) {
  const channels = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let metadata = {};
  let options = {};
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const parsed = parseExtInfAttributes(line);
      metadata = { ...parsed.attributes, name: parsed.title || parsed.attributes['tvg-name'] || 'Chaîne' };
      options = {};
      continue;
    }
    if (line.startsWith('#EXTVLCOPT:')) {
      const [key, ...rest] = line.slice('#EXTVLCOPT:'.length).split('=');
      options[key.trim()] = rest.join('=').trim();
      continue;
    }
    if (line.startsWith('#')) continue;
    const channel = normalizeTvChannel({ ...metadata, ...options, url: line }, baseUrl);
    if (channel) channels.push(channel);
    metadata = {};
    options = {};
  }
  return { channels, ...parseM3uHeader(text, baseUrl) };
}

function liveWatchEventDescription(item) {
  const parts = [];
  const home = item.home?.name || item.home || item.home_name || '';
  const away = item.away?.name || item.away || item.away_name || '';
  if (home && away) parts.push(`${home} · ${away}`);
  const score = item.home_score !== undefined || item.away_score !== undefined
    ? `${item.home_score ?? '–'} - ${item.away_score ?? '–'}`
    : item.home_goals !== undefined || item.away_goals !== undefined
      ? `${item.home_goals ?? '–'} - ${item.away_goals ?? '–'}`
      : '';
  if (score && !/^– - –$/.test(score)) parts.push(score);
  const status = item.status_label || item.status_kind || item.status || '';
  const time = item.time_label || item.time || item.kick_off_label || item.kick_off_iso || item.kick_off || '';
  if (status) parts.push(String(status));
  if (time) parts.push(String(time));
  return parts.filter(Boolean).join(' · ');
}

function liveWatchEventEntries(item, inherited = {}) {
  const embeds = Array.isArray(item?.embeds) ? item.embeds : Array.isArray(item?.embed) ? item.embed : [];
  if (!embeds.length) return [];
  const title = String(item.title || item.event || [item.home?.name || item.home || item.home_name, item.away?.name || item.away || item.away_name].filter(Boolean).join(' vs ') || 'Événement sportif');
  const group = String(item.league?.name || item.league || item.sport || item.competition || inherited.group || 'Sports');
  const description = liveWatchEventDescription(item);
  return embeds.map((embed, index) => ({
    name: embeds.length > 1 ? `${title} · ${embed.label || `Flux ${index + 1}`}` : title,
    group,
    logo: item.home?.logo || item.home_logo || item.home_badge || item.league?.logo || item.league_logo || inherited.image || '',
    secondaryLogo: item.away?.logo || item.away_logo || item.away_badge || '',
    description,
    provider: 'LiveWatch',
    eventId: item.id || item.mid || '',
    category: item.sport || item.category || '',
    country: item.league?.country || item.country || '',
    status_label: item.status_label || item.status_kind || item.status || '',
    is_live: Boolean(item.is_live),
    kick_off_iso: item.kick_off_iso || item.kick_off || '',
    timestamp: item.timestamp || item.kick_off_ts || null,
    home_score: item.home_score ?? item.home_goals,
    away_score: item.away_score ?? item.away_goals,
    embed_url: embed.embed_url || embed.embedUrl || embed.url || ''
  })).filter(entry => entry.embed_url);
}

function liveWatchCatalogEntries(payload, inherited = {}, depth = 0, output = []) {
  if (depth > 8 || output.length >= 10000 || payload === null || payload === undefined) return output;
  if (Array.isArray(payload)) {
    payload.forEach(item => liveWatchCatalogEntries(item, inherited, depth + 1, output));
    return output;
  }
  if (typeof payload !== 'object') return output;
  const nextInherited = {
    group: payload.category || payload.group || payload.league?.name || payload.league || payload.competition || payload.sport || inherited.group || 'LiveWatch',
    image: payload.image || payload.logo || payload.poster || payload.league_logo || inherited.image || ''
  };
  const eventEntries = liveWatchEventEntries(payload, nextInherited);
  if (eventEntries.length) {
    output.push(...eventEntries);
    return output;
  }
  const directEmbed = payload.embed_url || payload.embedUrl || payload.embed;
  const directStream = payload.stream_url || payload.streamUrl || payload.stream || payload.url;
  const title = payload.title || payload.name || payload.label || payload.event || payload.channel;
  if (title && (directEmbed || directStream)) {
    output.push({
      ...payload,
      name: title,
      group: nextInherited.group,
      logo: payload.logo || payload.image || payload.poster || nextInherited.image,
      description: payload.description || payload.subtitle || payload.date || payload.time_label || '',
      provider: payload.provider || 'LiveWatch',
      eventId: payload.id || payload.mid || '',
      embed_url: directEmbed,
      stream_url: directStream && !directEmbed ? directStream : undefined
    });
  }
  for (const [key, value] of Object.entries(payload)) {
    if (['embed_url','embedUrl','embed','embeds','stream_url','streamUrl','stream','url','title','name','label','event','channel'].includes(key)) continue;
    if (Array.isArray(value) || (value && typeof value === 'object')) liveWatchCatalogEntries(value, nextInherited, depth + 1, output);
  }
  return output;
}

function liveWatchCatalogName(payload, baseUrl) {
  let pathname = '';
  try { pathname = new URL(baseUrl).pathname; } catch {}
  if (/\/daddy\//.test(pathname)) return 'DaddyTV';
  if (/\/north\//.test(pathname)) return 'NorthTV';
  if (/\/frame\//.test(pathname)) return 'FrameTV';
  if (/\/jacktv\//.test(pathname)) return 'JackTV';
  if (/\/football$/.test(pathname)) return 'Football Live';
  if (/\/bosstv$/.test(pathname)) return 'BossTV';
  if (/\/sports\/daily$/.test(pathname)) return 'Matchs du jour';
  if (/\/sports$/.test(pathname)) return 'Sports';
  return payload?.name || payload?.title || 'LiveWatch TV';
}

function parseLiveWatchCatalog(payload, baseUrl) {
  const entries = liveWatchCatalogEntries(payload);
  const channels = entries.map(item => normalizeTvChannel(item, baseUrl, item.group || 'LiveWatch')).filter(Boolean);
  return { channels, groups: [], name: liveWatchCatalogName(payload, baseUrl) };
}

const preferredLiveWatchCountries = new Set([
  'fr', 'france', 'french', 'francais',
  'be', 'belgium', 'belgique',
  'ch', 'switzerland', 'suisse',
  'ca', 'canada', 'quebec',
  'lu', 'luxembourg', 'mc', 'monaco',
  'us', 'usa', 'united states', 'united states of america', 'america'
]);

const preferredLiveWatchNamePattern = /\b(?:tf1|france ?2|france ?3|france ?4|france ?5|franceinfo|bfm(?:tv)?|cnews|lci|rmc(?: story| decouverte| sport)?|m6|w9|6ter|tmc|tfx|gulli|arte|tv5 ?monde|canal\+?|be ?in sports?|eurosport|ocs|cine\+?|paris premiere|teva|serie club|mangas|game one|nrj ?12|cherie ?25|c8|cstar|abc|cbs|nbc|fox(?: news| sports)?|cnn|msnbc|cnbc|espn|tnt|tbs|amc|fx|fxx|usa network|discovery|national geographic|nat geo|history|hbo|showtime|paramount|nickelodeon|disney(?: channel| xd)?|cartoon network|freeform|hallmark|weather channel)\b/i;

function isPreferredLiveWatchChannel(channel) {
  const country = normalizedIdentifier(channel?.country || '').replace(/[._-]+/g, ' ').trim();
  if (country) return preferredLiveWatchCountries.has(country);
  const group = normalizedIdentifier(channel?.group || '').replace(/[._-]+/g, ' ');
  const category = normalizedIdentifier(channel?.category || '').replace(/[._-]+/g, ' ');
  const regionHint = `${group} ${category}`;
  if (/\b(?:france|french|francais|belgium|belgique|switzerland|suisse|quebec|canada|luxembourg|monaco|united states|usa|u s a|american)\b/.test(regionHint)) return true;
  return preferredLiveWatchNamePattern.test(String(channel?.name || ''));
}

function cleanLiveWatchChannelName(value) {
  return String(value || '')
    .replace(/\s*\|\s*[A-Z0-9]+\s*$/i, '')
    .replace(/\s*[\[(]\s*(?:live\s+during\s+events?\s+only|event(?:s)?\s+only|backup|back-?up|secours)\s*[\])]/ig, ' ')
    .replace(/\s*[-·:]?\s*(?:live\s+during\s+events?\s+only|event(?:s)?\s+only|backup|back-?up|secours)\s*$/ig, ' ')
    .replace(/\s+(?:hd|fhd|uhd|4k|sd)\b/ig, ' ')
    .replace(/\s+(?:basic|cable|sat(?:ellite)?)\s*$/ig, ' ')
    .replace(/\s*[._-]\s*[a-z]\s*$/i, '')
    .replace(/\s*[·:|/-]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function liveWatchSourceLabel(value) {
  const normalized = normalizedIdentifier(value || '');
  if (normalized === 'satellite') return 'SAT';
  if (normalized === 'cable') return 'CABLE';
  if (normalized === 'basic') return 'BASIC';
  if (!normalized || normalized === 'livewatch') return '';
  return String(value || '').trim().toUpperCase().slice(0, 18);
}

function liveWatchVariantLabel(channel, rawName = '') {
  const quality = String(channel?.quality || rawName.match(/\b(?:4K|UHD|FHD|HD|SD)\b/i)?.[0] || '').toUpperCase();
  const source = liveWatchSourceLabel(channel?.sourceLabel || channel?.provider);
  const backup = /\bbackup\b/i.test(rawName) ? 'SECOURS' : '';
  return [...new Set([source, quality, backup].filter(Boolean))].join(' · ');
}

function curateLiveWatchChannels(channels, sourceName = 'LiveWatch') {
  const filtered = (channels || []).filter(isPreferredLiveWatchChannel).map(channel => {
    const country = channel.country || (/\b(?:usa|united states|american)\b/i.test(channel.group || '') ? 'États-Unis' : '');
    const category = channel.category || channel.group || 'TV';
    const rawName = String(channel.name || '').trim();
    const baseName = cleanLiveWatchChannelName(rawName) || rawName;
    const variantLabel = liveWatchVariantLabel(channel, rawName);
    return {
      ...channel,
      name: baseName,
      baseName,
      rawName,
      variantLabel,
      sourceLabel: liveWatchSourceLabel(channel.sourceLabel || channel.provider),
      quality: String(channel.quality || rawName.match(/\b(?:4K|UHD|FHD|HD|SD)\b/i)?.[0] || '').toUpperCase(),
      provider: channel.provider || sourceName,
      group: [country, category].filter(Boolean).join(' · ') || 'FR · US'
    };
  });
  return filtered;
}

function collapseLiveWatchLogicalChannels(channelsValue = []) {
  const groups = new Map();
  for (const channel of channelsValue || []) {
    const rawName = String(channel?.rawName || channel?.name || '').trim();
    const baseName = String(channel?.baseName || cleanLiveWatchChannelName(rawName) || rawName)
      .replace(/\s*[·:-]\s*flux\s*\d+\s*$/i, '')
      .trim();
    const country = String(channel?.country || '').trim();
    const key = normalizedIdentifier(`${baseName}|${country}`);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { baseName, channels: [] });
    groups.get(key).channels.push(channel);
  }

  return [...groups.values()].map(group => {
    const ranked = [...group.channels].sort((left, right) => {
      const rank = value => ({ BASIC: 0, CABLE: 1, SAT: 2 }[liveWatchSourceLabel(value?.sourceLabel || value?.provider)] ?? 3);
      return rank(left) - rank(right);
    });
    const representative = ranked[0];
    const labelCounts = new Map();
    const variants = ranked.map((channel, index) => {
      const rawName = String(channel?.rawName || channel?.name || '').trim();
      const baseLabel = String(channel?.variantLabel || liveWatchVariantLabel(channel, rawName)
        || rawName.match(/(?:^|\s)[·:-]\s*(Flux\s*\d+)\s*$/i)?.[1]
        || `Serveur ${index + 1}`).trim();
      const ordinal = Number(labelCounts.get(baseLabel) || 0) + 1;
      labelCounts.set(baseLabel, ordinal);
      return {
        id: String(channel?.id || ''),
        label: ordinal > 1 ? `${baseLabel} ${ordinal}` : baseLabel,
        name: rawName || group.baseName,
        embedUrl: String(channel?.embedUrl || channel?.externalUrl || ''),
        externalUrl: String(channel?.externalUrl || channel?.embedUrl || ''),
        country: String(channel?.country || ''),
        sourceLabel: String(channel?.sourceLabel || ''),
        quality: String(channel?.quality || '')
      };
    }).filter(variant => variant.embedUrl || variant.externalUrl);
    return {
      ...representative,
      name: group.baseName,
      baseName: group.baseName,
      rawName: String(representative?.rawName || representative?.name || group.baseName),
      variantLabel: '',
      liveWatchVariants: variants,
      description: variants.length > 1
        ? [String(representative?.description || ''), `${variants.length} serveurs disponibles sous le lecteur`].filter(Boolean).join(' · ')
        : representative?.description
    };
  });
}

function liveWatchEmbedReference(channel) {
  try {
    const url = new URL(channel?.externalUrl || channel?.embedUrl || '');
    if (!['livewatch.top', 'www.livewatch.top'].includes(url.hostname.toLowerCase())) return null;
    const match = url.pathname.match(/^\/embed\/(?:(daddy|north|frame)\/)?([^/]+)\/?$/i);
    if (!match) return null;
    return { kind: String(match[1] || 'main').toLowerCase(), id: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function liveWatchOfficialEmbedUrl(channel) {
  try {
    // V113 : les catalogues Sports peuvent publier de nouveaux wrappers
    // LiveWatch qui ne suivent pas encore la forme /embed/{daddy,north,frame}.
    // On n'étend jamais le VIP à un hôte tiers : seul un embed explicitement
    // livré par livewatch.top peut recevoir le bridge de la session Premium.
    const raw = String(channel?.embedUrl || '').trim();
    if (!raw) return '';
    const url = safeTvRemoteUrl(raw);
    if (!['livewatch.top', 'www.livewatch.top'].includes(url.hostname.toLowerCase())) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function liveWatchPageReference(tokenValue) {
  const token = String(tokenValue || '');
  if (!/^[a-f0-9]{32}$/i.test(token)) return null;
  const reference = tvReferences.get(token);
  if (!reference || reference.expiresAt <= Date.now() || reference.meta?.kind !== 'livewatch-page') return null;
  try {
    const url = safeTvRemoteUrl(reference.url);
    if (!['livewatch.top', 'www.livewatch.top'].includes(url.hostname.toLowerCase())) return null;
    return { ...reference, url: url.toString() };
  } catch {
    return null;
  }
}

function liveWatchOfficialPlayerUrl(kindValue, idValue) {
  const kind = String(kindValue || '').toLowerCase();
  const id = String(idValue || '');
  if (kind === 'page') {
    const reference = liveWatchPageReference(id);
    if (!reference) throw new HttpError(410, 'Ce lecteur LiveWatch a expiré. Recharge la source Sports.');
    return reference.url;
  }
  return kind === 'main'
    ? `${liveWatchOrigin}/embed/${encodeURIComponent(id)}`
    : `${liveWatchOrigin}/embed/${kind}/${encodeURIComponent(id)}`;
}

async function liveWatchQuickVipStatus() {
  const stored = await readLiveWatchSession();
  if (!stored) return { configured: false, active: false, isVip: false };
  const active = Boolean(stored.isVip && stored.accessToken && stored.refreshToken);
  // Le catalogue TV ne doit jamais attendre un refresh Supabase. Si le jeton
  // approche de l'expiration, on le renouvelle en arrière-plan ; le resolver
  // de lecture fera de toute façon une vérification stricte au moment du clic.
  if (active && Number(stored.expiresAt || 0) <= Math.floor(Date.now() / 1000) + 120) {
    void liveWatchAccessSession().catch(() => undefined);
  }
  return { configured: true, active, isVip: Boolean(stored.isVip) };
}

async function decorateLiveWatchVipPlayback(catalog, source = {}) {
  const status = await liveWatchQuickVipStatus();
  const sourceId = String(source?.id || '');
  const sourceFamily = String(source?.family || '').toLowerCase();
  const vipFamilySource = sourceId === 'livewatch-curated';
  const channels = (catalog.channels || []).map(channel => {
    const reference = liveWatchEmbedReference(channel);
    const officialEmbed = channel.embedUrl || channel.externalUrl || '';
    if (!officialEmbed) return channel;

    // Le catalogue LiveWatch principal conserve son resolver VIP historique.
    if (status.active && vipFamilySource && reference && reference.kind === 'main') {
      return {
        ...channel,
        externalUrl: channel.externalUrl || officialEmbed,
        playbackType: 'resolver',
        resolverUrl: `${publicPath(`/api/tv/livewatch/resolve/${reference.kind}/${encodeURIComponent(reference.id)}`)}?name=${encodeURIComponent(channel.baseName || cleanLiveWatchChannelName(channel.rawName || channel.name) || channel.name || '')}&country=${encodeURIComponent(channel.country || '')}&source=${encodeURIComponent(source.url || '')}`,
        embedUrl: '',
        streamKind: 'LiveWatch · VIP Premium',
        vipPlayback: true,
        vipFallbackUrl: officialEmbed,
        vipGenericPage: false,
        liveWatchDocsEmbed: false,
        liveWatchMandatoryAd: false,
        liveWatchFamily: reference.kind
      };
    }

    // Les routes React NorthTV et FrameTV publiées dans les catalogues officiels
    // sont actuellement vides, alors que leurs API /stream renvoient un HLS.
    // DaddyTV utilise aussi le resolver VIP : il valide ses variantes et,
    // si nécessaire, un secours de la même chaîne avant de proposer l'embed.
    if (status.active && ['daddy', 'north', 'frame'].includes(sourceFamily) && reference?.kind === sourceFamily) {
      const familyLabel = liveWatchFamilyLabel(sourceFamily);
      return {
        ...channel,
        externalUrl: channel.externalUrl || officialEmbed,
        playbackType: 'resolver',
        resolverUrl: `${publicPath(`/api/tv/livewatch/resolve/${sourceFamily}/${encodeURIComponent(reference.id)}`)}?name=${encodeURIComponent(channel.baseName || cleanLiveWatchChannelName(channel.rawName || channel.name) || channel.name || '')}&country=${encodeURIComponent(channel.country || '')}&source=${encodeURIComponent(source.url || '')}`,
        embedUrl: '',
        streamKind: `${familyLabel} · direct officiel HLS`,
        vipPlayback: true,
        vipFallbackUrl: officialEmbed,
        vipGenericPage: false,
        liveWatchDocsEmbed: false,
        liveWatchMandatoryAd: false,
        liveWatchFamily: sourceFamily,
        liveWatchSameOriginBridge: true
      };
    }

    // Les univers Sports, Football Live, BossTV et JackTV publient des routes
    // /embed/... plus profondes qui ne correspondent pas à un id TV simple.
    // Elles doivent néanmoins passer par le bridge Premium : auparavant le
    // garde-fou client ouvrait directement leur lecteur public et ignorait la
    // session VIP, ce qui explique que tous les « dérivés » échouaient ensemble.
    if (status.active && liveWatchOfficialEmbedUrl(channel)) {
      const variantPages = (Array.isArray(channel.liveWatchVariants) && channel.liveWatchVariants.length
        ? channel.liveWatchVariants
        : [{ label: channel.variantLabel || 'Serveur officiel', embedUrl: officialEmbed, name: channel.name }])
        .flatMap((variant, index) => {
          try {
            const url = safeTvRemoteUrl(variant.embedUrl || variant.externalUrl || '').toString();
            if (!['livewatch.top', 'www.livewatch.top'].includes(new URL(url).hostname.toLowerCase())) return [];
            return [{
              url,
              label: String(variant.label || `Serveur ${index + 1}`).slice(0, 80),
              name: String(variant.name || channel.name || '').slice(0, 160)
            }];
          } catch { return []; }
        });
      const pageToken = issueTvReference(officialEmbed, {}, {
        kind: 'livewatch-page',
        sourceFamily: String(source?.name || catalog.name || channel.provider || 'LiveWatch'),
        variants: variantPages.slice(0, 12)
      });
      return {
        ...channel,
        externalUrl: channel.externalUrl || officialEmbed,
        playbackType: 'resolver',
        resolverUrl: publicPath(`/api/tv/livewatch/resolve/page/${encodeURIComponent(pageToken)}`),
        embedUrl: '',
        streamKind: `${source?.name || catalog.name || 'LiveWatch'} · VIP Premium`,
        vipPlayback: true,
        vipFallbackUrl: officialEmbed,
        vipGenericPage: true,
        liveWatchDocsEmbed: false,
        liveWatchMandatoryAd: false,
        liveWatchFamily: sourceFamily || reference?.kind || 'page'
      };
    }

    const familyLabel = sourceFamily === 'daddy' || reference?.kind === 'daddy' ? 'Daddy TV'
      : sourceFamily === 'north' || reference?.kind === 'north' ? 'NorthTV'
        : sourceFamily === 'frame' || reference?.kind === 'frame' ? 'FrameTV'
          : String(source?.name || catalog.name || channel.provider || 'LiveWatch');
    return {
      ...channel,
      externalUrl: channel.externalUrl || officialEmbed,
      playbackType: 'embed',
      embedUrl: officialEmbed,
      streamKind: `${familyLabel} · lecteur officiel`,
      vipPlayback: false,
      vipFallbackUrl: '',
      vipGenericPage: false,
      liveWatchDocsEmbed: true,
      liveWatchMandatoryAd: ['daddy', 'north', 'frame'].includes(sourceFamily) || ['daddy', 'north', 'frame'].includes(reference?.kind || ''),
      liveWatchFamily: sourceFamily || reference?.kind || 'page'
    };
  });
  return { ...catalog, channels, liveWatchVip: status };
}

function validLiveWatchChannelReference(kindValue, idValue) {
  const kind = String(kindValue || '').toLowerCase();
  const id = String(idValue || '');
  if (kind === 'page') {
    if (!liveWatchPageReference(id)) throw new HttpError(410, 'Ce lecteur LiveWatch a expiré. Recharge la source Sports.');
    return { kind, id };
  }
  if (!['main', 'daddy', 'north', 'frame'].includes(kind)) throw new HttpError(400, 'Type de lecteur LiveWatch invalide.');
  if (!id || id.length > 180 || !/^[a-z0-9._:-]+$/i.test(id)) throw new HttpError(400, 'Chaîne LiveWatch invalide.');
  return { kind, id };
}

function tvResponseCookieHeader(response) {
  try {
    const values = typeof response?.headers?.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];
    const source = values.length ? values : [response?.headers?.get?.('set-cookie') || ''];
    return source
      .flatMap(value => String(value || '').split(/,(?=\s*[^;,=]+=[^;,]+)/g))
      .map(value => value.split(';', 1)[0].trim())
      .filter(Boolean)
      .join('; ');
  } catch {
    return '';
  }
}

function liveWatchStreamUrlFromPayload(payload) {
  const seen = new Set();
  const visit = (value, depth = 0) => {
    if (depth > 5 || value === null || value === undefined) return '';
    if (typeof value === 'string') return /^https?:\/\//i.test(value) || /^\//.test(value) ? value : '';
    if (typeof value !== 'object' || seen.has(value)) return '';
    seen.add(value);
    const priorityKeys = ['proxy_url', 'stream_url', 'streamUrl', 'hls_url', 'hlsUrl', 'hls', 'url'];
    for (const key of priorityKeys) {
      const found = visit(value[key], depth + 1);
      if (found) return found;
    }
    for (const key of ['data', 'result', 'stream', 'playback', 'source']) {
      const found = visit(value[key], depth + 1);
      if (found) return found;
    }
    return '';
  };
  return visit(payload);
}

async function liveWatchStreamReference(kindValue, idValue, timeoutMs = 8_500, signal = null) {
  const { kind, id } = validLiveWatchChannelReference(kindValue, idValue);
  if (kind === 'page') throw new HttpError(422, 'Ce wrapper LiveWatch utilise le lecteur Premium officiel plutôt qu’une route HLS directe.');
  const cacheKey = `${kind}:${id}`;
  const cached = liveWatchVipDirectCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && tvReferences.has(String(cached.token || ''))) return cached.token;
  const apiPath = kind === 'main' ? `/api/stream/${encodeURIComponent(id)}` : `/api/${kind}/stream/${encodeURIComponent(id)}`;
  const playerPath = kind === 'main' ? `/embed/${encodeURIComponent(id)}` : `/embed/${kind}/${encodeURIComponent(id)}`;
  const requestStream = async (session, retry = true) => {
    const endpointUrl = `${liveWatchOrigin}${apiPath}?vip=1&embed=1`;
    const response = await fetchTvRemote(endpointUrl, {
      headers: {
        accept: 'application/json, application/vnd.apple.mpegurl, application/x-mpegURL, text/plain;q=0.8, */*;q=0.5',
        authorization: `Bearer ${session.accessToken}`,
        referer: `${liveWatchOrigin}${playerPath}`,
        'user-agent': 'Noctra-Media-Client/87'
      },
      signal: AbortSignal.any([AbortSignal.timeout(Math.max(3_500, Number(timeoutMs) || 8_500)), ...(signal ? [signal] : [])])
    });
    if (retry && [401, 403].includes(response.status)) return requestStream(await liveWatchAccessSession(true), false);
    if (!response.ok) throw new HttpError(response.status, `LiveWatch VIP n’a pas pu ouvrir cette chaîne (${response.status}).`);
    const text = await response.text();
    if (text.length > 512 * 1024) throw new HttpError(413, 'La réponse LiveWatch est trop volumineuse.');
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    let rawUrl = '';
    if (/^https?:\/\//i.test(text.trim()) || /^\//.test(text.trim())) {
      rawUrl = text.trim();
    } else {
      try {
        rawUrl = liveWatchStreamUrlFromPayload(text ? JSON.parse(text) : {});
      } catch {
        // Certains lecteurs Premium renvoient directement la playlist HLS sur
        // l'endpoint authentifié au lieu de fournir une URL dans du JSON. Dans ce
        // cas l'endpoint lui-même devient la ressource relayée par Noctra.
        if (/^\s*#EXTM3U/i.test(text) || /mpegurl/i.test(contentType)) {
          rawUrl = response.url || endpointUrl;
        } else {
          throw new HttpError(502, 'LiveWatch a renvoyé une réponse illisible.');
        }
      }
    }
    if (!rawUrl) throw new HttpError(502, 'LiveWatch n’a renvoyé aucun flux pour cette chaîne.');
    const streamUrl = safeTvRemoteUrl(new URL(rawUrl, response.url || liveWatchOrigin).toString());
    const liveWatchHost = ['livewatch.top', 'www.livewatch.top'].includes(streamUrl.hostname.toLowerCase());
    const officialProxy = liveWatchHost && /^\/api\/(?:hls\b|proxy\b|stream\b|(?:daddy|north|frame)\/(?:proxy|stream)\b)/i.test(streamUrl.pathname);
    const publicHls = streamUrl.protocol === 'https:' && /\.m3u8?(?:$|[?#/])/i.test(streamUrl.toString());
    if (!officialProxy && !publicHls) throw new HttpError(502, 'LiveWatch a renvoyé une adresse de flux inattendue.');
    const cookie = tvResponseCookieHeader(response);
    const inlinePlaylist = /^\s*#EXTM3U/i.test(text) || /mpegurl/i.test(contentType);
    const token = issueTvReference(streamUrl.toString(), {
      ...(liveWatchHost ? { authorization: `Bearer ${session.accessToken}` } : {}),
      ...(cookie && liveWatchHost ? { cookie } : {}),
      referer: `${liveWatchOrigin}${playerPath}`,
      'user-agent': 'Noctra-Media-Client/87'
    }, inlinePlaylist ? { kind: 'livewatch-vip', provider: 'LiveWatch', forceHls: true } : { kind: 'livewatch-vip', provider: 'LiveWatch' });
    liveWatchVipDirectCache.set(cacheKey, { token, expiresAt: Date.now() + 45_000 });
    return token;
  };
  return requestStream(await liveWatchAccessSession());
}


function liveWatchStableHlsUrl(kindValue, idValue, selectorValue = '', resourceValue = '') {
  const { kind, id } = validLiveWatchChannelReference(kindValue, idValue);
  const base = publicPath(`/api/tv/livewatch/hls/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`);
  const params = new URLSearchParams();
  const selector = String(selectorValue || '').trim();
  const resource = String(resourceValue || '').trim();
  if (selector) params.set('sel', selector);
  if (resource) params.set('res', resource);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function liveWatchPlaylistIsMaster(textValue) {
  const text = String(textValue || '');
  return /#EXT-X-STREAM-INF\s*:/i.test(text)
    || /#EXT-X-I-FRAME-STREAM-INF\s*:.*\bURI\s*=/i.test(text)
    || /#EXT-X-MEDIA\s*:.*\bURI\s*=/i.test(text);
}

function liveWatchMasterPlaylistPointers(textValue, baseUrl) {
  const lines = String(textValue || '').split(/\r?\n/);
  const pointers = new Map();
  let variantIndex = 0;
  let mediaIndex = 0;
  let iframeIndex = 0;
  let pendingVariant = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#EXT-X-STREAM-INF\s*:/i.test(trimmed)) {
      pendingVariant = true;
      continue;
    }
    if (pendingVariant && !trimmed.startsWith('#')) {
      const key = `v${variantIndex++}`;
      try { pointers.set(key, { key, lineIndex, kind: 'variant', url: resolveTvUrl(trimmed, baseUrl) }); } catch {}
      pendingVariant = false;
      continue;
    }
    if (/^#EXT-X-MEDIA\s*:/i.test(trimmed) && /\bURI="[^"]+"/i.test(line)) {
      const key = `m${mediaIndex++}`;
      const match = line.match(/\bURI="([^"]+)"/i);
      if (match) {
        try { pointers.set(key, { key, lineIndex, kind: 'media', url: resolveTvUrl(match[1], baseUrl) }); } catch {}
      }
      continue;
    }
    if (/^#EXT-X-I-FRAME-STREAM-INF\s*:/i.test(trimmed) && /\bURI="[^"]+"/i.test(line)) {
      const key = `i${iframeIndex++}`;
      const match = line.match(/\bURI="([^"]+)"/i);
      if (match) {
        try { pointers.set(key, { key, lineIndex, kind: 'iframe', url: resolveTvUrl(match[1], baseUrl) }); } catch {}
      }
    }
  }
  return pointers;
}


function liveWatchStableResourceIdentity(prefix, urlValue, fallbackIndex = 0) {
  try {
    const url = new URL(urlValue);
    // Les signatures tournent principalement dans la query-string. L'identité
    // stable est donc basée sur le chemin CDN, qui reste le même après refresh.
    const identity = `${url.hostname.toLowerCase()}${url.pathname}`;
    return `${prefix}${createHash('sha1').update(identity).digest('hex').slice(0, 12)}`;
  } catch {
    return `${prefix}${Number(fallbackIndex) || 0}`;
  }
}

function liveWatchMediaPlaylistPointers(textValue, baseUrl, inheritedHeaders = {}) {
  const lines = String(textValue || '').split(/\r?\n/);
  const byKey = new Map();
  const byLine = new Map();
  let mediaSequence = 0;
  let segmentOffset = 0;
  let partOffset = 0;
  let keyOffset = 0;
  let mapOffset = 0;
  for (const line of lines) {
    const match = line.trim().match(/^#EXT-X-MEDIA-SEQUENCE\s*:\s*(\d+)/i);
    if (match) { mediaSequence = Number(match[1]) || 0; break; }
  }
  const add = (key, lineIndex, rawUrl, kind) => {
    try {
      const url = resolveTvUrl(rawUrl, baseUrl);
      const headers = tvChildReferenceHeaders(inheritedHeaders, baseUrl, url);
      const value = { key, lineIndex, kind, url, headers };
      byKey.set(key, value);
      byLine.set(lineIndex, value);
    } catch {}
  };
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('#')) {
      add(`s${mediaSequence + segmentOffset}`, lineIndex, trimmed, 'segment');
      segmentOffset += 1;
      partOffset = 0;
      continue;
    }
    if (/^#EXT-X-PART\s*:/i.test(trimmed)) {
      const match = line.match(/\bURI="([^"]+)"/i);
      if (match) add(`p${mediaSequence + segmentOffset}.${partOffset++}`, lineIndex, match[1], 'part');
      continue;
    }
    if (/^#EXT-X-PRELOAD-HINT\s*:/i.test(trimmed) && /\bTYPE=PART\b/i.test(trimmed)) {
      const match = line.match(/\bURI="([^"]+)"/i);
      if (match) add(`q${mediaSequence + segmentOffset}.${partOffset}`, lineIndex, match[1], 'preload');
      continue;
    }
    if (/^#EXT-X-KEY\s*:/i.test(trimmed)) {
      const match = line.match(/\bURI="([^"]+)"/i);
      if (match) {
        let absolute = '';
        try { absolute = resolveTvUrl(match[1], baseUrl); } catch {}
        add(liveWatchStableResourceIdentity('k', absolute || match[1], keyOffset++), lineIndex, match[1], 'key');
      }
      continue;
    }
    if (/^#EXT-X-MAP\s*:/i.test(trimmed)) {
      const match = line.match(/\bURI="([^"]+)"/i);
      if (match) {
        let absolute = '';
        try { absolute = resolveTvUrl(match[1], baseUrl); } catch {}
        add(liveWatchStableResourceIdentity('m', absolute || match[1], mapOffset++), lineIndex, match[1], 'map');
      }
    }
  }
  return { lines, byKey, byLine, mediaSequence };
}

function liveWatchMediaResourceCacheKey(kind, id, selector, resourceKey) {
  return `${kind}:${id}:${selector || 'root'}:${resourceKey}`;
}

function rememberLiveWatchMediaPointers(kind, id, selector, pointers) {
  const now = Date.now();
  for (const pointer of pointers?.byKey?.values?.() || []) {
    liveWatchStableMediaResourceCache.set(
      liveWatchMediaResourceCacheKey(kind, id, selector, pointer.key),
      { ...pointer, expiresAt: now + 30_000 }
    );
  }
  if (liveWatchStableMediaResourceCache.size > 20_000) {
    for (const [key, value] of liveWatchStableMediaResourceCache) {
      if (!value || value.expiresAt <= now) liveWatchStableMediaResourceCache.delete(key);
      if (liveWatchStableMediaResourceCache.size <= 12_000) break;
    }
  }
}

function rewriteLiveWatchStableMediaPlaylist(textValue, baseUrl, kind, id, selector = '', inheritedHeaders = {}) {
  const pointers = liveWatchMediaPlaylistPointers(textValue, baseUrl, inheritedHeaders);
  rememberLiveWatchMediaPointers(kind, id, selector, pointers);
  return pointers.lines.map((line, lineIndex) => {
    const pointer = pointers.byLine.get(lineIndex);
    if (!pointer) return line;
    const stable = liveWatchStableHlsUrl(kind, id, selector, pointer.key);
    if (!line.trim().startsWith('#')) return stable;
    return line.replace(/\bURI="([^"]+)"/i, `URI="${stable}"`);
  }).join('\n');
}

function liveWatchRefreshableMediaStatus(statusValue) {
  return [401, 403, 404, 410, 429, 502, 503, 504].includes(Number(statusValue || 0));
}

async function liveWatchFreshMediaPointer(kind, id, selector, resourceKey) {
  const resource = await liveWatchFreshHlsResource(kind, id, selector, null);
  if (!resource.playlist || liveWatchPlaylistIsMaster(resource.text)) {
    throw new HttpError(502, 'La ressource LiveWatch ne pointe plus vers une media-playlist.');
  }
  const pointers = liveWatchMediaPlaylistPointers(resource.text, resource.finalUrl, resource.headers);
  rememberLiveWatchMediaPointers(kind, id, selector, pointers);
  return pointers.byKey.get(resourceKey) || null;
}

async function proxyLiveWatchVipHlsMediaResource(kindValue, idValue, selectorValue, resourceKeyValue, req, res) {
  const safe = validLiveWatchChannelReference(kindValue, idValue);
  const selector = String(selectorValue || '').trim();
  const resourceKey = String(resourceKeyValue || '').trim();
  if (!/^(?:s\d+|p\d+\.\d+|q\d+\.\d+|[km][a-f0-9]{12})$/i.test(resourceKey)) {
    throw new HttpError(400, 'Ressource HLS LiveWatch invalide.');
  }
  const cacheKey = liveWatchMediaResourceCacheKey(safe.kind, safe.id, selector, resourceKey);
  const cached = liveWatchStableMediaResourceCache.get(cacheKey);
  let pointer = cached && cached.expiresAt > Date.now() ? cached : null;
  if (!pointer) pointer = await liveWatchFreshMediaPointer(safe.kind, safe.id, selector, resourceKey);
  if (!pointer?.url) throw new HttpError(410, 'Ce segment LiveWatch n’est plus présent dans la fenêtre du direct.');

  const open = async value => {
    const headers = {
      accept: '*/*',
      'user-agent': value.headers?.['user-agent'] || 'Noctra-Media-Client/87',
      ...(value.headers?.referer ? { referer: value.headers.referer } : {}),
      ...(value.headers?.authorization ? { authorization: value.headers.authorization } : {}),
      ...(value.headers?.cookie ? { cookie: value.headers.cookie } : {}),
      ...(req?.headers?.range ? { range: req.headers.range } : {})
    };
    return fetchTvRemoteUntilHeaders(value.url, { headers }, 18_000);
  };

  let response = await open(pointer);
  if (!response.ok && response.status !== 206 && liveWatchRefreshableMediaStatus(response.status)) {
    try { await response.body?.cancel?.(); } catch {}
    liveWatchVipDirectCache.delete(`${safe.kind}:${safe.id}`);
    const fresh = await liveWatchFreshMediaPointer(safe.kind, safe.id, selector, resourceKey);
    if (fresh?.url) {
      pointer = fresh;
      response = await open(pointer);
    }
  }
  if (!response.ok && response.status !== 206) {
    try { await response.body?.cancel?.(); } catch {}
    throw new HttpError(response.status, `Segment LiveWatch indisponible (${response.status}).`);
  }

  liveWatchStableMediaResourceCache.set(cacheKey, { ...pointer, expiresAt: Date.now() + 30_000 });
  const responseHeaders = {
    'content-type': response.headers.get('content-type') || 'application/octet-stream',
    'cache-control': 'no-store',
    'accept-ranges': response.headers.get('accept-ranges') || 'bytes',
    'x-accel-buffering': 'no',
    'x-noctra-livewatch-resource': resourceKey
  };
  for (const header of ['content-length', 'content-range']) {
    const value = response.headers.get(header);
    if (value) responseHeaders[header] = value;
  }
  try { res.socket?.setNoDelay?.(true); } catch {}
  try { res.socket?.setKeepAlive?.(true, 15_000); } catch {}
  res.writeHead(response.status, responseHeaders);
  res.flushHeaders?.();
  pipeRemoteResponseBody(response, res);
}

function rewriteLiveWatchStableMasterPlaylist(textValue, baseUrl, kind, id, selectorPrefix = '', inheritedHeaders = {}) {
  const lines = String(textValue || '').split(/\r?\n/);
  let variantIndex = 0;
  let mediaIndex = 0;
  let iframeIndex = 0;
  let pendingVariant = false;
  const stable = key => liveWatchStableHlsUrl(kind, id, selectorPrefix ? `${selectorPrefix}.${key}` : key);
  const generic = value => {
    const childUrl = resolveTvUrl(value, baseUrl);
    const childHeaders = tvChildReferenceHeaders(inheritedHeaders, baseUrl, childUrl);
    return tvPublicStreamUrl(issueStableProviderChildReference(childUrl, childHeaders, 'LiveWatch'));
  };
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (/^#EXT-X-STREAM-INF\s*:/i.test(trimmed)) {
      pendingVariant = true;
      return line;
    }
    if (pendingVariant && !trimmed.startsWith('#')) {
      pendingVariant = false;
      return stable(`v${variantIndex++}`);
    }
    if (/^#EXT-X-MEDIA\s*:/i.test(trimmed) && /\bURI="[^"]+"/i.test(line)) {
      const key = `m${mediaIndex++}`;
      return line.replace(/\bURI="([^"]+)"/i, `URI="${stable(key)}"`);
    }
    if (/^#EXT-X-I-FRAME-STREAM-INF\s*:/i.test(trimmed) && /\bURI="[^"]+"/i.test(line)) {
      const key = `i${iframeIndex++}`;
      return line.replace(/\bURI="([^"]+)"/i, `URI="${stable(key)}"`);
    }
    // Session keys/maps in a master are media resources, not child playlists.
    if (/URI="[^"]+"/.test(line)) return line.replace(/URI="([^"]+)"/g, (_, value) => `URI="${generic(value)}"`);
    return line;
  }).join('\n');
}

async function liveWatchFreshHlsResource(kindValue, idValue, selectorValue = '', req = null) {
  const { kind, id } = validLiveWatchChannelReference(kindValue, idValue);
  const selector = String(selectorValue || '').trim();
  if (selector && !/^(?:[vmi]\d+)(?:\.(?:[vmi]\d+))*$/.test(selector)) throw new HttpError(400, 'Sélecteur HLS LiveWatch invalide.');
  const chain = selector ? selector.split('.') : [];
  const token = await liveWatchStreamReference(kind, id);
  const root = tvReferences.get(String(token || ''));
  if (!root?.url) throw new HttpError(502, 'LiveWatch n’a pas fourni de flux direct exploitable.');
  let currentUrl = root.url;
  let currentHeaders = { ...(root.headers || {}) };
  let currentPrefix = '';

  for (let depth = 0; ; depth += 1) {
    const url = safeTvRemoteUrl(currentUrl);
    const headers = {
      accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,video/*,audio/*,*/*;q=0.7',
      'user-agent': currentHeaders['user-agent'] || 'Noctra-Media-Client/87',
      ...(currentHeaders.referer ? { referer: currentHeaders.referer } : {}),
      ...(currentHeaders.authorization ? { authorization: currentHeaders.authorization } : {}),
      ...(currentHeaders.cookie ? { cookie: currentHeaders.cookie } : {}),
      ...(depth === chain.length && req?.headers?.range ? { range: req.headers.range } : {})
    };
    const response = await fetchTvRemoteUntilHeaders(url, { headers }, 18_000);
    if (!response.ok && response.status !== 206) {
      try { await response.body?.cancel?.(); } catch {}
      throw new HttpError(response.status, `Flux LiveWatch indisponible (${response.status}).`);
    }
    const contentType = String(response.headers.get('content-type') || '');
    const finalUrl = response.url || url.toString();
    const playlist = Boolean(root.meta?.forceHls && depth === 0)
      || /(?:mpegurl|m3u8)/i.test(contentType)
      || /\.m3u8?(?:$|[?#/])/i.test(finalUrl);

    if (!playlist) {
      if (depth < chain.length) {
        try { await response.body?.cancel?.(); } catch {}
        throw new HttpError(502, 'La hiérarchie HLS LiveWatch a changé pendant la lecture.');
      }
      return { response, playlist: false, contentType, finalUrl, headers: currentHeaders, selector: currentPrefix };
    }

    const text = await readTvPlaylistBody(response);
    const responseCookie = tvResponseCookieHeader(response);
    const mergedHeaders = {
      ...currentHeaders,
      ...(responseCookie ? { cookie: mergeTvCookieHeaders(currentHeaders.cookie || '', responseCookie) } : {})
    };

    if (depth >= chain.length) {
      return { response, playlist: true, text, contentType, finalUrl, headers: mergedHeaders, selector: currentPrefix };
    }

    if (!liveWatchPlaylistIsMaster(text)) throw new HttpError(502, 'La variante LiveWatch n’est plus présente dans le master courant.');
    const key = chain[depth];
    const pointer = liveWatchMasterPlaylistPointers(text, finalUrl).get(key);
    if (!pointer?.url) throw new HttpError(502, 'La variante LiveWatch sélectionnée a disparu du master courant.');
    const childHeaders = tvChildReferenceHeaders(mergedHeaders, finalUrl, pointer.url);
    currentUrl = pointer.url;
    currentHeaders = childHeaders;
    currentPrefix = currentPrefix ? `${currentPrefix}.${key}` : key;
  }
}

async function proxyLiveWatchVipHls(kind, id, selector, req, res) {
  const safe = validLiveWatchChannelReference(kind, id);
  const cacheKey = `${safe.kind}:${safe.id}`;
  const open = async () => liveWatchFreshHlsResource(safe.kind, safe.id, selector, req);
  let resource;
  try {
    resource = await open();
  } catch (error) {
    const status = Number(error?.status || 0);
    // A cached URL may return an HTML/JSON error with HTTP 200 after expiry.
    // readTvPlaylistBody reports 415 in that case; renew once before failing.
    const refreshable = [401, 403, 404, 410, 415, 429, 502, 503, 504].includes(status);
    if (!refreshable) throw error;
    liveWatchVipDirectCache.delete(cacheKey);
    resource = await open();
  }

  if (resource.playlist) {
    const master = liveWatchPlaylistIsMaster(resource.text);
    const rewritten = master
      ? rewriteLiveWatchStableMasterPlaylist(resource.text, resource.finalUrl, safe.kind, safe.id, resource.selector, resource.headers)
      : rewriteLiveWatchStableMediaPlaylist(resource.text, resource.finalUrl, safe.kind, safe.id, resource.selector, resource.headers);
    res.writeHead(200, {
      'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'pragma': 'no-cache',
      'access-control-allow-origin': 'same-origin',
      'x-accel-buffering': 'no',
      'x-noctra-livewatch-hls': resource.selector || 'root'
    });
    res.end(rewritten);
    return;
  }

  const response = resource.response;
  const responseHeaders = {
    'content-type': resource.contentType || 'application/octet-stream',
    'cache-control': 'no-store',
    'accept-ranges': response.headers.get('accept-ranges') || 'bytes',
    'x-accel-buffering': 'no'
  };
  for (const header of ['content-length', 'content-range']) {
    const value = response.headers.get(header);
    if (value) responseHeaders[header] = value;
  }
  try { res.socket?.setNoDelay?.(true); } catch {}
  try { res.socket?.setKeepAlive?.(true, 15_000); } catch {}
  res.writeHead(response.status, responseHeaders);
  res.flushHeaders?.();
  pipeRemoteResponseBody(response, res);
}

async function proxyLiveWatchVipStream(kind, id, req, res) {
  const token = await liveWatchStreamReference(kind, id);
  await proxyTvStream(token, req, res);
}

function liveWatchProbeHeaders(reference, accept = '*/*') {
  return {
    accept,
    'user-agent': reference.headers['user-agent'] || 'Noctra-Media-Client/87',
    ...(reference.headers.referer ? { referer: reference.headers.referer } : {}),
    ...(reference.headers.authorization ? { authorization: reference.headers.authorization } : {}),
    ...(reference.headers.cookie ? { cookie: reference.headers.cookie } : {})
  };
}

function liveWatchFirstPlaylistUri(textValue, baseUrl) {
  const line = String(textValue || '')
    .split(/\r?\n/)
    .map(value => value.trim())
    .find(value => value && !value.startsWith('#'));
  if (!line) return '';
  try { return safeTvRemoteUrl(resolveTvUrl(line, baseUrl)).toString(); }
  catch { return ''; }
}

async function liveWatchProbeResponse(urlValue, reference, timeoutMs = 4_500, signal = null) {
  const response = await fetchTvRemote(urlValue, {
    headers: liveWatchProbeHeaders(reference, 'application/vnd.apple.mpegurl,application/x-mpegURL,video/*,*/*;q=0.6'),
    signal: AbortSignal.any([AbortSignal.timeout(Math.max(2_500, Number(timeoutMs) || 4_500)), ...(signal ? [signal] : [])])
  });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const finalUrl = response.url || String(urlValue || '');
  const htmlLike = /(?:text\/html|application\/xhtml)/i.test(contentType);
  const playlist = Boolean(reference?.meta?.forceHls && String(urlValue) === String(reference.url))
    || /(?:mpegurl|m3u8)/i.test(contentType)
    || /\.m3u8?(?:$|[?#/])/i.test(finalUrl);
  const media = /(?:video\/|audio\/|octet-stream)/i.test(contentType) || /\.(?:ts|m4s|mp4|aac)(?:$|[?#/])/i.test(finalUrl);
  if (!response.ok || htmlLike) {
    try { await response.body?.cancel?.(); } catch {}
    throw new HttpError(response.status || 502, `Flux LiveWatch VIP non exploitable (${response.status || 0}${contentType ? ` · ${contentType.split(';')[0]}` : ''}).`);
  }
  if (playlist) {
    const text = await readTvPlaylistBody(response);
    if (!/^\s*#EXTM3U/i.test(text)) throw new HttpError(502, 'LiveWatch VIP a renvoyé une playlist HLS invalide.');
    return { kind: 'playlist', url: finalUrl, text };
  }
  if (media) {
    await probeTvMediaBody(response, signal, timeoutMs);
    return { kind: 'media', url: finalUrl };
  }
  try { await response.body?.cancel?.(); } catch {}
  throw new HttpError(502, `LiveWatch VIP a renvoyé un format inattendu${contentType ? ` (${contentType.split(';')[0]})` : ''}.`);
}

async function validateLiveWatchStreamReference(token, timeoutMs = 4_500) {
  const reference = tvReferences.get(String(token || ''));
  if (!reference?.url) throw new HttpError(502, 'Référence de flux LiveWatch absente.');

  // V70 : on valide le chemin de lecture, pas seulement le premier HTTP 200.
  // Un master HLS doit mener à une playlist média puis à un segment accessible.
  let probe = await liveWatchProbeResponse(reference.url, reference, timeoutMs);
  for (let depth = 0; depth < 3 && probe.kind === 'playlist'; depth += 1) {
    const nextUrl = tvRecentPlaylistProbeUri(probe.text, probe.url);
    if (!nextUrl) throw new HttpError(502, 'La playlist LiveWatch VIP ne contient aucune ressource média.');
    const adjacent = /#EXT-X-STREAM-INF:/i.test(probe.text) ? '' : tvRecentPlaylistProbeUri(probe.text, probe.url, 1);
    try {
      probe = await liveWatchProbeResponse(nextUrl, reference, timeoutMs);
    } catch (error) {
      // La fenêtre live peut avancer pendant la sonde : rester sur ce serveur.
      if (!adjacent || adjacent === nextUrl || ![404, 410].includes(Number(error.status))) throw error;
      probe = await liveWatchProbeResponse(adjacent, reference, timeoutMs);
    }
  }
  if (probe.kind !== 'media') throw new HttpError(502, 'Le chemin LiveWatch VIP n’atteint pas une ressource vidéo exploitable.');
  return true;
}

function liveWatchComparableName(value, country = '') {
  return normalizedIdentifier(cleanLiveWatchChannelName(value))
    .replace(/\b(?:uhd|fhd|full hd|hd|sd)\b/g, ' ')
    .replace(/\s+(?:fr|france)\s*$/, match => /^(?:fr|fra|france)$/i.test(country) ? '' : match)
    .replace(/\s+/g, ' ')
    .trim();
}

function liveWatchFamilyLabel(kindValue) {
  return ({ main: 'LiveWatch', daddy: 'Daddy TV', north: 'NorthTV', frame: 'FrameTV' })[String(kindValue || '').toLowerCase()] || 'LiveWatch';
}

async function liveWatchChannelVariants(kindValue, idValue, nameValue = '', countryValue = '', sourceValue = '') {
  const kind = String(kindValue || '').toLowerCase();
  const id = String(idValue || '');
  const name = String(nameValue || '').trim();
  const country = normalizedIdentifier(countryValue || '').trim();
  if (!name || kind === 'page') return [{ kind, id, label: '' }];
  const defaults = {
    main: `${liveWatchOrigin}/api/v1/public/all`,
    daddy: `${liveWatchOrigin}/api/v1/public/daddy/channels`,
    north: `${liveWatchOrigin}/api/v1/public/north/channels`,
    frame: `${liveWatchOrigin}/api/v1/public/frame/channels`
  };
  let catalogUrl = defaults[kind] || '';
  try {
    const candidate = safeTvRemoteUrl(sourceValue).toString();
    if (new URL(candidate).hostname.toLowerCase().endsWith('livewatch.top') && /\/api\//i.test(candidate)) catalogUrl = candidate;
  } catch {}
  if (!catalogUrl) return [{ kind, id, label: '' }];
  try {
    const raw = await fetchTvCatalog(catalogUrl, 12_000);
    const parsed = parseLiveWatchCatalog(JSON.parse(raw.text || '{}'), raw.finalUrl || catalogUrl);
    const wanted = liveWatchComparableName(name, countryValue);
    const candidates = (parsed.channels || []).flatMap(channel => {
      const reference = liveWatchEmbedReference(channel);
      if (!reference || reference.kind !== kind || liveWatchComparableName(channel?.name || '', channel.country) !== wanted) return [];
      if (country && normalizedIdentifier(channel.country || '') !== country) return [];
      return [{
        ...reference,
        country: String(channel.country || ''),
        sourceLabel: liveWatchSourceLabel(channel.sourceLabel || channel.provider),
        label: liveWatchVariantLabel(channel, channel.name) || liveWatchSourceLabel(channel.sourceLabel || channel.provider) || 'VARIANTE'
      }];
    });
    // Un identifiant absent du catalogue fraîchement chargé est périmé. Le
    // remettre en tête provoquait précisément « Chaîne introuvable » avant que
    // Noctra n'essaie l'occurrence actuelle du même nom.
    if (!candidates.length && id) candidates.push({ kind, id, country: countryValue, label: '' });
    candidates.sort((left, right) => {
      const preferredLeft = left.id === id ? 0 : 1;
      const preferredRight = right.id === id ? 0 : 1;
      const countryLeft = country && normalizedIdentifier(left.country || '') === country ? 0 : 1;
      const countryRight = country && normalizedIdentifier(right.country || '') === country ? 0 : 1;
      const sourceRank = value => ({ BASIC: 0, CABLE: 1, SAT: 2 }[liveWatchSourceLabel(value)] ?? 3);
      return preferredLeft - preferredRight
        || countryLeft - countryRight
        || sourceRank(left.sourceLabel) - sourceRank(right.sourceLabel);
    });
    const unique = [];
    const seen = new Set();
    for (const candidate of candidates) {
      if (!candidate.id || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      unique.push(candidate);
      if (unique.length >= 8) break;
    }
    return unique.length ? unique : [{ kind, id, label: '' }];
  } catch {
    return [{ kind, id, label: '' }];
  }
}

async function liveWatchCrossFamilyVariants(kindValue, idValue, nameValue = '', countryValue = '', sourceValue = '', selectedVariantsValue = null) {
  const selectedKind = String(kindValue || '').toLowerCase();
  const selected = Array.isArray(selectedVariantsValue)
    ? selectedVariantsValue
    : await liveWatchChannelVariants(selectedKind, idValue, nameValue, countryValue, sourceValue);
  if (!String(nameValue || '').trim() || !['main', 'daddy', 'north', 'frame'].includes(selectedKind)) return selected;

  // Une famille LiveWatch peut publier une carte valide dont le HLS est mort,
  // alors que la même chaîne fonctionne dans NorthTV ou FrameTV. On prépare
  // les catalogues frères en parallèle, puis on essaie très tôt une occurrence
  // de chaque famille afin de ne pas rester bloqué sur huit variantes mortes.
  const fallbackKinds = ['main', 'north', 'frame'].filter(kind => kind !== selectedKind);
  const fallbackGroups = await Promise.all(fallbackKinds.map(kind =>
    liveWatchChannelVariants(kind, '', nameValue, countryValue, '').catch(() => [])
  ));
  const ordered = [];
  if (selected[0]) ordered.push(selected[0]);
  fallbackGroups.forEach(group => { if (group[0]) ordered.push(group[0]); });
  ordered.push(...selected.slice(1));
  fallbackGroups.forEach(group => ordered.push(...group.slice(1)));

  const unique = [];
  const seen = new Set();
  for (const candidate of ordered) {
    const key = `${candidate?.kind || ''}:${candidate?.id || ''}`;
    if (!candidate?.id || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      ...candidate,
      familyLabel: liveWatchFamilyLabel(candidate.kind),
      crossFamily: candidate.kind !== selectedKind
    });
    if (unique.length >= 16) break;
  }
  return unique.length ? unique : selected;
}

// Compatibilité des anciens tests/catalogues V38. Le resolver V39 utilise la
// liste complète ci-dessus au lieu d'abandonner après la première occurrence.
async function refreshLiveWatchChannelReference(kindValue, idValue, nameValue = '', sourceValue = '') {
  const [reference] = await liveWatchChannelVariants(kindValue, idValue, nameValue, '', sourceValue);
  return reference || { kind: String(kindValue || ''), id: String(idValue || '') };
}

// Ancien contrat de requête : name=${encodeURIComponent(channel.name || '')}

async function firstVerifiedLiveWatchVariant(candidates, probe) {
  if (!candidates.length) return null;
  let timer;
  try {
    return await Promise.race([
      Promise.any(candidates.map(async candidate => {
        const result = await probe(candidate);
        if (!result) throw new Error('Serveur indisponible');
        return result;
      })),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 35_000); })
    ]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function resolveLiveWatchVipPlayback(kindValue, idValue, options = {}) {
  let { kind, id } = validLiveWatchChannelReference(kindValue, idValue);
  if (kind !== 'page' && options?.forceRefresh) liveWatchVipDirectCache.delete(`${kind}:${id}`);
  await liveWatchAccessSession();
  const officialUrl = liveWatchOfficialPlayerUrl(kind, id);
  const pageReference = kind === 'page' ? liveWatchPageReference(id) : null;
  if (kind === 'page' && Array.isArray(pageReference?.meta?.variants) && pageReference.meta.variants.length) {
    const familyLabel = String(pageReference.meta.sourceFamily || 'LiveWatch');
    const variantOptions = pageReference.meta.variants.flatMap((variant, index) => {
      try {
        const variantUrl = safeTvRemoteUrl(variant?.url || '').toString();
        if (!['livewatch.top', 'www.livewatch.top'].includes(new URL(variantUrl).hostname.toLowerCase())) return [];
        const variantPageToken = issueTvReference(variantUrl, {}, {
          kind: 'livewatch-page',
          sourceFamily: familyLabel,
          variants: []
        });
        const bridgeToken = issueLiveWatchBridgeReference('page', variantPageToken, variantUrl);
        return [{
          label: `VIP · ${String(variant?.label || `Serveur ${index + 1}`)}`,
          playbackType: 'embed',
          url: publicPath(`/api/tv/livewatch/vip/${encodeURIComponent(bridgeToken)}/embed`),
          compatPage: true,
          vip: true,
          officialClient: true,
          variantName: String(variant?.name || '')
        }];
      } catch { return []; }
    });
    return {
      ok: true,
      vipActive: true,
      directVerified: false,
      externalUrl: officialUrl,
      sourceFamily: familyLabel,
      options: [...variantOptions, {
        label: 'Public · secours manuel',
        playbackType: 'embed',
        url: officialUrl,
        compatPage: false,
        fallback: true,
        manualOnly: true,
        vip: false
      }]
    };
  }
  const directs = [];
  if (kind !== 'page') {
    // V38 compatibility marker: liveWatchStreamReference(kind, id, 16_000)
    // liveWatchCrossFamilyVariants étend liveWatchChannelVariants sans changer
    // le contrat des variantes historiques de la famille sélectionnée.
    // Stable option contract: label: 'VIP Premium · direct'
    const selectedVariants = await liveWatchChannelVariants(kind, id, options?.name, options?.country, options?.source);
    const probeVariant = async variant => {
      try {
        if (options?.forceRefresh) liveWatchVipDirectCache.delete(`${variant.kind}:${variant.id}`);
        const token = await liveWatchStreamReference(variant.kind, variant.id, 16_000);
        await validateLiveWatchStreamReference(token, 18_000);
        return {
          label: variant.crossFamily
            ? `Secours ${variant.familyLabel} · ${variant.label || 'direct vérifié'}`
            : `VIP · ${variant.label || (variant.id === id ? 'Serveur principal' : 'Serveur alternatif')}`,
          playbackType: 'stream',
          streamUrl: liveWatchStableHlsUrl(variant.kind, variant.id),
          vip: true,
          direct: true,
          verified: true,
          sourceFamily: variant.familyLabel || liveWatchFamilyLabel(variant.kind),
          variantId: variant.id
        };
      } catch {
        // Une entrée du catalogue peut être morte alors qu'une variante du
        // même nom est valide. On poursuit jusqu'au premier HLS réellement lu.
        return null;
      }
    };

    // Le chemin sélectionné est le seul sondé quand il fonctionne : la lecture
    // normale ne paie donc aucun chargement inter-familles supplémentaire.
    const selectedCandidates = (selectedVariants.length ? selectedVariants : [{ kind, id, label: '' }]).slice(0, 3);
    // FrameTV est la famille la plus irrégulière. On prépare dès la résolution
    // les occurrences homonymes LiveWatch/NorthTV comme secours froids, même si
    // le premier segment Frame répond : elles seront prêtes si le CDN coupe plus tard.
    let preparedCrossFamily = [];
    const crossFamilyPromise = kind === 'frame'
      ? liveWatchCrossFamilyVariants(kind, id, options?.name, options?.country, options?.source, selectedVariants).then(items => (preparedCrossFamily = items)).catch(() => [])
      : Promise.resolve([]);
    const selectedVerified = await firstVerifiedLiveWatchVariant(selectedCandidates, probeVariant);
    if (selectedVerified) {
      directs.push(selectedVerified);
      for (const variant of preparedCrossFamily.filter(item => item?.crossFamily).slice(0, 4)) {
        directs.push({
          label: `Secours ${variant.familyLabel} · ${variant.label || 'direct'}`,
          playbackType: 'stream',
          streamUrl: liveWatchStableHlsUrl(variant.kind, variant.id),
          vip: true,
          direct: true,
          verified: false,
          fallback: true,
          sourceFamily: variant.familyLabel || liveWatchFamilyLabel(variant.kind),
          variantId: variant.id
        });
      }
    } else {
      const attemptedKey = `${kind}:${id}`;
      if (kind === 'frame') preparedCrossFamily = await crossFamilyPromise;
      const crossFamily = preparedCrossFamily.length
        ? preparedCrossFamily
        : await liveWatchCrossFamilyVariants(kind, id, options?.name, options?.country, options?.source, selectedVariants);
      // Les trois premiers secours sont sondés en parallèle. Même lorsqu'une
      // famille est hors ligne, le resolver reste sous le délai du client.
      const fallbackCandidates = crossFamily
        .filter(variant => `${variant.kind}:${variant.id}` !== attemptedKey)
        .slice(0, 4);
      const verifiedFallback = await firstVerifiedLiveWatchVariant(fallbackCandidates, probeVariant);
      if (verifiedFallback) directs.push(verifiedFallback);
      // Ancien seuil de compatibilité documentaire : directs.length >= 3.
    }
    // Toutes les versions officielles restent visibles sous le lecteur. Les
    // variantes non sondées sont résolues à la demande par la route HLS stable ;
    // on ne multiplie donc plus BASIC/CABLE/SAT dans la liste des chaînes.
    const exposed = new Set(directs.map(item => String(item.variantId || '')));
    for (const [index, variant] of selectedVariants.entries()) {
      if (!variant?.id || exposed.has(String(variant.id))) continue;
      exposed.add(String(variant.id));
      directs.push({
        label: `VIP · ${variant.label || `Serveur ${index + 1}`}`,
        playbackType: 'stream',
        streamUrl: liveWatchStableHlsUrl(variant.kind, variant.id),
        vip: true,
        direct: true,
        verified: false,
        sourceFamily: liveWatchFamilyLabel(variant.kind),
        variantId: variant.id
      });
    }
  }
  const officialBridgeToken = issueLiveWatchBridgeReference(kind, id, officialUrl);
  const official = {
    label: 'VIP Premium · LiveWatch officiel',
    playbackType: 'embed',
    url: publicPath(`/api/tv/livewatch/vip/${encodeURIComponent(officialBridgeToken)}/embed`),
    compatPage: true,
    vip: true,
    officialClient: true
  };
  const publicFallback = kind === 'page' ? {
    label: 'Public · secours manuel',
    playbackType: 'embed',
    url: officialUrl,
    compatPage: false,
    fallback: true,
    manualOnly: true,
    vip: false
  } : {
    label: 'Public · 2 pubs (secours manuel)',
    playbackType: 'embed',
    url: officialUrl,
    compatPage: false,
    fallback: true,
    manualOnly: true,
    vip: false
  };
  return {
    ok: true,
    vipActive: true,
    directVerified: directs.some(item => item.verified),
    externalUrl: officialUrl,
    sourceFamily: kind === 'page' ? (pageReference?.meta?.sourceFamily || 'LiveWatch Sports') : (kind === 'main' ? 'LiveWatch' : kind),
    // Les directs ont été validés jusqu'au premier segment. Le lecteur React
    // reste un dernier secours VIP, jamais prioritaire sur une variante saine.
    options: directs.some(item => item.verified)
      ? [...directs.map(item => item.verified ? item : { ...item, manualOnly: true }), official, publicFallback]
      : [official, ...directs.map(item => ({ ...item, manualOnly: true })), publicFallback]
  };
}

async function liveWatchVipDiagnosticCheck(label, catalogUrl) {
  try {
    const session = await liveWatchAccessSession();
    const raw = await fetchTvCatalog(catalogUrl, 8_000);
    const payload = JSON.parse(raw.text || '{}');
    const parsed = parseLiveWatchCatalog(payload, raw.finalUrl || catalogUrl);
    const channel = (parsed.channels || []).find(item => liveWatchEmbedReference(item)?.kind === 'main');
    if (!channel) throw new HttpError(502, 'Aucune chaîne LiveWatch principale exploitable dans le catalogue officiel.');
    const ref = liveWatchEmbedReference(channel);
    const page = `${liveWatchOrigin}/embed/${encodeURIComponent(ref.id)}`;
    const response = await fetchTvRemote(page, {
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.7',
        authorization: `Bearer ${session.accessToken}`,
        referer: `${liveWatchOrigin}/`,
        'user-agent': 'Noctra-Media-Client/87'
      },
      signal: AbortSignal.timeout(8_000)
    });
    const contentType = String(response.headers.get('content-type') || '');
    try { await response.body?.cancel?.(); } catch {}
    if (!response.ok || !/html/i.test(contentType)) throw new HttpError(response.status || 502, `Lecteur LiveWatch officiel inaccessible (${response.status || 0}).`);
    return { label, ok: true, channel: channel.name || 'Chaîne test', mode: 'vip-official-embed', status: response.status, contentType };
  } catch (error) {
    return { label, ok: false, message: cleanError(error) };
  }
}

async function liveWatchVipDiagnostics() {
  const startedAt = Date.now();
  const session = await liveWatchAccessSession();
  const profile = await liveWatchProfile(session.accessToken, session.userId).catch(() => null);
  const profileVip = Boolean(profile?.is_vip || profile?.role === 'vip' || profile?.role === 'admin' || session.isVip);
  const checks = [await liveWatchVipDiagnosticCheck('LiveWatch', liveWatchChannelCatalogUrls[0][1])];
  const reachable = checks.filter(item => item.ok).length;
  return {
    ok: profileVip && reachable === checks.length,
    authenticated: true,
    isVip: profileVip,
    account: maskedLiveWatchEmail(session.email),
    checks,
    durationMs: Date.now() - startedAt,
    message: profileVip
      ? (reachable ? 'VIP Premium confirmé · lecteur officiel LiveWatch accessible.' : 'VIP Premium confirmé, mais le lecteur officiel LiveWatch est actuellement inaccessible depuis le serveur.')
      : 'La session LiveWatch est connectée mais le profil VIP n’est pas confirmé.'
  };
}

async function buildLiveWatchCuratedCatalog(results, cacheKey, options = {}) {
  const deduped = new Map();
  const errors = [];
  results.forEach((result, index) => {
    const sourceName = liveWatchChannelCatalogUrls[index]?.[0] || `Source ${index + 1}`;
    if (!result || result.status !== 'fulfilled') {
      if (result?.status === 'rejected') errors.push(`${sourceName} indisponible`);
      return;
    }
    result.value.forEach(channel => {
      const reference = liveWatchEmbedReference(channel);
      const key = reference ? `${reference.kind}:${reference.id}` : String(channel.id || '');
      if (!key) return;
      if (!deduped.has(key)) deduped.set(key, channel);
    });
  });
  const baseCounts = new Map();
  for (const channel of deduped.values()) {
    const baseName = channel.baseName || cleanLiveWatchChannelName(channel.name) || channel.name;
    const key = normalizedIdentifier(`${baseName} ${channel.country || ''}`);
    baseCounts.set(key, Number(baseCounts.get(key) || 0) + 1);
  }
  const labelOrdinals = new Map();
  const channels = [...deduped.values()].map(channel => {
    const baseName = channel.baseName || cleanLiveWatchChannelName(channel.name) || channel.name;
    const baseKey = normalizedIdentifier(`${baseName} ${channel.country || ''}`);
    if (Number(baseCounts.get(baseKey) || 0) <= 1) return { ...channel, name: baseName };
    const variantLabel = channel.variantLabel || 'VARIANTE';
    const labelKey = `${baseKey}|${normalizedIdentifier(variantLabel)}`;
    const ordinal = Number(labelOrdinals.get(labelKey) || 0) + 1;
    labelOrdinals.set(labelKey, ordinal);
    return {
      ...channel,
      name: `${baseName} · ${variantLabel}${ordinal > 1 ? ` ${ordinal}` : ''}`,
      description: [channel.description, `Variante ${variantLabel}${ordinal > 1 ? ` ${ordinal}` : ''}`].filter(Boolean).join(' · ')
    };
  }).sort((a, b) => {
    const ac = normalizedIdentifier(a.country || a.group || '');
    const bc = normalizedIdentifier(b.country || b.group || '');
    const ar = /france|belg|switz|suisse|canada|quebec|luxembourg|monaco/.test(ac) ? 0 : 1;
    const br = /france|belg|switz|suisse|canada|quebec|luxembourg|monaco/.test(bc) ? 0 : 1;
    return ar - br || a.name.localeCompare(b.name, 'fr');
  });
  const sharedLogoChannels = shareTvLogosAcrossDuplicateNames(channels.slice(0, 2500));
  const value = {
    name: 'LiveWatch',
    sourceType: 'livewatch',
    groups: [],
    channels: sharedLogoChannels,
    count: sharedLogoChannels.length,
    warning: errors.length ? `Catalogue partiel : ${errors.join(', ')}.` : '',
    curation: 'fr-us',
    progressive: Boolean(options.progressive)
  };
  tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 15 * 60_000, value });
  void persistLiveWatchCuratedCatalog(value);

  // Les logos ne bloquent jamais l'ouverture du catalogue en V69.
  if (sharedLogoChannels.length) {
    void enrichTvLogosFromIptvOrg(sharedLogoChannels).then(enriched => {
      const latest = tvCatalogCache.get(cacheKey);
      if (latest?.value !== value) return;
      const enrichedChannels = shareTvLogosAcrossDuplicateNames(enriched);
      latest.value = { ...value, channels: enrichedChannels, count: enrichedChannels.length };
    }).catch(() => undefined);
  }
  return value;
}

async function readPersistedLiveWatchCuratedCatalog() {
  if (liveWatchCuratedDiskCachePromise) return liveWatchCuratedDiskCachePromise;
  liveWatchCuratedDiskCachePromise = (async () => {
    try {
      const payload = JSON.parse(await readFile(liveWatchCatalogCachePath, 'utf8'));
      const age = Date.now() - Number(payload?.savedAt || 0);
      const value = payload?.value;
      if (age < 0 || age > 24 * 60 * 60_000 || !Array.isArray(value?.channels) || !value.channels.length) return null;
      return value;
    } catch {
      return null;
    }
  })();
  return liveWatchCuratedDiskCachePromise;
}

async function persistLiveWatchCuratedCatalog(value) {
  if (!Array.isArray(value?.channels) || !value.channels.length) return;
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(liveWatchCatalogCachePath, `${JSON.stringify({ savedAt: Date.now(), value })}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function refreshLiveWatchCuratedCatalog(cacheKey) {
  if (liveWatchCuratedRefreshPromise) return liveWatchCuratedRefreshPromise;
  liveWatchCuratedRefreshPromise = (async () => {
    const [sourceName, url] = liveWatchChannelCatalogUrls[0];
    const raw = await fetchTvCatalog(url, 10_000);
    let payload;
    try { payload = JSON.parse(raw.text); } catch { throw new Error('LiveWatch : JSON invalide'); }
    const parsed = parseLiveWatchCatalog(payload, raw.finalUrl || url);
    const channels = curateLiveWatchChannels(parsed.channels, sourceName)
      .map(channel => ({ ...channel, provider: 'LiveWatch' }))
      .filter(channel => liveWatchEmbedReference(channel)?.kind === 'main');
    if (!channels.length) throw new Error('Le catalogue LiveWatch principal ne contient actuellement aucune chaîne exploitable.');
    return buildLiveWatchCuratedCatalog([{ status: 'fulfilled', value: channels }], cacheKey, { progressive: false });
  })();
  try {
    return await liveWatchCuratedRefreshPromise;
  } finally {
    liveWatchCuratedRefreshPromise = null;
  }
}

async function tvCatalogFromLiveWatchCurated() {
  const cacheKey = 'livewatch::official::fr-us';
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const staleValue = cached?.value || null;
  if (staleValue?.channels?.length) {
    void refreshLiveWatchCuratedCatalog(cacheKey).catch(() => undefined);
    return { ...staleValue, progressive: true, stale: true };
  }
  const persisted = await readPersistedLiveWatchCuratedCatalog();
  if (persisted?.channels?.length) {
    const immediate = { ...persisted, progressive: true, stale: true };
    tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 30_000, value: immediate });
    void refreshLiveWatchCuratedCatalog(cacheKey).catch(() => undefined);
    return immediate;
  }
  try {
    return await refreshLiveWatchCuratedCatalog(cacheKey);
  } catch (error) {
    throw new HttpError(502, `Le catalogue LiveWatch principal est momentanément indisponible. ${cleanError(error)}`);
  }
}

function decodeTvHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16) || 32));
}

function wiTvNameFromUrl(urlValue) {
  let pathname = '';
  try { pathname = new URL(urlValue).pathname; } catch { pathname = String(urlValue || ''); }
  const file = pathname.split('/').filter(Boolean).pop() || '';
  const slug = decodeURIComponent(file).replace(/\.html?$/i, '').replace(/^\d+[\-_]?/, '').replace(/[-_]+/g, ' ').trim();
  if (!slug) return 'Chaîne WiTV';
  return slug.split(/\s+/).map(word => /^(?:tv|hd|fr|rmc|ocs|tf1|m6|w9|tfx|ab1|syfy)$/i.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function wiTvNearbyImage(html, offset, baseUrl) {
  const start = Math.max(0, offset - 900);
  const end = Math.min(html.length, offset + 1500);
  const snippet = html.slice(start, end);
  const images = [...snippet.matchAll(/<img\b[^>]*>/gi)];
  if (!images.length) return { logo: '', alt: '' };
  const ranked = images.map(match => {
    const tag = match[0];
    const src = tag.match(/\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)?.[1] || '';
    const alt = decodeTvHtml(tag.match(/\balt=["']([^"']*)["']/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    const absolute = start + (match.index || 0);
    return { src, alt, distance: Math.abs(absolute - offset) };
  }).filter(item => item.src).sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  if (!best) return { logo: '', alt: '' };
  let logo = '';
  try { logo = resolveTvUrl(decodeTvHtml(best.src), baseUrl); } catch {}
  return { logo, alt: best.alt };
}

function parseWiTvCategoryHtml(htmlValue, baseUrl, group = 'WiTV') {
  const html = String(htmlValue || '');
  const channels = [];
  const seen = new Set();
  const expression = /href=["']([^"']*\/chaines-live\/(?!\s*(?:sport|cinema|documentaire|generaliste|enfants|info|musique|belgique|suisse)\/?["'])[^"']+\.html(?:\?[^"']*)?)["']/gi;
  let match;
  while ((match = expression.exec(html)) && channels.length < 500) {
    let pageUrl;
    try { pageUrl = resolveTvUrl(decodeTvHtml(match[1]), baseUrl); } catch { continue; }
    if (seen.has(pageUrl)) continue;
    seen.add(pageUrl);
    const nearby = wiTvNearbyImage(html, match.index || 0, baseUrl);
    const name = nearby.alt && !/^(?:regarder|live)$/i.test(nearby.alt) ? nearby.alt : wiTvNameFromUrl(pageUrl);
    const resolveRef = encodeTvStateReference('witv-page', {
      url: safeTvRemoteUrl(pageUrl).toString(),
      referer: safeTvRemoteUrl(baseUrl).toString(),
      name
    });
    channels.push({
      id: createHash('sha1').update(`${name}\n${pageUrl}`).digest('hex').slice(0, 16),
      name,
      group,
      category: group,
      provider: 'WiTV',
      logo: nearby.logo,
      description: `WiTV · ${group}`,
      playbackType: 'resolver',
      resolverUrl: `/api/tv/resolve/${resolveRef}`,
      externalUrl: pageUrl,
      compatPage: true,
      streamKind: 'Lecteur WiTV multi-serveurs'
    });
  }
  return channels.sort((left, right) => left.name.localeCompare(right.name, 'fr', {
    numeric: true,
    sensitivity: 'base'
  }));
}

function tvIframeCandidatesFromHtml(htmlValue, baseUrl) {
  const html = String(htmlValue || '');
  const candidates = [];
  const seen = new Set();
  const expression = /<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  const addCandidate = rawValue => {
    const raw = decodeTvHtml(rawValue).replace(/\\\//g, '/').trim();
    if (!raw || /^(?:about:|javascript:|data:)/i.test(raw)) return;
    let url;
    try { url = resolveTvUrl(raw, baseUrl); } catch { return; }
    if (seen.has(url)) return;
    seen.add(url);
    let host = '';
    let pathname = '';
    try { const parsed = new URL(url); host = parsed.hostname.toLowerCase(); pathname = parsed.pathname.toLowerCase(); } catch {}
    const emptyYouTubeEmbed = /(?:^|\.)youtube(?:-nocookie)?\.com$/i.test(host) && /^\/embed\/?$/i.test(pathname);
    const emptyYouTubeShortLink = /(?:^|\.)youtu\.be$/i.test(host) && /^\/?$/i.test(pathname);
    if (emptyYouTubeEmbed || emptyYouTubeShortLink) return;
    const adLike = /(?:^|\.)(?:ad|ads|doubleclick|googlesyndication)\./i.test(host) || /(?:^|[\/_-])(?:ad|ads)(?:[\/_-]|$)/i.test(pathname);
    let score = 0;
    if (/player|embed|live|watch|stream/i.test(`${host}${pathname}`)) score += 10;
    if (['witv.football', 'www.witv.football'].includes(host) && /^\/player\/playerjs\/witv-player\.php$/i.test(pathname)) score += 120;
    if (/(?:^|\.)livehdtvs?\.com$/i.test(host)) score -= 160;
    if (/apl425\.me$/i.test(host)) score += 4;
    if (adLike) score -= 30;
    const nearStart = Math.max(0, (match?.index || 0) - 260);
    const nearEnd = Math.min(html.length, (match?.index || 0) + 180);
    const nearby = stripTvHtml(html.slice(nearStart, nearEnd));
    const sourceMatch = nearby.match(/(?:source|serveur)\s*(\d+)/i);
    const label = sourceMatch ? `Serveur ${sourceMatch[1]}` : '';
    candidates.push({ url, score, host, label });
  };
  while ((match = expression.exec(html)) && candidates.length < 20) addCandidate(match[1]);
  // Some public channel pages inject their iframe URL from serialized JSON/JS.
  // We only accept explicit public HTTP(S) URLs; no token/private API extraction.
  const serialized = /["'](?:embed_url|embedUrl|player_url|playerUrl|iframe_url|iframeUrl|stream_page|streamPage)["']\s*:\s*["']([^"']+)["']/gi;
  while ((match = serialized.exec(html)) && candidates.length < 30) addCandidate(match[1]);
  const sourceTag = /<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  while ((match = sourceTag.exec(html)) && candidates.length < 30) addCandidate(match[1]);
  return candidates.sort((a, b) => b.score - a.score).filter(item => item.score > -20);
}

function isWiTvPublicPlayer(urlValue) {
  try {
    const parsed = new URL(urlValue);
    return ['witv.football', 'www.witv.football'].includes(parsed.hostname.toLowerCase())
      && /^\/player\/playerjs\/witv-player\.php$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function wiTvStreamFromPlayerHtml(htmlValue, baseUrl) {
  return wiTvStreamCandidatesFromPlayerHtml(htmlValue, baseUrl)[0] || '';
}


function wiTvStreamCandidatesFromPlayerHtml(htmlValue, baseUrl) {
  const html = String(htmlValue || '');
  const values = [];
  const seen = new Set();
  const add = rawValue => {
    let raw = decodeTvHtml(String(rawValue || ''))
      .replace(/\\u002f/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&')
      .trim();
    if (!raw) return;
    // PlayerJS accepte aussi des listes du type `[HD]https://...m3u8,[SD]...`.
    // On extrait donc chaque URL HLS publique au lieu d'exiger que toute la
    // valeur `file` soit elle-même une URL.
    const nested = raw.match(/(?:https?:)?\/\/[^\s"'`,]+?\.m3u8?(?:[^\s"'`,]*)?/gi) || [];
    if (nested.length && !(nested.length === 1 && nested[0] === raw)) {
      nested.forEach(add);
      return;
    }
    raw = raw.replace(/^\[[^\]]+\]\s*/, '');
    try {
      const resolved = safeTvRemoteUrl(resolveTvUrl(raw, baseUrl)).toString();
      if (!/\.m3u8?(?:$|[?#])/i.test(resolved)) return;
      if (!seen.has(resolved)) { seen.add(resolved); values.push(resolved); }
    } catch {}
  };

  const patterns = [
    /(?:var|let|const)\s+(?:streamUrl|stream_url|hlsUrl|hls_url)\s*=\s*(["'`])([^"'`]+)\1/gi,
    /new\s+Playerjs\s*\(\s*\{[\s\S]{0,12000}?\bfile\s*:\s*(["'`])([^"'`]+)\1/gi,
    /(?:^|[,\{\s])file\s*:\s*(["'`])([^"'`]+)\1/gi,
    /["'](?:stream_url|streamUrl|hls|hls_url|hlsUrl|file|src)["']\s*:\s*(["'`])([^"'`]+)\1/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) && values.length < 12) add(match[2]);
  }

  // Repli : certaines versions du lecteur sérialisent l'URL dans un bloc JS
  // sans clé stable. On ne retient que les URL HTTP(S) HLS explicites.
  const direct = /(?:https?:)?\\?\/\\?\/[^\s"'<>`]+?\.m3u8?(?:[^\s"'<>`]*)?/gi;
  let match;
  while ((match = direct.exec(html)) && values.length < 12) add(match[0]);
  return values;
}

async function probeTvMediaBody(response, signal = null, timeoutMs = 8_000) {
  const reader = response.body?.getReader?.();
  let timer;
  let onAbort;
  try {
    if (!reader) throw new HttpError(502, 'Le serveur TV ne renvoie aucune donnée média.');
    const type = String(response.headers.get('content-type') || '');
    if (/text\/html|application\/(?:xhtml|json)/i.test(type)) {
      throw new HttpError(415, 'Le serveur TV renvoie une page à la place du média.');
    }
    const read = async () => {
      const chunks = [];
      let size = 0;
      while (size < 32) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        const prefix = Buffer.from(value.subarray(0, 512 - size));
        chunks.push(prefix);
        size += prefix.length;
      }
      if (!size) throw new HttpError(502, 'Le segment TV est vide.');
      const prefix = Buffer.concat(chunks).toString('utf8').trimStart();
      if (/^(?:<!doctype\s+html|<html\b|<\?xml|\{\s*"(?:error|message|status)"\s*:)/i.test(prefix)) {
        throw new HttpError(415, 'Le segment TV contient une réponse d’erreur.');
      }
    };
    await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(504, 'Aucune donnée média reçue à temps.')), timeoutMs);
      onAbort = () => reject(signal.reason || new HttpError(504, 'Vérification TV annulée.'));
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    })]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    // Ne pas télécharger tout un segment pendant la sélection d'un serveur.
    try { await reader?.cancel?.(); } catch {}
  }
}

function tvRecentPlaylistProbeUri(text, baseUrl, offset = 0) {
  // Sonde uniquement : le lecteur reçoit toujours le master original et garde
  // son ABR. Ne pas tester un segment sorti de la fenêtre live entre deux GET.
  const lines = String(text).split(/\r?\n/).map(line => line.trim());
  const variants = [];
  const segments = [];
  let bandwidth = null;
  let gap = false;
  for (const line of lines) {
    if (line.startsWith('#EXT-X-STREAM-INF:')) bandwidth = Number(line.match(/(?:^|[:,])BANDWIDTH=(\d+)/)?.[1]) || Infinity;
    else if (line === '#EXT-X-GAP') gap = true;
    else if (line && !line.startsWith('#')) {
      const url = safeTvRemoteUrl(resolveTvUrl(line, baseUrl)).toString();
      if (bandwidth !== null) variants.push({ url, bandwidth });
      else if (!gap) segments.push(url);
      bandwidth = null;
      gap = false;
    }
  }
  if (variants.length) return variants.sort((a, b) => a.bandwidth - b.bandwidth)[0].url;
  return segments[Math.min(segments.length - 1, Math.max(0, segments.length - 2 + offset))] || '';
}

async function validateWiTvHlsStream(streamUrlValue, headers = {}, timeoutMs = 8_000, signal = null, recentSegments = true) {
  const streamUrl = safeTvRemoteUrl(streamUrlValue);
  const relayHeaders = {
    accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain;q=0.8,*/*;q=0.3',
    'user-agent': headers['user-agent'] || 'Mozilla/5.0 Noctra/152',
    ...(headers.origin ? { origin: headers.origin } : {}),
    ...(headers.referer ? { referer: headers.referer } : {})
  };
  let currentUrl = streamUrl.toString();
  let rootUrl = currentUrl;
  const cookies = new Map([[streamUrl.origin, headers.cookie || '']]);
  // Une échéance commune borne master + variante + premier média, y compris
  // une réponse HTTP 200 dont le corps reste bloqué.
  const deadline = AbortSignal.timeout(Math.max(8_000, (Number(timeoutMs) || 8_000) * 2));
  const probeSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let expectPlaylist = true;
  let adjacentSegment = '';
  for (let depth = 0; depth < 4; depth += 1) {
    probeSignal.throwIfAborted();
    const cookie = cookies.get(new URL(currentUrl).origin) || '';
    const response = await fetchTvRemote(currentUrl, {
      headers: { ...relayHeaders, ...(cookie ? { cookie } : {}) },
      signal: AbortSignal.any([probeSignal, AbortSignal.timeout(Math.max(4_000, Number(timeoutMs) || 8_000))])
    });
    if (!response.ok) {
      try { await response.body?.cancel?.(); } catch {}
      // Une fenêtre live avance entre la playlist et le GET du segment.
      // Essayer une seule fois son voisin récent, sans changer de fournisseur.
      if (!expectPlaylist && adjacentSegment && [404, 410].includes(response.status)) {
        currentUrl = adjacentSegment;
        adjacentSegment = '';
        depth -= 1;
        continue;
      }
      throw new HttpError(response.status, `Flux HLS WiTV indisponible (${response.status}).`);
    }
    const finalUrl = response.url || currentUrl;
    if (depth === 0) rootUrl = finalUrl;
    const responseOrigin = new URL(finalUrl).origin;
    cookies.set(responseOrigin, mergeTvCookieHeaders(cookies.get(responseOrigin) || '', tvResponseCookieHeader(response)));
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const playlist = expectPlaylist || /(?:mpegurl|m3u8)/i.test(contentType) || /\.m3u8?(?:$|[?#/])/i.test(response.url || currentUrl);
    if (!playlist) {
      await probeTvMediaBody(response, probeSignal, Math.max(4_000, Number(timeoutMs) || 8_000));
      return { url: rootUrl, cookie: cookies.get(new URL(rootUrl).origin) || '' };
    }
    const text = await readTvPlaylistBody(response);
    const next = recentSegments
      ? tvRecentPlaylistProbeUri(text, response.url || currentUrl)
      : liveWatchFirstPlaylistUri(text, response.url || currentUrl);
    if (!next) throw new HttpError(502, 'La playlist WiTV ne contient aucun média testable.');
    expectPlaylist = /#EXT-X-STREAM-INF:/i.test(text);
    const adjacent = recentSegments && !expectPlaylist ? tvRecentPlaylistProbeUri(text, finalUrl, 1) : '';
    adjacentSegment = adjacent !== next ? adjacent : '';
    currentUrl = next;
  }
  throw new HttpError(502, 'Le chemin WiTV n’atteint aucun segment vidéo exploitable.');
}

async function resolveWiTvPlayerOption(item, index, pageUrl, signal = null) {
  const label = item.label || `Serveur ${index + 1}`;
  if (!isWiTvPublicPlayer(item.url)) {
    // Les iframes tierces (notamment livehdtv/livehdtvs) changent de domaine,
    // refusent l'intégration ou chargent une page vide. WiTV fournit déjà son
    // propre PlayerJS : ne jamais laisser un tiers cassé passer devant lui.
    throw new HttpError(422, `Lecteur WiTV tiers ${label} ignoré.`);
  }
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
  const officialPlayerUrl = safeTvRemoteUrl(item.url).toString();
  const fallbackUrl = officialPlayerUrl;
  const controller = new AbortController();
  // Une seule échéance couvre page + candidats, au lieu de 24 s puis 18 s
  // pour chaque URL. Les autres lecteurs n'héritent pas de cette politique.
  const attemptSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(24_000), ...(signal ? [signal] : [])]);
  let failureStage = 'player-page';
  let nativeFailure = null;
  try {
    const response = await fetchTvRemote(item.url, {
      signal: attemptSignal,
      cache: 'no-store',
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        referer: pageUrl,
        'user-agent': userAgent
      }
    });
    if (!response.ok) {
      try { await response.body?.cancel?.(); } catch {}
      throw new HttpError(response.status, 'Page WiTV indisponible.');
    }
    if (response.ok) {
      const playerCookie = tvResponseCookieHeader(response);
      const playerHtml = await response.text();
      if (playerHtml.length <= 1024 * 1024) {
        const playerUrl = response.url || item.url;
        const candidateUrls = wiTvStreamCandidatesFromPlayerHtml(playerHtml, playerUrl);
        failureStage = candidateUrls.length ? 'hls-validation' : 'hls-extraction';
        return await Promise.any(candidateUrls.slice(0, 4).map(async candidateUrl => {
            attemptSignal.throwIfAborted();
            // V151 : WiTV renouvelle parfois ses URLs et peut exiger le cookie
            // posé par la page PlayerJS. On vérifie donc réellement la playlist
            // avant de l'afficher comme HLS, puis on conserve cookie + referer
            // pour le master et tous ses segments.
            const relayHeaders = {
              origin: new URL(playerUrl).origin,
              referer: playerUrl,
              'user-agent': userAgent,
              ...(playerCookie && new URL(candidateUrl).hostname === new URL(playerUrl).hostname ? { cookie: playerCookie } : {})
            };
            const validated = await validateWiTvHlsStream(candidateUrl, relayHeaders, 8_000, attemptSignal, true);
            const streamHeaders = { ...relayHeaders, cookie: validated.cookie || undefined };
            const streamToken = issueTvReference(validated.url, streamHeaders, { kind: 'witv-hls', provider: 'WiTV', forceHls: true });
            return {
              label,
              streamUrl: tvPublicStreamUrl(streamToken),
              playbackType: 'stream',
              host: item.host,
              native: true,
              verified: true,
              serverIndex: index,
              delivery: 'proxied-hls',
              fallbackUrl,
              fallbackCompatPage: false
            };
        }));
      }
    }
  } catch (error) {
    const cause = error?.errors?.[0] || error;
    nativeFailure = { stage: failureStage, status: Number(cause?.status) || 0 };
    // Le lecteur officiel préparé reste le secours si l'extraction HLS échoue.
  } finally { controller.abort(); }
  // Le PlayerJS officiel reste utilisable même si son URL HLS vient de tourner
  // entre l'extraction et la validation. Contrairement au bridge local opaque,
  // cette iframe conserve l'origine WiTV dont le lecteur et le CDN ont besoin.
  return {
    label: `${label} · lecteur officiel`,
    url: officialPlayerUrl,
    externalUrl: officialPlayerUrl,
    playbackType: 'embed',
    host: item.host,
    native: false,
    compatPage: false,
    fallback: true,
    officialClient: true,
    nativeFailure: nativeFailure || { stage: failureStage, status: 0 }
  };
}

function wiTvChannelIdentity(value) {
  return normalizedIdentifier(value)
    .replace(/\b(?:uhd|fhd|full hd|hd|sd|france|fr)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function verifiedLiveWatchNamedFallbackOptions(channelNameValue, labelPrefix = 'Secours LiveWatch') {
  const channelName = String(channelNameValue || '').trim();
  if (!channelName) return [];
  await liveWatchAccessSession();
  const variants = await liveWatchChannelVariants(
    'main',
    'noctra-fallback',
    channelName,
    'France',
    `${liveWatchOrigin}/api/v1/public/all`
  );
  const options = [];
  for (const variant of variants) {
    if (variant.id === 'noctra-fallback') continue;
    try {
      const token = await liveWatchStreamReference('main', variant.id, 10_000);
      await validateLiveWatchStreamReference(token, 6_000);
      options.push({
        label: `${labelPrefix} · ${variant.label || 'VIP vérifié'}`,
        streamUrl: liveWatchStableHlsUrl('main', variant.id),
        playbackType: 'stream',
        native: true,
        vip: true,
        verified: true,
        fallback: true,
        providerFallback: 'LiveWatch'
      });
      if (options.length >= 2) break;
    } catch {}
  }
  return options;
}

async function wiTvNoctraFallbackOption(channelNameValue) {
  const channelName = String(channelNameValue || '').trim();
  if (!channelName) return null;
  const source = builtInTvSources().find(item => item.id === 'fstv-public' || item.type === 'fstv');
  if (!source?.url) return null;
  const root = safeTvRemoteUrl(source.url).toString();
  const identity = wiTvChannelIdentity(channelName);
  const cached = tvCatalogCache.get(`fstv::${root}`);
  let candidates = cached?.expiresAt > Date.now() ? (cached.value?.channels || []) : [];
  let match = candidates.find(channel => wiTvChannelIdentity(channel?.name) === identity);
  if (!match) {
    // Le catalogue FSTV complet enrichit plus d'une centaine de pages. Pour un
    // secours WiTV, on ne charge que l'index puis la page de la chaîne visée.
    const pages = [new URL('/index.php?category=chaines-live&do=cat', root).toString(), root];
    for (const pageUrl of pages) {
      try {
        const page = await fetchPublicTvHtml(pageUrl, 'FSTV', 10_000);
        candidates = parseFstvChannels(page.html, page.finalUrl);
        match = candidates.find(channel => wiTvChannelIdentity(channel?.name) === identity);
        if (match) break;
      } catch {}
    }
  }
  if (!match) return null;
  if (match.resolverUrl) {
    try {
      const token = decodeURIComponent(new URL(match.resolverUrl, 'http://noctra.local').pathname.split('/').pop() || '');
      const resolved = await resolveFstvPageReference(token);
      const verified = (resolved.options || []).find(option => option?.streamUrl && option?.verified);
      if (verified) return {
        ...verified,
        label: `Secours Noctra · ${verified.providerFallback || 'FSTV'}`,
        fallback: true
      };
    } catch {}
  }
  if (!match.streamUrl) [match] = await enrichFstvDirectStreams([match]);
  if (!match?.streamUrl && match?.embedUrl) {
    return {
      label: 'Secours Noctra · FSTV web',
      url: match.embedUrl,
      playbackType: 'embed',
      compatPage: Boolean(match.compatPage),
      fallback: true,
      providerFallback: 'FSTV'
    };
  }
  if (!match?.streamUrl) return null;
  return {
    label: 'Secours Noctra · FSTV',
    streamUrl: match.streamUrl,
    playbackType: 'stream',
    native: true,
    fallback: true,
    providerFallback: 'FSTV'
  };
}

function sanitizeWiTvPlayerHtml(htmlValue, baseUrl) {
  const parsedBase = new URL(baseUrl);
  const baseHref = `${parsedBase.origin}${parsedBase.pathname.replace(/[^/]*$/, '')}`;
  let html = String(htmlValue || '');
  html = html.replace(/<meta\b[^>]*http-equiv=["']?(?:content-security-policy|x-frame-options)["']?[^>]*>/gi, '');
  html = html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, (script, attributes) => {
    const fingerprint = `${attributes}\n${script}`.toLowerCase();
    return /data-cfasync\s*=\s*["']?false|adsco\.re|adstook|popunder|_cf_chl_opt|challenge-platform|cdn-cgi\/challenge/.test(fingerprint) ? '' : script;
  });
  html = html.replace(/\sonerror\s*=\s*(["'])[^"']*\bg\s*\([^"']*\1/gi, '');
  const bridge = `<base href="${baseHref}"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000}#player{width:100%!important;height:100%!important}</style><script>window.g=window.g||function(){};(function(){let playing=false;function bind(v){if(!v||v.dataset.noctraBound)return;v.dataset.noctraBound='1';v.addEventListener('playing',()=>{playing=true;parent.postMessage({type:'noctra-witv-state',state:'playing'},'*')});v.addEventListener('error',()=>parent.postMessage({type:'noctra-witv-state',state:'error'},'*'))}new MutationObserver(()=>document.querySelectorAll('video').forEach(bind)).observe(document.documentElement,{childList:true,subtree:true});addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('video').forEach(bind);setTimeout(()=>{if(!playing)parent.postMessage({type:'noctra-witv-state',state:'stalled'},'*')},38000)})})();</script>`;
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, match => `${match}${bridge}`);
  else html = `<!doctype html><html><head>${bridge}</head><body>${html}</body></html>`;
  return html;
}

async function resolveTvPageReference(token) {
  const additionalRef = tvReferences.get(String(token || ''));
  if (additionalRef?.meta?.kind === 'brigitte-event') {
    if (additionalRef.expiresAt <= Date.now()) throw new HttpError(410, 'Recharge le programme BrigitteTV.');
    const page = await fetchPublicTvHtml(additionalRef.url, 'BrigitteTV', 12_000);
    const choices = parseBrigittePlayers(page.html, page.finalUrl).sort((a,b)=>Number(!/Cartel/i.test(a.label))-Number(!/Cartel/i.test(b.label)));
    const options = choices.map(choice => {
      const id = issueTvReference(safeTvRemoteUrl(choice.url).toString(), {}, {kind:'brigitte-player'});
      return {label:choice.label, resolveUrl:publicPath('/api/tv/resolve/'+id), playbackType:'resolver'};
    });
    return {options: [...options,{label:'Page du match · compatibilité mobile',url:page.finalUrl,playbackType:'embed',compatPage:true,manualOnly:options.length>0}], externalUrl:page.finalUrl};
  }
  if (additionalRef?.meta?.kind === 'brigitte-player') {
    if (additionalRef.expiresAt <= Date.now()) throw new HttpError(410, 'Recharge le programme BrigitteTV.');
    // Keep the published embed document: its nested player requires the
    // provider's real embedding origin. Do not extract the protected leaf URL.
    const target = safeTvRemoteUrl(additionalRef.url).toString();
    try {
      let current=target;let parentUrl='';const seen=new Set();
      for(let depth=0;depth<4&&!seen.has(current);depth++){
        seen.add(current);
        const page=await fetchPublicTvHtml(current,'BrigitteTV',6000,parentUrl);
        const parsed=parseBrigitteNativeDocument(page.html,page.finalUrl);
        if(parsed.urls.length){
          const headers={referer:page.finalUrl};
          const ready=await Promise.any(parsed.urls.slice(0,3).map(async url=>validateWiTvHlsStream(url,headers,6000,null,true)));
          const nativeToken=issueTvReference(ready.url,{...headers,...(ready.cookie?{cookie:ready.cookie}:{})},{provider:'BrigitteTV',forceHls:true});
          return {options:[{playbackType:'stream',streamUrl:publicPath('/api/tv/stream/'+nativeToken),resolveUrl:publicPath('/api/tv/resolve/'+token)}],externalUrl:target};
        }
        if(!parsed.next)break;
        parentUrl=page.finalUrl;
        current=safeTvRemoteUrl(parsed.next).toString();
      }
    } catch { /* Keep the published web player available when no native media validates. */ }
    return {options:[{url:target,playbackType:'embed',compatPage:false}],externalUrl:target};
  }
  if (['streamed-event', 'streamed-source'].includes(additionalRef?.meta?.kind)) {
    if (additionalRef.expiresAt <= Date.now()) throw new HttpError(410, 'Recharge la source Streamed.');
    return resolveStreamedReference(additionalRef);
  }
  if (additionalRef?.meta?.kind === 'additional-resolver') {
    if (additionalRef.expiresAt <= Date.now()) throw new HttpError(410, 'Rechargez la source TV.');
    return additionalTv.resolve(additionalRef.meta);
  }
  const nativeState = decodeTvStateReference(token, 'witv-native');
  if (nativeState) {
    const item = nativeState.item;
    if (!item || !isWiTvPublicPlayer(item.url)) throw new HttpError(403, 'Référence WiTV invalide.');
    const option = await resolveWiTvPlayerOption(item, Number(nativeState.index) || 0, safeTvRemoteUrl(nativeState.pageUrl).toString());
    if (!option.streamUrl) throw new HttpError(502, 'Ce serveur WiTV ne fournit pas de HLS disponible.');
    return { options: [{ ...option, label: `${option.label} · HLS`, resolveUrl: publicPath(`/api/tv/resolve/${encodeURIComponent(token)}`) }] };
  }
  const backupState = decodeTvStateReference(token, 'witv-backup');
  if (backupState) {
    const fallback = backupState.provider === 'LiveWatch' ? null : await wiTvNoctraFallbackOption(backupState.name).catch(() => null);
    const options = fallback ? [fallback] : await verifiedLiveWatchNamedFallbackOptions(backupState.name, 'Secours LiveWatch').catch(() => []);
    if (!options.length) throw new HttpError(502, 'Aucun secours vérifié pour cette chaîne WiTV.');
    return { options };
  }
  const state = decodeTvStateReference(token, 'witv-page');
  const stored = tvReferences.get(String(token || ''));
  const reference = state ? {
    url: safeTvRemoteUrl(state.url).toString(),
    headers: {
      referer: state.referer ? safeTvRemoteUrl(state.referer).toString() : '',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
    },
    meta: { channelName: String(state.name || '') }
  } : (stored && stored.expiresAt > Date.now() ? stored : null);
  if (!reference) throw new HttpError(410, 'Ce lecteur a expiré. Recharge la source TV.');
  const response = await fetchTvRemote(reference.url, {
    signal: AbortSignal.timeout(28_000),
    headers: {
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36',
      ...(reference.headers || {})
    }
  });
  if (!response.ok) throw new HttpError(response.status, `La page du lecteur est indisponible (${response.status}).`);
  const html = await response.text();
  if (html.length > 4 * 1024 * 1024) throw new HttpError(413, 'La page du lecteur est trop volumineuse.');
  const baseUrl = response.url || reference.url;
  const candidates = tvIframeCandidatesFromHtml(html, baseUrl);
  const internalCandidates = candidates.filter(item => isWiTvPublicPlayer(item.url));
  const players = internalCandidates.slice(0, 6);
  const controller = new AbortController();
  const nativeFailures = [];
  let active = null;
  try {
    // Le premier HLS vérifié suffit. Un lecteur mort ne retarde plus un autre
    // lecteur WiTV prêt ; les recherches FSTV/LiveWatch sont différées au besoin.
    active = await Promise.any(players.map(async (item, index) => {
      const option = await resolveWiTvPlayerOption(item, index, baseUrl, controller.signal);
      if (!option.streamUrl) {
        nativeFailures.push({ serverIndex: index, ...option.nativeFailure });
        throw new HttpError(502, 'HLS WiTV indisponible.');
      }
      return option;
    }));
  } catch {} finally { controller.abort(); }
  const choices = players.map((item, index) => {
    // La référence conserve l'URL exacte, pas une position dans une page qui
    // peut changer : renouveler le HLS ne sélectionne pas CABLE à sa place.
    const nativeToken = encodeTvStateReference('witv-native', { item, index, pageUrl: baseUrl });
    const resolveUrl = publicPath(`/api/tv/resolve/${encodeURIComponent(nativeToken)}`);
    return {
      label: `${item.label || `Serveur ${index + 1}`} · HLS`,
      playbackType: 'resolver', resolveUrl, serverIndex: index,
      ...(active?.serverIndex === index ? { ...active, label: `${active.label} · HLS`, resolveUrl, fallback: false } : {})
    };
  });
  const options = active
    ? [choices[active.serverIndex], ...choices.filter((_, index) => index !== active.serverIndex)]
    : [];
  // Les secours externes restent manuels. Si le HLS échoue, conserver le
  // lecteur officiel WiTV et son origine au lieu de changer de fournisseur.
  const backupToken = encodeTvStateReference('witv-backup', { name: reference.meta?.channelName || '' });
  const backup = {
    label: 'Secours Noctra · FSTV / LiveWatch',
    resolveUrl: publicPath(`/api/tv/resolve/${encodeURIComponent(backupToken)}`),
    playbackType: 'resolver', fallback: true, providerFallback: 'Noctra', manualOnly: true
  };
  const officialOptions = players.map((item, index) => ({
    label: `${item.label || `Serveur ${index + 1}`} · lecteur officiel WiTV`,
    url: item.url, playbackType: 'embed', host: item.host,
    compatPage: false, fallback: true, officialClient: true, serverIndex: index
  }));
  if (!active) options.push(...officialOptions, ...choices);
  else options.push(...officialOptions);
  options.push(backup);
  const liveWatchBackupToken = encodeTvStateReference('witv-backup', { name: reference.meta?.channelName || '', provider: 'LiveWatch' });
  options.push({
    label: 'Secours LiveWatch',
    resolveUrl: publicPath(`/api/tv/resolve/${encodeURIComponent(liveWatchBackupToken)}`),
    playbackType: 'resolver', fallback: true, providerFallback: 'LiveWatch', manualOnly: true
  });
  // Le PlayerJS officiel reste accessible en dernier recours manuel, après les
  // directs réellement vérifiés. Il ne peut plus bloquer la chaîne sur un écran
  // noir simplement parce que sa page HTML répondait 200.
  if (internalCandidates[0]) {
    const playerToken = encodeTvStateReference('witv-player', {
      url: safeTvRemoteUrl(internalCandidates[0].url).toString(),
      referer: safeTvRemoteUrl(baseUrl).toString()
    });
    options.push({
      label: 'WiTV officiel · secours manuel',
      url: tvPublicEmbedUrl(playerToken),
      playbackType: 'embed',
      compatPage: true,
      fallback: true,
      manualOnly: true,
      host: internalCandidates[0].host
    });
  }
  const embeds = options.filter(item => item.url);
  return { externalUrl: reference.url, resolvedFrom: baseUrl, options, embeds, fallbackAvailable: true,
    nativeFailures, nativeUnavailable: !active,
    warning: active ? '' : 'HLS WiTV indisponible depuis le serveur Noctra ; lecteur officiel WiTV conservé.' };
}

const wiTvCategories = [
  ['Sport', 'sport'],
  ['Cinéma', 'cinema'],
  ['Documentaire', 'documentaire'],
  ['Généraliste', 'generaliste'],
  ['Enfants', 'enfants'],
  ['Info', 'info'],
  ['Musique', 'musique'],
  ['Belgique', 'belgique'],
  ['Suisse', 'suisse']
];

async function tvCatalogFromWiTv(rootValue = 'https://witv.football/') {
  const root = safeTvRemoteUrl(rootValue).toString();
  const cacheKey = `witv::${root}`;
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const results = await Promise.allSettled(wiTvCategories.map(async ([group, slug]) => {
    const url = new URL(`/chaines-live/${slug}/`, root).toString();
    const response = await fetchTvRemote(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Noctra-Media-Client/76' }
    });
    if (!response.ok) throw new Error(`${group}: HTTP ${response.status}`);
    const html = await response.text();
    if (html.length > 4 * 1024 * 1024) throw new Error(`${group}: page trop volumineuse`);
    return parseWiTvCategoryHtml(html, response.url || url, group);
  }));
  const map = new Map();
  const errors = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') result.value.forEach(channel => map.set(channel.embedUrl || channel.id, channel));
    else errors.push(`${wiTvCategories[index][0]} indisponible`);
  });
  const channels = [...map.values()];
  const value = {
    name: 'WiTV',
    sourceType: 'witv',
    groups: [],
    channels,
    count: channels.length,
    warning: channels.length ? (errors.length ? `Catalogue partiel : ${errors.join(', ')}.` : '') : 'Le catalogue public WiTV est temporairement indisponible.'
  };
  tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, value });
  return value;
}

function stripTvHtml(value) {
  return decodeTvHtml(String(value || ''))
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ohaChannelName(body, href) {
  const alt = decodeTvHtml(String(body || '').match(/<img\b[^>]*\balt=["']([^"']+)["']/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const text = stripTvHtml(body);
  const candidate = (text && text.length <= 120 ? text : alt) || alt;
  if (candidate && !/^(?:home|movies|series|live\s*tv|search|login|sign\s*in|france|a\s*[–-]\s*z)$/i.test(candidate)) return candidate.slice(0, 100);
  try {
    const last = decodeURIComponent(new URL(href).pathname.split('/').filter(Boolean).pop() || '').replace(/[-_]+/g, ' ').trim();
    if (last && !/^live$/i.test(last)) return last.replace(/\b\w/g, char => char.toUpperCase()).slice(0, 100);
  } catch {}
  return '';
}

function ohaPublicChannelCandidates(htmlValue, baseUrl) {
  const html = String(htmlValue || '');
  const rootHost = new URL(baseUrl).hostname.toLowerCase();
  const candidates = [];
  const seen = new Set();
  const add = (rawUrl, nameValue, context = '', logoValue = '') => {
    if (!rawUrl || /^(?:javascript:|data:|about:|#)/i.test(rawUrl)) return;
    let url;
    try { url = resolveTvUrl(decodeTvHtml(rawUrl), baseUrl); } catch { return; }
    let parsed;
    try { parsed = new URL(url); } catch { return; }
    if (parsed.hostname.toLowerCase() !== rootHost) return;
    if (/\.(?:css|js|png|jpe?g|webp|svg|ico|woff2?)(?:\?|$)/i.test(parsed.pathname)) return;
    if (!/(?:\/live(?:\/|\?|$)|\/watch(?:\/|\?|$)|\/channel(?:s)?(?:\/|\?|$)|\/tv(?:\/|\?|$))/i.test(`${parsed.pathname}${parsed.search}`)) return;
    if (/^\/live\/?$/i.test(parsed.pathname) && !parsed.search) return;
    const name = String(nameValue || '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 2) return;
    const key = `${normalizedIdentifier(name)}::${parsed.pathname}${parsed.search}`;
    if (seen.has(key)) return;
    seen.add(key);
    const contextText = stripTvHtml(context);
    const france = /\b(?:france|français|francaise|french|fr)\b/i.test(contextText);
    let logo = '';
    if (logoValue) { try { logo = resolveTvUrl(decodeTvHtml(logoValue), baseUrl); } catch {} }
    candidates.push({ name, url, france, logo });
  };

  const anchorRe = /<a\b([^>]*)\bhref=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html)) && candidates.length < 1500) {
    const attrs = `${match[1]} ${match[3]}`;
    const body = match[4];
    const href = match[2];
    const name = ohaChannelName(body, href);
    const logo = String(body).match(/<img\b[^>]*\b(?:src|data-src)=["']([^"']+)["']/i)?.[1] || '';
    const context = html.slice(Math.max(0, (match.index || 0) - 450), Math.min(html.length, (match.index || 0) + match[0].length + 450));
    add(href, name, `${attrs} ${context}`, logo);
  }

  // Some SPA builds serialize public channel pages in JSON/script data instead of anchors.
  const jsonish = /["'](?:name|title)["']\s*:\s*["']([^"']{2,100})["'][\s\S]{0,420}?["'](?:href|url|link)["']\s*:\s*["']([^"']+)["']/gi;
  while ((match = jsonish.exec(html)) && candidates.length < 1800) {
    const context = html.slice(Math.max(0, (match.index || 0) - 220), Math.min(html.length, (match.index || 0) + match[0].length + 220));
    add(match[2], decodeTvHtml(match[1]), context, '');
  }
  return candidates;
}

function ohaSamePublicHost(urlValue, rootValue) {
  try {
    const url = new URL(urlValue, rootValue);
    const root = new URL(rootValue);
    const host = url.hostname.toLowerCase();
    const rootHost = root.hostname.toLowerCase();
    return host === rootHost || host.endsWith(`.${rootHost}`);
  } catch {
    return false;
  }
}

function ohaApiCandidateUrls(textValue, baseUrl) {
  const text = String(textValue || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
  const found = new Set();
  const add = raw => {
    const value = decodeTvHtml(String(raw || '').trim());
    if (!value || /\.(?:png|jpe?g|gif|webp|svg|css|woff2?|ttf)(?:\?|$)/i.test(value)) return;
    let url;
    try { url = new URL(value, baseUrl); } catch { return; }
    if (!ohaSamePublicHost(url, baseUrl)) return;
    if (!/(?:\/api\/|channels?|catalog|live|television|tv)/i.test(`${url.pathname}${url.search}`)) return;
    found.add(url.toString());
  };
  for (const expression of [
    /(?:fetch|axios\.(?:get|request))\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /["'`]((?:https?:\/\/[^"'`]+|\/[^"'`]*\b(?:api|live|channel|catalog|tv)[^"'`]*))["'`]/gi
  ]) {
    let match;
    while ((match = expression.exec(text)) && found.size < 40) add(match[1]);
  }
  return [...found];
}

function ohaCandidatesFromJson(payload, baseUrl) {
  const results = [];
  const seen = new Set();
  const walk = (value, inherited = {}) => {
    if (!value || results.length >= 1800) return;
    if (Array.isArray(value)) {
      value.forEach(item => walk(item, inherited));
      return;
    }
    if (typeof value !== 'object') return;
    const name = String(value.name || value.title || value.channel_name || value.channelName || value.label || '').trim();
    const country = String(value.country || value.region || value.locale || inherited.country || '').trim();
    const category = String(value.category || value.group || value.genre || inherited.category || '').trim();
    const rawUrl = value.href || value.page_url || value.pageUrl || value.link || value.url || value.path || value.slug || '';
    if (name && rawUrl) {
      let url = '';
      try { url = new URL(String(rawUrl), baseUrl).toString(); } catch {}
      if (url && ohaSamePublicHost(url, baseUrl) && /(?:live|watch|channel|tv)/i.test(new URL(url).pathname)) {
        const key = `${normalizedIdentifier(name)}|${url}`;
        if (!seen.has(key)) {
          seen.add(key);
          const context = normalizedIdentifier(`${country} ${category} ${value.language || ''}`);
          const france = /\b(?:france|francais|francophone|french|fr)\b/.test(context);
          let logo = '';
          const rawLogo = value.logo || value.image || value.icon || value.thumbnail || '';
          if (rawLogo) { try { logo = resolveTvUrl(rawLogo, baseUrl); } catch {} }
          results.push({ name, url, france, logo, country, category });
        }
      }
    }
    const nextInherited = { country: country || inherited.country || '', category: category || inherited.category || '' };
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, nextInherited);
  };
  walk(payload);
  return results;
}

async function ohaDiscoverPublicCatalog(htmlValue, baseUrl) {
  const html = String(htmlValue || '');
  const endpointSet = new Set(ohaApiCandidateUrls(html, baseUrl));
  const scriptUrls = [];
  let match;
  const scriptExpression = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  while ((match = scriptExpression.exec(html)) && scriptUrls.length < 6) {
    let url;
    try { url = new URL(decodeTvHtml(match[1]), baseUrl); } catch { continue; }
    if (!ohaSamePublicHost(url, baseUrl) || !/\.m?js(?:\?|$)/i.test(url.toString())) continue;
    scriptUrls.push(url.toString());
  }
  const scriptBodies = await Promise.allSettled(scriptUrls.map(async url => {
    const response = await fetchTvRemote(url, {
      signal: AbortSignal.timeout(6_000),
      headers: { accept: 'application/javascript,text/javascript,*/*;q=0.5', 'user-agent': 'Mozilla/5.0 Noctra/75' }
    });
    if (!response.ok) return '';
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 2_500_000) return '';
    const text = await response.text();
    return text.length <= 2_500_000 ? text : '';
  }));
  scriptBodies.forEach(result => {
    if (result.status !== 'fulfilled' || !result.value) return;
    ohaApiCandidateUrls(result.value, baseUrl).forEach(url => endpointSet.add(url));
  });

  const root = new URL(baseUrl);
  for (const path of ['/api/live', '/api/channels', '/api/live/channels', '/api/tv/channels', '/api/catalog/live']) {
    endpointSet.add(new URL(path, root.origin).toString());
  }
  const endpoints = [...endpointSet].slice(0, 14);
  const responses = await Promise.allSettled(endpoints.map(async endpoint => {
    const response = await fetchTvRemote(endpoint, {
      signal: AbortSignal.timeout(6_500),
      headers: {
        accept: 'application/json,text/json;q=0.9,*/*;q=0.5',
        'x-requested-with': 'XMLHttpRequest',
        referer: baseUrl,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
      }
    });
    if (!response.ok) return [];
    const contentType = String(response.headers.get('content-type') || '');
    const text = await response.text();
    if (text.length > 4_000_000 || looksLikeHtml(text, contentType)) return [];
    let payload;
    try { payload = JSON.parse(text); } catch { return []; }
    return ohaCandidatesFromJson(payload, response.url || endpoint);
  }));
  const merged = new Map();
  responses.forEach(result => {
    if (result.status !== 'fulfilled') return;
    result.value.forEach(item => merged.set(item.url, item));
  });
  return [...merged.values()];
}

const ohaPublicGroups = ['France', 'France Sport'];

function cleanOhaChannelName(value) {
  return String(value || 'Chaîne OHA')
    .replace(/\s*\|\s*[A-Z0-9]+\s*$/i, '')
    .replace(/\b(?:UHD|FHD|HD|SD|4K)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function publicTvPageName(bodyValue, attributesValue = '', fallback = '') {
  const body = String(bodyValue || '');
  const attributes = String(attributesValue || '');
  const attrName = decodeTvHtml(attributes.match(/\b(?:title|aria-label)=["']([^"']+)["']/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const imageName = decodeTvHtml(body.match(/<img\b[^>]*\b(?:alt|title)=["']([^"']+)["']/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const textName = stripTvHtml(body).replace(/^LIVE\s*/i, '').trim();
  const name = [textName, imageName, attrName, fallback].find(value => value && !/^(?:live|watch|player|stream)$/i.test(String(value).trim())) || fallback;
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

async function fetchPublicTvHtml(urlValue, label = 'Source TV', timeoutMs = 18_000, referer = '') {
  const url = safeTvRemoteUrl(urlValue).toString();
  const response = await fetchTvRemote(url, {
    signal: AbortSignal.timeout(Math.max(5_000, Number(timeoutMs) || 18_000)),
    headers: {
      ...(referer ? {referer} : {}),
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.7',
      'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1 Noctra/150'
    }
  });
  if (!response.ok) throw new HttpError(response.status, `${label} indisponible (${response.status}).`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 6 * 1024 * 1024) throw new HttpError(413, `${label} est trop volumineux.`);
  const html = await response.text();
  if (html.length > 6 * 1024 * 1024) throw new HttpError(413, `${label} est trop volumineux.`);
  return { html, finalUrl: response.url || url };
}


function validFstvPageReference(tokenValue) {
  const token = String(tokenValue || '');
  const reference = tvReferences.get(token);
  if (!reference || reference.expiresAt <= Date.now() || reference.meta?.kind !== 'fstv-page') return null;
  try {
    const url = safeTvRemoteUrl(reference.url);
    if (!/(?:^|\.)fstv\.rest$/i.test(url.hostname)) return null;
    return { ...reference, url: url.toString() };
  } catch {
    return null;
  }
}

const fstvBridgePages = new Map();
const fstvBridgeCookies = new Map();

function fstvAllowedHost(value) {
  try { return /^(?:www\.)?fstv\.rest$/i.test(new URL(value).hostname); }
  catch { return false; }
}

function fstvBridgeCookieValue(token) {
  return fstvBridgeCookies.get(String(token || ''))?.value || '';
}

function rememberFstvBridgeCookies(token, response) {
  const received = tvResponseCookieHeader(response);
  if (!received) return fstvBridgeCookieValue(token);
  const key = String(token || '');
  const value = mergeTvCookieHeaders(fstvBridgeCookieValue(key), received);
  fstvBridgeCookies.set(key, { value, updatedAt: Date.now() });
  if (fstvBridgeCookies.size > 800) {
    const oldest = [...fstvBridgeCookies.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt).slice(0, 200);
    oldest.forEach(([entry]) => fstvBridgeCookies.delete(entry));
  }
  return value;
}

function rememberFstvBridgePage(token, pageUrl) {
  try {
    const url = safeTvRemoteUrl(pageUrl);
    if (!fstvAllowedHost(url.toString())) return;
    fstvBridgePages.set(String(token || ''), { pageUrl: url.toString(), origin: url.origin, updatedAt: Date.now() });
    if (fstvBridgePages.size > 800) {
      const oldest = [...fstvBridgePages.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt).slice(0, 200);
      oldest.forEach(([entry]) => fstvBridgePages.delete(entry));
    }
  } catch {}
}

function sanitizeFstvBridgeHtml(htmlValue, pageUrl, token) {
  const page = new URL(pageUrl);
  let html = String(htmlValue || '');
  html = html.replace(/<meta\b[^>]*http-equiv=["']?(?:content-security-policy|x-frame-options)["']?[^>]*>/gi, '');
  const encodedToken = encodeURIComponent(String(token || ''));
  const siteRoot = publicPath(`/api/tv/fstv/site/${encodedToken}`);
  const sameSite = value => {
    try {
      const target = new URL(String(value || ''), page);
      if (!fstvAllowedHost(target.toString())) return String(value || '');
      return `${siteRoot}${target.pathname}${target.search}${target.hash}`;
    } catch { return String(value || ''); }
  };
  const stripIntegrity = tag => String(tag || '')
    .replace(/\s+integrity\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+crossorigin(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
  html = html.replace(/(<(?:script|iframe|img|video|source)\b[^>]*?\s\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_, before, value, after) => {
    const mapped = sameSite(value);
    return mapped !== value ? stripIntegrity(`${before}${mapped}${after}`) : `${before}${value}${after}`;
  });
  html = html.replace(/(<link\b[^>]*?\s\bhref\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_, before, value, after) => {
    const mapped = sameSite(value);
    return mapped !== value ? stripIntegrity(`${before}${mapped}${after}`) : `${before}${value}${after}`;
  });
  html = html.replace(/(<form\b[^>]*?\s\baction\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_, before, value, after) => `${before}${sameSite(value)}${after}`);
  html = html.replace(/(<a\b[^>]*?\s\bhref\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_, before, value, after) => `${before}${sameSite(value)}${after}`);

  const directory = page.pathname.replace(/[^/]*$/, '') || '/';
  const siteBase = `${siteRoot}${directory}`;
  const remoteSearch = page.search || '';
  const bridge = `<base href="${siteBase.replace(/"/g, '&quot;')}"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style id="noctra-fstv-style">html,body{min-width:100%;min-height:100%;margin:0;background:#000!important}.noctra-fstv-stage{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;z-index:2147483000!important;background:#000!important;display:block!important}.noctra-fstv-stage video,.noctra-fstv-stage iframe{width:100%!important;height:100%!important;object-fit:contain!important;border:0!important;background:#000!important}</style><script>(function(){const S=${JSON.stringify(siteRoot)},REMOTE=${JSON.stringify(page.toString())},REMOTE_ORIGIN=${JSON.stringify(page.origin)},REMOTE_SEARCH=${JSON.stringify(remoteSearch)},NativeURL=window.URL,NO=location.origin,F=window.fetch.bind(window),XO=XMLHttpRequest.prototype.open,SA=Element.prototype.setAttribute;function map(v){try{const raw=String(v||''),u=new NativeURL(raw,REMOTE);if(/^(?:www\\.)?fstv\\.rest$/i.test(u.hostname))return S+u.pathname+u.search+u.hash;if(u.origin===NO&&!u.pathname.includes('/api/tv/fstv/'))return S+u.pathname+u.search+u.hash;return raw}catch{return v}};try{if(REMOTE_SEARCH&&location.search!==REMOTE_SEARCH){const u=new NativeURL(location.href);u.search=REMOTE_SEARCH;history.replaceState(history.state,'',u.pathname+u.search)}}catch{};window.fetch=(input,init)=>{try{if(input instanceof Request){const next=map(input.url);return F(new Request(next,input),init)}return F(map(input),init)}catch{return F(input,init)}};XMLHttpRequest.prototype.open=function(method,url,...rest){return XO.call(this,method,map(url),...rest)};Element.prototype.setAttribute=function(name,value){const key=String(name||'').toLowerCase();if(['src','href','action'].includes(key))value=map(value);return SA.call(this,name,value)};function patch(proto,prop){try{const d=Object.getOwnPropertyDescriptor(proto,prop);if(!d||!d.set||!d.get)return;Object.defineProperty(proto,prop,{configurable:d.configurable,enumerable:d.enumerable,get:d.get,set(v){return d.set.call(this,map(v))}})}catch{}};[[HTMLScriptElement,'src'],[HTMLIFrameElement,'src'],[HTMLImageElement,'src'],[HTMLLinkElement,'href'],[HTMLFormElement,'action'],[HTMLVideoElement,'src'],[HTMLSourceElement,'src']].forEach(x=>patch(x[0].prototype,x[1]));function score(el){try{const r=el.getBoundingClientRect(),area=Math.max(0,r.width)*Math.max(0,r.height);if(area<12000)return-1;let s=area;if(el.matches('video'))s+=900000;if(el.matches('iframe'))s+=500000;if(/player|video|stream|live/i.test((el.id||'')+' '+(el.className||'')))s+=350000;const src=String(el.getAttribute?.('src')||'');if(/ad|doubleclick|analytics|social|facebook/i.test(src))s-=1000000;return s}catch{return-1}}function focus(){const list=[...document.querySelectorAll('video,iframe[src],[id*="player" i],[class*="player" i],[id*="video" i],[class*="video" i]')];let best=null,bestScore=-1;for(const el of list){const s=score(el);if(s>bestScore){best=el;bestScore=s}}if(!best||bestScore<0)return false;if(!best.classList.contains('noctra-fstv-stage')){document.querySelectorAll('.noctra-fstv-stage').forEach(x=>x.classList.remove('noctra-fstv-stage'));best.classList.add('noctra-fstv-stage');try{parent.postMessage({type:'noctra-fstv-state',state:'ready'},'*')}catch{}}return true}function scan(){document.querySelectorAll('[src],[href],[action]').forEach(el=>{for(const a of ['src','href','action']){const v=el.getAttribute?.(a);if(v){const m=map(v);if(m!==v)try{el.setAttribute(a,m)}catch{}}}});focus()}addEventListener('DOMContentLoaded',()=>{scan();setTimeout(scan,350);setTimeout(scan,1200)});new MutationObserver(()=>scan()).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src','href','action','class','id']});setInterval(focus,1500);})();</script>`;
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, match => `${match}${bridge}`);
  else html = `${bridge}${html}`;
  return html;
}

async function proxyFstvEmbed(tokenValue, res) {
  const reference = validFstvPageReference(tokenValue);
  if (!reference) throw new HttpError(410, 'Le lecteur FSTV a expiré. Recharge la chaîne.');
  rememberFstvBridgePage(tokenValue, reference.url);
  const target = new URL(reference.url);
  const location = `${publicPath(`/api/tv/fstv/site/${encodeURIComponent(String(tokenValue || ''))}`)}${target.pathname}${target.search}`;
  res.writeHead(302, { location, 'cache-control': 'no-store' });
  res.end();
}

async function proxyFstvSite(tokenValue, req, res, requestUrl, path) {
  const reference = validFstvPageReference(tokenValue);
  if (!reference) throw new HttpError(410, 'Le lecteur FSTV a expiré. Recharge la chaîne.');
  const remembered = fstvBridgePages.get(String(tokenValue || ''))?.pageUrl || reference.url;
  const origin = new URL(remembered).origin;
  const marker = `/api/tv/fstv/site/${encodeURIComponent(String(tokenValue || ''))}`;
  const suffix = path.startsWith(marker) ? path.slice(marker.length) : '';
  const upstreamUrl = new URL(`${suffix || '/'}${requestUrl.search || ''}`, `${origin}/`).toString();
  if (!fstvAllowedHost(upstreamUrl)) throw new HttpError(403, 'Le relais FSTV est limité au domaine officiel FSTV.');

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': req.headers['access-control-request-headers'] || 'content-type,accept,x-requested-with,range',
    'access-control-expose-headers': 'content-length,content-range,accept-ranges',
    'access-control-max-age': '600'
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders); res.end(); return;
  }
  const method = ['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(req.method) ? req.method : 'GET';
  const body = ['GET','HEAD'].includes(method) ? undefined : await readTvProxyBody(req);
  const headers = {
    accept: req.headers.accept || '*/*',
    'accept-language': req.headers['accept-language'] || 'fr-FR,fr;q=0.9,en;q=0.6',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1 Noctra/152',
    origin,
    referer: remembered,
    ...(fstvBridgeCookieValue(tokenValue) ? { cookie: fstvBridgeCookieValue(tokenValue) } : {})
  };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (req.headers['x-requested-with']) headers['x-requested-with'] = req.headers['x-requested-with'];
  if (req.headers.range) headers.range = req.headers.range;
  const likelyMedia = Boolean(req.headers.range) || tvLikelyMediaUrl(upstreamUrl);
  const response = likelyMedia
    ? await fetchTvRemoteUntilHeaders(upstreamUrl, { method, headers, ...(body ? { body } : {}) }, 20_000)
    : await fetchTvRemote(upstreamUrl, { method, headers, ...(body ? { body } : {}), signal: AbortSignal.timeout(24_000) });
  rememberFstvBridgeCookies(tokenValue, response);
  const type = response.headers.get('content-type') || 'application/octet-stream';
  const responseHeaders = { ...corsHeaders, 'content-type': type, 'cache-control': /(?:javascript|css|font|image)/i.test(type) ? 'private, max-age=300' : 'no-store' };
  for (const header of ['content-range','accept-ranges']) { const value=response.headers.get(header); if(value) responseHeaders[header]=value; }
  if (method === 'HEAD') { res.writeHead(response.status, responseHeaders); res.end(); return; }
  const finalUrl = response.url || upstreamUrl;
  if (/text\/html|application\/xhtml/i.test(type)) {
    const rawHtml = await response.text();
    if (rawHtml.length > 6 * 1024 * 1024) throw new HttpError(413, 'Le lecteur FSTV est trop volumineux.');
    if (fstvAllowedHost(finalUrl)) rememberFstvBridgePage(tokenValue, finalUrl);
    const prepared = sanitizeFstvBridgeHtml(rawHtml, finalUrl, tokenValue);
    const buffer = Buffer.from(prepared, 'utf8');
    responseHeaders['content-type'] = 'text/html; charset=utf-8';
    responseHeaders['content-length'] = String(buffer.length);
    responseHeaders['content-security-policy'] = "frame-ancestors 'self'";
    responseHeaders['referrer-policy'] = 'no-referrer';
    res.writeHead(response.status, responseHeaders); res.end(buffer); return;
  }
  if (/javascript|ecmascript|text\/css|application\/json|text\/plain/i.test(type)) {
    const buffer = Buffer.from(await response.text(), 'utf8');
    responseHeaders['content-length'] = String(buffer.length);
    res.writeHead(response.status, responseHeaders); res.end(buffer); return;
  }
  if (tvBridgeMediaResponseAllowed(finalUrl, type)) {
    responseHeaders['x-accel-buffering'] = 'no';
    try { res.socket?.setNoDelay?.(true); res.socket?.setKeepAlive?.(true, 15_000); } catch {}
    res.writeHead(response.status, responseHeaders); res.flushHeaders?.(); pipeRemoteResponseBody(response, res); return;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  responseHeaders['content-length'] = String(buffer.length);
  res.writeHead(response.status, responseHeaders); res.end(buffer);
}

function parseFstvChannels(htmlValue, baseUrl) {
  const html = String(htmlValue || '');
  const channels = [];
  const seen = new Set();
  const expression = /<a\b([^>]*?)\bhref=["']([^"']*(?:\?|&)newsid=(\d+)[^"']*)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = expression.exec(html)) && channels.length < 800) {
    const id = String(match[3] || '').trim();
    if (!id || seen.has(id)) continue;
    let pageUrl = '';
    try { pageUrl = resolveTvUrl(decodeTvHtml(match[2]), baseUrl); } catch { continue; }
    let fallback = '';
    const after = html.slice(expression.lastIndex, Math.min(html.length, expression.lastIndex + 260));
    const beforeNextAnchor = after.split(/<a\b/i, 1)[0];
    const nearby = stripTvHtml(beforeNextAnchor).replace(/^(?:live\s*)+/i, '').trim();
    if (nearby && nearby.length <= 140 && !/^(?:signaler un probleme|connexion|retour)$/i.test(nearby)) fallback = nearby;
    const name = publicTvPageName(match[5], `${match[1]} ${match[4]}`, fallback || `FSTV ${id}`);
    if (!name || /^(?:fstv\s+\d+|signaler un probleme)$/i.test(name)) continue;
    seen.add(id);
    const token = issueTvReference(pageUrl, { referer: 'https://fstv.rest/' }, { kind: 'fstv-page', provider: 'FSTV', channelName: name });
    channels.push({
      id: createHash('sha1').update(`${name}\n${pageUrl}`).digest('hex').slice(0, 16),
      name,
      group: 'FSTV',
      category: 'FSTV',
      provider: 'FSTV',
      description: 'FSTV · flux résolu au moment de la lecture',
      playbackType: 'resolver',
      resolverUrl: publicPath(`/api/tv/fstv/resolve/${token}`),
      externalUrl: pageUrl,
      compatPage: true,
      streamKind: 'FSTV · HLS dynamique'
    });
  }
  return channels;
}

function fstvLiveUrlFromChannelPage(htmlValue, baseUrl) {
  const html = String(htmlValue || '').replace(/&amp;/gi, '&');
  const match = html.match(/(?:src|href|content)=["'][^"']*(\/live\.php\?(?:id=[a-z0-9-]+|dl=\d+))[^"']*["']/i)
    || html.match(/(?:^|["'\s])(\/live\.php\?(?:id=[a-z0-9-]+|dl=\d+))(?:["'\s<]|$)/i)
    || html.match(/(?:^|["'\s])(live\.php\?(?:id=[a-z0-9-]+|dl=\d+))(?:["'\s<]|$)/i);
  if (!match) return '';
  try { return resolveTvUrl(match[1], baseUrl); } catch { return ''; }
}

async function enrichFstvDirectStreams(channelsValue) {
  const channels = Array.isArray(channelsValue) ? channelsValue : [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, channels.length) }, async () => {
    while (cursor < channels.length) {
      const index = cursor++;
      const channel = channels[index];
      const pageUrl = String(channel?.externalUrl || '').trim();
      if (!pageUrl) continue;
      try {
        const page = await fetchPublicTvHtml(pageUrl, 'FSTV', 8_000);
        const liveUrl = fstvLiveUrlFromChannelPage(page.html, page.finalUrl);
        if (!liveUrl) continue;
        const token = issueTvReference(liveUrl, {
          accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain;q=0.8,*/*;q=0.4',
          origin: 'https://fstv.rest',
          referer: page.finalUrl || pageUrl,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/155'
        }, { provider: 'FSTV', forceHls: true });
        channels[index] = {
          ...channel,
          playbackType: 'stream',
          streamUrl: tvPublicStreamUrl(token),
          streamKind: 'FSTV · HLS direct',
          compatPage: true,
          fallbackEmbedUrl: channel.embedUrl
        };
      } catch {}
    }
  });
  await Promise.allSettled(workers);
  return channels;
}

function fstvUnwrappedMediaReference(urlValue, inheritedHeaders = {}) {
  const original = safeTvRemoteUrl(urlValue);
  if (!/^(?:www\.)?fstv\.rest$/i.test(original.hostname) || original.pathname !== '/live.php' || !original.searchParams.has('seg')) {
    return { url: original.toString(), headers: inheritedHeaders };
  }
  const rawMedia = original.searchParams.get('seg') || '';
  // La playlist enfant .m3u8 fonctionne encore via live.php. Les segments
  // zst/pdf publics, eux, sont refusés par ce relais avec « host not allowed ».
  if (/\.m3u8?(?:$|[?#])/i.test(rawMedia)) return { url: original.toString(), headers: inheritedHeaders };
  const media = safeTvRemoteUrl(rawMedia);
  let referer = String(original.searchParams.get('r') || inheritedHeaders.referer || '').trim();
  try { referer = safeTvRemoteUrl(referer).toString(); } catch { referer = inheritedHeaders.referer || ''; }
  return {
    url: media.toString(),
    headers: {
      ...inheritedHeaders,
      ...(referer ? { referer, origin: new URL(referer).origin } : {})
    }
  };
}

async function validateFstvHlsPath(streamUrlValue, headers = {}, timeoutMs = 8_000) {
  let currentUrl = safeTvRemoteUrl(streamUrlValue).toString();
  for (let depth = 0; depth < 4; depth += 1) {
    const target = fstvUnwrappedMediaReference(currentUrl, headers);
    const response = await fetchTvRemote(target.url, {
      headers: target.headers,
      signal: AbortSignal.timeout(Math.max(4_000, Number(timeoutMs) || 8_000))
    });
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok) throw new HttpError(response.status, `Flux FSTV indisponible (${response.status}).`);
    const playlist = /(?:mpegurl|m3u8)/i.test(contentType) || /\.m3u8?(?:$|[?#/])/i.test(response.url || target.url);
    if (!playlist) {
      if (/text\/html|application\/xhtml/i.test(contentType)) throw new HttpError(415, 'FSTV a renvoyé une page à la place du média.');
      try { await response.body?.cancel?.(); } catch {}
      return true;
    }
    const text = await response.text();
    if (!/^\s*#EXTM3U/i.test(text)) throw new HttpError(502, 'FSTV a répondu sans playlist HLS exploitable.');
    const next = liveWatchFirstPlaylistUri(text, response.url || target.url);
    if (!next) throw new HttpError(502, 'La playlist FSTV ne contient aucun média testable.');
    currentUrl = next;
  }
  throw new HttpError(502, 'Le chemin FSTV n’atteint aucun segment vidéo exploitable.');
}

async function resolveFstvPageReference(tokenValue) {
  const reference = tvReferences.get(String(tokenValue || ''));
  if (!reference || reference.expiresAt <= Date.now() || reference.meta?.kind !== 'fstv-page') {
    throw new HttpError(410, 'Ce lecteur FSTV a expiré. Recharge la source.');
  }
  const page = await fetchPublicTvHtml(reference.url, 'FSTV', 15_000);
  const liveUrl = fstvLiveUrlFromChannelPage(page.html, page.finalUrl);
  if (!liveUrl) throw new HttpError(502, 'FSTV ne publie plus de flux pour cette chaîne.');
  const headers = {
    accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain;q=0.8,*/*;q=0.4',
    origin: new URL(page.finalUrl || reference.url).origin,
    referer: page.finalUrl || reference.url,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/200'
  };
  const options = [];
  try {
    await validateFstvHlsPath(liveUrl, headers, 10_000);
    const streamToken = issueTvReference(liveUrl, headers, { provider: 'FSTV', forceHls: true });
    options.push({
      label: 'FSTV · direct vérifié',
      playbackType: 'stream',
      streamUrl: tvPublicStreamUrl(streamToken),
      native: true,
      direct: true,
      verified: true
    });
  } catch {
    // Le catalogue FSTV peut rester visible alors que son relais de segments
    // refuse le CDN courant. Les variantes LiveWatch servent alors de secours
    // vérifié, sans renvoyer l'utilisateur vers une page 404 ou un écran noir.
  }
  const fallbacks = await verifiedLiveWatchNamedFallbackOptions(reference.meta?.channelName, 'Secours FSTV').catch(() => []);
  options.push(...fallbacks);
  if (!options.length) throw new HttpError(502, 'FSTV ne publie actuellement aucun chemin vidéo lisible pour cette chaîne.');
  return { ok: true, externalUrl: page.finalUrl || reference.url, options, embeds: [] };
}

async function tvCatalogFromFstv(rootValue = 'https://fstv.rest/') {
  const root = safeTvRemoteUrl(rootValue).toString();
  const cacheKey = `fstv::${root}`;
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pages = [
    new URL('/index.php?category=chaines-live&do=cat', root).toString(),
    root
  ];
  const results = await Promise.allSettled(pages.map(url => fetchPublicTvHtml(url, 'FSTV', 18_000)));
  const map = new Map();
  const errors = [];
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') { errors.push(index === 0 ? 'catalogue' : 'accueil'); return; }
    parseFstvChannels(result.value.html, result.value.finalUrl).forEach(channel => {
      const stableKey = String(channel.externalUrl || channel.id || '').trim().toLowerCase();
      if (stableKey) map.set(stableKey, channel);
    });
  });
  // Le flux FSTV est volontairement résolu au clic : le CDN et ses segments
  // tournent vite, et l'enrichissement au chargement figeait une URL sans
  // alternative avant même que l'utilisateur sélectionne la chaîne.
  const channels = [...map.values()];
  const value = {
    name: 'FSTV',
    sourceType: 'fstv',
    groups: [],
    channels,
    count: channels.length,
    warning: channels.length ? (errors.length ? `Catalogue partiel FSTV : ${errors.join(', ')} indisponible.` : '') : 'Aucune chaîne FSTV publique exploitable n’a été trouvée.'
  };
  tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, value });
  return value;
}

function parseDlStreamsSports(htmlValue, baseUrl, provider = 'DLStreams') {
  const html = String(htmlValue || '');
  const channels = [];
  const seen = new Set();
  const expression = /<a\b([^>]*?)\bhref=["']([^"']*watch\.php\?[^"']*\bid=(\d+)[^"']*)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = expression.exec(html)) && channels.length < 1200) {
    const id = String(match[3] || '').trim();
    if (!id || seen.has(id)) continue;
    const name = publicTvPageName(match[5], `${match[1]} ${match[4]}`, `${provider} ${id}`);
    if (!name || /^channel not listed$/i.test(name)) continue;
    let watchUrl = '';
    let embedUrl = '';
    try {
      watchUrl = resolveTvUrl(decodeTvHtml(match[2]), baseUrl);
      embedUrl = resolveTvUrl(`/stream/stream-${id}.php`, baseUrl);
    } catch { continue; }
    seen.add(id);
    const channel = normalizeTvChannel({
      name,
      embed_url: embedUrl,
      group: provider,
      provider,
      category: 'Sports',
      description: `${provider} · lecteur public intégré`,
      is_live: true
    }, baseUrl, provider);
    if (channel) channels.push({ ...channel, externalUrl: watchUrl, streamKind: `Lecteur ${provider} public` });
  }
  return channels;
}

async function tvCatalogFromDlStreams(rootValue = 'https://dlstreams.st/') {
  const root = safeTvRemoteUrl(rootValue).toString();
  const cacheKey = `dlstreams::${root}`;
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const { html, finalUrl } = await fetchPublicTvHtml(root, 'DLStreams', 20_000);
  const channels = parseDlStreamsSports(html, finalUrl);
  const value = {
    name: 'DLStreams', sourceType: 'dlstreams', groups: [], channels, count: channels.length,
    warning: channels.length ? '' : 'Le programme public DLStreams ne contient actuellement aucun lecteur exploitable.'
  };
  tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60_000, value });
  return value;
}

async function tvCatalogFromSportsPage(source) {
  const cacheKey = `sports-page-v81::${source.id}`;
  const cached = tvCatalogCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.value;
  const root = safeTvRemoteUrl(source.url).toString();
  let channels = [];
  let warning = '';
  try {
    const page = await fetchPublicTvHtml(root, source.name, 10_000);
    if (source.type === 'daddylive') channels = parseDlStreamsSports(page.html, page.finalUrl, 'DaddyLive');
    else {
      const seen = new Set();
      for (const match of page.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        let target;
        try { target = new URL(decodeTvHtml(match[1]), page.finalUrl); } catch { continue; }
        // Only published event links, never guessed player IDs or navigation links.
        if (target.origin !== new URL(page.finalUrl).origin || !/(?:\/regarder-[^/]+|\/(?:match|watch|event|live|stream|player)[^/]*(?:\.php|\/))/i.test(target.pathname)) continue;
        if (seen.has(target.href)) continue;
        const name = publicTvPageName(match[2], '', '');
        if (!name) continue;
        const channel = normalizeTvChannel({name, embed_url:target.href, provider:source.name, group:'Sports', description:'Lecteur du fournisseur'}, page.finalUrl, 'Sports');
        if (channel) {
          seen.add(target.href);
          const token = issueTvReference(target.href, {}, {kind:'brigitte-event'});
          channels.push({...channel, playbackType:'resolver', embedUrl:'', resolverUrl:publicPath('/api/tv/resolve/'+token), externalUrl:target.href, streamKind:'Serveurs du match'});
        }
        if (channels.length >= 500) break;
      }
    }
    if (!channels.length) warning = 'Le programme ne fournit pas de liens de lecture exploitables : ouvre le portail du fournisseur.';
  } catch {
    warning = 'Le programme ne répond pas depuis le serveur Noctra. Le portail reste accessible pour un essai dans ton navigateur.';
  }
  if (!channels.length) {
    const portal = normalizeTvChannel({name:source.name+' · Programme', embed_url:root, provider:source.name, group:'Programme', description:warning}, root, 'Programme');
    if (portal) channels.push({...portal, externalUrl:root, streamKind:'Portail web · lecture non vérifiée'});
  }
  const value = {name:source.name, sourceType:source.type, groups:[], channels, count:channels.length, warning};
  tvCatalogCache.set(cacheKey, {expiresAt:Date.now()+(warning ? 30_000 : 120_000),value});
  return value;
}

function streamSports99NameFromSlug(slugValue) {
  const raw = decodeURIComponent(String(slugValue || '')).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Événement StreamSports99';
  const match = raw.match(/^([a-z ]+?)\s+(\d{5,})$/i);
  if (match) return `${match[1].replace(/\b\w/g, char => char.toUpperCase()).trim()} · ${match[2]}`.slice(0, 140);
  return raw.replace(/\b\w/g, char => char.toUpperCase()).slice(0, 140);
}

function streamSports99ContextName(htmlValue, index, fallback = '') {
  const html = String(htmlValue || '');
  const slice = html.slice(Math.max(0, Number(index || 0) - 900), Math.min(html.length, Number(index || 0) + 900));
  const decoded = decodeTvHtml(slice.replace(/\\u002f/gi, '/').replace(/\\\//g, '/'));
  const pair = decoded.match(/(?:home(?:_name|Name)?|homeTeam)["']?\s*[:=]\s*["']([^"']{2,80})["'][\s\S]{0,500}?(?:away(?:_name|Name)?|awayTeam)["']?\s*[:=]\s*["']([^"']{2,80})["']/i);
  if (pair) return `${pair[1]} vs ${pair[2]}`.replace(/\s+/g, ' ').trim().slice(0, 140);
  const title = decoded.match(/(?:title|eventName|shortName|matchName)["']?\s*[:=]\s*["']([^"']{4,140})["']/i);
  if (title && !/streamsports99|live streams?|watch live/i.test(title[1])) return title[1].replace(/\\u0026/g, '&').replace(/\s+/g, ' ').trim().slice(0, 140);
  return fallback;
}

function streamSports99AllowedPlayerHost(urlValue) {
  try { return /(?:^|\.)(?:cdn-live\.tv|cdnlivetv\.(?:is|tv|ru))$/i.test(new URL(urlValue).hostname); }
  catch { return false; }
}

function streamSports99LiveTvReference(slugValue) {
  let slug = '';
  try { slug = decodeURIComponent(String(slugValue || '')).trim(); }
  catch { slug = String(slugValue || '').trim(); }
  const match = slug.match(/^(.+?)__([a-z]{2,4})$/i);
  if (!match) return null;
  const name = match[1].replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const code = match[2].toLowerCase();
  return name && code ? { name, code } : null;
}

function streamSports99ChannelPlayerUrl(nameValue, codeValue) {
  const name = String(nameValue || '').trim().slice(0, 120);
  const code = String(codeValue || '').trim().toLowerCase();
  if (!name || !/^[a-z0-9]{2,4}$/.test(code)) throw new HttpError(400, 'Chaîne StreamSports99 invalide.');
  const url = new URL('https://cdnlivetv.tv/api/v1/channels/player/');
  url.searchParams.set('name', name);
  url.searchParams.set('code', code);
  url.searchParams.set('user', 'cdnlivetv');
  url.searchParams.set('plan', 'free');
  return url.toString();
}

function streamSports99DecodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  if (!normalized) return '';
  try { return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64').toString('utf8'); }
  catch { return ''; }
}

function streamSports99ExtractHlsUrl(htmlValue) {
  const html = String(htmlValue || '');
  const direct = html.match(/https?:\\?\/\\?\/[^\s"'<>`]+?\.m3u8?(?:[^\s"'<>`]*)?/i)?.[0]
    ?.replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/');
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  const srcName = html.match(/source\s*:\s*\{\s*src\s*:\s*([A-Za-z0-9_]+)/)?.[1];
  if (!srcName) return '';
  const assignment = html.match(new RegExp(`(?:var|let|const)\\s+${srcName}\\s*=([^;]+);`))?.[1] || '';
  if (!assignment) return '';
  const values = new Map();
  for (const match of html.matchAll(/(?:var|let|const)\s+([A-Za-z0-9_]+)\s*=\s*(["'])([^"']*)\2;/g)) {
    values.set(match[1], match[3]);
  }
  let output = '';
  for (const match of assignment.matchAll(/\(([A-Za-z0-9_]+)\)/g)) {
    output += streamSports99DecodeBase64Url(values.get(match[1]) || '');
  }
  if (!/^https?:\/\//i.test(output) || !/\.m3u8(?:$|[?#])/i.test(output)) return '';
  return output;
}

async function streamSports99ResolvedHls(playerUrlValue, signal = null) {
  const playerUrl = safeTvRemoteUrl(playerUrlValue).toString();
  if (!streamSports99AllowedPlayerHost(playerUrl)) throw new HttpError(403, 'Lecteur StreamSports99 non autorisé.');
  const response = await fetchTvRemote(playerUrl, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(14_000)]) : AbortSignal.timeout(14_000),
    headers: {
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/163',
      referer: 'https://streamsports99.su/'
    }
  });
  if (!response.ok) throw new HttpError(response.status, `Lecteur StreamSports99 indisponible (${response.status}).`);
  const html = await response.text();
  if (html.length > 2 * 1024 * 1024) throw new HttpError(413, 'Lecteur StreamSports99 trop volumineux.');
  const hlsUrl = streamSports99ExtractHlsUrl(html);
  if (!hlsUrl) throw new HttpError(422, 'StreamSports99 n’a pas publié de playlist HLS exploitable pour ce lecteur.');
  return { hlsUrl, playerUrl: response.url || playerUrl, cookie: tvResponseCookieHeader(response) };
}

async function proxyStreamSports99ResolvedStream(tokenValue, req, res) {
  const reference = tvReferences.get(String(tokenValue || ''));
  if (!reference || reference.expiresAt <= Date.now()) throw new HttpError(410, 'Le lecteur StreamSports99 a expiré. Recharge la chaîne.');
  const { hlsUrl, playerUrl } = await streamSports99ResolvedHls(reference.url);
  const streamToken = issueTvReference(hlsUrl, {
    accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain;q=0.8,*/*;q=0.4',
    referer: playerUrl,
    'user-agent': reference.headers?.['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/163'
  }, { provider: 'StreamSports99', forceHls: true });
  await proxyTvStream(streamToken, req, res);
}

function parseStreamSports99Sports(htmlValue, baseUrl, fallbackGroup = 'StreamSports99') {
  const original = String(htmlValue || '');
  const html = original.replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
  const channels = [];
  const seen = new Set();
  const add = (pageUrlValue, slugValue, bodyValue = '', attributesValue = '', position = 0) => {
    let pageUrl = '';
    try { pageUrl = resolveTvUrl(decodeTvHtml(pageUrlValue), baseUrl); } catch { return; }
    if (seen.has(pageUrl)) return;
    seen.add(pageUrl);
    const slug = String(slugValue || '');
    const decoded = decodeURIComponent(slug).replace(/__([a-z]{2})$/i, ' $1').replace(/[-_]+/g, ' ');
    const fallbackName = streamSports99NameFromSlug(decoded);
    const anchorName = publicTvPageName(bodyValue, attributesValue, '');
    const contextual = streamSports99ContextName(html, position, '');
    const name = anchorName || contextual || fallbackName;
    const liveTvReference = /\/live-tv\//i.test(new URL(pageUrl).pathname)
      ? streamSports99LiveTvReference(slug)
      : null;
    const channel = normalizeTvChannel({
      name: liveTvReference?.name || name,
      embed_url: pageUrl,
      group: fallbackGroup || 'Sports',
      provider: 'StreamSports99',
      category: fallbackGroup || 'Sports',
      description: 'StreamSports99 · lecteur public officiel',
      is_live: true
    }, baseUrl, fallbackGroup);
    if (channel && liveTvReference) {
      const resolverToken = encodeTvStateReference('streamsports99-channel', liveTvReference);
      channels.push({
        ...channel,
        playbackType: 'resolver',
        resolverUrl: publicPath(`/api/tv/streamsports99/channel/${resolverToken}`),
        embedUrl: '',
        externalUrl: pageUrl,
        compatPage: true,
        streamKind: 'StreamSports99 · chaîne HLS directe',
        sourceLabel: liveTvReference.code.toUpperCase()
      });
    } else if (channel) {
      channels.push({ ...channel, externalUrl: pageUrl, streamKind: 'Lecteur StreamSports99 public' });
    }
  };

  const anchorExpressions = [
    /<a\b([^>]*?)\bhref=["']([^"']*\/player\/([^"'?#]+)[^"']*)["']([^>]*)>([\s\S]*?)<\/a>/gi,
    /<a\b([^>]*?)\bhref=["']([^"']*\/live-tv\/([^"'?#]+)[^"']*)["']([^>]*)>([\s\S]*?)<\/a>/gi
  ];
  for (const expression of anchorExpressions) {
    let match;
    while ((match = expression.exec(html)) && channels.length < 1400) add(match[2], match[3], match[5], `${match[1]} ${match[4]}`, match.index);
  }

  // Les versions récentes de StreamSports99 hydratent parfois leurs cartes via
  // JSON/JS : les URLs /player/... existent alors dans le HTML sans balise <a>.
  const generic = /(?:https?:\/\/[^"'\\\s<>]+)?(\/player\/([a-z0-9_%.-]+))/gi;
  let match;
  while ((match = generic.exec(html)) && channels.length < 1400) add(match[1], match[2], '', '', match.index);
  return channels;
}

async function enrichStreamSports99GenericNames(channelsValue) {
  const channels = Array.isArray(channelsValue) ? channelsValue : [];
  const generic = channels.filter(channel => /^(?:Soccer|Football|Basketball|Baseball|Hockey|Mma|Fight|Motorsport|Tennis|Cricket|Rugby|Volleyball|Golf|Boxing|Wrestling)\s*·\s*\d+$/i.test(String(channel.name || ''))).slice(0, 24);
  await Promise.allSettled(generic.map(async channel => {
    const page = await fetchPublicTvHtml(channel.externalUrl || channel.embedUrl, 'StreamSports99', 9_000);
    const title = decodeTvHtml(page.html.match(/<title\b[^>]*>\s*(?:Watch\s+)?([\s\S]{2,180}?)(?:\s+Live(?:\s*\||\s*<)|\s*\|\s*StreamSports99|<\/title>)/i)?.[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (title && !/streamsports99/i.test(title)) channel.name = title.slice(0, 140);
  }));
  return channels;
}

function streamSports99CdnEventChannels(payloadValue) {
  const payload = payloadValue && typeof payloadValue === 'object' ? payloadValue : {};
  const sports = ['cdnlivetv.tv', 'cdnlivetv.is', 'cdnlivetv.ru', 'cdn-live-tv']
    .map(key => payload[key])
    .find(value => value && typeof value === 'object') || payload;
  const channels = [];
  const seen = new Set();
  for (const [sportName, eventsValue] of Object.entries(sports || {})) {
    if (!Array.isArray(eventsValue)) continue;
    for (const event of eventsValue) {
      if (!event || typeof event !== 'object') continue;
      const status = String(event.status || '').toLowerCase();
      if (status === 'finished') continue;
      const home = String(event.homeTeam || event.home || '').trim();
      const away = String(event.awayTeam || event.away || '').trim();
      const eventName = [home, away].filter(Boolean).join(' vs ') || String(event.event || event.title || event.name || `Événement ${sportName}`).trim();
      const feeds = Array.isArray(event.channels) ? event.channels : [];
      const validFeeds = [];
      for (let index = 0; index < feeds.length; index += 1) {
        const feed = feeds[index] || {};
        const rawUrl = String(feed.url || feed.embed_url || '').trim();
        if (!rawUrl) continue;
        let playerUrl = '';
        try {
          const parsed = safeTvRemoteUrl(rawUrl);
          if (!streamSports99AllowedPlayerHost(parsed.toString())) continue;
          playerUrl = parsed.toString();
        } catch { continue; }
        const channelName = String(feed.channel_name || feed.name || '').trim();
        if (!validFeeds.some(item => item.url === playerUrl)) validFeeds.push({
          url: playerUrl,
          label: channelName || `Serveur ${index + 1}`
        });
      }
      if (!validFeeds.length) continue;
      const unique = String(event.gameID || `${sportName}\n${eventName}\n${event.start || ''}`);
      if (seen.has(unique)) continue;
      seen.add(unique);
      const resolverToken = encodeTvStateReference('streamsports99-event', { feeds: validFeeds });
      const descriptionParts = [event.tournament, event.country, event.time].map(value => String(value || '').trim()).filter(Boolean);
      let logo = '';
      let secondaryLogo = '';
      try { if (event.homeTeamIMG || event.eventIMG || validFeeds[0]?.image) logo = resolveTvUrl(event.homeTeamIMG || event.eventIMG || validFeeds[0].image, 'https://cdn-live.tv/'); } catch {}
      try { if (event.awayTeamIMG) secondaryLogo = resolveTvUrl(event.awayTeamIMG, 'https://cdn-live.tv/'); } catch {}
      channels.push({
        id: createHash('sha1').update(`streamsports99\n${unique}`).digest('hex').slice(0, 16),
        name: eventName,
        group: sportName || event.tournament || 'Sports',
        category: sportName || 'Sports',
        provider: 'StreamSports99',
        description: descriptionParts.join(' · '),
        logo,
        secondaryLogo,
        status,
        isLive: status === 'live',
        startTime: event.start || null,
        eventId: String(event.gameID || ''),
        playbackType: 'resolver',
        resolverUrl: publicPath(`/api/tv/streamsports99/resolve/${resolverToken}`),
        externalUrl: validFeeds[0].url,
        compatPage: true,
        streamKind: 'StreamSports99 · HLS multi-serveurs',
        sourceLabel: `${validFeeds.length} serveur${validFeeds.length > 1 ? 's' : ''}`,
        serverCount: validFeeds.length
      });
    }
  }
  return channels;
}

async function streamSports99VerifiedOption(playerUrlValue, labelValue, index = 0, signal = null) {
  const { hlsUrl, playerUrl, cookie } = await streamSports99ResolvedHls(playerUrlValue, signal);
  const headers = {
    accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain;q=0.8,*/*;q=0.4',
    origin: new URL(playerUrl).origin,
    referer: playerUrl,
    ...(cookie && new URL(hlsUrl).hostname === new URL(playerUrl).hostname ? { cookie } : {}),
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/201'
  };
  const validated = await validateWiTvHlsStream(hlsUrl, headers, 18_000, signal);
  const token = issueTvReference(validated.url, { ...headers, ...(validated.cookie ? { cookie: validated.cookie } : {}) }, {
    kind: 'streamsports99-hls', provider: 'StreamSports99', forceHls: true
  });
  return {
    index,
    label: String(labelValue || `Serveur ${index + 1}`).slice(0, 100),
    streamUrl: tvPublicStreamUrl(token),
    playbackType: 'stream',
    serverIndex: index,
    native: true,
    verified: true,
    direct: true
  };
}

async function resolveStreamSports99EventReference(tokenValue, preferredIndex = null) {
  const state = decodeTvStateReference(tokenValue, 'streamsports99-event');
  const feeds = Array.isArray(state?.feeds) ? state.feeds.slice(0, 16) : [];
  if (!feeds.length) throw new HttpError(410, 'Cet événement StreamSports99 a expiré. Recharge la source TV.');
  if (preferredIndex !== null && (!Number.isInteger(preferredIndex) || !feeds[preferredIndex])) throw new HttpError(400, 'Serveur StreamSports99 invalide.');
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 30_000);
  let first;
  try {
    first = preferredIndex !== null
      ? await streamSports99VerifiedOption(feeds[preferredIndex].url, feeds[preferredIndex].label, preferredIndex, controller.signal)
      : await Promise.any(feeds.slice(0, 6).map((feed, index) => streamSports99VerifiedOption(feed?.url, feed?.label, index, controller.signal)));
  } catch {
    throw new HttpError(502, 'Aucun serveur StreamSports99 n’a atteint un segment vidéo. Réessaie lorsqu’un diffuseur est disponible.');
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
  const choices = feeds.map((feed, index) => ({
    index, serverIndex: index, label: feed.label || `Serveur ${index + 1}`,
    resolveUrl: `${publicPath(`/api/tv/streamsports99/resolve/${encodeURIComponent(tokenValue)}`)}?server=${index}`,
    playbackType: 'resolver'
  }));
  // Le premier média vérifié est rendu immédiatement. Les autres serveurs
  // restent disponibles à la demande, avec des URLs fraîchement résolues.
  const options = [{ ...choices[first.serverIndex], ...first }, ...choices.filter(choice => choice.index !== first.serverIndex)];
  return { options, activeServer: first.serverIndex, externalUrl: feeds[first.serverIndex]?.url || '' };
}

async function resolveStreamSports99ChannelReference(tokenValue) {
  const state = decodeTvStateReference(tokenValue, 'streamsports99-channel');
  const name = String(state?.name || '').trim().slice(0, 120);
  const code = String(state?.code || '').trim().toLowerCase();
  if (!name || !/^[a-z0-9]{2,4}$/.test(code)) {
    throw new HttpError(410, 'Cette chaîne StreamSports99 a expiré. Recharge la source TV.');
  }
  const playerUrl = streamSports99ChannelPlayerUrl(name, code);
  const option = await streamSports99VerifiedOption(playerUrl, 'Direct TV vérifié', 0);
  return {
    ok: true,
    activeServer: 0,
    externalUrl: playerUrl,
    options: [option]
  };
}

function streamSports99CountryName(codeValue) {
  const code = String(codeValue || '').trim().toUpperCase();
  if (!code) return 'International';
  try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) || code; }
  catch { return code; }
}

function streamSports99CdnTvChannels(payloadValue) {
  const payload = payloadValue && typeof payloadValue === 'object' ? payloadValue : {};
  const entries = Array.isArray(payload.channels) ? payload.channels : [];
  const seen = new Set();
  return entries.flatMap(entry => {
    const name = String(entry?.name || '').trim().slice(0, 120);
    const code = String(entry?.code || '').trim().toLowerCase();
    const status = String(entry?.status || '').trim().toLowerCase();
    if (!name || !/^[a-z0-9]{2,4}$/.test(code) || status === 'offline') return [];
    const key = `${name.toLowerCase()}\n${code}`;
    if (seen.has(key)) return [];
    seen.add(key);
    let playerUrl = '';
    try {
      playerUrl = entry?.url && streamSports99AllowedPlayerHost(entry.url)
        ? safeTvRemoteUrl(entry.url).toString()
        : streamSports99ChannelPlayerUrl(name, code);
    } catch { return []; }
    const country = streamSports99CountryName(code);
    const resolverToken = encodeTvStateReference('streamsports99-channel', { name, code });
    return [{
      id: createHash('sha1').update(`streamsports99-tv\n${key}`).digest('hex').slice(0, 16),
      name,
      group: `Live TV · ${country}`,
      category: 'Live TV',
      country,
      provider: 'StreamSports99',
      description: `StreamSports99 · ${country} · chaîne TV en direct`,
      logo: String(entry?.image || ''),
      status: status || 'online',
      isLive: status !== 'offline',
      playbackType: 'resolver',
      resolverUrl: publicPath(`/api/tv/streamsports99/channel/${resolverToken}`),
      externalUrl: playerUrl,
      streamKind: 'StreamSports99 · Live TV HLS vérifié au clic',
      sourceLabel: code.toUpperCase()
    }];
  });
}

async function streamSports99LiveTvApiCatalog() {
  const endpoints = [
    'https://api.cdnlivetv.tv/api/v1/channels/?user=cdnlivetv&plan=free',
    'https://cdnlivetv.tv/api/v1/channels/?user=cdnlivetv&plan=free'
  ];
  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetchTvRemote(endpoint, {
        signal: AbortSignal.timeout(24_000),
        headers: {
          accept: 'application/json,text/plain;q=0.9,*/*;q=0.4',
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/201',
          referer: 'https://streamsports99.su/live-tv'
        }
      });
      if (!response.ok) throw new HttpError(response.status, `API Live TV indisponible (${response.status}).`);
      const text = await response.text();
      if (text.length > 3 * 1024 * 1024) throw new HttpError(413, 'Catalogue Live TV trop volumineux.');
      const channels = streamSports99CdnTvChannels(JSON.parse(text));
      if (channels.length) return channels;
      errors.push(`${new URL(endpoint).hostname}: catalogue vide`);
    } catch (error) {
      errors.push(`${new URL(endpoint).hostname}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new HttpError(502, `API Live TV indisponible (${errors.join(' ; ')}).`);
}

async function streamSports99PublicApiCatalog() {
  const endpoints = [
    'https://api.cdnlivetv.tv/api/v1/events/sports/?user=cdnlivetv&plan=free',
    'https://cdnlivetv.tv/api/v1/events/sports/?user=cdnlivetv&plan=free',
    'https://api.cdnlivetv.is/api/v1/events/sports/?user=cdnlivetv&plan=free',
    'https://cdnlivetv.is/api/v1/events/sports/?user=cdnlivetv&plan=free',
    'https://api.cdn-live.tv/api/v1/events/sports/?user=cdnlivetv&plan=free'
  ];
  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetchTvRemote(endpoint, {
        signal: AbortSignal.timeout(18_000),
        headers: {
          accept: 'application/json,text/plain;q=0.9,*/*;q=0.4',
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/155',
          referer: 'https://streamsports99.su/'
        }
      });
      if (!response.ok) throw new HttpError(response.status, `API Sports publique indisponible (${response.status}).`);
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 4 * 1024 * 1024) throw new HttpError(413, 'Catalogue Sports public trop volumineux.');
      const text = await response.text();
      if (text.length > 4 * 1024 * 1024) throw new HttpError(413, 'Catalogue Sports public trop volumineux.');
      let payload;
      try { payload = JSON.parse(text); } catch { throw new HttpError(502, 'Catalogue Sports public invalide.'); }
      const channels = streamSports99CdnEventChannels(payload);
      if (channels.length) return channels;
      errors.push(`${new URL(endpoint).hostname}: catalogue vide`);
    } catch (error) {
      errors.push(`${new URL(endpoint).hostname}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new HttpError(502, `API Sports publique indisponible (${errors.join(' ; ')}).`);
}

async function tvCatalogFromStreamSports99LiveTv(rootValue = 'https://streamsports99.su/live-tv') {
  const requestedRoot = safeTvRemoteUrl(rootValue).toString();
  const cacheKey = `streamsports99-live-tv::${requestedRoot}`;
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const map = new Map();
  const errors = [];
  try {
    const apiChannels = await streamSports99LiveTvApiCatalog();
    apiChannels.forEach(channel => map.set(channel.id, channel));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  // L'API CDN est la source principale (elle contient le catalogue complet et
  // les codes pays). Le HTML /live-tv reste un repli si le CDN change d'hôte.
  if (!map.size) {
    const roots = [...new Set([
      requestedRoot,
      'https://streamsports99.su/live-tv',
      'https://streamsports99.website/live-tv',
      'https://streamsports99.is/live-tv',
      'https://streamsports99.tv/live-tv'
    ])];
    const results = await Promise.allSettled(roots.map(async target => {
      const page = await fetchPublicTvHtml(target, 'StreamSports99 Live TV', 14_000);
      return parseStreamSports99Sports(page.html, page.finalUrl, 'Live TV');
    }));
    results.forEach(result => {
      if (result.status === 'fulfilled') result.value.forEach(channel => map.set(channel.id, channel));
    });
  }

  const channels = [...map.values()].sort((left, right) =>
    String(left.country || left.group || '').localeCompare(String(right.country || right.group || ''), 'fr', { sensitivity: 'base' })
    || String(left.name || '').localeCompare(String(right.name || ''), 'fr', { numeric: true, sensitivity: 'base' })
  );
  const value = {
    name: 'StreamSports99 TV',
    sourceType: 'streamsports99',
    groups: [],
    channels,
    count: channels.length,
    warning: channels.length
      ? (errors.length ? 'Catalogue Live TV chargé depuis le portail de secours.' : '')
      : 'Aucune chaîne Live TV StreamSports99 n’est disponible pour le moment.'
  };
  tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 3 * 60_000, value });
  return value;
}

async function tvCatalogFromStreamSports99(rootValue = 'https://streamsports99.su/') {
  const requestedRoot = safeTvRemoteUrl(rootValue).toString();
  const cacheKey = `streamsports99::${requestedRoot}`;
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const map = new Map();
  const errors = [];

  // Le client StreamSports99 actuel charge ses événements depuis l'API publique
  // CDN Live TV. Cette API documente directement les événements et les URLs de
  // player iframe : elle est donc plus fiable que le HTML hydraté du portail.
  try {
    const apiChannels = await streamSports99PublicApiCatalog();
    apiChannels.forEach(channel => map.set(channel.id, channel));
  } catch (error) {
    errors.push(`API événements: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Le scraping des pages publiques reste un complément : il permet de récupérer
  // des sports/pages /player que l'API agrégée ne publie pas encore.
  const roots = [...new Set([
    requestedRoot,
    'https://streamsports99.website/',
    'https://streamsports99.is/',
    'https://streamsports99.tv/',
    'https://streamsports99.ch/'
  ])];
  const pages = [
    ['', 'Sports'], ['soccer', 'Soccer'], ['football', 'Football'], ['basketball', 'Basketball'],
    ['baseball', 'Baseball'], ['hockey', 'Hockey'], ['mma', 'MMA'], ['fight', 'Fight'],
    ['motorsport', 'Motorsport'], ['tennis', 'Tennis'], ['boxing', 'Boxing'], ['cricket', 'Cricket'],
    ['rugby', 'Rugby'], ['volleyball', 'Volleyball'], ['golf', 'Golf']
  ];
  const jobs = [];
  for (const root of roots.slice(0, 2)) {
    for (const [path, group] of pages) jobs.push((async () => {
      const target = path ? new URL(`/${path}`, root).toString() : root;
      const page = await fetchPublicTvHtml(target, 'StreamSports99', 12_000);
      return parseStreamSports99Sports(page.html, page.finalUrl, group);
    })());
  }
  let results = await Promise.allSettled(jobs);
  results.forEach(result => { if (result.status === 'fulfilled') result.value.forEach(channel => map.set(channel.id, channel)); });

  if (!map.size) {
    const secondaryJobs = [];
    for (const root of roots.slice(2)) {
      for (const [path, group] of pages) secondaryJobs.push((async () => {
        const target = path ? new URL(`/${path}`, root).toString() : root;
        const page = await fetchPublicTvHtml(target, 'StreamSports99', 10_000);
        return parseStreamSports99Sports(page.html, page.finalUrl, group);
      })());
    }
    const secondary = await Promise.allSettled(secondaryJobs);
    results = results.concat(secondary);
    secondary.forEach(result => { if (result.status === 'fulfilled') result.value.forEach(channel => map.set(channel.id, channel)); });
  }

  const channels = await enrichStreamSports99GenericNames([...map.values()]);
  channels.sort((left, right) => {
    return String(left.group || '').localeCompare(String(right.group || ''), 'fr', { sensitivity: 'base' })
      || String(left.name || '').localeCompare(String(right.name || ''), 'fr', { numeric: true, sensitivity: 'base' });
  });
  const failedCount = results.filter(result => result.status === 'rejected').length;
  const warningParts = [];
  if (errors.length) warningParts.push('API publique temporairement indisponible, pages StreamSports99 utilisées en secours.');
  if (failedCount && channels.length) warningParts.push(`${failedCount} rubrique(s)/miroir(s) n’ont pas répondu.`);
  const value = {
    name: 'StreamSports99', sourceType: 'streamsports99', groups: [], channels, count: channels.length,
    warning: channels.length ? warningParts.join(' ') : 'Aucune diffusion StreamSports99 n’est actuellement publiée par l’API publique ou les miroirs testés.'
  };
  tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 60_000, value });
  return value;
}

function streamedMatchChannel(item, baseUrl, fallbackGroup = 'Sports') {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || item.slug || '').trim();
  if (!id) return null;
  const group = String(item.category || item.sport || fallbackGroup || 'Sports').replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).trim();
  const teams = item.teams && typeof item.teams === 'object' ? item.teams : {};
  const home = String(teams.home?.name || item.home || item.homeTeam || '').trim();
  const away = String(teams.away?.name || item.away || item.awayTeam || '').trim();
  const title = String(item.title || [home, away].filter(Boolean).join(' vs ') || id).replace(/\s+/g, ' ').trim();
  const sourceCount = Array.isArray(item.sources) ? item.sources.length : 0;
  const startTime = Number(item.date || item.start || 0) || null;
  return normalizeTvChannel({
    name: title,
    embed_url: new URL(`/watch/${encodeURIComponent(id)}`, baseUrl).toString(),
    group,
    category: group,
    provider: 'Streamed',
    description: [
      startTime ? new Date(startTime).toISOString() : '',
      sourceCount ? `${sourceCount} lecteur(s) public(s)` : ''
    ].filter(Boolean).join(' · '),
    logo: item.poster || teams.home?.badge || '',
    secondaryLogo: teams.away?.badge || '',
    is_live: Boolean(item.live || item.popular)
  }, baseUrl, group);
}

async function fetchStreamedJson(urlValue, root, allowMirror = true) {
  try {
  const response = await fetchTvRemote(urlValue, {
    signal: AbortSignal.timeout(allowMirror ? 6_000 : 8_000),
    headers: {
      accept: 'application/json,text/plain;q=0.9,*/*;q=0.4',
      'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/155',
      referer: root
    }
  });
  if (!response.ok) throw new HttpError(response.status, `API Streamed indisponible (${response.status}).`);
  const text = await response.text();
  if (text.length > 4 * 1024 * 1024) throw new HttpError(413, 'Catalogue Streamed trop volumineux.');
  try { return JSON.parse(text); } catch { throw new HttpError(502, 'Catalogue Streamed invalide.'); }
  } catch (error) {
    const target = new URL(urlValue);
    if (!allowMirror || !['streamed.pk','streamed.st'].includes(target.hostname)) throw error;
    target.hostname = target.hostname === 'streamed.pk' ? 'streamed.st' : 'streamed.pk';
    return fetchStreamedJson(target.href, target.origin+'/', false);
  }

}

async function streamedPlayerChannels(item, root, fallbackGroup = 'Sports') {
  const baseChannel = streamedMatchChannel(item, root, fallbackGroup);
  if (!baseChannel) return [];
  const sources = Array.isArray(item?.sources) ? item.sources : [];
  const channels = [];
  const seen = new Set();
  for (const source of sources.slice(0, 8)) {
    const sourceName = String(source?.source || '').trim();
    const sourceId = String(source?.id || '').trim();
    if (!sourceName || !sourceId) continue;
    const endpoint = new URL(`/api/stream/${encodeURIComponent(sourceName)}/${encodeURIComponent(sourceId)}`, root).toString();
    try {
      const payload = await fetchStreamedJson(endpoint, `${root.replace(/\/+$/, '')}/watch/${encodeURIComponent(String(item.id || ''))}`);
      if (!Array.isArray(payload)) continue;
      for (const player of payload.slice(0, 12)) {
        const embedUrl = String(player?.embedUrl || player?.embed_url || '').trim();
        if (!embedUrl || seen.has(embedUrl)) continue;
        seen.add(embedUrl);
        const language = String(player?.language || '').replace(/\s+/g, ' ').trim();
        const streamNo = Number(player?.streamNo || 0) || '';
        const label = [language, streamNo ? `lecteur ${streamNo}` : '', player?.hd ? 'HD' : ''].filter(Boolean).join(' · ');
        channels.push({
          ...baseChannel,
          id: `${baseChannel.id}-${normalizedIdentifier(sourceName)}-${normalizedIdentifier(String(streamNo || channels.length + 1))}`,
          name: label ? `${baseChannel.name} · ${label}` : baseChannel.name,
          embedUrl,
          externalUrl: embedUrl,
          playbackType: 'embed',
          compatPage: true,
          streamKind: 'Streamed · lecteur API',
          sourceLabel: sourceName,
          description: [baseChannel.description, label].filter(Boolean).join(' · ')
        });
      }
    } catch {}
  }
  return channels.length ? channels : [{ ...baseChannel, externalUrl: baseChannel.embedUrl, streamKind: 'Streamed · lecteur web' }];
}

function streamedDeferredChannel(item, root, group) {
  const base = streamedMatchChannel(item, root, group);
  if (!base) return null;
  const sources = (Array.isArray(item.sources) ? item.sources : []).filter(s => s?.source && s?.id).slice(0,8);
  if (!sources.length) return {...base, externalUrl:base.embedUrl};
  const token = issueTvReference(root, {}, {kind:'streamed-event', item:{...item,sources}, group});
  return {...base, playbackType:'resolver', resolverUrl:publicPath(`/api/tv/resolve/${token}`), externalUrl:base.embedUrl, embedUrl:'', streamKind:'Streamed · lecteurs au clic'};
}

async function resolveStreamedReference(reference) {
  const {item, group} = reference.meta;
  const root = reference.url;
  const sourceOptions = item.sources.map(source => {
    const token = issueTvReference(root, {}, {kind:'streamed-source', item:{...item,sources:[source]}, group});
    return {label:`Streamed · ${source.source}`, playbackType:'resolver', resolveUrl:publicPath(`/api/tv/resolve/${token}`)};
  });
  if (reference.meta.kind === 'streamed-event') return {options:sourceOptions};
  const channels = await streamedPlayerChannels(item, root, group);
  const options = channels.filter(c => c.streamKind === 'Streamed · lecteur API').map(c => ({label:c.name, url:c.embedUrl, playbackType:'embed', compatPage:true}));
  if (!options.length) throw new HttpError(502, 'Ce lecteur Streamed ne répond pas. Choisis un autre serveur.');
  return {options};
}

async function tvCatalogFromStreamed(rootValue = 'https://streamed.pk/') {
  const root = safeTvRemoteUrl(rootValue).toString();
  const cacheKey = `streamed::${root}`;
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const sportsEndpoint = new URL('/api/sports', root).toString();
  const sports = await fetchStreamedJson(sportsEndpoint, root).catch(() => []);
  const endpoints = [
    ['/api/matches/live/popular', 'Popular Live'],
    ['/api/matches/live/popular-viewcount', 'Popular Live'],
    ['/api/matches/featured', 'Featured'],
    ...((Array.isArray(sports) ? sports : []).slice(0, 16).map(sport => [`/api/matches/${encodeURIComponent(String(sport.id || ''))}/popular`, String(sport.name || sport.id || 'Sports')]))
  ];
  const results = await Promise.allSettled(endpoints.map(async ([path, group]) => {
    const payload = await fetchStreamedJson(new URL(path, root).toString(), root);
    if (!Array.isArray(payload)) return [];
    return payload.map(item => streamedDeferredChannel(item, root, group)).filter(Boolean);
  }));
  const map = new Map();
  let failedCount = 0;
  results.forEach(result => {
    if (result.status !== 'fulfilled') { failedCount += 1; return; }
    result.value.forEach(channel => map.set(channel.id, channel));
  });
  const channels = [...map.values()];
  const value = {
    name: 'Streamed',
    sourceType: 'streamed',
    groups: [],
    channels,
    count: channels.length,
    warning: channels.length
      ? (failedCount ? `${failedCount} rubrique(s) Streamed n’ont pas répondu.` : '')
      : 'Aucun événement Streamed public exploitable n’est actuellement publié.'
  };
  tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 60_000, value });
  return value;
}

function volkamaxAllowedHost(urlValue) {
  try { return /(?:^|\.)(?:volkamax\.club|bzh-sport\.lat)$/i.test(new URL(urlValue).hostname); }
  catch { return false; }
}

function volkamaxExtractEmbedUrl(htmlValue, baseUrl) {
  const html = String(htmlValue || '').replace(/\\\//g, '/');
  const values = [];
  for (const match of html.matchAll(/embeds\s*\[\s*\d+\s*\]\s*=\s*(['"])([\s\S]*?)\1\s*;/gi)) {
    values.push(decodeTvHtml(match[2]));
  }
  values.push(html);
  for (const value of values) {
    const iframe = String(value || '').match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
      || String(value || '').match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!iframe) continue;
    try { return safeTvRemoteUrl(resolveTvUrl(iframe, baseUrl)).toString(); } catch {}
  }
  return '';
}

function volkamaxBridgeUrl(pageUrl) {
  const token = issueTvReference(pageUrl, {
    referer: 'https://bzh-sport.lat/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/163'
  }, { kind: 'volkamax-page', provider: 'Volkamax' });
  return publicPath(`/api/tv/volkamax/embed/${token}`);
}

async function proxyVolkamaxEmbed(tokenValue, res, mobile = false) {
  const reference = tvReferences.get(String(tokenValue || ''));
  if (!reference || reference.expiresAt <= Date.now() || reference.meta?.kind !== 'volkamax-page') throw new HttpError(410, 'Le lecteur Volkamax a expiré. Recharge la chaîne.');
  if (!volkamaxAllowedHost(reference.url)) throw new HttpError(403, 'Lecteur Volkamax non autorisé.');
  const page = await fetchPublicTvHtml(reference.url, 'Volkamax', 12_000);
  const embedUrl = volkamaxExtractEmbedUrl(page.html, page.finalUrl);
  if (!embedUrl) throw new HttpError(422, 'Volkamax n’a pas publié de lecteur exploitable pour cette entrée.');
  if (mobile) { res.writeHead(302, { location: embedUrl, 'cache-control': 'no-store', 'referrer-policy': 'origin-when-cross-origin' }); res.end(); return; }
  // Le lecteur BZH/Volkamax refuse désormais toute iframe possédant un
  // attribut sandbox, y compris quand toutes les permissions utiles y figurent.
  // Le bridge parent reste limité à ce fournisseur par volkamaxAllowedHost.
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#000}.shield{position:fixed;inset:auto 12px 12px auto;z-index:5;padding:6px 8px;border-radius:8px;background:rgba(5,7,13,.62);border:1px solid rgba(255,255,255,.08);color:#9fb3c8;font:11px system-ui;pointer-events:none;opacity:.72}</style></head><body><iframe src="${embedUrl.replace(/"/g, '&quot;')}" allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *" allowfullscreen referrerpolicy="origin-when-cross-origin"></iframe><div class="shield">Lecteur web</div></body></html>`;
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "frame-ancestors 'self'"
  });
  res.end(html);
}

function parseVolkamaxSports(htmlValue, baseUrl) {
  const html = String(htmlValue || '');
  const channels = [];
  const seen = new Set();
  const add = (hrefValue, labelValue, attrs = '', index = 0, forcedGroup = '') => {
    let url = '';
    try { url = resolveTvUrl(decodeTvHtml(hrefValue), baseUrl); } catch { return; }
    if (!volkamaxAllowedHost(url) || seen.has(url)) return;
    const path = new URL(url).pathname.toLowerCase();
    const body = stripTvHtml(labelValue).replace(/\s+/g, ' ').trim();
    const attrName = decodeTvHtml((attrs.match(/\b(?:title|alt)=["']([^"']+)["']/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    let name = body || attrName;
    if (!name || /^(?:tls|foot|basket|tennis|rugby|handball|cyclisme|formule 1|motogp|hockey|boxe|mma|autres|image)$/i.test(name)) {
      name = path.split('/').filter(Boolean).pop() || '';
      name = name.replace(/-streaming-direct|-streaming-gratuit|-direct/g, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).trim();
    }
    if (!name || name.length < 2 || /^(?:#|javascript|accueil)$/i.test(name)) return;
    if (!/(?:regarder|streaming|direct|ligue|sport|be(?:i|ï)n|canal|eurosport|rmc|dazn|nba|nfl|mlb|nhl|ufc|f1|moto|tennis|rugby|basket|foot|hockey|golf|chaine|chaîne)/i.test(`${name} ${path}`)) return;
    seen.add(url);
    const cleanName = name.slice(0, 140);
    const group = forcedGroup || (/canal|bein|eurosport|rmc|dazn|ligue 1/i.test(cleanName) ? 'Chaînes sport' : /streaming-direct/i.test(path) && !/regarder-la-chaine/i.test(path) ? 'Événements' : 'Volkamax');
    channels.push({
      id: createHash('sha1').update(`${cleanName}\n${url}`).digest('hex').slice(0, 16),
      name: cleanName,
      group,
      category: 'Sports',
      provider: 'Volkamax',
      description: group.startsWith('Événements') ? 'Volkamax / BZH-Sport · événement public' : 'Volkamax / BZH-Sport · lecteur public',
      playbackType: 'embed',
      embedUrl: volkamaxBridgeUrl(url),
      externalUrl: url,
      compatPage: true,
      isLive: true,
      streamKind: 'Volkamax · lecteur résolu'
    });
  };
  for (const row of html.matchAll(/<tr\b[^>]*class=["'][^"']*\bevent\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)) {
    const href = row[1].match(/<a\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/i);
    if (!href) continue;
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => stripTvHtml(cell[1]).replace(/\s+/g, ' ').trim()).filter(Boolean);
    const title = cells.find(value => / - | vs | v /i.test(value)) || stripTvHtml(href[4]);
    const competition = cells.find(value => value && value !== title && !/^(?:aujourd'hui|\d{1,2}[:h]\d{2}|\d{1,2}-[A-Za-z]+-\d{4})$/i.test(value)) || '';
    add(href[2], title, `${href[1]} ${href[3]}`, row.index, competition ? `Événements · ${competition}` : 'Événements');
  }
  const expression = /<a\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = expression.exec(html)) && channels.length < 900) {
    add(match[2], match[4], `${match[1]} ${match[3]}`, match.index);
  }
  return channels;
}

async function tvCatalogFromVolkamax(rootValue = 'https://volkamax.club/') {
  const root = safeTvRemoteUrl(rootValue).toString();
  const cacheKey = `volkamax::${root}`;
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let page;
  try { page = await fetchPublicTvHtml(root, 'Volkamax', 9_000); }
  catch (error) {
    if (!volkamaxAllowedHost(root)) throw error;
    const alternate = new URL(root).hostname === 'bzh-sport.lat' ? 'https://volkamax.club/' : 'https://bzh-sport.lat/';
    page = await fetchPublicTvHtml(alternate, 'Volkamax', 9_000);
  }
  const jsRedirect = String(page.html || '').match(/location\.href\s*=\s*['"]([^'"]+)['"]/i)?.[1]
    || String(page.html || '').match(/location\.replace\s*\(\s*['"]([^'"]+)['"]\s*\)/i)?.[1];
  if (jsRedirect) {
    try {
      const redirected = resolveTvUrl(decodeTvHtml(jsRedirect), page.finalUrl);
      if (volkamaxAllowedHost(redirected)) page = await fetchPublicTvHtml(redirected, 'Volkamax', 18_000);
    } catch {}
  }
  const channels = parseVolkamaxSports(page.html, page.finalUrl);
  const value = {
    name: 'Volkamax',
    sourceType: 'volkamax',
    groups: [],
    channels,
    count: channels.length,
    warning: channels.length ? '' : 'Aucun lien Sport Volkamax exploitable n’a été trouvé sur le domaine public actuel.'
  };
  tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60_000, value });
  return value;
}

function halouleLinkGroup(contextValue, urlValue, labelValue) {
  const context = stripTvHtml(String(contextValue || '')).replace(/\s+/g, ' ').toLowerCase();
  const label = String(labelValue || '').toLowerCase();
  const url = String(urlValue || '').toLowerCase();
  if (/1\.1\)|liens direct|chaines tv sport 24\/24|chaînes tv sport 24\/24/.test(context)) return 'Chaînes sport 24/24';
  if (/1\.2\)|meilleurs sites de streaming live tv|sites live tv/.test(context)) return 'Sites Live TV';
  return 'Alternatives Live TV';
}

function normalizeHalouleDirectSportLabel(labelValue = '') {
  return decodeTvHtml(String(labelValue || ''))
    .replace(/&nbsp;|\u00a0/gi, ' ')
    .replace(/\s*\*+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function halouleDirectSportLabelAllowed(labelValue = '') {
  const label = normalizeHalouleDirectSportLabel(labelValue);
  return /^(?:canal\+|canal\+\s+sport|canal\+\s+foot|canal\+\s+sport\s+360|canal\+\s+sport\s+[1-5]\s+afrik|c\+\s+live\s+(?:[1-9]|10)|canal\+\s+live\s+(?:[1-9]|10)|ligue\s*1\+(?:\s+\(v2\)|\s+(?:[1-9]|10)(?:\s+\(v2\))?)?|beinsport\s+(?:fr\s+)?[1-3]|beinsport\s+max\s+(?:[4-9]|10)|max\s+(?:[4-9]|10)|rmc\s+sport\s+[1-2]|eurosport\s+[1-2]|espn\s+fr\s+by\s+disney\+|automoto|sportenfrance|trace\s+(?:urban|caribbean|terranga|latina|toca|gospel|vanilla|africa)|bblack\s+(?:africa|caribbean|classic)|bblack\s+classic|clubbing\s+tv)$/i.test(label);
}

function halouleLinkAllowed(urlValue, labelValue = '') {
  let url;
  try { url = safeTvRemoteUrl(urlValue); } catch { return false; }
  const host = url.hostname.toLowerCase();
  const label = String(labelValue || '').toLowerCase();
  if (/(?:blogger|blogspot|googleusercontent|schema\.org|facebook|twitter|youtube|fonts\.googleapis)\b/i.test(host)) return false;
  if (/\.(?:png|jpe?g|gif|webp|svg|css|js)(?:$|[?#])/i.test(url.pathname)) return false;
  if (/\b(?:image|home|about|contact|accueil|browser|navigateur|apk|android|ios|iphone|ipad|windows|macos|linux|vpn|adblock|cast|receiver|web\s*video|download|telecharg|télécharg|hébergeur|hebergeur|extension)\b/i.test(label)) return false;
  return true;
}

function alternativeShortenerHost(urlValue) {
  try { return /(?:^|\.)clictune\.com$/i.test(new URL(urlValue).hostname) || /(?:^|\.)dlink10\.com$/i.test(new URL(urlValue).hostname); }
  catch { return false; }
}

function extractDlinkFinalUrl(htmlValue, baseUrl) {
  const html = decodeTvHtml(String(htmlValue || ''));
  const direct = html.match(/https?:\/\/www\.dlink10\.com\/link\/redirect\/\?[^"' <>\n\r]+/i)?.[0]
    || html.match(/href=["']([^"']*\/link\/redirect\/\?[^"']+)["']/i)?.[1];
  if (!direct) return '';
  try {
    const redirectUrl = safeTvRemoteUrl(resolveTvUrl(direct, baseUrl));
    const target = redirectUrl.searchParams.get('url');
    return target ? safeTvRemoteUrl(target).toString() : redirectUrl.toString();
  } catch {
    return '';
  }
}

async function resolveAlternativePublicTarget(urlValue) {
  let current = safeTvRemoteUrl(urlValue).toString();
  let referer = 'https://www.haloule.com/';
  const signal = AbortSignal.timeout(8_000);
  for (let index = 0; index < 4; index += 1) {
    if (!alternativeShortenerHost(current)) return current;
    const response = await fetch(current, {
      redirect: 'manual',
      signal,
      headers: {
        referer,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/163'
      }
    });
    const location = response.headers.get('location');
    if (location) {
      try { await response.body?.cancel?.(); } catch {}
      referer = current;
      current = safeTvRemoteUrl(resolveTvUrl(location, current)).toString();
      continue;
    }
    const text = await response.text();
    const extracted = extractDlinkFinalUrl(text, current);
    if (!extracted || extracted === current) return current;
    referer = current;
    current = extracted;
  }
  return current;
}

function alternativeBrowserUrl(urlValue, labelValue = '', groupValue = '') {
  const target = safeTvRemoteUrl(urlValue).toString();
  const token = issueTvReference(target, {
    referer: 'https://www.haloule.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Noctra/163'
  }, {
    kind: 'alternative-browser',
    provider: 'Alternative',
    label: String(labelValue || '').slice(0, 160),
    group: String(groupValue || '').slice(0, 120)
  });
  return publicPath(`/api/tv/alternative/open/${token}`);
}

async function proxyAlternativeBrowser(tokenValue, res, mobile = false) {
  const reference = tvReferences.get(String(tokenValue || ''));
  if (!reference || reference.expiresAt <= Date.now() || reference.meta?.kind !== 'alternative-browser') throw new HttpError(410, 'Ce lien Alternative a expiré. Recharge la source.');
  const originalTarget = safeTvRemoteUrl(reference.url).toString();
  const target = await resolveAlternativePublicTarget(originalTarget).catch(() => originalTarget);
  if (mobile) { res.writeHead(302, { location: target, 'cache-control': 'no-store', 'referrer-policy': 'origin-when-cross-origin' }); res.end(); return; }
  const label = String(reference.meta?.label || 'Lien Alternative').trim() || 'Lien Alternative';
  const group = String(reference.meta?.group || 'Alternative').trim() || 'Alternative';
  const escapedTarget = target.replace(/"/g, '&quot;');
  const resolvedNote = target !== originalTarget ? 'Lien direct resolu par Noctra' : 'Lien public';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeTvLogoText(label)}</title><style>html,body{margin:0;width:100%;height:100%;background:#000;color:#f4f7fb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden}.frame,.frame iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#000}.hud{position:fixed;top:10px;right:10px;z-index:10;display:flex;align-items:center;gap:7px;max-width:calc(100vw - 20px);opacity:.34;transition:opacity .18s ease}.hud:hover,.hud:focus-within{opacity:1}.pill,.open{height:30px;display:inline-flex;align-items:center;border-radius:999px;border:1px solid rgba(99,255,218,.22);background:rgba(8,14,22,.68);backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.28);color:#dffcf4;font-size:11px;font-weight:750;text-decoration:none;white-space:nowrap}.pill{padding:0 10px;cursor:pointer}.open{padding:0 11px}.meta{position:fixed;left:10px;top:10px;z-index:9;max-width:min(560px,calc(100vw - 190px));padding:7px 9px;border-radius:999px;background:rgba(6,10,18,.42);border:1px solid rgba(255,255,255,.07);color:rgba(232,238,247,.68);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.2;pointer-events:none;transition:opacity .18s ease}.frame:hover~.meta,.hud:hover~.meta{opacity:.58}.click-shield{position:fixed;inset:0;z-index:8;background:transparent;cursor:default}.click-shield[hidden]{display:none}.toast{position:fixed;left:14px;bottom:14px;z-index:11;max-width:min(420px,calc(100vw - 28px));padding:8px 10px;border-radius:10px;background:rgba(8,12,19,.78);border:1px solid rgba(255,255,255,.1);color:rgba(232,238,247,.74);font-size:11px;opacity:0;transform:translateY(6px);transition:opacity .2s ease,transform .2s ease;pointer-events:none}.toast.show{opacity:.9;transform:translateY(0)}</style></head><body><div class="frame"><iframe id="noctraAltFrame" src="${escapedTarget}" allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *" allowfullscreen referrerpolicy="origin-when-cross-origin"></iframe></div><div class="click-shield" id="noctraAltClickShield" hidden title="Clics bloqués pour éviter les popups"></div><div class="meta">${escapeTvLogoText(label)} · ${escapeTvLogoText(group)} · ${escapeTvLogoText(resolvedNote)}</div><div class="hud"><button class="pill" id="noctraAltClickToggle" type="button">Clics actifs</button><a class="open" href="${escapedTarget}" target="_blank" rel="noreferrer">Ouvrir dehors</a></div><div class="toast" id="noctraAltToast">Clics actifs. Le mode anti-popup dur peut bloquer les clics publicitaires si besoin.</div><script>(function(){try{window.open=function(){return null}}catch{};addEventListener('click',function(event){const link=event.target&&event.target.closest&&event.target.closest('a[target="_blank"]');if(link&&!link.classList.contains('open')){event.preventDefault();event.stopPropagation()}},true);const shield=document.getElementById('noctraAltClickShield'),toggle=document.getElementById('noctraAltClickToggle'),toast=document.getElementById('noctraAltToast');let clickShield=false,timer=0;function flash(text){if(!toast)return;toast.textContent=text;toast.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove('show'),3000)}function setShield(value){clickShield=!!value;if(shield)shield.hidden=!clickShield;if(toggle){toggle.textContent=clickShield?'Anti-popup dur':'Clics actifs';toggle.style.borderColor=clickShield?'rgba(99,255,218,.32)':'rgba(255,255,255,.16)';toggle.style.color=clickShield?'#dffcf4':'#eef3ff'}flash(clickShield?'Anti-popup dur actif : les clics sur la vidéo sont absorbés.':'Clics actifs : le lecteur reste utilisable.')}toggle?.addEventListener('click',()=>setShield(!clickShield));shield?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();flash('Clic absorbé pour éviter un popup. Désactive le mode dur pour contrôler le lecteur.')},true);setTimeout(()=>flash('Clics actifs par défaut.'),900)})();</script></body></html>`;
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "frame-ancestors 'self'"
  });
  res.end(html);
}

function parseHalouleAlternatives(htmlValue, baseUrl) {
  const html = String(htmlValue || '');
  // Match headings even when Blogger inserts spans between their words.
  const gap = '(?:\\s|&nbsp;|<[^>]*>)*';
  const startHeading = new RegExp('1\\.1\\)' + gap + 'Liens' + gap + 'direct', 'i');
  const endHeading = new RegExp('1\\.2\\)' + gap + 'Meilleurs', 'i');
  const liveStart = html.search(startHeading);
  if (liveStart < 0) return [];
  const tail = html.slice(liveStart);
  const end = tail.search(endHeading);
  if (end < 0) return [];
  const article = tail.slice(0, end);
  const channels = [];
  const seen = new Set();
  const expression = /<a\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = expression.exec(article)) && channels.length < 700) {
    const href = decodeTvHtml(match[2]).trim();
    let url = '';
    try { url = resolveTvUrl(href, baseUrl); } catch { continue; }
    let label = publicTvPageName(match[4], `${match[1]} ${match[3]}`, '');
    label = label.replace(/\s*\*+\s*$/g, '').replace(/\s+/g, ' ').trim();
    if (!label || label.length < 2 || !halouleLinkAllowed(url, label)) continue;
    if (!halouleDirectSportLabelAllowed(label)) continue;
    const key = `${normalizedIdentifier(label)}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const context = article.slice(Math.max(0, match.index - 1400), match.index);
    const group = 'Haloule · section 1.1';
    const cleanLabel = label.replace(/^MAX\s+/i, 'BeinSport MAX ').slice(0, 140);
    const eventOnly = /^\s*(?:<[^>]*>\s*)*\*/.test(article.slice(expression.lastIndex, expression.lastIndex + 160));
    channels.push({
      id: createHash('sha1').update(`${cleanLabel}\n${url}`).digest('hex').slice(0, 16),
      name: cleanLabel,
      group,
      category: 'Alternative',
      provider: 'Alternative',
      description: eventOnly ? 'Haloule 1.1 · diffusion pendant les événements uniquement' : 'Haloule 1.1 · lien de chaîne publié',
      eventOnly,
      playbackType: 'embed',
      embedUrl: alternativeBrowserUrl(url, cleanLabel, group),
      externalUrl: url,
      noSandbox: true,
      compatPage: true,
      isLive: /(?:live|tv|sport|stream|canal|bein|rmc|dazn|ligue|foot|watch)/i.test(`${label} ${url}`),
      streamKind: 'Alternative · navigateur intégré'
    });
  }
  return channels;
}

async function tvCatalogFromAlternative(rootValue = 'https://www.haloule.com/2024/01/meilleurs-sites-applications-android-PC-regarder-live-tv-gratuitement.html') {
  const root = safeTvRemoteUrl(rootValue).toString();
  const cacheKey = `alternative::${root}`;
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const page = await fetchPublicTvHtml(root, 'Alternative', 18_000);
  const channels = parseHalouleAlternatives(page.html, page.finalUrl);
  const value = {
    name: 'Alternative',
    sourceType: 'alternative',
    groups: [],
    channels,
    count: channels.length,
    warning: channels.length
      ? 'Liens issus de la page Haloule publique, rafraîchis régulièrement par Noctra.'
      : 'Aucun lien alternatif exploitable n’a été trouvé sur la page Haloule.'
  };
  tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, value });
  return value;
}


function ohaChannelIdentity(value) {
  // V108 : le catalogue OHA peut publier la même chaîne sous des variantes
  // typographiques (ex. « 13EME RUE » / « 13 EME RUE »). Elles doivent partager
  // une seule carte afin que leurs serveurs deviennent des alternatives du même
  // canal au lieu d'apparaître comme deux chaînes différentes.
  return normalizedIdentifier(cleanOhaChannelName(value).replace(/(\d)\s*\.[a-d]\s*$/i, '$1'))
    .replace(/\s*(?:backup|secours|live during events only|events only)\s*$/g, '')
    .replace(/\b(\d+)\s+(?:e|eme)\b/g, '$1eme')
    .replace(/\b(\d+)\s+eme\b/g, '$1eme')
    .replace(/\s+/g, ' ')
    .trim();
}

// Les anciennes routes oha.cx ne doivent jamais contaminer le catalogue Kool.
// Le client Kool actuel utilise directement `ids.id` dans /watch?live=<id>.
const ohaConfirmedPublicRoutes = new Map();

function ohaWatchRouteFromValue(value, rootValue = 'https://oha.cx/live') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, safeTvRemoteUrl(rootValue));
    if (!ohaAllowedHost(url.toString())) return '';
    const live = String(url.searchParams.get('live') || '').trim();
    if (!/^\/watch\/?$/i.test(url.pathname) || !/^[a-z0-9_-]{12,128}$/i.test(live)) return '';
    return `${url.origin}/watch?live=${encodeURIComponent(live)}`;
  } catch {
    return '';
  }
}

function ohaRouteCandidatesFromValue(value, rootValue, keyHint = '', depth = 0, output = []) {
  if (depth > 7 || value === null || value === undefined || output.length >= 16) return output;
  const add = candidate => {
    const route = ohaWatchRouteFromValue(candidate, rootValue);
    if (route && !output.includes(route)) output.push(route);
  };
  if (typeof value === 'string') {
    const raw = value.trim();
    add(raw);
    // Certaines réponses JSON échappent les URLs ou les injectent dans un
    // fragment de texte/JS plutôt que dans un champ URL dédié.
    for (const match of raw.matchAll(/(?:https?:\/\/(?:www\.)?(?:oha\.cx|kool\.ws|kool\.to)|https?:\/\/185\.254\.196\.78)?\/watch\?live=([a-z0-9_-]{12,128})/gi)) {
      add(new URL(`/watch?live=${match[1]}`, safeTvRemoteUrl(rootValue)).toString());
    }
    if (/^(?:live|watch|route|page|href|external|public|web|slug|hash|token|id)$/i.test(String(keyHint || '')) && /^[a-f0-9]{18,64}$/i.test(raw)) {
      add(new URL(`/watch?live=${encodeURIComponent(raw)}`, safeTvRemoteUrl(rootValue)).toString());
    }
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) ohaRouteCandidatesFromValue(item, rootValue, keyHint, depth + 1, output);
    return output;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) ohaRouteCandidatesFromValue(nested, rootValue, key, depth + 1, output);
  }
  return output;
}

function ohaPublicRouteCandidates(entryGroup, rootValue) {
  const output = [];
  // Ne jamais déduire une route des IDs EPG, tokens ou IDs de serveurs imbriqués.
  // Le catalogue Kool lie son bouton de chaîne à ids.id.
  const addId = value => {
    if (!/^[a-z0-9_-]{12,128}$/i.test(String(value || ''))) return;
    const route = ohaWatchRouteFromValue(`/watch?live=${encodeURIComponent(value)}`, rootValue);
    if (route && !output.includes(route)) output.push(route);
  };
  addId(entryGroup?.id);
  for (const entry of Array.isArray(entryGroup?.entries) ? entryGroup.entries : []) {
    addId(entry?.ids?.id);
    for (const key of ['externalUrl', 'publicUrl', 'watchUrl', 'href', 'pageUrl']) {
      const route = ohaWatchRouteFromValue(entry?.[key], rootValue);
      if (route && !output.includes(route)) output.push(route);
    }
  }
  return [...new Set(output)].slice(0, 12);
}

function ohaServerLabel(value, index) {
  const name = String(value || '');
  const quality = name.match(/\b(?:UHD|FHD|HD|SD|4K)\b/i)?.[0]?.toUpperCase() || 'Auto';
  const server = name.match(/\|\s*([A-Z0-9]+)\s*$/i)?.[1]?.toUpperCase() || String(index + 1);
  return `${quality} · Serveur ${server}`;
}

function ohaProgramme(epgValue) {
  const epg = Array.isArray(epgValue) ? epgValue.map(item => ({
    title: String(item?.name || item?.title || '').trim(),
    start: Number(item?.start || 0) * (Number(item?.start || 0) < 10_000_000_000 ? 1000 : 1),
    stop: Number(item?.stop || 0) * (Number(item?.stop || 0) < 10_000_000_000 ? 1000 : 1)
  })).filter(item => item.title) : [];
  const nowTime = Date.now();
  const activeIndex = epg.findIndex(item => item.start <= nowTime && item.stop > nowTime);
  const now = activeIndex >= 0 ? epg[activeIndex] : null;
  const next = activeIndex >= 0 ? epg[activeIndex + 1] || null : epg.find(item => item.start > nowTime) || null;
  return { now, next };
}

let ohaHealthyRoot = null;

function ohaRootAlternatives(rootValue) {
  const roots = [];
  const add = value => {
    try {
      const normalized = new URL('/live', safeTvRemoteUrl(value)).toString();
      if (!roots.includes(normalized)) roots.push(normalized);
    } catch {}
  };
  if (ohaHealthyRoot?.expiresAt > Date.now()) add(ohaHealthyRoot.url);
  add(rootValue);
  // OHA a migré vers Kool. L'IP reste un secours utile lorsque le DNS du
  // nouveau domaine est filtré sur la seedbox ; l'ancien domaine vient enfin.
  add('https://kool.ws/live');
  add('http://185.254.196.78/live');
  add('http://178.83.5.50/live');
  add('http://vavoo.top/live');
  add('https://oha.cx/live');
  return roots;
}

function ohaRequestBody(kind, { group = '', cursor = null, url = '' } = {}) {
  if (kind === 'catalog') return {
    language: 'fr',
    region: 'FR',
    catalogId: 'iptv',
    id: '',
    adult: false,
    search: '',
    sort: 'name',
    filter: { group },
    cursor,
    clientVersion: '3.0.2'
  };
  return { language: 'fr', region: 'FR', url, clientVersion: '3.0.2' };
}

function ohaProviderHttpError(status, area = 'lecteur') {
  if (Number(status) === 501) return new HttpError(503, `OHA indique actuellement que son ${area} est indisponible (HTTP 501 côté fournisseur).`);
  if (Number(status) === 451) return new HttpError(503, `OHA refuse actuellement l’accès à son ${area} depuis ce serveur (HTTP 451).`);
  return null;
}

async function ohaCatalogPage(root, group, cursor = null, timeoutMs = 9_000) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(3_000, Number(timeoutMs) || 9_000))]);
  try {
    return await Promise.any(ohaRootAlternatives(root).map(async (candidateRoot, index) => {
      if (index) await new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, index * 500);
        signal.addEventListener('abort', onAbort, {once:true});
      });
      signal.throwIfAborted();
    const endpointName = /(?:^|\.)(?:kool\.ws|vavoo\.top)$|^(?:185\.254\.196\.78|178\.83\.5\.50)$/i.test(new URL(candidateRoot).hostname)
      ? '/mediahubmx-catalog.json'
      : '/mediaurl-catalog.json';
    const endpoint = new URL(endpointName, candidateRoot).toString();
    const origin = new URL(candidateRoot).origin;
      const response = await fetchTvRemote(endpoint, {
        method: 'POST',
        signal,
        headers: {
          accept: 'application/json, text/plain;q=0.8, */*;q=0.4',
          'content-type': 'application/json; charset=utf-8',
          origin,
          referer: candidateRoot,
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36'
        },
        body: JSON.stringify(ohaRequestBody('catalog', { group, cursor }))
      });
      if (!response.ok) throw ohaProviderHttpError(response.status, 'catalogue') || new HttpError(response.status, `Catalogue OHA ${group} indisponible (${response.status}).`);
      const text = await response.text();
      let payload;
      try { payload = text ? JSON.parse(text) : {}; }
      catch { throw new HttpError(502, `Catalogue OHA ${group} : réponse non JSON.`); }
      if (!Array.isArray(payload?.items)) throw new HttpError(502, 'Catalogue OHA : format inattendu.');
      ohaHealthyRoot = {url:candidateRoot, expiresAt:Date.now()+300_000};
      // V79 : si oha.cx redirige sa requête d'API vers un hôte canonique,
      // on accepte la réponse mais on conserve oha.cx comme racine fonctionnelle
      // du catalogue tant que c'est le candidat demandé. Le lecteur /watch démarre
      // donc bien depuis oha.cx ; le bridge mémorise ensuite une éventuelle
      // redirection officielle pour charger les assets sur le bon hôte.
      return {
        items: Array.isArray(payload?.items) ? payload.items : [],
        nextCursor: payload?.nextCursor ?? null,
        root: candidateRoot
      };
    }));
  } catch (error) {
    throw error.errors?.[0] || error;
  } finally { controller.abort(); }
}

async function ohaCatalogGroup(root, group, startCursor = null, maxPages = 5) {
  const items = [];
  let cursor = startCursor;
  for (let page = 0; page < maxPages && items.length < 1500; page += 1) {
    const result = await ohaCatalogPage(root, group, cursor, page === 0 ? 9_000 : 8_000);
    items.push(...result.items);
    const nextCursor = result.nextCursor;
    if (nextCursor === null || nextCursor === cursor || !result.items.length) break;
    cursor = nextCursor;
  }
  return items;
}

function issueOhaResolverReference(entries, root, fallbackUrl = '', channelId = '', channelName = '', routeCandidates = []) {
  const candidates = entries.map((entry, index) => ({
    url: safeTvRemoteUrl(entry.url).toString(),
    channelId: String(entry?.ids?.id || ''),
    label: ohaServerLabel(entry.name, index)
  }));
  if (!candidates.length) throw new HttpError(422, 'Aucun serveur OHA disponible pour cette chaîne.');
  const routes = [...new Set((Array.isArray(routeCandidates) ? routeCandidates : []).map(value => ohaWatchRouteFromValue(value, root)).filter(Boolean))].slice(0, 12);
  return encodeTvStateReference('oha', {
    root: safeTvRemoteUrl(root).toString(),
    fallbackUrl: fallbackUrl ? safeTvRemoteUrl(fallbackUrl).toString() : '',
    routeCandidates: routes,
    channelId: String(channelId || ''),
    channelName: String(channelName || ''),
    candidates
  });
}

function ohaPageLooksMissing(html = '') {
  const text = String(html || '');
  return /(?:>\s*NOT\s+FOUND\s*<|that route doesn['’]t exist|route doesn['’]t exist|page not found|404\s*(?:not\s*found)?|route\s+(?:is\s+)?not\s+found|unknown\s+route)/i.test(text);
}

function ohaOfficialPageCandidates(rootValue, channelId = '', fallbackUrl = '', routeCandidates = []) {
  const root = safeTvRemoteUrl(rootValue);
  const values = [];
  const add = value => { try { const url = safeTvRemoteUrl(value).toString(); if (!values.includes(url)) values.push(url); } catch {} };
  const addWatchId = value => {
    const raw = String(value || '').trim();
    let liveId = '';
    try { liveId = String(new URL(raw, root).searchParams.get('live') || '').trim(); } catch {}
    if (!liveId && /^[a-f0-9]{18,64}$/i.test(raw)) liveId = raw;
    if (/^[a-z0-9_-]{12,128}$/i.test(liveId)) add(new URL(`/watch?live=${encodeURIComponent(liveId)}`, root).toString());
  };
  // Kool publie actuellement `ids.id` comme identifiant exact de la route.
  // On reconstruit toujours la deep-link sur le miroir testé afin de ne jamais
  // mélanger une route oha.cx obsolète avec les assets/API de kool.ws.
  addWatchId(channelId);
  for (const candidate of routeCandidates) addWatchId(candidate);
  addWatchId(fallbackUrl);
  add(new URL('/live', root).toString());
  return values;
}

async function selectOhaOfficialPage(reference) {
  const roots = ohaRootAlternatives(reference?.meta?.root || 'https://oha.cx/live');
  const channelId = reference?.meta?.channelId || '';
  const fallbackUrl = reference?.meta?.fallbackUrl || '';
  const routeCandidates = Array.isArray(reference?.meta?.routeCandidates) ? reference.meta.routeCandidates : [];
  const userAgent = reference?.headers?.['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
  for (const root of roots) {
    for (const candidate of ohaOfficialPageCandidates(root, channelId, fallbackUrl, routeCandidates)) {
      try {
        const response = await fetchTvRemote(candidate, {
          signal: AbortSignal.timeout(15_000),
          headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7', 'user-agent': userAgent },
          redirect: 'follow'
        });
        if (!response.ok) continue;
        const html = await response.text();
        if (ohaPageLooksMissing(html)) continue;
        return { url: response.url || candidate, root, htmlChecked: true };
      } catch {}
    }
  }
  return { url: new URL('/', safeTvRemoteUrl(reference?.meta?.root || 'https://oha.cx/live')).toString(), root: reference?.meta?.root || 'https://oha.cx/live', htmlChecked: false };
}

function ohaWebFallbackOption(reference, token = '') {
  const externalUrl = String(reference?.meta?.fallbackUrl || reference?.meta?.root || '').trim();
  if (!externalUrl) return null;
  return {
    label: 'OHA intégré',
    url: token ? tvPublicOhaEmbedUrl(token) : externalUrl,
    externalUrl,
    playbackType: 'embed',
    compatPage: true,
    fallback: true,
    native: false,
    officialClient: true
  };
}


function tvDesktopPlaybackUserAgent(userAgentValue = '') {
  const ua = String(userAgentValue || '');
  if (!ua) return false;
  return !/(?:iPhone|iPad|iPod|Android|Mobile|Tablet|TV|SmartTV|Web0S|Tizen)/i.test(ua);
}

function hlsCodecSummary(textValue = '') {
  const codecs = [];
  for (const match of String(textValue || '').matchAll(/\bCODECS="([^"]+)"/gi)) {
    for (const codec of String(match[1] || '').split(',').map(value => value.trim()).filter(Boolean)) {
      if (!codecs.some(value => value.toLowerCase() === codec.toLowerCase())) codecs.push(codec);
    }
  }
  const hasAvc = codecs.some(codec => /^(?:avc1|avc3)\b/i.test(codec));
  const hasHevc = codecs.some(codec => /^(?:hvc1|hev1)\b/i.test(codec));
  const hasAv1 = codecs.some(codec => /^av01\b/i.test(codec));
  return {
    codecs,
    videoCodec: codecs.find(codec => /^(?:avc1|avc3|hvc1|hev1|av01|vp09)\b/i.test(codec)) || '',
    hasAvc,
    hasHevc,
    hasAv1,
    desktopCodecRisk: hasHevc && !hasAvc
  };
}

async function probeOhaStreamCodec(streamUrlValue, headers = {}, timeoutMs = 2_800) {
  try {
    const streamUrl = safeTvRemoteUrl(streamUrlValue);
    const response = await fetchTvRemote(streamUrl, {
      headers: {
        accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain;q=0.7,*/*;q=0.4',
        'user-agent': headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
        ...(headers.referer ? { referer: headers.referer } : {}),
        ...(headers.authorization ? { authorization: headers.authorization } : {}),
        ...(headers.cookie ? { cookie: headers.cookie } : {})
      },
      signal: AbortSignal.timeout(Math.max(1_800, Number(timeoutMs) || 2_800))
    });
    if (!response.ok) return { codecs: [], videoCodec: '', hasAvc: false, hasHevc: false, hasAv1: false, desktopCodecRisk: false, probed: false };
    const contentType = String(response.headers.get('content-type') || '');
    const finalUrl = response.url || streamUrl.toString();
    if (!/(?:mpegurl|m3u8)/i.test(contentType) && !/\.m3u8?(?:$|[?#/])/i.test(finalUrl)) {
      try { await response.body?.cancel?.(); } catch {}
      return { codecs: [], videoCodec: '', hasAvc: false, hasHevc: false, hasAv1: false, desktopCodecRisk: false, probed: false };
    }
    const text = await response.text();
    const summary = hlsCodecSummary(text);
    return { ...summary, probed: true };
  } catch {
    return { codecs: [], videoCodec: '', hasAvc: false, hasHevc: false, hasAv1: false, desktopCodecRisk: false, probed: false };
  }
}

function ohaResolvedStreamUrl(payload) {
  const seen = new Set();
  const candidates = [];
  const scoreUrl = (url, key = '', depth = 0) => {
    let parsed;
    try { parsed = new URL(url); } catch { return -1000; }
    const value = parsed.toString();
    let score = 0;
    if (/\.m3u8?(?:$|[?#/])/i.test(value)) score += 140;
    else if (/\.mp4(?:$|[?#/])/i.test(value)) score += 120;
    else if (/\.mpd(?:$|[?#/])/i.test(value)) score += 110;
    if (/(?:stream|hls|file|src|playback)/i.test(key)) score += 55;
    if (/^(?:url|link)$/i.test(key)) score += 15;
    if (!ohaAllowedHost(parsed.href)) score += 20;
    if (/(?:\/watch|\/live(?:\/|$)|\/channel)/i.test(parsed.pathname) && ohaAllowedHost(parsed.href)) score -= 80;
    if (/\.(?:png|jpe?g|webp|gif|svg|css|js)(?:$|[?#])/i.test(parsed.pathname)) score -= 200;
    score -= depth;
    return score;
  };
  const walk = (value, key = '', depth = 0) => {
    if (depth > 7 || value === null || value === undefined) return;
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value)) candidates.push({ url: value, score: scoreUrl(value, key, depth) });
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(item => walk(item, key, depth + 1));
      return;
    }
    const priority = ['streamUrl', 'stream_url', 'hls', 'hlsUrl', 'hls_url', 'file', 'src', 'url'];
    priority.forEach(childKey => { if (childKey in value) walk(value[childKey], childKey, depth + 1); });
    for (const [childKey, child] of Object.entries(value)) {
      if (priority.includes(childKey)) continue;
      walk(child, childKey, depth + 1);
    }
  };
  walk(payload);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score > -40 ? candidates[0].url : '';
}

async function validateOhaNativeHlsStream(streamUrlValue, headers = {}, timeoutMs = 2_600) {
  const streamUrl = safeTvRemoteUrl(streamUrlValue);
  const response = await fetchTvRemote(streamUrl, {
    headers: {
      accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain;q=0.8,*/*;q=0.3',
      'user-agent': headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
      ...(headers.referer ? { referer: headers.referer } : {}),
      ...(headers.authorization ? { authorization: headers.authorization } : {}),
      ...(headers.cookie ? { cookie: headers.cookie } : {})
    },
    signal: AbortSignal.timeout(Math.max(1_600, Number(timeoutMs) || 2_600))
  });
  if (!response.ok) throw new HttpError(response.status, `Flux OHA indisponible (${response.status}).`);

  // Certains CDN OHA renvoient text/plain ou application/octet-stream pour les
  // playlists. On inspecte donc un petit préfixe au lieu de dépendre du MIME.
  const reader = response.body?.getReader?.();
  if (!reader) {
    const contentType = String(response.headers.get('content-type') || '');
    if (!/(?:mpegurl|m3u8)/i.test(contentType) && !/\.m3u8?(?:$|[?#/])/i.test(response.url || streamUrl.toString())) {
      throw new HttpError(415, 'Le serveur OHA ne fournit pas un flux HLS natif compatible.');
    }
    return true;
  }

  const decoder = new TextDecoder();
  let preview = '';
  try {
    while (preview.length < 32_768) {
      const { value, done } = await reader.read();
      if (value?.length) preview += decoder.decode(value, { stream: !done });
      if (done || /#EXTM3U/i.test(preview)) break;
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  if (!/#EXTM3U/i.test(preview)) throw new HttpError(415, 'Le serveur OHA a répondu, mais sans playlist HLS exploitable.');
  return true;
}

async function resolveSingleOhaCandidate(reference, candidate, index, timeoutMs = 6_000, signal = null) {
  const controller = new AbortController();
  const deadline = AbortSignal.timeout(Math.max(2_500, timeoutMs));
  const attemptSignal = AbortSignal.any([controller.signal, deadline, ...(signal ? [signal] : [])]);
  const roots = ohaRootAlternatives(reference.meta.root).slice(0, 6);
  try {
    return await Promise.any(roots.map(async (candidateRoot, rootIndex) => {
      // Un miroir lent ne bloque plus tous les suivants pendant 8 secondes.
      // L'origine configurée garde une avance ; les sondes perdantes sont annulées.
      if (rootIndex) await new Promise((resolve, reject) => {
        attemptSignal.throwIfAborted();
        const onAbort = () => { clearTimeout(timer); reject(attemptSignal.reason); };
        const timer = setTimeout(() => {
          attemptSignal.removeEventListener('abort', onAbort);
          resolve();
        }, rootIndex * 650);
        attemptSignal.addEventListener('abort', onAbort, { once: true });
      });
      attemptSignal.throwIfAborted();
      const endpointName = /(?:^|\.)(?:kool\.ws|vavoo\.top)$|^(?:185\.254\.196\.78|178\.83\.5\.50)$/i.test(new URL(candidateRoot).hostname)
        ? '/mediahubmx-resolve.json'
        : '/mediaurl-resolve.json';
      const endpoint = new URL(endpointName, candidateRoot).toString();
      const origin = new URL(candidateRoot).origin;
      const response = await fetchTvRemote(endpoint, {
        method: 'POST',
        signal: AbortSignal.any([attemptSignal, AbortSignal.timeout(8_000)]),
        headers: {
          accept: 'application/json, text/plain;q=0.8, */*;q=0.5',
          'content-type': 'application/json; charset=utf-8',
          origin,
          referer: candidateRoot,
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
          'user-agent': reference.headers['user-agent'] || 'Noctra-Media-Client/87'
        },
        body: JSON.stringify(ohaRequestBody('resolve', { url: candidate.url }))
      });
      if (!response.ok) {
        try { await response.body?.cancel?.(); } catch {}
        throw ohaProviderHttpError(response.status, `serveur ${index + 1}`) || new HttpError(response.status, `Serveur OHA ${index + 1} indisponible (${response.status}).`);
      }
      const text = await response.text();
      let payload;
      try { payload = text ? JSON.parse(text) : {}; }
      catch { throw new HttpError(502, `Serveur OHA ${index + 1} : réponse non JSON.`); }
      const streamValue = ohaResolvedStreamUrl(payload);
      if (!streamValue) throw new HttpError(422, `Serveur OHA ${index + 1} n'a renvoyé aucun flux vidéo.`);
      const streamUrl = safeTvRemoteUrl(streamValue);
      const nativeHeaders = {
        origin,
        referer: candidateRoot,
        'user-agent': reference.headers['user-agent'] || 'Noctra-Media-Client/87'
      };
      // V108 : un résolveur OHA peut répondre « succès » tout en retournant une
      // ressource non HLS / déjà morte. On valide le début réel de la playlist
      // avant de présenter ce serveur comme lecteur natif au navigateur.
      const validated = await validateWiTvHlsStream(streamUrl.toString(), nativeHeaders, 8_000, attemptSignal, true);
      const streamToken = issueTvReference(validated.url, {
        ...nativeHeaders,
        ...(validated.cookie ? { cookie: validated.cookie } : {})
      }, { kind: 'oha-native', provider: 'OHA', forceHls: true });
      return {
        label: candidate.label || `Serveur ${index + 1}`,
        streamUrl: tvPublicStreamUrl(streamToken),
        playbackType: 'stream',
        native: true,
        verified: true,
        serverIndex: index
      };
    }));
  } catch (error) {
    const failures = error?.errors || [error];
    throw failures.find(item => [451, 501, 503].includes(Number(item?.status)))
      || failures[0] || new HttpError(502, `Serveur OHA ${index + 1} indisponible.`);
  } finally { controller.abort(); }
}

async function firstSuccessfulOhaCandidate(reference, candidates, signal = null) {
  if (!candidates.length) throw new AggregateError([], 'Aucun serveur OHA disponible');
  // V70 : on privilégie la réactivité. Deux serveurs partent immédiatement,
  // les suivants sont échelonnés. Au bout de quelques secondes le client peut
  // utiliser le lecteur web OHA au lieu de rester bloqué sur un spinner.
  return new Promise((resolve, reject) => {
    let settled = false;
    let completed = 0;
    const failures = [];
    const finishFailure = () => {
      if (!settled && completed >= candidates.length) {
        settled = true;
        reject(new AggregateError(failures, 'Aucun serveur OHA disponible'));
      }
    };
    candidates.forEach((candidate, index) => {
      const launchDelay = index < 2 ? 0 : (index - 1) * 350;
      setTimeout(() => {
        if (settled) return;
        if (signal?.aborted) { completed += 1; failures.push(signal.reason); finishFailure(); return; }
        resolveSingleOhaCandidate(reference, candidate, index, 22_000, signal).then(value => {
          if (settled) return;
          settled = true;
          resolve(value);
        }).catch(error => {
          failures.push(error);
          completed += 1;
          finishFailure();
        });
      }, launchDelay);
    });
  });
}

async function resolveOhaStreamReference(token, preferredIndex = null) {
  const state = decodeTvStateReference(token, 'oha');
  const stored = tvReferences.get(String(token || ''));
  const reference = state ? {
    url: state.candidates?.[0]?.url || state.root,
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36' },
    meta: { kind: 'oha', root: state.root, fallbackUrl: state.fallbackUrl || '', routeCandidates: state.routeCandidates || [], channelId: state.channelId || '', channelName: state.channelName || '', candidates: state.candidates || [] },
    expiresAt: Number.MAX_SAFE_INTEGER
  } : (stored && stored.expiresAt > Date.now() ? stored : null);
  if (!reference) throw new HttpError(410, 'Cette chaîne OHA a expiré. Recharge la source TV.');
  if (reference.meta?.kind !== 'oha' || !Array.isArray(reference.meta.candidates) || !reference.meta.candidates.length) throw new HttpError(403, 'Référence OHA invalide.');
  const candidates = reference.meta.candidates;
  const resolverPath = publicPath(`/api/tv/oha/resolve/${encodeURIComponent(String(token || ''))}`);
  const serverChoices = candidates.map((candidate, index) => ({
    index,
    label: candidate.label || `Serveur ${index + 1}`,
    resolveUrl: `${resolverPath}?server=${index}`,
    playbackType: 'resolver'
  }));
  let preferredFailure = '';
  // Le flux natif ne doit pas attendre les sondes HTML des miroirs : les SPA
  // renvoient souvent HTTP 200 même pour une fausse route. L'embed n'est chargé
  // que s'il est utilisé et conserve l'ID du serveur effectivement sélectionné.
  const nativeController = new AbortController();
  const nativeDeadline = setTimeout(() => nativeController.abort(), 24_000);
  let nativeAttempt = null;
  try {
    nativeAttempt = await (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < candidates.length
      ? resolveSingleOhaCandidate(reference, candidates[preferredIndex], preferredIndex, 22_000, nativeController.signal)
      : firstSuccessfulOhaCandidate(reference, candidates, nativeController.signal));
  } catch (error) {
    preferredFailure = cleanError(error);
  } finally {
    clearTimeout(nativeDeadline);
    nativeController.abort(); // Annule les sondes concurrentes dès qu'un flux est prêt.
  }
  const selectedIndex = Number.isInteger(preferredIndex) && candidates[preferredIndex]
    ? preferredIndex : Number(nativeAttempt?.serverIndex ?? 0);
  const selectedChannelId = candidates[selectedIndex]?.channelId || reference.meta.channelId || '';
  const officialRoot = reference.meta.root;
  const externalUrl = ohaOfficialPageCandidates(officialRoot, selectedChannelId, reference.meta.fallbackUrl, reference.meta.routeCandidates)[0];
  // La route officielle est conservée comme secours sans la charger en avance.
  // Le catalogue conserve sa référence stateless, mais le lecteur reçoit
  // au clic un jeton opaque aléatoire. L'iframe OHA est sandboxée avec une
  // origine `null`; ses scripts/fetch ne peuvent donc pas compter sur le cookie
  // HttpOnly Noctra. Ce token limité à OHA autorise uniquement les trois routes
  // de bridge et évite que les assets/API officiels tombent en 401 avant même
  // que le client OHA puisse résoudre la vidéo.
  const bridgeToken = issueTvReference(externalUrl, {}, {
    kind: 'oha-bridge',
    root: officialRoot,
    fallbackUrl: externalUrl,
    routeCandidates: reference.meta.routeCandidates || [],
    candidates,
    channelId: selectedChannelId,
    channelName: reference.meta.channelName || ''
  });
  const bridgeReference = { ...reference, meta: { ...reference.meta, kind: 'oha-bridge', root: officialRoot, fallbackUrl: externalUrl } };
  const bridge = ohaWebFallbackOption(bridgeReference, bridgeToken);
  if (!bridge) throw new HttpError(502, 'Le lecteur officiel OHA est indisponible pour cette chaîne.');
  bridge.manualOnly = true;

  if (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < candidates.length) {
    if (nativeAttempt) return { externalUrl, options: [nativeAttempt, bridge], serverChoices, activeServer: preferredIndex, embeds: [] };
    throw new HttpError(502, 'Ce serveur OHA ne fournit pas de flux HLS vérifiable. Essaie un autre serveur ou ouvre manuellement le lecteur officiel.');
  }

  // Le bridge conserve les signatures du client officiel, mais n'est plus
  // lancé automatiquement pour masquer un échec du résolveur natif.
  return {
    externalUrl,
    options: nativeAttempt ? [nativeAttempt, bridge] : [bridge],
    serverChoices,
    activeServer: nativeAttempt ? Number(nativeAttempt.serverIndex ?? 0) : null,
    nativeUnavailable: !nativeAttempt,
    warning: nativeAttempt ? '' : 'Aucun HLS OHA vérifiable. Lecteur officiel disponible manuellement.',
    fallback: false,
    embeds: []
  };
}

function ohaCatalogPublicPageUrl(entryGroup, root) {
  const publishedRoutes = ohaPublicRouteCandidates(entryGroup, root);
  if (publishedRoutes.length) return publishedRoutes[0];
  const channelId = String(entryGroup?.id || '').trim();
  if (/^[a-f0-9]{18,64}$/i.test(channelId)) {
    return new URL(`/watch?live=${encodeURIComponent(channelId)}`, root).toString();
  }
  return new URL('/live', root).toString();
}

function buildOhaCatalog(rawItems, root, cacheKey, options = {}) {
  const grouped = new Map();
  rawItems.forEach(item => {
    if (!item?.url || !item?.ids?.id) return;
    const name = cleanOhaChannelName(item.name);
    const key = ohaChannelIdentity(name);
    if (!key) return;
    const current = grouped.get(key) || { name, entries: [], logo: '', epg: [], group: item.group || 'France', id: String(item.ids.id) };
    // Les variantes BACKUP / LIVE DURING EVENTS ONLY sont des serveurs de la
    // même chaîne. Le libellé le plus court reste celui affiché à l'écran.
    if (name.length < current.name.length) current.name = name;
    if (!current.entries.some(entry => entry.url === item.url)) current.entries.push(item);
    if (!current.logo && item.logo) current.logo = item.logo;
    if ((!current.epg || !current.epg.length) && Array.isArray(item.epg)) current.epg = item.epg;
    grouped.set(key, current);
  });
  const channels = [...grouped.values()].map((item, index) => {
    // V122 : privilégier la vraie URL publique renvoyée par le catalogue OHA.
    // ids.id n'est pas toujours le hash utilisé par /watch?live=..., ce qui
    // expliquait les NOT FOUND (notamment DAZN 1). On ne fabrique cette route
    // qu'avec un identifiant qui ressemble réellement au hash public OHA.
    const routeCandidates = ohaPublicRouteCandidates(item, root);
    const externalUrl = ohaCatalogPublicPageUrl(item, root);
    const reference = issueOhaResolverReference(item.entries, root, externalUrl, item.id, item.name, routeCandidates);
    const programme = ohaProgramme(item.epg);
    return {
      id: `oha-${createHash('sha1').update(item.name).digest('hex').slice(0, 12)}`,
      name: item.name,
      logo: tvPublicImageUrl(item.logo),
      group: item.group === 'France Sport' ? 'Sports France' : 'France',
      country: 'France',
      category: item.group === 'France Sport' ? 'Sport' : 'TV',
      provider: 'OHA',
      description: `${item.entries.length} serveur${item.entries.length > 1 ? 's' : ''} public${item.entries.length > 1 ? 's' : ''}`,
      now: programme.now,
      next: programme.next,
      guideProvider: item.epg?.length ? 'OHA' : '',
      resolverUrl: `/api/tv/oha/resolve/${reference}`,
      externalUrl,
      publicRouteSource: routeCandidates.length ? 'catalogue' : 'live-fallback',
      publicRouteCandidates: routeCandidates.length,
      playbackType: 'resolver',
      isLive: true,
      streamKind: 'TV en direct · OHA',
      serverCount: item.entries.length,
      sortIndex: index
    };
  }).sort((left, right) => left.name.localeCompare(right.name, 'fr', { sensitivity: 'base', numeric: true }));
  const value = {
    name: 'OHA',
    sourceType: 'oha',
    groups: [],
    channels,
    count: channels.length,
    nativePlayback: true,
    progressive: Boolean(options.progressive),
    warning: options.warning || ''
  };
  tvCatalogCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, value });
  return value;
}

async function tvCatalogFromOha(rootValue = 'https://kool.ws/live') {
  const root = safeTvRemoteUrl(rootValue).toString();
  const cacheKey = `oha::native::${root}`;
  const cached = tvCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const staleValue = cached?.value || null;

  const firstPageState = Array(ohaPublicGroups.length).fill(null);
  const firstPages = ohaPublicGroups.map((group, index) =>
    ohaCatalogPage(root, group, null, 8_500).then(
      value => { firstPageState[index] = { status: 'fulfilled', value }; return { index, value }; },
      reason => { firstPageState[index] = { status: 'rejected', reason }; throw reason; }
    )
  );

  try {
    await Promise.any(firstPages);
  } catch {
    if (staleValue?.channels?.length) {
      return { ...staleValue, progressive: true, stale: true, warning: 'OHA répond lentement : dernier catalogue connu affiché pendant la reconnexion.' };
    }
    throw new HttpError(502, 'Le catalogue public OHA France est temporairement indisponible.');
  }

  await Promise.race([Promise.allSettled(firstPages), delay(300)]);
  const initialItems = firstPageState.flatMap(state => state?.status === 'fulfilled' ? state.value.items : []);
  const effectiveRoot = firstPageState.find(state => state?.status === 'fulfilled' && state.value.root)?.value.root || root;
  const hasMore = firstPageState.some(state => state === null || (state?.status === 'fulfilled' && state.value.nextCursor !== null));
  const failedGroups = firstPageState.map((state, index) => state?.status === 'rejected' ? ohaPublicGroups[index] : '').filter(Boolean);
  const initialValue = buildOhaCatalog(initialItems, effectiveRoot, cacheKey, {
    progressive: hasMore,
    warning: failedGroups.length ? `Catalogue partiel : ${failedGroups.join(', ')} en reconnexion.` : ''
  });

  if (hasMore || failedGroups.length) {
    void Promise.allSettled(firstPages).then(() => Promise.allSettled(ohaPublicGroups.map(async (group, index) => {
      const state = firstPageState[index];
      if (state?.status === 'fulfilled') {
        const firstItems = state.value.items || [];
        if (state.value.nextCursor === null || !firstItems.length) return firstItems;
        const rest = await ohaCatalogGroup(root, group, state.value.nextCursor, 4);
        return [...firstItems, ...rest];
      }
      // Si le premier essai de ce groupe a échoué, on lui donne une seconde
      // chance complète une fois les premières requêtes réellement terminées.
      return ohaCatalogGroup(root, group, null, 5);
    }))).then(results => {
      const latest = tvCatalogCache.get(cacheKey);
      if (latest?.value !== initialValue) return;
      const merged = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      if (!merged.length) return;
      const failures = results.map((result, index) => result.status === 'rejected' ? ohaPublicGroups[index] : '').filter(Boolean);
      buildOhaCatalog(merged, effectiveRoot, cacheKey, {
        progressive: false,
        warning: failures.length ? `Catalogue partiel : ${failures.join(', ')} indisponible.` : ''
      });
    }).catch(() => undefined);
  }

  return initialValue;
}

function parseDelimitedTvCatalog(text, baseUrl) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const separator = lines.some(line => line.includes('\t')) ? '\t' : lines.some(line => line.includes(';')) ? ';' : ',';
  const split = line => line.split(separator).map(value => value.trim().replace(/^"|"$/g, ''));
  const first = split(lines[0]).map(normalizedIdentifier);
  const hasHeader = first.some(value => /^(name|nom|title|channel|chaine|url|link|stream|logo|image|group|groupe|category)$/.test(value));
  const header = hasHeader ? first : [];
  return lines.slice(hasHeader ? 1 : 0).map((line, index) => {
    const columns = split(line);
    const record = {};
    if (header.length) header.forEach((key, columnIndex) => { record[key] = columns[columnIndex] || ''; });
    else {
      const urlIndex = columns.findIndex(value => /^https?:\/\//i.test(value));
      record.name = columns[0] || `Chaîne ${index + 1}`;
      record.url = urlIndex >= 0 ? columns[urlIndex] : columns[1];
      record.logo = columns.find((value, columnIndex) => columnIndex !== urlIndex && /\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.test(value)) || '';
      record.group = columns.find((value, columnIndex) => columnIndex > 0 && columnIndex !== urlIndex && value !== record.logo) || 'Chaînes';
    }
    return normalizeTvChannel({
      name: record.name || record.nom || record.title || record.channel || record.chaine,
      url: record.url || record.link || record.stream,
      logo: record.logo || record.image,
      group: record.group || record.groupe || record.category
    }, baseUrl);
  }).filter(Boolean);
}

function parseJsonTvCatalog(payload, baseUrl, sourceType = 'auto') {
  if (sourceType === 'livewatch') return parseLiveWatchCatalog(payload, baseUrl);
  const groups = [];
  const nestedChannels = [];
  const visitGroups = (values, parentName = '', inherited = {}, depth = 0) => {
    if (!Array.isArray(values) || depth > 5) return;
    values.forEach((group, index) => {
      if (!group || typeof group !== 'object') return;
      const groupName = String(group.name || group.title || parentName || `Groupe ${index + 1}`).trim();
      const headers = {
        referer: group.referer || group.referrer || inherited.referer || '',
        userAgent: group.userAgent || group['user-agent'] || inherited.userAgent || ''
      };
      const stations = group.stations || group.channels || group.items;
      if (Array.isArray(stations)) {
        stations.forEach(station => {
          const channel = normalizeTvChannel({ ...station, group: station?.group || groupName, referer: station?.referer || headers.referer, userAgent: station?.userAgent || headers.userAgent }, baseUrl, groupName);
          if (channel) nestedChannels.push(channel);
        });
      }
      if (group.url) {
        try {
          const url = resolveTvUrl(group.url, baseUrl);
          groups.push({
            id: `${depth}-${index}-${createHash('sha1').update(url).digest('hex').slice(0, 8)}`,
            name: groupName,
            image: String(group.image || group.logo || ''),
            ref: issueTvReference(url, { referer: headers.referer, 'user-agent': headers.userAgent }, { kind: 'tv-catalog', name: groupName })
          });
        } catch {}
      }
      visitGroups(group.groups || group.categories, groupName, headers, depth + 1);
    });
  };
  visitGroups(payload?.groups || payload?.categories);
  const rawChannels = Array.isArray(payload)
    ? payload
    : payload?.stations || payload?.channels || payload?.items || payload?.streams || payload?.results || [];
  let channels = Array.isArray(rawChannels)
    ? rawChannels.map(item => normalizeTvChannel(item, baseUrl, payload?.name || 'Chaînes')).filter(Boolean)
    : [];
  channels = [...channels, ...nestedChannels];
  if (!channels.length) channels = parseLiveWatchCatalog(payload, baseUrl).channels;
  return { groups, channels, name: payload?.name || payload?.title || '' };
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '').trim();
}

function xmlTvDate(value) {
  const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00', offset = '+0000'] = match;
  const sign = offset.startsWith('-') ? -1 : 1;
  const offsetMinutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)));
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - offsetMinutes * 60_000;
}

function xmlTvAttribute(attrsValue, nameValue) {
  const name = String(nameValue || '').replace(/[^a-z0-9_-]/gi, '');
  if (!name) return '';
  const match = String(attrsValue || '').match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return decodeXmlText(match?.[2] || '');
}

function registerXmlTvChannel(aliases, attrs, body) {
  const id = xmlTvAttribute(attrs, 'id');
  if (!id) return;
  const values = [id];
  for (const match of String(body || '').matchAll(/<display-name\b[^>]*>([\s\S]*?)<\/display-name>/gi)) {
    const name = decodeXmlText(match[1]).replace(/\s+/g, ' ').trim();
    if (name && !values.includes(name)) values.push(name);
  }
  aliases.set(id, values);
}

function registerXmlTvProgramme(byChannel, attrs, body, now = Date.now()) {
  const channel = xmlTvAttribute(attrs, 'channel');
  const start = xmlTvDate(xmlTvAttribute(attrs, 'start'));
  const stop = xmlTvDate(xmlTvAttribute(attrs, 'stop'));
  const title = decodeXmlText(String(body || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const description = decodeXmlText(String(body || '').match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/i)?.[1]);
  if (!channel || !start || !title || (stop && stop < now - 60_000) || start > now + 12 * 60 * 60_000) return;
  const list = byChannel.get(channel) || [];
  list.push({ title, description, start, stop: stop || start + 60 * 60_000 });
  byChannel.set(channel, list);
  byChannel.set(normalizedIdentifier(channel), list);
}

function finalizeXmlTvGuide(byChannel, aliases) {
  for (const [id, values] of aliases) {
    const list = byChannel.get(id) || byChannel.get(normalizedIdentifier(id));
    if (!list?.length) continue;
    for (const value of values) {
      byChannel.set(value, list);
      byChannel.set(normalizedIdentifier(value), list);
    }
  }
  for (const list of new Set(byChannel.values())) list.sort((left, right) => left.start - right.start);
  return byChannel;
}

function parseXmlTvNowNext(xml) {
  const text = String(xml || '');
  const aliases = new Map();
  const byChannel = new Map();
  for (const match of text.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi)) registerXmlTvChannel(aliases, match[1], match[2]);
  for (const match of text.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi)) registerXmlTvProgramme(byChannel, match[1], match[2]);
  return finalizeXmlTvGuide(byChannel, aliases);
}

async function parseXmlTvNowNextStream(stream) {
  const aliases = new Map();
  const byChannel = new Map();
  let buffer = '';
  let decodedBytes = 0;
  for await (const chunk of stream) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    decodedBytes += Buffer.byteLength(text, 'utf8');
    if (decodedBytes > 120 * 1024 * 1024) throw new HttpError(413, 'Le guide TV décompressé est trop volumineux.');
    buffer += text;
    while (buffer) {
      const channelIndex = buffer.search(/<channel\b/i);
      const programmeIndex = buffer.search(/<programme\b/i);
      const starts = [channelIndex, programmeIndex].filter(index => index >= 0);
      if (!starts.length) {
        if (buffer.length > 2048) buffer = buffer.slice(-1024);
        break;
      }
      const start = Math.min(...starts);
      if (start > 0) buffer = buffer.slice(start);
      const isChannel = /^<channel\b/i.test(buffer);
      const close = isChannel ? '</channel>' : '</programme>';
      const end = buffer.toLowerCase().indexOf(close);
      if (end < 0) break;
      const block = buffer.slice(0, end + close.length);
      const openEnd = block.indexOf('>');
      if (openEnd > 0) {
        const attrs = block.slice(0, openEnd + 1);
        const body = block.slice(openEnd + 1, -close.length);
        if (isChannel) registerXmlTvChannel(aliases, attrs, body);
        else registerXmlTvProgramme(byChannel, attrs, body);
      }
      buffer = buffer.slice(end + close.length);
    }
  }
  return finalizeXmlTvGuide(byChannel, aliases);
}

async function tvEpg(urlValue) {
  const url = optionalTvRemoteUrl(urlValue);
  if (!url) return new Map();
  const cached = tvEpgCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (tvEpgPromises.has(url)) return tvEpgPromises.get(url);
  const promise = (async () => {
    const response = await fetchTvRemote(url, {
      signal: AbortSignal.timeout(35_000),
      headers: { accept: 'application/gzip, application/xml, text/xml, text/plain, */*', 'user-agent': 'Noctra-Media-Client/194' }
    });
    if (!response.ok) throw new HttpError(response.status, `Guide TV indisponible (${response.status}).`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 32 * 1024 * 1024) throw new HttpError(413, 'Le guide TV compressé est trop volumineux.');
    if (!response.body) return new Map();
    const input = Readable.fromWeb(response.body);
    const contentType = String(response.headers.get('content-type') || '');
    const stream = /\.gz(?:$|[?#])/i.test(url) || /(?:gzip|x-gzip)/i.test(contentType)
      ? input.pipe(createGunzip())
      : input;
    const value = await parseXmlTvNowNextStream(stream);
    tvEpgCache.set(url, { expiresAt: Date.now() + 2 * 60 * 60_000, value });
    return value;
  })().finally(() => tvEpgPromises.delete(url));
  tvEpgPromises.set(url, promise);
  return promise;
}

function decorateTvEpg(channels, guide) {
  const now = Date.now();
  return channels.map(channel => {
    const cleanedName = String(channel.name || '')
      .replace(/\s*(?:\((?:backup|secours)\)|\[(?:live during events only|events only|backup|secours)\])\s*$/i, '')
      .replace(/\b(?:UHD|FHD|FULL HD|HD|SD|4K)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const keys = [channel.epgId, channel.iptvOrgId, channel.name, cleanedName].filter(Boolean);
    let programmes = [];
    for (const key of keys) {
      const normalized = normalizedIdentifier(key);
      const pluralSports = normalized.replace(/\bbein sport\b/g, 'bein sports');
      programmes = guide.get(key) || guide.get(normalized) || guide.get(pluralSports) || [];
      if (programmes.length) break;
    }
    const current = programmes.find(item => item.start <= now && item.stop > now) || null;
    const next = programmes.find(item => item.start > now) || null;
    return {
      ...channel,
      now: channel.now || current,
      next: channel.next || next,
      guideProvider: channel.guideProvider || (current || next ? 'XML TV Fr' : '')
    };
  });
}

async function decorateTvCatalogWithDefaultGuide(catalog, explicitUrl = '') {
  const channels = Array.isArray(catalog?.channels) ? catalog.channels : [];
  if (!channels.length) return catalog;
  const epgCandidate = explicitUrl || String(process.env.TV_EPG_URL || '').trim() || defaultTvEpgUrl;
  if (!epgCandidate) return catalog;
  let guide;
  try { guide = await tvEpg(epgCandidate); } catch { return catalog; }
  if (!guide?.size) return catalog;
  return { ...catalog, channels: decorateTvEpg(channels, guide), epgUrl: epgCandidate, guideAvailable: true };
}

async function tvCatalogFromUrl(urlValue, displayName = '', options = {}) {
  const { text, finalUrl, contentType } = await fetchTvCatalog(urlValue);
  const trimmed = text.trim();
  if (looksLikeHtml(trimmed, contentType)) {
    throw new HttpError(422, 'Cette adresse renvoie une page HTML et non une playlist/API TV. Utilise l’URL M3U, JSON ou API documentée, pas la page du site.');
  }
  let groups = [];
  let channels = [];
  let name = displayName;
  let detectedEpgUrl = '';
  const sourceType = normalizeTvSourceType(options.type);
  if (/^[\[{]/.test(trimmed) || /json/i.test(contentType) || sourceType === 'json' || sourceType === 'livewatch') {
    try {
      const parsed = parseJsonTvCatalog(JSON.parse(trimmed), finalUrl, sourceType);
      groups = parsed.groups;
      channels = parsed.channels;
      name = parsed.name || name;
    } catch (error) {
      if (sourceType === 'json' || sourceType === 'livewatch') throw new HttpError(422, `Le catalogue JSON n’est pas exploitable : ${cleanError(error)}`);
    }
  }
  if (!groups.length && !channels.length && /#EXTM3U|#EXTINF/i.test(trimmed)) {
    const parsed = parseM3uCatalog(trimmed, finalUrl);
    channels = parsed.channels;
    detectedEpgUrl = parsed.epgUrl || '';
  }
  if (!groups.length && !channels.length && sourceType !== 'livewatch') channels = parseDelimitedTvCatalog(trimmed, finalUrl);
  const epgUrl = options.epgUrl || detectedEpgUrl;
  if (channels.length && epgUrl) {
    const guide = await tvEpg(epgUrl).catch(() => new Map());
    if (guide.size) channels = decorateTvEpg(channels, guide);
  }
  const channelLimit = Math.max(1, Math.min(12_000, Number(options.channelLimit) || 2_500));
  return {
    name: name || 'Télévision',
    sourceUrl: finalUrl,
    sourceType,
    epgUrl: epgUrl || null,
    groups,
    channels: channels.slice(0, channelLimit),
    count: channels.length,
    warning: !groups.length && !channels.length ? 'Aucune chaîne exploitable n’a été trouvée dans cette source.' : ''
  };
}


async function liveWatchCatalogFromPublicUrl(urlValue, name = 'LiveWatch') {
  return tvCatalogFromUrl(urlValue, name, { type: 'livewatch', channelLimit: 5000 });
}

function mergeTvCatalogChannels(catalogs, providerLabel = 'LiveWatch') {
  const map = new Map();
  for (const catalog of catalogs) {
    for (const channel of catalog?.channels || []) {
      const key = normalizedIdentifier(`${channel.name || ''}|${channel.eventId || ''}|${channel.embedUrl || channel.externalUrl || ''}`);
      if (!key || map.has(key)) continue;
      map.set(key, { ...channel, provider: providerLabel });
    }
  }
  return [...map.values()];
}

async function tvCatalogFromJackTvWithFallback() {
  const primary = await liveWatchCatalogFromPublicUrl('https://livewatch.top/api/v1/public/jacktv/matches', 'JackTV');
  if (primary.channels?.length) return primary;
  const football = await liveWatchCatalogFromPublicUrl('https://livewatch.top/api/v1/public/football', 'Football Live').catch(() => ({ channels: [] }));
  const channels = (football.channels || []).map(channel => ({
    ...channel,
    description: [channel.description, 'Secours Football Live · JackTV ne publie actuellement aucun match'].filter(Boolean).join(' · ')
  }));
  return {
    ...primary,
    name: 'JackTV',
    channels,
    count: channels.length,
    warning: channels.length
      ? 'JackTV ne publie actuellement aucun match : Noctra affiche temporairement les matchs Football Live officiels.'
      : 'JackTV ne publie actuellement aucun match sur son endpoint officiel.'
  };
}

async function tvCatalogFromDailyWithFallback() {
  const primary = await liveWatchCatalogFromPublicUrl('https://livewatch.top/api/v1/public/sports/daily', 'Matchs du jour');
  if (primary.channels?.length) return primary;
  const [sports, football] = await Promise.all([
    liveWatchCatalogFromPublicUrl('https://livewatch.top/api/v1/public/sports', 'Sports').catch(() => ({ channels: [] })),
    liveWatchCatalogFromPublicUrl('https://livewatch.top/api/v1/public/football', 'Football Live').catch(() => ({ channels: [] }))
  ]);
  const channels = mergeTvCatalogChannels([sports, football], 'LiveWatch').map(channel => ({
    ...channel,
    description: [channel.description, 'Matchs du jour · sélection LiveWatch'].filter(Boolean).join(' · ')
  }));
  return {
    ...primary,
    name: 'Matchs du jour',
    channels,
    count: channels.length,
    warning: channels.length
      ? 'Le bandeau Matchs du jour est vide : Noctra affiche les événements Sports/Football Live actuellement publiés par LiveWatch.'
      : 'Aucun match n’est actuellement publié par LiveWatch.'
  };
}

async function tvCatalogBySource(sourceId, options = {}) {
  const source = (await tvSources()).find(item => item.id === sourceId);
  if (!source) throw new HttpError(404, 'Source TV introuvable.');
  const publicSource = { id: source.id, name: source.name, type: source.type, epgUrl: source.epgUrl, section: tvSourceSection(source), description: source.description || '', provider: source.provider || '', editable: source.editable };
  if (source.type === 'portal') {
    const channel = normalizeTvChannel({ name: source.name, embed_url: source.url, group: 'Portail web', provider: source.provider || source.name, description: source.description || 'Portail web personnel' }, source.url, 'Portail web');
    if (channel) { channel.externalUrl = source.url; channel.streamKind = 'Portail web'; }
    return decorateTvCatalogImages({ source: publicSource, name: source.name, sourceType: 'portal', groups: [], channels: channel ? [channel] : [], count: channel ? 1 : 0, warning: source.provider === 'BowdTV' ? 'BowdTV interdit son affichage intégré. Utilisez Ouvrir BowdTV pour accéder au guide France sur son site.' : (channel ? '' : 'Ce portail ne peut pas être intégré.') });
  }
  let catalog;
  if (source.type === 'additional') catalog = await additionalTv.catalog(source.family);
  else if (source.id === 'livewatch-curated') catalog = await tvCatalogFromLiveWatchCurated();
  else if (source.id === 'livewatch-jacktv') catalog = await tvCatalogFromJackTvWithFallback();
  else if (source.id === 'livewatch-daily') catalog = await tvCatalogFromDailyWithFallback();
  else if (source.type === 'fstv') catalog = await tvCatalogFromFstv(source.url);
  else if (source.type === 'witv') catalog = await tvCatalogFromWiTv(source.url);
  else if (source.type === 'oha') catalog = await tvCatalogFromOha(source.url);
  else if (['daddylive', 'brigitte'].includes(source.type)) catalog = await tvCatalogFromSportsPage(source);
  else if (source.type === 'dlstreams') catalog = await tvCatalogFromDlStreams(source.url);
  else if (source.id === 'streamsports99-live-tv') catalog = await tvCatalogFromStreamSports99LiveTv(source.url);
  else if (source.type === 'streamsports99') catalog = await tvCatalogFromStreamSports99(source.url);
  else if (source.type === 'streamed') catalog = await tvCatalogFromStreamed(source.url);
  else if (source.type === 'volkamax') catalog = await tvCatalogFromVolkamax(source.url);
  else if (source.type === 'alternative') catalog = await tvCatalogFromAlternative(source.url);
  else catalog = await tvCatalogFromUrl(source.url, source.name, {
    type: source.type,
    epgUrl: source.epgUrl,
    // FrameTV publie plus de 9 000 chaînes classées par pays. La limite
    // générique à 2 500 coupait le catalogue avant la France.
    channelLimit: ['frame', 'daddy'].includes(source.family) ? 12_000 : 2_500
  });
  if (source.id === 'livewatch-daddy') {
    const channels = (catalog.channels || []).filter(channel => /^(?:France|FR|FRA)$/i.test(String(channel.country || '').trim()));
    catalog = { ...catalog, channels, count: channels.length, groups: [] };
  }
  if (source.type === 'livewatch' && source.family) {
    // V113 : DaddyTV / NorthTV / FrameTV restent des fournisseurs distincts
    // dans les cartes et le lecteur, même si l'API qui les publie est LiveWatch.
    catalog = {
      ...catalog,
      name: source.name,
      channels: (catalog.channels || []).map(channel => ({ ...channel, provider: source.name }))
    };
  }
  if (source.type === 'livewatch' && Array.isArray(catalog.channels) && catalog.channels.length) {
    const groupedChannels = collapseLiveWatchLogicalChannels(catalog.channels);
    catalog = { ...catalog, channels: groupedChannels, count: groupedChannels.length };
  }
  // The initial Bowd catalogue must not wait on unrelated logo/EPG services.
  // Existing logo refresh remains available through the standard explicit path.
  if(source.family==='bowd' && !options.logoRefresh) {
    return {source:publicSource,...catalog,channels:sortTvChannelsAlphabetically(catalog.channels||[],source)};
  }
  if (Array.isArray(catalog.channels) && catalog.channels.length) {
    const preferOfficialLogo = ['livewatch', 'witv', 'oha'].includes(source.type) || options.logoRefresh;
    const enriched = await enrichTvLogosFromIptvOrg(
      catalog.channels,
      preferOfficialLogo,
      Boolean(options.logoRefresh)
    ).catch(() => catalog.channels);
    catalog = {
      ...catalog,
      channels: shareTvLogosAcrossDuplicateNames(enriched),
      count: enriched.length,
      logosReady: iptvOrgLogoCache.schemaVersion >= tvLogoIndexSchemaVersion
    };
  }
  catalog = await decorateTvCatalogWithDefaultGuide(catalog, source.epgUrl);
  if (source.type === 'livewatch') catalog = await decorateLiveWatchVipPlayback(catalog, source);
  if (Array.isArray(catalog.channels) && catalog.channels.length) {
    const sortedChannels = sortTvChannelsAlphabetically(catalog.channels, source);
    catalog = {
      ...catalog,
      channels: sortedChannels,
      count: sortedChannels.length
    };
  }
  catalog = decorateTvCatalogImages(catalog);
  return { source: publicSource, ...catalog };
}

async function tvCatalogByReference(token) {
  const reference = tvReferences.get(String(token || ''));
  if (!reference || reference.expiresAt <= Date.now()) throw new HttpError(410, 'Ce groupe TV a expiré. Recharge la source.');
  const catalog = reference.meta?.kind === 'additional-group'
    ? await additionalTv.group(reference.meta)
    : await tvCatalogFromUrl(reference.url, 'Chaînes');
  return decorateTvCatalogImages(catalog);
}

function mergeTvCookieHeaders(currentValue = '', receivedValue = '') {
  const cookies = new Map();
  for (const chunk of `${currentValue}; ${receivedValue}`.split(';')) {
    const part = chunk.trim();
    const equals = part.indexOf('=');
    if (equals <= 0) continue;
    const name = part.slice(0, equals).trim();
    const value = part.slice(equals + 1).trim();
    if (name) cookies.set(name, value);
  }
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function tvChildReferenceHeaders(inheritedHeaders, parentUrl, childUrl) {
  const headers = { ...inheritedHeaders };
  try {
    const parent = new URL(parentUrl);
    const child = new URL(childUrl);
    if (parent.origin !== child.origin) {
      // Ne jamais faire fuiter le bearer/cookie LiveWatch vers un CDN tiers.
      delete headers.authorization;
      delete headers.cookie;
      delete headers['x-access-key'];
      delete headers.apikey;
    }
  } catch {
    delete headers.authorization;
    delete headers.cookie;
  }
  return headers;
}

function issueStableProviderChildReference(urlValue, headers = {}, providerValue = '', forceHls = false) {
  const provider = String(providerValue || '').trim();
  if (!(/^(?:LiveWatch|OHA|WiTV|FSTV|StreamSports99)$/i.test(provider) || /^(?:NorthTV|FrameTV)$/i.test(provider) || /^(?:Movix|Northlive|RénéVéo)$/i.test(provider))) return issueTvReference(urlValue, headers, { forceHls });
  const normalizedHeaders = Object.fromEntries(Object.entries(headers || {})
    .filter(([, value]) => value)
    .map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  const cacheKey = createHash('sha1').update(`${provider.toLowerCase()}\n${urlValue}\n${JSON.stringify(normalizedHeaders)}\n${forceHls}`).digest('hex');
  const cachedToken = tvProviderChildReferenceCache.get(cacheKey);
  const cachedReference = cachedToken ? tvReferences.get(cachedToken) : null;
  if (cachedReference && cachedReference.expiresAt > Date.now()) return cachedToken;
  const token = issueTvReference(urlValue, normalizedHeaders, { kind: 'provider-hls-child', provider, forceHls });
  tvProviderChildReferenceCache.set(cacheKey, token);
  if (tvProviderChildReferenceCache.size > 12_000) {
    for (const [key, value] of tvProviderChildReferenceCache) {
      const reference = tvReferences.get(value);
      if (!reference || reference.expiresAt <= Date.now()) tvProviderChildReferenceCache.delete(key);
      if (tvProviderChildReferenceCache.size <= 8_000) break;
    }
  }
  return token;
}

const tvSegmentCache = createTvSegmentCache();

function warmTvSegments(segments) {
  if (process.env.NOCTRA_TV_PREFETCH === '0' || !segments.length) return;
  // Warm the normal initial live position, not every channel or rendition.
  let distance = 0, start = segments.length - 1;
  for (; start > 0; start--) { distance += segments[start].duration; if (distance >= 12) break; }
  for (const segment of segments.slice(start, start + 2)) {
    const reference = tvReferences.get(segment.token);
    if (!reference || reference.expiresAt <= Date.now()) continue;
    reference.meta = { ...reference.meta, finiteSegment: true };
    // Allow 1.5× the segment duration (6–20 s) for long high-bitrate segments.
    const deadlineMs = Math.min(20_000, Math.max(6_000, Math.round(Number(segment.duration || 0) * 1_500)));
    void tvSegmentCache.prime(segment.token, signal => fetchTvRemoteUntilHeaders(
      safeTvRemoteUrl(reference.url), { headers: { accept: '*/*', ...reference.headers }, signal }, 4_000
    ), { deadlineMs });
  }
}

function issueScopedTvSegmentReference(urlValue, headers, scope, sequence) {
  const url = safeTvRemoteUrl(urlValue);
  // A signed query may rotate between refreshes. HLS identifies a segment by
  // its sequence within this particular playback, not by its current signature.
  const key = createHash('sha256').update(`segment\n${scope}\n${url.origin}${url.pathname}\n${sequence}`).digest('hex');
  const previous = tvProviderChildReferenceCache.get(key);
  const entry = previous && tvReferences.get(previous);
  if (entry && entry.expiresAt > Date.now()) {
    entry.url = url.toString();
    entry.headers = headers;
    return previous;
  }
  const token = issueTvReference(url.toString(), headers, { finiteSegment:true });
  tvProviderChildReferenceCache.set(key, token);
  if (tvProviderChildReferenceCache.size > 12_000) {
    for (const old of tvProviderChildReferenceCache.keys()) {
      tvProviderChildReferenceCache.delete(old);
      if (tvProviderChildReferenceCache.size <= 8_000) break;
    }
  }
  return token;
}

function rewriteTvPlaylist(text, baseUrl, inheritedHeaders = {}, options = {}) {
  if (!/^\s*#EXTM3U(?:\s|$)/i.test(text)) throw new HttpError(415, 'Réponse fournisseur invalide : playlist HLS attendue.');
  const provider = String(options.provider || '');
  const segments = [];
  let segmentDuration = 0;
  let segmentSequence = Number(text.match(/^#EXT-X-MEDIA-SEQUENCE:\s*(\d+)/m)?.[1] || 0);
  let byteRangePlaylist = /#EXT-X-(?:BYTERANGE|PART|PRELOAD-HINT)/i.test(text);
  const canWarm = !/#EXT-X-(?:BYTERANGE|ENDLIST|PART|PRELOAD-HINT)/i.test(text);
  const rewrite = (value, forceHls = false) => {
    let childUrl = resolveTvUrl(value, baseUrl);
    let childHeaders = tvChildReferenceHeaders(inheritedHeaders, baseUrl, childUrl);
    if (/^FSTV$/i.test(provider)) {
      const unwrapped = fstvUnwrappedMediaReference(childUrl, childHeaders);
      childUrl = unwrapped.url;
      childHeaders = unwrapped.headers;
    }
    const scopedSegment = options.referenceScope && segmentDuration > 0 && !forceHls && !byteRangePlaylist;
    const token = scopedSegment
      ? issueScopedTvSegmentReference(childUrl, childHeaders, options.referenceScope, segmentSequence++)
      : issueStableProviderChildReference(childUrl, childHeaders, provider, forceHls);
    if (canWarm && !forceHls && segmentDuration > 0 && /\.(?:ts|m4s|aac)(?:[?#]|$)/i.test(childUrl)) segments.push({ token, duration: segmentDuration });
    return tvPublicStreamUrl(token);
  };
  let nextIsPlaylist = false;
  const output = text.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (!trimmed.startsWith('#')) {
      const result = rewrite(trimmed, nextIsPlaylist);
      nextIsPlaylist = false;
      segmentDuration = 0;
      return result;
    }
    if (/^#EXTINF:/i.test(trimmed)) segmentDuration = Number(trimmed.slice(8).split(',')[0]) || 0;
    if (/^#EXT-X-STREAM-INF:/i.test(trimmed)) nextIsPlaylist = true;
    if (/URI="[^"]+"/.test(line)) {
      const pendingDuration = segmentDuration; segmentDuration = 0;
      const childPlaylist = /^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/i.test(trimmed);
      const rewritten = line.replace(/URI="([^"]+)"/g, (_, value) => `URI="${rewrite(value, childPlaylist)}"`);
      segmentDuration = pendingDuration;
      return rewritten;
    }
    return line;
  }).join('\n');
  warmTvSegments(segments);
  return output;
}

function detectTvImageMime(buffer, declaredType = '') {
  const type = String(declaredType || '').split(';')[0].trim().toLowerCase();
  if (type.startsWith('image/')) return type;
  if (!buffer?.length) return '';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 6 && /^(?:GIF87a|GIF89a)$/.test(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 12 && buffer.subarray(4, 12).toString('ascii').startsWith('ftyp') && /(?:avif|avis)/.test(buffer.subarray(8, 24).toString('ascii'))) return 'image/avif';
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return 'image/x-icon';
  if (buffer.length >= 2 && buffer.subarray(0, 2).toString('ascii') === 'BM') return 'image/bmp';
  const prefix = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(prefix)) return 'image/svg+xml';
  return '';
}

function tvImageReference(tokenValue) {
  const token = String(tokenValue || '');
  if (token.startsWith('s') || token.startsWith('j')) {
    try {
      const payload = token.startsWith('s')
        ? signedTvImagePayload(token)
        : JSON.parse(Buffer.from(token.slice(1), 'base64url').toString('utf8'));
      if (!payload) return null;
      const label = String(payload?.n || '').trim().slice(0, 120);
      const rawUrl = String(payload?.u || '').trim();
      if (!rawUrl) return label ? { url: '', label, fallbackOnly: true, headers: {} } : null;
      const url = safeTvRemoteUrl(rawUrl);
      return {
        url: url.toString(),
        label,
        fallbackOnly: false,
        headers: {
          referer: `${url.origin}/`,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
        }
      };
    } catch {
      return null;
    }
  }
  if (token.startsWith('i')) {
    try {
      const url = safeTvRemoteUrl(Buffer.from(token.slice(1), 'base64url').toString('utf8'));
      return {
        url: url.toString(),
        headers: {
          referer: `${url.origin}/`,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
        }
      };
    } catch {
      return null;
    }
  }
  const reference = tvReferences.get(token);
  return reference && reference.expiresAt > Date.now() ? reference : null;
}

function escapeTvLogoText(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  }[character]));
}

function tvLogoFallbackSvg(labelValue) {
  const label = String(labelValue || 'TV').trim() || 'TV';
  const words = label.replace(/[^\p{L}\p{N}+]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const monogram = (words.length > 1 ? words.slice(0, 3).map(word => word[0]) : [words[0] || 'TV'])
    .join('').slice(0, 4).toLocaleUpperCase('fr-FR');
  const accents = ['#62cdb6', '#79aee2', '#b29ae4', '#e3b66d', '#df8790'];
  const digest = createHash('sha256').update(label).digest();
  const accent = accents[digest[0] % accents.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" role="img" aria-label="${escapeTvLogoText(label)}"><rect width="320" height="180" rx="26" fill="#12171d"/><rect width="10" height="180" rx="5" fill="${accent}"/><text x="165" y="112" fill="#f1f4f7" font-family="Arial,Helvetica,sans-serif" font-size="76" font-weight="700" letter-spacing="0" text-anchor="middle">${escapeTvLogoText(monogram)}</text></svg>`;
  return Buffer.from(svg, 'utf8');
}

function sendTvImage(res, image, contentType, cacheState = 'remote', cacheControl = 'private, max-age=604800, stale-while-revalidate=2592000') {
  res.writeHead(200, {
    'content-type': contentType,
    'content-length': String(image.length),
    'cache-control': cacheControl,
    'cross-origin-resource-policy': 'cross-origin',
    'x-noctra-tv-logo': cacheState
  });
  res.end(image);
}

function sendTvFallbackLogo(res, label) {
  // Un échec amont ponctuel ne doit pas figer le monogramme pendant sept jours.
  sendTvImage(res, tvLogoFallbackSvg(label), 'image/svg+xml; charset=utf-8', 'generated-fallback', 'private, max-age=30, must-revalidate');
}

async function fetchTvLogoAsset(reference, urlValue) {
  const url = safeTvRemoteUrl(urlValue);
  const cacheKey = createHash('sha256').update(url.toString()).digest('hex');
  const cachePath = join(tvLogoCacheRoot, `${cacheKey}.img`);
  const cachedImage = await readFile(cachePath).catch(() => null);
  const cachedType = cachedImage ? detectTvImageMime(cachedImage) : '';
  if (cachedImage?.length && cachedType) {
    return { image: cachedImage, contentType: cachedType, cacheState: 'cache' };
  }
  const existing = tvLogoFetchPromises.get(cacheKey);
  if (existing) return existing;
  const request = (async () => {
    // Une seconde lecture ferme la petite fenêtre entre le premier contrôle et
    // l'enregistrement de la promesse partagée par deux requêtes simultanées.
    const racedImage = await readFile(cachePath).catch(() => null);
    const racedType = racedImage ? detectTvImageMime(racedImage) : '';
    if (racedImage?.length && racedType) return { image: racedImage, contentType: racedType, cacheState: 'cache' };
    const baseHeaders = {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
      'user-agent': reference.headers?.['user-agent'] || 'Mozilla/5.0 Noctra/139'
    };
    let response = await fetchTvRemote(url, {
      headers: { ...baseHeaders, ...(reference.headers?.referer ? { referer: reference.headers.referer } : {}) },
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok && reference.headers?.referer && [401, 403].includes(response.status)) {
      response = await fetchTvRemote(url, { headers: baseHeaders, signal: AbortSignal.timeout(7_000) });
    }
    if (!response.ok) throw new HttpError(response.status, `Logo TV indisponible (${response.status}).`);
    const declaredType = String(response.headers.get('content-type') || '').toLowerCase();
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 5 * 1024 * 1024) throw new HttpError(413, 'Le logo TV est trop volumineux.');
    const image = Buffer.from(await response.arrayBuffer());
    if (image.length > 5 * 1024 * 1024) throw new HttpError(413, 'Le logo TV est trop volumineux.');
    const contentType = detectTvImageMime(image, declaredType);
    if (!contentType) throw new HttpError(415, 'La ressource reçue n’est pas une image reconnue.');
    if (image.length <= 768 * 1024) {
      await mkdir(tvLogoCacheRoot, { recursive: true });
      await writeFile(cachePath, image).catch(() => undefined);
    }
    return { image, contentType, cacheState: 'remote' };
  })();
  tvLogoFetchPromises.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (tvLogoFetchPromises.get(cacheKey) === request) tvLogoFetchPromises.delete(cacheKey);
  }
}

async function proxyTvImage(token, req, res) {
  const reference = tvImageReference(token);
  if (!reference) throw new HttpError(410, 'La référence de ce logo TV n’est plus valide.');
  if (reference.fallbackOnly) return sendTvFallbackLogo(res, reference.label || 'TV');
  try {
    const asset = await fetchTvLogoAsset(reference, reference.url);
    sendTvImage(res, asset.image, asset.contentType, asset.cacheState);
  } catch (error) {
    if (reference.label) return sendTvFallbackLogo(res, reference.label);
    throw error;
  }
}

async function proxyWiTvEmbed(token, res) {
  try {
    const state = decodeTvStateReference(token, 'witv-player');
    const stored = tvReferences.get(String(token || ''));
    const reference = state ? {
      url: safeTvRemoteUrl(state.url).toString(),
      headers: {
        referer: state.referer ? safeTvRemoteUrl(state.referer).toString() : '',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
      }
    } : (stored && stored.expiresAt > Date.now() ? stored : null);
    if (!reference) throw new HttpError(410, 'Le lecteur WiTV a expiré. Recharge la chaîne.');
    if (!isWiTvPublicPlayer(reference.url)) throw new HttpError(403, 'Ce lecteur web ne peut pas être préparé par Noctra.');
    const response = await fetchTvRemote(reference.url, {
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
        'user-agent': reference.headers['user-agent'] || 'Mozilla/5.0 Noctra/75',
        ...(reference.headers.referer ? { referer: reference.headers.referer } : {})
      },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new HttpError(response.status, `Lecteur WiTV indisponible (${response.status}).`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 1024 * 1024) throw new HttpError(413, 'Le lecteur WiTV est trop volumineux.');
    const rawHtml = await response.text();
    if (rawHtml.length > 1024 * 1024) throw new HttpError(413, 'Le lecteur WiTV est trop volumineux.');
    const html = sanitizeWiTvPlayerHtml(rawHtml, response.url || reference.url);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, max-age=60',
      'referrer-policy': 'origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "frame-ancestors 'self'"
    });
    res.end(html);
  } catch (error) {
    sendTvBridgeFailure(res, 'noctra-witv-state', 'WiTV', error);
  }
}

function ohaAllowedHost(value) {
  try { return ['kool.ws', 'www.kool.ws', 'kool.to', 'www.kool.to', '185.254.196.78', '178.83.5.50', 'vavoo.top', 'www.vavoo.top', 'oha.cx', 'www.oha.cx'].includes(new URL(value).hostname.toLowerCase()); }
  catch { return false; }
}

const ohaBridgePages = new Map();
const ohaBridgeCookies = new Map();

function ohaBridgeCookieValue(token) {
  return ohaBridgeCookies.get(String(token || ''))?.value || '';
}

function rememberOhaBridgeCookies(token, response) {
  const received = tvResponseCookieHeader(response);
  if (!received) return ohaBridgeCookieValue(token);
  const key = String(token || '');
  const value = mergeTvCookieHeaders(ohaBridgeCookieValue(key), received);
  ohaBridgeCookies.set(key, { value, updatedAt: Date.now() });
  if (ohaBridgeCookies.size > 800) {
    const oldest = [...ohaBridgeCookies.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt).slice(0, 200);
    oldest.forEach(([entry]) => ohaBridgeCookies.delete(entry));
  }
  return value;
}

function rememberOhaBridgePage(token, pageUrl) {
  try {
    const url = new URL(String(pageUrl || ''));
    if (!ohaAllowedHost(url.toString())) return;
    ohaBridgePages.set(String(token), { pageUrl: url.toString(), origin: url.origin, updatedAt: Date.now() });
    if (ohaBridgePages.size > 800) {
      const oldest = [...ohaBridgePages.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt).slice(0, 200);
      oldest.forEach(([key]) => ohaBridgePages.delete(key));
    }
  } catch {}
}

function sanitizeOhaPlayerHtml(htmlValue, pageUrl, token, targetInfo = {}) {
  const page = new URL(pageUrl);
  const inlineJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
  let html = String(htmlValue || '');
  html = html.replace(/<meta\b[^>]*http-equiv=["']?(?:content-security-policy|x-frame-options)["']?[^>]*>/gi, '');
  const encodedToken = encodeURIComponent(String(token));
  const tunnel = publicPath(`/api/tv/oha/http/${encodedToken}`);
  const siteRoot = publicPath(`/api/tv/oha/site/${encodedToken}`);
  const allowedHosts = ['kool.ws', 'www.kool.ws', 'kool.to', 'www.kool.to', '185.254.196.78', '178.83.5.50', 'vavoo.top', 'www.vavoo.top', 'oha.cx', 'www.oha.cx'];
  const proxiedUrl = value => {
    try {
      const target = new URL(String(value || ''), page);
      if (!allowedHosts.includes(target.hostname.toLowerCase())) return String(value || '');
      if (target.origin === page.origin) return `${siteRoot}${target.pathname}${target.search}`;
      return `${tunnel}?url=${encodeURIComponent(target.toString())}`;
    } catch { return String(value || ''); }
  };
  // Les ressources du domaine OHA gardent leur arborescence sous le proxy :
  // les imports ES modules et les URLs CSS relatives continuent ainsi de se
  // résoudre comme sur le site officiel, même dans le sandbox opaque.
  const stripBridgeIntegrity = tag => String(tag || '')
    .replace(/\s+integrity\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+crossorigin(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
  // Les embeds Daddy/North sont documentés comme des iframes uniquement et
  // peuvent livrer leur <video>/<source> directement dans le HTML initial.
  // Les setters JS injectés plus bas ne voient pas les attributs créés par le
  // parseur HTML : on les réécrit donc aussi côté serveur avant exécution.
  const proxiedMedia = value => {
    try {
      const target = new URL(String(value || ''), page);
      if (['livewatch.top', 'www.livewatch.top'].includes(target.hostname.toLowerCase())) return `${siteRoot}${target.pathname}${target.search}`;
      return `${tunnel}?media=1&url=${encodeURIComponent(target.toString())}`;
    } catch { return String(value || ''); }
  };
  html = html.replace(/(<script\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_, before, value, after) => {
    const target = proxiedUrl(value);
    const tag = `${before}${target}${after}`;
    return target !== String(value || '') ? stripBridgeIntegrity(tag) : tag;
  });
  html = html.replace(/(<link\b[^>]*\bhref\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_, before, value, after) => {
    const target = proxiedUrl(value);
    const tag = `${before}${target}${after}`;
    return target !== String(value || '') ? stripBridgeIntegrity(tag) : tag;
  });
  const siteBase = `${siteRoot}${page.pathname.replace(/[^/]*$/, '')}`;
  const remoteRoute = `${page.pathname || '/'}${page.search || ''}${page.hash || ''}`;
  const bridge = String.raw`<base href="${siteBase.replace(/"/g, '&quot;')}"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{width:100%;min-height:100%;margin:0;background:#000}video{max-width:100%}</style><script>(function(){const T=${inlineJson(tunnel)},S=${inlineJson(siteRoot)},O=${inlineJson(page.toString())},PO=${inlineJson(page.origin)},R=${inlineJson(remoteRoute)},CID=${inlineJson(String(targetInfo?.channelId || ''))},CN=${inlineJson(String(targetInfo?.channelName || ''))},NativeURL=window.URL,NO=new NativeURL(location.href).origin,A=new Set(${inlineJson(allowedHosts)}),F=window.fetch.bind(window),XO=XMLHttpRequest.prototype.open;try{if(R)history.replaceState(history.state,'',R)}catch{};try{window.URL=new Proxy(NativeURL,{construct(Target,args,newTarget){const a=[...args];if(a.length>1&&(String(a[1])==='null'||String(a[1])==='null/'))a[1]=PO;return Reflect.construct(Target,a,newTarget)},apply(Target,thisArg,args){const a=[...args];if(a.length>1&&(String(a[1])==='null'||String(a[1])==='null/'))a[1]=PO;return Reflect.apply(Target,thisArg,a)}})}catch{};const mem=new Map(),store={getItem:k=>mem.has(String(k))?mem.get(String(k)):null,setItem:(k,v)=>mem.set(String(k),String(v)),removeItem:k=>mem.delete(String(k)),clear:()=>mem.clear(),key:i=>Array.from(mem.keys())[i]||null,get length(){return mem.size}};for(const n of ['localStorage','sessionStorage']){try{Object.defineProperty(window,n,{configurable:true,value:store})}catch{}}addEventListener('message',e=>{try{if(e.source!==window&&e.data&&e.data.type==='noctra-oha-state')parent.postMessage(e.data,'*')}catch{}});function mediaLike(u){const x=(u.pathname+u.search).toLowerCase();return /\.(?:m3u8?|mpd|m4s|ts|aac|m4a|mp4|webm|mkv|key)(?:$|[?#&])/.test(x)||/(?:^|\/)(?:hls|dash|manifest|playlist|segments?|chunks?)(?:\/|$|[?._-])/.test(u.pathname.toLowerCase())||/(?:manifest|playlist|m3u8|mpd|segment|chunk|stream)=/.test(u.search.toLowerCase())}function notifyMedia(u,m){if(!/\.(?:m3u8?|mpd|mp4)(?:$|[?#&])/i.test(u.pathname+u.search))return;try{parent.postMessage({type:'noctra-oha-state',state:'media',url:m},'*')}catch{}}function findMedia(v,d=0,k=''){if(d>7||v==null)return'';if(typeof v==='string'){try{const u=new URL(v,O),q=(u.pathname+u.search).toLowerCase();if(/\.(?:m3u8?|mpd|mp4)(?:$|[?#&])/.test(q)||(/(?:hls|manifest|playlist|stream|source|file)/i.test(k)&&/^https?:$/.test(u.protocol)))return u.href}catch{}return''}if(Array.isArray(v)){for(const x of v){const f=findMedia(x,d+1,k);if(f)return f}return''}if(typeof v==='object'){for(const key of ['streamUrl','stream_url','hls','hlsUrl','hls_url','file','src','url','link']){if(key in v){const f=findMedia(v[key],d+1,key);if(f)return f}}for(const [key,x] of Object.entries(v)){const f=findMedia(x,d+1,key);if(f)return f}}return''}function map(v,media){try{const raw=String(v);if(/^(?:blob:|data:|about:)/i.test(raw))return raw;const fixed=/^null\//i.test(raw)?PO+raw.slice(4):raw,u=new URL(fixed,O);if(u.pathname.startsWith(T)||u.pathname.startsWith(S))return raw;if(media){const m=A.has(u.hostname.toLowerCase())?(u.origin===PO?S+u.pathname+u.search:T+'?url='+encodeURIComponent(u.href)):T+'?media=1&url='+encodeURIComponent(u.href);notifyMedia(u,m);return m}if(A.has(u.hostname.toLowerCase()))return u.origin===PO?S+u.pathname+u.search:T+'?url='+encodeURIComponent(u.href);if(u.origin===NO&&!u.pathname.includes('/api/tv/oha/'))return S+u.pathname+u.search;if(mediaLike(u)){const m=T+'?media=1&url='+encodeURIComponent(u.href);notifyMedia(u,m);return m}return String(v)}catch{return v}}function emitResolved(v){try{const u=findMedia(v);if(!u)return;const m=map(u,true);if(m)notifyMedia(new URL(u,O),m)}catch{}}function inspectPayloadText(t){try{const raw=String(t||'').trim();if(!raw)return;if(raw[0]==='{'||raw[0]==='['){emitResolved(JSON.parse(raw));return}const m=raw.match(/https?:\/\/[^\s"'<>]+(?:m3u8?|mpd|mp4)(?:[^\s"'<>]*)?/i);if(m)emitResolved(m[0])}catch{}}function inspectResponse(r){try{const c=String(r?.headers?.get?.('content-type')||'').toLowerCase(),u=String(r?.url||'');if(/(?:mediaurl|mediahubmx)-resolve\.json|\/resolve(?:[/?]|$)/i.test(u))r.clone().text().then(inspectPayloadText).catch(()=>{})}catch{}}window.fetch=async function(input,init){try{let r;if(typeof input==='string'||input instanceof URL){r=await F(map(input,false),Object.assign({credentials:'omit'},init||{}));inspectResponse(r);return r}if(input instanceof Request){const mapped=map(input.url,false);if(mapped!==input.url){const clone=input.clone(),cfg={method:clone.method,headers:new Headers(clone.headers),redirect:clone.redirect,cache:clone.cache,credentials:'omit'};if(!/^(?:GET|HEAD)$/i.test(clone.method))cfg.body=await clone.arrayBuffer();r=await F(mapped,Object.assign(cfg,init||{},{credentials:'omit'}));inspectResponse(r);return r}}}catch{}const r=await F(input,init);inspectResponse(r);return r};XMLHttpRequest.prototype.open=function(method,url){const args=[...arguments];args[1]=map(url,false);if(!this.__noctraInspect){this.__noctraInspect=true;this.addEventListener('load',()=>{try{if(this.responseType==='json')emitResolved(this.response);else if(!this.responseType||this.responseType==='text')inspectPayloadText(this.responseText)}catch{}})}return XO.apply(this,args)};function patchSrc(proto,media){try{const d=Object.getOwnPropertyDescriptor(proto,'src');if(!d||!d.set||!d.get)return;Object.defineProperty(proto,'src',{configurable:d.configurable,enumerable:d.enumerable,get:d.get,set:function(v){return d.set.call(this,map(v,!!media))}})}catch{}}patchSrc(HTMLMediaElement.prototype,true);if(window.HTMLSourceElement)patchSrc(HTMLSourceElement.prototype,true);if(window.HTMLScriptElement)patchSrc(HTMLScriptElement.prototype,false);if(window.HTMLIFrameElement)patchSrc(HTMLIFrameElement.prototype,false);if(window.HTMLImageElement)patchSrc(HTMLImageElement.prototype,false);try{const lh=Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype,'href');if(lh?.set&&lh?.get)Object.defineProperty(HTMLLinkElement.prototype,'href',{configurable:lh.configurable,enumerable:lh.enumerable,get:lh.get,set:function(v){return lh.set.call(this,map(v,false))}})}catch{}const SA=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){const k=String(n||'').toLowerCase(),tag=String(this.tagName||'').toLowerCase(),media=k==='poster'||(k==='src'&&['video','audio','source'].includes(tag));if(['src','href','poster','action'].includes(k))v=map(v,media);return SA.call(this,n,v)};let routeRecoveryDone=false;function routeLooksMissing(){try{const text=String(document.body?.innerText||document.documentElement?.innerText||'').replace(/\s+/g,' ').slice(0,5000);return /(?:\bNOT FOUND\b|that route doesn['’]t exist|route doesn['’]t exist|page not found|unknown route)/i.test(text)}catch{return false}}function recoverBrokenRoute(){if(routeRecoveryDone||!routeLooksMissing())return false;routeRecoveryDone=true;try{parent.postMessage({type:'noctra-oha-state',state:'route-fallback',message:'Route OHA expirée · retour au catalogue Live TV'},'*')}catch{};try{history.replaceState({},'','/live');dispatchEvent(new PopStateEvent('popstate'))}catch{}return true}let targetDone=false,targetSearchUsed=false;function normTarget(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\b(?:fhd|uhd|hd|sd|4k)\b/g,' ').replace(/\s+/g,' ').trim()}function chooseTarget(){if(targetDone||(!CID&&!CN)||document.querySelector('video'))return false;const want=normTarget(CN),id=String(CID||'').toLowerCase();let best=null,bestScore=-1;for(const el of document.querySelectorAll('button,a,[role=button],[data-id],[data-channel],[data-channel-id],[data-stream-id],li,article')){if(!(el instanceof HTMLElement))continue;const txt=normTarget(el.innerText||el.textContent||''),attrs=[el.dataset?.id,el.dataset?.channel,el.dataset?.channelId,el.dataset?.streamId,el.getAttribute('href')].filter(Boolean).map(v=>String(v).toLowerCase());let score=0;if(id&&attrs.some(v=>v===id||v.includes(id)))score=120;else if(want&&txt===want)score=100;else if(want&&txt&&txt.includes(want))score=72;else if(want&&txt&&want.includes(txt)&&txt.length>3)score=45;if(score>bestScore){bestScore=score;best=el}}if(best&&bestScore>=70){targetDone=true;try{best.scrollIntoView({block:'center',inline:'nearest'})}catch{};try{best.click()}catch{};return true}if(!targetSearchUsed&&want){const input=document.querySelector('input[type=search],input[placeholder*=search i],input[placeholder*=recher i],input[name*=search i]');if(input){targetSearchUsed=true;try{const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');d?.set?.call(input,CN);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(chooseTarget,350)}catch{}}}return false}let targetTimer=0;function scheduleTarget(){if(targetDone)return;clearTimeout(targetTimer);targetTimer=setTimeout(chooseTarget,90)};let playing=false;function bind(v){if(!v||v.dataset.noctraBound)return;v.dataset.noctraBound='1';v.addEventListener('playing',()=>{playing=true;parent.postMessage({type:'noctra-oha-state',state:'playing'},'*')});v.addEventListener('error',()=>parent.postMessage({type:'noctra-oha-state',state:'error'},'*'));}new MutationObserver(()=>{document.querySelectorAll('video').forEach(bind);if(!recoverBrokenRoute())scheduleTarget()}).observe(document.documentElement,{childList:true,subtree:true});addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('video').forEach(bind);scheduleTarget();setTimeout(()=>{if(!recoverBrokenRoute())scheduleTarget()},500);setTimeout(()=>{if(!recoverBrokenRoute())scheduleTarget()},1500);setTimeout(()=>{if(!playing&&!routeRecoveryDone)parent.postMessage({type:'noctra-oha-state',state:'stalled'},'*')},30000)});})();</script>`
  // Seed the exact public route before the SPA bundle executes. Previously the
  // bridge always forced /live, which lost the selected channel and could make
  // Kool display a stale or false route after its own navigation.
  const routeSeed = `<script>try{history.replaceState({},'',${inlineJson(remoteRoute)})}catch{}</script>`;
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, match => `${match}${routeSeed}${bridge}`);
  else html = `<!doctype html><html><head>${routeSeed}${bridge}</head><body>${html}</body></html>`;
  return html;
}

async function proxyOhaEmbed(token, res) {
  try {
    const state = decodeTvStateReference(token, 'oha');
    const stored = tvReferences.get(String(token || ''));
    const storedBridge = stored && stored.expiresAt > Date.now() && ['oha', 'oha-bridge'].includes(stored.meta?.kind) ? stored : null;
    const fallbackUrl = state?.fallbackUrl || storedBridge?.meta?.fallbackUrl || '';
    if (!fallbackUrl || !ohaAllowedHost(fallbackUrl)) throw new HttpError(410, 'Le lecteur OHA a expiré. Recharge la chaîne.');
    const response = await fetchTvRemote(fallbackUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
        ...(ohaBridgeCookieValue(token) ? { cookie: ohaBridgeCookieValue(token) } : {})
      },
      signal: AbortSignal.timeout(18_000)
    });
    if (!response.ok) throw new HttpError(response.status, `Lecteur OHA indisponible (${response.status}).`);
    rememberOhaBridgeCookies(token, response);
    const rawHtml = await response.text();
    if (rawHtml.length > 3 * 1024 * 1024) throw new HttpError(413, 'Le lecteur OHA est trop volumineux.');
    const finalPageUrl = response.url || fallbackUrl;
    rememberOhaBridgePage(token, finalPageUrl);
    const html = sanitizeOhaPlayerHtml(rawHtml, finalPageUrl, token, { channelId: storedBridge?.meta?.channelId || state?.channelId || '', channelName: storedBridge?.meta?.channelName || state?.channelName || '' });
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'origin-when-cross-origin',
      'x-content-type-options': 'nosniff'
    });
    res.end(html);
  } catch (error) {
    sendTvBridgeFailure(res, 'noctra-oha-state', 'OHA', error);
  }
}

async function readTvProxyBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Requête OHA trop volumineuse.');
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function rewriteOhaBridgeAssetText(textValue, token, contentType = '') {
  const text = String(textValue || '');
  const siteRoot = publicPath(`/api/tv/oha/site/${encodeURIComponent(String(token))}`);
  const type = String(contentType || '').toLowerCase();
  let output = text;
  // Les chargeurs de modules/Workers ne passent pas toujours par window.fetch.
  // Réécrire les origines OHA et les chemins absolus d'assets dans leurs textes
  // évite qu'un chunk dynamique sorte du bridge et retombe sur l'origine Noctra.
  if (/javascript|ecmascript|text\/plain/.test(type)) {
    output = output.replace(/https?:\/\/(?:www\.)?(?:oha\.cx|kool\.ws)(?=\/|["'`])/gi, siteRoot);
    output = output.replace(/http:\/\/185\.254\.196\.78(?=\/|["'`])/gi, siteRoot);
    output = output.replace(/(["'`])\/(?!\/)((?:assets|static|_next|build|dist|chunks?|js|css|fonts?|images?|icons?|workers?|manifest|favicon)\/[^"'`\\\r\n]{1,500})\1/gi, (_m, q, path) => `${q}${siteRoot}/${path}${q}`);
  }
  if (/text\/css/.test(type)) {
    output = output.replace(/url\(\s*(["']?)\/(?!\/)([^)"']+)\1\s*\)/gi, (_m, q, path) => `url(${q}${siteRoot}/${path}${q})`);
    output = output.replace(/@import\s+(["'])\/(?!\/)([^"']+)\1/gi, (_m, q, path) => `@import ${q}${siteRoot}/${path}${q}`);
  }
  return output;
}

async function proxyOhaSite(token, req, res, requestUrl, path) {
  const state = decodeTvStateReference(token, 'oha');
  const stored = tvReferences.get(String(token || ''));
  const storedBridge = stored && stored.expiresAt > Date.now() && ['oha', 'oha-bridge'].includes(stored.meta?.kind) ? stored : null;
  const fallbackUrl = state?.fallbackUrl || storedBridge?.meta?.fallbackUrl || state?.root || storedBridge?.meta?.root || '';
  if (!fallbackUrl || !ohaAllowedHost(fallbackUrl)) throw new HttpError(410, 'Le lecteur OHA a expiré.');
  const rememberedPage = ohaBridgePages.get(String(token))?.pageUrl || fallbackUrl;
  const origin = new URL(rememberedPage).origin;
  const marker = `/api/tv/oha/site/${encodeURIComponent(String(token))}`;
  const suffix = path.startsWith(marker) ? path.slice(marker.length) : '';
  const upstreamUrl = new URL(`${suffix || '/'}${requestUrl.search || ''}`, `${origin}/`).toString();
  if (!ohaAllowedHost(upstreamUrl)) throw new HttpError(403, 'Le relais OHA est limité aux domaines officiels OHA.');

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': req.headers['access-control-request-headers'] || 'content-type,accept,mediahubmx-signature,mediaurl-signature,range',
    'access-control-expose-headers': 'content-length,content-range,accept-ranges',
    'access-control-max-age': '600'
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }
  const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? req.method : 'GET';
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await readTvProxyBody(req);
  const headers = {
    accept: req.headers.accept || '*/*',
    'accept-language': req.headers['accept-language'] || 'fr-FR,fr;q=0.9,en;q=0.6',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
    origin,
    referer: rememberedPage,
    ...(ohaBridgeCookieValue(token) ? { cookie: ohaBridgeCookieValue(token) } : {})
  };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (req.headers.range) headers.range = req.headers.range;
  if (req.headers['mediahubmx-signature']) headers['mediahubmx-signature'] = req.headers['mediahubmx-signature'];
  if (req.headers['mediaurl-signature']) headers['mediaurl-signature'] = req.headers['mediaurl-signature'];
  const likelyMediaRequest = Boolean(req.headers.range) || tvLikelyMediaUrl(upstreamUrl);
  const response = likelyMediaRequest
    ? await fetchTvRemoteUntilHeaders(upstreamUrl, {
      method,
      headers,
      ...(body ? { body } : {})
    }, 18_000)
    : await fetchTvRemote(upstreamUrl, {
      method,
      headers,
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(22_000)
    });
  rememberOhaBridgeCookies(token, response);
  const responseHeaders = {
    ...corsHeaders,
    'content-type': response.headers.get('content-type') || 'application/octet-stream',
    'cache-control': /(?:javascript|css|font|image)/i.test(response.headers.get('content-type') || '') ? 'private, max-age=300' : 'no-store'
  };
  for (const header of ['content-length', 'content-range', 'accept-ranges']) {
    const value = response.headers.get(header);
    if (value) responseHeaders[header] = value;
  }
  if (method === 'HEAD') {
    res.writeHead(response.status, responseHeaders);
    res.end();
    return;
  }
  const finalUrl = response.url || upstreamUrl;
  if (/text\/html|application\/xhtml/i.test(responseHeaders['content-type'])) {
    const rawHtml = await response.text();
    if (rawHtml.length > 3 * 1024 * 1024) throw new HttpError(413, 'Le sous-lecteur OHA est trop volumineux.');
    rememberOhaBridgePage(token, finalUrl);
    const prepared = sanitizeOhaPlayerHtml(rawHtml, finalUrl, token, { channelId: storedBridge?.meta?.channelId || state?.channelId || '', channelName: storedBridge?.meta?.channelName || state?.channelName || '' });
    const buffer = Buffer.from(prepared, 'utf8');
    delete responseHeaders['content-length'];
    responseHeaders['content-type'] = 'text/html; charset=utf-8';
    responseHeaders['cache-control'] = 'no-store';
    res.writeHead(response.status, responseHeaders);
    res.end(buffer);
    return;
  }
  const playlist = /(?:mpegurl|m3u8)/i.test(responseHeaders['content-type']) || /\.m3u8?(?:$|[?#])/i.test(finalUrl);
  if (playlist) {
    const text = await readTvPlaylistBody(response);
    const rewritten = rewriteTvPlaylist(text, finalUrl, { origin: new URL(rememberedPage).origin, referer: rememberedPage, 'user-agent': headers['user-agent'], ...(ohaBridgeCookieValue(token) ? { cookie: ohaBridgeCookieValue(token) } : {}) }, { provider: 'OHA' });
    delete responseHeaders['content-length'];
    responseHeaders['content-type'] = 'application/vnd.apple.mpegurl; charset=utf-8';
    responseHeaders['x-accel-buffering'] = 'no';
    res.writeHead(response.status, responseHeaders);
    res.end(rewritten);
    return;
  }
  const textual = /(?:javascript|ecmascript|text\/css|text\/plain)/i.test(responseHeaders['content-type']);
  if (textual) {
    const text = rewriteOhaBridgeAssetText(await response.text(), token, responseHeaders['content-type']);
    const buffer = Buffer.from(text, 'utf8');
    responseHeaders['content-length'] = String(buffer.length);
    res.writeHead(response.status, responseHeaders);
    res.end(buffer);
    return;
  }
  if (tvBridgeMediaResponseAllowed(finalUrl, responseHeaders['content-type'])) {
    responseHeaders['x-accel-buffering'] = 'no';
    try { res.socket?.setNoDelay?.(true); } catch {}
    try { res.socket?.setKeepAlive?.(true, 15_000); } catch {}
    res.writeHead(response.status, responseHeaders);
    res.flushHeaders?.();
    pipeRemoteResponseBody(response, res);
    return;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  responseHeaders['content-length'] = String(buffer.length);
  res.writeHead(response.status, responseHeaders);
  res.end(buffer);
}

async function proxyOhaHttp(token, req, res, requestUrl) {
  const state = decodeTvStateReference(token, 'oha');
  const stored = tvReferences.get(String(token || ''));
  const storedBridge = stored && stored.expiresAt > Date.now() && ['oha', 'oha-bridge'].includes(stored.meta?.kind) ? stored : null;
  if (!state && !storedBridge) throw new HttpError(410, 'Le lecteur OHA a expiré.');
  const rawTarget = requestUrl.searchParams.get('url') || '';
  let target;
  try { target = safeTvRemoteUrl(rawTarget); } catch { throw new HttpError(400, 'Requête OHA invalide.'); }
  const officialTarget = ohaAllowedHost(target.toString());
  const externalMedia = !officialTarget && requestUrl.searchParams.get('media') === '1';
  if (!officialTarget && !externalMedia) throw new HttpError(403, 'Le relais OHA est limité aux domaines officiels OHA et aux ressources média résolues par leur lecteur.');

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': req.headers['access-control-request-headers'] || 'content-type,accept,mediahubmx-signature,mediaurl-signature',
    'access-control-expose-headers': 'content-length,content-range,accept-ranges',
    'access-control-max-age': '600'
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }
  const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? req.method : 'GET';
  if (externalMedia && !['GET', 'HEAD'].includes(method)) throw new HttpError(405, 'Une ressource média OHA externe ne peut être relayée qu’en lecture.');
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await readTvProxyBody(req);
  const fallbackUrl = state?.fallbackUrl || storedBridge?.meta?.fallbackUrl || state?.root || storedBridge?.meta?.root || 'https://oha.cx/';
  const rememberedPage = ohaBridgePages.get(String(token))?.pageUrl || fallbackUrl;
  const origin = externalMedia ? new URL(rememberedPage).origin : target.origin;
  const upstreamHeaders = {
    accept: req.headers.accept || '*/*',
    'accept-language': req.headers['accept-language'] || 'fr-FR,fr;q=0.9,en;q=0.6',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
    origin,
    referer: externalMedia ? rememberedPage : `${origin}/`,
    ...(officialTarget && ohaBridgeCookieValue(token) ? { cookie: ohaBridgeCookieValue(token) } : {})
  };
  if (req.headers['content-type']) upstreamHeaders['content-type'] = req.headers['content-type'];
  if (req.headers.range) upstreamHeaders.range = req.headers.range;
  if (officialTarget && req.headers['mediahubmx-signature']) upstreamHeaders['mediahubmx-signature'] = req.headers['mediahubmx-signature'];
  if (officialTarget && req.headers['mediaurl-signature']) upstreamHeaders['mediaurl-signature'] = req.headers['mediaurl-signature'];
  const response = externalMedia
    ? await fetchTvRemoteUntilHeaders(target.toString(), {
      method,
      headers: upstreamHeaders,
      ...(body ? { body } : {})
    }, 18_000)
    : await fetchTvRemote(target.toString(), {
      method,
      headers: upstreamHeaders,
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(22_000)
    });
  if (officialTarget) rememberOhaBridgeCookies(token, response);
  const responseHeaders = {
    ...corsHeaders,
    'content-type': response.headers.get('content-type') || 'application/octet-stream',
    'cache-control': 'no-store'
  };
  for (const header of ['content-length', 'content-range', 'accept-ranges']) {
    const value = response.headers.get(header);
    if (value) responseHeaders[header] = value;
  }
  if (method === 'HEAD') {
    res.writeHead(response.status, responseHeaders);
    res.end();
    return;
  }
  const finalUrl = response.url || target.toString();
  if (officialTarget && /text\/html|application\/xhtml/i.test(responseHeaders['content-type'])) {
    const rawHtml = await response.text();
    if (rawHtml.length > 3 * 1024 * 1024) throw new HttpError(413, 'Le sous-lecteur OHA est trop volumineux.');
    rememberOhaBridgePage(token, finalUrl);
    const prepared = sanitizeOhaPlayerHtml(rawHtml, finalUrl, token, { channelId: storedBridge?.meta?.channelId || state?.channelId || '', channelName: storedBridge?.meta?.channelName || state?.channelName || '' });
    const buffer = Buffer.from(prepared, 'utf8');
    delete responseHeaders['content-length'];
    responseHeaders['content-type'] = 'text/html; charset=utf-8';
    res.writeHead(response.status, responseHeaders);
    res.end(buffer);
    return;
  }
  if (externalMedia && !tvBridgeMediaResponseAllowed(finalUrl, responseHeaders['content-type'])) {
    throw new HttpError(415, 'La ressource externe résolue par OHA n’est pas un média compatible.');
  }
  const playlist = /(?:mpegurl|m3u8)/i.test(responseHeaders['content-type']) || /\.m3u8?(?:$|[?#])/i.test(finalUrl);
  if (playlist) {
    const text = await readTvPlaylistBody(response);
    const playlistCookie = externalMedia ? tvResponseCookieHeader(response) : '';
    const rewritten = rewriteTvPlaylist(text, finalUrl, {
      origin: upstreamHeaders.origin,
      referer: externalMedia ? rememberedPage : `${origin}/`,
      'user-agent': upstreamHeaders['user-agent'],
      ...(playlistCookie ? { cookie: playlistCookie } : {})
    }, { provider: 'OHA' });
    delete responseHeaders['content-length'];
    responseHeaders['content-type'] = 'application/vnd.apple.mpegurl; charset=utf-8';
    responseHeaders['x-accel-buffering'] = 'no';
    res.writeHead(response.status, responseHeaders);
    res.end(rewritten);
    return;
  }
  // V94 : un segment/flux OHA ne doit plus être entièrement téléchargé en RAM
  // avant d'être envoyé au navigateur. On commence à le relayer dès les premiers
  // octets, ce qui retire une source directe de micro-coupures sur les chaînes
  // à segments courts ou lorsque l'amont varie légèrement en débit.
  if (externalMedia || tvBridgeMediaResponseAllowed(finalUrl, responseHeaders['content-type'])) {
    responseHeaders['x-accel-buffering'] = 'no';
    try { res.socket?.setNoDelay?.(true); } catch {}
    try { res.socket?.setKeepAlive?.(true, 15_000); } catch {}
    res.writeHead(response.status, responseHeaders);
    res.flushHeaders?.();
    pipeRemoteResponseBody(response, res);
    return;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  // fetch décompresse automatiquement : ne pas conserver une taille amont si
  // elle ne correspond plus aux octets effectivement renvoyés par Noctra.
  responseHeaders['content-length'] = String(buffer.length);
  res.writeHead(response.status, responseHeaders);
  res.end(buffer);
}

const tvPlaylistMemory = new Map();
const TV_PLAYLIST_CLIENT_WAIT_MS = 7_000;
const TV_PLAYLIST_STALE_MS = 30_000;

async function rewriteProxiedTvPlaylist(response, reference, url, finalUrl, token, provider) {
  const text = await readTvPlaylistBody(response);
  const responseCookie = tvResponseCookieHeader(response);
  const finalHeaders = tvChildReferenceHeaders(reference.headers, url.toString(), finalUrl);
  const playlistHeaders = {
    ...finalHeaders,
    ...(responseCookie ? { cookie: mergeTvCookieHeaders(finalHeaders.cookie || '', responseCookie) } : {})
  };
  // Keep the session selected by an IPTV redirect for subsequent playlist
  // refreshes. Reopening its entry URL can create a new stream timeline.
  if (/^(?:Movix|Northlive|RénéVéo)$/i.test(provider)) {
    reference.url = safeTvRemoteUrl(finalUrl).toString();
    reference.headers = playlistHeaders;
  }
  return rewriteTvPlaylist(text, finalUrl, playlistHeaders, {
    provider, referenceScope:/^(?:Movix|Northlive|RénéVéo)$/i.test(provider) ? token : ''
  });
}

function rememberTvPlaylist(token, text) {
  const key = String(token);
  const entry = tvPlaylistMemory.get(key) || { text: '', at: 0, flight: null };
  entry.text = text; entry.at = Date.now();
  tvPlaylistMemory.delete(key); tvPlaylistMemory.set(key, entry);
  // Bornée : les playlists les plus anciennes sont oubliées en premier.
  while (tvPlaylistMemory.size > 64) tvPlaylistMemory.delete(tvPlaylistMemory.keys().next().value);
}

function refreshTvPlaylistDetached(token, reference, url, headers, provider) {
  const entry = tvPlaylistMemory.get(token);
  if (entry.flight) return entry.flight;
  entry.flight = (async () => {
    const response = await fetchTvRemoteUntilHeaders(url, { headers, signal: AbortSignal.timeout(30_000) }, 18_000);
    if (!response.ok) {
      try { await response.body?.cancel?.(); } catch {}
      throw new HttpError(response.status, `Flux TV indisponible (${response.status}).`);
    }
    const finalUrl = response.url || url.toString();
    const rewritten = await rewriteProxiedTvPlaylist(response, reference, url, finalUrl, token, provider);
    rememberTvPlaylist(token, rewritten);
    return rewritten;
  })().finally(() => { const current = tvPlaylistMemory.get(token); if (current) current.flight = null; });
  entry.flight.catch(() => undefined);
  return entry.flight;
}

async function serveRememberedTvPlaylist(token, reference, url, headers, provider, req, res) {
  const entry = tvPlaylistMemory.get(token);
  let text = '', state = 'fresh', failure = null, timer;
  try {
    text = await Promise.race([
      refreshTvPlaylistDetached(token, reference, url, headers, provider),
      new Promise(resolve => { timer = setTimeout(() => resolve(''), TV_PLAYLIST_CLIENT_WAIT_MS); timer.unref?.(); })
    ]);
  } catch (error) { failure = error; } finally { clearTimeout(timer); }
  if (req.aborted || res.destroyed) return true;
  if (!text) {
    // Lien expiré ou refusé : l'erreur remonte tout de suite pour que le
    // lecteur renouvelle l'URL signée, comme avant.
    if (failure && [401, 403, 404, 410].includes(Number(failure.status))) throw failure;
    if (entry.text && Date.now() - entry.at <= TV_PLAYLIST_STALE_MS) { text = entry.text; state = 'stale'; }
    else if (failure) throw failure;
    else throw new HttpError(504, 'Le fournisseur TV ne répond pas.');
  }
  res.writeHead(200, {
    'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'x-noctra-playlist': state,
    'x-accel-buffering': 'no'
  });
  res.end(text);
  return true;
}

// 200.0.110 : Shaka interroge chaque segment en HEAD pour connaître son type.
// Sans réponse, il retéléchargeait le segment entier en GET (~20 s perdues au
// démarrage). Le type est déduit localement, sans requête au fournisseur ; s'il
// est inconnu, 405 conserve l'ancien comportement (repli GET de Shaka).
function tvMediaTypeFromUrl(value) {
  let pathname = '';
  try { pathname = new URL(value).pathname.toLowerCase(); } catch { return ''; }
  if (/\.ts$/.test(pathname)) return 'video/mp2t';
  if (/\.(?:m4s|mp4|m4v|cmfv)$/.test(pathname)) return 'video/mp4';
  if (/\.(?:aac)$/.test(pathname)) return 'audio/aac';
  if (/\.(?:m4a|cmfa)$/.test(pathname)) return 'audio/mp4';
  if (/\.m3u8$/.test(pathname)) return 'application/vnd.apple.mpegurl';
  if (/\.vtt$/.test(pathname)) return 'text/vtt';
  return '';
}

function headTvStream(token, res) {
  const reference = tvReferences.get(String(token || ''));
  if (!reference || reference.expiresAt <= Date.now()) { res.writeHead(410, { 'cache-control': 'no-store' }); res.end(); return; }
  const type = tvSegmentCache.get(String(token))?.type || tvMediaTypeFromUrl(reference.url);
  if (!type) { res.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' }); res.end(); return; }
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  res.end();
}

async function proxyTvStream(token, req, res) {
  const reference = tvReferences.get(String(token || ''));
  if (!reference || reference.expiresAt <= Date.now()) throw new HttpError(410, 'Le lien TV a expiré. Recharge la chaîne.');
  if (reference.meta?.finiteSegment && !req.headers.range) {
    const ready = tvSegmentCache.get(String(token));
    if (ready) {
      res.writeHead(200, { 'content-type': ready.type, 'content-length': String(ready.body.length), 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'x-noctra-relay': 'memory-hit' });
      res.end(ready.body); return;
    }
    // 200.0.110 : un préchargement déjà commencé est partagé en direct
    // (octets déjà reçus puis suivants) au lieu d'être refait depuis le début.
    const shared = await tvSegmentCache.attach?.(String(token));
    if (req.aborted || res.destroyed) { shared?.stream.destroy(); return; }
    if (shared) {
      res.writeHead(200, { 'content-type': shared.type, 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'x-noctra-relay': 'memory-stream' });
      const stop = () => shared.stream.destroy();
      res.once('close', stop);
      shared.stream.on('error', () => { res.removeListener('close', stop); res.destroy(); });
      shared.stream.pipe(res);
      return;
    }
    const cached = await tvSegmentCache.read(String(token));
    if (req.aborted || res.destroyed) return;
    if (cached) {
      res.writeHead(200, { 'content-type': cached.type, 'content-length': String(cached.body.length), 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'x-noctra-relay': 'memory-hit' });
      res.end(cached.body); return;
    }
  }
  const url = safeTvRemoteUrl(reference.url);
  const provider = String(reference.meta?.provider || (reference.meta?.kind === 'livewatch-vip' ? 'LiveWatch' : reference.meta?.kind === 'oha-native' ? 'OHA' : ''));
  const providerStabilityPath = /^(?:LiveWatch|OHA|WiTV|FSTV|StreamSports99)$/i.test(provider) || /^(?:NorthTV|FrameTV)$/i.test(provider) || /^(?:Movix|Northlive|RénéVéo)$/i.test(provider);
  const headers = {
    accept: reference.headers.accept || '*/*',
    'user-agent': reference.headers['user-agent'] || 'Mozilla/5.0 Noctra/84',
    ...(reference.headers.origin ? { origin: reference.headers.origin } : {}),
    ...(reference.headers.referer ? { referer: reference.headers.referer } : {}),
    ...(reference.headers.authorization ? { authorization: reference.headers.authorization } : {}),
    ...(reference.headers.cookie ? { cookie: reference.headers.cookie } : {}),
    ...(req.headers.range ? { range: req.headers.range } : {})
  };
  // 200.0.111 : une playlist déjà servie est rafraîchie par un chargement
  // détaché du lecteur. Une nouvelle tentative du lecteur rejoint ce même
  // chargement au lieu de l'annuler et de le relancer ; s'il est trop lent,
  // la dernière playlist connue est renvoyée (Shaka réessaie ensuite) plutôt
  // qu'une erreur qui épuise ses tentatives.
  if (!req.headers.range && typeof tvPlaylistMemory !== 'undefined' && tvPlaylistMemory.has(String(token))) {
    const served = await serveRememberedTvPlaylist(String(token), reference, url, headers, provider, req, res);
    if (served) return;
  }
  const controller = new AbortController();
  const cleanup = () => {
    res.removeListener('close', onClose);
    res.removeListener('finish', cleanup);
  };
  const onClose = () => { cleanup(); controller.abort(); };
  res.once('close', onClose);
  res.once('finish', cleanup);
  if (req.aborted || res.destroyed) { onClose(); return; }
  try {
    // Toutes les sources TV : borner la connexion, jamais la durée d'un flux
    // continu. Annuler aussi les GET amont dès que le lecteur change de chaîne.
    const response = await fetchTvRemoteUntilHeaders(url, { headers, signal: controller.signal }, 18_000);
    if (!response.ok && response.status !== 206) {
      try { await response.body?.cancel?.(); } catch {}
      throw new HttpError(response.status, `Flux TV indisponible (${response.status}).`);
    }
    const contentType = response.headers.get('content-type') || '';
    const finalUrl = response.url || url.toString();
    const playlist = Boolean(reference.meta?.forceHls)
      || /(?:mpegurl|m3u8)/i.test(contentType)
      || /\.m3u8?(?:\?|$)/i.test(finalUrl);
    if (playlist) {
      const rewritten = await rewriteProxiedTvPlaylist(response, reference, url, finalUrl, token, provider);
      if (typeof rememberTvPlaylist === 'function') rememberTvPlaylist(token, rewritten);
      res.writeHead(200, {
        'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-length,content-range,accept-ranges',
        ...(providerStabilityPath ? { 'x-accel-buffering': 'no' } : {})
      });
      res.end(rewritten);
      return;
    }
    const responseHeaders = {
      'content-type': contentType || 'application/octet-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-length,content-range,accept-ranges',
      'accept-ranges': response.headers.get('accept-ranges') || 'bytes',
      ...(providerStabilityPath ? { 'x-accel-buffering': 'no' } : {})
    };
    for (const header of ['content-length', 'content-range']) {
      const value = response.headers.get(header);
      if (value) responseHeaders[header] = value;
    }
    if (providerStabilityPath) {
      try { res.socket?.setNoDelay?.(true); } catch {}
      try { res.socket?.setKeepAlive?.(true, 15_000); } catch {}
    }
    res.writeHead(response.status, responseHeaders);
    res.flushHeaders?.();
    pipeRemoteResponseBody(response, res);
  } catch (error) {
    cleanup();
    controller.abort();
    throw error;
  }
}

async function readJsonBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Requête trop volumineuse.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function serveStatic(pathname, res) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
  const filePath = join(publicRoot, relative);
  if (!filePath.startsWith(publicRoot)) return false;
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return false;
  const content = await readFile(filePath);
  const cache = pathname.startsWith('/client/') && !pathname.endsWith('.html') && !pathname.endsWith('config.json')
    ? 'public, max-age=31536000, immutable'
    : 'no-store';
  res.writeHead(200, {
    'content-type': mime[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'cache-control': cache,
    'cross-origin-resource-policy': 'cross-origin'
  });
  res.end(content);
  return true;
}

let providerKeyWrite = Promise.resolve();
const additionalTvKeysPath = join(runtimeRoot, 'tv-provider-keys.json');
const bowdAccountSessionPath = join(runtimeRoot, 'bowd-account-session.json');
async function readBowdAccountSession() {
  try { return JSON.parse(await readFile(bowdAccountSessionPath, 'utf8')); }
  catch(error) { if(error.code==='ENOENT')return null; throw new Error('Session BowdTV enregistrée illisible.'); }
}
async function saveBowdAccountSession(value) {
  await mkdir(runtimeRoot, {recursive:true});
  const temporaryPath=bowdAccountSessionPath+'.tmp';
  await writeFile(temporaryPath,JSON.stringify(value),{mode:0o600});
  await chmod(temporaryPath,0o600);
  await rename(temporaryPath,bowdAccountSessionPath);
}
async function readAdditionalTvKeys() {
  const saved = JSON.parse(await readFile(additionalTvKeysPath, 'utf8').catch(() => '{}'));
  return { movix: saved.movix || process.env.MOVIX_ACCESS_KEY || '', northlive: saved.northlive || process.env.NORTHLIVE_API_KEY || '' };
}
const additionalTv = createAdditionalTvProviders({ request: fetchTvRemote, issueReference: issueTvReference,
  readBowdSession:readBowdAccountSession, saveBowdSession:saveBowdAccountSession,
  streamUrl: tvPublicStreamUrl, publicPath, readKeys: readAdditionalTvKeys,
  validateStream: (url, headers) => validateWiTvHlsStream(url, headers, 8_000, null, true) });

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
  const incomingPath = requestUrl.pathname;
  const path = basePath && (incomingPath === basePath || incomingPath.startsWith(`${basePath}/`))
    ? (incomingPath.slice(basePath.length) || '/')
    : incomingPath;
  let session = null;

  try {
    if (path === '/') {
      res.writeHead(302, { location: publicPath('/client/index.html') });
      return res.end();
    }

    if (path === '/health') {
      return json(res, 200, { status: 'ok', client: 'Noctra', version: '200.0.126', baseUrl: basePath || '/' });
    }

    if (path === '/api/config') {
      return json(res, 200, {
        version: '200.0.126',
        jellyfinUrl,
        baseUrl: basePath || '/',
        clientUrl: publicPath('/client/index.html'),
        authentication: 'jellyfin-session',
        configured: {
          jellyfin: Boolean(jellyfinUrl && process.env.JELLYFIN_API_KEY),
          jellyseerr: Boolean(process.env.JELLYSEERR_URL && process.env.JELLYSEERR_API_KEY),
          sonarr: Boolean(process.env.SONARR_URL && process.env.SONARR_API_KEY),
          radarr: Boolean(process.env.RADARR_URL && process.env.RADARR_API_KEY),
          prowlarr: Boolean((process.env.PROWLARR_INTERNAL_URL || process.env.PROWLARR_URL) && process.env.PROWLARR_API_KEY),
          downloads: Boolean(process.env.QBITTORRENT_URL && process.env.QBITTORRENT_USERNAME),
          files: mediaRoots.length > 0,
          discovery: Boolean(tmdbConfigured() || (process.env.JELLYSEERR_URL && process.env.JELLYSEERR_API_KEY)),
          tmdb: tmdbConfigured(),
          tv: true
        }
      });
    }

    if (path.startsWith('/api/')) {
      const ohaBridgeToken = ohaBridgeTokenFromPath(path);
      const trustedOhaBridgeRequest = Boolean(ohaBridgeToken && validOhaBridgeToken(ohaBridgeToken));
      const liveWatchBridgeToken = liveWatchBridgeTokenFromPath(path);
      const trustedLiveWatchBridgeRequest = Boolean(liveWatchBridgeToken && validLiveWatchBridgeToken(liveWatchBridgeToken));
      const tvImageToken = path.startsWith('/api/tv/image/') && req.method === 'GET'
        ? decodeURIComponent(path.slice('/api/tv/image/'.length).split('/')[0] || '')
        : '';
      const trustedTvImageRequest = Boolean(tvImageToken && signedTvImagePayload(tvImageToken));
      if (!trustedOhaBridgeRequest && !trustedLiveWatchBridgeRequest && !trustedTvImageRequest) {
        try {
          session = await authenticateRequest(req);
        } catch (error) {
          const libraryImageFallback = Boolean(process.env.JELLYFIN_API_KEY)
            && req.method === 'GET'
            && (path === '/api/libraries' || path.startsWith('/api/jellyfin/image/'));
          if (!libraryImageFallback) throw error;
          session = null;
        }
        if (administratorRoute(path, req.method || 'GET')) requireAdministrator(session);
      }
    }

    if (path === '/api/tv/provider-keys') {
      requireAdministrator(session);
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        if (!['movix', 'northlive'].includes(body.provider)) throw new HttpError(400, 'Fournisseur inconnu.');
        const key = String(body.key || '').trim();
        if (!key || key.length > 512 || /[\r\n]/.test(key)) throw new HttpError(400, 'Clé invalide.');
        await additionalTv.verify(body.provider, key);
        providerKeyWrite = providerKeyWrite.catch(() => {}).then(async () => {
          const saved = JSON.parse(await readFile(additionalTvKeysPath, 'utf8').catch(() => '{}'));
          saved[body.provider] = key;
          await mkdir(runtimeRoot, { recursive: true });
          const temporaryPath = additionalTvKeysPath + '.tmp';
          await writeFile(temporaryPath, JSON.stringify(saved), { mode: 0o600 });
          await chmod(temporaryPath, 0o600);
          await rename(temporaryPath, additionalTvKeysPath);
        });
        await providerKeyWrite;
        additionalTv.clear();
        tvCatalogCache.clear();
      } else if (req.method !== 'GET') throw new HttpError(405, 'Méthode non autorisée.');
      const keys = await readAdditionalTvKeys();
      return json(res, 200, { movix: Boolean(keys.movix), northlive: Boolean(keys.northlive) });
    }

    if (path === '/api/session/logout' && req.method === 'POST') {
      sessionCache.delete(session.cacheKey);
      return json(res, 200, { ok: true }, {
        'set-cookie': `noctra_session=; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=0`
      });
    }

    if (path === '/api/session') {
      return json(res, 200, {
        user: {
          id: session.id,
          name: session.name,
          primaryImageTag: session.primaryImageTag
        },
        role: session.role,
        isAdmin: session.isAdmin,
        permissions: session.permissions
      }, {
        'set-cookie': [
          `noctra_session=${session.cacheKey}`,
          `Path=${cookiePath}`,
          'HttpOnly',
          'SameSite=Strict',
          'Max-Age=43200',
          String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' ? 'Secure' : ''
        ].filter(Boolean).join('; ')
      });
    }


    if (path === '/api/files/roots' && req.method === 'GET') {
      const roots = await Promise.all(mediaRoots.map(async root => ({
        id: root.id,
        label: root.label,
        available: Boolean(await realpath(root.path).catch(() => null))
      })));
      return json(res, 200, { roots });
    }

    if (path === '/api/files/duplicates/status' && req.method === 'GET') {
      return json(res, 200, publicDuplicateScanJob());
    }

    if (path === '/api/files/completeness/start' && req.method === 'POST') {
      return json(res, 202, libraryCompletenessAudit.start(session));
    }

    if (path === '/api/files/completeness/status' && req.method === 'GET') {
      return json(res, 200, libraryCompletenessAudit.snapshot());
    }

    if (path === '/api/files/completeness/group' && req.method === 'GET') {
      const result = libraryCompletenessAudit.detail(requestUrl.searchParams.get('id'), requestUrl.searchParams.get('offset'));
      if (!result) throw new HttpError(404, 'Résultat introuvable. Relance la vérification.');
      return json(res, 200, result);
    }

    if (path === '/api/files/duplicates/start' && req.method === 'POST') {
      return json(res, 202, startDuplicateScanJob());
    }

    if (path === '/api/files/duplicates/delete' && req.method === 'POST') {
      const body = await readJsonBody(req, 512 * 1024);
      return json(res, 200, await deleteConfirmedDuplicates(body));
    }

    if (path === '/api/files' && req.method === 'GET') {
      return json(res, 200, await mediaDirectoryListing(
        requestUrl.searchParams.get('root'),
        requestUrl.searchParams.get('path') || ''
      ));
    }

    if (path === '/api/files/mkdir' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 200, await createMediaDirectory(body.root, body.path || '', body.name));
    }

    if (path === '/api/files/rename' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 200, await renameMediaEntry(body.root, body.path, body.name));
    }

    if (path === '/api/files/trash' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 200, await trashMediaEntry(body.root, body.path));
    }

    if (path === '/api/files/empty-trash' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 200, await emptyMediaTrash(body.root || 'trash'));
    }


    if (path === '/api/tv/sources' && req.method === 'GET') {
      const sources = await tvSources();
      return json(res, 200, { sources: sources.map(({ url, ...source }) => ({ ...source, url: session.isAdmin ? url : undefined })) });
    }

    if (path === '/api/tv/sources' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 200, await addTvSource(body.name, body.url, body.type, body.epgUrl));
    }

    if (path.startsWith('/api/tv/sources/') && req.method === 'DELETE') {
      const id = decodeURIComponent(path.split('/').at(-1) || '');
      return json(res, 200, await removeTvSource(id));
    }

    if (path === '/api/tv/livewatch/session' && req.method === 'GET') {
      return json(res, 200, await liveWatchVipStatus(session.isAdmin));
    }

    if (path === '/api/tv/livewatch/session' && req.method === 'POST') {
      const body = await readJsonBody(req);
      await connectLiveWatchVip(body.email, body.password);
      tvCatalogCache.clear();
      return json(res, 200, await liveWatchVipStatus(true));
    }

    if (path === '/api/tv/livewatch/session' && req.method === 'DELETE') {
      await disconnectLiveWatchVip();
      tvCatalogCache.clear();
      return json(res, 200, { ok: true, configured: false, active: false, isVip: false });
    }

    if (path === '/api/tv/livewatch/diagnostics' && req.method === 'GET') {
      return json(res, 200, await liveWatchVipDiagnostics());
    }

    if (path.startsWith('/api/tv/livewatch/prepare/') && req.method === 'GET') {
      const parts = path.slice('/api/tv/livewatch/prepare/'.length).split('/');
      const kind = decodeURIComponent(parts.shift() || '');
      const id = decodeURIComponent(parts.join('/'));
      return json(res, 200, await prepareLiveWatchVipEmbed(kind, id));
    }

    if (path === '/api/tv/catalog' && req.method === 'GET') {
      const sourceId = requestUrl.searchParams.get('source');
      const reference = requestUrl.searchParams.get('ref');
      if (sourceId) return json(res, 200, await tvCatalogBySource(sourceId, { logoRefresh: requestUrl.searchParams.get('logoRefresh') === '1' }));
      if (reference) return json(res, 200, await tvCatalogByReference(reference));
      return json(res, 400, { error: 'Source ou groupe TV requis.' });
    }

    if (path.startsWith('/api/tv/resolve/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      return json(res, 200, await resolveTvPageReference(token));
    }

    if (path.startsWith('/api/tv/oha/resolve/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      const serverValue = requestUrl.searchParams.get('server');
      const preferredIndex = serverValue !== null && /^\d+$/.test(serverValue) ? Number(serverValue) : null;
      return json(res, 200, await resolveOhaStreamReference(token, preferredIndex));
    }

    if (path.startsWith('/api/tv/streamsports99/resolve/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      const serverValue = requestUrl.searchParams.get('server');
      const preferredIndex = serverValue !== null && /^\d+$/.test(serverValue) ? Number(serverValue) : null;
      return json(res, 200, await resolveStreamSports99EventReference(token, preferredIndex));
    }

    if (path.startsWith('/api/tv/streamsports99/channel/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      return json(res, 200, await resolveStreamSports99ChannelReference(token));
    }

    if (path === '/api/tv/programme' && req.method === 'GET') {
      return json(res, 200, await iptvOrgProgramme(requestUrl.searchParams.get('id') || ''));
    }

    if (path.startsWith('/api/tv/image/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      await proxyTvImage(token, req, res);
      return;
    }

    if (path.startsWith('/api/tv/fstv/embed/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      await proxyFstvEmbed(token, res);
      return;
    }

    if (path.startsWith('/api/tv/fstv/resolve/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      return json(res, 200, await resolveFstvPageReference(token));
    }

    if (path.startsWith('/api/tv/fstv/site/')) {
      const rest = path.slice('/api/tv/fstv/site/'.length);
      const token = rest.split('/')[0] || '';
      await proxyFstvSite(token, req, res, requestUrl, path);
      return;
    }

    if (path.startsWith('/api/tv/oha/embed/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      await proxyOhaEmbed(token, res);
      return;
    }

    if (path.startsWith('/api/tv/oha/site/')) {
      const rest = path.slice('/api/tv/oha/site/'.length);
      const token = rest.split('/')[0] || '';
      await proxyOhaSite(token, req, res, requestUrl, path);
      return;
    }

    if (path.startsWith('/api/tv/oha/http/')) {
      const token = path.split('/').at(-1) || '';
      await proxyOhaHttp(token, req, res, requestUrl);
      return;
    }

    if (path.startsWith('/api/tv/embed/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      await proxyWiTvEmbed(token, res);
      return;
    }

    if (path.startsWith('/api/tv/livewatch/vip/')) {
      const rest = path.slice('/api/tv/livewatch/vip/'.length);
      const parts = rest.split('/');
      const token = decodeURIComponent(parts.shift() || '');
      const action = parts.shift() || '';
      if (action === 'embed' && req.method === 'GET') {
        await proxyLiveWatchVipTokenEmbed(token, res);
        return;
      }
      if (action === 'site') {
        await proxyLiveWatchVipTokenSite(token, req, res, requestUrl, path);
        return;
      }
      if (action === 'http') {
        await proxyLiveWatchVipTokenHttp(token, req, res, requestUrl);
        return;
      }
      return json(res, 404, { error: 'Route lecteur LiveWatch VIP inconnue.' });
    }

    if (path.startsWith('/api/tv/livewatch/embed/') && req.method === 'GET') {
      const parts = path.slice('/api/tv/livewatch/embed/'.length).split('/');
      const kind = decodeURIComponent(parts.shift() || '');
      const id = decodeURIComponent(parts.join('/'));
      await proxyLiveWatchVipEmbed(kind, id, res);
      return;
    }

    if (path.startsWith('/api/tv/livewatch/site/')) {
      const parts = path.slice('/api/tv/livewatch/site/'.length).split('/');
      const kind = decodeURIComponent(parts.shift() || '');
      const id = decodeURIComponent(parts.shift() || '');
      await proxyLiveWatchVipSite(kind, id, req, res, requestUrl, path);
      return;
    }

    if (path.startsWith('/api/tv/livewatch/http/')) {
      const parts = path.slice('/api/tv/livewatch/http/'.length).split('/');
      const kind = decodeURIComponent(parts.shift() || '');
      const id = decodeURIComponent(parts.shift() || '');
      await proxyLiveWatchVipHttp(kind, id, req, res, requestUrl);
      return;
    }

    if (path.startsWith('/api/tv/livewatch/resolve/') && req.method === 'GET') {
      const parts = path.slice('/api/tv/livewatch/resolve/'.length).split('/');
      const kind = parts.shift() || '';
      const id = decodeURIComponent(parts.join('/'));
      return json(res, 200, await resolveLiveWatchVipPlayback(kind, id, {
        forceRefresh: requestUrl.searchParams.get('refresh') === '1',
        name: requestUrl.searchParams.get('name') || '',
        country: requestUrl.searchParams.get('country') || '',
        source: requestUrl.searchParams.get('source') || ''
      }));
    }

    if (path.startsWith('/api/tv/livewatch/hls/') && req.method === 'GET') {
      const parts = path.slice('/api/tv/livewatch/hls/'.length).split('/');
      const kind = decodeURIComponent(parts.shift() || '');
      const id = decodeURIComponent(parts.join('/'));
      const selector = requestUrl.searchParams.get('sel') || '';
      const resourceKey = requestUrl.searchParams.get('res') || '';
      if (resourceKey) await proxyLiveWatchVipHlsMediaResource(kind, id, selector, resourceKey, req, res);
      else await proxyLiveWatchVipHls(kind, id, selector, req, res);
      return;
    }

    if (path.startsWith('/api/tv/livewatch/stream/') && req.method === 'GET') {
      const parts = path.slice('/api/tv/livewatch/stream/'.length).split('/');
      const kind = parts.shift() || '';
      const id = decodeURIComponent(parts.join('/'));
      await proxyLiveWatchVipStream(kind, id, req, res);
      return;
    }

    if (path.startsWith('/api/tv/streamsports99/stream/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      await proxyStreamSports99ResolvedStream(token, req, res);
      return;
    }

    if (path.startsWith('/api/tv/volkamax/embed/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      await proxyVolkamaxEmbed(token, res, requestUrl.searchParams.get('mobile') === '1');
      return;
    }

    if (path.startsWith('/api/tv/alternative/open/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      await proxyAlternativeBrowser(token, res, requestUrl.searchParams.get('mobile') === '1');
      return;
    }

    if (path.startsWith('/api/tv/stream/') && req.method === 'GET') {
      const token = path.split('/').at(-1) || '';
      await proxyTvStream(token, req, res);
      return;
    }

    if (path.startsWith('/api/tv/stream/') && req.method === 'HEAD') {
      headTvStream(path.split('/').at(-1) || '', res);
      return;
    }

    if (path === '/api/discovery' && req.method === 'GET') {
      if (requestUrl.searchParams.get('force') === '1') {
        const userKey = session?.user?.Id || 'guest';
        for (const key of discoveryCache.keys()) if (key.endsWith(`:${userKey}`)) discoveryCache.delete(key);
        tasteProfileCache.delete(userKey);
      }
      return json(res, 200, await discoveryResults(
        requestUrl.searchParams.get('category') || 'smart',
        requestUrl.searchParams.get('provider') || '',
        session,
        requestUrl.searchParams.get('mode') || 'balanced',
        requestUrl.searchParams.get('genre') || '',
        requestUrl.searchParams.get('page') || 1
      ));
    }

    if (path === '/api/discovery/enrich' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const requested = Array.isArray(body?.items) ? body.items.slice(0, 12) : [];
      const items = requested.map(item => ({
        id: positiveInteger(item?.id),
        mediaType: item?.mediaType === 'tv' ? 'tv' : 'movie'
      })).filter(item => item.id);
      const results = await enrichDiscoveryStatuses(items);
      return json(res, 200, {
        results: results.map(item => ({
          id: item.id,
          mediaType: item.mediaType,
          requestState: item.requestState,
          resolvedServiceId: item.resolvedServiceId || null,
          legalPlatforms: item.legalPlatforms || []
        }))
      });
    }

    if (path === '/api/discovery/feedback' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 200, await saveDiscoveryFeedback(session, body));
    }

    if (path === '/api/discovery/providers' && req.method === 'GET') {
      return json(res, 200, await discoveryProviders(requestUrl.searchParams.get('type') || 'movie'));
    }

    if (path === '/api/discovery/availability' && req.method === 'GET') {
      return json(res, 200, await prowlarrAvailability(
        requestUrl.searchParams.get('mediaType') === 'tv' ? 'tv' : 'movie',
        requestUrl.searchParams.get('title') || '',
        requestUrl.searchParams.get('year') || '',
        {
          tmdbId: requestUrl.searchParams.get('tmdbId'),
          force: requestUrl.searchParams.get('force') === '1' || requestUrl.searchParams.get('live') === '1',
          limit: Number(requestUrl.searchParams.get('limit') || 8)
        }
      ));
    }

    if (path === '/api/discovery/download-options' && req.method === 'GET') {
      return json(res, 200, { destinations: await qbitAllowedDestinations() });
    }
    if (path === '/api/discovery/grab' && req.method === 'POST') {
      return json(res, 200, await grabDiscoveryTorrent(await readJsonBody(req)));
    }


    if (path === '/api/media/detail' && req.method === 'GET') {
      const mediaType = requestUrl.searchParams.get('mediaType') === 'tv' ? 'tv' : 'movie';
      const id = positiveInteger(requestUrl.searchParams.get('id'));
      if (!id) return json(res, 400, { error: 'Identifiant média invalide.' });
      return json(res, 200, await noctraMediaDetail(
        mediaType,
        id,
        requestUrl.searchParams.get('title') || '',
        requestUrl.searchParams.get('year') || '',
        requestUrl.searchParams.get('forceTrackers') === '1'
      ));
    }

    if (path === '/api/roulette' && req.method === 'GET') {
      let filters;
      try { filters = rouletteFilters(requestUrl.searchParams); }
      catch (error) { throw new HttpError(400, error.message); }
      const catalog = await libraries(session);
      if (filters.library && !Object.values(catalog).some(lib => lib?.id === filters.library)) {
        throw new HttpError(403, 'Cette médiathèque n’est pas accessible à ton compte.');
      }
      return json(res, 200, await drawRoulette({ filters, libraries: catalog,
        items: params => jellyfinItems('/Users/{userId}/Items', params, session),
        imageUrl: item => publicPath(`/api/jellyfin/image/${encodeURIComponent(item.Id)}?tag=${encodeURIComponent(item.ImageTags.Primary)}`)
      }));
    }

    if (path === '/api/library/series-status' && req.method === 'GET') {
      if (!session?.user?.Id) throw new HttpError(401, 'Connexion requise.');
      const id = requestUrl.searchParams.get('id') || '';
      if (!/^[a-f0-9-]{32,36}$/i.test(id)) throw new HttpError(400, 'Identifiant invalide.');
      // Resolve through the signed-in user's library before using cached results.
      const item = await jellyfinItems(`/Users/{userId}/Items/${id}`, {}, session);
      if (item.Type !== 'Series') return json(res, 200, {state:'not-series'});
      const key = `${session.user.Id}:${id}`;
      let cached = seriesStatusCache.get(key);
      if (!cached || cached.until < Date.now()) {
        const owned = [];
        for (let offset = 0; ; offset += 500) {
          const page = await jellyfinItems('/Users/{userId}/Items', {ParentId:id, Recursive:true,
            IncludeItemTypes:'Episode', Fields:'ProviderIds,Path', StartIndex:offset, Limit:500,
            EnableImages:false, EnableUserData:false}, session);
          if (!Array.isArray(page)) throw new HttpError(502, 'Inventaire indisponible.');
          owned.push(...page.map(e => ({...e, fileState:e.IsMissing || e.IsVirtualItem || e.LocationType === 'Virtual' ? 'missing' : 'present'})));
          if (page.length < 500) break;
        }
        let managed = null;
        try {
          const tvdb = Object.entries(item.ProviderIds || {}).find(([key]) => key.toLowerCase() === 'tvdb')?.[1];
          const match = tvdb && (await getArrCatalog('sonarr')).find(s => String(s.tvdbId) === String(tvdb));
          if (match) {
            const episodes = await arr(process.env.SONARR_URL, process.env.SONARR_API_KEY, `/api/v3/episode?seriesId=${match.id}`);
            if (Array.isArray(episodes) && episodes.length) managed = {...match, episodes};
          }
        } catch {}
        const result = await seriesStatus(item, owned, completenessMetadata, Date.now(), managed);
        cached = {until:Date.now() + 60_000, result:{...result,checkedAt:new Date().toISOString()}};
        if (seriesStatusCache.size >= 256) seriesStatusCache.delete(seriesStatusCache.keys().next().value);
        seriesStatusCache.set(key, cached);
      }
      res.setHeader('Cache-Control', 'no-store');
      return json(res, 200, cached.result);
    }

    if (path === '/api/home/resume' && req.method === 'GET') {
      if (!session?.user?.Id) throw new HttpError(401, 'Connexion requise.');
      const rawItems = await jellyfinItems('/Users/{userId}/Items/Resume', {
        Limit: 36, MediaTypes: 'Video', EnableUserData: true,
        Fields: 'PrimaryImageAspectRatio', EnableTotalRecordCount: false
      }, session);
      const items = strictResumeItems(rawItems, 12);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Vary', 'Cookie, X-Noctra-Token');
      return json(res, 200, { userId: session.user.Id, items });
    }

    if (path === '/api/libraries') {
      return json(res, 200, await libraries(session));
    }

    if (path === '/api/libraries/refresh' && req.method === 'POST') {
      const before = await jellyfinLibraryRefreshStatus(session);
      if (before.running || before.phase === 'starting') return json(res, 200, { ok: true, ...before });
      libraryRefreshMonitor.baselineEnd = Date.parse(before.lastExecution?.EndTimeUtc || '') || 0;
      libraryRefreshMonitor.requestedAt = Date.now();
      libraryRefreshMonitor.observedRunning = false;
      libraryRefreshMonitor.finishedAt = 0;
      await remote(`${jellyfinUrl}/Library/Refresh`, {
        method: 'POST',
        headers: jellyfinHeaders({}, session?.token)
      }).catch(error => { libraryRefreshMonitor.requestedAt = 0; throw error; });
      const status = await jellyfinLibraryRefreshStatus(session).catch(() => ({
        running: false,
        phase: 'starting',
        progress: 0,
        message: 'Démarrage de l’analyse des médiathèques…'
      }));
      return json(res, 200, { ok: true, ...status });
    }

    if (path === '/api/libraries/refresh' && req.method === 'GET') {
      return json(res, 200, await jellyfinLibraryRefreshStatus(session));
    }

    if (path === '/api/jellyfin/identify/context' && req.method === 'GET') {
      const itemId = requestUrl.searchParams.get('itemId');
      if (!validJellyfinItemId(itemId)) {
        return json(res, 400, { error: 'Identifiant Jellyfin invalide.' });
      }
      return json(res, 200, await jellyfinIdentificationContext(itemId, session));
    }

    if (path === '/api/jellyfin/identify/search' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!validJellyfinItemId(body.itemId)) {
        return json(res, 400, { error: 'Identifiant Jellyfin invalide.' });
      }
      const searchInfo = identificationSearchInfo(body.searchInfo);
      if (!searchInfo.Name && !Object.keys(searchInfo.ProviderIds).length) {
        return json(res, 400, { error: 'Indique au moins un nom ou un identifiant externe.' });
      }
      return json(res, 200, await searchJellyfinIdentification(body.itemId, searchInfo, session));
    }

    if (path === '/api/jellyfin/identify/apply' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!validJellyfinItemId(body.itemId) || !body.result || typeof body.result !== 'object') {
        return json(res, 400, { error: 'Résultat d’identification invalide.' });
      }
      return json(res, 202, startIdentificationJob(
        body.itemId,
        body.result,
        body.replaceAllImages,
        session
      ));
    }

    if (path === '/api/jellyfin/identify/apply-status' && req.method === 'GET') {
      pruneIdentificationJobs();
      const job = identificationJobs.get(requestUrl.searchParams.get('jobId'));
      if (!job || job.ownerId !== session.user.Id) {
        return json(res, 404, { error: 'Tâche d’identification introuvable.' });
      }
      return json(res, 200, publicIdentificationJob(job));
    }

    if (path.startsWith('/api/jellyfin/image/') && req.method === 'GET') {
      const itemId = path.split('/').at(-1);
      if (!/^[a-f0-9]{32}$/i.test(itemId || '')) {
        return json(res, 400, { error: 'Image Jellyfin invalide.' });
      }
      const target = new URL(`${jellyfinUrl}/Items/${itemId}/Images/Primary`);
      target.searchParams.set('maxWidth', '1200');
      target.searchParams.set('quality', '92');
      const tag = requestUrl.searchParams.get('tag');
      if (tag) target.searchParams.set('tag', tag);
      const imageResponse = await remote(target, {
        headers: jellyfinHeaders({}, session?.token)
      });
      const image = Buffer.from(await imageResponse.arrayBuffer());
      res.writeHead(200, {
        'content-type': imageResponse.headers.get('content-type') || 'image/jpeg',
        'cache-control': 'private, max-age=86400',
        'content-length': image.length
      });
      res.end(image);
      return;
    }

    if (path === '/api/downloads' && req.method === 'GET' && requestUrl.searchParams.has('relinkPreview')) {
      return json(res, 200, await downloadRelinkPreview());
    }

    if (path === '/api/downloads' && req.method === 'POST' && requestUrl.searchParams.has('relinkStart')) {
      return json(res, 202, startDownloadRelinkJob());
    }

    if (path === '/api/downloads/relink/preview' && req.method === 'GET') {
      return json(res, 200, await downloadRelinkPreview());
    }

    if (path === '/api/downloads/relink/status' && req.method === 'GET') {
      return json(res, 200, publicDownloadRelinkJob());
    }

    if (path === '/api/downloads/relink/start' && req.method === 'POST') {
      return json(res, 202, startDownloadRelinkJob());
    }

    if (path === '/api/downloads/add' && req.method === 'POST') {
      const body = await readJsonBody(req, 12 * 1024 * 1024);
      return json(res, 201, await qbitAddTorrent(body));
    }

    if (path === '/api/downloads') {
      return json(res, 200, await downloadState());
    }

    if (path.startsWith('/api/downloads/') && req.method === 'GET') {
      const [, , , hash, action] = path.split('/');
      if (!hash || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(hash)) return json(res, 400, { error: 'Torrent invalide.' });
      if (action !== 'details') return json(res, 404, { error: 'Détail introuvable.' });
      return json(res, 200, await qbitTorrentDetails(hash));
    }

    if (path.startsWith('/api/downloads/') && req.method === 'POST') {
      const [, , , hash, action] = path.split('/');
      if (!hash || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(hash)) return json(res, 400, { error: 'Torrent invalide.' });
      if (action === 'delete') {
        const body = await readJsonBody(req);
        if (typeof body.deleteFiles !== 'boolean') return json(res, 400, { error: 'Le choix de suppression des fichiers est requis.' });
        await qbitDelete(hash, body.deleteFiles);
        return json(res, 200, { ok: true, filesDeleted: body.deleteFiles });
      }
      if (['recheck', 'reannounce', 'top', 'bottom'].includes(action)) {
        await qbitMaintenanceAction(hash, action);
        return json(res, 200, { ok: true, action });
      }
      if (!['pause', 'resume'].includes(action)) return json(res, 400, { error: 'Action invalide.' });
      await qbitAction(hash, action);
      return json(res, 200, { ok: true });
    }

    if (path === '/api/jellyseerr/search') {
      const query = requestUrl.searchParams.get('q') || '';
      const results = await jellyseerr(`/api/v1/search?query=${encodeURIComponent(query)}`);
      return json(res, 200, await enrichJellyseerrResults(results));
    }

    if (path === '/api/jellyseerr/requests') {
      const requests = await jellyseerr('/api/v1/request?take=100&skip=0&sort=added&sortDirection=desc');
      let requestOwner = null;
      if (!session.isAdmin) {
        requestOwner = await jellyseerrUserFor(session).catch(() => null);
        requests.results = requestOwner
          ? (requests.results || []).filter(item => requestBelongsToJellyseerrUser(item, requestOwner, session))
          : [];
      }
      const [sonarrSeries, radarrMovies] = await Promise.all([
        getArrCatalog('sonarr').catch(() => []),
        getArrCatalog('radarr').catch(() => [])
      ]);
      requests.results = (requests.results || []).map(item => {
        const media = item.media || {};
        const serviceId = Number(item.media?.externalServiceId);
        const isSeries = item.type === 'tv' || media.mediaType === 'tv';
        const type = isSeries ? 'sonarr' : 'radarr';
        const resolved = resolveArrContent(type, {
          ...media,
          externalServiceId: serviceId,
          title: item.title || item.name || media.title || media.name
        }, isSeries ? sonarrSeries : radarrMovies);
        return {
          ...item,
          displayTitle: resolved?.item.title || item.title || item.name || media.title || media.name || null,
          mediaType: isSeries ? 'tv' : 'movie',
          ...identifiedPayload(resolved)
        };
      });
      // V90 : l'historique ne fait plus des vagues séquentielles de requêtes.
      // Les 30 lignes les plus récentes sont enrichies en parallèle avec une
      // concurrence bornée et un cache de 6 h ; les plus anciennes restent
      // immédiatement administrables même si leur affiche manque.
      const recentRows = requests.results.slice(0, 30);
      const enrichedRecent = await mapWithConcurrency(recentRows, 8, async item => {
        const tmdbId = positiveInteger(item?.media?.tmdbId);
        if (!tmdbId || (item.displayTitle && item.posterPath)) return item;
        const mediaType = item.mediaType === 'tv' ? 'tv' : 'movie';
        const detail = await requestMetadataDetail(mediaType, tmdbId);
        if (!detail) return item;
        return {
          ...item,
          displayTitle: item.displayTitle || detail?.title || detail?.name || null,
          posterPath: detail?.posterPath || detail?.poster_path || null,
          backdropPath: detail?.backdropPath || detail?.backdrop_path || null,
          overview: detail?.overview || '',
          releaseDate: detail?.releaseDate || detail?.release_date || detail?.firstAirDate || detail?.first_air_date || ''
        };
      });
      requests.results.splice(0, enrichedRecent.length, ...enrichedRecent);
      const summary = (requests.results || []).reduce((acc, item) => {
        acc.total += 1;
        if (Number(item?.status) === 1) acc.pending += 1;
        else if (Number(item?.status) === 2) acc.approved += 1;
        else if (Number(item?.status) === 3) acc.declined += 1;
        else acc.other += 1;
        if ((item.mediaType || item?.media?.mediaType) === 'tv') acc.tv += 1;
        else acc.movie += 1;
        return acc;
      }, { total: 0, pending: 0, approved: 0, declined: 0, other: 0, movie: 0, tv: 0 });
      const quota = session.isAdmin
        ? { limit: noctraPendingRequestLimit, pending: (requests.results || []).filter(item => Number(item?.status) === 1).length, remaining: null, enforced: false }
        : await jellyseerrPendingQuota(session, requestOwner).catch(() => ({ limit: noctraPendingRequestLimit, pending: 0, remaining: noctraPendingRequestLimit, enforced: true }));
      return json(res, 200, { ...requests, quota, summary });
    }

    if (path === '/api/jellyseerr/requests/clear-pending' && req.method === 'POST') {
      requireAdministrator(session);
      const pending = await jellyseerr('/api/v1/request?take=1000&skip=0&filter=pending&sort=added&sortDirection=desc');
      const rows = (pending.results || []).filter(item => Number(item?.status) === 1 && Number(item?.id) > 0);
      let removed = 0;
      const failures = [];
      for (let index = 0; index < rows.length; index += 6) {
        const chunk = rows.slice(index, index + 6);
        const settled = await Promise.allSettled(chunk.map(item => jellyseerr(`/api/v1/request/${Number(item.id)}`, { method: 'DELETE' })));
        settled.forEach((result, offset) => {
          if (result.status === 'fulfilled') removed += 1;
          else failures.push({ id: Number(chunk[offset]?.id || 0), error: cleanError(result.reason) });
        });
      }
      return json(res, 200, { ok: true, removed, failed: failures.length, failures, message: `${removed} demande${removed > 1 ? 's' : ''} en attente supprimée${removed > 1 ? 's' : ''}.` });
    }

    const requestStatusMatch = path.match(/^\/api\/jellyseerr\/request\/(\d+)\/(approve|decline)$/);
    if (requestStatusMatch && req.method === 'POST') {
      requireAdministrator(session);
      const requestId = Number(requestStatusMatch[1]);
      const status = requestStatusMatch[2];
      const result = await jellyseerr(`/api/v1/request/${requestId}/${status}`, { method: 'POST' });
      return json(res, 200, { ok: true, request: result });
    }

    const requestDeleteMatch = path.match(/^\/api\/jellyseerr\/request\/(\d+)$/);
    if (requestDeleteMatch && req.method === 'DELETE') {
      const requestId = Number(requestDeleteMatch[1]);
      if (!session.isAdmin) {
        const owner = await jellyseerrUserFor(session, true);
        const ownerId = Number(owner?.id);
        if (!Number.isInteger(ownerId) || ownerId < 1) throw new HttpError(403, 'Compte Jellyseerr introuvable.');
        const pending = await jellyseerr(`/api/v1/request?take=100&skip=0&filter=pending&requestedBy=${ownerId}`);
        const allowed = (pending.results || []).some(item => Number(item?.id) === requestId && Number(item?.status) === 1 && requestBelongsToJellyseerrUser(item, owner, session));
        if (!allowed) throw new HttpError(403, 'Tu peux annuler uniquement une de tes demandes encore en attente.');
      }
      await jellyseerr(`/api/v1/request/${requestId}`, { method: 'DELETE' });
      return json(res, 200, { ok: true, requestId });
    }

    if (path === '/api/jellyseerr/trending') {
      const results = await jellyseerr('/api/v1/discover/trending');
      return json(res, 200, await enrichJellyseerrResults(results));
    }

    if (path === '/api/jellyseerr/destinations') {
      const mediaType = requestUrl.searchParams.get('mediaType');
      if (!['movie', 'tv'].includes(mediaType)) return json(res, 400, { error: 'Type de média invalide.' });
      const mediaId = positiveInteger(requestUrl.searchParams.get('mediaId'));
      const destinations = await jellyseerrDestinations(mediaType);
      const requestPolicy = mediaType === 'tv' && mediaId
        ? await seriesRequestPolicyFor(mediaId)
        : { status: null, forceAutomatic: false, completed: false, reason: null };
      if (session.isAdmin) return json(res, 200, { ...destinations, requestPolicy });
      return json(res, 200, {
        ...destinations,
        requestPolicy,
        servers: destinations.servers.map(server => ({
          id: server.id,
          name: server.name,
          isDefault: server.isDefault,
          is4k: server.is4k,
          preventSearch: Boolean(server.preventSearch),
          defaultProfileId: server.defaultProfileId,
          defaultRootFolderLabel: server.defaultRootFolder.split('/').filter(Boolean).at(-1) || 'Rangement automatique',
          profiles: server.profiles
        }))
      });
    }

    if (path === '/api/jellyseerr/request' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const mediaType = body.mediaType;
      const mediaId = Number(body.mediaId);
      if (!['movie', 'tv'].includes(mediaType) || !Number.isInteger(mediaId) || mediaId < 1) {
        return json(res, 400, { error: 'Demande invalide.' });
      }

      const requestPayload = { mediaType, mediaId };
      if (!session.isAdmin) {
        const requester = await jellyseerrUserFor(session, true);
        const requesterId = Number(requester?.id);
        if (!Number.isInteger(requesterId) || requesterId < 1) {
          throw new HttpError(
            409,
            'Ton compte Jellyfin doit d’abord être importé dans Jellyseerr pour pouvoir envoyer une demande.'
          );
        }
        const quota = await jellyseerrPendingQuota(session, requester);
        if (quota.pending >= quota.limit) {
          throw new HttpError(429, `Tu as déjà ${quota.limit} demandes en attente. Une nouvelle demande sera disponible dès qu'une demande est approuvée, refusée ou annulée.`);
        }
        requestPayload.userId = requesterId;
      }
      // Toujours envoyer à Jellyseerr une destination réellement disponible.
      // Son profil actif peut rester configuré sur un identifiant supprimé dans
      // Radarr/Sonarr ; la valeur de secours est donc recalculée à chaque demande.
      const destinations = await jellyseerrDestinations(mediaType);
      if (!destinations.servers.length) {
        const missing = destinations.unavailableServers
          .map(server => `${server.name} (${server.missing.join(' et ')} manquant${server.missing.length > 1 ? 's' : ''})`)
          .join(', ');
        throw new HttpError(409, missing
          ? `Aucune destination Jellyseerr utilisable : ${missing}.`
          : `Aucun serveur ${mediaType === 'tv' ? 'Sonarr' : 'Radarr'} utilisable n’est configuré dans Jellyseerr.`);
      }
      const requestedServerId = Number(body.serverId);
      const requestPolicy = mediaType === 'tv'
        ? await seriesRequestPolicyFor(mediaId)
        : { status: null, forceAutomatic: false, completed: false, reason: null };
      const requestedSelectionMode = body.selectionMode === 'manual' ? 'manual' : 'auto';
      const selectionMode = requestPolicy.forceAutomatic ? 'auto' : requestedSelectionMode;
      const modeServers = destinations.servers.filter(server => selectionMode === 'manual' ? server.preventSearch : !server.preventSearch);
      const selectedServer = modeServers.find(server => server.id === requestedServerId)
        || modeServers.find(server => server.isDefault)
        || modeServers[0]
        || destinations.servers.find(server => server.id === requestedServerId)
        || destinations.servers.find(server => server.isDefault)
        || destinations.servers[0];
      if (selectionMode === 'manual' && !selectedServer?.preventSearch) {
        throw new HttpError(409, 'Le mode manuel nécessite une destination Jellyseerr avec la recherche automatique désactivée.');
      }
      if (selectionMode === 'auto' && selectedServer?.preventSearch) {
        throw new HttpError(409, requestPolicy.forceAutomatic
          ? 'Cette série est encore en cours et doit rester en automatique. Configure une destination Sonarr avec « Automatic Search » activé.'
          : 'Cette destination est configurée en mode manuel. Choisis une destination automatique ou le mode manuel.');
      }
      const requestedProfileId = Number(body.profileId);
      const profileId = selectedServer.profiles.some(profile => profile.id === requestedProfileId)
        ? requestedProfileId
        : selectedServer.defaultProfileId;
      const requestedRootFolder = String(body.rootFolder || '').trim();
      const rootFolder = session.isAdmin && selectedServer.rootFolders.some(folder => folder.path === requestedRootFolder)
        ? requestedRootFolder
        : selectedServer.defaultRootFolder;
      if (!selectedServer.profiles.some(profile => profile.id === profileId)) {
        throw new HttpError(409, `Aucun profil qualité valide n’est disponible sur ${selectedServer.name}.`);
      }
      if (!selectedServer.rootFolders.some(folder => folder.path === rootFolder)) {
        throw new HttpError(409, `Aucun dossier racine valide n’est disponible sur ${selectedServer.name}.`);
      }
      Object.assign(requestPayload, {
        serverId: selectedServer.id,
        profileId,
        rootFolder,
        is4k: selectedServer.is4k,
        ...(mediaType === 'tv' ? { seasons: 'all' } : {})
      });
      const result = await jellyseerr('/api/v1/request', {
        method: 'POST',
        body: JSON.stringify(requestPayload)
      });
      const identification = await identifyRequestedContent(mediaType, {
        ...result,
        ...(result.media || {}),
        id: mediaId,
        tmdbId: result.media?.tmdbId || mediaId,
        title: String(body.title || result.title || result.media?.title || ''),
        year: body.year || result.media?.year || null
      });
      return json(res, 200, { ...result, ...identification, selectionMode, requestPolicy, preventSearch: Boolean(selectedServer.preventSearch) });
    }


    if (path === '/api/servarr/center' && req.method === 'GET') {
      const type = requestUrl.searchParams.get('type');
      const view = requestUrl.searchParams.get('view') || 'overview';
      return json(res, 200, await arrCenter(type, view, requestUrl.searchParams));
    }

    if (path === '/api/servarr/lookup' && req.method === 'GET') {
      return json(res, 200, {
        type: requestUrl.searchParams.get('type'),
        results: await arrLookup(requestUrl.searchParams.get('type'), requestUrl.searchParams.get('q') || '')
      });
    }

    if (path === '/api/servarr/add' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 200, await addArrItem(body.type, body));
    }

    if (path === '/api/servarr/monitor' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const id = positiveInteger(body.id);
      if (!id) return json(res, 400, { error: 'Élément Arr invalide.' });
      return json(res, 200, await setArrMonitored(body.type, id, body.monitored));
    }

    if (path === '/api/servarr/command' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 202, await runArrCommand(body.type, body));
    }

    if (path === '/api/sonarr') {
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
      const status = await arr(process.env.SONARR_URL, process.env.SONARR_API_KEY, '/api/v3/system/status');
      const calendar = await arr(process.env.SONARR_URL, process.env.SONARR_API_KEY, `/api/v3/calendar?start=${start}&end=${end}`);
      const queue = await arr(process.env.SONARR_URL, process.env.SONARR_API_KEY, '/api/v3/queue?pageSize=25');
      const series = await arr(process.env.SONARR_URL, process.env.SONARR_API_KEY, '/api/v3/series');
      return json(res, 200, {
        version: status.version,
        monitored: series.filter(item => item.monitored).length,
        total: series.length,
        calendar: calendar.slice(0, 30),
        queue: queue.records || []
      });
    }

    if (path === '/api/radarr') {
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
      const status = await arr(process.env.RADARR_URL, process.env.RADARR_API_KEY, '/api/v3/system/status');
      const calendar = await arr(process.env.RADARR_URL, process.env.RADARR_API_KEY, `/api/v3/calendar?start=${start}&end=${end}`);
      const queue = await arr(process.env.RADARR_URL, process.env.RADARR_API_KEY, '/api/v3/queue?pageSize=25');
      const movies = await arr(process.env.RADARR_URL, process.env.RADARR_API_KEY, '/api/v3/movie');
      return json(res, 200, {
        version: status.version,
        monitored: movies.filter(item => item.monitored).length,
        total: movies.length,
        calendar: calendar.slice(0, 30),
        queue: queue.records || []
      });
    }

    if (path === '/api/prowlarr/indexer-context' && req.method === 'GET') {
      const id = positiveInteger(requestUrl.searchParams.get('id'));
      const [schemas, profiles, clients] = await Promise.all([prowlarrIndexerSchemas(), prowlarrRequest('/api/v1/appprofile'), prowlarrRequest('/api/v1/downloadclient')]);
      return json(res, 200, {
        indexer: id ? publicIndexer((await prowlarrRequest(`/api/v1/indexer/${id}`)).payload) : null,
        template: (() => { const schema = schemas.find(entry => entry.key === requestUrl.searchParams.get('schema')) || schemas.find(entry => entry.item.implementation === 'Torznab'); return schema ? publicIndexer(schema.item, schema.key) : null; })(),
        schemas: schemas.map(schema => ({ schemaId: schema.key, name: schema.item.name, protocol: schema.item.protocol })).sort((a, b) => a.name.localeCompare(b.name)),
        profiles: profiles.payload.map(item => ({ id: item.id, name: item.name })),
        clients: clients.payload.map(item => ({ id: item.id, name: item.name }))
      });
    }
    if (['/api/prowlarr/indexer', '/api/prowlarr/indexer/test'].includes(path) && req.method === 'POST') {
      return json(res, 200, await saveProwlarrIndexer(await readJsonBody(req), path.endsWith('/test')));
    }
    if (path === '/api/prowlarr' && req.method === 'GET') {
      const responses = await Promise.all(['/api/v1/system/status', '/api/v1/health', '/api/v1/indexer'].map(endpoint => prowlarrRequest(endpoint)));
      const [status, health, indexers] = responses.map(response => response.payload);
      return json(res, 200, {
        version: status.version,
        health,
        indexers: indexers.map(item => ({
          id: item.id,
          name: item.name,
          protocol: item.protocol,
          enabled: item.enable
        }))
      });
    }

    if (path === '/api/servarr/catalog') {
      const type = requestUrl.searchParams.get('type');
      const query = (requestUrl.searchParams.get('q') || '').trim().toLocaleLowerCase('fr');
      if (!['sonarr', 'radarr'].includes(type)) return json(res, 400, { error: 'Service invalide.' });
      const isSonarr = type === 'sonarr';
      const items = await getArrCatalog(type);
      const filtered = items
        .filter(item => !query || String(item.title || '').toLocaleLowerCase('fr').includes(query))
        .slice(0, 40)
        .map(item => ({
          id: item.id,
          title: item.title,
          year: item.year || item.firstAired?.slice(0, 4) || '',
          monitored: Boolean(item.monitored),
          status: item.status || '',
          hasFile: isSonarr ? (item.statistics?.episodeFileCount || 0) > 0 : Boolean(item.hasFile),
          tmdbId: item.tmdbId || null,
          tvdbId: item.tvdbId || null
        }));
      return json(res, 200, { type, items: filtered });
    }

    if (path === '/api/servarr/releases') {
      const type = requestUrl.searchParams.get('type');
      const id = Number(requestUrl.searchParams.get('id'));
      const seriesId = Number(requestUrl.searchParams.get('seriesId'));
      const seasonNumber = Number(requestUrl.searchParams.get('seasonNumber'));
      const allSeasons = requestUrl.searchParams.get('allSeasons') === '1';
      if (!['sonarr', 'radarr'].includes(type)) {
        return json(res, 400, { error: 'Recherche invalide.' });
      }
      const isSonarr = type === 'sonarr';
      if (!isSonarr && (!Number.isInteger(id) || id < 1)) return json(res, 400, { error: 'Film invalide.' });
      if (isSonarr && (!Number.isInteger(seriesId) || seriesId < 1) && (!Number.isInteger(id) || id < 1)) {
        return json(res, 400, { error: 'Série ou épisode invalide.' });
      }
      if (isSonarr && seriesId > 0 && !allSeasons && (!Number.isInteger(seasonNumber) || seasonNumber < 1)) return json(res, 400, { error: 'Saison invalide.' });
      const searchKey = JSON.stringify([type, id, seriesId, seasonNumber, allSeasons]);
      const job = interactiveSearches.get(searchKey, async report => {
      let searchKind = isSonarr ? 'episode' : 'movie';
      let summaries = [];
      const warnings = [];
      if (isSonarr && Number.isInteger(seriesId) && seriesId > 0) {
        if (allSeasons) {
          searchKind = 'series';
          const episodes = await arr(process.env.SONARR_URL, process.env.SONARR_API_KEY, `/api/v3/episode?seriesId=${seriesId}`);
          const seasons = [...new Set(episodes.map(item => Number(item.seasonNumber)).filter(number => Number.isInteger(number) && number > 0))]
            .sort((left, right) => left - right);
          let completed = 0;
          const partial = new Map();
          report({ searchKind, total: seasons.length, completed: 0 });
          const perSeason = await mapWithConcurrency(seasons, 2, async requestedSeason => {
            const rows = await arrRequest(
              process.env.SONARR_URL,
              process.env.SONARR_API_KEY,
              `/api/v3/release?seriesId=${seriesId}&seasonNumber=${requestedSeason}`, { timeoutMs: 45000 }
            ).catch(() => { warnings.push(`Saison ${requestedSeason} : indexeurs indisponibles.`); return []; });
            const found = rows.map(item => releaseSummary({ ...item, requestedSeason }));
            found.filter(item => item.seriesPack).forEach(item => partial.set(`${item.indexerId}:${item.guid}`, item));
            report({ completed: ++completed, ...collectSeriesPacks([...partial.values()]), warnings: [...warnings] });
            return found;
          });
          const unique = new Map();
          for (const release of perSeason.flat().filter(item => item.seriesPack)) {
            const key = `${release.indexerId}:${release.guid}`;
            if (!unique.has(key)) unique.set(key, release);
          }
          summaries = [...unique.values()];
        } else {
          searchKind = 'season';
          const releases = await arrRequest(
            process.env.SONARR_URL,
            process.env.SONARR_API_KEY,
            `/api/v3/release?seriesId=${seriesId}&seasonNumber=${seasonNumber}`, { timeoutMs: 45000 }
          );
          summaries = releases.map(item => releaseSummary({ ...item, requestedSeason: seasonNumber }));
        }
      } else {
        const releases = await arrRequest(
          isSonarr ? process.env.SONARR_URL : process.env.RADARR_URL,
          isSonarr ? process.env.SONARR_API_KEY : process.env.RADARR_API_KEY,
          `/api/v3/release?${isSonarr ? 'episodeId' : 'movieId'}=${id}`, { timeoutMs: 45000 }
        );
        summaries = releases.map(releaseSummary);
      }
      return {
        type,
        id: Number.isInteger(id) && id > 0 ? id : null,
        seriesId: Number.isInteger(seriesId) && seriesId > 0 ? seriesId : null,
        seasonNumber: Number.isInteger(seasonNumber) && seasonNumber > 0 ? seasonNumber : null,
        searchKind,
        warnings,
        ...(searchKind === 'series' ? collectSeriesPacks(summaries) : {}),
        releases: sortReleaseSummaries(summaries, searchKind === 'season' || searchKind === 'series')
      };
      }, requestUrl.searchParams.get('force') === '1');
      if (requestUrl.searchParams.get('progress') === '1') return json(res, job.done ? 200 : 202, job.value);
      const result = await job.promise;
      return json(res, result.error ? 503 : 200, result);
    }

    if (path === '/api/servarr/episodes') {
      const seriesId = Number(requestUrl.searchParams.get('seriesId'));
      if (!Number.isInteger(seriesId) || seriesId < 1) return json(res, 400, { error: 'Série invalide.' });
      const episodes = await arr(
        process.env.SONARR_URL,
        process.env.SONARR_API_KEY,
        `/api/v3/episode?seriesId=${seriesId}`
      );
      return json(res, 200, {
        seriesId,
        seasons: [...new Set(episodes.map(item => item.seasonNumber).filter(number => number > 0))].sort((a, b) => b - a),
        episodes: episodes
          .filter(item => item.seasonNumber > 0)
          .sort((left, right) => {
            if (left.seasonNumber !== right.seasonNumber) return right.seasonNumber - left.seasonNumber;
            return right.episodeNumber - left.episodeNumber;
          })
          .map(item => ({
            id: item.id,
            seasonNumber: item.seasonNumber,
            episodeNumber: item.episodeNumber,
            absoluteEpisodeNumber: item.absoluteEpisodeNumber ?? null,
            title: item.title || `Épisode ${item.episodeNumber}`,
            airDate: item.airDateUtc || item.airDate || null,
            monitored: Boolean(item.monitored),
            hasFile: Boolean(item.hasFile)
          }))
      });
    }

    if (path === '/api/servarr/grab' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const type = body.type;
      const indexerId = Number(body.indexerId);
      if (!['sonarr', 'radarr'].includes(type) || typeof body.guid !== 'string' || body.guid.length < 3 || !Number.isInteger(indexerId)) {
        return json(res, 400, { error: 'Release invalide.' });
      }
      const isSonarr = type === 'sonarr';
      await arrRequest(
        isSonarr ? process.env.SONARR_URL : process.env.RADARR_URL,
        isSonarr ? process.env.SONARR_API_KEY : process.env.RADARR_API_KEY,
        '/api/v3/release',
        {
          method: 'POST',
          body: JSON.stringify({ guid: body.guid, indexerId })
        }
      );
      interactiveSearches.clear();
      return json(res, 200, { ok: true });
    }

    if (await serveStatic(path, res)) return;
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (error) {
    // Un relais média peut avoir déjà envoyé ses en-têtes quand l'amont ferme le
    // segment ou que le lecteur change de chaîne. Répondre ensuite en JSON ferait
    // lever ERR_HTTP_HEADERS_SENT et arrêterait tout le serveur Noctra.
    if (res.headersSent || res.writableEnded || res.destroyed) {
      if (!res.writableEnded && !res.destroyed) res.destroy(error);
      return;
    }
    if (error instanceof HttpError) {
      return json(res, error.status, { error: error.message });
    }
    json(res, 503, { error: 'Service indisponible', detail: cleanError(error) });
  }
});

async function removePidFile() {
  await unlink(pidPath).catch(() => undefined);
}

server.on('close', removePidFile);
server.on('error', error => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Noctra est déjà lancé sur ${host}:${port}.`);
  } else {
    console.error(error);
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)));
}

server.listen(port, host, async () => {
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(pidPath, String(process.pid), 'utf8');
  if (process.env.JELLYFIN_API_KEY && process.env.NOCTRA_AUTO_LIBRARY_REFRESH !== 'false') {
    const roots = [...new Set(mediaRoots.filter(root => root.id !== 'trash' && !/trash/i.test(root.label)).map(root => root.path))];
    if (roots.length) createMediaAutoRefresh({ roots, log: message => console.log('[Médiathèques]', message), refresh: async () => {
      const status = await jellyfinLibraryRefreshStatus();
      if (status.running || status.phase === 'starting') return false;
      await remote(`${jellyfinUrl}/Library/Refresh`, { method:'POST',headers:jellyfinHeaders() });
      libraryRefreshMonitor.requestedAt = Date.now();
      return true;
    }}).start();
  }
  console.log(`Noctra Media Client v200 - http://${host}:${port}${publicPath('/')}`);
  setTimeout(() => void iptvOrgLogoIndex().catch(() => undefined), 50);
  setTimeout(() => void tvCatalogFromLiveWatchCurated().catch(() => undefined), 250);
  setTimeout(() => void tvEpg(defaultTvEpgUrl).catch(() => undefined), 500);
});
