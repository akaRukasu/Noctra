import { randomBytes } from 'node:crypto';

// Le Chromecast ne transmet pas les en-têtes d'authentification du téléphone.
// Ce droit temporaire ne permet que la lecture de médias TV, jamais l'accès au compte.
export function createTvCastAccess({ basePath = '', now = Date.now, ttl = 6 * 60 * 60 * 1000 } = {}) {
  const grants = new Map();
  function mediaPath(value) {
    const path = basePath && value.startsWith(basePath + '/') ? value.slice(basePath.length) : value;
    return /^\/api\/tv\/(?:stream\/|livewatch\/hls\/|streamsports99\/stream\/)/.test(path);
  }
  function grantFor(token) {
    const grant = grants.get(token);
    if (!grant || grant.expiresAt <= now()) { grants.delete(token); return null; }
    return grant;
  }
  function decorate(value, token, relativeTo) {
    const grant = grantFor(token);
    if (!grant) return value;
    let url;
    try { url = new URL(value, relativeTo || grant.origin); } catch { return value; }
    if (url.origin !== grant.origin || !mediaPath(url.pathname)) return value;
    url.searchParams.set('cast', token);
    return /^https?:\/\//i.test(value) ? url.href : url.pathname + url.search + url.hash;
  }
  return {
    mediaPath,
    issue({ token, path, origin }) {
      if (!token || !mediaPath(new URL(path, origin).pathname)) throw new Error('Flux TV incompatible avec la diffusion.');
      for (const [key, entry] of grants) if (entry.expiresAt <= now()) grants.delete(key);
      if (grants.size >= 1000) grants.delete(grants.keys().next().value);
      const key = randomBytes(32).toString('hex');
      const expiresAt = now() + ttl;
      grants.set(key, { token, origin, expiresAt });
      return { url: decorate(path, key), expiresAt };
    },
    tokenForRequest(req) {
      if (!['GET', 'HEAD'].includes(req.method)) return '';
      const url = new URL(req.url, 'http://localhost');
      if (!mediaPath(url.pathname)) return '';
      return grantFor(url.searchParams.get('cast'))?.token || '';
    },
    wrapResponse(req, res) {
      const url = new URL(req.url, 'http://localhost');
      const key = url.searchParams.get('cast');
      if (!mediaPath(url.pathname) || !grantFor(key)) return false;
      const playlistURL = new URL(req.url, grantFor(key).origin);
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS');
      res.setHeader('access-control-allow-headers', 'Range, Content-Type');
      res.setHeader('access-control-expose-headers', 'Content-Length, Content-Range, Accept-Ranges');
      res.setHeader('cache-control', 'private, no-store');
      const end = res.end;
      res.end = function (body, ...args) {
        const type = String(res.getHeader('content-type') || '').toLowerCase();
        if (body && (type.includes('mpegurl') || String(body).startsWith('#EXTM3U'))) {
          // Décoration à la sortie : les listes mises en cache restent sans droit d'accès.
          body = String(body).split(/\r?\n/).map(line => line.startsWith('#')
            ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${decorate(uri, key, playlistURL)}"`)
            : line.trim() ? decorate(line.trim(), key, playlistURL) : line).join('\n');
          res.removeHeader('content-length');
        }
        return end.call(this, body, ...args);
      };
      return true;
    }
  };
}
