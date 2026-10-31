import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 200.0.159 / Noctra TV 1.1.57 (Android TV noctra.79) :
// - chaînes lancées plus vite (source la plus lente plus attendue, compte à
//   rebours de 1 à 2 s, 4 s au plus de vérification) : voir tv-source-servers ;
// - bloqueur de pubs des lecteurs web, activé par défaut, réglable.
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const app = await read('../apps/androidtv/web/app.js');
const home = await read('../apps/androidtv/java/com/noctra/tv/NoctraHomeActivity.java');
const web = await read('../apps/androidtv/java/com/noctra/tv/NoctraWebPlayerActivity.java');

assert.match(app, /function adBlock\(\) \{\s*try \{ return localStorage\.getItem\('noctra-tv-adblock'\) !== '0'; \} catch \(error\) \{ return true; \}/, 'activé par défaut');
assert.match(app, /'Bloqueur de pubs : ' \+ \(adBlock\(\) \? 'activé' : 'désactivé'\)/, 'réglage dans le menu du compte');
assert.match(app, /sniff: sniff, lite: lite, adblock: adBlock\(\) \}\)/, 'transmis au lecteur web');
assert.match(home, /intent\.putExtra\(NoctraWebPlayerActivity\.EXTRA_ADBLOCK, message\.optBoolean\("adblock", true\)\);/);
assert.match(web, /static final String EXTRA_ADBLOCK = "noctra_adblock";/);
assert.match(web, /adBlock = intent\.getBooleanExtra\(EXTRA_ADBLOCK, true\);/);
assert.match(web, /if \(\(lite \|\| adBlock\) && isAd\(request\.getUrl\(\)\)\) \{/, 'régies bloquées hors mode allégé');
assert.match(web, /if \(lite \|\| adBlock\) \{\s*\/\/ Mode allégé ou bloqueur de pubs/, 'fenêtres publicitaires jamais montrées');
assert.match(web, /if \(lite\) popup\.getSettings\(\)\.setJavaScriptEnabled\(false\);/, 'étape publicitaire qui débloque la chaîne préservée');
for (const host of ['doubleclick.net', 'popads.net', 'exoclick.com', 'adsterra.com', 'onclickalgo.com', 'highcpmgate.com', 'imasdk.googleapis.com']) {
  assert.ok(web.includes(`"${host}"`), host);
}
// La page Noctra et les flux ne sont jamais bloqués par la liste.
assert.ok(!/"(?:noctra|usbx\.me|jsdelivr\.net|cloudflare\.com|jwplayer\.com|jwpcdn\.com)"/.test(web.slice(web.indexOf('AD_HOSTS'), web.indexOf('ACLIB_STUB'))));
assert.match(await read('../apps/scripts/build-androidtv.mjs'), /const noctraRevision = (79|[89]\d|\d{3});/);
assert.match(await read('../apps/androidtv/web/tv-native.js'), /var VERSION = '1\.1\.(5[7-9]|[6-9]\d)';/);
console.log('Noctra TV 1.1.57 : bloqueur de pubs des lecteurs web (activé par défaut, réglable) et lancement plus rapide : OK');
