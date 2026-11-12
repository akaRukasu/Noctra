// Appli iOS 26 native (apps/ios-native) : structure, comportements du système, construction.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const src = name => read(`apps/ios-native/Noctra/Sources/${name}.swift`);

const project = await read('apps/ios-native/project.yml');
assert.match(project, /deploymentTarget:\s*\n\s*iOS: "26\.0"/, 'iOS 26 minimum');
assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER: com\.noctra\.app/);

const app = await src('NoctraApp');
assert.match(app, /Tab\("Découvrir", systemImage: "sparkles"/);
assert.match(app, /\.tabBarMinimizeBehavior\(\.onScrollDown\)/, 'barre d’onglets qui se rétracte');
assert.match(app, /role: \.search/, 'onglet de recherche d’iOS 26');
assert.match(app, /\.navigationTransition\(\.zoom\(sourceID: item\.id, in: zoom\)\)/, 'transition zoom vers la fiche');

const theme = await src('Theme');
// Identité visuelle du site (« Aurora 2 », public/noctra-aurora.css) : mêmes jetons, police Sora, logo.
const aurora = await read('public/noctra-aurora.css');
for (const [token, hex] of [['--na-bg', '05060d'], ['--na-lilac', 'c4b5fd'], ['--na-pink', 'f0abfc'], ['--na-cyan', '7dd3fc'], ['--na-teal', '5eead4'], ['--na-violet', 'a78bfa']]) {
  assert.ok(aurora.includes(`${token}:#${hex}`), `site : ${token}`);
  assert.ok(theme.toLowerCase().includes(`hex: 0x${hex}`), `appli iOS : ${token} (#${hex})`);
}
assert.match(theme, /struct NoctraMark: View/);
assert.match(theme, /"NoctraSora-Bold"/);
const plistNative = await read('apps/ios-native/Noctra/Info.plist');
for (const weight of ['Regular', 'SemiBold', 'Bold', 'ExtraBold']) assert.ok(plistNative.includes(`<string>NoctraSora-${weight}.ttf</string>`), `police Sora ${weight}`);
assert.match(await src('HomeView'), /Text\("VOTRE SALLE DE CINÉMA"\)/);
assert.match(theme, /matchedTransitionSource\(id: id, in: namespace\)/);

assert.match(await src('LoginView'), /GlassEffectContainer\(spacing: 14\)/);
assert.match(await src('HomeView'), /\.scrollTargetBehavior\(\.paging\)/);
assert.match(await src('ItemDetailView'), /\.visualEffect \{ content, proxy in/, 'fond étirable');

const playback = await src('Playback');
assert.match(playback, /AVPlayerViewController\(\)/);
assert.match(playback, /allowsPictureInPicturePlayback = true/);
assert.match(playback, /"\/Sessions\/Playing\/Stopped"/, 'reprise envoyée à Jellyfin');

const session = await src('Session');
assert.match(session, /kSecClassGenericPassword/, 'jeton dans le trousseau');
assert.match(session, /func isNoctraOrigin\(_ url: URL\) -> Bool/, 'jeton Noctra jamais envoyé ailleurs');

const workflow = await read('.github/workflows/noctra-ios-native.yml');
assert.match(workflow, /runs-on: macos-26/);
assert.match(workflow, /Noctra-ios26-unsigned\.ipa/);
assert.match(await read('.github/workflows/noctra-apps.yml'), /- '!apps\/ios-native\/\*\*'/);

// v2.1 : TV qui fonctionne (cookie de session Noctra pour chaque segment), toutes les chaînes réunies,
// lecteur web de secours (MPEG-TS, sites), SyncPlay, cast, Découvrir / Demandes / Roulette, accueil complet.
const playback2 = await src('Playback');
assert.match(playback2, /options\[AVURLAssetHTTPCookiesKey\] = cookies/);
assert.match(playback2, /SyncPlayManager\.shared\.setQueue\(item\.id, startSeconds: startSeconds\)/);
const live = await src('LiveTVViews');
const names = await src('LiveNames');
assert.match(names, /static func key\(_ name: String, country: String\) -> String/, 'chaînes réunies par nom et par pays');
assert.match(live, /for _ in 0\.\.<6 \{/, 'catalogues chargés 6 à la fois');
assert.match(live, /let libraries = transport \? \["mpegts\.js"\] : \["shaka-player\.compiled\.js", "hls\.min\.js"\]/, 'flux MPEG-TS lus par mpegts.js, HLS par Shaka puis hls.js (comme le site)');
const syncplay = await src('SyncPlay');
for (const route of ['/SyncPlay/List', '/SyncPlay/New', '/SyncPlay/Join', '/SyncPlay/Ready', '/SyncPlay/SetNewQueue', '/GetUtcTime', '/Sessions/Capabilities/Full']) {
  assert.ok(syncplay.includes(route), `SyncPlay : ${route}`);
}
assert.match(syncplay, /case "SyncPlayCommand":/);
const cast = await src('Cast');
assert.match(cast, /AVRoutePickerView\(\)/);
assert.match(cast, /"\/Sessions\/\\\(target\.id\)\/Playing"/);
const discover = await src('DiscoverViews');
for (const route of ['/api/discovery?category=', '/api/jellyseerr/request', '/api/jellyseerr/search?q=', '/api/jellyseerr/requests', '/api/roulette?']) {
  assert.ok(discover.includes(route), `Découvrir : ${route}`);
}
const home = await src('HomeView');
assert.match(home, /"\/api\/home\/resume"/);
assert.match(home, /Text\("À l’affiche chez vous"\)/);
assert.match(await src('Session'), /func establishNoctraSession\(\) async/);
// Physique d'iOS : boutons Liquid Glass natifs teintés aux couleurs du site, appui long avec aperçu.
assert.match(theme, /buttonStyle\(\.glassProminent\)\s*\n\s*\.tint\(Theme\.lilac\)/);
assert.doesNotMatch(theme, /struct AuroraPrimaryStyle/);
const components = await src('Components');
assert.match(components, /\.contextMenu \{[\s\S]*\} preview: \{/);
assert.equal((components.match(/\.modifier\(ItemContextMenu\(/g) || []).length, 2, 'appui long sur affiches et vignettes');
// 2.4 : routes Noctra sous /noctra, mise en page, sous-titres, Chromecast, administration.
const sessionSrc = await src('Session');
assert.match(sessionSrc, /URL\(string: noctraBase \+ raw\)/, 'routes /api/… résolues sous le dossier Noctra');
assert.match(components, /Color\.clear\s*\n\s*\.overlay\(alignment: alignment\)/, 'images rognées dans leur cadre');
const subtitlesSrc = await src('Subtitles');
assert.match(subtitlesSrc, /static func parse\(_ raw: String\) -> \[SubtitleCue\]/);
assert.equal(WebVttSeconds('01:02:03.500'), 3723.5);
const playbackSrc = await src('Playback');
assert.match(playbackSrc, /Subtitles\/\\\(chosen\)\/0\/Stream\.vtt/);
assert.match(playbackSrc, /"Method": "External"/);
const chromecast = await src('Chromecast');
assert.match(chromecast, /"_googlecast\._tcp"/);
assert.match(chromecast, /"CC1AD845"/, 'lecteur multimédia par défaut de Google');
assert.match(chromecast, /urn:x-cast:com\.google\.cast\.media/);
assert.match(plistNative, /<string>_googlecast\._tcp<\/string>/, 'Bonjour autorisé pour le Cast');
assert.match(await src('Cast'), /ChromecastController\.shared\.cast\(/);
const admin = await src('AdminViews');
for (const route of ['"/System/Info"', '"/Sessions"', '"/ScheduledTasks"', '"/System/ActivityLog/Entries"', '"/Users/New"', '/Policy"', '"/api/downloads/add"']) {
  assert.ok(admin.includes(route), `administration : ${route}`);
}
assert.match(components, /NavigationLink \{ AdminHomeView\(\) \}/);
// 2.5 : performances et hors ligne.
const pipeline = await src('ImagePipeline');
assert.match(pipeline, /kCGImageSourceShouldCacheImmediately/, 'images décodées hors du fil principal');
assert.match(components, /ImagePipeline\.shared\.cached\(url\)/);
assert.doesNotMatch(components, /AsyncImage/);
assert.match(theme, /\.drawingGroup\(\)/, 'fond Aurora aplati');
assert.match(theme, /isLowPowerModeEnabled/);
assert.match(sessionSrc, /Task\.detached\(priority: \.userInitiated\)/, 'JSON décodé en tâche de fond');
const offline = await src('Offline');
assert.match(offline, /URLSessionConfiguration\.background\(withIdentifier: Self\.fileIdentifier\)/);
assert.match(offline, /makeAssetDownloadTask\(downloadConfiguration: configuration\)/, 'HLS enregistré par iOS');
assert.match(offline, /didFinishDownloadingTo location: URL\) \{[\s\S]*moveItem\(at: location, to: destination\)/, 'fichier déplacé avant la fin du délégué');
assert.match(offline, /"noctra-offline-\\\(id\)"/, 'appareil distinct : une lecture en cours n’est pas coupée');
assert.match(await src('NoctraApp'), /@UIApplicationDelegateAdaptor\(NoctraAppDelegate\.self\)/);
assert.match(playbackSrc, /func playOffline\(/);
// 2.6 : images, TV (pays, VIP, meilleur serveur), sous-titres, tableau de bord natif.
assert.match(components, /if let hit = ImagePipeline\.shared\.cached\(url\) \{\s*\n\s*if loaded\?\.url != url \{ loaded = \(url, hit\) \}/, 'image affichée même chargée hors écran');
assert.match(names, /static let tntNumbers/);
assert.match(names, /"fr": "France"/);
const servers = await src('LiveServers');
for (const piece of ['static func rank(', 'static func probe(', 'if server.vip && server.kind == .resolve { base += 2 }', 'noctra.tv.health.v1']) assert.ok(servers.includes(piece), `serveurs TV : ${piece}`);
assert.match(live, /"\/api\/tv\/livewatch\/session"/, 'accès VIP lus sur le serveur');
assert.match(live, /var country: String = UserDefaults\.standard\.string\(forKey: "noctra\.tv\.country"\) \?\? "fr"/, 'France par défaut');
assert.match(subtitlesSrc, /guard let host = controller\.view/, 'sous-titres posés au-dessus du lecteur');
assert.match(subtitlesSrc, /timeoutInterval = attempt == 0 \? 240 : 120/);
const adminServer = await src('AdminServerViews');
for (const route of ['"/System/Configuration/encoding"', '"/Library/VirtualFolders"', '"/Devices"', '"/Auth/Keys"', '"/Plugins"', '"/Packages"', '"/System/Logs"', '"/Environment/Drives"']) {
  assert.ok(adminServer.includes(route), `tableau de bord natif : ${route}`);
}
assert.doesNotMatch(admin, /WKWebView/, 'plus de tableau de bord web');
// 2.7 : lecteur TV (chaînes et serveurs), sport, sources externes, Radarr/Sonarr, recherche interactive.
const server = await read('server.mjs');
const livePlayer = await src('LivePlayer');
assert.match(livePlayer, /func zap\(_ delta: Int\)/, 'changer de chaîne depuis le lecteur');
assert.match(livePlayer, /func play\(/, 'changer de serveur depuis le lecteur');
assert.match(live, /LivePlayerModel\.shared\.start\(/);
assert.match(live, /sport = "Sport"/);
assert.match(live, /struct EventList/);
assert.match(live, /\("sports", "Sport"/, 'sources sport regroupées');
assert.match(live, /createWebViewWith configuration/, 'fenêtres surgissantes des lecteurs externes');
const arr = await src('ArrViews');
for (const route of ['/api/servarr/center', '/api/servarr/lookup', '/api/servarr/add', '/api/servarr/monitor', '/api/servarr/command', '/api/servarr/releases', '/api/servarr/episodes', '/api/servarr/grab', '/api/discovery/grab']) {
  assert.ok(arr.includes(route), `Radarr/Sonarr : ${route}`);
  assert.ok(server.includes(`'${route}'`), `route serveur : ${route}`);
}
assert.match(adminServer, /ArrHubView\(kind: \.radarr\)/);
assert.match(adminServer, /ArrHubView\(kind: \.sonarr\)/);
assert.match(await src('DiscoverViews'), /ReleaseSearchHub\(mediaType: item\.mediaType/, 'recherche interactive depuis les demandes');
// 2.8 : moteur web comme Northlive, test des flux continus, VIP, bouquets, logo, SyncPlay, cast partout.
assert.match(servers, /URLSession\.shared\.bytes\(for: request\)/, 'flux continus testés sur leurs premiers octets');
assert.match(servers, /static func sniff\(/);
assert.match(servers, /if result\.format == \.ts \{ mpegts = true \}/, 'flux MPEG-TS reconnu confié au moteur web');
assert.match(servers, /static func prefersWeb\(/, 'moteur mémorisé par fournisseur');
assert.match(servers, /"\/api\/tv\/livewatch\/prepare\/north\/"/, 'relais officiel NorthTV');
assert.match(livePlayer, /private func engineFailed\(/, 'repli lecteur d’Apple / moteur web');
assert.match(livePlayer, /timeout: server\.vip \? 110 : 45/, 'VIP LiveWatch : délai de vérification suffisant (PC : 90 s)');
assert.match(livePlayer, /func webEvent\(/);
assert.match(live, /configuration\.userContentController\.add\(context\.coordinator, name: "noctra"\)/, 'pages du lecteur reliées à l’appli');
assert.match(live, /sandbox: String\? = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"/, 'pont VIP dans un cadre comme sur PC');
// 2.10 : lecteurs des sites seuls (embedUrl) dans un cadre comme sur PC, toutes les variantes LiveWatch.
const factory = await src('LiveServers');
assert.match(factory, /\[raw\["embedUrl"\], raw\["vipFallbackUrl"\], raw\["externalUrl"\], raw\["url"\]\]/, 'lecteur seul avant la page du site');
assert.match(factory, /raw\["liveWatchVariants"\]/, 'toutes les variantes LiveWatch');
assert.match(factory, /"DLStreams"/, 'cadre sans restriction pour les lecteurs qui les refusent');
assert.match(live, /request\.framed/);
// 2.10 : langue audio respectée, menu des pistes dans le lecteur, fiche fiable.
const playback210 = await src('Playback');
assert.match(playback210, /body\["EnableDirectPlay"\] = false/, 'autre langue : flux préparé avec cette piste');
assert.match(playback210, /func switchTracks\(audio: Int\?, subtitle: Int\)/);
assert.match(await src('Subtitles'), /final class TrackMenuButton/);
const detail210 = await src('ItemDetailView');
assert.match(detail210, /private func fetchDetail\(\) async -> BaseItem\?/, 'nouvel essai du chargement de la fiche');
assert.match(detail210, /frame\(height: max\(topInset, 44\)\)/, 'image entière sous la barre du haut');
assert.match(live, /struct BouquetCard/);
assert.match(await src('ItemDetailView'), /\.frame\(height: 72\)/, 'logo du titre à sa taille');
assert.match(syncplay, /private var openGroups: some View/);
assert.match(components, /CastButton\(\)/, 'bouton de diffusion sur chaque onglet');
assert.match(await src('ItemDetailView'), /\.aspectRatio\(16 \/ 9, contentMode: \.fit\)/, 'bannière des fiches en 16:9');
assert.match(livePlayer, /\.accessibilityLabel\("Quitter le lecteur"\)/);
// 2.9 : détection des serveurs (direct qui avance, chiffrement, débit MPEG-TS, pages, confiance, cache, nouveau test).
assert.match(servers, /direct figé \(aucun nouveau segment\)/, 'direct figé repéré en relisant la liste');
assert.match(servers, /flux chiffré \(FairPlay\)/);
assert.match(servers, /private static func probeTransport\(/, 'débit des flux MPEG-TS mesuré');
assert.match(servers, /private static func probePage\(/, 'pages des lecteurs testées');
assert.match(servers, /static func probeTrust\(/, 'confiance apprise dans les tests');
assert.match(servers, /static func withCachedProbes\(/, 'derniers tests réutilisés');
assert.match(livePlayer, /private func retest\(\)/, 'nouveau test pendant la lecture');
console.log('Appli iOS 26 native : OK');

// Même lecture des horodatages que WebVTT.seconds (Subtitles.swift).
function WebVttSeconds(value) {
  return value.replace(',', '.').split(':').reduce((total, field) => total * 60 + Number(field), 0);
}

// 2.10.1 : VIP LiveWatch préparé une seule fois et lu comme sur PC ; photo de profil.
{
  const livePlayer = await read('apps/ios-native/Noctra/Sources/LivePlayer.swift');
  const liveViews = await read('apps/ios-native/Noctra/Sources/LiveTVViews.swift');
  assert.match(liveViews, /if server\.kind == \.resolve, server\.vip \{ return \(index, \[server\] \+/, 'VIP jamais demandé avec 4 s de délai à l’ouverture');
  assert.match(livePlayer, /server\.vip \? 30 : 20/, 'VIP : premier chargement du flux plus long');
  assert.match(livePlayer, /Lecteur VIP sans image : lecture directe du flux repéré/, 'flux repéré par le pont VIP lu par l’appli');
  assert.match(livePlayer, /noctraJSON\("\/api\/session", timeout: 10\)/, 'cookie de session renouvelé avant le VIP');
  const session = await read('apps/ios-native/Noctra/Sources/Session.swift');
  assert.match(session, /func avatarURL/, 'photo de profil');
  assert.match(session, /\/Users\/\\\(userId\)\/Images\/Primary/);
  const components = await read('apps/ios-native/Noctra/Sources/Components.swift');
  assert.match(components, /struct AccountAvatar/);
  assert.match(components, /AccountAvatar\(size: 30/, 'photo en haut à droite à la place de l’initiale');
  console.log('Appli iOS native 2.10.1 : VIP et photo de profil vérifiés.');
}
{
  const intro = await read('apps/ios-native/Noctra/Sources/Intro.swift');
  assert.match(intro, /struct NoctraIntro/, 'intro animée à l’ouverture, comme sur le site');
  assert.match(intro, /Text\("NOCTRA"\)/);
  assert.match(await read('apps/ios-native/Noctra/Sources/NoctraApp.swift'), /NoctraIntro \{/);
  console.log('Appli iOS native 2.10.1 : intro vérifiée.');
}

// 2.11 : moteur du site (Shaka), VIP non prioritaire, variantes VIP, lecteurs des sites, recherche interactive, explorateur, état des séries.
{
  const src = name => read(`apps/ios-native/Noctra/Sources/${name}.swift`);
  const views = await src('LiveTVViews');
  assert.match(views, /ignoreManifestProgramDateTime:true,sequenceMode:true/, 'Shaka réglé comme sur le site');
  assert.match(views, /need-hls/, 'hls.js glissé dans les lecteurs des sites (erreur 224003)');
  assert.match(views, /enum HlsLibrary/);
  const servers = await src('LiveServers');
  assert.match(servers, /if server\.vip && server\.kind == \.resolve \{ base \+= 2 \}/, 'VIP plus prioritaire d’office');
  assert.ok(!/if server\.vip \{ base -= 2\.5 \}/.test(servers));
  assert.match(servers, /return !server\.provider\.localizedCaseInsensitiveContains\("NorthTV"\)/, 'moteur web d’abord, lecteur d’Apple pour NorthTV');
  assert.match(servers, /mobile", value: "1"/, 'liens Alternative ouverts directement');
  assert.match(servers, /!\(item\.vip && item\.kind == \.native\)/, 'variantes VIP en relais automatiques');
  const arr = await src('ArrViews');
  assert.match(arr, /struct ReleaseSearchHub/);
  assert.match(arr, /allSeasons=1/);
  assert.match(arr, /progress=1/, 'recherche suivie comme sur le site');
  assert.match(arr, /Saisons complètes/);
  const discover = await src('DiscoverViews');
  assert.match(discover, /ReleaseSearchHub\(mediaType: item\.mediaType/);
  assert.match(discover, /Déjà demandé mais pas encore disponible/);
  const files = await src('FileExplorer');
  for (const route of ['/api/files/roots', '/api/files?root=', '/api/files/rename', '/api/files/trash', '/api/files/mkdir', '/api/files/empty-trash', '/api/files/duplicates/start', '/api/files/duplicates/delete', '/api/files/completeness/start', '/api/files/completeness/group', '/api/library/series-status']) {
    assert.ok(files.includes(route), `explorateur : ${route}`);
  }
  assert.match(await src('LibraryViews'), /FileExplorerView\(\)/, 'bouton Explorateur des médiathèques');
  assert.match(await src('Components'), /SeriesStatusBadge\(id: item\.id\)/, 'état des séries sur les affiches');
  assert.match(await src('ItemDetailView'), /SeriesStatusBadge\(id: shown\.id, large: true\)/, 'état de la série sur la fiche');
  console.log('Appli iOS native 2.11 : vérifiée.');
}
// 2.12 : variantes VIP, trackers patients, tri par compte, destination des demandes.
{
  const src = name => read(`apps/ios-native/Noctra/Sources/${name}.swift`);
  assert.match(await src('LiveServers'), /func liveWatchVipVariants/, 'variantes LiveWatch d’une chaîne VIP en flux VIP');
  assert.match(await src('LiveServers'), /\/api\/tv\/livewatch\/hls\//);
  assert.match(await src('ArrViews'), /patient=1/, 'trackers : jusqu’à une minute');
  assert.match(await src('ArrViews'), /download-options\?mediaType=/, 'destination proposée selon la catégorie');
  assert.match(await src('LibraryViews'), /noctra\.sort\./, 'tri gardé pour le compte de l’appareil');
  assert.match(await src('DiscoverViews'), /struct RequestDestinationView/);
  assert.match(await src('DiscoverViews'), /\/approve" : "decline"|approve \? "approve" : "decline"/);
  console.log('Appli iOS native 2.12 : vérifiée.');
}
// 2.13 : déplacer un dossier, changer le dossier d'un film/série, stockage de la seedbox.
{
  const src = name => read(`apps/ios-native/Noctra/Sources/${name}.swift`);
  const files = await src('FileExplorer');
  assert.match(files, /\/api\/files\/move/, 'déplacer un fichier ou un dossier');
  assert.match(files, /struct FolderPickerView/);
  assert.match(files, /struct StorageView/);
  assert.match(files, /\/api\/files\/storage/);
  assert.match(await src('ArrViews'), /struct ArrMoveView/);
  assert.match(await src('ArrViews'), /\/api\/servarr\/move/);
  assert.match(await src('Components'), /StorageView\(\)/, 'stockage dans le compte (administrateurs)');
  console.log('Appli iOS native 2.13 : vérifiée.');
}
// 2.14 : variantes LiveWatch dans la liste des serveurs, bouton pistes du lecteur hors de la barre Apple.
{
  const src = name => read(`apps/ios-native/Noctra/Sources/${name}.swift`);
  assert.match(await src('LiveServers'), /static func liveWatchVariants\(of server: LiveServer, session: Session\)/);
  assert.match(await src('LiveServers'), /\/api\/tv\/livewatch\/variants\//);
  assert.match(await src('LiveTVViews'), /LiveServerFactory\.liveWatchVariants\(of: server, session: session\)/, 'variantes listées dès la préparation');
  assert.match(await src('Subtitles'), /button\.topAnchor\.constraint\(equalTo: host\.safeAreaLayoutGuide\.topAnchor, constant: 68\)/, 'bouton pistes sous le bouton volume');
  console.log('Appli iOS native 2.14 : vérifiée.');
}
// 2.14.1 : compte VIP LiveWatch, jamais de pub à regarder.
{
  const servers = await read('apps/ios-native/Noctra/Sources/LiveServers.swift');
  assert.match(servers, /lecteur officiel VIP/, 'lecteur officiel ouvert avec la session VIP du serveur');
  assert.match(servers, /"\/api\/tv\/livewatch\/prepare\/"/);
  assert.match(servers, /if server\.vip, isLiveWatchURL\(url\) \{ return nil \}/, 'page publique LiveWatch (pubs) écartée en VIP');
  console.log('Appli iOS native 2.14.1 : vérifiée.');
}
// 2.15 : multiview de toutes les sources, diffusé et piloté sur Noctra TV.
{
  const src = name => read(`apps/ios-native/Noctra/Sources/${name}.swift`);
  const multiview = await src('Multiview');
  for (const name of ['final class MultiviewStore', 'final class MultiviewTile', 'struct MultiviewView', 'struct MultiviewAddSheet', 'struct MultiviewCastSheet', 'struct MultiviewBar']) assert.ok(multiview.includes(name), name);
  assert.match(multiview, /func solo\(_ tile: MultiviewTile\)/, 'chaîne mise en avant avec le son seul');
  assert.match(multiview, /tile\.(?:player\.isMuted = |setMuted\()(?:castTarget != nil \|\| )?tile\.id != audio/, 'une seule chaîne écoutée');
  assert.match(multiview, /LiveLauncher\.shared\.prepare\(channel, session: session\)/, 'serveurs de toutes les sources');
  const remote = await src('RemotePlayback');
  for (const action of ['playMultiview', 'multiAdd']) assert.ok(remote.includes(`"${action}"`), action);
  for (const action of ['multiAudio', 'multiSolo', 'multiRemove', 'multiGrid']) assert.ok(remote.includes(`"${action}"`), action);
  assert.match(await src('LiveTVViews'), /if multiview\.selecting \{ withAnimation\(Theme\.spring\) \{ multiview\.toggle\(channel\) \}; return \}/);
  assert.match(await src('NoctraApp'), /MultiviewView\(\)/);
  console.log('Appli iOS native 2.15 : vérifiée.');
}
// 2.15.1 : multiview comme sur la version web et sur Android (depuis le lecteur, plein écran d'une vignette).
{
  const src = name => read(`apps/ios-native/Noctra/Sources/${name}.swift`);
  assert.match(await src('LivePlayer'), /private var multiviewMenu: some View/, 'chaîne en cours ajoutée au multiview');
  assert.match(await src('Multiview'), /func zoom\(_ tile: MultiviewTile\)/);
  assert.match(await src('Multiview'), /TileGestures\(enabled: tile\.web == nil, zoom: \{ store\.zoom\(tile\) \}/);
  console.log('Appli iOS native 2.15.1 : vérifiée.');
}
// 2.15.2 : diagnostic LiveWatch VIP dans l'appli (administrateurs).
{
  const admin = await read('apps/ios-native/Noctra/Sources/AdminServerViews.swift');
  assert.match(admin, /private var diagnosticSection: some View/);
  assert.match(admin, /\/api\/tv\/livewatch\/diagnostics/);
  assert.match(admin, /URLQueryItem\(name: "ref", value: diagnosticRef\)/, 'chaîne choisie testée');
  assert.match(admin, /UIPasteboard\.general\.string/, 'rapport copiable');
  console.log('Appli iOS native 2.15.2 : vérifiée.');
}
// 2.15.3 : diagnostic LiveWatch VIP accessible directement depuis le compte (administrateurs).
assert.match(await read('apps/ios-native/Noctra/Sources/Components.swift'), /NavigationLink \{ LiveAdminView\(\) \} label: \{\s*Label\("Diagnostic LiveWatch VIP"/);
console.log('Appli iOS native 2.15.3 : vérifiée.');
// 2.15.6 : télécommande et « Lire sur… » limitées aux appareils du compte (même en administrateur).
assert.match(await read('apps/ios-native/Noctra/Sources/RemotePlayback.swift'), /guard Session\.sameUser\(raw\["UserId"\] as\? String, session\.userId\)/);
assert.match(await read('apps/ios-native/Noctra/Sources/Cast.swift'), /guard Session\.sameUser\(entry\["UserId"\] as\? String, session\.userId\)/);
console.log('Appli iOS native 2.15.6 : vérifiée.');
// 2.15.7 : diagnostic VIP limité aux chaînes françaises.
assert.match(await read('apps/ios-native/Noctra/Sources/AdminServerViews.swift'), /where channel\.vip && channel\.country == "fr"/);
console.log('Appli iOS native 2.15.7 : vérifiée.');
// 2.16 : compte LiveWatch connecté sur l'appareil (lecteur officiel VIP lu par l'iPhone, sans le serveur).
{
  const device = await read('apps/ios-native/Noctra/Sources/LiveWatchDevice.swift');
  assert.match(device, /enum LiveWatchDevice/);
  assert.match(device, /struct LiveWatchLoginSheet/);
  assert.match(device, /server\.device = true/);
  assert.match(await read('apps/ios-native/Noctra/Sources/LiveServers.swift'), /LiveWatchDevice\.servers\(entry\.raw, prefix: prefix, provider: provider\)/);
  assert.match(await read('apps/ios-native/Noctra/Sources/LiveServers.swift'), /if server\.device \{ base -= 5 \}/);
  assert.match(await read('apps/ios-native/Noctra/Sources/Components.swift'), /LiveWatchDeviceView\(\)/);
  console.log('Appli iOS native 2.16 : vérifiée.');
}
// 2.16.1 : lecteur « mon compte » déduit du résolveur VIP quand la fiche n'a pas l'adresse du lecteur.
assert.match(await read('apps/ios-native/Noctra/Sources/LiveWatchDevice.swift'), /static func resolverEmbed\(_ resolver: String\?\) -> URL\?/);
console.log('Appli iOS native 2.16.1 : vérifiée.');
// 2.16.2 : Chromecast — flux testé avant l'envoi, serveur suivant si le Chromecast ne lit pas.
assert.match(await read('apps/ios-native/Noctra/Sources/Chromecast.swift'), /private func castLiveStream\(/);
assert.match(await read('apps/ios-native/Noctra/Sources/Chromecast.swift'), /let probe = await LiveServerFactory\.probe\(server, session: session\)/);
console.log('Appli iOS native 2.16.2 : vérifiée.');
// 2.16.3 : attente de la diffusion centrée, serveurs homonymes numérotés, historique LiveWatch d'avant 200.0.143 effacé.
assert.match(await read('apps/ios-native/Noctra/Sources/Components.swift'), /struct BusyRow: View/);
assert.match(await read('apps/ios-native/Noctra/Sources/RemotePlayback.swift'), /BusyRow\("Préparation de la diffusion…"\)/);
assert.match(await read('apps/ios-native/Noctra/Sources/Multiview.swift'), /if let busy \{ BusyRow\(busy\) \}/);
assert.match(await read('apps/ios-native/Noctra/Sources/LiveServers.swift'), /static func uniqueLabels\(_ servers: \[LiveServer\]\) -> \[LiveServer\]/);
assert.match(await read('apps/ios-native/Noctra/Sources/LiveTVViews.swift'), /LiveServerFactory\.uniqueLabels\(expanded\)/);
assert.match(await read('apps/ios-native/Noctra/Sources/LiveServers.swift'), /noctra\.tv\.health\.livewatch-reset\.143/);
console.log('Appli iOS native 2.16.3 : vérifiée.');
// 2.17 : multiview diffusé sur Chromecast et AirPlay (image composée par le serveur), piloté depuis l'iPhone.
{
  const multiview = await read('apps/ios-native/Noctra/Sources/Multiview.swift');
  assert.match(multiview, /func cast\(to device: ChromecastDevice, session: Session\) async throws/);
  assert.match(multiview, /func castAirPlay\(session: Session\) async throws/);
  assert.match(multiview, /session\.noctraSend\("POST", "\/api\/tv\/mosaic", json: body, timeout: 40\)/);
  assert.match(multiview, /player\.allowsExternalPlayback = false/, 'vignettes : jamais envoyées seules en AirPlay');
  assert.match(multiview, /tile\.setMuted\(castTarget != nil \|\| tile\.id != audio\)/);
  assert.match(multiview, /AVAudioSession\.routeChangeNotification/);
  assert.match(multiview, /private func mosaicChanged\(\)/);
  assert.match(multiview, /launch\(session: session, present: false\)/);
  assert.match(await read('apps/ios-native/Noctra/Sources/Chromecast.swift'), /func castStream\(_ address: URL, title streamTitle: String/);
  console.log('Appli iOS native 2.17 : vérifiée.');
}
// 2.17.1 : AirPlay d'une chaîne = le flux envoyé au téléviseur (lecteur d'Apple, adresse autorisée), pas une recopie d'écran.
{
  const player = await read('apps/ios-native/Noctra/Sources/LivePlayer.swift');
  assert.match(player, /AVAudioSession\.routeChangeNotification/);
  assert.match(player, /let useWeb = !airPlay && (?:!ExternalDisplay\.shared\.connected && )?\(server\.mpegts/, 'AirPlay : jamais le moteur web');
  assert.match(player, /private func airPlayAddress\(_ server: LiveServer, session: Session\) async -> URL\?/);
  assert.match(player, /"\/api\/tv\/cast", json: \["url": address, "headers": server\.headers\]/);
  assert.match(player, /"\/api\/tv\/mosaic", json: \["tiles": \[tile\]/, 'MPEG-TS converti en HLS par le serveur');
  assert.match(player, /self\.startApple\(server, asset: AVURLAsset\(url: address\), token: token\)/, 'sans en-tête ni cookie');
  assert.doesNotMatch(player, /if model\.web == nil \{\n\s*AirPlayButton/, 'bouton AirPlay toujours proposé');
  console.log('Appli iOS native 2.17.1 : vérifiée.');
}
// 2.17.2 : récepteur en recopie d'écran seule — l'image reste dans le lecteur (recopiée), « Lecture sur le téléviseur » seulement si le téléviseur lit le flux.
{
  const player = await read('apps/ios-native/Noctra/Sources/LivePlayer.swift');
  assert.match(player, /player\.usesExternalPlaybackWhileExternalScreenIsActive = false/);
  assert.match(player, /player\.observe\(\\\.isExternalPlaybackActive/);
  assert.match(player, /if model\.externalActive && model\.web == nil && !model\.loading/);
  const multiview = await read('apps/ios-native/Noctra/Sources/Multiview.swift');
  assert.match(multiview, /guard player\.isExternalPlaybackActive else/, 'multiview AirPlay : flux lu par le téléviseur, sinon recopie');
  console.log('Appli iOS native 2.17.2 : vérifiée.');
}
// 2.17.3 : recopie d'écran — la chaîne (ou le multiview) en plein écran sur le téléviseur, l'iPhone garde les commandes.
{
  const external = await read('apps/ios-native/Noctra/Sources/ExternalDisplay.swift');
  assert.match(external, /final class ExternalDisplaySceneDelegate: UIResponder, UIWindowSceneDelegate/);
  assert.match(external, /ExternalPlayerLayer\(player: live\.player\)/);
  assert.match(external, /MultiviewLayer\(player: tile\.player\)/);
  const plist = await read('apps/ios-native/Noctra/Info.plist');
  assert.match(plist, /UIWindowSceneSessionRoleExternalDisplayNonInteractive[\s\S]*\$\(PRODUCT_MODULE_NAME\)\.ExternalDisplaySceneDelegate/);
  const player = await read('apps/ios-native/Noctra/Sources/LivePlayer.swift');
  assert.match(player, /let useWeb = !airPlay && !ExternalDisplay\.shared\.connected && \(server\.mpegts/);
  assert.match(player, /func externalScreenChanged\(\)/);
  assert.match(player, /player\.allowsExternalPlayback = !ExternalDisplay\.shared\.connected/, 'recopie : vidéo lue ici, pas envoyée à part');
  assert.match(player, /\.prefix\(casting \? 6 : 36\)/, 'diffusion : peu de tests de serveurs en arrière-plan');
  assert.match(player, /if self\.casting \{ continue \}/);
  assert.match(player, /"relay": true\]/, 'AirPlay : relais du serveur d’abord');
  assert.match(player, /func close\(\) \{\n\s*stopRelay\(\)/);
  console.log('Appli iOS native 2.17.3 : vérifiée.');
  // 2.17.7 : Chromecast — relais du serveur pour les chaînes, serveur suivant sur erreur, télécommande TV.
  const cast = await read('apps/ios-native/Noctra/Sources/Chromecast.swift');
  assert.match(cast, /"relay": true\]/, 'Chromecast : relais du serveur d’abord');
  assert.match(cast, /func nextLiveServer\(\)/);
  assert.match(cast, /func zapLive\(_ delta: Int\)/);
  assert.match(cast, /func liveBackToPhone\(\)/);
  assert.match(cast, /if mediaSessionId != nil \{ recoverLive\(\) \}/, 'coupure sur le téléviseur : serveur suivant');
  assert.match(cast, /struct CastChannelPicker: View/);
  assert.match(cast, /liveAction\("Serveur suivant"/);
  // 2.17.8 : multiview — lecteurs des sites et flux MPEG-TS dans les vignettes, son coupé dans tous les cadres.
  const tiles = await read('apps/ios-native/Noctra/Sources/Multiview.swift');
  assert.match(tiles, /private func playWeb\(_ server: LiveServer, token: Int, session: Session\)/);
  assert.match(tiles, /let pages = list\.filter \{ \$0\.kind == \.web/);
  assert.match(tiles, /window\.__noctraMute&&window\.__noctraMute/);
  assert.match(tiles, /LiveWebView\(request: web, session: session, onEvent:/);
  const webView = await read('apps/ios-native/Noctra/Sources/LiveTVViews.swift');
  assert.match(webView, /if\(d\.type==='noctra-mute'\)applyMute/);
}
