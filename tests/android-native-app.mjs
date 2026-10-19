// Appli Android native (apps/android-native) : structure, fonctions reprises de l'appli iOS, construction.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const base = 'apps/android-native/app/src/main';
const src = name => read(`${base}/java/com/noctra/mobile/${name}.kt`);

const gradle = await read('apps/android-native/app/build.gradle.kts');
assert.match(gradle, /applicationId = "com\.noctra\.mobile"/, 'identifiant distinct de l’ancienne appli web (com.noctra.app)');
assert.match(gradle, /minSdk = 23/, 'Android 6 minimum');
assert.match(gradle, /targetSdk = 35/);
assert.match(gradle, /isMinifyEnabled = true/);
assert.match(gradle, /NOCTRA_KEYSTORE_FILE/, 'signature fournie par l’environnement');
for (const lib of ['androidx.media3:media3-exoplayer-hls', 'androidx.media3:media3-datasource-okhttp', 'androidx.webkit:webkit', 'io.coil-kt:coil-compose']) {
  assert.ok(gradle.includes(lib), `dépendance ${lib}`);
}

const manifest = await read(`${base}/AndroidManifest.xml`);
assert.match(manifest, /android\.software\.leanback" android:required="false"/, 'installable sur téléviseur et téléphone');
assert.match(manifest, /android\.hardware\.touchscreen" android:required="false"/);
assert.match(manifest, /LEANBACK_LAUNCHER/, 'icône sur Android TV');
assert.match(manifest, /android:supportsPictureInPicture="true"/);
assert.match(manifest, /android:banner=/);

// Toutes les rubriques de l'appli iOS.
const files = [
  'MainActivity', 'NoctraApplication', 'core/Session', 'core/Net', 'core/Json', 'core/Models',
  'ui/Theme', 'ui/Navigation', 'ui/Components', 'ui/Home', 'ui/Libraries', 'ui/Login', 'ui/Account', 'ui/detail/ItemDetail',
  'play/Playback', 'play/PlayerScreen', 'play/Subtitles', 'offline/Offline', 'offline/OfflineScreens',
  'live/LiveNames', 'live/LiveServers', 'live/LiveStore', 'live/LivePlayer', 'live/LivePlayerScreen', 'live/LiveScreens',
  'discover/Discover', 'sync/SyncPlay', 'cast/Cast', 'cast/Chromecast',
  'admin/AdminCommon', 'admin/AdminHome', 'admin/AdminConfig', 'admin/AdminLibraries', 'admin/AdminServer', 'admin/AdminUsers', 'admin/Arr'
];
for (const file of files) await access(new URL(`${base}/java/com/noctra/mobile/${file}.kt`, root));

const main = await src('MainActivity');
assert.match(main, /NavigationRail/, 'rail latéral sur tablette, Chromebook et téléviseur');
assert.match(main, /NavigationBar\(/, 'barre du bas sur téléphone');
assert.match(main, /UI_MODE_TYPE_TELEVISION/);
assert.match(main, /enterPictureInPictureMode/);
for (const tab of ['Accueil', 'Médias', 'TV', 'Découvrir', 'Recherche']) assert.ok(main.includes(`"${tab}"`), `onglet ${tab}`);

const theme = await src('ui/Theme');
const aurora = await read('public/noctra-aurora.css');
for (const [token, hex] of [['--na-bg', '05060d'], ['--na-lilac', 'c4b5fd'], ['--na-pink', 'f0abfc'], ['--na-cyan', '7dd3fc'], ['--na-teal', '5eead4'], ['--na-violet', 'a78bfa']]) {
  assert.ok(aurora.includes(`${token}:#${hex}`), `site : ${token}`);
  assert.ok(theme.toLowerCase().includes(`0xff${hex}`), `appli Android : ${token} (#${hex})`);
}
assert.match(theme, /fun Modifier\.focusRing/, 'sélection à la télécommande');

const live = await src('live/LivePlayer');
assert.match(live, /FLAG_ALLOW_NON_IDR_KEYFRAMES/, 'MPEG-TS continu lu par ExoPlayer');
assert.match(live, /MimeTypes\.APPLICATION_M3U8/);
assert.match(live, /if \(server\.vip\) 110\.0 else 45\.0/, 'VIP LiveWatch : délai de vérification comme sur PC (90 s et plus)');
assert.match(live, /fun engineFailed/, 'passage d’un moteur à l’autre');
assert.match(live, /renewURL/, 'nouveau lien du même serveur après une coupure');
const servers = await src('live/LiveServers');
for (const name of ['fun probeMany', 'fun sniff', 'Probe.stale', 'fun probeTrust', 'fun withCachedProbes']) assert.ok(servers.includes(name), `tests des serveurs : ${name}`);
const screen = await src('live/LivePlayerScreen');
assert.match(screen, /addJavascriptInterface/, 'pont des lecteurs web');
assert.match(screen, /addDocumentStartJavaScript/);
assert.match(screen, /allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation/, 'cadre isolé du VIP comme sur PC');
assert.match(screen, /vendor\/\$it/, 'Shaka, hls.js et mpegts.js servis par Noctra');
assert.match(screen, /Key\.ChannelUp/, 'touches Chaîne + et − de la télécommande');
assert.match(screen, /onCreateWindow[^\n]*= false/, 'fenêtres surgissantes bloquées');
assert.ok(!/Jellyfin/.test(await src('live/LiveScreens')), 'pas de mention « Jellyfin » dans l’interface TV');

const cast = await src('cast/Chromecast');
assert.match(cast, /_googlecast\._tcp/);
assert.match(cast, /CC1AD845/, 'lecteur Cast par défaut');
assert.match(await src('sync/SyncPlay'), /\/SyncPlay\/SetNewQueue/);
assert.match(await src('discover/Discover'), /\/api\/roulette\?/);
assert.match(await src('admin/Arr'), /\/api\/servarr\/releases/, 'recherche interactive');
assert.match(await src('admin/Arr'), /\/api\/discovery\/grab/, 'recherche des trackers');

const workflow = await read('.github/workflows/noctra-android-native.yml');
assert.match(workflow, /apps\/android-native\/\*\*/);
assert.match(workflow, /noctra-android-native/);
assert.match(workflow, /assembleRelease/);
assert.ok(!/noctra-release\.p12/.test(workflow), 'la clé n’est jamais dans le dépôt');

console.log('Appli Android native : structure vérifiée.');

// 1.1 : lecteur des sites seul dans un cadre, variantes LiveWatch, langue audio, fiche fiable.
const factory11 = await src('live/LiveServers');
assert.match(factory11, /listOf\(raw\["embedUrl"\], raw\["vipFallbackUrl"\], raw\["externalUrl"\], raw\["url"\]\)/, 'lecteur seul avant la page du site');
assert.match(factory11, /raw\["liveWatchVariants"\]/, 'toutes les variantes LiveWatch');
assert.match(await src('live/LivePlayerScreen'), /request\.framed/);
const playback11 = await src('play/Playback');
assert.match(playback11, /body\["EnableDirectPlay"\] = false/, 'autre langue : flux préparé avec cette piste');
assert.match(playback11, /fun switchStream\(audio: Int\?, subtitle: Int\)/);
assert.match(await src('play/PlayerScreen'), /LANGUE AUDIO/);
assert.match(await src('ui/detail/ItemDetail'), /Fiche incomplète : toucher pour recharger/);
console.log('Appli Android native 1.1 : corrections vérifiées.');

// 1.2.1 : VIP LiveWatch préparé une seule fois et lu comme sur PC ; photo de profil.
assert.match(await src('live/LiveStore'), /server\.kind == LiveServer\.Kind\.resolve && server\.vip -> listOf\(server\) \+/, 'VIP jamais demandé avec 4 s de délai à l’ouverture');
assert.match(await src('live/LivePlayer'), /if \(target\.vip\) 30_000 else 20_000/);
assert.match(await src('live/LivePlayer'), /Lecteur VIP sans image : lecture directe du flux repéré/);
assert.match(await src('core/Session'), /fun avatarURL/);
assert.match(await src('ui/Account'), /AccountAvatar\(34, 16/, 'photo en haut à droite à la place de l’initiale');
console.log('Appli Android native 1.2.1 : VIP et photo de profil vérifiés.');
assert.match(await src('ui/Intro'), /fun NoctraIntro/, 'intro animée à l’ouverture, comme sur le site');
assert.match(await src('MainActivity'), /NoctraIntro \{ intro = false \}/);
console.log('Appli Android native 1.2.1 : intro vérifiée.');

// 1.3 : moteur du site (Shaka), VIP non prioritaire, variantes VIP, recherche interactive, explorateur, état des séries.
assert.match(await src('live/LivePlayerScreen'), /ignoreManifestProgramDateTime:true,sequenceMode:true/, 'Shaka réglé comme sur le site');
assert.match(await src('live/LiveServers'), /if \(server\.vip && server\.kind == LiveServer\.Kind\.resolve\) base \+= 2/, 'VIP plus prioritaire d’office');
assert.match(await src('live/LiveServers'), /return learned >= 0/, 'moteur web d’abord');
assert.match(await src('admin/Arr'), /fun ReleaseSearchHubScreen/);
assert.match(await src('admin/Arr'), /progress=1/);
assert.match(await src('discover/Discover'), /ReleaseSearchHubScreen\(item\.mediaType/);
const files13 = await src('admin/FileExplorer');
for (const route of ['/api/files/roots', '/api/files?root=', '/api/files/rename', '/api/files/trash', '/api/files/mkdir', '/api/files/empty-trash', '/api/files/duplicates/start', '/api/files/completeness/start']) assert.ok(files13.includes(route), `explorateur : ${route}`);
assert.match(await src('ui/SeriesStatus'), /\/api\/library\/series-status/);
assert.match(await src('ui/Components'), /SeriesStatusBadge\(item\.id/);
assert.match(await src('ui/Libraries'), /FileExplorerScreen\(\)/);
console.log('Appli Android native 1.3 : vérifiée.');
// 1.4 : variantes VIP, trackers patients, tri par compte, destination des demandes.
assert.match(await src('live/LiveServers'), /fun liveWatchVipVariants/);
assert.match(await src('admin/Arr'), /patient=1/);
assert.match(await src('ui/Libraries'), /noctra\.sort\./);
assert.match(await src('discover/Discover'), /fun RequestDestinationDialog/);
assert.match(await src('discover/Discover'), /if \(approve\) "approve" else "decline"/);
console.log('Appli Android native 1.4 : vérifiée.');
// 1.5 : déplacer un dossier, changer le dossier d'un film/série, stockage de la seedbox.
assert.match(await src('admin/FileExplorer'), /\/api\/files\/move/);
assert.match(await src('admin/FileExplorer'), /fun StorageScreen/);
assert.match(await src('admin/FileExplorer'), /fun FolderPickerScreen/);
assert.match(await src('admin/Arr'), /fun ArrMoveScreen/);
assert.match(await src('ui/Account'), /StorageScreen\(\)/);
console.log('Appli Android native 1.5 : vérifiée.');
// 1.6 : variantes LiveWatch dans la liste des serveurs.
assert.match(await src('live/LiveServers'), /suspend fun liveWatchVariantsOf\(server: LiveServer\)/);
assert.match(await src('live/LiveServers'), /\/api\/tv\/livewatch\/variants\//);
assert.match(await src('live/LiveStore'), /LiveServerFactory\.liveWatchVariantsOf\(server\)/);
console.log('Appli Android native 1.6 : vérifiée.');
// 1.6.1 : compte VIP LiveWatch, jamais de pub à regarder.
assert.match(await src('live/LiveServers'), /lecteur officiel VIP/);
assert.match(await src('live/LiveServers'), /"\/api\/tv\/livewatch\/prepare\/"/);
assert.match(await src('live/LiveServers'), /server\.vip && page\.toHttpUrlOrNull\(\)\?\.let \{ isLiveWatchHost\(it\.host\) \} == true -> return@mapIndexedNotNull null/);
console.log('Appli Android native 1.6.1 : vérifiée.');
// 1.7 : multiview de toutes les sources, diffusé et piloté sur Noctra TV.
{
  const multiview = await src('live/Multiview');
  for (const name of ['object MultiviewStore', 'class MultiviewTile', 'fun MultiviewScreen', 'fun MultiviewAddSheet', 'fun MultiviewCastSheet', 'fun MultiviewBar']) assert.ok(multiview.includes(name), name);
  assert.match(multiview, /fun solo\(tile: MultiviewTile\)/);
  assert.match(multiview, /it\.setVolume\(if \(it\.id == audio\) 1f else 0f\)/, 'une seule chaîne écoutée');
  assert.match(multiview, /C\.AUDIO_CONTENT_TYPE_MOVIE\)\.build\(\), false\)/, 'vignettes sans prise du focus audio');
  const remote = await src('cast/RemotePlayback');
  for (const action of ['playMultiview', 'multiAdd', 'multiAudio', 'multiSolo', 'multiRemove', 'multiGrid']) assert.ok(remote.includes(`"${action}"`), action);
  assert.match(await src('live/LiveScreens'), /if \(MultiviewStore\.selecting\) MultiviewStore\.toggle\(channel\) else LiveLauncher\.open\(channel, context\)/);
  assert.match(await read('apps/android-native/app/src/main/java/com/noctra/mobile/MainActivity.kt'), /MultiviewScreen\(\)/);
  console.log('Appli Android native 1.7 : vérifiée.');
}
// 1.7.1 : multiview comme sur la version web et sur iOS (depuis le lecteur, plein écran d'une vignette).
assert.match(await src('live/LivePlayerScreen'), /private fun MultiviewMenu\(poke: \(\) -> Unit\)/);
assert.match(await src('live/Multiview'), /fun zoom\(tile: MultiviewTile\)/);
assert.match(await src('live/Multiview'), /onDoubleTap = \{ MultiviewStore\.zoom\(tile\) \}/);
assert.match(await src('live/Multiview'), /ImmersiveEffect\(\)/);
console.log('Appli Android native 1.7.1 : vérifiée.');
// 1.7.2 : diagnostic LiveWatch VIP dans l'appli (administrateurs).
assert.match(await src('admin/AdminServer'), /section\("Diagnostic VIP"/);
assert.match(await src('admin/AdminServer'), /\/api\/tv\/livewatch\/diagnostics/);
assert.match(await src('admin/AdminServer'), /"\?ref=" \+ URLEncoder\.encode\(diagnosticRef, "UTF-8"\)/);
assert.match(await src('admin/AdminServer'), /clipboard\.setText\(AnnotatedString\(Json\.stringify\(result\)\)\)/);
console.log('Appli Android native 1.7.2 : vérifiée.');
// 1.7.3 : diagnostic LiveWatch VIP accessible directement depuis le compte (administrateurs).
assert.match(await src('ui/Account'), /SettingRow\("Diagnostic LiveWatch VIP"/);
console.log('Appli Android native 1.7.3 : vérifiée.');
// 1.7.6 : télécommande et « Lire sur… » limitées aux appareils du compte (même en administrateur).
assert.match(await src('cast/RemotePlayback'), /if \(!Session\.sameUser\(raw\.str\("UserId"\), Session\.userId\)\) return@mapNotNull null/);
assert.match(await src('cast/Cast'), /if \(!Session\.sameUser\(entry\.str\("UserId"\), Session\.userId\)\) return@mapNotNull null/);
console.log('Appli Android native 1.7.6 : vérifiée.');
// 1.7.7 : diagnostic VIP limité aux chaînes françaises.
assert.match(await src('admin/AdminServer'), /filter \{ it\.vip && it\.country == "fr" \}/);
console.log('Appli Android native 1.7.7 : vérifiée.');
