// Read published server buttons only. Never execute the provider's scripts.
export function parseBrigittePlayers(html, baseUrl) {
  const result = [], seen = new Set();
  const decode = value => String(value).replace(/&amp;/gi, '&').replace(/&#0*39;|&apos;/gi, "'").replace(/&quot;/gi, '"');
  for (const match of String(html).matchAll(/<(?:span|button|a)\b([^>]*\bdata-embed=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/(?:span|button|a)>/gi)) {
    if (!/\bchange-video\b/i.test(match[1])) continue;
    let url;
    try { url = new URL(decode(match[2]), baseUrl); } catch { continue; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || seen.has(url.href)) continue;
    const name = decode(match[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const language = match[3].match(/\balt=["']([a-z]{2,3})["']/i)?.[1]?.toUpperCase() || '';
    seen.add(url.href);
    result.push({ url: url.href, label: [language, name || `Serveur ${result.length + 1}`].filter(Boolean).join(' · '), playbackType: 'embed', compatPage: false });
  }
  return result;
}
export function parseBrigitteNativeDocument(html, baseUrl) {
  const urls=[];
  const array=String(html).match(/\b(?:const|let|var)\s+streamUrls\s*=\s*(\[[^;]{1,12000}\])/);
  if(array){try{for(const value of JSON.parse(array[1])){const url=new URL(value,baseUrl);if(['https:','http:'].includes(url.protocol)&&/\.m3u8(?:[?#]|$)/i.test(url.href))urls.push(url.href);}}catch{}}
  const markup=String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const frame=markup.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i);
  let next='';try{if(frame){const url=new URL(frame[1].replace(/&amp;/g,'&'),baseUrl);if(['https:','http:'].includes(url.protocol))next=url.href;}}catch{}
  return {urls:[...new Set(urls)],next};
}
