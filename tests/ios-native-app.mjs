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
assert.match(theme, /MeshGradient\(/);
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
console.log('Appli iOS 26 native : OK');
