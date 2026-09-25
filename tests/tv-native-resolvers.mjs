import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

const candidatesStart = server.indexOf('function tvIframeCandidatesFromHtml');
const candidatesEnd = server.indexOf('function isWiTvPublicPlayer', candidatesStart);
assert.ok(candidatesStart >= 0 && candidatesEnd > candidatesStart, 'Le détecteur de lecteurs WiTV doit être extractible.');
const candidatesSource = server.slice(candidatesStart, candidatesEnd);
const tvIframeCandidatesFromHtml = new Function(
  'decodeTvHtml', 'resolveTvUrl', 'stripTvHtml',
  `${candidatesSource}; return tvIframeCandidatesFromHtml;`
)(
  value => String(value || '').replace(/&amp;/gi, '&'),
  (value, base) => new URL(value, base).toString(),
  value => String(value || '').replace(/<[^>]+>/g, ' ')
);
const iframeCandidates = tvIframeCandidatesFromHtml(
  '<div>Source 1<iframe src="\\/player\\/playerjs\\/witv-player.php?id=4"></iframe></div>',
  'https://witv.football/chaines-live/20-canal-sport.html'
);
assert.equal(iframeCandidates[0].url, 'https://witv.football/player/playerjs/witv-player.php?id=4');
assert.equal(iframeCandidates[0].label, 'Serveur 1');

const wiStart = server.indexOf('function wiTvStreamFromPlayerHtml');
const wiEnd = server.indexOf('async function resolveWiTvPlayerOption', wiStart);
assert.ok(wiStart >= 0 && wiEnd > wiStart, 'Le parseur WiTV doit être extractible.');
const wiSource = server.slice(wiStart, wiEnd);
const wiTvStreamFromPlayerHtml = new Function(
  'safeTvRemoteUrl', 'resolveTvUrl', 'decodeTvHtml',
  `${wiSource}; return wiTvStreamFromPlayerHtml;`
)(
  value => new URL(value),
  (value, base) => new URL(value, base).toString(),
  value => String(value || '').replace(/&amp;/gi, '&')
);

assert.equal(
  wiTvStreamFromPlayerHtml('<script>var streamUrl = "https://video.example/live/chaine.m3u8";</script>', 'https://witv.football/player/'),
  'https://video.example/live/chaine.m3u8'
);
assert.equal(
  wiTvStreamFromPlayerHtml('<script>new Playerjs({id:"player", file:"/hls/direct.m3u8"});</script>', 'https://cdn.example/player/index.html'),
  'https://cdn.example/hls/direct.m3u8'
);
assert.equal(
  wiTvStreamFromPlayerHtml('<script>var streamUrl = "https://video.example/file.mp4";</script>', 'https://witv.football/'),
  '',
  'WiTV ne doit accepter ici que les playlists HLS publiques.'
);
assert.ok(server.includes("delivery: 'proxied-hls'") && server.includes('fallbackUrl'),
  'WiTV doit relayer son HLS avec les en-têtes officiels tout en gardant le lecteur web en secours.');
const wiResolver = server.slice(server.indexOf('async function resolveTvPageReference'), server.indexOf('const wiTvCategories'));
assert.ok(wiResolver.includes('[choices[active.serverIndex], ...choices.filter') && wiResolver.indexOf('const options = active') < wiResolver.indexOf('lecteur officiel WiTV'),
  'Le HLS WiTV doit être proposé avant le lecteur web.');

