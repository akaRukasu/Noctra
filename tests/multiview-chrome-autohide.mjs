import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Multiview (iOS 2.18.2, Android 1.9.7) : les commandes de Noctra (barre « Multiview · n/9 »,
// noms des chaînes, bouton « ⋯ ») s'effacent après 4 s et reviennent d'un appui ; les vignettes
// prennent tout l'écran, la barre passe au-dessus. La page d'un site reste manipulable (lecture,
// son…) : ses touchers lui sont laissés et ramènent seulement les commandes.
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const ios = await read('apps/ios-native/Noctra/Sources/Multiview.swift');
const android = await read('apps/android-native/app/src/main/java/com/noctra/mobile/live/Multiview.kt');

assert.ok(!ios.includes('.safeAreaInset(edge: .top) { bar }'), 'iOS : la barre ne réserve plus de place');
assert.match(ios, /\.overlay\(alignment: \.top\) \{\s*bar[\s\S]*?\.opacity\(chrome \? 1 : 0\)\s*\.allowsHitTesting\(chrome\)/, 'iOS : barre en surimpression, masquable');
assert.match(ios, /\.task\(id: "\\\(poked\)-\\\(sheetOpen\)"\) \{[\s\S]*?Task\.sleep\(for: \.seconds\(4\)\)[\s\S]*?chrome = false/, 'iOS : masquage après 4 s, sauf menu ouvert');
assert.match(ios, /private func tap\(_ tile: MultiviewTile\) \{\s*if chrome \{ menuTile = tile \} else \{ poke\(\) \}/, 'iOS : premier appui = commandes');
assert.match(ios, /TileGestures\(enabled: tile\.web == nil,/, 'iOS : la page du site garde ses touchers');
assert.ok(!/Color\.clear\.contentShape/.test(ios), 'iOS : aucune surface au-dessus de la page du site');
assert.match(ios, /if let touched \{ view\.addGestureRecognizer\(TouchSpy\(touched\)\) \}/, 'iOS : toucher sur la page = commandes');
assert.match(ios, /cancelsTouchesInView = false[\s\S]*?override func touchesBegan[\s\S]*?action\(\)\s*state = \.failed[\s\S]*?canPrevent[^\n]*\{ false \}/, 'iOS : observateur qui ne retire rien à la page');
assert.match(ios, /if let menu, tile\.web != nil, chrome \{/, 'iOS : « … » masqué avec les commandes');
assert.match(ios, /Text\(tile\.channel\.name\)\.lineLimit\(1\)[\s\S]*?\.opacity\(chrome \? 1 : 0\)/, 'iOS : nom de la chaîne masqué');

assert.ok(!android.includes('safeDrawingPadding().padding(top = 52.dp)'), 'Android : la barre ne réserve plus de place');
assert.match(android, /LaunchedEffect\(poked, sheet\) \{\s*chrome = true\s*if \(!sheet\) \{ delay\(4_000\); chrome = false \}/, 'Android : masquage après 4 s, sauf menu ouvert');
assert.match(android, /if \(chromeAlpha > 0f\) Row\(/, 'Android : barre masquable');
assert.match(android, /gestures = if \(tile\.web != null\) null else Modifier\.pointerInput/, 'Android : la page du site garde ses touchers');
assert.match(android, /awaitFirstDown\(requireUnconsumed = false, pass = PointerEventPass\.Initial\); onTouch\(\)/, 'Android : toucher sur la page = commandes, sans le consommer');
assert.match(android, /onTap = \{ if \(chrome\) \{ menu = tile \} else poke\(\) \}/, 'Android : premier appui = commandes');
assert.match(android, /if \(web != null && chrome > 0f\) \{/, 'Android : « ⋯ » masqué avec les commandes');
assert.match(android, /if \(chrome > 0f\) Row\(\s*Modifier\.align\(Alignment\.BottomStart\)/, 'Android : nom de la chaîne masqué');

const yml = await read('apps/ios-native/project.yml');
const gradle = await read('apps/android-native/app/build.gradle.kts');
assert.match(yml, /MARKETING_VERSION: "2\.18\.2"/);
assert.match(gradle, /versionName = "1\.9\.7"/);
console.log('Multiview iOS 2.18.2 / Android 1.9.7 : commandes de Noctra masquées, page du site manipulable : OK');
