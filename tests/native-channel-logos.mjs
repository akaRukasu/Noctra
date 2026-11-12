import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// iOS 2.18.5 / Android 1.9.10 : logos des chaînes. Sans logo (ou logo injoignable), le serveur
// renvoie un remplacement SVG à initiales ; iOS ne lit pas le SVG et Android n'avait pas de
// décodeur SVG : les cases restaient vides (AMAZON PRIME, A LA CARTE, C+Live…).
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const server = await read('server.mjs');
assert.match(server, /function sendTvFallbackLogo[\s\S]*?'image\/svg\+xml; charset=utf-8'/, 'le serveur remplace par un SVG');

const gradle = await read('apps/android-native/app/build.gradle.kts');
const app = await read('apps/android-native/app/src/main/java/com/noctra/mobile/NoctraApplication.kt');
assert.match(gradle, /implementation\("io\.coil-kt:coil-svg:2\.7\.0"\)/, 'Android : décodeur SVG (même version que Coil)');
assert.match(gradle, /implementation\("io\.coil-kt:coil-compose:2\.7\.0"\)/);
assert.match(app, /import coil\.decode\.SvgDecoder[\s\S]*?\.components \{ add\(SvgDecoder\.Factory\(\)\) \}/, 'Android : SVG lus');

const pipeline = await read('apps/ios-native/Noctra/Sources/ImagePipeline.swift');
const components = await read('apps/ios-native/Noctra/Sources/Components.swift');
const live = await read('apps/ios-native/Noctra/Sources/LiveTVViews.swift');
assert.match(pipeline, /func failed\(_ url: URL\) -> Bool/);
assert.match(pipeline, /if let data \{\s*if let image = ImagePipeline\.decode[\s\S]*?unreadable\.insert\(url\)[\s\S]*?return nil\s*\}/, 'iOS : image reçue mais illisible retenue, sans nouvel essai');
assert.match(components, /var fallback: String\? = nil/);
assert.match(components, /else if let fallback, let url, failed == url \|\| ImagePipeline\.shared\.failed\(url\) \{\s*Text\(fallback\)/, 'iOS : initiales à la place');
assert.match(components, /guard let image = await ImagePipeline\.shared\.image\(for: url\) else \{ failed = url; return \}/);
assert.match(live, /RemoteImage\(url: url, contentMode: \.fit, fallback: String\(channel\.name\.prefix\(2\)\)\.uppercased\(\)\)/, 'iOS : grille des chaînes');
console.log('Logos des chaînes iOS 2.18.5 / Android 1.9.10 : plus de cases vides : OK');