const ohaStart = server.indexOf('function cleanOhaChannelName');
const ohaEnd = server.indexOf('async function ohaCatalogPage', ohaStart);
assert.ok(ohaStart >= 0 && ohaEnd > ohaStart, 'Les normaliseurs OHA doivent être extractibles.');
const helperSource = server.slice(ohaStart, ohaEnd);
const ohaHelpers = new Function(
  'safeTvRemoteUrl', 'HttpError',
  `${helperSource}; return { cleanOhaChannelName, ohaServerLabel, ohaProgramme, ohaRootAlternatives, ohaRequestBody, ohaProviderHttpError };`
)(
  value => new URL(String(value)),
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
);
assert.equal(ohaHelpers.cleanOhaChannelName('13 EME RUE FHD |H'), '13 EME RUE');
assert.equal(ohaHelpers.ohaServerLabel('13 EME RUE FHD |H', 0), 'FHD · Serveur H');
const programmes = ohaHelpers.ohaProgramme([
  { start: Math.floor(Date.now() / 1000) - 60, stop: Math.floor(Date.now() / 1000) + 60, name: 'En cours' },
  { start: Math.floor(Date.now() / 1000) + 60, stop: Math.floor(Date.now() / 1000) + 120, name: 'Ensuite' }
]);
assert.equal(programmes.now.title, 'En cours');
assert.equal(programmes.next.title, 'Ensuite');
assert.deepEqual(ohaHelpers.ohaRootAlternatives('https://oha.cx/live'), [
  'https://oha.cx/live',
  'https://kool.ws/live',
  'http://185.254.196.78/live'
]);
assert.equal(ohaHelpers.ohaRequestBody('resolve', { url: 'https://oha.cx/channel/a' }).clientVersion, '3.0.2', 'Le resolver OHA doit envoyer la version de protocole moderne sans signature contournée.');
assert.equal(ohaHelpers.ohaProviderHttpError(501, 'catalogue').status, 503, 'Un HTTP 501 amont doit être identifié comme panne fournisseur et non comme panne Noctra.');

assert.ok(server.includes("const ohaPublicGroups = ['France', 'France Sport']"));
assert.ok(server.includes('resolverUrl: `/api/tv/oha/resolve/${reference}`'), 'OHA doit laisser le client appliquer BASE_URL une seule fois.');
assert.ok(server.includes('async function resolveSingleOhaCandidate') && server.includes('firstSuccessfulOhaCandidate'),
  'OHA doit sélectionner rapidement le premier serveur valide sans rafale de requêtes.');
assert.ok(server.includes('function ohaResolvedStreamUrl'), 'OHA doit accepter les réponses de résolveur JSON imbriquées.');
assert.ok(server.includes('ohaRootAlternatives(reference.meta.root)'), 'Le resolver doit utiliser la racine publique OHA configurée avant de conclure à une panne.');
assert.ok(server.includes("clientVersion: '3.0.2'"), 'Les requêtes OHA doivent inclure la version de protocole actuelle connue.');
const nativeResolveStart = server.indexOf('async function resolveSingleOhaCandidate');
const nativeResolveEnd = server.indexOf('async function firstSuccessfulOhaCandidate', nativeResolveStart);
assert.ok(!server.slice(nativeResolveStart, nativeResolveEnd).includes('mediahubmx-signature'), 'Le résolveur natif ne doit pas inventer de signature OHA.');
assert.ok(server.includes("req.headers['mediahubmx-signature']") && server.includes("upstreamHeaders['mediahubmx-signature']"), 'Le pont du lecteur officiel doit relayer la signature MediaHubMX réellement produite par OHA sans la fabriquer.');
assert.ok(server.includes("req.headers['mediaurl-signature']") && server.includes("upstreamHeaders['mediaurl-signature']"), 'Le pont OHA doit aussi relayer Mediaurl-Signature, requise par /mediaurl-resolve.json.');

