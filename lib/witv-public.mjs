const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const currentHost = url => url.protocol === 'https:' && /^(?:www\.)?witv\.eu$/i.test(url.hostname) && !url.username && !url.password;

export function wiTvRequestHeaders(url, headers) {
  const media = url.searchParams.has('vp') || url.searchParams.get('json') === '1';
  const mediaOrigin = media && /^\/player\/source[1-9]\/?$/i.test(url.pathname) &&
    /^https:\/\/(?:www\.)?witv\.eu\/?$/i.test(headers.origin || '');
  if ((!currentHost(url) || !/^\/(?:chaines-live|player)\//i.test(url.pathname)) && !mediaOrigin) return headers;
  return {
    ...headers, 'user-agent': userAgent,
    'sec-fetch-site': currentHost(url) ? 'same-origin' : 'cross-site',
    'sec-fetch-mode': media ? 'cors' : 'navigate',
    'sec-fetch-dest': media ? 'empty' : url.pathname.startsWith('/player/') ? 'iframe' : 'document'
  };
}

// Decode only the literal public URL map. Never execute provider JavaScript.
export function parseWiTvPublishedPlayers(html, pageUrl) {
  const page = new URL(pageUrl);
  if (!currentHost(page)) return [];
  const encoded = html.match(/var _a=\[([\d,]{1,100000})\],_m=(\d{1,3})[,;]/);
  if (!encoded || Number(encoded[2]) > 255) return [];
  let mapping;
  try {
    const numbers = encoded[1].split(',');
    if (numbers.length > 20000 || numbers.some(number => Number(number) > 255)) return [];
    const fields = String.fromCharCode(...numbers.map(number => Number(number) ^ Number(encoded[2]))).split('|');
    mapping = JSON.parse(Buffer.from(fields[2] || '', 'base64').toString('utf8'));
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return [];
  } catch { return []; }
  const containers = new Map();
  for (const [, attributes] of html.matchAll(/<div\b([^>]{0,1500})>/gi)) {
    const id = attributes.match(/\bid=["'](player\d{1,2})["']/i)?.[1];
    const token = attributes.match(/\bdata-v=["']([^"']{1,1500})["']/i)?.[1];
    if (id && token) containers.set(id, token);
  }
  const output = [];
  const seen = new Set();
  for (const [, attributes, body] of html.matchAll(/<(?:span|button)\b([^>]{0,1000})>([\s\S]{0,600}?)<\/(?:span|button)>/gi)) {
    const target = attributes.match(/\bdata-target=["'](player\d{1,2})["']/i)?.[1];
    const classes = attributes.match(/\bclass=["']([^"']+)["']/i)?.[1]?.split(/\s+/) || [];
    const raw = mapping[containers.get(target)];
    if (!target || !classes.includes('player-tab') || seen.has(target) || typeof raw !== 'string') continue;
    try {
      const url = new URL(raw, page);
      if (!currentHost(url) || !/^\/player\/source[1-9]\/?$/i.test(url.pathname)) continue;
      const label = body.replace(/<[^>]+>/g, '').trim().slice(0, 60) || `Source ${output.length + 1}`;
      output.push({ url: url.href, label, host: url.hostname });
      seen.add(target);
      if (output.length === 12) break;
    } catch {}
  }
  return output;
}

export function wiTvPublishedMedia(html, playerUrl) {
  if (!currentHost(new URL(playerUrl))) return [];
  const payload = html.match(/\b(?:var|let|const)\s+_wtPayload\s*=\s*["']([A-Za-z0-9+/=]{1,12000})["']/)?.[1];
  if (!payload) return [];
  try {
    const raw = Buffer.from([...payload].reverse().join(''), 'base64').toString('utf8');
    const media = new URL(raw, playerUrl);
    if (!currentHost(media) || media.origin !== new URL(playerUrl).origin ||
        !/^\/player\/source[1-9]\/?$/i.test(media.pathname) || !media.searchParams.has('vp') ||
        media.searchParams.get('vc') === 'notice') return [];
    return [media.href];
  } catch { return []; }
}
