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

console.log('Appli iOS 26 native : OK');
