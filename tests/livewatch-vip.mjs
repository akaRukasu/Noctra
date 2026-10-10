import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const start = server.indexOf('function liveWatchEmbedReference');
const end = server.indexOf('\n}\n\nasync function liveWatchQuickVipStatus', start) + 2;
assert.ok(start >= 0 && end > start, 'La fonction de reconnaissance LiveWatch doit être isolable.');
const source = server.slice(start, end);
// 200.0.132 : domaine LiveWatch commun (livewatch.icu, ancien livewatch.top).
const isLiveWatchHost = host => /^(?:www\.)?livewatch\.(?:icu|top)$/i.test(String(host || ''));
const liveWatchEmbedReference = Function('isLiveWatchHost', `"use strict"; ${source}; return liveWatchEmbedReference;`)(isLiveWatchHost);
assert.deepEqual(
  liveWatchEmbedReference({ embedUrl: 'https://livewatch.icu/embed/north/france-2-hd-b' }),
  { kind: 'north', id: 'france-2-hd-b' },
  'Nouveau domaine livewatch.icu reconnu'
);

assert.deepEqual(
  liveWatchEmbedReference({ embedUrl: 'https://livewatch.top/embed/23465702012318f8e19efa-8c71a606cd28bf' }),
  { kind: 'main', id: '23465702012318f8e19efa-8c71a606cd28bf' }
);
assert.deepEqual(
  liveWatchEmbedReference({ embedUrl: 'https://livewatch.top/embed/daddy/123' }),
  { kind: 'daddy', id: '123' }
);
assert.deepEqual(
  liveWatchEmbedReference({ embedUrl: 'https://livewatch.top/embed/north/france-2-hd-b' }),
  { kind: 'north', id: 'france-2-hd-b' }
);
assert.deepEqual(
  liveWatchEmbedReference({ embedUrl: 'https://livewatch.top/embed/frame/23465702012318f8e19efa' }),
  { kind: 'frame', id: '23465702012318f8e19efa' }
);
assert.equal(liveWatchEmbedReference({ embedUrl: 'https://example.org/embed/frame/test' }), null);
assert.equal(liveWatchEmbedReference({ embedUrl: 'javascript:alert(1)' }), null);

assert.ok(server.includes("['main', 'daddy', 'north', 'frame'].includes(kind)"), 'Seules les quatre familles LiveWatch prévues doivent être acceptées.');
assert.ok(server.includes('const officialProxy = liveWatchHost'), 'Les proxys LiveWatch doivent être validés explicitement.');
assert.ok(server.includes('...(liveWatchHost ? { authorization:'), 'Le jeton ne doit accompagner que les requêtes vers LiveWatch.');
assert.ok(server.includes('function liveWatchStreamUrlFromPayload') && server.includes("['data', 'result', 'stream', 'playback', 'source']"), 'Le pont VIP doit accepter les réponses LiveWatch imbriquées.');
assert.ok(server.includes('liveWatchVipDiagnostics') && !server.includes("liveWatchVipDiagnosticCheck('DaddyTV'"), 'Le diagnostic VIP du panneau Chaînes doit tester la famille LiveWatch officielle, pas DaddyTV.');
assert.ok(server.includes('liveWatchQuickVipStatus'), 'Le chargement du catalogue ne doit pas attendre un refresh Supabase.');
assert.ok(server.includes('validateLiveWatchStreamReference'), 'Le helper HLS historique doit rester isolé du nouveau chemin principal.');
assert.equal(server.includes('\x08'), false, 'Aucun caractère BACKSPACE ne doit corrompre les regex LiveWatch.');
assert.ok(server.includes('hls\\b|proxy\\b') || server.includes('hls\b|proxy\b'), 'La validation des proxys LiveWatch doit utiliser de vraies limites de mot.');
assert.ok(server.includes("const [sourceName, url] = liveWatchChannelCatalogUrls[0]") && server.includes("liveWatchEmbedReference(channel)?.kind === 'main'"), 'Le panneau LiveWatch doit utiliser uniquement /public/all et les embeds LiveWatch principaux.');
assert.ok(server.includes("description: 'Catalogue LiveWatch officiel · sources alternatives séparées'"), 'Le bandeau LiveWatch doit indiquer clairement que les familles alternatives restent séparées.');

