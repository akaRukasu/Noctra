// 200.0.135 — LiveWatch (livewatch.icu) : le lecteur fonctionne dans un
// navigateur connecté au nouveau site, mais pas dans Noctra (« Chaîne
// introuvable », flux directs en échec). La session gardée par Noctra vient de
// l'ancien serveur de comptes : elle est désormais reconnue comme telle et
// Noctra demande de reconnecter le compte au lieu d'afficher « connecté ».
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [server, shell, html, pkg] = await Promise.all([read('server.mjs'), read('public/noctra-shell.js'), read('public/client/index.html'), read('package.json')]);

const start = server.indexOf('function liveWatchTokenIssuerHost');
const end = server.indexOf('const liveWatchOtherSiteMessage');
const { liveWatchTokenIssuerHost, liveWatchSessionFromOtherSite } = Function('Buffer', `${server.slice(start, end)}; return { liveWatchTokenIssuerHost, liveWatchSessionFromOtherSite };`)(Buffer);
const jwt = iss => ['e30', Buffer.from(JSON.stringify({ iss, sub: 'u' })).toString('base64url'), 'sig'].join('.');
const oldToken = jwt('https://atrhxsizjjqjdhjafgei.supabase.co/auth/v1');
assert.equal(liveWatchTokenIssuerHost(oldToken), 'atrhxsizjjqjdhjafgei.supabase.co');
assert.equal(liveWatchSessionFromOtherSite({ accessToken: oldToken }, { url: 'https://nouveauprojet.supabase.co' }), true, 'Ancien serveur de comptes détecté');
assert.equal(liveWatchSessionFromOtherSite({ accessToken: oldToken }, { url: 'https://atrhxsizjjqjdhjafgei.supabase.co' }), false, 'Même serveur : session gardée');
assert.equal(liveWatchSessionFromOtherSite({ accessToken: 'pas-un-jwt' }, { url: 'https://x.supabase.co' }), false, 'Jeton illisible : aucune décision');
assert.equal(liveWatchSessionFromOtherSite({ accessToken: oldToken }, null), false, 'Site inconnu : aucune décision');

assert.match(server, /if \(liveWatchSessionFromOtherSite\(session, siteConfig\)\) throw new HttpError\(401, liveWatchOtherSiteMessage\);/, 'Lecture : reconnexion demandée');
assert.match(server, /if \(liveWatchSessionFromOtherSite\(stored, liveWatchPublicConfigCache\?\.value\)\) \{\s*return \{ configured: true, active: false, isVip: Boolean\(stored\.isVip\), otherSite: true, message: liveWatchOtherSiteMessage \};/, 'Bandeau : plus « VIP connecté »');
assert.match(server, /otherSite: true,\s*sessionIssuer: liveWatchTokenIssuerHost\(stored\.accessToken\),/, 'Diagnostic : serveurs de comptes comparés');
assert.match(shell, /status\.configured \? 'Reconnecter le compte LiveWatch' : 'Connecter LiveWatch VIP Premium'/, 'Formulaire de reconnexion déjà présent');
assert.match(shell, /\$\{status\.message \? `<em>\$\{escapeHtml\(status\.message\)\}<\/em>` : ''\}/);

console.log('v200.0.135 : session LiveWatch de l’ancien site détectée, reconnexion demandée : OK');
