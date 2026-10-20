import { randomBytes } from 'node:crypto';

/**
 * Direct diffusé (Chromecast, AirPlay) : départ ~18 s avant le bord du direct plutôt que sur le
 * dernier segment. Le téléviseur garde ainsi une réserve : image et son ne saccadent plus à chaque
 * segment un peu lent à arriver depuis la source.
 */
export function withCastStart(text, seconds = 18) {
  if (!/#EXTINF:/.test(text) || /#EXT-X-ENDLIST|#EXT-X-START:/.test(text)) return text;
  const target = Number((text.match(/#EXT-X-TARGETDURATION:(\d+(?:\.\d+)?)/) || [])[1]) || 6;
  const total = [...text.matchAll(/#EXTINF:(\d+(?:\.\d+)?)/g)].reduce((sum, match) => sum + Number(match[1]), 0);
  const offset = Math.floor(Math.min(seconds, total - target * 1.5));
  if (offset < target) return text;
  return text.replace(/^#EXTM3U[^\n]*\n?/, head => `${head.endsWith('\n') ? head : head + '\n'}#EXT-X-START:TIME-OFFSET=-${offset},PRECISE=NO\n`);
}

// Le Chromecast ne transmet pas les en-têtes d'authentification du téléphone.
// Ce droit temporaire ne permet que la lecture de médias TV, jamais l'accès au compte.
export function createTvCastAccess({ basePath = '', now = Date.now, ttl = 6 * 60 * 60 * 1000 } = {}) {
  const grants = new Map();
  function mediaPath(value) {
    const path = basePath && value.startsWith(basePath + '/') ? value.slice(basePath.length) : value;
    return /^\/api\/tv\/(?:stream\/|livewatch\/hls\/|streamsports99\/stream\/|mosaic\/[a-f0-9]{24}\/)/.test(path);
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
      // Les relais appellent writeHead avant end. Garder les en-têtes modifiables
      // jusqu'au corps permet de réécrire une playlist et sa longueur réelle.
      const writeHead = res.writeHead;
      const write = res.write;
      const flushHeaders = res.flushHeaders;
      if (writeHead) {
        res.writeHead = function (status, message, headers) {
          this.statusCode = status;
          if (typeof message === 'string') this.statusMessage = message;
          else headers = message;
          const pairs = Array.isArray(headers)
            ? Array.from({ length: headers.length / 2 }, (_, i) => [headers[i * 2], headers[i * 2 + 1]])
            : Object.entries(headers || {});
          for (const [name, value] of pairs) this.setHeader(name, value);
          this.setHeader('access-control-allow-origin', '*');
          this.setHeader('cache-control', 'private, no-store');
          return this;
        };
        // Les segments restent diffusés en continu, sans mise en mémoire.
        if (write) res.write = function (...args) { this.writeHead = writeHead; return write.apply(this, args); };
        if (flushHeaders) res.flushHeaders = function (...args) { this.writeHead = writeHead; return flushHeaders.apply(this, args); };
      }
      const end = res.end;
      res.end = function (body, ...args) {
        const type = String(res.getHeader('content-type') || '').toLowerCase();
        if (!res.headersSent && body && (type.includes('mpegurl') || String(body).startsWith('#EXTM3U'))) {
          // Décoration à la sortie : les listes mises en cache restent sans droit d'accès.
          body = withCastStart(String(body).split(/\r?\n/).map(line => line.startsWith('#')
            ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${decorate(uri, key, playlistURL)}"`)
            : line.trim() ? decorate(line.trim(), key, playlistURL) : line).join('\n'));
          res.removeHeader('content-length');
        }
        if (writeHead) this.writeHead = writeHead;
        return end.call(this, body, ...args);
      };
      return true;
    }
  };
}