// Régression v74 : la clé publique avait été modifiée dans son payload sans être
// re-signée, ce qui produisait exactement « Invalid API key » dans l'iframe VIP.
const publicKeyMatch = server.match(/const liveWatchSupabaseAnonKey = String\(process\.env\.LIVEWATCH_SUPABASE_ANON_KEY \|\| '([^']+)'/);
assert.ok(publicKeyMatch?.[1], 'Une clé publique Supabase de secours doit rester disponible côté serveur.');
const publicKeyPayload = JSON.parse(Buffer.from(publicKeyMatch[1].split('.')[1], 'base64url').toString('utf8'));
assert.equal(publicKeyPayload.iss, 'supabase', 'La clé LiveWatch ne doit jamais être réécrite sans re-signature.');
assert.equal(publicKeyPayload.role, 'anon', 'La clé publique de secours doit conserver le rôle anon.');
assert.equal(publicKeyPayload.ref, 'atrhxsizjjqjdhjafgei', 'La clé de secours doit correspondre au projet Supabase LiveWatch connu.');
assert.ok(server.includes('discoverLiveWatchPublicConfig') && server.includes('liveWatchConfigFromText'), 'Noctra doit pouvoir redécouvrir automatiquement la configuration publique LiveWatch après rotation.');
assert.ok(server.includes('/invalid api key|api key.*invalid/i'), 'Une rotation de clé LiveWatch doit déclencher une redécouverte avant de déclarer la session VIP invalide.');

const publicConfigHelperStart = server.indexOf('function liveWatchAnonKeyPayload');
const publicConfigHelperEnd = server.indexOf('async function discoverLiveWatchPublicConfig', publicConfigHelperStart);
assert.ok(publicConfigHelperStart >= 0 && publicConfigHelperEnd > publicConfigHelperStart, 'Le détecteur de configuration publique LiveWatch doit être extractible.');
const publicConfigHelpers = new Function('withoutSlash', 'liveWatchSupabaseUrl', 'liveWatchSupabaseProjectRef', 'Buffer', `${server.slice(publicConfigHelperStart, publicConfigHelperEnd)}; return { liveWatchConfigFromText };`)(
  value => String(value || '').replace(/\/+$/, ''),
  'https://oldproject.supabase.co',
  'oldproject',
  Buffer
);
assert.deepEqual(
  publicConfigHelpers.liveWatchConfigFromText('window.cfg={url:"https://newproject.supabase.co",key:"sb_publishable_current123"}', 'https://oldproject.supabase.co'),
  { url: 'https://newproject.supabase.co', anonKey: 'sb_publishable_current123', projectRef: 'newproject' },
  'Une clé publishable LiveWatch découverte doit être associée au projet découvert, pas à l’ancien fallback.'
);

const decorateStart = server.indexOf('async function decorateLiveWatchVipPlayback');
const decorateEnd = server.indexOf('function validLiveWatchChannelReference', decorateStart);
const decorateSource = server.slice(decorateStart, decorateEnd);
assert.ok(decorateSource.includes("playbackType: 'resolver'"), 'Avec le VIP actif, le catalogue doit passer par le resolver qui vérifie réellement la lecture.');
assert.ok(decorateSource.includes('/api/tv/livewatch/resolve/'), 'Le catalogue VIP doit pointer vers le resolver LiveWatch côté serveur.');
assert.ok(decorateSource.includes("streamKind: 'LiveWatch · VIP Premium'"), 'Le catalogue doit indiquer explicitement le chemin VIP.');
assert.ok(decorateSource.includes('vipFallbackUrl: officialEmbed'), 'Le lecteur public doit rester uniquement un secours explicite.');

