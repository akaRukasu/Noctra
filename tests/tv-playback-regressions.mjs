import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const wiServerStart = server.indexOf('async function resolveWiTvPlayerOption');
const wiServerEnd = server.indexOf('function cleanOhaChannelName', wiServerStart);
const wiProxyStart = server.indexOf('async function proxyWiTvEmbed');
const wiProxyEnd = server.indexOf('function ohaAllowedHost', wiProxyStart);
const wiShellMarker = "} else if (channel.provider === 'WiTV' && /\\/api\\/tv\\/embed\\//.test(String(url))) {";
const wiShellStart = shell.indexOf(wiShellMarker);
const wiShellEnd = shell.indexOf('    frame.onload = () => {', wiShellStart);
const wiServerSource = server.slice(wiServerStart, wiServerEnd);
assert.ok(
  wiServerSource.indexOf("label: `${option.label || 'Serveur'} · HLS`") < wiServerSource.indexOf("label: `${option.label || 'Serveur'} · lecteur web`"),
  'WiTV doit conserver le lecteur web en secours mais présenter le HLS en premier.'
);
assert.equal(sha(server.slice(wiProxyStart, wiProxyEnd)), '7c46462b05e879b118f94efe57f4b6fb404dde0c08ebc08b796fc7f3b240ada8', 'Le bridge WiTV doit rester bit-à-bit identique à la v76.');
assert.ok(wiShellStart >= 0 && wiShellEnd > wiShellStart, 'Le fallback lecteur web WiTV doit rester présent côté client.');


assert.equal(server.includes('\x08'), false, 'Les regex TV ne doivent contenir aucun caractère de contrôle BACKSPACE.');
assert.match(server, /hls\\b\|proxy\\b/, 'La validation des proxys LiveWatch doit conserver de vraies limites de mot.');

const rewriteStart = server.indexOf('function mergeTvCookieHeaders');
const rewriteEnd = server.indexOf('function detectTvImageMime', rewriteStart);
assert.ok(rewriteStart >= 0 && rewriteEnd > rewriteStart, 'Les helpers de playlist HLS doivent être extractibles.');
let issued = [];
const helpers = new Function('tvPublicStreamUrl', 'issueTvReference', 'resolveTvUrl', `${server.slice(rewriteStart, rewriteEnd)}; return { mergeTvCookieHeaders, tvChildReferenceHeaders, rewriteTvPlaylist };`)(
  token => `/stream/${token}`,
  (url, headers) => { issued.push({ url, headers }); return `t${issued.length}`; },
  (value, base) => new URL(value, base).toString()
);
assert.equal(helpers.mergeTvCookieHeaders('session=old; route=eu', 'session=new; edge=1'), 'session=new; route=eu; edge=1');
assert.deepEqual(
  helpers.tvChildReferenceHeaders({ authorization: 'Bearer secret', cookie: 'session=abc', referer: 'https://livewatch.top/embed/x' }, 'https://livewatch.top/master.m3u8', 'https://cdn.example/variant.m3u8'),
  { referer: 'https://livewatch.top/embed/x' },
  'Un bearer/cookie LiveWatch ne doit jamais fuiter vers un CDN tiers.'
);
assert.deepEqual(
  helpers.tvChildReferenceHeaders({ authorization: 'Bearer secret', cookie: 'session=abc', referer: 'https://livewatch.top/embed/x' }, 'https://livewatch.top/master.m3u8', 'https://livewatch.top/api/hls/variant.m3u8'),
  { authorization: 'Bearer secret', cookie: 'session=abc', referer: 'https://livewatch.top/embed/x' },
  'Les en-têtes VIP doivent être conservés sur le même hôte LiveWatch.'
);
issued = [];
const rewritten = helpers.rewriteTvPlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvariant/index.m3u8\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n', 'https://livewatch.top/api/hls/master.m3u8', { authorization: 'Bearer secret', cookie: 'session=abc' });
assert.ok(rewritten.includes('/stream/t1') && rewritten.includes('URI="/stream/t2"'), 'Les variantes et clés HLS doivent passer par les références Noctra.');
assert.equal(issued[0].headers.authorization, 'Bearer secret');
assert.equal(issued[1].headers.cookie, 'session=abc');