const ohaFallbackStart = server.indexOf('function ohaWebFallbackOption');
const ohaFallbackEnd = server.indexOf('function ohaResolvedStreamUrl', ohaFallbackStart);
assert.ok(ohaFallbackStart >= 0 && ohaFallbackEnd > ohaFallbackStart, 'Le repli web OHA doit être extractible.');
const ohaWebFallbackOption = new Function('tvPublicOhaEmbedUrl', `${server.slice(ohaFallbackStart, ohaFallbackEnd)}; return ohaWebFallbackOption;`)(token => `/api/tv/oha/embed/${token}`);
assert.deepEqual(
  ohaWebFallbackOption({ meta: { fallbackUrl: 'https://oha.cx/live?live=6ter', root: 'https://oha.cx/live' } }, 'state-token'),
  { label: 'OHA intégré', url: '/api/tv/oha/embed/state-token', externalUrl: 'https://oha.cx/live?live=6ter', playbackType: 'embed', compatPage: true, fallback: true, native: false, officialClient: true },
  'Le client officiel OHA doit être exécuté dans le bridge isolé Noctra.'
);
assert.ok(server.includes("encodeTvStateReference('oha'") && server.includes('fallbackUrl: fallbackUrl ? safeTvRemoteUrl(fallbackUrl).toString()'), 'La référence OHA stateless doit mémoriser le lecteur web de secours.');
const ohaResolverStart = server.indexOf('async function resolveOhaStreamReference');
const ohaResolverEnd = server.indexOf('function buildOhaCatalog', ohaResolverStart);
const ohaResolverSource = server.slice(ohaResolverStart, ohaResolverEnd);
assert.ok(ohaResolverSource.includes('options: nativeAttempt ? [nativeAttempt, bridge] : [bridge]'), 'OHA doit restaurer l’ordre v94 : premier flux natif résolu immédiatement, bridge officiel en secours.');
assert.ok(ohaResolverSource.includes('const serverChoices = candidates.map') && ohaResolverSource.includes('resolveUrl: `${resolverPath}?server=${index}`'), 'Chaque variante OHA publiée doit être sélectionnable et résolue à la demande.');
assert.ok(ohaResolverSource.includes('bridge.manualOnly = true') && ohaResolverSource.includes('throw new HttpError(502'), 'Une variante native indisponible ne doit plus basculer automatiquement vers le web.');
assert.equal(ohaResolverSource.includes("label: 'OHA officiel'"), false, 'La page OHA distante bloquée par le framing ne doit plus être proposée dans l’iframe.');
assert.ok(server.includes('async function proxyOhaEmbed') && server.includes('async function proxyOhaSite') && server.includes('async function proxyOhaHttp'), 'OHA doit disposer d’un lecteur officiel isolé et de tunnels limités à ses domaines.');
assert.ok(server.includes('rewriteOhaBridgeAssetText'), 'Les chunks JS/CSS dynamiques OHA doivent rester dans le bridge Noctra.');

const ohaResolveStart = server.indexOf('function ohaResolvedStreamUrl');
const ohaResolveEnd = server.indexOf('async function resolveSingleOhaCandidate', ohaResolveStart);
const ohaResolvedStreamUrl = new Function(`${server.slice(ohaResolveStart, ohaResolveEnd)}; return ohaResolvedStreamUrl;`)();
assert.equal(
  ohaResolvedStreamUrl({ url: 'https://oha.cx/watch?live=6ter', data: { hls_url: 'https://cdn.example/live/6ter/master.m3u8?token=abc' } }),
  'https://cdn.example/live/6ter/master.m3u8?token=abc',
  'Le résolveur OHA doit préférer le vrai HLS à une URL de page OHA.'
);
assert.equal(
  ohaResolvedStreamUrl({ image: 'https://cdn.example/logo.png', stream: { src: 'https://video.example/channel/manifest.mpd' } }),
  'https://video.example/channel/manifest.mpd',
  'Les images ne doivent jamais être choisies à la place du flux vidéo.'
);
assert.ok(server.includes('async function ohaCatalogPage') && server.includes('progressive: Boolean(options.progressive)'), 'Le catalogue OHA doit pouvoir rendre sa première page avant la pagination complète.');
assert.ok(server.includes("url: 'https://kool.ws/live'") && server.includes("tvCatalogFromOha(rootValue = 'https://kool.ws/live')"), 'OHA doit suivre sa source publique Kool actuelle.');
assert.ok(!server.includes('oha.to'), 'OHA ne doit plus référencer oha.to, domaine retiré.');
assert.ok(server.includes("decodeTvStateReference(token, 'oha')"), 'Une chaîne OHA doit rester résoluble après disparition de la Map mémoire.');

console.log('Résolveurs TV WiTV/OHA Noctra v88 : OK');