const resolverStart = server.indexOf('async function resolveLiveWatchVipPlayback');
const resolverEnd = server.indexOf('async function liveWatchVipDiagnosticCheck', resolverStart);
const resolverSource = server.slice(resolverStart, resolverEnd);
assert.ok(resolverSource.includes('liveWatchStreamReference(kind, id, 16_000)'), 'Le clic LiveWatch doit restaurer le chemin Premium direct qui fonctionnait en v80.');
assert.ok(resolverSource.includes('await liveWatchAccessSession()'), 'Le clic LiveWatch doit vérifier la session Premium sans forcer un renouvellement réseau à chaque chaîne.');
assert.ok(server.includes('const liveWatchVipDirectCache = new Map()') && server.includes('Date.now() + 45_000'), 'Le direct Premium doit restaurer le cache v94 de 45 secondes, dernière base réellement stable chez l’utilisateur.');
assert.ok(resolverSource.indexOf("label: 'VIP Premium · direct'") < resolverSource.indexOf("label: 'VIP Premium · LiveWatch officiel'") && resolverSource.indexOf("label: 'VIP Premium · LiveWatch officiel'") < resolverSource.indexOf("label: 'Public · 2 pubs (secours manuel)'"), 'Le direct Premium v80 doit être prioritaire, le lecteur officiel authentifié servir de secours VIP et le public rester manuel.');
assert.ok(resolverSource.includes('/api/tv/livewatch/vip/') && resolverSource.includes('officialBridgeToken'), 'Le resolver VIP doit renvoyer vers un bridge LiveWatch éphémère utilisable par une iframe sandboxée.');
assert.ok(resolverSource.includes("sourceFamily: kind === 'page' ?") && resolverSource.includes("kind === 'main' ? 'LiveWatch' : kind"), 'Le resolver doit annoncer explicitement la famille de lecteur choisie, y compris les wrappers Sports.');

const playStart = shell.indexOf('async function playTvChannel');
const playEnd = shell.indexOf('function setTvMobileView', playStart);
assert.ok(playStart >= 0 && playEnd > playStart, 'La fonction de lecture TV doit être isolable.');
const playSource = shell.slice(playStart, playEnd);
assert.ok(playSource.includes("channel.playbackType === 'resolver' && channel.resolverUrl"), 'Le client doit résoudre le chemin LiveWatch VIP au moment du clic.');
assert.ok(server.includes("Public · 2 pubs (secours manuel)"), 'Le lecteur public doit rester un choix manuel explicitement annoncé avec publicités.');
assert.equal(shell.includes("VIP indisponible · secours public"), false, 'Le client ne doit plus basculer automatiquement vers le lecteur public avec pubs.');
assert.ok(server.includes("label: 'VIP Premium · direct'") && shell.includes("`${liveWatchLabel} · VIP Premium · lecture en direct`"), 'Le direct Premium restauré doit être exposé par le resolver et annoncé comme lecture VIP active côté client.');


assert.ok(server.includes("requestUrl.searchParams.get('logoRefresh') === '1'"), 'La demande de rafraîchissement des logos envoyée par le client doit être réellement traitée côté serveur.');
assert.ok(server.includes('options.logoRefresh') && server.includes('enrichTvLogosFromIptvOrg'), 'Le rafraîchissement LiveWatch doit enrichir synchroniquement les logos manquants.');
assert.ok(server.includes('france|french|francais|belgique|belgium'), 'La correspondance de logos doit tolérer les suffixes géographiques ajoutés par les catalogues TV.');


