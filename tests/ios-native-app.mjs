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
assert.match(live, /static func key\(_ name: String\) -> String/, 'chaînes réunies par nom');
assert.match(live, /for _ in 0\.\.<6 \{/, 'catalogues chargés 6 à la fois');
assert.match(live, /<script src="vendor\/mpegts\.js"><\/script>/, 'flux MPEG-TS lus par mpegts.js');
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
for (const route of ['"/System/Info"', '"/Sessions"', '"/ScheduledTasks"', '"/System/ActivityLog/Entries"', '"/Users/New"', '/Policy"', '"/api/downloads/add"', 'jellyfin_credentials']) {
  assert.ok(admin.includes(route), `administration : ${route}`);
}
assert.match(components, /NavigationLink \{ AdminDashboardView\(\) \}/);
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
console.log('Appli iOS 26 native : OK');

// Même lecture des horodatages que WebVTT.seconds (Subtitles.swift).
function WebVttSeconds(value) {
  return value.replace(',', '.').split(':').reduce((total, field) => total * 60 + Number(field), 0);
}