const mediaHelperStart = server.indexOf('function tvLikelyMediaUrl');
const mediaHelperEnd = server.indexOf('function privateTvAddress', mediaHelperStart);
assert.ok(mediaHelperStart >= 0 && mediaHelperEnd > mediaHelperStart, 'Le détecteur de ressources média TV doit être extractible.');
const tvLikelyMediaUrl = new Function('safeTvRemoteUrl', `${server.slice(mediaHelperStart, mediaHelperEnd)}; return tvLikelyMediaUrl;`)(value => new URL(value));
assert.equal(tvLikelyMediaUrl('https://cdn.example/live/channel/master.m3u8?token=abc'), true);
assert.equal(tvLikelyMediaUrl('https://cdn.example/dash/channel/manifest.mpd'), true);
assert.equal(tvLikelyMediaUrl('https://api.example/user/profile'), false, 'Le tunnel média ne doit pas devenir un proxy HTTP générique.');

const fetchStart = server.indexOf('async function fetchTvRemote');
const fetchEnd = server.indexOf('function decodeTvWrappedUrl', fetchStart);
assert.ok(fetchStart >= 0 && fetchEnd > fetchStart, 'Le suivi de redirection TV doit être extractible.');
const redirectCalls = [];
const fakeFetch = async (url, options) => {
  redirectCalls.push({ url: String(url), headers: { ...(options.headers || {}) } });
  if (redirectCalls.length === 1) return { status: 302, headers: { get: name => name === 'location' ? 'https://cdn.example/live/master.m3u8' : '' } };
  return { status: 200, headers: { get: () => '' } };
};
const fetchTvRemote = new Function('assertPublicTvUrl', 'HttpError', 'fetch', 'tvResponseCookieHeader', 'mergeTvCookieHeaders', `${server.slice(fetchStart, fetchEnd)}; return fetchTvRemote;`)(
  async value => new URL(String(value)),
  class FetchTestError extends Error { constructor(status, message) { super(message); this.status = status; } },
  fakeFetch,
  () => '',
  (current, received) => [current, received].filter(Boolean).join('; ')
);
await fetchTvRemote('https://livewatch.top/api/stream/test', { headers: { authorization: 'Bearer private', cookie: 'session=private', apikey: 'anon', 'mediahubmx-signature': 'mh-private', 'mediaurl-signature': 'mu-private', referer: 'https://livewatch.top/embed/test' } });
assert.equal(redirectCalls.length, 2);
assert.equal(redirectCalls[1].headers.authorization, undefined, 'Le bearer fournisseur doit être supprimé sur une redirection vers un CDN tiers.');
assert.equal(redirectCalls[1].headers.cookie, undefined, 'Les cookies fournisseur doivent être supprimés sur une redirection vers un CDN tiers.');
assert.equal(redirectCalls[1].headers['mediahubmx-signature'], undefined, 'Une signature MediaHubMX ne doit jamais fuiter vers un CDN tiers.');
assert.equal(redirectCalls[1].headers['mediaurl-signature'], undefined, 'Une signature MediaURL ne doit jamais fuiter vers un CDN tiers.');
assert.equal(redirectCalls[1].headers.referer, 'https://livewatch.top/embed/test', 'Le Referer du lecteur peut être conservé pour le CDN média.');

const ohaRedirectCalls = [];
const ohaFetch = async (url, options) => {
  ohaRedirectCalls.push({ url: String(url), headers: { ...(options.headers || {}) } });
  if (ohaRedirectCalls.length === 1) return { status: 307, headers: { get: name => name === 'location' ? 'https://www.oha.cx/mediaurl-resolve.json' : '' } };
  return { status: 200, headers: { get: () => '' } };
};
const fetchOhaRemote = new Function('assertPublicTvUrl', 'HttpError', 'fetch', 'tvResponseCookieHeader', 'mergeTvCookieHeaders', `${server.slice(fetchStart, fetchEnd)}; return fetchTvRemote;`)(
  async value => new URL(String(value)),
  class FetchOhaTestError extends Error { constructor(status, message) { super(message); this.status = status; } },
  ohaFetch,
  () => '',
  (current, received) => [current, received].filter(Boolean).join('; ')
);
await fetchOhaRemote('https://oha.cx/mediaurl-resolve.json', { method: 'POST', headers: { 'mediaurl-signature': 'signed-by-official-client', 'mediahubmx-signature': 'hub-signature', authorization: 'Bearer must-not-follow' } });
assert.equal(ohaRedirectCalls[1].headers['mediaurl-signature'], 'signed-by-official-client', 'Une redirection canonique OHA -> OHA doit conserver Mediaurl-Signature.');
assert.equal(ohaRedirectCalls[1].headers['mediahubmx-signature'], 'hub-signature', 'Une redirection canonique OHA -> OHA doit conserver mediahubmx-signature.');
assert.equal(ohaRedirectCalls[1].headers.authorization, undefined, 'Même entre domaines OHA, un bearer générique ne doit pas suivre une redirection cross-origin.');

