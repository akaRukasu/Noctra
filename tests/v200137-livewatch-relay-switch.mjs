// 200.0.137 — LiveWatch « Chaîne introuvable » malgré la reconnexion, et
// bascule de serveur trop rapide sur un chargement long :
// - serveur de comptes LiveWatch : paires (adresse, clé) du site, domaine
//   personnalisé compris, vérifiées auprès du serveur de comptes ;
// - le lecteur relayé signale les requêtes refusées et « Chaîne introuvable »,
//   puis passe au lecteur public ; référent masqué ;
// - « Tester LiveWatch » dans Accès TV : diagnostic lisible ;
// - chaînes réunies : 45 s avant de juger un serveur, prolongées tant que la
//   vidéo arrive ; 8 s (12 s en lecture) de grâce après une erreur.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [shell, server, pkg, html, css] = await Promise.all([
  read('public/noctra-shell.js'), read('server.mjs'), read('package.json'), read('public/client/index.html'), read('public/noctra-tv-unified.css')
]);

// Serveur de comptes : candidats.
const start = server.indexOf('function liveWatchAnonKeyPayload');
const end = server.indexOf('async function discoverLiveWatchPublicConfig', start);
const helpers = new Function('withoutSlash', 'liveWatchSupabaseUrl', 'liveWatchSupabaseProjectRef', 'Buffer', `${server.slice(start, end)}; return { liveWatchConfigCandidates, liveWatchConfigFromText };`)(
  value => String(value || '').replace(/\/+$/, ''), 'https://oldproject.supabase.co', 'oldproject', Buffer
);
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const anon = ref => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref, role: 'anon', iat: 1 })}.${'s'.repeat(43)}`;
const newKey = anon('newprojectref1');
// Domaine personnalisé : adresse écrite juste avant la clé.
const custom = helpers.liveWatchConfigCandidates(`const a="https://cdn.livewatch.icu/x.js";createClient("https://auth.livewatch.icu","${newKey}")`);
assert.equal(custom[0].url, 'https://auth.livewatch.icu', 'Domaine personnalisé du serveur de comptes');
assert.equal(custom[0].projectRef, 'newprojectref1');
assert.ok(custom.some(item => item.url === 'https://newprojectref1.supabase.co'), 'Projet déduit de la clé');
assert.ok(!custom.some(item => item.url === 'https://oldproject.supabase.co'), 'Clé d’un autre projet : jamais associée à l’ancien');
// Clé publishable : l'adresse voisine d'abord, l'ancien secours en dernier.
const publishable = helpers.liveWatchConfigCandidates('init({url:"https://xyz.supabase.co",key:"sb_publishable_abc"})');
assert.equal(publishable[0].url, 'https://xyz.supabase.co');
assert.equal(publishable.at(-1).url, 'https://oldproject.supabase.co');
assert.deepEqual(helpers.liveWatchConfigFromText('window.cfg={url:"https://newproject.supabase.co",key:"sb_publishable_current123"}', 'https://oldproject.supabase.co'),
  { url: 'https://newproject.supabase.co', anonKey: 'sb_publishable_current123', projectRef: 'newproject' });
assert.equal(helpers.liveWatchConfigFromText('rien ici'), null);
// Vérification et choix.
assert.match(server, /fetch\(`\$\{config\.url\}\/auth\/v1\/settings`/);
assert.match(server, /if \(works === true\) \{ found = \{ \.\.\.candidate, source: 'site', discovered: true, verified: true \}; break; \}/);
assert.match(server, /const value = found \|\| \{ \.\.\.fallback, source: 'fallback', discovered: false \};/);
assert.match(server, /if \(!issuer \|\| !config\?\.url \|\| config\.discovered === false\) return false;/, 'Secours intégré : pas de faux « ancien site »');
// Diagnostic.
assert.match(server, /auth,\s*sessionIssuer: liveWatchTokenIssuerHost\(session\.accessToken\),/);

// Lecteur relayé : script valide, requêtes refusées et « Chaîne introuvable » signalées.
const bridgeStart = server.indexOf("const bridge = String.raw`", server.indexOf('function sanitizeLiveWatchPlayerHtml'));
const scriptStart = server.indexOf('<script>', bridgeStart) + '<script>'.length;
const script = server.slice(scriptStart, server.indexOf('</script>', scriptStart)).replace(/\$\{[^}]*\}/g, '0');
assert.doesNotThrow(() => new Function(script), 'Script du lecteur relayé valide');
assert.match(script, /state:'net',host:x\.hostname,path:x\.pathname\.slice\(0,120\)/);
assert.match(script, /Cha\[iî\]ne introuvable/);
assert.match(script, /Object\.defineProperty\(document,'referrer',\{configurable:true,get:\(\)=>''\}\)/);
assert.match(script, /this\.addEventListener\('loadend'/);
assert.match(shell, /event\.data\.state === 'not-found'[\s\S]{0,700}startPublicFallback\('chaîne introuvable dans le lecteur relayé'\)/);
assert.match(shell, /recordTvDiagnostic\('livewatch-net', \{ provider: liveWatchLabel, request: failure \}\)/);
assert.match(shell, /if \(\/\(\?:\^\|\\\.\)livewatch\\\.\(\?:icu\|top\)\$\/\.test\(host\)\) frame\.referrerPolicy = 'no-referrer';/);

// Diagnostic lisible dans Accès TV.
const linesStart = shell.indexOf('  function liveWatchDiagnosticLines(');
const linesEnd = shell.indexOf('  async function openTvProviderKeys()', linesStart);
const context = { tvDiagnostics: [{ event: 'livewatch-net', channel: 'beIN SPORTS 1', request: 'livewatch.icu/api/v1/channel/x (403)' }] };
vm.createContext(context);
vm.runInContext(`${shell.slice(linesStart, linesEnd)}; this.lines = liveWatchDiagnosticLines;`, context);
const lines = context.lines({
  message: 'VIP Premium confirmé', account: 'a***@x.fr', isVip: true,
  auth: { host: 'auth.livewatch.icu', source: 'site', verified: true, keyType: 'anon' }, sessionIssuer: 'auth.livewatch.icu',
  checks: [{ ok: true, status: 200, channel: 'TF1', stream: { ok: false, status: 403, finalHost: 'hls.livewatch.icu' } }],
  site: { origin: 'https://livewatch.icu', finalOrigin: 'https://livewatch.icu', hosts: ['livewatch.icu', 'auth.livewatch.icu'], errors: [] }
});
assert.ok(lines.includes('Serveur de comptes : auth.livewatch.icu (trouvé sur le site, vérifié, clé anon)'));
assert.ok(lines.includes('Flux direct : échec · HTTP 403 · hls.livewatch.icu'));
assert.ok(lines.includes('Lecteur relayé (beIN SPORTS 1) : livewatch.icu/api/v1/channel/x (403)'));
assert.match(shell, /api\('\/api\/tv\/livewatch\/diagnostics', \{ timeoutMs: 90_000 \}\)/);
assert.match(shell, /<button class="noctra-button" type="button" data-livewatch-account-diagnostic>Tester LiveWatch<\/button>/);
assert.match(css, /\[data-livewatch-diagnostic\] \{/);

// Bascule de serveur plus patiente.
assert.match(shell, /const TV_UNIFIED_START_TIMEOUT_MS = 45_000;\s*const TV_UNIFIED_START_EXTEND_MS = 15_000;\s*const TV_UNIFIED_START_MAX_MS = 120_000;\s*const TV_UNIFIED_ERROR_GRACE_MS = 8_000;\s*const TV_UNIFIED_PLAYING_GRACE_MS = 12_000;/);
assert.match(shell, /if \(span > lastSpan \+ \.25 && Date\.now\(\) - startedAt < TV_UNIFIED_START_MAX_MS\) \{[\s\S]{0,300}run\.watchdog = window\.setTimeout\(checkStart, TV_UNIFIED_START_EXTEND_MS\);/);
assert.match(shell, /run\.watchdog = window\.setTimeout\(checkStart, TV_UNIFIED_START_TIMEOUT_MS\);/);

// Versions suivantes (200.0.140 : serveur des applications) : même numéro partout.
const version = (pkg.match(/"version": "(200\.0\.\d+)"/) || [])[1];
assert.ok(version);
assert.ok(shell.includes(`const NOCTRA_BUILD_VERSION = '${version}';`));
assert.equal((server.match(new RegExp(`'${version.replace(/\./g, '\\.')}'`, 'g')) || []).length, 2);
assert.ok(!html.includes('v=200.136') && html.includes('noctra-shell.js?v=200.137'));

console.log('v200.0.137 : LiveWatch relayé (comptes, requêtes refusées, diagnostic) et bascule de serveur patiente : OK');
