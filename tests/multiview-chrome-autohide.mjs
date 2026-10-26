import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Multiview (iOS 2.18.1, Android 1.9.6) : les commandes de Noctra (barre « Multiview · n/9 »,
// noms des chaînes, bouton « ⋯ ») s'effacent après 4 s et reviennent d'un appui ; les vignettes
// prennent tout l'écran, la barre passe au-dessus.
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const ios = await read('apps/ios-native/Noctra/Sources/Multiview.swift');
const android = await read('apps/android-native/app/src/main/java/com/noctra/mobile/live/Multiview.kt');

assert.ok(!ios.includes('.safeAreaInset(edge: .top) { bar }'), 'iOS : la barre ne réserve plus de place');
assert.match(ios, /\.overlay\(alignment: \.top\) \{\s*bar[\s\S]*?\.opacity\(chrome \? 1 : 0\)\s*\.allowsHitTesting\(chrome\)/, 'iOS : barre en surimpression, masquable');
assert.match(ios, /\.task\(id: "\\\(poked\)-\\\(sheetOpen\)"\) \{[\s\S]*?Task\.sleep\(for: \.seconds\(4\)\)[\s\S]*?chrome = false/, 'iOS : masquage après 4 s, sauf menu ouvert');
assert.match(ios, /private func tap\(_ tile: MultiviewTile\) \{\s*if chrome \{ menuTile = tile \} else \{ poke\(\) \}/, 'iOS : premier appui = commandes');
assert.match(ios, /var touchable: Bool \{ web == nil \|\| \(playing && !fullPage\) \}/);
assert.match(ios, /TileGestures\(enabled: tile\.touchable/, 'iOS : appuis sur les sites en vidéo seule');
assert.match(ios, /if let menu, tile\.web != nil, chrome \|\| !tile\.touchable \{/, 'iOS : « … » masqué en vidéo seule');
assert.match(ios, /Text\(tile\.channel\.name\)\.lineLimit\(1\)[\s\S]*?\.opacity\(chrome \? 1 : 0\)/, 'iOS : nom de la chaîne masqué');

assert.ok(!android.includes('safeDrawingPadding().padding(top = 52.dp)'), 'Android : la barre ne réserve plus de place');
assert.match(android, /LaunchedEffect\(poked, sheet\) \{\s*chrome = true\s*if \(!sheet\) \{ delay\(4_000\); chrome = false \}/, 'Android : masquage après 4 s, sauf menu ouvert');
assert.match(android, /if \(chromeAlpha > 0f\) Row\(/, 'Android : barre masquable');
assert.match(android, /val touch = tile\.web == null \|\| \(tile\.playing && !tile\.fullPage\)/);
assert.match(android, /onTap = \{ if \(chrome\) \{ menu = tile \} else poke\(\) \}/, 'Android : premier appui = commandes');
assert.match(android, /val menuAlpha = if \(gestures == null\) 1f else chrome/, 'Android : « ⋯ » masqué en vidéo seule');
assert.match(android, /if \(chrome > 0f\) Row\(\s*Modifier\.align\(Alignment\.BottomStart\)/, 'Android : nom de la chaîne masqué');

const yml = await read('apps/ios-native/project.yml');
const gradle = await read('apps/android-native/app/build.gradle.kts');
assert.match(yml, /MARKETING_VERSION: "2\.18\.1"/);
assert.match(gradle, /versionName = "1\.9\.6"/);
console.log('Multiview iOS 2.18.1 / Android 1.9.6 : commandes de Noctra masquées pendant le visionnage : OK');