const ohaSanitizeStart = server.indexOf('function ohaAllowedHost');
const ohaSanitizeEnd = server.indexOf('async function proxyOhaEmbed', ohaSanitizeStart);
assert.ok(ohaSanitizeStart >= 0 && ohaSanitizeEnd > ohaSanitizeStart, 'Le préparateur OHA doit être extractible.');
const ohaHelpers = new Function('publicPath', `${server.slice(ohaSanitizeStart, ohaSanitizeEnd)}; return { ohaAllowedHost, sanitizeOhaPlayerHtml };`)(value => `/noctra${value}`);
assert.equal(ohaHelpers.ohaAllowedHost('https://oha.cx/watch?live=x'), true);
assert.equal(ohaHelpers.ohaAllowedHost('https://example.org/watch?live=x'), false);
const prepared = ohaHelpers.sanitizeOhaPlayerHtml('<html><head><meta http-equiv="Content-Security-Policy" content="frame-ancestors none"><script src="/app.js"></script></head><body></body></html>', 'https://oha.cx/watch?live=x', 'state');
assert.ok(!/content-security-policy/i.test(prepared), 'La CSP de framing OHA doit être retirée de la copie isolée.');
assert.ok(prepared.includes('/noctra/api/tv/oha/http/state'), 'La page OHA préparée doit relayer ses appels officiels via le tunnel limité.');
assert.ok(prepared.includes('/noctra/api/tv/oha/site/state/app.js'), 'Les scripts OHA du même domaine doivent conserver leur arborescence sous le proxy.');
const preparedSri = ohaHelpers.sanitizeOhaPlayerHtml('<html><head><script src="/app.js" integrity="sha384-old" crossorigin="anonymous"></script></head></html>', 'https://oha.cx/watch?live=x', 'state');
assert.equal(/integrity=/i.test(preparedSri), false, 'OHA ne doit pas conserver un SRI calculé sur un asset réécrit par le bridge.');
assert.equal(/crossorigin=/i.test(preparedSri), false, 'OHA ne doit pas imposer crossorigin sur un asset devenu same-origin Noctra.');
assert.ok(prepared.includes('patchSrc(HTMLMediaElement.prototype,true)') && prepared.includes('patchSrc(HTMLIFrameElement.prototype,false)'), 'OHA ne doit pas envoyer les iframes/scripts externes dans le tunnel réservé aux médias.');
assert.ok(prepared.indexOf('<base href=') < prepared.indexOf('app.js'), 'Le bridge OHA doit être installé avant le JavaScript officiel.');
assert.ok(prepared.includes("?media=1&url="), 'Le bridge OHA doit pouvoir relayer les médias CDN afin d’éviter Origin:null/CORS dans le sandbox.');
assert.ok(prepared.includes('patchSrc(HTMLMediaElement.prototype,true)'), 'Les URLs placées directement dans le lecteur vidéo OHA doivent aussi passer par le bridge média.');
assert.ok(prepared.includes('NativeURL=window.URL') && prepared.includes('NO=new NativeURL(location.href).origin'), 'Le bridge OHA doit réparer le constructeur URL du sandbox opaque sans donner allow-same-origin.');
assert.ok(prepared.includes('/^null\//i.test(raw)?PO+raw.slice(4):raw'), 'Le bridge OHA doit réparer les URLs créées par location.origin lorsque le sandbox renvoie null.');