const bridgeStart = server.indexOf('function liveWatchFakeJwt');
const bridgeEnd = server.indexOf('async function liveWatchBridgeRequest', bridgeStart);
assert.ok(bridgeStart >= 0 && bridgeEnd > bridgeStart, 'Le pont de lecteur LiveWatch doit être extractible.');
const bridgeHelpers = new Function(
  'publicPath', 'liveWatchSupabaseProjectRef', 'liveWatchSupabaseUrl', 'withoutSlash', 'isLiveWatchHost',
  `${server.slice(bridgeStart, bridgeEnd)}; return { sanitizeLiveWatchPlayerHtml };`
)(value => `/noctra${value}`, 'atrhxsizjjqjdhjafgei', 'https://atrhxsizjjqjdhjafgei.supabase.co', value => String(value || '').replace(/\/+$/, ''), isLiveWatchHost);
const preparedVip = bridgeHelpers.sanitizeLiveWatchPlayerHtml(
  '<html><head><script src="/assets/app.js"></script></head><body><video></video></body></html>',
  'https://livewatch.top/embed/test-channel',
  'main',
  'test-channel',
  { accessToken: 'REAL-SERVER-ACCESS-TOKEN', refreshToken: 'REAL-SERVER-REFRESH-TOKEN', userId: 'u1', email: 'vip@example.test', updatedAt: new Date(0).toISOString() }
);
assert.ok(preparedVip.includes('/noctra/api/tv/livewatch/site/main/test-channel/assets/app.js'), 'Les scripts officiels LiveWatch doivent rester chargés via le pont Noctra.');
const preparedVipSri = bridgeHelpers.sanitizeLiveWatchPlayerHtml(
  '<html><head><script src="/assets/app.js" integrity="sha384-old" crossorigin="anonymous"></script></head><body></body></html>',
  'https://livewatch.top/embed/test-channel', 'main', 'test-channel',
  { accessToken: 'REAL-SERVER-ACCESS-TOKEN', refreshToken: 'REAL-SERVER-REFRESH-TOKEN', userId: 'u1', email: 'vip@example.test', isVip: true, role: 'vip', updatedAt: new Date(0).toISOString() }
);
assert.equal(/integrity=/i.test(preparedVipSri), false, 'LiveWatch ne doit pas garder un SRI devenu faux après réécriture des assets.');
assert.equal(/crossorigin=/i.test(preparedVipSri), false, 'LiveWatch ne doit pas garder crossorigin sur les assets passés en same-origin Noctra.');
assert.ok(preparedVip.includes('/^sb-[a-z0-9_-]+-auth-token$/i'), 'Le bridge VIP doit fournir la session virtuelle même si LiveWatch change la clé de stockage Supabase.');
assert.ok(preparedVip.includes('/noctra/api/tv/livewatch/http/main/test-channel'), 'Les appels d’authentification/API doivent passer par le tunnel serveur.');
assert.ok(preparedVip.includes('?media=1&url='), 'Le lecteur VIP préparé doit relayer les médias CDN pour éviter les blocages CORS du sandbox.');
assert.ok(preparedVip.includes('patchSrc(HTMLMediaElement.prototype,true)') && preparedVip.includes('patchSrc(HTMLIFrameElement.prototype,false)'), 'Le bridge doit relayer les vrais médias sans transformer les iframes/players externes en faux flux média.');
assert.ok(preparedVip.includes('NativeURL=window.URL') && preparedVip.includes('NO=new NativeURL(location.href).origin'), 'Le bridge LiveWatch doit reconstruire l’origine Noctra et réparer le constructeur URL du sandbox opaque.');
assert.ok(preparedVip.includes('/^null\\//i.test(raw)?LO+raw.slice(4):raw'), 'Le bridge LiveWatch doit réparer les URLs formées depuis un location.origin opaque.');
assert.ok(server.includes('allowExternalMedia') && server.includes('tvBridgeMediaResponseAllowed'), 'Le relais LiveWatch doit valider le type MIME des médias CDN, y compris sans extension.');
assert.ok(preparedVip.includes('sb-atrhxsizjjqjdhjafgei-auth-token'), 'Le client officiel doit voir une session Supabase virtuelle compatible.');
assert.equal(preparedVip.includes('REAL-SERVER-ACCESS-TOKEN'), false, 'Le vrai bearer LiveWatch ne doit jamais être sérialisé dans le lecteur navigateur.');
assert.equal(preparedVip.includes('REAL-SERVER-REFRESH-TOKEN'), false, 'Le vrai refresh token LiveWatch ne doit jamais être sérialisé dans le lecteur navigateur.');
assert.ok(server.includes('authorization: `Bearer ${session.accessToken}`'), 'Le pont serveur doit substituer le vrai bearer uniquement au moment de la requête amont.');
assert.ok(server.includes("target.searchParams.get('grant_type') === 'refresh_token'") && server.includes('const virtual = liveWatchVirtualSession(session)'), 'Un refresh du client LiveWatch doit recevoir une nouvelle session virtuelle et ne jamais exposer les vrais tokens au navigateur.');
assert.ok(server.includes('/\\/auth\\/v1\\/user\\/?$/i.test(target.pathname)') || server.includes('/\/auth\/v1\/user\/?$/i.test(target.pathname)'), 'Le bridge doit fournir au client officiel son utilisateur authentifié depuis la session serveur.');
assert.ok(server.includes('/\\/rest\\/v1\\/user_profiles\\/?$/i.test(target.pathname)') || server.includes('/\/rest\/v1\/user_profiles\/?$/i.test(target.pathname)'), 'Le bridge doit fournir explicitement le profil VIP au player LiveWatch.');
assert.ok(resolverSource.includes('await liveWatchAccessSession()'), 'Le lecteur VIP doit vérifier la session active avant la résolution directe.');
assert.ok(server.includes("async function proxyLiveWatchVipSite") && server.includes("if (req.method === 'OPTIONS')"), 'Le pont LiveWatch doit répondre correctement aux préflights CORS du sandbox.');
assert.ok(server.includes('/api/tv/livewatch/embed/'), 'La route du lecteur VIP préparé doit exister.');

