using System;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Noctra.Windows;

internal static class AdProtection
{
    // Local, explicit rules. No browsing history or request data is sent to a filtering service.
    private static readonly string[] Domains = ["doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
        "popads.net", "popcash.net", "adsterra.com", "propellerads.com", "monetag.com", "exoclick.com", "trafficjunky.net",
        "hilltopads.net", "clickadu.com", "clickaine.com", "juicyads.com", "tsyndicate.com", "adskeeper.com", "adnxs.com",
        "taboola.com", "outbrain.com", "mgid.com", "onclickalgo.com", "onclickperformance.com", "onclckvd.com",
        "adexchangeclear.com", "ad-maven.com", "admaiven.com", "adnimation.com", "admixer.net", "adsco.re",
        "adshost1.com", "adsplay.net", "adsvids.com", "adsvids.co", "bebi.com", "bidvertiser.com", "cpmstar.com",
        "dtscout.com", "ezoic.net", "evadav.com", "exosrv.com", "in-page-push.com", "inpagepush.com", "jads.co",
        "onclicka.com", "onclickads.net", "onclickmax.com", "onclickmega.com", "onelink.me", "popad.net",
        "popunder.net", "popunder.ru", "profitableratecpm.com", "profitablecpmrate.com", "realsrv.com",
        "realsrvcdn.com", "realsrvjs.com", "richads.com", "richpush.co", "runative.com", "s9kkremkr0.com",
        "trafficstars.com", "twinrdsyn.com", "twinrdsyte.com", "viads.com", "videoadex.com", "vidoomy.com",
        "yads.tech", "yandexadexchange.net", "zybrdr.com", "thatdisform.cyou"];
    private static readonly Regex Paths = new(@"(?:^|/)(?:ads|adserver|advertising|popunder|popads|prebid|vast)(?:/|[._?-]|$)|(?:^|/)(?:ads|popads|popunder)\.js(?:$|\?)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled, TimeSpan.FromMilliseconds(40));
    internal static bool Blocked(Uri uri)
    {
        if (Domains.Any(host => uri.Host.Equals(host, StringComparison.OrdinalIgnoreCase) ||
            uri.Host.EndsWith("." + host, StringComparison.OrdinalIgnoreCase)) || Paths.IsMatch(uri.PathAndQuery)) return true;
        // Provider pages often wrap third-party requests in a same-origin Noctra tunnel.
        foreach (var pair in uri.Query.TrimStart('?').Split('&'))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length != 2 || parts[0] is not ("url" or "target" or "u")) continue;
            if (Uri.TryCreate(Uri.UnescapeDataString(parts[1]), UriKind.Absolute, out var target) &&
                (Domains.Any(host => target.Host.Equals(host, StringComparison.OrdinalIgnoreCase) || target.Host.EndsWith("." + host, StringComparison.OrdinalIgnoreCase)) || Paths.IsMatch(target.PathAndQuery))) return true;
        }
        return false;
    }

    internal static string ProtectionScript(bool enabled) => Script.Replace("let enabled = true;", enabled ? "let enabled = true;" : "let enabled = false;")
        .Replace("__AD_HOSTS__", JsonSerializer.Serialize(Domains));

    internal static string TargetChannel(string name) => """
    (() => {
      const host = location.hostname.toLowerCase();
      if (!['huhu.bz','kool.ws','vavoo.top','oha.cx'].some(value => host === value || host.endsWith('.'+value)) && !/\/tv\/oha\/(embed|site)\//i.test(location.pathname)) return;
      const target = __TARGET__;
      const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
        .replace(/\(\d+\)/g,'').replace(/\b(fhd|uhd|hd|sd|4k|backup)\b/g,'').replace(/films?\b/g,'film').replace(/series?\b/g,'serie').replace(/[^a-z0-9]/g,'');
      const wanted = normalize(target);
      let tries = 0, searched = false, done = false;
      const timer = setInterval(() => {
        if (done || ++tries > 50) { clearInterval(timer); return; }
        let best = null, score = 0;
        for (const node of document.querySelectorAll('button,a,[role="button"],li,article,[class*="channel"],[class*="cursor-pointer"],strong')) {
          const text = normalize(node.innerText || node.textContent);
          if (!text || text.length > wanted.length + 65) continue;
          const clickable = node.closest('button,a,[role="button"],li,article,[class*="cursor-pointer"]') || (typeof node.onclick === 'function' ? node : null);
          if (!clickable) continue;
          const rank = text === wanted ? 100 : text.startsWith(wanted) ? 85 : text.includes(wanted) ? 70 : 0;
          if (rank > score || rank && rank === score && text.length < normalize(best?.innerText).length) { best = clickable; score = rank; }
        }
        if (best && score >= 70) {
          const clickable = best.closest('button,a,[role="button"],li,article,[class*="cursor-pointer"]') || best;
          clickable.click(); done = true; clearInterval(timer); return;
        }
        if (!searched && tries > 2) {
          const input = document.querySelector('input[type="search"],input[placeholder*="recher" i],input[placeholder*="search" i]');
          if (input) {
            searched = true;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,target.split(/\s+/)[0]);
            input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true}));
          }
        }
      },400);
    })();
    """.Replace("__TARGET__", JsonSerializer.Serialize(name));

    internal const string OhaMediaCompatibility = """
    (() => {
      const match = location.pathname.match(/^(.*\/api\/tv\/oha)\/(?:embed|site)\/([^/]+)/i);
      if (!match) return;
      const proxy = location.origin + match[1] + '/http/' + match[2] + '?media=1&url=';
      const NativeURL = window.URL;
      const mediaURL = value => {
        try {
          const url = new NativeURL(String(value),location.href);
          return url.protocol === 'http:' && url.origin !== location.origin &&
            (/\.(?:m3u8?|mpd|mp4|webm|ts)(?:[?#]|$)/i.test(url.href) || /\/(?:live|stream|video|hls)(?:\/|[?])/i.test(url.href))
              ? proxy + encodeURIComponent(url.href) : value;
        } catch { return value; }
      };
      window.URL = new Proxy(NativeURL,{construct(target,args,newTarget) {
        const original = Reflect.construct(target,args,newTarget);
        const mapped = mediaURL(original.href);
        return mapped !== original.href ? new target(mapped) : original;
      }});
      for (const type of [HTMLMediaElement,HTMLSourceElement]) {
        const descriptor = Object.getOwnPropertyDescriptor(type.prototype,'src');
        if (descriptor?.set && descriptor.configurable) Object.defineProperty(type.prototype,'src',{
          ...descriptor,set(value) { descriptor.set.call(this,mediaURL(value)); }
        });
      }
      const setAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(name,value) {
        if (String(name).toLowerCase() === 'src' && /^(VIDEO|AUDIO|SOURCE)$/.test(this.tagName)) value = mediaURL(value);
        return setAttribute.call(this,name,value);
      };
      const open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method,url,...rest) { return open.call(this,method,mediaURL(url),...rest); };
      const change = (value, key = '', depth = 0) => {
        if (depth > 12 || value == null) return value;
        if (typeof value === 'string' && /^http:\/\//i.test(value) &&
            (/\.(?:m3u8?|mpd|mp4|webm)(?:[?#]|$)/i.test(value) || /^(?:url|streamUrl|stream_url|source|file|src|hls|hlsUrl)$/i.test(key))) {
          try { if (new NativeURL(value).origin !== location.origin) return proxy + encodeURIComponent(value); } catch {}
          return value;
        }
        if (Array.isArray(value)) return value.map(item => change(item,key,depth+1));
        if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name,item]) => [name,change(item,name,depth+1)]));
        return value;
      };
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        if (typeof args[0] === 'string' || args[0] instanceof NativeURL) args[0] = mediaURL(String(args[0]));
        const response = await originalFetch.apply(this,args);
        if (!/json/i.test(response.headers.get('content-type') || '')) return response;
        try {
          const data = change(await response.clone().json());
          const headers = new Headers(response.headers); headers.delete('content-length'); headers.delete('content-encoding');
          const result = new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
          Object.defineProperty(result,'url',{value:response.url}); return result;
        } catch { return response; }
      };
      for (const property of ['response','responseText']) {
        const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,property);
        if (!descriptor?.get || !descriptor.configurable) continue;
        Object.defineProperty(XMLHttpRequest.prototype,property,{...descriptor,get() {
          const raw = descriptor.get.call(this);
          if (this.readyState !== 4) return raw;
          try {
            if (property === 'response' && this.responseType === 'json') return change(raw);
            if (typeof raw === 'string' && /^\s*[\[{]/.test(raw)) return JSON.stringify(change(JSON.parse(raw)));
          } catch {}
          return raw;
        }});
      }
    })();
    """;

    internal const string Script = """
    (() => {
      let enabled = true;
      window.chrome?.webview?.addEventListener('message', event => {
        if (event.data?.type === 'noctra-protection') enabled = event.data.enabled === true;
      });
      const adHosts = __AD_HOSTS__;
      const selectors = '.adsbygoogle,#ad-container,#ad-overlay,.ad-overlay,.advertisement,.popunder,.pop-under,.ad-banner,.ad-container,.video-ad,.vast-ad,.vpaid-ad,[data-ad-slot],[data-ad-client],[id^="exo-"],[class*="exoclick"],[id*="popunder"],[class*="popunder"],[class*="adblock-overlay"],[data-advertisement],in-page-message,iframe[srcdoc*="thatdisform.cyou" i],iframe[srcdoc*="in-page-message" i]';
      const blockedURL = raw => {
        try {
          const url = new URL(raw,location.href);
          return adHosts.some(host => url.hostname === host || url.hostname.endsWith('.'+host)) ||
            /(?:^|\/)(?:ads|adserver|advertising|popunder|popads|vast)(?:\/|[._?-]|$)/i.test(url.pathname) ||
            ['url','target','u'].some(key => { const nested=url.searchParams.get(key); return nested && /^https?:/i.test(nested) && adHosts.some(host => { try {const h=new URL(nested).hostname;return h===host || h.endsWith('.'+host)}catch{return false} }); });
        } catch {return false;}
      };
      let cleaned = 0;
      const remove = (element, allowMedia=false) => {
        if (!element.isConnected || /^(HTML|BODY)$/.test(element.tagName) || !allowMedia && /^(VIDEO|AUDIO)$/.test(element.tagName)) return;
        // Stop a floating advertising video before removing its container.
        element.querySelectorAll('video,audio').forEach(media => { try {media.pause();media.removeAttribute('src');media.load();}catch{} });
        if (/^(VIDEO|AUDIO)$/.test(element.tagName)) { try {element.pause();element.removeAttribute('src');element.load();}catch{} }
        element.remove(); cleaned++;
      };
      let scheduled = false;
      const clean = () => {
        scheduled = false;
        if (!enabled) return;
        document.querySelectorAll(selectors).forEach(element=>remove(element));
        document.querySelectorAll('iframe[src],a[href]').forEach(element => { if (blockedURL(element.src || element.href)) remove(element); });
        const scam = /(?:installe[rz]?|install|télécharge[rz]?|download).{0,100}(?:opera|browser|navigateur|extension|vpn)|(?:rencontres uniques|devenir membre|libérez votre\s*sexualité|selon vos propres règles|hot singles|dating nearby)/i;
        // Inspect short notices, never a whole player or a video control bar.
        for (const node of document.querySelectorAll('div,aside,section,dialog,a,button,svg,foreignObject')) {
          const text = node.innerText || node.textContent || '';
          if (text.length < 8 || text.length > 650 || !scam.test(text) || node.querySelector('video,audio')) continue;
          const rect = node.getBoundingClientRect();
          if (rect.width > 0 && rect.width < Math.max(720,innerWidth*.65) && rect.height < Math.max(500,innerHeight*.7)) {
            let target=node;
            for (let p=node.parentElement, depth=0; p && depth<3 && !/^(BODY|HTML)$/.test(p.tagName); p=p.parentElement,depth++) {
              if (p.querySelector('video,audio') || (p.innerText || '').length > 800) break;
              const r=p.getBoundingClientRect(),style=getComputedStyle(p);
              if (r.width < Math.max(760,innerWidth*.7) && r.height < Math.max(550,innerHeight*.75) && /fixed|absolute/.test(style.position)) target=p;
            }
            remove(target);
          }
        }
        // Ad networks also insert unnamed click layers, SVG/image banners and entire second players.
        // Keep the largest main video/player and its own controls; only remove independent overlay layers.
        const area=element=>{const r=element.getBoundingClientRect();return Math.max(0,r.width)*Math.max(0,r.height);};
        const videos=[...document.querySelectorAll('video')].filter(video=>area(video)>10000).sort((a,b)=>area(b)-area(a));
        const primary=videos[0];
        const frames=[...document.querySelectorAll('iframe')].filter(frame=>area(frame)>innerWidth*innerHeight*.35).sort((a,b)=>area(b)-area(a));
        const player=primary||frames[0];
        if (player) {
          const playerArea=area(player),playerRect=player.getBoundingClientRect();
          for (const node of document.querySelectorAll('div,aside,section,iframe,a,svg')) {
            if (!node.isConnected||node===player||node.contains(player))continue;
            const style=getComputedStyle(node),rect=node.getBoundingClientRect(),z=Number(style.zIndex)||0;
            if (!/^(fixed|absolute)$/.test(style.position)||rect.width<30||rect.height<20)continue;
            const overlaps=rect.right>playerRect.left&&rect.left<playerRect.right&&rect.bottom>playerRect.top&&rect.top<playerRect.bottom;
            const media=node.matches('iframe')||!!node.querySelector('video,iframe');
            const control=node.matches('button,[role="button"],[role="menu"],[role="slider"],input')||/\b(?:control[s-]?|vjs-control|jw-control|plyr__control|fstv-ctrl|fstv-q|fstv-top|subtitle|caption)/i.test(String(node.className||'')+' '+node.id);
            if (control)continue;
            const independentPlayer=media&&overlaps&&area(node)<playerArea*.72&&z>=20;
            const clickLayer=z>=100000&&overlaps&&!node.querySelector('button,input,[role="slider"]');
            if (independentPlayer||clickLayer)remove(node,true);
          }
        }
        if (cleaned) { window.chrome?.webview?.postMessage({type:'noctra-ad-cleaned',count:cleaned}); cleaned=0; }
      };
      const observe = () => {
        clean();
        new MutationObserver(() => {
          if (!scheduled) { scheduled = true; requestAnimationFrame(clean); }
        }).observe(document.documentElement, {childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','id','src','srcdoc','style']});
      };
      if (document.documentElement) observe(); else addEventListener('DOMContentLoaded', observe, {once:true});
      const open = window.open;
      window.open = function(...args) { return enabled ? null : open.apply(this,args); };
      for (const name of ['alert','confirm','prompt']) {
        const original = window[name]; window[name] = function(...args) { return enabled ? (name==='confirm' ? false : null) : original.apply(this,args); };
      }
      document.addEventListener('click', event => {
        if (!enabled) return;
        const anchor=event.target.closest?.('a[href]');
        if (anchor && (blockedURL(anchor.href) || anchor.target === '_blank')) { event.preventDefault(); event.stopImmediatePropagation(); }
      },true);
      const positions = new WeakMap();
      let reportedVideo, reportedHeight, reportedArea;
      setInterval(() => {
        let main, area = 0;
        for (const video of document.querySelectorAll('video')) {
          const old = positions.get(video);
          positions.set(video,video.currentTime);
          const rect = video.getBoundingClientRect(), size = rect.width * rect.height;
          if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 3 && !video.paused &&
              old !== undefined && video.currentTime > old + .05 && size > area) { main = video; area = size; }
        }
        if (!main || main === reportedVideo && main.videoHeight === reportedHeight && area === reportedArea) return;
        reportedVideo = main; reportedHeight = main.videoHeight; reportedArea = area;
        window.chrome?.webview?.postMessage({type:'noctra-video',height:reportedHeight,area});
      },400);
    })();
    """;
}