assert.ok(prepared.includes("for(const n of ['localStorage','sessionStorage'])"), 'Le client OHA doit disposer d’un Storage mémoire dans l’iframe à origine opaque afin d’éviter les SecurityError au démarrage.');
assert.ok(prepared.includes("e.data.type==='noctra-oha-state'"), 'Les états/médias résolus dans un sous-iframe OHA doivent remonter jusqu’au lecteur Noctra parent.');
const preparedTargeted = ohaHelpers.sanitizeOhaPlayerHtml('<html><head></head><body><button>6TER</button></body></html>', 'https://oha.cx/live', 'state', { channelId: '6ter-id', channelName: '6TER' });
assert.ok(preparedTargeted.includes('CN="6TER"') && preparedTargeted.includes('function chooseTarget()'), 'Le client /live OHA doit savoir sélectionner automatiquement la chaîne demandée sans dépendre d’un deep-link cassé.');

const ohaProxyHttpStart = server.indexOf('async function proxyOhaHttp');
const ohaProxyHttpEnd = server.indexOf('async function proxyTvStream', ohaProxyHttpStart);
const ohaProxyHttpSource = server.slice(ohaProxyHttpStart, ohaProxyHttpEnd);
assert.ok(ohaProxyHttpSource.includes("requestUrl.searchParams.get('media') === '1'"), 'Le tunnel OHA doit distinguer explicitement les médias externes des API officielles.');
assert.ok(ohaProxyHttpSource.includes('tvBridgeMediaResponseAllowed'), 'Le tunnel OHA doit valider le MIME avant de relayer un média CDN sans extension.');
assert.ok(ohaProxyHttpSource.includes("!['GET', 'HEAD'].includes(method)"), 'Le tunnel média OHA externe doit rester en lecture seule.');
assert.ok(ohaProxyHttpSource.includes("req.headers['mediaurl-signature']") && ohaProxyHttpSource.includes("upstreamHeaders['mediaurl-signature']"), 'Le tunnel OHA doit transmettre Mediaurl-Signature jusqu’au résolveur officiel.');
assert.ok(server.includes('const ohaBridgeCookies = new Map()') && server.includes('rememberOhaBridgeCookies(token, response)'), 'Le bridge OHA doit conserver les cookies de session émis par oha.cx entre la page, les assets et les appels API.');

const ohaProxySiteStart = server.indexOf('async function proxyOhaSite');
const ohaProxySiteEnd = server.indexOf('async function proxyOhaHttp', ohaProxySiteStart);
const ohaProxySiteSource = server.slice(ohaProxySiteStart, ohaProxySiteEnd);
assert.ok(ohaProxySiteSource.includes('/text\\/html|application\\/xhtml/i') && ohaProxySiteSource.includes('sanitizeOhaPlayerHtml(rawHtml, finalUrl, token,'), 'Un sous-iframe HTML OHA chargé via /site doit recevoir le bridge, pas du HTML brut.');
assert.ok(ohaProxyHttpSource.includes('officialTarget && /text\\/html|application\\/xhtml/i') && ohaProxyHttpSource.includes('sanitizeOhaPlayerHtml(rawHtml, finalUrl, token,'), 'Un sous-iframe HTML obtenu via redirection/tunnel OHA doit aussi recevoir le bridge.');

assert.ok(server.includes("state:'media'") && shell.includes("event.data.state === 'media'"), 'Les bridges doivent remettre le média résolu au lecteur natif Noctra au lieu de dépendre uniquement de la vidéo dans le sandbox.');

const ohaRewriteStart = server.indexOf('function rewriteOhaBridgeAssetText');
const ohaRewriteEnd = server.indexOf('async function proxyOhaSite', ohaRewriteStart);
assert.ok(ohaRewriteStart >= 0 && ohaRewriteEnd > ohaRewriteStart, 'Le réécrivain des assets dynamiques OHA doit être extractible.');
const rewriteOhaBridgeAssetText = new Function('publicPath', `${server.slice(ohaRewriteStart, ohaRewriteEnd)}; return rewriteOhaBridgeAssetText;`)(value => `/noctra${value}`);
const rewrittenOhaJs = rewriteOhaBridgeAssetText('const a="/assets/chunk.js"; const b="https://oha.cx/runtime.js";', 'state-token', 'application/javascript');
assert.ok(rewrittenOhaJs.includes('/noctra/api/tv/oha/site/state-token/assets/chunk.js'), 'Un chunk JS OHA root-relative doit rester dans le bridge.');
assert.ok(rewrittenOhaJs.includes('/noctra/api/tv/oha/site/state-token/runtime.js'), 'Une URL JS absolue OHA doit rester dans le bridge.');

