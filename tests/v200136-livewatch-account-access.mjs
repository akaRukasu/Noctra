// 200.0.136 — compte LiveWatch VIP géré depuis « Accès TV » :
// - carte LiveWatch (connexion, reconnexion, déconnexion), même quand le
//   compte paraît connecté ou que son statut est indisponible ;
// - « Gérer le compte » sur le statut « connecté » des sources LiveWatch.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [shell, server, pkg, html] = await Promise.all([
  read('public/noctra-shell.js'), read('server.mjs'), read('package.json'), read('public/client/index.html')
]);

const start = shell.indexOf('  function liveWatchAccountCardMarkup(');
const end = shell.indexOf('  async function openTvProviderKeys()', start);
assert.ok(start > 0 && end > start, 'Carte LiveWatch d’Accès TV');
const context = { escapeHtml: value => String(value).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`) };
vm.createContext(context);
vm.runInContext(`${shell.slice(start, end)}; this.card = liveWatchAccountCardMarkup;`, context);
const card = context.card;

const active = card({ configured: true, active: true, account: 'a***@x.fr' });
assert.match(active, /Compte connecté \(a\*\*\*@x\.fr\)/);
assert.match(active, /Reconnecter le compte/);
assert.match(active, /data-livewatch-account-disconnect/, 'Déconnexion possible même connecté');
assert.match(active, /name="email"[\s\S]*name="password"/);

const refused = card({ configured: true, active: false, message: 'Ta session LiveWatch vient de l’ancien site <b>' });
assert.match(refused, /refusée par LiveWatch/);
assert.match(refused, /data-livewatch-account-disconnect/);
assert.match(refused, /ancien site &#60;b&#62;/, 'Message échappé');

const none = card({ configured: false, active: false });
assert.match(none, /Aucun compte LiveWatch connecté/);
assert.match(none, /Connecter le compte/);
assert.doesNotMatch(none, /data-livewatch-account-disconnect/);

const unknown = card({ error: 'délai dépassé' });
assert.match(unknown, /Statut indisponible : délai dépassé/);
assert.match(unknown, /data-livewatch-account-disconnect/, 'Statut illisible : on peut quand même se déconnecter');

// Accès TV charge le statut sans bloquer Movix / Northlive.
assert.match(shell, /api\('\/api\/tv\/livewatch\/session', \{ timeoutMs: 25_000 \}\)\.catch\(error => \(\{ error:/);
assert.match(shell, /\$\{liveWatchAccountCardMarkup\(liveWatch\)\}\s*\$\{\[\['movix'/);
// Envoi et déconnexion.
assert.match(shell, /closest\('\[data-livewatch-account-form\]'\)[\s\S]{0,700}api\('\/api\/tv\/livewatch\/session', \{ method: 'POST'/);
assert.match(shell, /closest\('\[data-livewatch-account-disconnect\]'\)[\s\S]{0,200}api\('\/api\/tv\/livewatch\/session', \{ method: 'DELETE' \}\)[\s\S]{0,200}openTvProviderKeys\(\)/);
// Statut « connecté » d'une source LiveWatch : accès à la gestion du compte.
assert.match(shell, /<b>Connecté<\/b>\$\{authContext\?\.isAdmin \? `<button class="noctra-tv-source-mini" type="button" data-tv-provider-keys/);
// Routes serveur utilisées.
assert.match(server, /path === '\/api\/tv\/livewatch\/session' && req\.method === 'POST'/);
assert.match(server, /path === '\/api\/tv\/livewatch\/session' && req\.method === 'DELETE'/);

assert.match(pkg, /"version": "200\.0\.136"/);
assert.match(shell, /const NOCTRA_BUILD_VERSION = '200\.0\.136';/);
assert.equal((server.match(/'200\.0\.136'/g) || []).length, 2);
assert.ok(!html.includes('v=200.135') && html.includes('noctra-shell.js?v=200.136'));

console.log('v200.0.136 : compte LiveWatch VIP géré depuis Accès TV : OK');