const cookieStart = server.indexOf('function tvResponseCookieHeader');
const cookieEnd = server.indexOf('function liveWatchStreamUrlFromPayload', cookieStart);
assert.ok(cookieStart >= 0 && cookieEnd > cookieStart, 'Le relayage des cookies LiveWatch doit être extractible.');
const { tvResponseCookieHeader } = Function(`${server.slice(cookieStart, cookieEnd)}; return { tvResponseCookieHeader };`)();
assert.equal(
  tvResponseCookieHeader({ headers: { getSetCookie: () => ['session=abc; Path=/; HttpOnly', 'route=eu; Path=/'] } }),
  'session=abc; route=eu',
  'Les cookies de session du résolveur doivent être relayés vers les playlists/segments LiveWatch.'
);
assert.ok(server.includes('...(reference.headers.cookie ? { cookie: reference.headers.cookie } : {})'), 'Le proxy HLS doit conserver le cookie du chemin VIP.');

const probeHelperStart = server.indexOf('function liveWatchProbeHeaders');
const probeHelperEnd = server.indexOf('async function liveWatchProbeResponse', probeHelperStart);
assert.ok(probeHelperStart >= 0 && probeHelperEnd > probeHelperStart, 'Les helpers de validation HLS LiveWatch doivent être extractibles.');
const probeHelpers = new Function('safeTvRemoteUrl', 'resolveTvUrl', `${server.slice(probeHelperStart, probeHelperEnd)}; return { liveWatchFirstPlaylistUri };`)(
  value => new URL(value),
  (value, base) => new URL(value, base).toString()
);
assert.equal(
  probeHelpers.liveWatchFirstPlaylistUri('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1200000\nvariant/index.m3u8\n', 'https://cdn.example/master.m3u8'),
  'https://cdn.example/variant/index.m3u8',
  'La validation VIP doit suivre la première variante HLS réelle.'
);

console.log('Pont LiveWatch VIP Noctra v88 : OK');