const lwRewriteStart = server.indexOf('function rewriteLiveWatchBridgeAssetText');
const lwRewriteEnd = server.indexOf('async function liveWatchBridgeRequest', lwRewriteStart);
assert.ok(lwRewriteStart >= 0 && lwRewriteEnd > lwRewriteStart, 'Le réécrivain des assets dynamiques LiveWatch doit être extractible.');
const rewriteLiveWatchBridgeAssetText = new Function('publicPath', `${server.slice(lwRewriteStart, lwRewriteEnd)}; return rewriteLiveWatchBridgeAssetText;`)(value => `/noctra${value}`);
const rewrittenLwJs = rewriteLiveWatchBridgeAssetText('import("/assets/player.js"); const b="https://livewatch.top/static/x.js";', 'daddy', '119', 'application/javascript');
assert.ok(rewrittenLwJs.includes('/noctra/api/tv/livewatch/site/daddy/119/assets/player.js'), 'Un chunk LiveWatch dynamique doit rester dans le bridge VIP.');
assert.ok(rewrittenLwJs.includes('/noctra/api/tv/livewatch/site/daddy/119/static/x.js'), 'Une URL absolue LiveWatch doit rester dans le bridge VIP.');

const vipDecorateStart = server.indexOf('async function decorateLiveWatchVipPlayback');
const vipDecorateEnd = server.indexOf('function validLiveWatchChannelReference', vipDecorateStart);
const vipDecorate = server.slice(vipDecorateStart, vipDecorateEnd);
assert.ok(vipDecorate.includes("playbackType: 'resolver'"), 'LiveWatch VIP doit passer par le resolver de lecture validé.');
assert.ok(vipDecorate.includes('/api/tv/livewatch/resolve/'), 'Le resolver VIP doit être attaché directement aux chaînes LiveWatch.');
assert.ok(server.includes("label: 'VIP Premium · direct'") && server.includes("label: 'VIP Premium · LiveWatch officiel'") && server.includes("label: 'Public · 2 pubs (secours manuel)'"), 'LiveWatch doit restaurer le direct Premium v80, garder le lecteur officiel VIP en secours et le public en dernier choix manuel.');
assert.ok(server.includes('async function resolveLiveWatchVipPlayback') && server.includes('await liveWatchAccessSession();'), 'La résolution LiveWatch doit vérifier la session Premium sans renouvellement forcé à chaque chaîne.');
assert.ok(server.includes("delivery: 'proxied-hls'"), 'WiTV doit relayer le HLS avec les en-têtes attendus par son CDN.');
const ohaStableStart = server.indexOf('async function resolveOhaStreamReference');
const ohaStableEnd = server.indexOf('function buildOhaCatalog', ohaStableStart);
const ohaStable = server.slice(ohaStableStart, ohaStableEnd);
assert.ok(ohaStable.includes('options: nativeAttempt ? [nativeAttempt, bridge] : [bridge]'), 'OHA doit essayer rapidement le premier flux natif public disponible et conserver le client officiel comme secours.');
assert.ok(ohaStable.includes("kind: 'oha-bridge'") && ohaStable.includes('issueTvReference(externalUrl'), 'OHA doit créer au clic un token de bridge opaque afin que son sandbox ne dépende pas du cookie Noctra.');
assert.ok(server.includes('function validOhaBridgeToken') && server.includes('trustedOhaBridgeRequest'), 'Les routes internes OHA doivent accepter uniquement un token de bridge aléatoire encore valide lorsque le sandbox n’envoie pas la session Noctra.');
assert.ok(server.includes("if (!token || token.startsWith('s.')) return false"), 'Une référence OHA stateless forgeable ne doit jamais permettre de contourner l’authentification Noctra.');
assert.equal(ohaStable.includes("label: 'OHA officiel'"), false, 'Le lecteur OHA distant bloqué en iframe ne doit plus être utilisé.');
assert.equal(shell.includes('essai OHA officiel'), false, 'Le client ne doit plus basculer vers l’iframe OHA distante cassée.');
const directStreamStart = shell.indexOf('async function playTvDirectStream');
const directStreamEnd = shell.indexOf('async function playTvResolvedOption', directStreamStart);
const directStreamSource = shell.slice(directStreamStart, directStreamEnd);
assert.ok(directStreamSource.includes('startResolvedOptionFallback'), 'Une erreur HLS doit essayer un autre serveur explicitement fourni pour cette chaîne.');
const liveWatchEmbedStart = shell.indexOf("(channel.vipPlayback || channel.provider === 'LiveWatch') && /\\/api\\/tv\\/livewatch\\/(?:embed\\/|vip\\/[^/]+\\/embed");
const liveWatchEmbedEnd = shell.indexOf("} else if (channel.provider === 'WiTV'", liveWatchEmbedStart);
const liveWatchEmbedSource = shell.slice(liveWatchEmbedStart, liveWatchEmbedEnd);
assert.ok(liveWatchEmbedSource.includes('frame.dataset.tvResolvedMedia'), 'Le média résolu par LiveWatch doit rester mémorisé.');
assert.ok(liveWatchEmbedSource.includes('mobileNativeHandoffStarted') && liveWatchEmbedSource.includes('!mediaPlaying'), 'Sur mobile, le handoff natif V80 ne doit être autorisé qu’avant le démarrage de l’iframe.');
assert.ok(liveWatchEmbedSource.includes('playTvDirectStream(channel, event.data.url'), 'Le lecteur natif V80 doit être restauré sur mobile lorsqu’un média Premium est résolu avant lecture.');
assert.ok(directStreamSource.includes('Reconnexion au même flux') && directStreamSource.includes('aucun autre serveur compatible'), 'Le lecteur doit retenter le flux puis parcourir les alternatives compatibles sans boucler.');
assert.ok(prepared.includes('function findMedia(') && prepared.includes('function inspectResponse(') && prepared.includes('r.clone().text().then(inspectPayloadText)'), 'Le bridge OHA doit inspecter les réponses du résolveur officiel pour récupérer un HLS même si le client ne l’assigne pas encore au DOM.');
assert.ok(prepared.includes("addEventListener('load'") && prepared.includes('inspectPayloadText(this.responseText)'), 'Le bridge OHA doit aussi inspecter les réponses XHR du résolveur officiel.');
assert.equal(shell.includes('const firstWeb = options.findIndex'), false, 'WiTV ne doit plus forcer le lecteur web par défaut.');

console.log('Régressions lecture TV Noctra v88 : OK');

// Simulation du vrai chemin LiveWatch VIP : une réponse proxy officielle doit
// être acceptée sans sonde préalable et conserver la session sur le même hôte.
const lwValidStart = server.indexOf('function validLiveWatchChannelReference');
const lwValidEnd = server.indexOf('async function proxyLiveWatchVipStream', lwValidStart);
assert.ok(lwValidStart >= 0 && lwValidEnd > lwValidStart, 'Le chemin LiveWatch VIP doit être extractible pour simulation.');
const TestHttpError = class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } };
let liveWatchPayload = { proxy_url: '/api/hls/channel/master.m3u8' };
let issuedLiveWatch = null;
const tvRefs = new Map();
const liveWatchFns = new Function(
  'HttpError', 'fetchTvRemote', 'liveWatchOrigin', 'safeTvRemoteUrl', 'issueTvReference', 'liveWatchAccessSession', 'liveWatchVipDirectCache', 'tvReferences',
  `${server.slice(lwValidStart, lwValidEnd)}; return { liveWatchStreamReference };`
)(
  TestHttpError,
  async () => ({
    ok: true,
    status: 200,
    url: 'https://livewatch.top/api/stream/channel?vip=1&embed=1',
    headers: {
      get: name => name === 'content-type' ? 'application/json' : '',
      getSetCookie: () => ['session=vip123; Path=/; HttpOnly']
    },
    text: async () => JSON.stringify(liveWatchPayload)
  }),
  'https://livewatch.top',
  value => new URL(value),
  (url, headers) => { issuedLiveWatch = { url, headers }; tvRefs.set('live-token', { url, headers }); return 'live-token'; },
  async () => ({ accessToken: 'access-vip', refreshToken: 'refresh-vip', isVip: true }),
  new Map(),
  tvRefs
);
assert.equal(await liveWatchFns.liveWatchStreamReference('main', 'channel', 3500), 'live-token');
assert.equal(issuedLiveWatch.url, 'https://livewatch.top/api/hls/channel/master.m3u8');
assert.equal(issuedLiveWatch.headers.authorization, 'Bearer access-vip');
assert.equal(issuedLiveWatch.headers.cookie, 'session=vip123');

liveWatchPayload = { stream_url: 'https://cdn.example/channel/master.m3u8' };
issuedLiveWatch = null;
await liveWatchFns.liveWatchStreamReference('main', 'channel-2', 3500);
assert.equal(issuedLiveWatch.url, 'https://cdn.example/channel/master.m3u8');
assert.equal('authorization' in issuedLiveWatch.headers, false, 'Le bearer LiveWatch ne doit pas être transmis à un CDN tiers.');
assert.equal('cookie' in issuedLiveWatch.headers, false, 'Le cookie LiveWatch ne doit pas être transmis à un CDN tiers.');

// Simulation WiTV : le HLS public doit passer par le relais même origine afin
// de conserver les en-têtes exigés par les segments du CDN.
const wiOptionStart = server.indexOf('async function resolveWiTvPlayerOption');
const wiOptionEnd = server.indexOf('function sanitizeWiTvPlayerHtml', wiOptionStart);
const wiOptionFactory = new Function(
  'isWiTvPublicPlayer', 'safeTvRemoteUrl', 'fetchTvRemote', 'HttpError', 'wiTvStreamFromPlayerHtml', 'wiTvStreamCandidatesFromPlayerHtml', 'validateWiTvHlsStream', 'tvResponseCookieHeader', 'encodeTvStateReference', 'tvPublicEmbedUrl', 'issueTvReference', 'tvPublicStreamUrl',
  `${server.slice(wiOptionStart, wiOptionEnd)}; return resolveWiTvPlayerOption;`
);
let issuedWiTv = null;
const resolveWiTvPlayerOption = wiOptionFactory(
  () => true,
  value => new URL(value),
  async url => ({ ok: true, status: 200, url, text: async () => '<script>var streamUrl="https://video.example/live/test.m3u8";</script>' }),
  TestHttpError,
  html => /streamUrl="([^"]+)/.exec(html)?.[1] || '',
  html => [/streamUrl="([^"]+)/.exec(html)?.[1]].filter(Boolean),
  async (url, headers) => ({ url, cookie: headers.cookie || '' }),
  () => '',
  (_kind, payload) => `witv:${Buffer.from(JSON.stringify(payload)).toString('base64url')}`,
  token => `/api/tv/embed/${token}`,
  (url, headers, meta) => { issuedWiTv = { url, headers, meta }; return 'witv-hls-token'; },
  token => `/api/tv/stream/${encodeURIComponent(token)}`
);
const wiOption = await resolveWiTvPlayerOption({ label: 'Serveur 1', url: 'https://witv.football/player/playerjs/witv-player.php?id=1', host: 'witv.football' }, 0, 'https://witv.football/chaines-live/test.html');
assert.equal(wiOption.playbackType, 'stream');
assert.equal(wiOption.delivery, 'proxied-hls');
assert.equal(wiOption.streamUrl, '/api/tv/stream/witv-hls-token');
assert.equal(issuedWiTv.headers.origin, 'https://witv.football');
assert.equal(issuedWiTv.headers.referer, 'https://witv.football/player/playerjs/witv-player.php?id=1');
assert.equal(issuedWiTv.meta.provider, 'WiTV');
assert.ok(wiOption.fallbackUrl.startsWith('/api/tv/embed/'), 'WiTV doit garder son lecteur web préparé comme secours du HLS direct.');
